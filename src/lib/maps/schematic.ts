import { CITY_CENTER } from '#lib/data/geo';
import type { LatLng } from '#lib/domain/types';
import { demoProjection } from './projection';
import type { CircleSpec, MapAdapter, MarkerSpec, RouteSpec } from './types';

const KIND_STYLE: Record<
	MarkerSpec['kind'],
	{ fill: string; r: number; shape: 'circle' | 'square' | 'diamond' | 'shield' | 'hand' }
> = {
	member: { fill: '#3b6ea5', r: 3.5, shape: 'circle' },
	helper: { fill: '#2f8f6b', r: 5, shape: 'circle' },
	nurse: { fill: '#1f7a72', r: 6, shape: 'square' },
	doctor: { fill: '#6b4c9a', r: 6, shape: 'diamond' },
	police: { fill: '#1a3358', r: 6, shape: 'shield' },
	hospital: { fill: '#b23b3b', r: 9, shape: 'square' },
	police_base: { fill: '#1a3358', r: 9, shape: 'shield' },
	care_hub: { fill: '#2f8f6b', r: 8, shape: 'square' },
	ambulance: { fill: '#c45c26', r: 6, shape: 'square' },
	incident: { fill: '#d64545', r: 8, shape: 'circle' }
};

export class SchematicMapAdapter implements MapAdapter {
	readonly mode = 'schematic' as const;
	private container: HTMLElement | null = null;
	private svg: SVGSVGElement | null = null;
	private root: SVGGElement | null = null;
	private width = 800;
	private height = 600;
	private scale = 1;
	private tx = 0;
	private ty = 0;
	private dragging = false;
	private lastX = 0;
	private lastY = 0;
	private clickHandler: ((pos: LatLng) => void) | null = null;
	private panHandler: (() => void) | null = null;
	private markerHandler: ((id: string) => void) | null = null;
	private pointerTravel = 0;
	private panNotified = false;
	private lastPaths: { id: string; points: LatLng[] }[] = [];
	private lastLabels: { id: string; position: LatLng; text: string }[] = [];
	private lastMarkers: MarkerSpec[] = [];
	private lastRoutes: RouteSpec[] = [];
	private lastCircles: CircleSpec[] = [];
	private labelNodes: SVGElement[] = [];
	private markers = new Map<string, SVGElement>();
	private routesGroup: SVGGElement | null = null;
	private circlesGroup: SVGGElement | null = null;
	private tilesGroup: SVGGElement | null = null;
	private pathsGroup: SVGGElement | null = null;
	private labelsGroup: SVGGElement | null = null;
	private markersGroup: SVGGElement | null = null;
	private reducedMotion = false;

