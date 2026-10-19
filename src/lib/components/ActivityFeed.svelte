<script lang="ts">
	import type { SimEvent } from '#lib/domain/types';

	interface Props {
		events: SimEvent[];
		onSelectIncident: (id: string) => void;
	}

	let { events, onSelectIncident }: Props = $props();

	function formatTime(ms: number): string {
		const totalSec = Math.floor(ms / 1000);
		const m = Math.floor(totalSec / 60);
		const s = totalSec % 60;
		return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}
</script>

<section class="feed" aria-label="Activity feed">
	<h2 class="feed-title">Activity</h2>
	{#each events.slice(0, 40) as ev}
		<button
			type="button"
			class="feed-item"
			onclick={() => ev.incidentId && onSelectIncident(ev.incidentId)}
		>
			<time>{formatTime(ev.at)}</time>
			{ev.message}
		</button>
	{/each}
</section>
