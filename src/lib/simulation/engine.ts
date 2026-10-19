import { FACILITIES } from '#lib/data/geo';
import { assertTransition } from '#lib/domain/transitions';
import {
	AMBULANCE_SPEED_MPS,
	DEFAULT_DISCOVERY_M,
	MAX_DISCOVERY_M,
	WALK_SPEED_MPS,
	type Assignment,
	type Award,
	type DemoSettings,
	type Facility,
	type Incident,
	type Invitation,
	type Kpis,
	type LatLng,
	type LayerVisibility,
	type Person,
	type ScenarioKind,
	type SimEvent,
	type Vehicle,
	type VerificationCheck
} from '#lib/domain/types';
import { BenefitService } from '#lib/services/benefits';
import { SimulationClock } from './clock';
import { GRAPH_EDGES } from '#lib/data/geo';
import {
	allEdgePolylines,
	edgePolyline,
	haversineMeters,
	interpolatePolyline,
	polylineLength,
	routeBetween
} from './geo-engine-helpers';
import { findCandidates, rolesForScenario, selectAcceptances } from './matching';
import { generatePopulation } from './population';
import { createRng } from './rng';
import { Scheduler } from './scheduler';

export interface EngineSnapshot {
	people: Person[];
	vehicles: Vehicle[];
	facilities: Facility[];
	incidents: Incident[];
	assignments: Assignment[];
	invitations: Invitation[];
	awards: Award[];
	events: SimEvent[];
	paths: { id: string; points: LatLng[] }[];
	settings: DemoSettings;
	kpis: Kpis;
	simMs: number;
	simClockLabel: string;
	paused: boolean;
	runId: number;
	mapStatus: string | null;
	selectedIncidentId: string | null;
	selectedPersonId: string | null;
	selectedFacilityId: string | null;
	presenterCaption: string | null;
	toasts: { id: string; message: string; at: number }[];
	guidedStep: number | null;
	summary: RunSummary | null;
}

export interface RunSummary {
	handledIncidents: number;
	arrivalTimesSec: number[];
	professionalParticipation: number;
	verifiedCommunityContributions: number;
	creditsIssued: number;
}

type Listener = () => void;

const DEFAULT_LAYERS: LayerVisibility = {
	members: true,
	helpers: true,
	nurses: true,
	doctors: true,
	police: true,
	facilities: true,
	ambulances: true,
	incidents: true,
	routes: true
};

function defaultSettings(partial?: Partial<DemoSettings>): DemoSettings {
	return {
		seed: partial?.seed ?? 42,
		population: partial?.population ?? 1000,
		discoveryRadiusM: partial?.discoveryRadiusM ?? DEFAULT_DISCOVERY_M,
		speed: partial?.speed ?? 4,
		benefitDelay: partial?.benefitDelay ?? false,
		presentationMode: partial?.presentationMode ?? false,
		followMode: partial?.followMode ?? false,
		layers: { ...DEFAULT_LAYERS, ...(partial?.layers ?? {}) }
	};
}

export class SimulationEngine {
	readonly clock = new SimulationClock();
	readonly scheduler = new Scheduler();
	readonly benefits = new BenefitService();

	people: Person[] = [];
	vehicles: Vehicle[] = [];
	facilities: Facility[] = FACILITIES.map((f) => ({ ...f, staffIds: [] }));
	incidents: Incident[] = [];
	assignments: Assignment[] = [];
	invitations: Invitation[] = [];
	events: SimEvent[] = [];
	settings: DemoSettings = defaultSettings();
	selectedIncidentId: string | null = null;
	selectedPersonId: string | null = null;
	selectedFacilityId: string | null = null;
	presenterCaption: string | null = null;
	toasts: { id: string; message: string; at: number }[] = [];
	guidedStep: number | null = null;
	summary: RunSummary | null = null;
	mapStatus: string | null = null;
	private eventSeq = 0;
	private incidentSeq = 0;
	private assignSeq = 0;
	private inviteSeq = 0;
	private toastSeq = 0;
	private listeners = new Set<Listener>();
	private positionListeners = new Set<Listener>();
	private lastTickMs = 0;
	private pendingPopulation: number | null = null;
	private pendingSeed: number | null = null;

