import { FACILITIES } from '#lib/data/geo';
import { fictionalName } from '#lib/data/names';
import { portraitUrl } from '#lib/data/portrait';
import type { Person, PersonRole, Vehicle } from '#lib/domain/types';
import { stratifiedSpots } from './geo';
import { createRng } from './rng';

export interface RoleCounts {
	member: number;
	helper: number;
	nurse: number;
	doctor: number;
	police: number;
}

/** Scale composition while keeping all roles and an exact total. Baseline at 200: 150 / 24 / 10 / 8 / 8. */
export function scaleRoles(population: number): RoleCounts {
	const p = Math.max(100, Math.min(1000, Math.round(population)));
	// Baseline at 200: 150 / 24 / 10 / 8 / 8
	const helper = Math.max(8, Math.round((24 / 200) * p));
	const nurse = Math.max(4, Math.round((10 / 200) * p));
	const doctor = Math.max(3, Math.round((8 / 200) * p));
	const police = Math.max(3, Math.round((8 / 200) * p));
	let member = p - helper - nurse - doctor - police;
	if (member < 1) {
		// Extremely defensive — should not happen in the supported range
		member = 1;
	}
	// Fix rounding drift
	const sum = member + helper + nurse + doctor + police;
	const adjustedMember = member + (p - sum);
	return {
		member: adjustedMember,
		helper,
		nurse,
		doctor,
		police
	};
}

export function generatePopulation(seed: number, population: number): {
	people: Person[];
	vehicles: Vehicle[];
} {
	const rng = createRng(seed);
	const counts = scaleRoles(population);
	const people: Person[] = [];
	let idx = 0;

	const AREAS = [
		'Plaza area',
		'Park edge',
		'Campus edge',
		'Residential west',
		'South loop',
		'Av. Europa'
	];

	const spots = stratifiedSpots(counts.member + counts.helper + counts.nurse + counts.doctor + counts.police, rng);
	let femaleSeq = 0;
	let maleSeq = 0;

	const make = (role: PersonRole, extras: Partial<Person> = {}): Person => {
		const spot = spots[idx];
		const id = `p-${String(++idx).padStart(4, '0')}`;
		const displayName = fictionalName(idx + seed);
		const firstName = displayName.split(' ')[0] ?? '';
		const female = [
			'Alea',
			'Carla',
			'Elena',
			'Greta',
			'Inés',
			'Klara',
			'Marta',
			'Olivia',
			'Rosa',
			'Sofía',
			'Úrsula',
			'Vega',
			'Xenia',
			'Zoe',
			'Beatriz',
			'Diana'
		].includes(firstName);
		const photoSeq = female ? femaleSeq++ : maleSeq++;
		const consent =
			role === 'member' ? false : role === 'helper' ? rng() > 0.15 : true;
		let availability: Person['availability'] = 'available';
		if (role === 'helper' && rng() < 0.25) availability = 'unavailable';
		if ((role === 'nurse' || role === 'doctor') && rng() < 0.1) availability = 'unavailable';

		const qualifications: string[] = [];
		if (role === 'nurse') qualifications.push('Demo RN credential');
		if (role === 'doctor') qualifications.push('Demo MD credential');
		if (role === 'helper' && rng() < 0.4) qualifications.push('First-aid workshop (demo)');

		const age = 22 + Math.floor(rng() * 58);
		const neighborhood = AREAS[Math.floor(rng() * AREAS.length)];
		const summary =
			role === 'helper'
				? 'Opt-in community helper'
				: role === 'nurse'
					? 'Demo clinical nurse'
					: role === 'doctor'
						? 'Demo clinical doctor'
						: role === 'police'
							? 'Simulated police officer'
							: 'Connected resident';

		return {
			id,
			displayName,
			role,
			position: spot.position,
			availability,
			consentToRespond: consent,
			qualifications,
			assignedIncidentId: null,
			movement: {
				kind: 'wander',
				home: { ...spot.position },
				angle: rng() * Math.PI * 2,
				radiusM: 22 + rng() * 36,
				direction: rng() < 0.5 ? 1 : -1
			},
			benefitBalance: 0,
			homeNodeId: spot.nearestNodeId,
			profile: {
				age,
				neighborhood,
				photo: portraitUrl(firstName, photoSeq),
				summary
			},
			...extras
		};
	};

	for (let i = 0; i < counts.member; i++) people.push(make('member'));
	for (let i = 0; i < counts.helper; i++) people.push(make('helper'));
	for (let i = 0; i < counts.nurse; i++) people.push(make('nurse'));
	for (let i = 0; i < counts.doctor; i++) people.push(make('doctor'));
	for (let i = 0; i < counts.police; i++) people.push(make('police'));

	const hospital = FACILITIES.find((f) => f.kind === 'hospital')!;
	const policeBase = FACILITIES.find((f) => f.kind === 'police')!;
	const care = FACILITIES.find((f) => f.kind === 'care_hub')!;

	// Park some clinical staff near facilities for the story
	const nurses = people.filter((p) => p.role === 'nurse');
	const doctors = people.filter((p) => p.role === 'doctor');
	const officers = people.filter((p) => p.role === 'police');
	nurses.slice(0, 2).forEach((n, i) => {
		n.position = {
			lat: care.position.lat + 0.0004 * (i + 1),
			lng: care.position.lng + 0.0003 * i
		};
		n.movement = {
			kind: 'wander',
			home: { ...n.position },
			angle: 0.4,
			radiusM: 28,
			direction: 1
		};
	});
	doctors.slice(0, 2).forEach((d, i) => {
		d.position = {
			lat: hospital.position.lat + 0.00035 * (i + 1),
			lng: hospital.position.lng - 0.00025 * i
		};
		d.movement = {
			kind: 'wander',
			home: { ...d.position },
			angle: 1.2,
			radiusM: 28,
			direction: -1
		};
	});
	officers.slice(0, 2).forEach((o, i) => {
		o.position = {
			lat: policeBase.position.lat - 0.0003 * (i + 1),
			lng: policeBase.position.lng + 0.0002 * i
		};
		o.movement = {
			kind: 'wander',
			home: { ...o.position },
			angle: 2.1,
			radiusM: 28,
			direction: 1
		};
	});

	const vehicles: Vehicle[] = [
		{
			id: 'amb-1',
			label: 'Ambulance A (demo)',
			position: { ...hospital.position },
			status: 'idle',
			assignedIncidentId: null,
			movement: { kind: 'stationary' },
			home: { ...hospital.position }
		},
		{
			id: 'amb-2',
			label: 'Ambulance B (demo)',
			position: {
				lat: hospital.position.lat + 0.0005,
				lng: hospital.position.lng + 0.0004
			},
			status: 'idle',
			assignedIncidentId: null,
			movement: { kind: 'stationary' },
			home: {
				lat: hospital.position.lat + 0.0005,
				lng: hospital.position.lng + 0.0004
			}
		}
	];

	return { people, vehicles };
}
