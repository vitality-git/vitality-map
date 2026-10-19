/** Minimal Google Maps typings used by the optional Google adapter. */
declare namespace google.maps {
	class Map {
		constructor(el: HTMLElement, opts?: object);
		setCenter(c: { lat: number; lng: number }): void;
		setZoom(z: number): void;
		getZoom(): number | undefined;
		fitBounds(b: object): void;
		addListener(event: string, handler: (...args: never[]) => void): void;
	}
	class Polyline {
		constructor(opts?: object);
		setMap(map: Map | null): void;
	}
	class Circle {
		constructor(opts?: object);
		setMap(map: Map | null): void;
	}
	interface MapMouseEvent {
		latLng?: { lat(): number; lng(): number };
	}
	interface MapsLibrary {
		Map: typeof Map;
	}
	function importLibrary(name: 'maps'): Promise<MapsLibrary>;
	function importLibrary(name: 'marker'): Promise<object>;
	function importLibrary(name: string): Promise<object>;

	namespace marker {
		class AdvancedMarkerElement {
			constructor(opts?: object);
			map: Map | null;
			position: { lat: number; lng: number } | null | object;
			content: Node | null;
			addListener(event: string, handler: () => void): void;
		}
	}
}

declare const google: {
	maps: typeof google.maps;
};
