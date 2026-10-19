import { BenefitService } from '#lib/services/benefits';
import { beforeEach, describe, expect, it } from 'vitest';
import { assertTransition, canTransition } from '#lib/domain/transitions';
import { BENEFIT_CREDITS_PER_HELPER, HELPER_SESSION_CAP } from '#lib/domain/types';
import { SimulationEngine } from './engine';
import { runInvestorDemo, runSeveralAlerts } from './guided';
import { DEMO_AREA } from '#lib/data/geo';
import { haversineMeters, routeBetween } from './geo';
import { findCandidates, rolesForScenario, selectAcceptances } from './matching';
import { generatePopulation, scaleRoles } from './population';

describe('population scaling', () => {
	it('keeps exact totals and all roles for 100–300', () => {
		for (const p of [100, 200, 500, 1000]) {
			const c = scaleRoles(p);
			expect(c.member + c.helper + c.nurse + c.doctor + c.police).toBe(p);
			expect(c.member).toBeGreaterThan(0);
			expect(c.helper).toBeGreaterThan(0);
			expect(c.nurse).toBeGreaterThan(0);
			expect(c.doctor).toBeGreaterThan(0);
			expect(c.police).toBeGreaterThan(0);
			const { people, vehicles } = generatePopulation(7, p);
			expect(people).toHaveLength(p);
			expect(new Set(people.map((x) => x.id)).size).toBe(p);
			expect(people.every((x) => /^\/portraits\/med\/(women|men)\/\d+\.jpg$/.test(x.profile.photo))).toBe(
				true
			);
			expect(new Set(people.map((x) => x.profile.photo)).size).toBeGreaterThan(40);
			expect(vehicles).toHaveLength(2);
			expect(people.some((x) => x.role === 'helper')).toBe(true);
		}
	});

	it('spreads 200 people across the demonstration area', () => {
		const { people } = generatePopulation(42, 200);
		const { south, west, north, east } = DEMO_AREA.bounds;
		const cells = new Set<string>();
		for (const person of people) {
			const row = Math.min(3, Math.floor(((person.position.lat - south) / (north - south)) * 4));
			const col = Math.min(3, Math.floor(((person.position.lng - west) / (east - west)) * 4));
			cells.add(`${row},${col}`);
		}
		expect(cells.size).toBe(16);
	});
});

describe('incident transitions', () => {
	it('allows the happy path and rejects jumps', () => {
		expect(canTransition('triggered', 'locating')).toBe(true);
		expect(canTransition('triggered', 'resolved')).toBe(false);
		expect(() => assertTransition('triggered', 'resolved')).toThrow();
	});
});

describe('matching and reservations', () => {
	it('filters by radius, role, consent, and availability', () => {
		const { people } = generatePopulation(42, 200);
		const patient = people.find((p) => p.role === 'member')!;
		const incident = {
			id: 'inc-1',
			kind: 'fall' as const,
			status: 'locating' as const,
			patientId: patient.id,
			position: patient.position,
			triggeredAt: 0,
			discoveryRadiusM: 500,
			expandedDiscovery: false,
			professionalEscalation: false,
			communityRestricted: false,
			firstArrivalAt: null,
			resolvedAt: null,
			sourceLabel: 'test',
			notes: [],
			hospitalId: null,
			vehicleId: null,
			verificationChecks: [],
			verificationComplete: false
		};
		const roles = rolesForScenario('fall').invite;
		const candidates = findCandidates(people, incident, 500, roles);
		for (const c of candidates) {
			expect(c.person.id).not.toBe(patient.id);
			expect(haversineMeters(c.person.position, incident.position)).toBeLessThanOrEqual(500.1);
			expect(['helper', 'nurse']).toContain(c.person.role);
		}
		const selected = selectAcceptances(candidates, 'fall');
		expect(selected.filter((s) => s.person.role === 'helper').length).toBeLessThanOrEqual(2);
		expect(selected.filter((s) => s.person.role === 'nurse').length).toBeLessThanOrEqual(1);
	});

	it('never selects community helpers for security scenarios', () => {
		const { people } = generatePopulation(42, 200);
		const patient = people.find((p) => p.role === 'member')!;
		const incident = {
			id: 'inc-sec',
			kind: 'security_sos' as const,
			status: 'locating' as const,
			patientId: patient.id,
			position: patient.position,
			triggeredAt: 0,
			discoveryRadiusM: 1000,
			expandedDiscovery: true,
			professionalEscalation: true,
			communityRestricted: true,
			firstArrivalAt: null,
			resolvedAt: null,
			sourceLabel: 'test',
			notes: [],
			hospitalId: null,
			vehicleId: null,
			verificationChecks: [],
			verificationComplete: false
		};
		const candidates = findCandidates(
			people,
			incident,
			1000,
			rolesForScenario('security_sos').invite
		);
		expect(candidates.every((c) => c.person.role !== 'helper')).toBe(true);
		const selected = selectAcceptances(candidates, 'security_sos');
		expect(selected.every((c) => c.person.role !== 'helper')).toBe(true);
	});
});

