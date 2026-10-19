import type { Facility, LatLng } from '#lib/domain/types';

/** Approximate demo camera center (not a municipal boundary). */
export const CITY_CENTER: LatLng = { lat: 40.435, lng: -3.815 };

/** Approximate demonstration area — not an authoritative municipal boundary. */
export const DEMO_AREA = {
	label: 'Demonstration area (approximate)',
	bounds: {
		south: 40.424,
		west: -3.832,
		north: 40.446,
		east: -3.798
	}
};

export interface GraphNode {
	id: string;
	label?: string;
	position: LatLng;
}

export interface GraphEdge {
	id: string;
	from: string;
	to: string;
	/** Intermediate vertices along the edge, excluding endpoints (optional). */
	via?: LatLng[];
}

export const GRAPH_NODES: GraphNode[] = [
	{ id: 'n1', label: 'Plaza Mayor (demo)', position: { lat: 40.4352, lng: -3.8138 } },
	{ id: 'n2', label: 'Av. Europa', position: { lat: 40.4378, lng: -3.8102 } },
	{ id: 'n3', label: 'Parque de Somosaguas (demo)', position: { lat: 40.4324, lng: -3.8085 } },
	{ id: 'n4', label: 'Campus edge', position: { lat: 40.4395, lng: -3.818 } },
	{ id: 'n5', label: 'Residential north', position: { lat: 40.4412, lng: -3.8125 } },
	{ id: 'n6', label: 'Residential west', position: { lat: 40.434, lng: -3.824 } },
	{ id: 'n7', label: 'Care corridor', position: { lat: 40.4298, lng: -3.8165 } },
	{ id: 'n8', label: 'Clinic approach', position: { lat: 40.4285, lng: -3.8058 } },
	{ id: 'n9', label: 'Police approach', position: { lat: 40.4368, lng: -3.8215 } },
	{ id: 'n10', label: 'Sports path', position: { lat: 40.4305, lng: -3.811 } },
	{ id: 'n11', label: 'East greenway', position: { lat: 40.4335, lng: -3.8025 } },
	{ id: 'n12', label: 'South loop', position: { lat: 40.4268, lng: -3.8128 } },
	{ id: 'n13', label: 'North loop', position: { lat: 40.4428, lng: -3.8168 } },
	{ id: 'n14', label: 'West green', position: { lat: 40.4382, lng: -3.8275 } },
	{ id: 'n15', label: 'Hospital gate (demo)', position: { lat: 40.4272, lng: -3.8015 } },
	{ id: 'n16', label: 'Police gate (demo)', position: { lat: 40.4385, lng: -3.8258 } }
];

export const GRAPH_EDGES: GraphEdge[] = [
	{ id: 'e1', from: 'n1', to: 'n2', via: [{ lat: 40.4365, lng: -3.812 }] },
	{ id: 'e2', from: 'n1', to: 'n3', via: [{ lat: 40.4338, lng: -3.8112 }] },
	{ id: 'e3', from: 'n1', to: 'n6', via: [{ lat: 40.4346, lng: -3.8188 }] },
	{ id: 'e4', from: 'n1', to: 'n7', via: [{ lat: 40.4325, lng: -3.8152 }] },
	{ id: 'e5', from: 'n2', to: 'n5', via: [{ lat: 40.4395, lng: -3.8114 }] },
	{ id: 'e6', from: 'n2', to: 'n11', via: [{ lat: 40.4355, lng: -3.8065 }] },
	{ id: 'e7', from: 'n3', to: 'n10' },
	{ id: 'e8', from: 'n3', to: 'n11' },
	{ id: 'e9', from: 'n4', to: 'n5' },
	{ id: 'e10', from: 'n4', to: 'n13' },
	{ id: 'e11', from: 'n4', to: 'n9', via: [{ lat: 40.4382, lng: -3.8198 }] },
	{ id: 'e12', from: 'n5', to: 'n13' },
	{ id: 'e13', from: 'n6', to: 'n9' },
	{ id: 'e14', from: 'n6', to: 'n14' },
	{ id: 'e15', from: 'n7', to: 'n10' },
	{ id: 'e16', from: 'n7', to: 'n12' },
	{ id: 'e17', from: 'n8', to: 'n11' },
	{ id: 'e18', from: 'n8', to: 'n15' },
	{ id: 'e19', from: 'n8', to: 'n12', via: [{ lat: 40.4276, lng: -3.8095 }] },
	{ id: 'e20', from: 'n9', to: 'n16' },
	{ id: 'e21', from: 'n9', to: 'n14' },
	{ id: 'e22', from: 'n10', to: 'n12' },
	{ id: 'e23', from: 'n2', to: 'n4', via: [{ lat: 40.4386, lng: -3.814 }] },
	{ id: 'e24', from: 'n1', to: 'n9', via: [{ lat: 40.436, lng: -3.8175 }] }
];

export const NEIGHBORHOOD_ANCHORS: { id: string; label: string; position: LatLng }[] = [
	{ id: 'a-plaza', label: 'Plaza area', position: { lat: 40.4352, lng: -3.8138 } },
	{ id: 'a-park', label: 'Park edge', position: { lat: 40.4324, lng: -3.8085 } },
	{ id: 'a-campus', label: 'Campus edge', position: { lat: 40.4395, lng: -3.818 } },
	{ id: 'a-resid', label: 'Residential west', position: { lat: 40.434, lng: -3.824 } },
	{ id: 'a-south', label: 'South loop', position: { lat: 40.4268, lng: -3.8128 } }
];

/**
 * Facilities: real landmarks only when coordinates were verified during development.
 * Operational capacity and dispatch remain fictional. No partnership implied.
 */
export const FACILITIES: Facility[] = [
	{
		id: 'fac-hospital',
		kind: 'hospital',
		name: 'Demo Hospital',
		position: { lat: 40.4272, lng: -3.8015 },
		fictional: true,
		sourceNote:
			'Fictional coordination node near Quirónsalud Pozuelo reference area (C/ Diego de Velázquez, 1). Named “Demo Hospital” — no partnership or live capacity.',
		staffIds: []
	},
	{
		id: 'fac-police',
		kind: 'police',
		name: 'Demo Police Base',
		position: { lat: 40.4385, lng: -3.8258 },
		fictional: true,
		sourceNote:
			'Fictional base near Policía Municipal reference (C/ San Juan de la Cruz, 4). Named “Demo Police Base” — no partnership.',
		staffIds: []
	},
	{
		id: 'fac-care',
		kind: 'care_hub',
		name: 'Demo Care Hub',
		position: { lat: 40.4298, lng: -3.8165 },
		fictional: true,
		sourceNote: 'Fully fictional community care hub for the pilot demonstration.',
		staffIds: []
	}
];

export const FACILITY_SOURCES = {
	quironsalud:
		'https://international.quironsalud.com/en/hospitals/reference-hospitals/hospital-universitario-quironsalud-pozuelo',
	police:
		'https://www.pozuelodealarcon.org/seguridad-ciudadana/policia-y-proteccion-civil/policia-unidades-operativas'
};

export function nodeById(id: string): GraphNode {
	const n = GRAPH_NODES.find((x) => x.id === id);
	if (!n) throw new Error(`Unknown graph node ${id}`);
	return n;
}
