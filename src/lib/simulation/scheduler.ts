export type ScheduledHandler = (simMs: number) => void;

interface ScheduledItem {
	id: string;
	at: number;
	handler: ScheduledHandler;
	cancelled: boolean;
	runId: number;
}

/**
 * Central event scheduler keyed to simulation time.
 * Guards against delayed callbacks from a previous run mutating a new run.
 */
export class Scheduler {
	private items: ScheduledItem[] = [];
	private seq = 0;
	private runId = 0;

	get currentRunId(): number {
		return this.runId;
	}

	bumpRun(): void {
		this.runId += 1;
		this.clear();
	}

	schedule(delayMs: number, handler: ScheduledHandler, nowMs: number): string {
		const id = `sch-${++this.seq}`;
		this.items.push({
			id,
			at: nowMs + delayMs,
			handler,
			cancelled: false,
			runId: this.runId
		});
		this.items.sort((a, b) => a.at - b.at);
		return id;
	}

	cancel(id: string): void {
		const item = this.items.find((x) => x.id === id);
		if (item) item.cancelled = true;
	}

	clear(): void {
		for (const item of this.items) item.cancelled = true;
		this.items = [];
	}

	/** Fire due items at or before nowMs. */
	tick(nowMs: number): void {
		while (this.items.length && this.items[0].at <= nowMs) {
			const item = this.items.shift()!;
			if (item.cancelled || item.runId !== this.runId) continue;
			item.handler(nowMs);
		}
	}
}