	async mount(container: HTMLElement): Promise<void> {
		this.container = container;
		this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		container.innerHTML = '';
		container.classList.add('schematic-map-host');

		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('role', 'img');
		svg.setAttribute('aria-label', 'Street map of the Pozuelo demonstration area');
		svg.style.width = '100%';
		svg.style.height = '100%';
		svg.style.background = '#f2efe9';
		svg.style.touchAction = 'none';
		container.appendChild(svg);
		this.svg = svg;

		const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
		defs.innerHTML = `
			<style>
				@keyframes vg-pulse {
					0% { opacity: 0.55; r: 10; }
					70% { opacity: 0; r: 28; }
					100% { opacity: 0; r: 28; }
				}
				.vg-pulse { animation: vg-pulse 2.2s ease-out infinite; fill: #d64545; }
				@media (prefers-reduced-motion: reduce) {
					.vg-pulse { animation: none; opacity: 0.35; }
				}
			</style>
		`;
		svg.appendChild(defs);

		const root = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		svg.appendChild(root);
		this.root = root;

		this.tilesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		this.pathsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		this.circlesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		this.routesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		this.markersGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		this.labelsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		root.append(
			this.tilesGroup,
			this.pathsGroup,
			this.circlesGroup,
			this.routesGroup,
			this.markersGroup,
			this.labelsGroup
		);

		const badge = document.createElement('div');
		badge.textContent =
			'Pozuelo street map · © OpenStreetMap contributors · demonstration area, not a city boundary';
		badge.style.cssText =
			'position:absolute;left:12px;bottom:12px;z-index:2;background:rgba(255,255,255,.92);border:1px solid #d5dde6;padding:6px 10px;font:12px/1.3 "Source Sans 3",system-ui,sans-serif;color:#1a3358;border-radius:4px;pointer-events:none;';
		container.appendChild(badge);

		const ro = new ResizeObserver(() => this.resize());
		ro.observe(container);
		(this as unknown as { _ro: ResizeObserver })._ro = ro;
		this.resize();

		svg.style.cursor = 'grab';
		svg.addEventListener('pointerdown', (e) => {
			this.dragging = true;
			this.pointerTravel = 0;
			this.panNotified = false;
			this.lastX = e.clientX;
			this.lastY = e.clientY;
			svg.setPointerCapture(e.pointerId);
		});
		svg.addEventListener('pointermove', (e) => {
			if (!this.dragging) return;
			const dx = e.clientX - this.lastX;
			const dy = e.clientY - this.lastY;
			this.pointerTravel += Math.hypot(dx, dy);
			this.lastX = e.clientX;
			this.lastY = e.clientY;
			this.tx += dx;
			this.ty += dy;
			this.applyTransform();
			if (this.pointerTravel > 6 && !this.panNotified) {
				this.panNotified = true;
				this.panHandler?.();
			}
		});
		svg.addEventListener('pointerup', (e) => {
			this.dragging = false;
			if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
		});
		svg.addEventListener(
			'wheel',
			(e) => {
				e.preventDefault();
				const factor = e.deltaY > 0 ? 0.92 : 1.08;
				this.zoomAbout(this.scale * factor, this.width / 2, this.height / 2);
			},
			{ passive: false }
		);
		svg.addEventListener('click', (e) => {
			if (!this.clickHandler || !this.svg || this.pointerTravel > 6) return;
			const rect = this.svg.getBoundingClientRect();
			const sx = rect.width > 0 ? this.width / rect.width : 1;
			const sy = rect.height > 0 ? this.height / rect.height : 1;
			const x = ((e.clientX - rect.left) * sx - this.tx) / this.scale;
			const y = ((e.clientY - rect.top) * sy - this.ty) / this.scale;
			this.clickHandler(demoProjection.unproject(x, y, this.width, this.height));
		});

		this.recenter(CITY_CENTER, 1);
	}

	destroy(): void {
		const ro = (this as unknown as { _ro?: ResizeObserver })._ro;
		ro?.disconnect();
		if (this.container) this.container.innerHTML = '';
		this.container = null;
		this.svg = null;
		this.markers.clear();
	}

