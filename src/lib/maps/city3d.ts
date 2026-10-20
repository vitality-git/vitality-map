import type { FeatureCollection } from 'geojson';
import { CITY_CENTER, DEMO_AREA } from '#lib/data/geo';
import type { LatLng } from '#lib/domain/types';
import type { CircleSpec, MapAdapter, MarkerSpec, RouteSpec } from './types';

type MlModule = typeof import('maplibre-gl');
type MlMap = import('maplibre-gl').Map;
type MlMarker = import('maplibre-gl').Marker;
type GeoJSONSource = import('maplibre-gl').GeoJSONSource;

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

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

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };

function circleRing(center: LatLng, radiusM: number): [number, number][] {
	const steps = 48;
	const ring: [number, number][] = [];
	const lat1 = (center.lat * Math.PI) / 180;
	const lng1 = (center.lng * Math.PI) / 180;
	const angular = radiusM / 6371000;
	for (let i = 0; i <= steps; i++) {
		const bearing = (i / steps) * Math.PI * 2;
		const lat2 = Math.asin(
			Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing)
		);
		const lng2 =
			lng1 +
			Math.atan2(
				Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
				Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2)
			);
		ring.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
	}
	return ring;
}

/**
 * Real Pozuelo streets with a light tilt and simple extruded buildings.
 * Labels and markers stay a constant screen size as the zoom changes.
 */
export class City3DMapAdapter implements MapAdapter {
	readonly mode = 'city' as const;
	private ml: MlModule | null = null;
	private map: MlMap | null = null;
	private markers = new Map<string, { marker: MlMarker; sig: string }>();
	private pointSpecs = new Map<string, MarkerSpec>();
	private hoverBrief: MlMarker | null = null;
	private briefsOn = false;
	private pointClick = false;
	private labels = new Map<string, MlMarker>();
	private clickHandler: ((pos: LatLng) => void) | null = null;
	private panHandler: (() => void) | null = null;
	private markerHandler: ((id: string) => void) | null = null;
	private reducedMotion = false;
	private resizeObserver: ResizeObserver | null = null;
	private hostEl: HTMLElement | null = null;

	async mount(container: HTMLElement): Promise<void> {
		this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const ml = await import('maplibre-gl');
		await import('maplibre-gl/dist/maplibre-gl.css');
		const worker = await import('maplibre-gl/dist/maplibre-gl-worker.mjs?url');
		ml.setWorkerUrl(worker.default);
		this.ml = ml;

		this.hostEl = container;
		container.innerHTML = '';
		container.style.position = 'absolute';
		container.style.inset = '0';

		const map = new ml.Map({
			container,
			style: STYLE,
			center: [CITY_CENTER.lng, CITY_CENTER.lat],
			zoom: 14.6,
			pitch: this.reducedMotion ? 0 : 48,
			bearing: -16,
			maxPitch: 67,
			attributionControl: { compact: true },
			canvasContextAttributes: { antialias: true }
		});
		this.map = map;
		container.dataset.nativeControls = 'true';
		map.addControl(
			new ml.NavigationControl({
				showZoom: true,
				showCompass: true,
				visualizePitch: true
			}),
			'top-right'
		);

		await new Promise<void>((resolve, reject) => {
			const timer = window.setTimeout(() => reject(new Error('3D city map timed out')), 15000);
			map.once('load', () => {
				window.clearTimeout(timer);
				resolve();
			});
		});

		this.addBuildings();
		this.ensureLayers();

		map.on('click', 'vg-points', (event) => {
			const id = event.features?.[0]?.properties?.id;
			if (typeof id !== 'string') return;
			this.pointClick = true;
			this.markerHandler?.(id);
		});
		map.on('click', (event) => {
			if (this.pointClick) {
				this.pointClick = false;
				return;
			}
			this.clickHandler?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
		});
		map.on('mouseenter', 'vg-points', (event) => {
			map.getCanvas().style.cursor = 'pointer';
			const id = event.features?.[0]?.properties?.id;
			if (typeof id === 'string') this.showHoverBrief(id);
		});
		map.on('mouseleave', 'vg-points', () => {
			map.getCanvas().style.cursor = '';
			this.clearHoverBrief();
		});
		map.on('dragstart', () => this.panHandler?.());
		map.on('zoomend', () => this.refreshBriefs(true));
		map.on('moveend', () => this.refreshBriefs(false));

		const note = document.createElement('div');
		note.textContent = '3D city · drag the compass to tilt · right-drag to turn';
		note.style.cssText =
			'position:absolute;left:12px;bottom:28px;z-index:2;max-width:min(420px,70%);background:rgba(255,255,255,.92);border:1px solid #d5dde6;padding:4px 8px;font:11px/1.3 "Source Sans 3",system-ui,sans-serif;color:#1a3358;border-radius:4px;pointer-events:none;';
		container.appendChild(note);

		this.resizeObserver = new ResizeObserver(() => map.resize());
		this.resizeObserver.observe(container);
		map.resize();
		this.frameCity(0);
	}

