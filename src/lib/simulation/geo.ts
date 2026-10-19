import { DEMO_AREA, GRAPH_EDGES, GRAPH_NODES, nodeById, type GraphEdge } from '#lib/data/geo';
import type { LatLng } from '#lib/domain/types';

const R = 6371000;

export function haversineMeters(a: LatLng, b: LatLng): number {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(b.lat - a.lat);
	const dLng = toRad(b.lng - a.lng);
	const lat1 = toRad(a.lat);
	const lat2 = toRad(b.lat);
	const h =
		Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function edgePolyline(edge: GraphEdge): LatLng[] {
	const from = nodeById(edge.from).position;
	const to = nodeById(edge.to).position;
	return [from, ...(edge.via ?? []), to];
}

export function polylineLength(points: LatLng[]): number {
	let sum = 0;
	for (let i = 1; i < points.length; i++) {
		sum += haversineMeters(points[i - 1], points[i]);
	}
	return sum;
}

export function interpolatePolyline(points: LatLng[], distanceAlong: number): LatLng {
	if (points.length === 0) return { lat: 0, lng: 0 };
	if (points.length === 1) return { ...points[0] };
	let remaining = Math.max(0, distanceAlong);
	for (let i = 1; i < points.length; i++) {
		const seg = haversineMeters(points[i - 1], points[i]);
		if (remaining <= seg || i === points.length - 1) {
			const t = seg === 0 ? 1 : Math.min(1, remaining / seg);
			return {
				lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * t,
				lng: points[i - 1].lng + (points[i].lng - points[i - 1].lng) * t
			};
		}
		remaining -= seg;
	}
	return { ...points[points.length - 1] };
}

function buildAdjacency(): Map<string, { edgeId: string; to: string; length: number }[]> {
	const adj = new Map<string, { edgeId: string; to: string; length: number }[]>();
	for (const n of GRAPH_NODES) adj.set(n.id, []);
	for (const e of GRAPH_EDGES) {
		const len = polylineLength(edgePolyline(e));
		adj.get(e.from)!.push({ edgeId: e.id, to: e.to, length: len });
		adj.get(e.to)!.push({ edgeId: e.id, to: e.from, length: len });
	}
	return adj;
}

const ADJ = buildAdjacency();

export function nearestNodeId(pos: LatLng): string {
	let best = GRAPH_NODES[0].id;
	let bestD = Infinity;
	for (const n of GRAPH_NODES) {
		const d = haversineMeters(pos, n.position);
		if (d < bestD) {
			bestD = d;
			best = n.id;
		}
	}
	return best;
}

export function findPathNodeIds(fromNodeId: string, toNodeId: string): string[] | null {
	if (fromNodeId === toNodeId) return [fromNodeId];
	const dist = new Map<string, number>();
	const prev = new Map<string, string | null>();
	const pq: { id: string; d: number }[] = [];
	for (const n of GRAPH_NODES) {
		dist.set(n.id, Infinity);
		prev.set(n.id, null);
	}
	dist.set(fromNodeId, 0);
	pq.push({ id: fromNodeId, d: 0 });
	while (pq.length) {
		pq.sort((a, b) => a.d - b.d);
		const cur = pq.shift()!;
		if (cur.id === toNodeId) break;
		if (cur.d !== dist.get(cur.id)) continue;
		for (const nb of ADJ.get(cur.id) ?? []) {
			const nd = cur.d + nb.length;
			if (nd < (dist.get(nb.to) ?? Infinity)) {
				dist.set(nb.to, nd);
				prev.set(nb.to, cur.id);
				pq.push({ id: nb.to, d: nd });
			}
		}
	}
	if ((dist.get(toNodeId) ?? Infinity) === Infinity) return null;
	const path: string[] = [];
	let c: string | null = toNodeId;
	while (c) {
		path.push(c);
		c = prev.get(c) ?? null;
	}
	path.reverse();
	return path;
}

function edgeBetween(a: string, b: string): GraphEdge | undefined {
	return GRAPH_EDGES.find(
		(e) => (e.from === a && e.to === b) || (e.from === b && e.to === a)
	);
}

export function pathPolyline(nodeIds: string[]): LatLng[] {
	if (nodeIds.length === 0) return [];
	const points: LatLng[] = [{ ...nodeById(nodeIds[0]).position }];
	for (let i = 1; i < nodeIds.length; i++) {
		const edge = edgeBetween(nodeIds[i - 1], nodeIds[i]);
		if (!edge) {
			points.push({ ...nodeById(nodeIds[i]).position });
			continue;
		}
		const poly = edgePolyline(edge);
		const forward = edge.from === nodeIds[i - 1];
		const seg = forward ? poly : [...poly].reverse();
		for (let j = 1; j < seg.length; j++) points.push({ ...seg[j] });
	}
	return points;
}

export function routeBetween(from: LatLng, to: LatLng): { points: LatLng[]; meters: number } | null {
	const a = nearestNodeId(from);
	const b = nearestNodeId(to);
	const nodes = findPathNodeIds(a, b);
	if (!nodes) return null;
	const mid = pathPolyline(nodes);
	const points = [{ ...from }, ...mid, { ...to }];
	// Deduplicate consecutive identical points
	const deduped: LatLng[] = [points[0]];
	for (let i = 1; i < points.length; i++) {
		const p = points[i];
		const prev = deduped[deduped.length - 1];
		if (Math.abs(p.lat - prev.lat) > 1e-8 || Math.abs(p.lng - prev.lng) > 1e-8) {
			deduped.push(p);
		}
	}
	return { points: deduped, meters: polylineLength(deduped) };
}

export function pointOnRandomEdge(
	rng: () => number
): { position: LatLng; edgeId: string; t: number; nearestNodeId: string } {
	const edge = GRAPH_EDGES[Math.floor(rng() * GRAPH_EDGES.length)];
	const poly = edgePolyline(edge);
	const len = polylineLength(poly);
	const t = rng();
	const position = interpolatePolyline(poly, t * len);
	return {
		position,
		edgeId: edge.id,
		t,
		nearestNodeId: rng() < 0.5 ? edge.from : edge.to
	};
}

function nearestOnGraph(target: LatLng): { edgeId: string; t: number; nearestNodeId: string } {
	let bestEdge = GRAPH_EDGES[0];
	let bestAlong = 0;
	let bestLen = 1;
	let bestMeters = Infinity;
	for (const edge of GRAPH_EDGES) {
		const poly = edgePolyline(edge);
		const len = Math.max(1, polylineLength(poly));
		const steps = Math.max(4, Math.ceil(len / 40));
		for (let s = 0; s <= steps; s++) {
			const along = (s / steps) * len;
			const point = interpolatePolyline(poly, along);
			const meters = haversineMeters(point, target);
			if (meters < bestMeters) {
				bestMeters = meters;
				bestEdge = edge;
				bestAlong = along;
				bestLen = len;
			}
		}
	}
	const from = nodeById(bestEdge.from).position;
	const to = nodeById(bestEdge.to).position;
	const at = interpolatePolyline(edgePolyline(bestEdge), bestAlong);
	const nearestNodeId =
		haversineMeters(at, from) <= haversineMeters(at, to) ? bestEdge.from : bestEdge.to;
	return { edgeId: bestEdge.id, t: bestAlong / bestLen, nearestNodeId };
}

/**
 * Stratified samples across the demonstration area so people do not pile onto a few streets.
 */
export function stratifiedSpots(
	count: number,
	rng: () => number
): { position: LatLng; edgeId: string; t: number; nearestNodeId: string }[] {
	const { south, west, north, east } = DEMO_AREA.bounds;
	const midLat = (south + north) / 2;
	const widthM = (east - west) * 111320 * Math.cos((midLat * Math.PI) / 180);
	const heightM = (north - south) * 111320;
	const aspect = widthM / Math.max(1, heightM);
	let cols = Math.max(1, Math.round(Math.sqrt(count * aspect)));
	let rows = Math.max(1, Math.ceil(count / cols));
	while (cols * rows < count) rows += 1;

	const cells: { r: number; c: number }[] = [];
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) cells.push({ r, c });
	}
	for (let i = cells.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		const swap = cells[i];
		cells[i] = cells[j];
		cells[j] = swap;
	}

	const spots = [];
	for (let i = 0; i < count; i++) {
		const { r, c } = cells[i];
		const position = {
			lat: south + ((r + 0.18 + rng() * 0.64) / rows) * (north - south),
			lng: west + ((c + 0.18 + rng() * 0.64) / cols) * (east - west)
		};
		const near = nearestOnGraph(position);
		spots.push({ position, ...near });
	}
	return spots;
}

export function allEdgePolylines(): { id: string; points: LatLng[] }[] {
	return GRAPH_EDGES.map((e) => ({ id: e.id, points: edgePolyline(e) }));
}
