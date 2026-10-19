import type { LayerVisibility } from '#lib/domain/types';
import { SimulationEngine, type EngineSnapshot } from '#lib/simulation/engine';
import { runInvestorDemo, runSeveralAlerts } from '#lib/simulation/guided';

const STORAGE_KEY = 'vg-demo-settings-v2';

function isBrowser(): boolean {
	return typeof window !== 'undefined';
}

function loadPersisted(): {
	seed?: number;
	population?: number;
	layers?: Partial<LayerVisibility>;
} {
	if (!isBrowser()) return {};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as {
			seed?: number;
			population?: number;
			layers?: Partial<LayerVisibility>;
		};
		return parsed;
	} catch {
		return {};
	}
}

export const engine = new SimulationEngine();

let initialized = false;

export function ensureEngine(): SimulationEngine {
	if (!initialized) {
		const persisted = loadPersisted();
		engine.init({
			seed: persisted.seed ?? 42,
			population: persisted.population ?? 1000,
			speed: 4,
			layers: { ...engine.settings.layers, ...persisted.layers }
		});
		initialized = true;
		engine.start();
	}
	return engine;
}

export function persistSettings(): void {
	if (!isBrowser()) return;
	localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify({
			seed: engine.settings.seed,
			population: engine.settings.population,
			layers: engine.settings.layers
		})
	);
}

export function getSnapshot(): EngineSnapshot {
	return ensureEngine().snapshot();
}

export function startGuidedDemo(): void {
	ensureEngine();
	runInvestorDemo(engine);
	persistSettings();
}

export function startSeveralAlerts(): void {
	ensureEngine();
	runSeveralAlerts(engine);
}

/**
 * Advance the simulation on animation frames.
 * `onClock` runs only when the displayed clock, pause flag, or speed changes —
 * movement itself does not rebuild the page.
 */
export function bindAnimationLoop(onClock: () => void): () => void {
	let raf = 0;
	let alive = true;
	let last = '';
	const tick = () => {
		if (!alive) return;
		engine.frame();
		const key = `${engine.clock.format()}|${engine.clock.paused ? 1 : 0}|${engine.settings.speed}`;
		if (key !== last) {
			last = key;
			onClock();
		}
		raf = requestAnimationFrame(tick);
	};
	raf = requestAnimationFrame(tick);
	return () => {
		alive = false;
		cancelAnimationFrame(raf);
	};
}