	/** Put the demonstration area in the middle of the tilted view. */
	private frameCity(duration: number): void {
		const map = this.map;
		if (!map) return;
		map.fitBounds(
			[
				[DEMO_AREA.bounds.west, DEMO_AREA.bounds.south],
				[DEMO_AREA.bounds.east, DEMO_AREA.bounds.north]
			],
			{
				padding: { top: 56, right: 48, bottom: 88, left: 48 },
				pitch: this.reducedMotion ? 0 : 50,
				bearing: -16,
				duration
			}
		);
	}

	destroy(): void {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;
		if (this.hostEl) delete this.hostEl.dataset.nativeControls;
		this.hostEl = null;
		this.clearHoverBrief();
		for (const entry of this.markers.values()) entry.marker.remove();
		this.markers.clear();
		for (const label of this.labels.values()) label.remove();
		this.labels.clear();
		this.map?.remove();
		this.map = null;
		this.ml = null;
	}

	private addBuildings(): void {
		const map = this.map;
		if (!map) return;
		const layers = map.getStyle().layers ?? [];
		let before: string | undefined;
		for (const layer of layers) {
			if (layer.type === 'symbol') {
				before = layer.id;
				break;
			}
		}
		if (!map.getSource('vg-buildings')) {
			map.addSource('vg-buildings', {
				type: 'vector',
				url: 'https://tiles.openfreemap.org/planet'
			});
		}
		if (!map.getLayer('vg-3d-buildings')) {
			map.addLayer(
				{
					id: 'vg-3d-buildings',
					source: 'vg-buildings',
					'source-layer': 'building',
					type: 'fill-extrusion',
					minzoom: 15,
					filter: ['!=', ['get', 'hide_3d'], true],
					paint: {
						'fill-extrusion-color': '#e7e2da',
						'fill-extrusion-opacity': 0.92,
						'fill-extrusion-height': [
							'interpolate',
							['linear'],
							['zoom'],
							15,
							0,
							16.2,
							['max', ['coalesce', ['to-number', ['get', 'render_height']], 0], 8]
						],
						'fill-extrusion-base': ['coalesce', ['to-number', ['get', 'render_min_height']], 0]
					}
				},
				before
			);
		}
	}

	private ensureLayers(): void {
		const map = this.map;
		if (!map) return;
		if (!map.getSource('vg-paths')) {
			map.addSource('vg-paths', { type: 'geojson', data: EMPTY });
			map.addLayer({
				id: 'vg-paths',
				type: 'line',
				source: 'vg-paths',
				paint: { 'line-color': '#5c6b7a', 'line-width': 1.25, 'line-opacity': 0.35 }
			});
		}
		if (!map.getSource('vg-routes')) {
			map.addSource('vg-routes', { type: 'geojson', data: EMPTY });
			map.addLayer({
				id: 'vg-routes',
				type: 'line',
				source: 'vg-routes',
				paint: {
					'line-color': ['coalesce', ['get', 'color'], '#1f7a72'],
					'line-width': 3,
					'line-opacity': 0.9
				},
				layout: { 'line-cap': 'round', 'line-join': 'round' }
			});
		}
		if (!map.getSource('vg-points')) {
			map.addSource('vg-points', { type: 'geojson', data: EMPTY });
			map.addLayer({
				id: 'vg-points',
				type: 'circle',
				source: 'vg-points',
				paint: {
					'circle-radius': ['get', 'radius'],
					'circle-color': ['get', 'color'],
					'circle-stroke-width': 1,
					'circle-stroke-color': ['case', ['==', ['get', 'selected'], 1], '#0b1f33', '#ffffff'],
					'circle-pitch-alignment': 'map'
				}
			});
		}
		if (!map.getSource('vg-circles')) {
			map.addSource('vg-circles', { type: 'geojson', data: EMPTY });
			map.addLayer({
				id: 'vg-circles-fill',
				type: 'fill',
				source: 'vg-circles',
				paint: { 'fill-color': '#d64545', 'fill-opacity': 0.1 }
			});
			map.addLayer({
				id: 'vg-circles-line',
				type: 'line',
				source: 'vg-circles',
				paint: { 'line-color': '#d64545', 'line-width': 1.5, 'line-opacity': 0.7 }
			});
		}
	}