	private resize(): void {
		if (!this.container || !this.svg) return;
		const nextW = this.container.clientWidth || 800;
		const nextH = this.container.clientHeight || 600;
		if (nextW === this.width && nextH === this.height && this.svg.getAttribute('viewBox')) return;
		this.width = nextW;
		this.height = nextH;
		this.svg.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`);
		this.redrawOverlays();
	}

	private redrawOverlays(): void {
		this.drawStreetTiles();
		if (this.lastPaths.length) this.setPathNetwork(this.lastPaths);
		if (this.lastLabels.length) this.setLabels(this.lastLabels);
		if (this.lastMarkers.length) this.setMarkers(this.lastMarkers);
		if (this.lastRoutes.length) this.setRoutes(this.lastRoutes);
		if (this.lastCircles.length) this.setCircles(this.lastCircles);
	}

	private overlayScale(): number {
		return 1 / Math.max(this.scale, 0.2);
	}

	private placeOverlay(el: SVGElement, x: number, y: number): void {
		el.dataset.x = String(x);
		el.dataset.y = String(y);
		el.setAttribute('transform', `translate(${x} ${y}) scale(${this.overlayScale()})`);
	}

	private refreshOverlayScale(): void {
		const inv = this.overlayScale();
		const apply = (el: SVGElement) => {
			const x = el.dataset.x;
			const y = el.dataset.y;
			if (x == null || y == null) return;
			el.setAttribute('transform', `translate(${x} ${y}) scale(${inv})`);
		};
		for (const el of this.markers.values()) apply(el);
		for (const el of this.labelNodes ?? []) apply(el);
	}

	private applyTransform(): void {
		this.root?.setAttribute('transform', `translate(${this.tx} ${this.ty}) scale(${this.scale})`);
		this.refreshOverlayScale();
	}

	setView(center: LatLng, zoom: number): void {
		this.recenter(center, zoom);
	}

	fitBounds(bounds: { south: number; west: number; north: number; east: number }): void {
		void bounds;
		this.recenter(CITY_CENTER, 1);
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
		const { x, y } = demoProjection.project(center, this.width, this.height);
		this.tx = this.width / 2 - x * this.scale;
		this.ty = this.height / 2 - y * this.scale;
		this.applyTransform();
	}

	/** Zoom while keeping the geographic point at the screen center fixed. */
	private zoomAbout(nextScale: number, anchorX: number, anchorY: number): void {
		const previous = this.scale || 1;
		const gx = (anchorX - this.tx) / previous;
		const gy = (anchorY - this.ty) / previous;
		this.scale = Math.min(4.5, Math.max(0.55, nextScale));
		this.tx = anchorX - gx * this.scale;
		this.ty = anchorY - gy * this.scale;
		this.applyTransform();
	}

	nudgeZoom(direction: 1 | -1): void {
		const factor = direction > 0 ? 1.18 : 1 / 1.18;
		this.zoomAbout(this.scale * factor, this.width / 2, this.height / 2);
	}

	private drawStreetTiles(): void {
		if (!this.tilesGroup) return;
		this.tilesGroup.innerHTML = '';
		for (const tile of demoProjection.streetTiles(this.width, this.height)) {
			const img = document.createElementNS('http://www.w3.org/2000/svg', 'image');
			img.setAttribute('href', tile.href);
			img.setAttribute('x', String(tile.x));
			img.setAttribute('y', String(tile.y));
			img.setAttribute('width', String(tile.size));
			img.setAttribute('height', String(tile.size));
			this.tilesGroup.appendChild(img);
		}
	}

	setPathNetwork(paths: { id: string; points: LatLng[] }[]): void {
		this.lastPaths = paths;
		if (!this.pathsGroup) return;
		this.pathsGroup.innerHTML = '';
		for (const path of paths) {
			const el = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
			el.setAttribute(
				'points',
				path.points
					.map((p) => {
						const { x, y } = demoProjection.project(p, this.width, this.height);
						return `${x},${y}`;
					})
					.join(' ')
			);
			el.setAttribute('fill', 'none');
			el.setAttribute('stroke', '#1a3358');
			el.setAttribute('stroke-opacity', '0.28');
			el.setAttribute('stroke-width', '2');
			el.setAttribute('stroke-linecap', 'round');
			el.setAttribute('stroke-linejoin', 'round');
			el.setAttribute('vector-effect', 'non-scaling-stroke');
			this.pathsGroup.appendChild(el);
		}
	}

	setLabels(labels: { id: string; position: LatLng; text: string }[]): void {
		this.lastLabels = labels;
		this.labelNodes = [];
		if (!this.labelsGroup) return;
		this.labelsGroup.innerHTML = '';
		for (const label of labels) {
			if (label.id === 'demo-area') continue;
			const { x, y } = demoProjection.project(label.position, this.width, this.height);
			const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
			const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			t.setAttribute('y', '-10');
			t.setAttribute('text-anchor', 'middle');
			t.setAttribute('fill', '#14233a');
			t.setAttribute('stroke', '#ffffff');
			t.setAttribute('stroke-width', '3');
			t.setAttribute('paint-order', 'stroke');
			t.setAttribute('font-size', '11');
			t.setAttribute('font-family', '"Source Sans 3", system-ui, sans-serif');
			t.setAttribute('font-weight', '600');
			t.textContent = label.text;
			g.appendChild(t);
			this.placeOverlay(g, x, y);
			this.labelsGroup.appendChild(g);
			this.labelNodes.push(g);
		}
	}

	setMarkers(markers: MarkerSpec[]): void {
		this.lastMarkers = markers;
		if (!this.markersGroup) return;
		const keep = new Set(markers.map((m) => m.id));
		for (const [id, el] of this.markers) {
			if (!keep.has(id)) {
				el.remove();
				this.markers.delete(id);
			}
		}
		for (const m of markers) {
			if (m.hidden) {
				const existing = this.markers.get(m.id);
				if (existing) existing.setAttribute('display', 'none');
				continue;
			}
			let g = this.markers.get(m.id) as SVGGElement | undefined;
			if (!g) {
				g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
				g.dataset.id = m.id;
				g.style.cursor = 'pointer';
				g.addEventListener('click', (ev) => {
					ev.stopPropagation();
					if (this.pointerTravel > 6) return;
					const id = g?.dataset.id;
					if (id) this.markerHandler?.(id);
				});
				this.markersGroup.appendChild(g);
				this.markers.set(m.id, g);
			}
			const { x, y } = demoProjection.project(m.position, this.width, this.height);
			this.placeOverlay(g, x, y);
			g.removeAttribute('display');
			const sig = `${m.kind}|${m.selected ? 1 : 0}|${m.pulse ? 1 : 0}|${m.resolvedPulse ? 1 : 0}|${m.label ?? ''}|${this.reducedMotion ? 1 : 0}`;
			if (g.dataset.sig === sig) continue;
			g.dataset.sig = sig;
			g.innerHTML = '';
			const style = KIND_STYLE[m.kind];

			if (m.pulse && !this.reducedMotion) {
				const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
				pulse.setAttribute('r', '10');
				pulse.setAttribute('class', 'vg-pulse');
				g.appendChild(pulse);
			} else if (m.resolvedPulse) {
				const done = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
				done.setAttribute('r', '14');
				done.setAttribute('fill', '#2f8f6b');
				done.setAttribute('opacity', '0.25');
				g.appendChild(done);
			}

			const shape = this.makeShape(style.shape, style.r, style.fill, m.selected);
			g.appendChild(shape);

			if (m.kind === 'nurse' || m.kind === 'doctor') {
				const badge = document.createElementNS('http://www.w3.org/2000/svg', 'text');
				badge.setAttribute('text-anchor', 'middle');
				badge.setAttribute('dominant-baseline', 'central');
				badge.setAttribute('fill', '#fff');
				badge.setAttribute('font-size', '8');
				badge.setAttribute('font-weight', '700');
				badge.textContent = m.kind === 'nurse' ? 'N' : 'D';
				g.appendChild(badge);
			}
			if (m.kind === 'hospital' || m.kind === 'police_base' || m.kind === 'care_hub') {
				const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
				t.setAttribute('y', String(-(style.r + 6)));
				t.setAttribute('text-anchor', 'middle');
				t.setAttribute('fill', '#1a3358');
				t.setAttribute('font-size', '11');
				t.setAttribute('font-weight', '600');
				t.setAttribute('stroke', '#ffffff');
				t.setAttribute('stroke-width', '3');
				t.setAttribute('paint-order', 'stroke');
				t.textContent = m.label ?? m.kind;
				g.appendChild(t);
			}
		}
	}

	private makeShape(
		shape: 'circle' | 'square' | 'diamond' | 'shield' | 'hand',
		r: number,
		fill: string,
		selected?: boolean
	): SVGElement {
		let el: SVGElement;
		if (shape === 'circle') {
			el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			el.setAttribute('r', String(r));
		} else if (shape === 'square') {
			el = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			el.setAttribute('x', String(-r));
			el.setAttribute('y', String(-r));
			el.setAttribute('width', String(r * 2));
			el.setAttribute('height', String(r * 2));
			el.setAttribute('rx', '2');
		} else if (shape === 'diamond') {
			el = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
			el.setAttribute('points', `0,${-r} ${r},0 0,${r} ${-r},0`);
		} else if (shape === 'hand') {
			el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			el.setAttribute(
				'd',
				`M0,${-r * 0.2} m${-r * 0.15},${-r * 0.85} h${r * 0.3} v${r * 0.7} h${r * 0.28} v${-r * 0.55} h${r * 0.28} v${r * 0.7} h${r * 0.28} v${-r * 0.45} h${r * 0.28} v${r * 1.15} c0,${r * 0.45} ${-r * 0.35},${r * 0.7} ${-r * 0.85},${r * 0.7} h${-r * 0.55} c${-r * 0.45},0 ${-r * 0.75},${-r * 0.28} ${-r * 0.75},${-r * 0.7} v${-r * 0.35} h${r * 0.28} v${-r * 0.85} h${r * 0.28} z`
			);
		} else {
			el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			el.setAttribute(
				'd',
				`M0,${-r} L${r * 0.85},${-r * 0.35} L${r * 0.7},${r * 0.2} L0,${r} L${-r * 0.7},${r * 0.2} L${-r * 0.85},${-r * 0.35} Z`
			);
		}
		el.setAttribute('fill', fill);
		el.setAttribute('stroke', selected ? '#0b1f33' : '#ffffff');
		el.setAttribute('stroke-width', selected ? '2.5' : '1');
		return el;
	}

	updateMarkerPositions(updates: { id: string; position: LatLng }[]): void {
		for (const u of updates) {
			const g = this.markers.get(u.id);
			if (!g) continue;
			const { x, y } = demoProjection.project(u.position, this.width, this.height);
			this.placeOverlay(g, x, y);
		}
	}

	setRoutes(routes: RouteSpec[]): void {
		this.lastRoutes = routes;
		if (!this.routesGroup) return;
		this.routesGroup.innerHTML = '';
		for (const route of routes) {
			const el = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
			el.setAttribute(
				'points',
				route.points
					.map((p) => {
						const { x, y } = demoProjection.project(p, this.width, this.height);
						return `${x},${y}`;
					})
					.join(' ')
			);
			el.setAttribute('fill', 'none');
			el.setAttribute('stroke', route.color ?? '#1f7a72');
			el.setAttribute('stroke-width', '3');
			el.setAttribute('stroke-dasharray', '6 4');
			el.setAttribute('opacity', '0.9');
			el.setAttribute('vector-effect', 'non-scaling-stroke');
			this.routesGroup.appendChild(el);
		}
	}

	setCircles(circles: CircleSpec[]): void {
		this.lastCircles = circles;
		if (!this.circlesGroup) return;
		this.circlesGroup.innerHTML = '';
		for (const c of circles) {
			const { x, y } = demoProjection.project(c.center, this.width, this.height);
			const r = demoProjection.metersToPixels(c.radiusM, this.width, c.center.lat, this.height);
			const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
			el.setAttribute('cx', String(x));
			el.setAttribute('cy', String(y));
			el.setAttribute('r', String(r));
			el.setAttribute('fill', c.color ?? 'rgba(214,69,69,0.08)');
			el.setAttribute('stroke', c.color ?? 'rgba(214,69,69,0.45)');
			el.setAttribute('stroke-width', '1.5');
			el.setAttribute('vector-effect', 'non-scaling-stroke');
			this.circlesGroup.appendChild(el);
		}
	}

	recenter(center: LatLng, zoom = 1): void {
		this.scale = zoom;
		const { x, y } = demoProjection.project(center, this.width, this.height);
		this.tx = this.width / 2 - x * this.scale;
		this.ty = this.height / 2 - y * this.scale;
		this.applyTransform();
	}
}
