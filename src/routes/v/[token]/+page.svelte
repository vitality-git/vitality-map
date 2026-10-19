<script lang="ts">
	import { ACCESS_STORAGE_KEY } from '#lib/access';
	import { onMount } from 'svelte';

	let { data } = $props();

	onMount(() => {
		sessionStorage.setItem(ACCESS_STORAGE_KEY, data.token);
		location.replace('/');
	});
</script>

<p class="gate">Opening the simulation…</p>

<style>
	.gate {
		margin: 2rem;
		font-family: system-ui, sans-serif;
		color: #14233a;
	}
</style>
