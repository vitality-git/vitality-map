<script lang="ts">
	import { DEMO_AREA, NEIGHBORHOOD_ANCHORS } from '#lib/data/geo';
	import type { Person, ScenarioKind } from '#lib/domain/types';
	import { mountWithFallback } from '#lib/maps/create';
	import { onGoogleMapsFailure } from '#lib/maps/google';
	import type { MapAdapter, MapMode, MarkerSpec } from '#lib/maps/types';
	import type { EngineSnapshot } from '#lib/simulation/engine';
	import { ensureEngine } from '#lib/stores/app';
	import { onDestroy, onMount } from 'svelte';

	interface Props {
		snapshot: EngineSnapshot;
		mapMode: MapMode | 'auto';
		pendingScenario: ScenarioKind | null;
		onMapReady?: (mode: MapMode, status: string | null) => void;
		onSelectPerson: (id: string) => void;
		onSelectFacility: (id: string) => void;
		onSelectIncident: (id: string) => void;
		onMapClick: (lat: number, lng: number) => void;
		onUserPan: () => void;
	}

	let {
		snapshot,
		mapMode,
		pendingScenario,
		onMapReady,
		onSelectPerson,
		onSelectFacility,
		onSelectIncident,
		onMapClick,
		onUserPan
	}: Props = $props();

	let host: HTMLDivElement | undefined = $state();
	let adapter: MapAdapter | null = null;
	let mountedMode: MapMode = 'schematic';
	let lastRunId = -1;
	let followSuspended = false;
	let mountGen = 0;
	let swallowMapClick = false;
	let lastFollowAt = 0;
	let disposePositions: (() => void) | undefined;
	let disposeAuth: (() => void) | undefined;
	let supportsTilt = $state(false);
	let tiltOn = $state(true);

	function personDetail(person: Person): string {
		const role =
			person.role === 'member'
				? 'Resident'
				: person.role === 'helper'
					? 'Community helper'
					: person.role === 'nurse'
						? 'Nurse'
						: person.role === 'doctor'
							? 'Doctor'
							: 'Police officer';
		const state = person.assignedIncidentId ? 'responding' : person.availability;
		return `${role} · ${state}`;
	}

	function buildMarkers(snap: EngineSnapshot): MarkerSpec[] {
		const layers = snap.settings.layers;
		const markers: MarkerSpec[] = [];

		for (const p of snap.people) {
			const kind = p.role;
			const hidden =
				(kind === 'member' && !layers.members) ||
				(kind === 'helper' && !layers.helpers) ||
				(kind === 'nurse' && !layers.nurses) ||
				(kind === 'doctor' && !layers.doctors) ||
				(kind === 'police' && !layers.police);
			markers.push({
				id: p.id,
				position: p.position,
				kind,
				label: p.displayName,
				detail: personDetail(p),
				caption: `${p.profile.age} · ${p.profile.neighborhood}`,
				photo: p.profile.photo,
				selected: snap.selectedPersonId === p.id,
				hidden
			});
		}

		for (const f of snap.facilities) {
			const kind =
				f.kind === 'hospital' ? 'hospital' : f.kind === 'police' ? 'police_base' : 'care_hub';
			markers.push({
				id: f.id,
				position: f.position,
				kind,
				label: f.name,
				selected: snap.selectedFacilityId === f.id,
				hidden: !layers.facilities
			});
		}

		for (const v of snap.vehicles) {
			markers.push({
				id: v.id,
				position: v.position,
				kind: 'ambulance',
				label: v.label,
				hidden: !layers.ambulances
			});
		}

		for (const inc of snap.incidents) {
			if (inc.status === 'closed' || inc.status === 'cancelled') continue;
			const resolvedPulse = inc.status === 'resolved';
			const pulse = !resolvedPulse && !['resolved', 'closed'].includes(inc.status);
			markers.push({
				id: inc.id,
				position: inc.position,
				kind: 'incident',
				label: inc.kind,
				selected: snap.selectedIncidentId === inc.id,
				pulse,
				resolvedPulse,
				hidden: !layers.incidents
			});
		}
		return markers;
	}

	function syncStatic(snap: EngineSnapshot): void {
		if (!adapter) return;
		adapter.setPathNetwork(snap.paths);
		adapter.setLabels(
			NEIGHBORHOOD_ANCHORS.map((a) => ({
				id: a.id,
				position: a.position,
				text: a.label
			}))
		);
		adapter.fitBounds(DEMO_AREA.bounds);
	}

	function syncDynamic(snap: EngineSnapshot): void {
		if (!adapter) return;
		adapter.setMarkers(buildMarkers(snap));

		const routes =
			snap.settings.layers.routes
				? snap.assignments
						.filter((a) => a.status === 'en_route')
						.map((a) => {
							const person = snap.people.find((p) => p.id === a.personId);
							const mov = person?.movement;
							if (!mov || mov.kind !== 'assigned') return null;
							return {
								id: a.id,
								points: mov.path,
								color:
									a.role === 'police'
										? '#1a3358'
										: a.role === 'doctor'
											? '#6b4c9a'
											: '#1f7a72'
							};
						})
						.filter((x): x is NonNullable<typeof x> => Boolean(x))
				: [];

		for (const v of snap.vehicles) {
			if (
				(v.movement.kind === 'assigned' || v.movement.kind === 'returning') &&
				snap.settings.layers.routes
			) {
				routes.push({ id: `vr-${v.id}`, points: v.movement.path, color: '#c45c26' });
			}
		}
		adapter.setRoutes(routes);

		const circles = snap.incidents
			.filter((i) => !['closed', 'cancelled', 'resolved'].includes(i.status))
			.map((i) => ({
				id: `c-${i.id}`,
				center: i.position,
				radiusM: i.discoveryRadiusM
			}));
		adapter.setCircles(snap.settings.layers.incidents ? circles : []);

	}

	function wire(next: MapAdapter): void {
		next.onClick((pos) => {
			if (swallowMapClick) {
				swallowMapClick = false;
				return;
			}
			if (pendingScenario) onMapClick(pos.lat, pos.lng);
		});
		next.onMarkerSelect((id) => {
			swallowMapClick = true;
			setTimeout(() => {
				swallowMapClick = false;
			}, 0);
			const person = snapshot.people.find((p) => p.id === id);
			if (
				pendingScenario &&
				person?.role === 'member' &&
				!person.assignedIncidentId &&
				person.availability === 'available'
			) {
				onMapClick(person.position.lat, person.position.lng);
				return;
			}
			if (id.startsWith('inc-')) onSelectIncident(id);
			else if (id.startsWith('fac-')) onSelectFacility(id);
			else if (id.startsWith('p-')) onSelectPerson(id);
		});
		next.onUserPan(() => {
			followSuspended = true;
			onUserPan();
		});
	}

	function paintPositions(): void {
		if (!adapter) return;
		const engine = ensureEngine();
		const moving: { id: string; position: { lat: number; lng: number } }[] = [];
		for (const person of engine.people) {
			if (person.movement.kind !== 'stationary') {
				moving.push({ id: person.id, position: person.position });
			}
		}
		for (const vehicle of engine.vehicles) {
			if (vehicle.movement.kind !== 'stationary') {
				moving.push({ id: vehicle.id, position: vehicle.position });
			}
		}
		if (moving.length) adapter.updateMarkerPositions(moving);
		if (!snapshot.settings.followMode || followSuspended || !snapshot.selectedIncidentId) return;
		const now = performance.now();
		if (now - lastFollowAt < 2500) return;
		const incident = engine.incidents.find((i) => i.id === engine.selectedIncidentId);
		if (!incident || incident.status === 'closed' || incident.status === 'cancelled') return;
		lastFollowAt = now;
		adapter.panTo(incident.position);
	}

	async function remount(mode: MapMode | 'auto'): Promise<void> {
		if (!host) return;
		const gen = ++mountGen;
		adapter?.destroy();
		adapter = null;
		const result = await mountWithFallback(host, mode);
		if (gen !== mountGen || !host) {
			result.adapter.destroy();
			return;
		}
		adapter = result.adapter;
		mountedMode = result.mode;
		supportsTilt = typeof adapter.toggleTilt === 'function';
		tiltOn = supportsTilt;
		wire(adapter);
		syncStatic(snapshot);
		syncDynamic(snapshot);
		onMapReady?.(result.mode, result.statusMessage);
	}

	onMount(() => {
		disposePositions = ensureEngine().onPositions(() => paintPositions());
		disposeAuth = onGoogleMapsFailure((message) => {
			if (mountedMode !== 'google') return;
			void remount('schematic').then(() => {
				onMapReady?.('schematic', message);
			});
		});
		void remount(mapMode);
	});

	onDestroy(() => {
		mountGen += 1;
		disposePositions?.();
		disposeAuth?.();
		adapter?.destroy();
		adapter = null;
	});

	$effect(() => {
		// Remount when preferred mode changes
		const mode = mapMode;
		if (host && adapter && mode !== 'auto' && mode !== mountedMode) {
			void remount(mode);
		}
	});

	$effect(() => {
		const snap = snapshot;
		if (!adapter) return;
		if (snap.runId !== lastRunId) {
			lastRunId = snap.runId;
			followSuspended = false;
			syncStatic(snap);
		}
		syncDynamic(snap);
	});

	export function recenter(): void {
		followSuspended = false;
		adapter?.fitBounds(DEMO_AREA.bounds);
	}

	function zoom(direction: 1 | -1): void {
		followSuspended = true;
		adapter?.nudgeZoom(direction);
	}

	function toggleTilt(): void {
		if (!adapter?.toggleTilt) return;
		tiltOn = adapter.toggleTilt();
	}
