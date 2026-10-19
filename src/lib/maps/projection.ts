import { DEMO_AREA } from '#lib/data/geo';
import type { LatLng } from '#lib/domain/types';

/** Web Mercator zoom used to align street tiles with markers and routes. */
export const STREET_ZOOM = 16;

const TILE = 256;

export function streetTileUrl(x: number, y: number, zoom = STREET_ZOOM): string {
	return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
}

function worldSize(zoom: number): number {
	return TILE * 2 ** zoom;
}

/** Global Web Mercator pixel at the street-tile zoom. */
export function mercatorPixel(pos: LatLng, zoom = STREET_ZOOM): { x: number; y: number } {
	const scale = worldSize(zoom);
	const x = ((pos.lng + 180) / 360) * scale;
	const clamped = Math.min(85.05112878, Math.max(-85.05112878, pos.lat));
	const sin = Math.sin((clamped * Math.PI) / 180);
	const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
	return { x, y };
}

export function mercatorToLatLng(x: number, y: number, zoom = STREET_ZOOM): LatLng {
	const scale = worldSize(zoom);
	const lng = (x / scale) * 360 - 180;
	const n = Math.PI - (2 * Math.PI * y) / scale;
	const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
	return { lat, lng };
}

interface Fit {
	s: number;
	ox: number;
	oy: number;
	originX: number;
	originY: number;
}

/**
 * Shared projection for the city map. Lat/lng map into the same pixel space as
 * the street tiles, fitted to the demo area.
 */
export class DemoProjection {
	readonly bounds = DEMO_AREA.bounds;

	private fit(width: number, height: number, pad = 28): Fit {
		const { south, west, north, east } = this.bounds;
		const nw = mercatorPixel({ lat: north, lng: west });
		const se = mercatorPixel({ lat: south, lng: east });
		const worldW = Math.max(1, se.x - nw.x);
		const worldH = Math.max(1, se.y - nw.y);
		const s = Math.min((width - pad * 2) / worldW, (height - pad * 2) / worldH);
		const usedW = worldW * s;
		const usedH = worldH * s;
		return {
			s,
			ox: (width - usedW) / 2,
			oy: (height - usedH) / 2,
			originX: nw.x,
			originY: nw.y
		};
	}

	project(pos: LatLng, width: number, height: number): { x: number; y: number } {
		const fit = this.fit(width, height);
		const p = mercatorPixel(pos);
		return {
			x: fit.ox + (p.x - fit.originX) * fit.s,
			y: fit.oy + (p.y - fit.originY) * fit.s
		};
	}

	unproject(x: number, y: number, width: number, height: number): LatLng {
		const fit = this.fit(width, height);
		const wx = fit.originX + (x - fit.ox) / fit.s;
		const wy = fit.originY + (y - fit.oy) / fit.s;
		return mercatorToLatLng(wx, wy);
	}

	metersToPixels(meters: number, width: number, atLat = 40.435, height = width): number {
		const fit = this.fit(width, height);
		const metersPerPixel =
			(156543.03392 * Math.cos((atLat * Math.PI) / 180)) / 2 ** STREET_ZOOM;
		return (meters / metersPerPixel) * fit.s;
	}

	/** Street tiles covering the demonstration area, in the same pixel space as markers. */
	streetTiles(width: number, height: number): { href: string; x: number; y: number; size: number }[] {
		const { south, west, north, east } = this.bounds;
		const nw = mercatorPixel({ lat: north, lng: west });
		const se = mercatorPixel({ lat: south, lng: east });
		const fit = this.fit(width, height);
		const x0 = Math.floor(nw.x / TILE);
		const x1 = Math.floor(se.x / TILE);
		const y0 = Math.floor(nw.y / TILE);
		const y1 = Math.floor(se.y / TILE);
		const tiles: { href: string; x: number; y: number; size: number }[] = [];
		for (let tx = x0; tx <= x1; tx++) {
			for (let ty = y0; ty <= y1; ty++) {
				tiles.push({
					href: streetTileUrl(tx, ty),
					x: fit.ox + (tx * TILE - fit.originX) * fit.s,
					y: fit.oy + (ty * TILE - fit.originY) * fit.s,
					size: TILE * fit.s + 0.5
				});
			}
		}
		return tiles;
	}
}

export const demoProjection = new DemoProjection();
