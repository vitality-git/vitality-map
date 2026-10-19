<script lang="ts">
	import ActivityFeed from '#lib/components/ActivityFeed.svelte';
	import KpiStrip from '#lib/components/KpiStrip.svelte';
	import LeftRail from '#lib/components/LeftRail.svelte';
	import MapView from '#lib/components/MapView.svelte';
	import RightPanel from '#lib/components/RightPanel.svelte';
	import TopBar from '#lib/components/TopBar.svelte';
	import type { ScenarioKind } from '#lib/domain/types';
	import type { MapMode } from '#lib/maps/types';
	import type { EngineSnapshot } from '#lib/simulation/engine';
	import {
		bindAnimationLoop,
		ensureEngine,
		persistSettings,
		startGuidedDemo,
		startSeveralAlerts
	} from '#lib/stores/app';
	import { ACCESS_STORAGE_KEY, LANDING_URL } from '#lib/access';
	import { onDestroy, onMount } from 'svelte';

	const engine = ensureEngine();

	let snapshot: EngineSnapshot = $state(engine.snapshot());
	let mapMode = $state<MapMode | 'auto'>('auto');
	let pendingScenario: ScenarioKind | null = $state(null);
	let populationDraft = $state(engine.settings.population);
	let mobileView: 'map' | 'list' | 'detail' = $state('map');
	let mapView: { recenter: () => void } | undefined = $state();
	let clockLabel = $state(engine.clock.format());
	let clockPaused = $state(engine.clock.paused);
	let clockSpeed = $state(engine.settings.speed);
	let allowed = $state(false);
	let showLanding = $state(false);

	function syncClock(): void {
		clockLabel = engine.clock.format();
		clockPaused = engine.clock.paused;
		clockSpeed = engine.settings.speed;
	}

	let disposeLoop: (() => void) | undefined;
	let unsub: (() => void) | undefined;

	onMount(() => {
		const token = sessionStorage.getItem(ACCESS_STORAGE_KEY);
		if (!token) {
			showLanding = true;
			return;
		}
		void fetch(`/api/status?token=${encodeURIComponent(token)}`).then((res) => {
			if (!res.ok) {
				sessionStorage.removeItem(ACCESS_STORAGE_KEY);
				showLanding = true;
				return;
			}
			allowed = true;
			unsub = engine.subscribe(() => {
				snapshot = engine.snapshot();
				syncClock();
			});
			disposeLoop = bindAnimationLoop(() => {
				syncClock();
			});
			snapshot = engine.snapshot();
			syncClock();
		});
	});

	onDestroy(() => {
		disposeLoop?.();
		unsub?.();
	});

	function refresh(): void {
		snapshot = engine.snapshot();
	}

	function onArmScenario(kind: ScenarioKind): void {
		pendingScenario = pendingScenario === kind ? null : kind;
	}

	function onTriggerArmed(): void {
		if (!pendingScenario) return;
		const incident = engine.triggerScenario(pendingScenario);
		pendingScenario = null;
		if (incident) mobileView = 'detail';
		refresh();
	}

	function onMapClick(lat: number, lng: number): void {
		if (!pendingScenario) return;
		const incident = engine.triggerScenario(pendingScenario, { lat, lng });
		if (!incident) {
			refresh();
			return;
		}
		pendingScenario = null;
		mobileView = 'detail';
		refresh();
	}

	function onReset(): void {
		engine.applySettingsAndReset({
			population: populationDraft,
			seed: engine.settings.seed
		});
		persistSettings();
		pendingScenario = null;
		refresh();
	}
</script>

