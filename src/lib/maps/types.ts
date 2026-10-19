import type { LatLng } from '#lib/domain/types';

export type MapMode = 'schematic' | 'google';

export interface MarkerSpec {
	id: string;
	position: LatLng;
	kind:
		| 'member'
		| 'helper'
		| 'nurse'
		| 'doctor'
		| 'police'
		| 'hospital'
		| 'police_base'
		| 'care_hub'
		| 'ambulance'
		| 'incident';
	label?: string;
	/** Short second line, shown up close or on hover. */
	detail?: string;
	/** Extra profile line, such as age and neighborhood. */
	caption?: string;
	/** Portrait data URI for a fictional person. */
	photo?: string;
	selected?: boolean;
	pulse?: boolean;
	resolvedPulse?: boolean;
	hidden?: boolean;
}

export interface RouteSpec {
	id: string;
	points: LatLng[];
	color?: string;
}

export interface CircleSpec {
	id: string;
	center: LatLng;
	radiusM: number;
	color?: string;
}

export interface MapAdapter {
	readonly mode: MapMode;
	mount(container: HTMLElement): Promise<void>;
	destroy(): void;
	setView(center: LatLng, zoom: number): void;
	fitBounds(bounds: { south: number; west: number; north: number; east: number }): void;
	onClick(handler: (pos: LatLng) => void): void;
	onUserPan(handler: () => void): void;
	onMarkerSelect(handler: (id: string) => void): void;
	setMarkers(markers: MarkerSpec[]): void;
	updateMarkerPositions(updates: { id: string; position: LatLng }[]): void;
	setRoutes(routes: RouteSpec[]): void;
	setCircles(circles: CircleSpec[]): void;
	setPathNetwork(paths: { id: string; points: LatLng[] }[]): void;
	setLabels(labels: { id: string; position: LatLng; text: string }[]): void;
	recenter(center: LatLng, zoom?: number): void;
	/** Pan without changing zoom. */
	panTo(center: LatLng): void;
	nudgeZoom(direction: 1 | -1): void;
	/** Tilt the camera for a 3D view. Returns whether tilt is on. */
	toggleTilt?(): boolean;
}
