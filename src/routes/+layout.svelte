<script lang="ts">
	import favicon from '#lib/assets/favicon.svg';
	import '../app.css';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<title>Vitality Guard — Pozuelo City Pilot</title>
	<meta
		name="description"
		content="Investor demonstration of Vitality Guard wearable SOS and community assistance — Pozuelo de Alarcón proposed pilot. Simulated data."
	/>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