{#if allowed}
<div class="app-shell">
	<TopBar
		simClockLabel={clockLabel}
		paused={clockPaused}
		presentationMode={snapshot.settings.presentationMode}
		speed={clockSpeed}
		onStart={() => {
			engine.start();
			refresh();
		}}
		onPause={() => {
			engine.pause();
			refresh();
		}}
		onResume={() => {
			engine.resume();
			refresh();
		}}
		onReset={onReset}
		onGuided={() => {
			startGuidedDemo();
			refresh();
			syncClock();
		}}
		onTogglePresentation={() => {
			engine.setPresentationMode(!engine.settings.presentationMode);
			refresh();
		}}
	/>

	<KpiStrip kpis={snapshot.kpis} />

	<div class="mobile-toggle">
		<button
			type="button"
			class="btn"
			class:active={mobileView === 'map'}
			onclick={() => (mobileView = 'map')}>Map</button
		>
		<button
			type="button"
			class="btn"
			class:active={mobileView === 'list'}
			onclick={() => (mobileView = 'list')}>Controls</button
		>
		<button
			type="button"
			class="btn"
			class:active={mobileView === 'detail'}
			onclick={() => (mobileView = 'detail')}>Detail</button
		>
	</div>

	<div
		class="workspace"
		class:show-list={mobileView === 'list'}
		class:show-detail={mobileView === 'detail'}
	>
		<LeftRail
			{snapshot}
			{mapMode}
			{pendingScenario}
			{populationDraft}
			onArmScenario={onArmScenario}
			onTriggerArmed={onTriggerArmed}
			onSeveralAlerts={() => {
				startSeveralAlerts();
				pendingScenario = null;
				mobileView = 'detail';
				refresh();
				syncClock();
			}}
			onSelectIncident={(id) => {
				engine.selectIncident(id);
				mobileView = 'detail';
				refresh();
			}}
			onSpeed={(s) => {
				engine.setSpeed(s);
				refresh();
			}}
			onLayers={(partial) => {
				engine.setLayers(partial);
				refresh();
			}}
			onPopulationDraft={(n) => (populationDraft = n)}
			onResetSettings={onReset}
			onDiscovery={(m) => {
				engine.setDiscoveryRadius(m);
				refresh();
			}}
			onBenefitDelay={(on) => {
				engine.setBenefitDelay(on);
				refresh();
			}}
			onFollow={(on) => {
				engine.setFollowMode(on);
				refresh();
			}}
			onMapMode={(mode) => (mapMode = mode)}
			onRecenter={() => mapView?.recenter()}
			onSelectPerson={(id) => {
				engine.selectPerson(id);
				mobileView = 'detail';
				refresh();
			}}
		/>

		<MapView
			bind:this={mapView}
			{snapshot}
			{mapMode}
			{pendingScenario}
			onMapReady={(mode, status) => {
				mapMode = mode;
				engine.setMapStatus(status);
				refresh();
			}}
			onSelectPerson={(id) => {
				engine.selectPerson(id);
				mobileView = 'detail';
				refresh();
			}}
			onSelectFacility={(id) => {
				engine.selectFacility(id);
				mobileView = 'detail';
				refresh();
			}}
			onSelectIncident={(id) => {
				engine.selectIncident(id);
				mobileView = 'detail';
				refresh();
			}}
			{onMapClick}
			onUserPan={() => {
				if (engine.settings.followMode) {
					engine.setFollowMode(false);
					refresh();
				}
			}}
		/>

		<RightPanel
			{snapshot}
			onCancel={(id) => {
				engine.cancelIncident(id);
				refresh();
			}}
			onRetryAwards={() => {
				engine.retryPendingAwards();
				refresh();
			}}
		/>
	</div>

	<ActivityFeed
		events={snapshot.events}
		onSelectIncident={(id) => {
			engine.selectIncident(id);
			mobileView = 'detail';
			refresh();
		}}
	/>
</div>

{#if snapshot.toasts.length}
	<div class="toast-stack" aria-live="polite">
		{#each snapshot.toasts.slice(0, 3) as t}
			<div class="toast">{t.message}</div>
		{/each}
	</div>
{/if}
{:else if showLanding}
	<iframe class="landing-frame" title="Vitality" src={LANDING_URL}></iframe>
{:else}
	<p class="gate">Opening Vitality…</p>
{/if}

<style>
	.gate {
		margin: 2rem;
		font-family: system-ui, sans-serif;
		color: #14233a;
	}

	.landing-frame {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		background: #fff;
	}
</style>