describe('routes', () => {
	it('returns path polylines with positive length', () => {
		const { people } = generatePopulation(1, 100);
		const a = people[0].position;
		const b = people[10]?.position ?? people[1].position;
		const route = routeBetween(a, b);
		expect(route).not.toBeNull();
		expect(route!.points.length).toBeGreaterThan(1);
		expect(route!.meters).toBeGreaterThan(0);
	});
});

describe('benefit service', () => {
	it('requires verification and is idempotent', () => {
		const svc = new BenefitService();
		const rejected = svc.requestAward({
			incidentId: 'i1',
			helperId: 'h1',
			verified: false,
			simMs: 0
		});
		expect(rejected.status).toBe('rejected');

		const a1 = svc.requestAward({
			incidentId: 'i1',
			helperId: 'h1',
			verified: true,
			simMs: 1
		});
		expect(a1.status).toBe('available');
		expect(a1.credits).toBe(BENEFIT_CREDITS_PER_HELPER);
		const a2 = svc.requestAward({
			incidentId: 'i1',
			helperId: 'h1',
			verified: true,
			simMs: 2
		});
		expect(a2.id).toBe(a1.id);
		expect(svc.list().filter((a) => a.status === 'available')).toHaveLength(1);
	});

	it('enforces helper session cap', () => {
		const svc = new BenefitService();
		let issued = 0;
		let n = 0;
		while (issued + BENEFIT_CREDITS_PER_HELPER <= HELPER_SESSION_CAP) {
			n += 1;
			const a = svc.requestAward({
				incidentId: `i-${n}`,
				helperId: 'helper-cap',
				verified: true,
				simMs: n
			});
			expect(a.status).toBe('available');
			issued += a.credits;
		}
		const blocked = svc.requestAward({
			incidentId: 'i-over',
			helperId: 'helper-cap',
			verified: true,
			simMs: 999
		});
		expect(blocked.status).toBe('rejected');
	});

	it('keeps pending awards from blocking and completes exactly once', () => {
		const svc = new BenefitService();
		svc.configure({ delayMs: 5000 });
		const pending = svc.requestAward({
			incidentId: 'i-delay',
			helperId: 'h-delay',
			verified: true,
			simMs: 0
		});
		expect(pending.status).toBe('pending');
		const again = svc.requestAward({
			incidentId: 'i-delay',
			helperId: 'h-delay',
			verified: true,
			simMs: 10
		});
		expect(again.id).toBe(pending.id);
		const done = svc.completePending(pending.idempotencyKey, 100);
		expect(done?.status).toBe('available');
		const done2 = svc.completePending(pending.idempotencyKey, 200);
		expect(done2?.status).toBe('available');
		expect(svc.list().filter((a) => a.status === 'available')).toHaveLength(1);
	});
});

