export type LatLng = { lat: number; lng: number };

export type PersonRole = 'member' | 'helper' | 'nurse' | 'doctor' | 'police';

export type Availability = 'available' | 'busy' | 'unavailable';

export type MovementState =
	| { kind: 'stationary' }
	| { kind: 'wander'; home: LatLng; angle: number; radiusM: number; direction: 1 | -1 }
	| { kind: 'patrol'; edgeId: string; t: number; direction: 1 | -1 }
	| { kind: 'assigned'; path: LatLng[]; distanceAlong: number; totalDistance: number; targetIncidentId: string }
	| { kind: 'returning'; path: LatLng[]; distanceAlong: number; totalDistance: number; home: LatLng };

export type ScenarioKind = 'fall' | 'medical_sos' | 'security_sos';

export type IncidentStatus =
	| 'triggered'
	| 'locating'
	| 'routing'
	| 'responding'
	| 'on_scene'
	| 'assisting'
	| 'verification_pending'
	| 'resolved'
	| 'closed'
	| 'cancelled';

export type InvitationOutcome = 'pending' | 'accepted' | 'declined' | 'expired';

export type AssignmentStatus =
	| 'invited'
	| 'accepted'
	| 'en_route'
	| 'arrived'
	| 'assisting'
	| 'completed'
	| 'released'
	| 'declined'
	| 'expired'
	| 'cancelled';

export type AwardStatus = 'pending' | 'approved' | 'available' | 'rejected';

export type VehicleStatus = 'idle' | 'dispatched' | 'en_route' | 'on_scene' | 'transporting' | 'returning';

export type FacilityKind = 'hospital' | 'police' | 'care_hub';

export interface PersonProfile {
	age: number;
	neighborhood: string;
	/** Photographic placeholder portrait. The display name is fictional. */
	photo: string;
	summary: string;
}

export interface Person {
	id: string;
	displayName: string;
	role: PersonRole;
	position: LatLng;
	availability: Availability;
	consentToRespond: boolean;
	qualifications: string[];
	assignedIncidentId: string | null;
	movement: MovementState;
	benefitBalance: number;
	homeNodeId: string;
	profile: PersonProfile;
}

export interface Facility {
	id: string;
	kind: FacilityKind;
	name: string;
	position: LatLng;
	fictional: boolean;
	sourceNote?: string;
	staffIds: string[];
}

export interface Vehicle {
	id: string;
	label: string;
	position: LatLng;
	status: VehicleStatus;
	assignedIncidentId: string | null;
	movement: MovementState;
	home: LatLng;
}

export interface Invitation {
	id: string;
	incidentId: string;
	personId: string;
	issuedAt: number;
	expiresAt: number;
	outcome: InvitationOutcome;
	illustrativeEtaSec: number;
}

export interface Assignment {
	id: string;
	incidentId: string;
	personId: string;
	role: PersonRole;
	status: AssignmentStatus;
	acceptedAt: number | null;
	arrivedAt: number | null;
	illustrativeEtaSec: number;
	routeLabel: string;
	stagingOnly?: boolean;
}

export interface Incident {
	id: string;
	kind: ScenarioKind;
	status: IncidentStatus;
	patientId: string;
	position: LatLng;
	triggeredAt: number;
	discoveryRadiusM: number;
	expandedDiscovery: boolean;
	professionalEscalation: boolean;
	communityRestricted: boolean;
	firstArrivalAt: number | null;
	resolvedAt: number | null;
	sourceLabel: string;
	notes: string[];
	hospitalId: string | null;
	vehicleId: string | null;
	verificationChecks: VerificationCheck[];
	verificationComplete: boolean;
}

export interface VerificationCheck {
	id: string;
	label: string;
	passed: boolean;
	at: number | null;
}

export interface Award {
	id: string;
	incidentId: string;
	helperId: string;
	credits: number;
	status: AwardStatus;
	idempotencyKey: string;
	policyVersion: string;
	createdAt: number;
	updatedAt: number;
	reason?: string;
}

export interface SimEvent {
	id: string;
	at: number;
	type: string;
	message: string;
	incidentId?: string;
	personId?: string;
	meta?: Record<string, unknown>;
}

export interface LayerVisibility {
	members: boolean;
	helpers: boolean;
	nurses: boolean;
	doctors: boolean;
	police: boolean;
	facilities: boolean;
	ambulances: boolean;
	incidents: boolean;
	routes: boolean;
}

export interface DemoSettings {
	seed: number;
	population: number;
	discoveryRadiusM: number;
	speed: 1 | 2 | 4 | 8;
	benefitDelay: boolean;
	presentationMode: boolean;
	followMode: boolean;
	layers: LayerVisibility;
}

export interface Kpis {
	members: number;
	availableHelpers: number;
	availableClinical: number;
	activeIncidents: number;
	completedIncidents: number;
	medianFirstArrivalSec: number | null;
	benefitsIssued: number;
}

export const INCIDENT_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
	triggered: ['locating', 'cancelled'],
	locating: ['routing', 'cancelled'],
	routing: ['responding', 'cancelled'],
	responding: ['on_scene', 'cancelled'],
	on_scene: ['assisting', 'cancelled'],
	assisting: ['verification_pending', 'cancelled'],
	verification_pending: ['resolved', 'cancelled'],
	resolved: ['closed'],
	closed: [],
	cancelled: []
};

export const BENEFIT_CREDITS_PER_HELPER = 20;
export const PROGRAM_ALLOCATION = 5000;
export const HELPER_SESSION_CAP = 100;
export const POLICY_VERSION = 'demo-v1';
export const DEFAULT_DISCOVERY_M = 100;
export const MAX_DISCOVERY_M = 200;
export const WALK_SPEED_MPS = 1.4;
export const AMBULANCE_SPEED_MPS = 8;
