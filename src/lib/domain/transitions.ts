import { INCIDENT_TRANSITIONS, type IncidentStatus } from './types';

export class InvalidTransitionError extends Error {
	constructor(
		public readonly from: IncidentStatus,
		public readonly to: IncidentStatus
	) {
		super(`Invalid incident transition: ${from} → ${to}`);
		this.name = 'InvalidTransitionError';
	}
}

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
	return INCIDENT_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: IncidentStatus, to: IncidentStatus): void {
	if (!canTransition(from, to)) {
		throw new InvalidTransitionError(from, to);
	}
}