</script>

<div class="map-stage">
	<div class="map-host" bind:this={host}></div>
	<div class="map-toolbar">
		<button type="button" class="btn" onclick={() => zoom(1)} aria-label="Zoom in">+</button>
		<button type="button" class="btn" onclick={() => zoom(-1)} aria-label="Zoom out">−</button>
		{#if supportsTilt}
			<button
				type="button"
				class="btn"
				class:active={tiltOn}
				aria-pressed={tiltOn}
				aria-label="Toggle 3D tilt"
				onclick={toggleTilt}>3D</button
			>
		{/if}
	</div>
	{#if snapshot.mapStatus}
		<div class="map-status" role="status">{snapshot.mapStatus}</div>
	{/if}
	<div class="map-legend" aria-label="Map legend">
		<div><span style="color:#3b6ea5">●</span> Members</div>
		<div><span style="color:#2f8f6b">●</span> Helpers</div>
		<div><span style="color:#1f7a72">■</span> Nurses (N)</div>
		<div><span style="color:#6b4c9a">◆</span> Doctors (D)</div>
		<div><span style="color:#1a3358">▲</span> Police</div>
		<div><span style="color:#b23b3b">▣</span> Facilities</div>
		<div><span style="color:#c45c26">■</span> Ambulances</div>
		<div><span style="color:#d64545">◎</span> Active incident</div>
	</div>
	{#if snapshot.presenterCaption}
		<div class="caption-bar" role="status">{snapshot.presenterCaption}</div>
	{/if}
	{#if pendingScenario}
		<div class="map-status place-hint" role="status">
			Click a member or a path to place {pendingScenario.replaceAll('_', ' ')}. Invalid spots are declined.
		</div>
	{/if}
</div>
