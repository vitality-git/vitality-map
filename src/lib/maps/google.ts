import { CITY_CENTER } from '#lib/data/geo';
import type { LatLng } from '#lib/domain/types';
import type { CircleSpec, MapAdapter, MarkerSpec, RouteSpec } from './types';

declare global {
	interface Window {
		google?: typeof google;
		gm_authFailure?: () => void;
		__vgMapsLoad?: {
			promise: Promise<void>;
			resolve: () => void;
			reject: (e: Error) => void;
		};
	}
}

const KIND_COLOR: Record<MarkerSpec['kind'], string> = {
	member: '#3b6ea5',
	helper: '#2f8f6b',
	nurse: '#1f7a72',
	doctor: '#6b4c9a',
	police: '#1a3358',
	hospital: '#b23b3b',
	police_base: '#1a3358',
	care_hub: '#2f8f6b',
	ambulance: '#c45c26',
	incident: '#d64545'
};

export class GoogleMapsLoadError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GoogleMapsLoadError';
	}
}

const googleFailureHandlers = new Set<(message: string) => void>();

export function onGoogleMapsFailure(handler: (message: string) => void): () => void {
	googleFailureHandlers.add(handler);
	return () => googleFailureHandlers.delete(handler);
}

function notifyGoogleFailure(message: string): void {
	for (const handler of googleFailureHandlers) handler(message);
}

/**
 * Official dynamic importLibrary bootstrap.
 * The key is sent to Google by the browser; it is not logged.
 */
export function loadGoogleMaps(apiKey: string): Promise<void> {
	if (typeof window === 'undefined') {
		return Promise.reject(new GoogleMapsLoadError('Google Maps requires a browser'));
	}
	if (window.google?.maps && typeof window.google.maps.importLibrary === 'function') {
		return Promise.resolve();
	}
	if (window.__vgMapsLoad) return window.__vgMapsLoad.promise;

	let resolve!: () => void;
	let reject!: (e: Error) => void;
	const promise = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	window.__vgMapsLoad = { promise, resolve, reject };

	const timeout = window.setTimeout(() => {
		const err = new GoogleMapsLoadError('Google Maps load timed out — using schematic map.');
		notifyGoogleFailure(err.message);
		reject(err);
	}, 12000);

	window.gm_authFailure = () => {
		const err = new GoogleMapsLoadError(
			'Google Maps rejected the API key — using schematic map.'
		);
		clearTimeout(timeout);
		notifyGoogleFailure(err.message);
		reject(err);
	};

	const params = { key: apiKey, v: 'weekly' };
	installImportLibrary(params);

	google.maps
		.importLibrary('maps')
		.then(() => {
			clearTimeout(timeout);
			resolve();
		})
		.catch(() => {
			clearTimeout(timeout);
			const err = new GoogleMapsLoadError('Failed to load Google Maps JavaScript API');
			notifyGoogleFailure(`${err.message} — using schematic map.`);
			reject(err);
		});

	return promise;
}

