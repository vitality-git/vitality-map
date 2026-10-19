import type { Incident, Person, PersonRole, ScenarioKind } from '#lib/domain/types';
import { WALK_SPEED_MPS } from '#lib/domain/types';
import { haversineMeters, routeBetween } from './geo';

export interface MatchCandidate {
	person: Person;
	distanceM: number;
	routeMeters: number;
	etaSec: number;
	routePoints: { lat: number; lng: number }[];
}

export function rolesForScenario(kind: ScenarioKind): {
	invite: PersonRole[];
	maxHelpers: number;
	maxClinical: number;
	maxPolice: number;
	communityRestricted: boolean;
	needsVehicle: boolean;
} {
	switch (kind) {
		case 'fall':
			return {
				invite: ['helper', 'nurse'],
				maxHelpers: 2,
				maxClinical: 1,
				maxPolice: 0,
				communityRestricted: false,
				needsVehicle: false
			};
		case 'medical_sos':
			return {
				invite: ['doctor', 'nurse', 'helper'],
				maxHelpers: 1,
				maxClinical: 1,
				maxPolice: 0,
				communityRestricted: false,
				needsVehicle: true
			};
		case 'security_sos':
			return {
				invite: ['police', 'doctor', 'nurse'],
				maxHelpers: 0,
				maxClinical: 1,
				maxPolice: 2,
				communityRestricted: true,
				needsVehicle: false
			};
	}
}

export function isEligible(
	person: Person,
	incident: Incident,
	roles: PersonRole[]
): boolean {
	if (person.id === incident.patientId) return false;
	if (!roles.includes(person.role)) return false;
	if (person.assignedIncidentId) return false;
	if (person.availability !== 'available') return false;
	if (person.role === 'helper' && !person.consentToRespond) return false;
	if (incident.communityRestricted && person.role === 'helper') return false;
	if (person.role === 'member') return false;
	return true;
}

export function findCandidates(
	people: Person[],
	incident: Incident,
	radiusM: number,
	roles: PersonRole[]
): MatchCandidate[] {
	const out: MatchCandidate[] = [];
	for (const person of people) {
		if (!isEligible(person, incident, roles)) continue;
		const distanceM = haversineMeters(person.position, incident.position);
		if (distanceM > radiusM) continue;
		const route = routeBetween(person.position, incident.position);
		if (!route) continue;
		const etaSec = route.meters / WALK_SPEED_MPS;
		out.push({
			person,
			distanceM,
			routeMeters: route.meters,
			etaSec,
			routePoints: route.points
		});
	}
	out.sort((a, b) => a.etaSec - b.etaSec);
	return out;
}

export function selectAcceptances(
	candidates: MatchCandidate[],
	kind: ScenarioKind
): MatchCandidate[] {
	const cfg = rolesForScenario(kind);
	const selected: MatchCandidate[] = [];
	let helpers = 0;
	let clinical = 0;
	let police = 0;

	for (const c of candidates) {
		const role = c.person.role;
		if (role === 'helper') {
			if (helpers >= cfg.maxHelpers) continue;
			helpers++;
			selected.push(c);
		} else if (role === 'nurse' || role === 'doctor') {
			if (clinical >= cfg.maxClinical) continue;
			// Prefer doctor for medical_sos when available
			if (kind === 'medical_sos' && role === 'nurse' && candidates.some((x) => x.person.role === 'doctor' && !selected.includes(x))) {
				// skip nurse if a doctor is still available later — continue scanning
				const doctorLeft = candidates.some(
					(x) =>
						x.person.role === 'doctor' &&
						!selected.some((s) => s.person.id === x.person.id) &&
						x.person.id !== c.person.id
				);
				if (doctorLeft) continue;
			}
			clinical++;
			selected.push(c);
		} else if (role === 'police') {
			if (police >= cfg.maxPolice) continue;
			police++;
			selected.push(c);
		}
	}

	// Second pass for medical_sos: ensure clinical if only nurses were skipped
	if (kind === 'medical_sos' && clinical === 0) {
		for (const c of candidates) {
			if (c.person.role === 'nurse' || c.person.role === 'doctor') {
				selected.push(c);
				break;
			}
		}
	}

	return selected;
}