	private setSource(id: string, data: FeatureCollection): void {
		const source = this.map?.getSource(id) as GeoJSONSource | undefined;
		source?.setData(data);
	}

	setView(center: LatLng, zoom: number): void {
		this.map?.easeTo({
			center: [center.lng, center.lat],
			zoom,
			pitch: this.map.getPitch(),
			bearing: this.map.getBearing(),
			duration: 400
		});
	}

	fitBounds(_bounds: { south: number; west: number; north: number; east: number }): void {
		this.frameCity(450);
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
		this.map?.easeTo({
			center: [center.lng, center.lat],
			pitch: this.map.getPitch(),
			bearing: this.map.getBearing(),
			duration: 500
		});
	}

	toggleTilt(): boolean {
		if (!this.map) return false;
		const enable = this.map.getPitch() < 15;
		this.map.easeTo({
			pitch: enable ? 55 : 0,
			bearing: this.map.getBearing(),
			duration: this.reducedMotion ? 0 : 450
		});
		return enable;
	}

	nudgeZoom(direction: 1 | -1): void {
		if (!this.map) return;
		const camera = { duration: 200 };
		if (direction > 0) this.map.zoomIn(camera);
		else this.map.zoomOut(camera);
	}

	recenter(center: LatLng, zoom = 15): void {
		this.setView(center, zoom);
	}

	setPathNetwork(paths: { id: string; points: LatLng[] }[]): void {
		this.setSource('vg-paths', {
			type: 'FeatureCollection',
			features: paths.map((path) => ({
				type: 'Feature',
				properties: {},
				geometry: {
					type: 'LineString',
					coordinates: path.points.map((p) => [p.lng, p.lat])
				}
			}))
		});
	}

	setLabels(labels: { id: string; position: LatLng; text: string }[]): void {
		if (!this.map || !this.ml) return;
		const keep = new Set<string>();
		for (const label of labels) {
			if (label.id === 'demo-area') continue;
			keep.add(label.id);
			let marker = this.labels.get(label.id);
			if (!marker) {
				const el = document.createElement('div');
				el.textContent = label.text;
				el.style.cssText =
					'font:600 11px/1.2 "Source Sans 3",system-ui,sans-serif;color:#14233a;background:rgba(255,255,255,.9);border:1px solid rgba(20,35,58,.12);border-radius:3px;padding:1px 5px;white-space:nowrap;pointer-events:none;box-shadow:0 1px 1px rgba(0,0,0,.08);';
				marker = new this.ml.Marker({
					element: el,
					anchor: 'bottom',
					pitchAlignment: 'viewport',
					rotationAlignment: 'viewport'
				})
					.setLngLat([label.position.lng, label.position.lat])
					.addTo(this.map);
				this.labels.set(label.id, marker);
			} else {
				marker.setLngLat([label.position.lng, label.position.lat]);
			}
		}
		for (const [id, marker] of this.labels) {
			if (!keep.has(id)) {
				marker.remove();
				this.labels.delete(id);
			}
		}
	}

	setMarkers(markers: MarkerSpec[]): void {
		this.pointSpecs.clear();
		for (const spec of markers) {
			if (!spec.hidden) this.pointSpecs.set(spec.id, spec);
		}
		this.syncPoints();
		this.refreshBriefs(true);
	}

	/** Dots live in the map itself, so tilt and zoom cannot slide them across the screen. */
	private syncPoints(): void {
		const radiusFor = (kind: MarkerSpec['kind']): number =>
			kind === 'member' ? 2 : kind === 'incident' ? 4.5 : kind === 'ambulance' ? 3.5 : 2.5;
		this.setSource('vg-points', {
			type: 'FeatureCollection',
			features: [...this.pointSpecs.values()].map((spec) => ({
				type: 'Feature' as const,
				properties: {
					id: spec.id,
					color: KIND_COLOR[spec.kind],
					radius: radiusFor(spec.kind),
					selected: spec.selected ? 1 : 0
				},
				geometry: {
					type: 'Point' as const,
					coordinates: [spec.position.lng, spec.position.lat]
				}
			}))
		});
	}