function installImportLibrary(params: Record<string, string>): void {
	const w = window as unknown as Record<string, unknown>;
	const c = 'google';
	const q = '__ib__';
	const host = (w[c] as Record<string, unknown> | undefined) ?? {};
	w[c] = host;
	const maps = (host.maps as Record<string, unknown> | undefined) ?? {};
	host.maps = maps;
	if (typeof maps.importLibrary === 'function') return;

	const libraries = new Set<string>();
	const search = new URLSearchParams();
	let loading: Promise<void> | undefined;

	const load = () =>
		loading ||
		(loading = new Promise<void>((done, fail) => {
			const script = document.createElement('script');
			search.set('libraries', [...libraries].join(','));
			for (const key of Object.keys(params)) {
				search.set(key.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`), params[key]);
			}
			search.set('callback', `${c}.maps.${q}`);
			script.src = `https://maps.googleapis.com/maps/api/js?${search.toString()}`;
			script.async = true;
			maps[q] = () => done();
			script.onerror = () => fail(new Error('Google Maps script failed'));
			document.head.appendChild(script);
		}));

	maps.importLibrary = (name: string, ...rest: unknown[]) => {
		libraries.add(name);
		return load().then(() =>
			(maps.importLibrary as (lib: string, ...args: unknown[]) => Promise<unknown>)(name, ...rest)
		);
	};
}

export class GoogleMapAdapter implements MapAdapter {
	readonly mode = 'google' as const;
	private map: google.maps.Map | null = null;
	private markers = new Map<string, google.maps.marker.AdvancedMarkerElement>();
	private polylines: google.maps.Polyline[] = [];
	private pathLines: google.maps.Polyline[] = [];
	private circles: google.maps.Circle[] = [];
	private labelMarkers: google.maps.marker.AdvancedMarkerElement[] = [];
	private clickHandler: ((pos: LatLng) => void) | null = null;
	private panHandler: (() => void) | null = null;
	private markerHandler: ((id: string) => void) | null = null;
	private reducedMotion = false;
	private mapId: string;
	private apiKey: string;
	private suppressPan = false;

	constructor(apiKey: string, mapId: string) {
		this.apiKey = apiKey;
		this.mapId = mapId || 'DEMO_MAP_ID';
	}

	async mount(container: HTMLElement): Promise<void> {
		this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		await loadGoogleMaps(this.apiKey);
		const { Map } = (await google.maps.importLibrary('maps')) as google.maps.MapsLibrary;
		await google.maps.importLibrary('marker');

		this.map = new Map(container, {
			center: CITY_CENTER,
			zoom: 15,
			mapId: this.mapId,
			mapTypeId: 'roadmap',
			mapTypeControl: false,
			streetViewControl: false,
			fullscreenControl: false,
			clickableIcons: false,
			gestureHandling: 'greedy'
		});

		this.map.addListener('click', (e: google.maps.MapMouseEvent) => {
			if (!e.latLng || !this.clickHandler) return;
			this.clickHandler({ lat: e.latLng.lat(), lng: e.latLng.lng() });
		});
		this.map.addListener('dragstart', () => {
			if (!this.suppressPan) this.panHandler?.();
		});
	}

	destroy(): void {
		for (const m of this.markers.values()) m.map = null;
		this.markers.clear();
		for (const p of this.polylines) p.setMap(null);
		for (const p of this.pathLines) p.setMap(null);
		for (const c of this.circles) c.setMap(null);
		for (const l of this.labelMarkers) l.map = null;
		this.polylines = [];
		this.pathLines = [];
		this.circles = [];
		this.labelMarkers = [];
		this.map = null;
	}

	setView(center: LatLng, zoom: number): void {
		this.suppressPan = true;
		this.map?.setCenter(center);
		this.map?.setZoom(zoom);
		queueMicrotask(() => {
			this.suppressPan = false;
		});
	}

	fitBounds(bounds: { south: number; west: number; north: number; east: number }): void {
		if (!this.map) return;
		this.suppressPan = true;
		this.map.fitBounds(bounds);
		queueMicrotask(() => {
			this.suppressPan = false;
		});
	}

	onClick(handler: (pos: LatLng) => void): void {
		this.clickHandler = handler;
	}

	onUserPan(handler: () => void): void {
		this.panHandler = handler;
	}

	onMarkerSelect(handler: (id: string) => void): void {
		this.markerHandler = handler;
	}

	panTo(center: LatLng): void {
		this.suppressPan = true;
		this.map?.setCenter(center);
		queueMicrotask(() => {
			this.suppressPan = false;
		});
	}

	nudgeZoom(direction: 1 | -1): void {
		if (!this.map) return;
		this.suppressPan = true;
		this.map.setZoom((this.map.getZoom() ?? 14) + direction);
		queueMicrotask(() => {
			this.suppressPan = false;
		});
	}

	setPathNetwork(paths: { id: string; points: LatLng[] }[]): void {
		for (const p of this.pathLines) p.setMap(null);
		this.pathLines = [];
		if (!this.map) return;
		for (const path of paths) {
			const line = new google.maps.Polyline({
				path: path.points,
				strokeColor: '#9aa8b5',
				strokeOpacity: 0.55,
				strokeWeight: 3,
				map: this.map,
				clickable: false
			});
			this.pathLines.push(line);
		}
	}

	setLabels(labels: { id: string; position: LatLng; text: string }[]): void {
		for (const l of this.labelMarkers) l.map = null;
		this.labelMarkers = [];
		if (!this.map) return;
		for (const label of labels) {
			const el = document.createElement('div');
			el.textContent = label.text;
			el.style.cssText =
				'font:600 11px "Source Sans 3",system-ui,sans-serif;color:#1a3358;background:rgba(255,255,255,.85);padding:2px 6px;border-radius:3px;border:1px solid #d5dde6;white-space:nowrap;';
			const marker = new google.maps.marker.AdvancedMarkerElement({
				map: this.map,
				position: label.position,
				content: el,
				gmpClickable: false
			});
			this.labelMarkers.push(marker);
		}
	}

	setMarkers(markers: MarkerSpec[]): void {
		if (!this.map) return;
		const keep = new Set(markers.filter((m) => !m.hidden).map((m) => m.id));
		for (const [id, m] of this.markers) {
			if (!keep.has(id)) {
				m.map = null;
				this.markers.delete(id);
			}
		}
		for (const spec of markers) {
			if (spec.hidden) continue;
			const sig = `${spec.kind}|${spec.selected ? 1 : 0}|${spec.pulse ? 1 : 0}|${spec.resolvedPulse ? 1 : 0}|${spec.label ?? ''}`;
			let marker = this.markers.get(spec.id);
			if (!marker) {
				const content = this.buildContent(spec);
				marker = new google.maps.marker.AdvancedMarkerElement({
					map: this.map,
					position: spec.position,
					content,
					title: spec.label ?? spec.kind,
					gmpClickable: true
				});
				marker.addListener('gmp-click', () => this.markerHandler?.(spec.id));
				(marker as unknown as { __sig?: string }).__sig = sig;
				this.markers.set(spec.id, marker);
			} else if ((marker as unknown as { __sig?: string }).__sig !== sig) {
				marker.position = spec.position;
				marker.content = this.buildContent(spec);
				(marker as unknown as { __sig?: string }).__sig = sig;
			} else {
				marker.position = spec.position;
			}
		}
	}

	private buildContent(spec: MarkerSpec): HTMLElement {
		const wrap = document.createElement('div');
		wrap.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;';
		if (spec.pulse && !this.reducedMotion) {
			const pulse = document.createElement('div');
			pulse.style.cssText =
				'position:absolute;width:28px;height:28px;border-radius:50%;background:rgba(214,69,69,.35);animation:vgPulse 2.2s ease-out infinite;';
			wrap.appendChild(pulse);
		} else if (spec.pulse) {
			const pulse = document.createElement('div');
			pulse.style.cssText =
				'position:absolute;width:22px;height:22px;border-radius:50%;background:rgba(214,69,69,.28);';
			wrap.appendChild(pulse);
		}
		const dot = document.createElement('div');
		const size =
			spec.kind === 'hospital' || spec.kind === 'police_base' || spec.kind === 'care_hub'
				? 16
				: spec.kind === 'member'
					? 8
					: 12;
		const radius =
			spec.kind === 'doctor'
				? '2px'
				: spec.kind === 'nurse' || spec.kind === 'hospital' || spec.kind === 'care_hub'
					? '3px'
					: '50%';
		dot.style.cssText = `width:${size}px;height:${size}px;background:${KIND_COLOR[spec.kind]};border:2px solid ${spec.selected ? '#0b1f33' : '#fff'};border-radius:${radius};box-shadow:0 1px 3px rgba(0,0,0,.25);z-index:1;`;
		if (spec.kind === 'nurse' || spec.kind === 'doctor') {
			dot.textContent = spec.kind === 'nurse' ? 'N' : 'D';
			dot.style.color = '#fff';
			dot.style.font = '700 8px/12px system-ui,sans-serif';
			dot.style.textAlign = 'center';
		}
		wrap.appendChild(dot);
		if (spec.label && (spec.kind === 'hospital' || spec.kind === 'police_base' || spec.kind === 'care_hub')) {
			const lab = document.createElement('div');
			lab.textContent = spec.label;
			lab.style.cssText =
				'position:absolute;top:-18px;white-space:nowrap;font:700 10px "Source Sans 3",system-ui,sans-serif;color:#1a3358;background:rgba(255,255,255,.9);padding:1px 4px;border-radius:2px;';
			wrap.appendChild(lab);
		}
		return wrap;
	}

	updateMarkerPositions(updates: { id: string; position: LatLng }[]): void {
		for (const u of updates) {
			const m = this.markers.get(u.id);
			if (m) m.position = u.position;
		}
	}

	setRoutes(routes: RouteSpec[]): void {
		for (const p of this.polylines) p.setMap(null);
		this.polylines = [];
		if (!this.map) return;
		for (const route of routes) {
			const line = new google.maps.Polyline({
				path: route.points,
				strokeColor: route.color ?? '#1f7a72',
				strokeOpacity: 0.9,
				strokeWeight: 4,
				clickable: false,
				map: this.map,
				icons: [
					{
						icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 },
						offset: '0',
						repeat: '12px'
					}
				]
			});
			this.polylines.push(line);
		}
	}

	setCircles(circles: CircleSpec[]): void {
		for (const c of this.circles) c.setMap(null);
		this.circles = [];
		if (!this.map) return;
		for (const c of circles) {
			const circle = new google.maps.Circle({
				center: c.center,
				radius: c.radiusM,
				map: this.map,
				clickable: false,
				strokeColor: '#d64545',
				strokeOpacity: 0.5,
				strokeWeight: 1.5,
				fillColor: '#d64545',
				fillOpacity: 0.08
			});
			this.circles.push(circle);
		}
	}

	recenter(center: LatLng, zoom = 14): void {
		this.setView(center, zoom);
	}
}
