<script lang="ts">
	import type { Kpis } from '#lib/domain/types';

	interface Props {
		kpis: Kpis;
	}

	let { kpis }: Props = $props();

	function fmt(n: number | null): string {
		return n == null ? '—' : `${Math.round(n)}s`;
	}
</script>

<section class="kpi-strip" aria-label="Simulation KPIs">
	<div class="kpi">
		<div class="kpi-label">Members</div>
		<div class="kpi-value">{kpis.members}</div>
	</div>
	<div class="kpi">
		<div class="kpi-label">Avail. helpers</div>
		<div class="kpi-value">{kpis.availableHelpers}</div>
	</div>
	<div class="kpi">
		<div class="kpi-label">Avail. clinical</div>
		<div class="kpi-value">{kpis.availableClinical}</div>
	</div>
	<div class="kpi">
		<div class="kpi-label">Active incidents</div>
		<div class="kpi-value">{kpis.activeIncidents}</div>
	</div>
	<div class="kpi">
		<div class="kpi-label">Completed</div>
		<div class="kpi-value">{kpis.completedIncidents}</div>
	</div>
	<div class="kpi">
		<div class="kpi-label">Median 1st arrival</div>
		<div class="kpi-value">{fmt(kpis.medianFirstArrivalSec)}</div>
	</div>
	<div class="kpi">
		<div class="kpi-label">Benefits issued</div>
		<div class="kpi-value">{kpis.benefitsIssued}</div>
	</div>
</section>