	subscribe(fn: Listener): () => void {
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	/** Fired on movement frames. Does not rebuild application state. */
	onPositions(fn: Listener): () => void {
		this.positionListeners.add(fn);
		return () => this.positionListeners.delete(fn);
	}

	private emit(): void {
		for (const fn of this.listeners) fn();
	}

	snapshot(): EngineSnapshot {
		return {
			people: this.people,
			vehicles: this.vehicles,
			facilities: this.facilities,
			incidents: this.incidents,
			assignments: this.assignments,
			invitations: this.invitations,
			awards: this.benefits.list(),
			events: this.events,
			paths: allEdgePolylines(),
			settings: this.settings,
			kpis: this.computeKpis(),
			simMs: this.clock.simMs,
			simClockLabel: this.clock.format(),
			paused: this.clock.paused,
			runId: this.scheduler.currentRunId,
			mapStatus: this.mapStatus,
			selectedIncidentId: this.selectedIncidentId,
			selectedPersonId: this.selectedPersonId,
			selectedFacilityId: this.selectedFacilityId,
			presenterCaption: this.presenterCaption,
			toasts: this.toasts,
			guidedStep: this.guidedStep,
			summary: this.summary
		};
	}

	init(settings?: Partial<DemoSettings>): void {
		this.settings = defaultSettings(settings);
		this.reset(true);
	}

	reset(hard = true): void {
		this.scheduler.bumpRun();
		this.benefits.bumpRun();
		this.benefits.configure({
			delayMs: this.settings.benefitDelay ? 20000 : 0
		});
		this.clock.reset();
		this.clock.setSpeed(this.settings.speed);
		this.people = [];
		this.vehicles = [];
		this.incidents = [];
		this.assignments = [];
		this.invitations = [];
		this.events = [];
		this.toasts = [];
		this.summary = null;
		this.guidedStep = null;
		this.presenterCaption = null;
		this.selectedIncidentId = null;
		this.selectedPersonId = null;
		this.selectedFacilityId = null;
		this.eventSeq = 0;
		this.incidentSeq = 0;
		this.assignSeq = 0;
		this.inviteSeq = 0;
		this.toastSeq = 0;
		this.lastTickMs = 0;

		const seed = this.pendingSeed ?? this.settings.seed;
		const population = this.pendingPopulation ?? this.settings.population;
		this.settings.seed = seed;
		this.settings.population = population;
		this.pendingSeed = null;
		this.pendingPopulation = null;

		const gen = generatePopulation(seed, population);
		this.people = gen.people;
		this.vehicles = gen.vehicles;
		this.facilities = FACILITIES.map((f) => ({
			...f,
			staffIds: this.people
				.filter((p) => {
					if (f.kind === 'hospital') return p.role === 'doctor' || p.role === 'nurse';
					if (f.kind === 'police') return p.role === 'police';
					if (f.kind === 'care_hub') return p.role === 'nurse' || p.role === 'helper';
					return false;
				})
				.slice(0, 6)
				.map((p) => p.id)
		}));

		this.pushEvent('system', 'Simulation reset — synthetic Pozuelo city pilot ready.');
		if (hard) this.emit();
	}

	setMapStatus(msg: string | null): void {
		this.mapStatus = msg;
		this.emit();
	}

	setPendingPopulation(n: number): void {
		this.pendingPopulation = Math.max(100, Math.min(1000, Math.round(n)));
	}

	setPendingSeed(seed: number): void {
		this.pendingSeed = seed;
	}

	applySettingsAndReset(partial: Partial<DemoSettings>): void {
		if (partial.population != null) this.setPendingPopulation(partial.population);
		if (partial.seed != null) this.setPendingSeed(partial.seed);
		this.settings = {
			...this.settings,
			...partial,
			layers: { ...this.settings.layers, ...(partial.layers ?? {}) }
		};
		this.reset(true);
	}

	setSpeed(speed: 1 | 2 | 4 | 8): void {
		this.settings.speed = speed;
		this.clock.setSpeed(speed);
		this.emit();
	}

	setLayers(layers: Partial<LayerVisibility>): void {
		this.settings.layers = { ...this.settings.layers, ...layers };
		this.emit();
	}

	setDiscoveryRadius(m: number): void {
		this.settings.discoveryRadiusM = Math.max(100, Math.min(200, m));
		this.emit();
	}

	setBenefitDelay(on: boolean): void {
		this.settings.benefitDelay = on;
		this.benefits.configure({ delayMs: on ? 20000 : 0 });
		this.emit();
	}

	setPresentationMode(on: boolean): void {
		this.settings.presentationMode = on;
		this.emit();
	}

	setFollowMode(on: boolean): void {
		this.settings.followMode = on;
		this.emit();
	}

	setCaption(text: string | null): void {
		this.presenterCaption = text;
		this.emit();
	}

	selectIncident(id: string | null): void {
		this.selectedIncidentId = id;
		if (id) {
			this.selectedPersonId = null;
			this.selectedFacilityId = null;
		}
		this.emit();
	}

	selectPerson(id: string | null): void {
		this.selectedPersonId = id;
		if (id) {
			this.selectedFacilityId = null;
		}
		this.emit();
	}

	selectFacility(id: string | null): void {
		this.selectedFacilityId = id;
		this.emit();
	}

	start(): void {
		this.clock.resume();
		this.pushEvent('system', 'Simulation started.');
		this.emit();
	}

	pause(): void {
		this.clock.pause();
		this.pushEvent('system', 'Simulation paused.');
		this.emit();
	}

	resume(): void {
		this.clock.resume();
		this.pushEvent('system', 'Simulation resumed.');
		this.emit();
	}

	private pushEvent(type: string, message: string, extra?: Partial<SimEvent>): void {
		this.events.unshift({
			id: `ev-${++this.eventSeq}`,
			at: this.clock.simMs,
			type,
			message,
			...extra
		});
		if (this.events.length > 200) this.events.length = 200;
	}

	private toast(message: string): void {
		this.toasts = [
			{ id: `t-${++this.toastSeq}`, message, at: this.clock.simMs },
			...this.toasts
		].slice(0, 5);
	}

	private transition(incident: Incident, to: Incident['status']): void {
		assertTransition(incident.status, to);
		incident.status = to;
		this.pushEvent('incident', `Incident ${incident.id}: ${to.replaceAll('_', ' ')}`, {
			incidentId: incident.id
		});
	}

	pickPatientNear(position: LatLng): Person | null {
		const members = this.people.filter(
			(p) => p.role === 'member' && !p.assignedIncidentId && p.availability === 'available'
		);
		let best: Person | null = null;
		let bestD = Infinity;
		for (const m of members) {
			const d = haversineMeters(m.position, position);
			if (d < bestD && d < 180) {
				bestD = d;
				best = m;
			}
		}
		return best;
	}

	triggerScenario(kind: ScenarioKind, at?: LatLng): Incident | null {
		const rng = createRng(this.settings.seed + this.incidentSeq * 97 + kind.length);
		let position = at;
		if (!position) {
			const edge = GRAPH_EDGES[Math.floor(rng() * GRAPH_EDGES.length)];
			const poly = edgePolyline(edge);
			const len = polylineLength(poly);
			position = interpolatePolyline(poly, 0.35 * len + rng() * 0.3 * len);
		}
		const patient = this.pickPatientNear(position);
		if (!patient) {
			this.toast('No eligible member near that location — try another path point.');
			this.emit();
			return null;
		}

		// Snap incident to patient position
		position = { ...patient.position };
		const cfg = rolesForScenario(kind);
		const sourceLabel =
			kind === 'fall'
				? 'Possible fall detected — simulated signal'
				: kind === 'medical_sos'
					? 'Member-activated Medical SOS — simulated'
					: 'Member-activated Security SOS — simulated';

		const checks: VerificationCheck[] = [
			{ id: 'v-assign', label: 'Accepted assignment recorded', passed: false, at: null },
			{ id: 'v-arrive', label: 'Arrival recorded', passed: false, at: null },
			{ id: 'v-assist', label: 'Assistance recorded', passed: false, at: null },
			{ id: 'v-confirm', label: 'Member / care-team confirmation', passed: false, at: null }
		];

		const incident: Incident = {
			id: `inc-${++this.incidentSeq}`,
			kind,
			status: 'triggered',
			patientId: patient.id,
			position,
			triggeredAt: this.clock.simMs,
			discoveryRadiusM: this.settings.discoveryRadiusM,
			expandedDiscovery: false,
			professionalEscalation: kind !== 'fall',
			communityRestricted: cfg.communityRestricted,
			firstArrivalAt: null,
			resolvedAt: null,
			sourceLabel,
			notes: [
				kind === 'security_sos'
					? 'Community response restricted — professional response requested.'
					: 'Simulated workflow — not a clinical diagnosis.'
			],
			hospitalId: kind === 'medical_sos' ? 'fac-hospital' : null,
			vehicleId: null,
			verificationChecks: checks,
			verificationComplete: false
		};

		patient.availability = 'busy';
		patient.assignedIncidentId = incident.id;
		patient.movement = { kind: 'stationary' };

		this.incidents.push(incident);
		this.selectedIncidentId = incident.id;
		this.pushEvent('sos', sourceLabel, { incidentId: incident.id, personId: patient.id });
		this.toast(sourceLabel);

		// Confirmation stage then locate
		this.scheduler.schedule(
			kind === 'fall' ? 2500 : 800,
			() => {
				const inc = this.incidents.find((i) => i.id === incident.id);
				if (!inc || inc.status === 'cancelled' || inc.status === 'closed') return;
				if (inc.status === 'triggered') this.transition(inc, 'locating');
				this.runMatching(inc);
				this.emit();
			},
			this.clock.simMs
		);

		if (this.clock.paused) this.clock.resume();
		this.emit();
		return incident;
	}

	private runMatching(incident: Incident): void {
		if (incident.status === 'cancelled' || incident.status === 'closed') return;
		const cfg = rolesForScenario(incident.kind);
		let candidates = findCandidates(
			this.people,
			incident,
			incident.discoveryRadiusM,
			cfg.invite
		);

		if (candidates.length === 0 && !incident.expandedDiscovery && incident.discoveryRadiusM < MAX_DISCOVERY_M) {
			const previous = incident.discoveryRadiusM;
			incident.expandedDiscovery = true;
			incident.discoveryRadiusM = MAX_DISCOVERY_M;
			this.pushEvent(
				'match',
				`No eligible nearby helper within ${previous} m — expanding to ${MAX_DISCOVERY_M} m.`,
				{ incidentId: incident.id }
			);
			candidates = findCandidates(this.people, incident, MAX_DISCOVERY_M, cfg.invite);
		}

		if (candidates.length === 0) {
			this.pushEvent('match', 'No eligible nearby helper — continuing professional escalation.', {
				incidentId: incident.id
			});
			incident.professionalEscalation = true;
		}

		const accepted = selectAcceptances(candidates, incident.kind);

		// Create invitations for a few declined/expired demos among remaining helpers
		const now = this.clock.simMs;
		for (const c of candidates.slice(0, 6)) {
			const willAccept = accepted.some((a) => a.person.id === c.person.id);
			const inv: Invitation = {
				id: `inv-${++this.inviteSeq}`,
				incidentId: incident.id,
				personId: c.person.id,
				issuedAt: now,
				expiresAt: now + 12000,
				outcome: willAccept ? 'pending' : 'pending',
				illustrativeEtaSec: c.etaSec
			};
			this.invitations.push(inv);
			this.pushEvent(
				'invite',
				`Invite → ${c.person.displayName} (${c.person.role}) · illustrative ETA ${Math.round(c.etaSec)}s`,
				{ incidentId: incident.id, personId: c.person.id }
			);

			if (willAccept) {
				this.scheduler.schedule(
					500,
					() => this.acceptInvitation(inv.id, c.routePoints, c.etaSec),
					this.clock.simMs
				);
			} else if (c.person.role === 'helper' && incident.kind !== 'security_sos') {
				this.scheduler.schedule(
					3000,
					() => {
						const invitation = this.invitations.find((x) => x.id === inv.id);
						if (!invitation || invitation.outcome !== 'pending') return;
						invitation.outcome = 'declined';
						this.pushEvent('invite', `${c.person.displayName} declined (simulated)`, {
							incidentId: incident.id,
							personId: c.person.id
						});
						this.emit();
					},
					this.clock.simMs
				);
			} else {
				this.scheduler.schedule(
					12000,
					() => {
						const invitation = this.invitations.find((x) => x.id === inv.id);
						if (!invitation || invitation.outcome !== 'pending') return;
						invitation.outcome = 'expired';
						this.emit();
					},
					this.clock.simMs
				);
			}
		}

		if (incident.status === 'locating') this.transition(incident, 'routing');

		if (cfg.needsVehicle) {
			this.dispatchAmbulance(incident);
		}

		// Security: stage clinical at safe distance
		this.scheduler.schedule(
			900,
			() => {
				const inc = this.incidents.find((i) => i.id === incident.id);
				if (!inc || inc.status === 'cancelled') return;
				if (inc.status === 'routing') this.transition(inc, 'responding');
				this.emit();
			},
			this.clock.simMs
		);
	}

	private acceptInvitation(
		invitationId: string,
		routePoints: LatLng[],
		etaSec: number
	): void {
		const invitation = this.invitations.find((x) => x.id === invitationId);
		if (!invitation || invitation.outcome !== 'pending') return;
		const person = this.people.find((p) => p.id === invitation.personId);
		const incident = this.incidents.find((i) => i.id === invitation.incidentId);
		if (!person || !incident) return;
		if (person.assignedIncidentId) {
			invitation.outcome = 'declined';
			this.pushEvent('invite', `${person.displayName} unavailable — already assigned`, {
				incidentId: incident.id,
				personId: person.id
			});
			this.emit();
			return;
		}
		if (incident.communityRestricted && person.role === 'helper') {
			invitation.outcome = 'declined';
			this.pushEvent(
				'invite',
				`Community response restricted — ${person.displayName} not dispatched`,
				{ incidentId: incident.id, personId: person.id }
			);
			this.emit();
			return;
		}

		invitation.outcome = 'accepted';
		person.assignedIncidentId = incident.id;
		person.availability = 'busy';

		const stagingOnly =
			incident.kind === 'security_sos' &&
			(person.role === 'doctor' || person.role === 'nurse');

		let path = routePoints;
		let total = polylineLength(path);
		if (stagingOnly) {
			// Hold at a safe staging point ~120m away along the route
			const stageDist = Math.max(0, total - 120);
			const stagePos = interpolatePolyline(path, stageDist);
			const staged = routeBetween(person.position, stagePos);
			if (staged) {
				path = staged.points;
				total = staged.meters;
			}
		}

		person.movement = {
			kind: 'assigned',
			path,
			distanceAlong: 0,
			totalDistance: total,
			targetIncidentId: incident.id
		};

		const assignment: Assignment = {
			id: `as-${++this.assignSeq}`,
			incidentId: incident.id,
			personId: person.id,
			role: person.role,
			status: 'en_route',
			acceptedAt: this.clock.simMs,
			arrivedAt: null,
			illustrativeEtaSec: etaSec,
			routeLabel: 'Illustrative route · simulated ETA',
			stagingOnly
		};
		this.assignments.push(assignment);
		this.pushEvent('accept', `${person.displayName} accepted · en route`, {
			incidentId: incident.id,
			personId: person.id
		});
		this.emit();
	}

	private dispatchAmbulance(incident: Incident): void {
		const free = this.vehicles.find((v) => v.status === 'idle' && !v.assignedIncidentId);
		if (!free) {
			this.pushEvent('vehicle', 'No idle ambulance — professional response continues on foot', {
				incidentId: incident.id
			});
			return;
		}
		const route = routeBetween(free.position, incident.position);
		if (!route) return;
		free.status = 'dispatched';
		free.assignedIncidentId = incident.id;
		incident.vehicleId = free.id;
		free.movement = {
			kind: 'assigned',
			path: route.points,
			distanceAlong: 0,
			totalDistance: route.meters,
			targetIncidentId: incident.id
		};
		this.scheduler.schedule(
			1500,
			() => {
				if (free.assignedIncidentId !== incident.id) return;
				free.status = 'en_route';
				this.pushEvent('vehicle', `${free.label} en route`, { incidentId: incident.id });
				this.emit();
			},
			this.clock.simMs
		);
		this.pushEvent('vehicle', `${free.label} dispatched`, { incidentId: incident.id });
	}

	cancelIncident(incidentId: string): void {
		const incident = this.incidents.find((i) => i.id === incidentId);
		if (!incident) return;
		if (['resolved', 'closed', 'cancelled'].includes(incident.status)) return;
		try {
			this.transition(incident, 'cancelled');
		} catch {
			incident.status = 'cancelled';
		}
		this.releaseIncidentResources(incident, false);
		this.pushEvent('incident', `Incident ${incident.id} cancelled — resources released`, {
			incidentId: incident.id
		});
		this.emit();
	}

	private releaseIncidentResources(incident: Incident, allowAwards: boolean): void {
		for (const a of this.assignments.filter((x) => x.incidentId === incident.id)) {
			a.status = 'released';
			const person = this.people.find((p) => p.id === a.personId);
			if (person) {
				person.assignedIncidentId = null;
				person.availability = 'available';
				person.movement = {
					kind: 'wander',
					home: { ...person.position },
					angle: 0,
					radiusM: 24,
					direction: 1
				};
			}
		}
		for (const inv of this.invitations.filter((x) => x.incidentId === incident.id)) {
			if (inv.outcome === 'pending') inv.outcome = 'expired';
		}
		if (incident.vehicleId) {
			const v = this.vehicles.find((x) => x.id === incident.vehicleId);
			if (v) {
				const keepTrip =
					allowAwards && (v.status === 'transporting' || v.movement.kind === 'returning');
				if (!keepTrip) {
					v.assignedIncidentId = null;
					v.status = 'idle';
					v.position = { ...v.home };
					v.movement = { kind: 'stationary' };
				}
			}
		}
		const patient = this.people.find((p) => p.id === incident.patientId);
		if (patient) {
			patient.assignedIncidentId = null;
			patient.availability = 'available';
			patient.movement = {
				kind: 'wander',
				home: { ...patient.position },
				angle: 0.6,
				radiusM: 20,
				direction: 1
			};
		}
		void allowAwards;
	}

	private onResponderArrived(person: Person, incident: Incident, assignment: Assignment): void {
		assignment.status = 'arrived';
		assignment.arrivedAt = this.clock.simMs;
		person.movement = { kind: 'stationary' };
		person.position = assignment.stagingOnly
			? { ...person.position }
			: { ...incident.position };

		if (incident.firstArrivalAt == null && !assignment.stagingOnly) {
			incident.firstArrivalAt = this.clock.simMs;
		}

		this.pushEvent('arrival', `${person.displayName} arrived`, {
			incidentId: incident.id,
			personId: person.id
		});

		const arrivals = this.assignments.filter(
			(a) =>
				a.incidentId === incident.id &&
				(a.status === 'arrived' || a.status === 'assisting' || a.status === 'completed') &&
				!a.stagingOnly
		);

		if (
			incident.status === 'responding' &&
			arrivals.length > 0 &&
			(incident.kind !== 'security_sos' ||
				this.assignments.some(
					(a) =>
						a.incidentId === incident.id &&
						a.role === 'police' &&
						(a.status === 'arrived' || a.status === 'assisting')
				))
		) {
			this.transition(incident, 'on_scene');
			this.scheduler.schedule(
				5000,
				() => {
					const inc = this.incidents.find((i) => i.id === incident.id);
					if (!inc || inc.status !== 'on_scene') return;
					this.transition(inc, 'assisting');
					for (const a of this.assignments.filter(
						(x) => x.incidentId === inc.id && x.status === 'arrived' && !x.stagingOnly
					)) {
						a.status = 'assisting';
					}
					this.pushEvent('handoff', 'Assistance in progress (simulated)', {
						incidentId: inc.id
					});
					this.scheduler.schedule(8000, () => this.beginVerification(inc.id), this.clock.simMs);
					this.emit();
				},
				this.clock.simMs
			);
		}

		// Security clear: release staged clinicians
		if (incident.kind === 'security_sos' && person.role === 'police') {
			const policeArrived = this.assignments.filter(
				(a) =>
					a.incidentId === incident.id &&
					a.role === 'police' &&
					(a.status === 'arrived' || a.status === 'assisting')
			).length;
			if (policeArrived >= 1) {
				this.scheduler.schedule(
					3500,
					() => {
						const staged = this.assignments.filter(
							(a) => a.incidentId === incident.id && a.stagingOnly && a.status === 'arrived'
						);
						for (const a of staged) {
							a.stagingOnly = false;
							a.status = 'en_route';
							const clin = this.people.find((p) => p.id === a.personId);
							if (!clin) continue;
							const route = routeBetween(clin.position, incident.position);
							if (!route) continue;
							clin.movement = {
								kind: 'assigned',
								path: route.points,
								distanceAlong: 0,
								totalDistance: route.meters,
								targetIncidentId: incident.id
							};
							this.pushEvent(
								'handoff',
								`Scene cleared (simulated) — ${clin.displayName} proceeding from staging`,
								{ incidentId: incident.id, personId: clin.id }
							);
						}
						this.emit();
					},
					this.clock.simMs
				);
			}
		}
	}

	private beginVerification(incidentId: string): void {
		const incident = this.incidents.find((i) => i.id === incidentId);
		if (!incident || incident.status === 'cancelled' || incident.status === 'closed') return;
		if (incident.status === 'assisting') this.transition(incident, 'verification_pending');

		const mark = (id: string, delay: number) => {
			this.scheduler.schedule(
				delay,
				() => {
					const inc = this.incidents.find((i) => i.id === incidentId);
					if (!inc || inc.status !== 'verification_pending') return;
					const check = inc.verificationChecks.find((c) => c.id === id);
					if (!check) return;
					check.passed = true;
					check.at = this.clock.simMs;
					this.pushEvent('verification', `Check passed: ${check.label}`, {
						incidentId: inc.id
					});
					if (inc.verificationChecks.every((c) => c.passed)) {
						inc.verificationComplete = true;
						this.completeIncident(inc.id);
					}
					this.emit();
				},
				this.clock.simMs
			);
		};

		const hasAccepted = this.assignments.some(
			(a) => a.incidentId === incidentId && a.acceptedAt != null
		);
		const hasArrival = this.assignments.some(
			(a) => a.incidentId === incidentId && a.arrivedAt != null && !a.stagingOnly
		);

		if (hasAccepted) mark('v-assign', 1500);
		if (hasArrival) mark('v-arrive', 3000);
		mark('v-assist', 4500);
		mark('v-confirm', 6000);
		this.emit();
	}

	private completeIncident(incidentId: string): void {
		const incident = this.incidents.find((i) => i.id === incidentId);
		if (!incident || !incident.verificationComplete) return;
		if (incident.status !== 'verification_pending') return;

		this.transition(incident, 'resolved');
		incident.resolvedAt = this.clock.simMs;

		const outcome =
			incident.kind === 'medical_sos'
				? 'Assistance completed / handoff recorded'
				: 'Assistance verified (simulated workflow)';
		this.pushEvent('handoff', outcome, { incidentId: incident.id });
		this.toast(outcome);

		// Awards only for community helpers
		for (const a of this.assignments.filter(
			(x) =>
				x.incidentId === incident.id &&
				x.role === 'helper' &&
				x.arrivedAt != null &&
				x.status !== 'cancelled' &&
				x.status !== 'declined'
		)) {
			const award = this.benefits.requestAward({
				incidentId: incident.id,
				helperId: a.personId,
				verified: true,
				simMs: this.clock.simMs
			});
			if (award.status === 'pending') {
				this.pushEvent('award', `Benefit pending for helper (service delay)`, {
					incidentId: incident.id,
					personId: a.personId
				});
				this.scheduler.schedule(
					this.benefits.delay,
					() => {
						const done = this.benefits.completePending(award.idempotencyKey, this.clock.simMs);
						if (!done) return;
						this.applyAwardToHelper(done);
						this.emit();
					},
					this.clock.simMs
				);
			} else {
				this.applyAwardToHelper(award);
			}
			a.status = 'completed';
		}

		// Medical transport animation (optional short)
		if (incident.kind === 'medical_sos' && incident.vehicleId) {
			const v = this.vehicles.find((x) => x.id === incident.vehicleId);
			const hospital = this.facilities.find((f) => f.id === 'fac-hospital');
			if (v && hospital) {
				v.status = 'transporting';
				const route = routeBetween(incident.position, hospital.position);
				if (route) {
					v.movement = {
						kind: 'assigned',
						path: route.points,
						distanceAlong: 0,
						totalDistance: route.meters,
						targetIncidentId: incident.id
					};
				}
			}
		}

		this.scheduler.schedule(
			10000,
			() => {
				const inc = this.incidents.find((i) => i.id === incidentId);
				if (!inc || inc.status !== 'resolved') return;
				this.transition(inc, 'closed');
				this.releaseIncidentResources(inc, true);
				this.pushEvent('incident', `Incident ${inc.id} closed`, { incidentId: inc.id });
				this.emit();
			},
			this.clock.simMs
		);
		this.emit();
	}

	private applyAwardToHelper(award: Award): void {
		if (award.status !== 'available') {
			this.pushEvent('award', `Benefit ${award.status}: ${award.reason ?? ''}`, {
				incidentId: award.incidentId,
				personId: award.helperId
			});
			return;
		}
		const helper = this.people.find((p) => p.id === award.helperId);
		if (helper) {
			// Only credit once per award id application — balance tracks issued credits
			const already = helper.benefitBalance;
			// Idempotent: set from service totals rather than += blindly on replay
			const issued = this.benefits
				.list()
				.filter((a) => a.helperId === helper.id && a.status === 'available')
				.reduce((s, a) => s + a.credits, 0);
			helper.benefitBalance = issued;
			if (issued !== already) {
				this.toast(`+${award.credits} Vitality benefit credits (demo)`);
			}
		}
		this.pushEvent(
			'award',
			`+${award.credits} demo benefit credits → helper (closed-loop, no cash value)`,
			{ incidentId: award.incidentId, personId: award.helperId }
		);
	}

	/** Retry pending awards after “recovery” — exactly-once via idempotency keys. */
	retryPendingAwards(): void {
		for (const award of this.benefits.list()) {
			if (award.status !== 'pending') continue;
			const done = this.benefits.completePending(award.idempotencyKey, this.clock.simMs);
			if (done) this.applyAwardToHelper(done);
		}
		this.emit();
	}

	computeKpis(): Kpis {
		const members = this.people.filter((p) => p.role === 'member').length;
		const availableHelpers = this.people.filter(
			(p) => p.role === 'helper' && p.availability === 'available'
		).length;
		const availableClinical = this.people.filter(
			(p) =>
				(p.role === 'doctor' || p.role === 'nurse') && p.availability === 'available'
		).length;
		const activeIncidents = this.incidents.filter(
			(i) => !['closed', 'cancelled'].includes(i.status)
		).length;
		const completedIncidents = this.incidents.filter((i) =>
			['resolved', 'closed'].includes(i.status)
		).length;
		const arrivals = this.incidents
			.filter((i) => i.firstArrivalAt != null)
			.map((i) => (i.firstArrivalAt! - i.triggeredAt) / 1000)
			.sort((a, b) => a - b);
		let medianFirstArrivalSec: number | null = null;
		if (arrivals.length) {
			const mid = Math.floor(arrivals.length / 2);
			medianFirstArrivalSec =
				arrivals.length % 2 === 0
					? (arrivals[mid - 1] + arrivals[mid]) / 2
					: arrivals[mid];
		}
		const benefitsIssued = this.benefits
			.list()
			.filter((a) => a.status === 'available')
			.reduce((s, a) => s + a.credits, 0);

		return {
			members,
			availableHelpers,
			availableClinical,
			activeIncidents,
			completedIncidents,
			medianFirstArrivalSec,
			benefitsIssued
		};
	}

	buildSummary(): RunSummary {
		const arrivalTimesSec = this.incidents
			.filter((i) => i.firstArrivalAt != null)
			.map((i) => (i.firstArrivalAt! - i.triggeredAt) / 1000);
		const professionalParticipation = new Set(
			this.assignments
				.filter((a) => ['doctor', 'nurse', 'police'].includes(a.role) && a.acceptedAt)
				.map((a) => a.personId)
		).size;
		const verifiedCommunityContributions = this.assignments.filter(
			(a) => a.role === 'helper' && a.status === 'completed'
		).length;
		const creditsIssued = this.benefits
			.list()
			.filter((a) => a.status === 'available')
			.reduce((s, a) => s + a.credits, 0);
		this.summary = {
			handledIncidents: this.incidents.filter((i) =>
				['resolved', 'closed'].includes(i.status)
			).length,
			arrivalTimesSec,
			professionalParticipation,
			verifiedCommunityContributions,
			creditsIssued
		};
		return this.summary;
	}

	/**
	 * Advance simulation by wall-clock frame. Call from rAF when running.
	 * Also supports fixed-step testing via `step(ms)`.
	 */
	frame(nowWall = performance.now()): void {
		if (this.clock.paused) return;
		const prev = this.clock.simMs;
		this.clock.sync(nowWall);
		const now = this.clock.simMs;
		const dt = Math.min(Math.max(0, now - prev), 200 * this.settings.speed);
		if (dt <= 0) return;
		this.advanceMovement(dt);
		this.scheduler.tick(now);
		this.lastTickMs = now;
		for (const fn of this.positionListeners) fn();
	}

	/** Deterministic fixed step for tests (simulation milliseconds). */
	step(simDtMs: number): void {
		if (this.clock.paused) this.clock.resume();
		this.clock.advance(simDtMs);
		this.advanceMovement(simDtMs);
		this.scheduler.tick(this.clock.simMs);
		this.emit();
	}

	private advanceMovement(dtMs: number): void {
		const dtSec = dtMs / 1000;
		for (const person of this.people) {
			const mov = person.movement;
			if (mov.kind === 'wander') {
			const speedMps = 0.45;
			mov.angle += (speedMps / Math.max(mov.radiusM, 8)) * dtSec * mov.direction;
			const east = Math.cos(mov.angle) * mov.radiusM;
			const north = Math.sin(mov.angle) * mov.radiusM;
			const latRad = (mov.home.lat * Math.PI) / 180;
			person.position = {
				lat: mov.home.lat + north / 111320,
				lng: mov.home.lng + east / (111320 * Math.cos(latRad))
			};
		} else if (mov.kind === 'patrol') {
				const edge = GRAPH_EDGES.find((e) => e.id === mov.edgeId);
				if (!edge) continue;
				const poly = edgePolyline(edge);
				const len = Math.max(1, polylineLength(poly));
				const delta = ((WALK_SPEED_MPS * 0.35 * dtSec) / len) * mov.direction;
				mov.t += delta;
				if (mov.t > 1) {
					mov.t = 1;
					mov.direction = -1;
				} else if (mov.t < 0) {
					mov.t = 0;
					mov.direction = 1;
				}
				person.position = interpolatePolyline(poly, mov.t * len);
			} else if (mov.kind === 'assigned' || mov.kind === 'returning') {
				mov.distanceAlong = Math.min(
					mov.totalDistance,
					mov.distanceAlong + WALK_SPEED_MPS * dtSec
				);
				person.position = interpolatePolyline(mov.path, mov.distanceAlong);
				if (mov.distanceAlong >= mov.totalDistance - 0.5) {
					if (mov.kind === 'assigned') {
						const incident = this.incidents.find((i) => i.id === mov.targetIncidentId);
						const assignment = this.assignments.find(
							(a) =>
								a.personId === person.id &&
								a.incidentId === mov.targetIncidentId &&
								a.status === 'en_route'
						);
						if (incident && assignment) {
							this.onResponderArrived(person, incident, assignment);
						} else {
							person.movement = { kind: 'stationary' };
						}
					} else {
						person.movement = { kind: 'stationary' };
					}
				}
			}
		}

		for (const v of this.vehicles) {
			const mov = v.movement;
			if (mov.kind === 'assigned' || mov.kind === 'returning') {
				mov.distanceAlong = Math.min(
					mov.totalDistance,
					mov.distanceAlong + AMBULANCE_SPEED_MPS * dtSec
				);
				v.position = interpolatePolyline(mov.path, mov.distanceAlong);
				if (mov.distanceAlong >= mov.totalDistance - 0.5) {
					if (mov.kind === 'assigned' && v.status === 'en_route') {
						v.status = 'on_scene';
						v.movement = { kind: 'stationary' };
						this.pushEvent('arrival', `${v.label} on scene`, {
							incidentId: v.assignedIncidentId ?? undefined
						});
					} else if (mov.kind === 'assigned' && v.status === 'transporting') {
						v.status = 'returning';
						const back = routeBetween(v.position, v.home);
						if (back) {
							v.movement = {
								kind: 'returning',
								path: back.points,
								distanceAlong: 0,
								totalDistance: back.meters,
								home: v.home
							};
						} else {
							v.position = { ...v.home };
							v.status = 'idle';
							v.assignedIncidentId = null;
							v.movement = { kind: 'stationary' };
						}
					} else if (mov.kind === 'returning') {
						v.position = { ...v.home };
						v.status = 'idle';
						v.assignedIncidentId = null;
						v.movement = { kind: 'stationary' };
					}
				}
			}
		}
	}
}
