export class SimulationClock {
	private _simMs = 0;
	private _speed: number = 1;
	private _paused = true;
	private _epochWall = 0;
	private _epochSim = 0;

	get simMs(): number {
		return this._simMs;
	}

	get simSec(): number {
		return this._simMs / 1000;
	}

	get speed(): number {
		return this._speed;
	}

	get paused(): boolean {
		return this._paused;
	}

	setSpeed(speed: number): void {
		this.sync();
		this._speed = speed;
		this._epochWall = performance.now();
		this._epochSim = this._simMs;
	}

	pause(): void {
		this.sync();
		this._paused = true;
	}

	resume(): void {
		this._paused = false;
		this._epochWall = performance.now();
		this._epochSim = this._simMs;
	}

	/** Advance clock based on wall time since last sync when running. */
	sync(nowWall = performance.now()): number {
		if (!this._paused) {
			const dt = (nowWall - this._epochWall) * this._speed;
			this._simMs = this._epochSim + dt;
			this._epochWall = nowWall;
			this._epochSim = this._simMs;
		}
		return this._simMs;
	}

	/** Deterministic step for tests / fixed ticks (milliseconds of sim time). */
	advance(ms: number): number {
		this._simMs += ms;
		this._epochSim = this._simMs;
		this._epochWall = performance.now();
		return this._simMs;
	}

	reset(): void {
		this._simMs = 0;
		this._paused = true;
		this._epochWall = performance.now();
		this._epochSim = 0;
	}

	format(): string {
		const totalSec = Math.floor(this._simMs / 1000);
		const m = Math.floor(totalSec / 60);
		const s = totalSec % 60;
		return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}
}
