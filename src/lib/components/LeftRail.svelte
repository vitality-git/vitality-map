<script lang="ts">
	import type { LayerVisibility, ScenarioKind } from '#lib/domain/types';
	import type { MapMode } from '#lib/maps/types';
	import type { EngineSnapshot } from '#lib/simulation/engine';

	const LAYER_LABELS: Record<keyof LayerVisibility, string> = {
		members: 'Members',
		helpers: 'Community helpers',
		nurses: 'Nurses',
		doctors: 'Doctors',
		police: 'Police',
		facilities: 'Hospitals and care hubs',
		ambulances: 'Ambulances',
		incidents: 'Incidents',
		routes: 'Active routes'
	};

	interface Props {
		snapshot: EngineSnapshot;
		mapMode: MapMode | 'auto';
		pendingScenario: ScenarioKind | null;
		populationDraft: number;
		onArmScenario: (kind: ScenarioKind) => void;
		onTriggerArmed: () => void;
		onSeveralAlerts: () => void;
		onSpeed: (s: 1 | 2 | 4 | 8) => void;
		onLayers: (partial: Partial<LayerVisibility>) => void;
		onPopulationDraft: (n: number) => void;
		onResetSettings: () => void;
		onDiscovery: (m: number) => void;
		onBenefitDelay: (on: boolean) => void;
		onFollow: (on: boolean) => void;
		onMapMode: (mode: MapMode) => void;
		onRecenter: () => void;
		onSelectPerson: (id: string) => void;
		onSelectIncident: (id: string) => void;
	}

	let {
		snapshot,
		mapMode,
		pendingScenario,
		populationDraft,
		onArmScenario,
		onTriggerArmed,
		onSeveralAlerts,
		onSpeed,
		onLayers,
		onPopulationDraft,
		onResetSettings,
		onDiscovery,
		onBenefitDelay,
		onFollow,
		onMapMode,
		onRecenter,
		onSelectPerson,
		onSelectIncident
	}: Props = $props();

	const layers = $derived(snapshot.settings.layers);
	const pros = $derived(
		snapshot.people.filter((p) => p.role === 'doctor' || p.role === 'nurse')
	);
</script>