describe('simulation engine integration', () => {
	let engine: SimulationEngine;

	beforeEach(() => {
		engine = new SimulationEngine();
		engine.init({ seed: 42, population: 200, speed: 8, benefitDelay: false });
	});

	it('reserves a person for only one incident', () => {
		const a = engine.triggerScenario('fall');
		const b = engine.triggerScenario('medical_sos');
		expect(a).not.toBeNull();
		expect(b).not.toBeNull();
		// Advance enough for accepts
		for (let i = 0; i < 40; i++) engine.step(500);
		const assigned = engine.assignments.filter((x) =>
			['accepted', 'en_route', 'arrived', 'assisting', 'completed'].includes(x.status)
		);
		const personIds = assigned.map((x) => x.personId);
		expect(new Set(personIds).size).toBe(personIds.length);

		const vehicleIds = engine.vehicles
			.filter((v) => v.assignedIncidentId)
			.map((v) => v.assignedIncidentId);
		expect(new Set(vehicleIds).size).toBe(vehicleIds.length);
	});

	it('security scenario does not dispatch helpers', () => {
		const inc = engine.triggerScenario('security_sos');
		expect(inc).not.toBeNull();
		for (let i = 0; i < 50; i++) engine.step(500);
		const helperAssignments = engine.assignments.filter(
			(a) => a.incidentId === inc!.id && a.role === 'helper'
		);
		expect(helperAssignments).toHaveLength(0);
	});

	it('does not award before verification; cancellation releases without awards', () => {
		const inc = engine.triggerScenario('fall');
		expect(inc).not.toBeNull();
		for (let i = 0; i < 10; i++) engine.step(500);
		expect(engine.benefits.list().every((a) => a.status !== 'available' || a.incidentId !== inc!.id)).toBe(
			true
		);
		engine.cancelIncident(inc!.id);
		for (let i = 0; i < 20; i++) engine.step(500);
		const awards = engine.benefits.list().filter((a) => a.incidentId === inc!.id && a.status === 'available');
		expect(awards).toHaveLength(0);
		const patient = engine.people.find((p) => p.id === inc!.patientId)!;
		expect(patient.assignedIncidentId).toBeNull();
	});

	it('starts several fall alerts and SOS events without sharing a patient', () => {
		runSeveralAlerts(engine);
		for (let i = 0; i < 40; i++) engine.step(500);
		expect(engine.incidents.length).toBeGreaterThanOrEqual(4);
		expect(new Set(engine.incidents.map((i) => i.patientId)).size).toBe(engine.incidents.length);
		const kinds = new Set(engine.incidents.map((i) => i.kind));
		expect(kinds.has('fall')).toBe(true);
		expect(kinds.has('medical_sos')).toBe(true);
		expect(kinds.has('security_sos')).toBe(true);
		const assigned = engine.assignments
			.filter((a) => ['en_route', 'accepted', 'arrived', 'assisting'].includes(a.status))
			.map((a) => a.personId);
		expect(new Set(assigned).size).toBe(assigned.length);
	});

	it('pause freezes progression and reset isolates runs', () => {
		engine.triggerScenario('fall');
		engine.step(2000);
		const eventsBefore = engine.events.length;
		engine.pause();
		const mid = engine.clock.simMs;
		engine.frame();
		expect(engine.clock.simMs).toBe(mid);
		engine.reset();
		expect(engine.incidents).toHaveLength(0);
		expect(engine.assignments).toHaveLength(0);
		expect(engine.benefits.list()).toHaveLength(0);
		expect(engine.clock.simMs).toBe(0);
		// Old delayed ops must not mutate
		engine.step(20000);
		expect(engine.incidents).toHaveLength(0);
		expect(engine.events.length).toBeGreaterThan(0);
		expect(engine.events.length).toBeLessThan(eventsBefore + 50);
	});

	it('resolves fall with verification then awards helpers once', () => {
		const inc = engine.triggerScenario('fall');
		expect(inc).not.toBeNull();
		for (let i = 0; i < 500; i++) engine.step(1000);
		const closed = engine.incidents.find((i) => i.id === inc!.id);
		expect(closed).toBeTruthy();
		expect(['resolved', 'closed']).toContain(closed!.status);
		const helperAwards = engine.benefits
			.list()
			.filter((a) => a.incidentId === inc!.id && a.status === 'available');
		const keys = helperAwards.map((a) => a.idempotencyKey);
		expect(new Set(keys).size).toBe(keys.length);
		// Patient remains
		expect(engine.people.find((p) => p.id === inc!.patientId)).toBeTruthy();
	});

	it('guided demo records three scenarios and a summary', () => {
		runInvestorDemo(engine);
		for (let i = 0; i < 900; i++) engine.step(1000);
		expect(engine.summary).not.toBeNull();
		expect(engine.summary?.handledIncidents).toBeGreaterThan(0);
		const kinds = engine.incidents.map((i) => i.kind).sort();
		expect(kinds).toEqual(['fall', 'medical_sos', 'security_sos']);
		const security = engine.incidents.find((i) => i.kind === 'security_sos');
		expect(
			engine.assignments.filter((a) => a.incidentId === security?.id && a.role === 'helper')
		).toHaveLength(0);
		const fall = engine.incidents.find((i) => i.kind === 'fall');
		expect(['resolved', 'closed']).toContain(fall?.status);
	});

	it('KPIs show dash-equivalent null median before arrivals', () => {
		const k = engine.computeKpis();
		expect(k.medianFirstArrivalSec).toBeNull();
		expect(k.members).toBe(scaleRoles(200).member);
	});
});
