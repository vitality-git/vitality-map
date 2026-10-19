import {
	BENEFIT_CREDITS_PER_HELPER,
	HELPER_SESSION_CAP,
	POLICY_VERSION,
	PROGRAM_ALLOCATION,
	type Award
} from '#lib/domain/types';

export class BenefitService {
	private awards = new Map<string, Award>();
	private issuedByHelper = new Map<string, number>();
	private allocationUsed = 0;
	private seq = 0;
	private delayMs = 0;
	private runId = 0;
	private pendingTimers = new Set<string>();

	configure(opts: { delayMs?: number }): void {
		this.delayMs = opts.delayMs ?? 0;
	}

	bumpRun(): void {
		this.runId += 1;
		this.pendingTimers.clear();
		this.reset();
	}

	reset(): void {
		this.awards.clear();
		this.issuedByHelper.clear();
		this.allocationUsed = 0;
		this.seq = 0;
	}

	get allocationRemaining(): number {
		return PROGRAM_ALLOCATION - this.allocationUsed;
	}

	list(): Award[] {
		return [...this.awards.values()];
	}

	getByKey(key: string): Award | undefined {
		return this.awards.get(key);
	}

	idempotencyKey(incidentId: string, helperId: string): string {
		return `${incidentId}:${helperId}:${POLICY_VERSION}`;
	}

	/**
	 * Request an award. Returns existing award if key already seen (exactly-once).
	 * When delayMs > 0, starts as pending and caller schedules approval via completePending.
	 */
	requestAward(input: {
		incidentId: string;
		helperId: string;
		verified: boolean;
		simMs: number;
	}): Award {
		const key = this.idempotencyKey(input.incidentId, input.helperId);
		const existing = this.awards.get(key);
		if (existing) return existing;

		if (!input.verified) {
			// Do not persist under the idempotency key — verification must complete first.
			return {
				id: `aw-${++this.seq}`,
				incidentId: input.incidentId,
				helperId: input.helperId,
				credits: 0,
				status: 'rejected',
				idempotencyKey: key,
				policyVersion: POLICY_VERSION,
				createdAt: input.simMs,
				updatedAt: input.simMs,
				reason: 'Verification incomplete'
			};
		}

		const helperUsed = this.issuedByHelper.get(input.helperId) ?? 0;
		if (helperUsed + BENEFIT_CREDITS_PER_HELPER > HELPER_SESSION_CAP) {
			const rejected: Award = {
				id: `aw-${++this.seq}`,
				incidentId: input.incidentId,
				helperId: input.helperId,
				credits: 0,
				status: 'rejected',
				idempotencyKey: key,
				policyVersion: POLICY_VERSION,
				createdAt: input.simMs,
				updatedAt: input.simMs,
				reason: `Helper session cap (${HELPER_SESSION_CAP} credits)`
			};
			this.awards.set(key, rejected);
			return rejected;
		}

		if (this.allocationUsed + BENEFIT_CREDITS_PER_HELPER > PROGRAM_ALLOCATION) {
			const rejected: Award = {
				id: `aw-${++this.seq}`,
				incidentId: input.incidentId,
				helperId: input.helperId,
				credits: 0,
				status: 'rejected',
				idempotencyKey: key,
				policyVersion: POLICY_VERSION,
				createdAt: input.simMs,
				updatedAt: input.simMs,
				reason: 'Program allocation exhausted'
			};
			this.awards.set(key, rejected);
			return rejected;
		}

		const award: Award = {
			id: `aw-${++this.seq}`,
			incidentId: input.incidentId,
			helperId: input.helperId,
			credits: BENEFIT_CREDITS_PER_HELPER,
			status: this.delayMs > 0 ? 'pending' : 'available',
			idempotencyKey: key,
			policyVersion: POLICY_VERSION,
			createdAt: input.simMs,
			updatedAt: input.simMs,
			reason: this.delayMs > 0 ? 'Benefit service delay (presenter option)' : undefined
		};

		if (award.status === 'available') {
			this.allocationUsed += award.credits;
			this.issuedByHelper.set(input.helperId, helperUsed + award.credits);
		}

		this.awards.set(key, award);
		return award;
	}

	/** Complete a pending award after simulated delay — idempotent. */
	completePending(key: string, simMs: number): Award | undefined {
		const award = this.awards.get(key);
		if (!award) return undefined;
		if (award.status !== 'pending') return award;

		const helperUsed = this.issuedByHelper.get(award.helperId) ?? 0;
		if (helperUsed + award.credits > HELPER_SESSION_CAP) {
			award.status = 'rejected';
			award.reason = `Helper session cap (${HELPER_SESSION_CAP} credits)`;
			award.updatedAt = simMs;
			return award;
		}
		if (this.allocationUsed + award.credits > PROGRAM_ALLOCATION) {
			award.status = 'rejected';
			award.reason = 'Program allocation exhausted';
			award.updatedAt = simMs;
			return award;
		}

		award.status = 'available';
		award.reason = undefined;
		award.updatedAt = simMs;
		this.allocationUsed += award.credits;
		this.issuedByHelper.set(award.helperId, helperUsed + award.credits);
		return award;
	}

	get delay(): number {
		return this.delayMs;
	}
}