<aside class="rail" aria-label="Scenario and layer controls">
	{#if !snapshot.settings.presentationMode}
		<h2 class="section-title">Scenarios</h2>
		<div class="btn-row">
			<button
				type="button"
				class="btn"
				class:active={pendingScenario === 'fall'}
				aria-pressed={pendingScenario === 'fall'}
				onclick={() => onArmScenario('fall')}>Fall alert</button
			>
			<button
				type="button"
				class="btn"
				class:active={pendingScenario === 'medical_sos'}
				aria-pressed={pendingScenario === 'medical_sos'}
				onclick={() => onArmScenario('medical_sos')}>Medical SOS</button
			>
			<button
				type="button"
				class="btn"
				class:active={pendingScenario === 'security_sos'}
				aria-pressed={pendingScenario === 'security_sos'}
				onclick={() => onArmScenario('security_sos')}>Security SOS</button
			>
		</div>
		<p style="font-size:0.78rem;color:var(--vg-muted);margin:0.4rem 0 0;">
			Arm a scenario, then click a member or path on the map. Or place it on the nearest eligible member.
		</p>
		<div class="btn-row" style="margin-top:0.4rem;">
			<button
				type="button"
				class="btn btn-primary"
				disabled={!pendingScenario}
				onclick={onTriggerArmed}>Trigger at nearest member</button
			>
			<button type="button" class="btn" onclick={onSeveralAlerts}>Several alerts</button>
		</div>

		<h2 class="section-title">Population</h2>
		<label class="field">
			<span>{populationDraft} people (apply via reset)</span>
			<input
				type="range"
				min="100"
				max="1000"
				step="50"
				value={populationDraft}
				oninput={(e) => onPopulationDraft(Number(e.currentTarget.value))}
			/>
		</label>
		<button type="button" class="btn" onclick={onResetSettings}>Reset with new settings</button>

		<h2 class="section-title">Simulation speed</h2>
		<div class="btn-row">
			{#each [1, 2, 4, 8] as s}
				<button
					type="button"
					class="btn"
					class:active={snapshot.settings.speed === s}
					onclick={() => onSpeed(s as 1 | 2 | 4 | 8)}>{s}×</button
				>
			{/each}
		</div>

		<h2 class="section-title">Discovery radius</h2>
		<label class="field">
			<span>{snapshot.settings.discoveryRadiusM} m, then 200 m if nobody is eligible</span>
			<input
				type="range"
				min="100"
				max="200"
				step="100"
				value={snapshot.settings.discoveryRadiusM}
				oninput={(e) => onDiscovery(Number(e.currentTarget.value))}
			/>
		</label>

		<label class="field" style="display:flex;align-items:center;gap:0.4rem;">
			<input
				type="checkbox"
				checked={snapshot.settings.benefitDelay}
				onchange={(e) => onBenefitDelay(e.currentTarget.checked)}
			/>
			Simulate benefit-service delay
		</label>
		<label class="field" style="display:flex;align-items:center;gap:0.4rem;">
			<input
				type="checkbox"
				checked={snapshot.settings.followMode}
				onchange={(e) => onFollow(e.currentTarget.checked)}
			/>
			Follow selected incident
		</label>

		<h2 class="section-title">Map mode</h2>
		<div class="btn-row">
			<button
				type="button"
				class="btn"
				class:active={mapMode === 'schematic'}
				onclick={() => onMapMode('schematic')}>3D city</button
			>
			<button
				type="button"
				class="btn"
				class:active={mapMode === 'google'}
				onclick={() => onMapMode('google')}>Google map</button
			>
			<button type="button" class="btn" onclick={onRecenter}>Recenter</button>
		</div>

		<h2 class="section-title">Layers</h2>
		<div class="layer-list">
			{#each Object.entries(layers) as [key, value]}
				<label>
					<input
						type="checkbox"
						checked={value}
						onchange={(e) =>
							onLayers({ [key]: e.currentTarget.checked } as Partial<LayerVisibility>)}
					/>
					{LAYER_LABELS[key as keyof LayerVisibility]}
				</label>
			{/each}
		</div>
	{:else}
		<p style="font-size:0.85rem;color:var(--vg-muted);">
			Presentation mode — advanced controls hidden. Use Pause / Resume or Exit presentation.
		</p>
		<div class="btn-row">
			<button type="button" class="btn" onclick={onRecenter}>Recenter</button>
		</div>
	{/if}

	<h2 class="section-title">Incidents</h2>
	{#if snapshot.incidents.length === 0}
		<p style="font-size:0.8rem;color:var(--vg-muted);margin:0;">No incidents in this run.</p>
	{:else}
		<div class="pro-list">
			{#each snapshot.incidents as incident}
				<button
					type="button"
					class="pro-item"
					class:active={snapshot.selectedIncidentId === incident.id}
					onclick={() => onSelectIncident(incident.id)}
				>
					<span>
						<strong>{incident.kind.replaceAll('_', ' ')}</strong>
						<div class="role">{incident.status.replaceAll('_', ' ')} · {incident.id}</div>
					</span>
				</button>
			{/each}
		</div>
	{/if}

	<h2 class="section-title">Professional resources</h2>
	<div class="pro-list">
		{#each pros.slice(0, 12) as p}
			<button type="button" class="pro-item" onclick={() => onSelectPerson(p.id)}>
				<img class="pro-photo" src={p.profile.photo} alt="" />
				<span>
					<strong>{p.displayName}</strong>
					<div class="role">
						{p.role} · {p.availability}{#if p.qualifications[0]}
							· {p.qualifications[0]}{/if}
					</div>
				</span>
			</button>
		{/each}
	</div>
</aside>
