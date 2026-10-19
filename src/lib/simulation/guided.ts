import { CITY_CENTER } from '#lib/data/geo';
import type { Person, ScenarioKind } from '#lib/domain/types';
import type { SimulationEngine } from './engine';

/**
 * Seeded investor story, about two to three minutes of wall time at 4×.
 * Checkpoints use the simulation clock so pause, speed, and reset stay consistent.
 */
export function runInvestorDemo(engine: SimulationEngine): void {
	engine.applySettingsAndReset({
		seed: 42,
		population: 1000,
		speed: 4,
		presentationMode: true,
		followMode: true,
		benefitDelay: false
	});
	engine.guidedStep = 1;
	engine.setCaption(
		'City ecosystem — 1,000 synthetic people, Demo Hospital, Demo Police Base, and Demo Care Hub. Clock is 4×.'
	);
	engine.start();

	let benefitsShown = false;
	let securityStarted = false;
	let finished = false;

	const later = (delayMs: number, fn: () => void) => {
		engine.scheduler.schedule(delayMs, fn, engine.clock.simMs);
	};

	later(48_000, () => {
		engine.guidedStep = 2;
		engine.setCaption(
			'Fall alert — possible fall on a simulated wearable signal. Eligible helpers and a nurse are invited inside the discovery radius.'
		);
		const incident = engine.triggerScenario('fall');
		if (incident) engine.selectIncident(incident.id);
	});

	later(70_000, () => {
		engine.guidedStep = 3;
		engine.setCaption(
			'Accepted responders move along illustrative paths. A nurse provides professional support; other nearby people stay put.'
		);
		const fall = engine.incidents.find((i) => i.kind === 'fall');
		if (fall) engine.selectIncident(fall.id);
	});

	later(96_000, () => {
		engine.guidedStep = 4;
		engine.setCaption(
			'Medical SOS starts while the fall is still open — concurrent incidents, a clinician, and ambulance coordination.'
		);
		const incident = engine.triggerScenario('medical_sos');
		if (incident) engine.selectIncident(incident.id);
	});

	const watchBenefits = () => {
		if (benefitsShown) return;
		const fall = engine.incidents.find((i) => i.kind === 'fall');
		const ready =
			!!fall && (fall.status === 'resolved' || fall.status === 'closed' || fall.status === 'cancelled');
		const timedOut = engine.clock.simMs > 460_000;
		if (!ready && !timedOut) {
			later(4_000, watchBenefits);
			return;
		}
		benefitsShown = true;
		engine.guidedStep = 5;
		if (fall && (fall.status === 'resolved' || fall.status === 'closed')) {
			engine.selectIncident(fall.id);
			engine.setCaption(
				'Fall assistance verified. Demo benefit credits are issued once to each eligible community helper — not to clinicians or police.'
			);
		} else {
			engine.setCaption(
				'Fall response did not verify in this run. Professional escalation continues; no award is invented.'
			);
		}
		later(20_000, () => {
			if (securityStarted) return;
			securityStarted = true;
			engine.guidedStep = 6;
			engine.setCaption(
				'Security SOS — community response restricted. Police respond. Clinicians hold at a safe staging point until the scene is cleared.'
			);
			const incident = engine.triggerScenario('security_sos');
			if (incident) engine.selectIncident(incident.id);
			later(80_000, finish);
		});
	};

	later(120_000, watchBenefits);

	function finish() {
		if (finished) return;
		const minSim = 520_000;
		if (engine.clock.simMs < minSim) {
			later(minSim - engine.clock.simMs, finish);
			return;
		}
		finished = true;
		engine.guidedStep = 7;
		const summary = engine.buildSummary();
		const arrivals = summary.arrivalTimesSec.length
			? summary.arrivalTimesSec.map((t) => `${Math.round(t)}s`).join(', ')
			: '—';
		engine.setCaption(
			`Summary from this run: ${summary.handledIncidents} handled · first arrivals ${arrivals} · ${summary.professionalParticipation} professionals · ${summary.verifiedCommunityContributions} verified helper contributions · ${summary.creditsIssued} demo credits.`
		);
		engine.pause();
	}
}

const SEVERAL_KINDS: ScenarioKind[] = [
	'fall',
	'medical_sos',
	'security_sos',
	'fall',
	'medical_sos'
];

function spreadMembers(people: Person[], count: number): Person[] {
	const members = people.filter(
		(p) => p.role === 'member' && p.availability === 'available' && !p.assignedIncidentId
	);
	const ranked = members
		.map((person) => ({
			person,
			angle: Math.atan2(
				person.position.lat - CITY_CENTER.lat,
				person.position.lng - CITY_CENTER.lng
			)
		}))
		.sort((a, b) => a.angle - b.angle);
	const picked: Person[] = [];
	if (!ranked.length) return picked;
	const step = ranked.length / count;
	for (let i = 0; i < count; i++) {
		picked.push(ranked[Math.min(ranked.length - 1, Math.floor(i * step))].person);
	}
	return picked;
}

/** Open several fall alerts and SOS events in different parts of the city. */
export function runSeveralAlerts(engine: SimulationEngine): void {
	const patients = spreadMembers(engine.people, SEVERAL_KINDS.length);
	engine.setFollowMode(false);
	engine.setCaption(
		'Several simulations at once — fall alerts, medical SOS, and a security SOS in different neighborhoods.'
	);
	if (engine.clock.paused) engine.start();

	patients.forEach((patient, index) => {
		const kind = SEVERAL_KINDS[index];
		engine.scheduler.schedule(
			index * 3500,
			() => {
				const incident = engine.triggerScenario(kind, patient.position);
				if (index === 0 && incident) engine.selectIncident(incident.id);
			},
			engine.clock.simMs
		);
	});
}
