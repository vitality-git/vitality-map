import {
	PUBLIC_GOOGLE_MAPS_API_KEY,
	PUBLIC_GOOGLE_MAPS_MAP_ID
} from '$app/env/public';
import { City3DMapAdapter } from './city3d';
import { GoogleMapAdapter, GoogleMapsLoadError } from './google';
import { SchematicMapAdapter } from './schematic';
import type { MapAdapter, MapMode } from './types';

export interface CreateMapResult {
	adapter: MapAdapter;
	mode: MapMode;
	statusMessage: string | null;
}

export function hasGoogleConfig(): boolean {
	return Boolean(PUBLIC_GOOGLE_MAPS_API_KEY);
}

export async function createMapAdapter(
	preferred: MapMode | 'auto' = 'auto'
): Promise<CreateMapResult> {
	const key = PUBLIC_GOOGLE_MAPS_API_KEY;
	const mapId = PUBLIC_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID';

	const wantGoogle = preferred === 'google' || (preferred === 'auto' && Boolean(key));

	if (wantGoogle && key) {
		try {
			const adapter = new GoogleMapAdapter(key, mapId);
			return { adapter, mode: 'google', statusMessage: null };
		} catch (e) {
			const msg =
				e instanceof GoogleMapsLoadError
					? e.message
					: 'Google Maps unavailable — showing the 3D city map.';
			return {
				adapter: new City3DMapAdapter(),
				mode: 'schematic',
				statusMessage: msg
			};
		}
	}

	if (wantGoogle && !key) {
		return {
			adapter: new City3DMapAdapter(),
			mode: 'schematic',
			statusMessage:
				'Google’s 3D map needs an API key — showing a simple 3D city model of Pozuelo.'
		};
	}

	return {
		adapter: new City3DMapAdapter(),
		mode: 'schematic',
		statusMessage: null
	};
}

export async function mountWithFallback(
	container: HTMLElement,
	preferred: MapMode | 'auto'
): Promise<CreateMapResult> {
	const created = await createMapAdapter(preferred);
	try {
		await created.adapter.mount(container);
		return created;
	} catch (e) {
		created.adapter.destroy();
		const msg =
			created.mode === 'google'
				? e instanceof Error
					? `${e.message} — showing the 3D city map.`
					: 'Google Maps failed — showing the 3D city map.'
				: '3D view failed to load — showing the flat street map.';
		const fallback = created.mode === 'google' ? new City3DMapAdapter() : new SchematicMapAdapter();
		try {
			await fallback.mount(container);
			return { adapter: fallback, mode: 'schematic', statusMessage: msg };
		} catch {
			fallback.destroy();
			const schematic = new SchematicMapAdapter();
			await schematic.mount(container);
			return { adapter: schematic, mode: 'schematic', statusMessage: msg };
		}
	}
}
