<script lang="ts">
	interface Props {
		simClockLabel: string;
		paused: boolean;
		presentationMode: boolean;
		speed: number;
		onStart: () => void;
		onPause: () => void;
		onResume: () => void;
		onReset: () => void;
		onGuided: () => void;
		onTogglePresentation: () => void;
	}

	let {
		simClockLabel,
		paused,
		presentationMode,
		speed,
		onStart,
		onPause,
		onResume,
		onReset,
		onGuided,
		onTogglePresentation
	}: Props = $props();
</script>

<header class="top-bar">
	<div class="brand-block">
		<div class="brand">Vitality Guard</div>
		<div class="brand-sub">Pozuelo de Alarcón · proposed city pilot</div>
		<span class="badge">Investor demo · simulated data</span>
	</div>
	<div class="btn-row" style="align-items:center;">
		<span class="badge" aria-live="polite">
			Sim clock {simClockLabel} · {speed}× · {paused ? 'Paused' : 'Running'}
		</span>
		{#if !presentationMode}
			<button type="button" class="btn" onclick={onStart}>Start</button>
			{#if paused}
				<button type="button" class="btn" onclick={onResume}>Resume</button>
			{:else}
				<button type="button" class="btn" onclick={onPause}>Pause</button>
			{/if}
			<button type="button" class="btn" onclick={onReset}>Reset</button>
		{:else}
			{#if paused}
				<button type="button" class="btn" onclick={onResume}>Resume</button>
			{:else}
				<button type="button" class="btn" onclick={onPause}>Pause</button>
			{/if}
		{/if}
		<button type="button" class="btn btn-primary" onclick={onGuided}>Run investor demo</button>
		<button type="button" class="btn" class:active={presentationMode} onclick={onTogglePresentation}>
			{presentationMode ? 'Exit presentation' : 'Presentation'}
		</button>
	</div>
</header>
