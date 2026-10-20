import { City3DMapAdapter } from './city3d';
import type { MapAdapter, MapMode } from './types';

export interface CreateMapResult {
	adapter: MapAdapter;
	mode: MapMode;
	statusMessage: string | null;
}

/** The simulation uses one map: the tilted city view. */
export async function mountCityMap(container: HTMLElement): Promise<CreateMapResult> {
	const adapter = new City3DMapAdapter();
	try {
		await adapter.mount(container);
		return { adapter, mode: 'city', statusMessage: null };
	} catch (e) {
		adapter.destroy();
		throw e;
	}
}