	/** Show a short card for each nearby person once the map is zoomed in close. */
	private refreshBriefs(force = false): void {
		const map = this.map;
		if (!map || !this.ml) return;
		const on = map.getZoom() >= 16;
		if (!force && on === this.briefsOn && !on) return;
		this.briefsOn = on;
		const keep = new Set<string>();
		if (on) {
			const bounds = map.getBounds();
			for (const spec of this.pointSpecs.values()) {
				if (!spec.detail || !spec.label) continue;
				if (!bounds.contains([spec.position.lng, spec.position.lat])) continue;
				keep.add(spec.id);
				this.placeBrief(spec);
			}
		}
		for (const [id, entry] of this.markers) {
			if (!keep.has(id)) {
				entry.marker.remove();
				this.markers.delete(id);
			}
		}
	}

	private placeBrief(spec: MarkerSpec): void {
		if (!this.map || !this.ml || !spec.label) return;
		const sig = `${spec.label}|${spec.detail ?? ''}|${spec.caption ?? ''}|${spec.photo ?? ''}`;
		const existing = this.markers.get(spec.id);
		if (existing && existing.sig === sig) {
			existing.marker.setLngLat([spec.position.lng, spec.position.lat]);
			return;
		}
		existing?.marker.remove();
		const marker = new this.ml.Marker({
			element: this.briefElement(spec.label, spec.detail ?? '', spec.caption, spec.photo),
			anchor: 'bottom',
			offset: [0, -8],
			pitchAlignment: 'viewport',
			rotationAlignment: 'viewport'
		})
			.setLngLat([spec.position.lng, spec.position.lat])
			.addTo(this.map);
		this.markers.set(spec.id, { marker, sig });
	}

	private showHoverBrief(id: string): void {
		if (this.briefsOn || !this.map || !this.ml) return;
		const spec = this.pointSpecs.get(id);
		if (!spec?.label || !spec.detail) return;
		this.hoverBrief?.remove();
		this.hoverBrief = new this.ml.Marker({
			element: this.briefElement(spec.label, spec.detail, spec.caption, spec.photo),
			anchor: 'bottom',
			offset: [0, -8],
			pitchAlignment: 'viewport',
			rotationAlignment: 'viewport'
		})
			.setLngLat([spec.position.lng, spec.position.lat])
			.addTo(this.map);
	}

	private clearHoverBrief(): void {
		this.hoverBrief?.remove();
		this.hoverBrief = null;
	}

	private briefElement(name: string, detail: string, caption?: string, photo?: string): HTMLElement {
		const brief = document.createElement('div');
		brief.className = 'vg-brief vg-brief-float';
		if (photo) {
			const img = document.createElement('img');
			img.src = photo;
			img.alt = '';
			img.width = 128;
			img.height = 128;
			img.className = 'vg-brief-photo';
			brief.appendChild(img);
		}
		const text = document.createElement('div');
		const title = document.createElement('strong');
		title.textContent = name;
		const line = document.createElement('div');
		line.textContent = detail;
		text.append(title, line);
		if (caption) {
			const extra = document.createElement('div');
			extra.textContent = caption;
			text.appendChild(extra);
		}
		brief.appendChild(text);
		return brief;
	}

	updateMarkerPositions(updates: { id: string; position: LatLng }[]): void {
		let moved = false;
		for (const update of updates) {
			const spec = this.pointSpecs.get(update.id);
			if (!spec) continue;
			spec.position = update.position;
			moved = true;
			this.markers.get(update.id)?.marker.setLngLat([update.position.lng, update.position.lat]);
		}
		if (moved) this.syncPoints();
	}

	setRoutes(routes: RouteSpec[]): void {
		this.setSource('vg-routes', {
			type: 'FeatureCollection',
			features: routes
				.filter((route) => route.points.length > 1)
				.map((route) => ({
					type: 'Feature' as const,
					properties: { color: route.color ?? '#1f7a72' },
					geometry: {
						type: 'LineString' as const,
						coordinates: route.points.map((p) => [p.lng, p.lat])
					}
				}))
		});
	}

	setCircles(circles: CircleSpec[]): void {
		this.setSource('vg-circles', {
			type: 'FeatureCollection',
			features: circles.map((circle) => ({
				type: 'Feature' as const,
				properties: {},
				geometry: {
					type: 'Polygon' as const,
					coordinates: [circleRing(circle.center, circle.radiusM)]
				}
			}))
		});
	}

}
