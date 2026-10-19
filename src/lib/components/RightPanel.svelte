<script lang="ts">
	import type { EngineSnapshot } from '#lib/simulation/engine';

	interface Props {
		snapshot: EngineSnapshot;
		onCancel: (incidentId: string) => void;
		onRetryAwards: () => void;
	}

	let { snapshot, onCancel, onRetryAwards }: Props = $props();

	const incident = $derived(
		snapshot.incidents.find((i) => i.id === snapshot.selectedIncidentId) ?? null
	);
	const person = $derived(
		snapshot.people.find((p) => p.id === snapshot.selectedPersonId) ?? null
	);
	const facility = $derived(
		snapshot.facilities.find((f) => f.id === snapshot.selectedFacilityId) ?? null
	);
	const assignments = $derived(
		incident
			? snapshot.assignments.filter((a) => a.incidentId === incident.id)
			: []
	);
	const awards = $derived(
		incident ? snapshot.awards.filter((a) => a.incidentId === incident.id) : []
	);
	const patient = $derived(
		incident ? snapshot.people.find((p) => p.id === incident.patientId) : null
	);

	const stages = [
		'triggered',
		'locating',
		'routing',
		'responding',
		'on_scene',
		'assisting',
		'verification_pending',
		'resolved',
		'closed'
	] as const;

	function stageState(status: string, stage: string): 'done' | 'active' | '' {
		if (!incident) return '';
		if (status === 'cancelled') return stage === 'triggered' ? 'active' : '';
		const si = stages.indexOf(stage as (typeof stages)[number]);
		const ci = stages.indexOf(status as (typeof stages)[number]);
		if (ci < 0) return '';
		if (si < ci) return 'done';
		if (si === ci) return 'active';
		return '';
	}
</script>

<aside class="detail-panel" aria-label="Incident and selection detail">
	{#if snapshot.summary}
		<div class="card-block summary-box">
			<strong>Run summary</strong>
			<div>Handled incidents: {snapshot.summary.handledIncidents}</div>
			<div>
				Arrival times:
				{snapshot.summary.arrivalTimesSec.length
					? snapshot.summary.arrivalTimesSec.map((t) => `${Math.round(t)}s`).join(', ')
					: '—'}
			</div>
			<div>Professionals involved: {snapshot.summary.professionalParticipation}</div>
			<div>Verified helper contributions: {snapshot.summary.verifiedCommunityContributions}</div>
			<div>Credits issued: {snapshot.summary.creditsIssued}</div>
		</div>
	{/if}

	{#if incident}
		<h2 class="section-title">Selected incident</h2>
		<div class="card-block">
			<strong>{incident.kind.replaceAll('_', ' ')}</strong>
			<div>{incident.sourceLabel}</div>
			<div style="color:var(--vg-muted);margin-top:0.25rem;">
				Patient: {patient?.displayName ?? incident.patientId} · status {incident.status}
			</div>
			{#each incident.notes as note}
				<div style="margin-top:0.35rem;">{note}</div>
			{/each}
			{#if !['closed', 'cancelled', 'resolved'].includes(incident.status)}
				<div class="btn-row" style="margin-top:0.5rem;">
					<button type="button" class="btn btn-danger" onclick={() => onCancel(incident.id)}
						>Cancel incident</button
					>
				</div>
			{/if}
		</div>

		<h2 class="section-title">Progress</h2>
		<div class="timeline">
			{#each stages as stage}
				{#if stage !== 'closed' || incident.status === 'closed'}
					<div class="timeline-item">
						<span class="dot {stageState(incident.status, stage)}"></span>
						<span>{stage.replaceAll('_', ' ')}</span>
					</div>
				{/if}
			{/each}
		</div>

		<h2 class="section-title">Matching</h2>
		<div class="card-block">
			Discovery radius {incident.discoveryRadiusM} m
			{#if incident.expandedDiscovery}
				· expanded to 200 m
			{/if}
			{#if incident.communityRestricted}
				<div style="margin-top:0.35rem;color:var(--vg-alert);">
					Community response restricted — professional response requested.
				</div>
			{/if}
			{#if incident.professionalEscalation}
				<div style="margin-top:0.25rem;">Professional escalation active.</div>
			{/if}
		</div>

		<h2 class="section-title">Assigned responders</h2>
		{#if assignments.length === 0}
			<div class="card-block">No assignments yet.</div>
		{:else}
			{#each assignments as a}
				{@const who = snapshot.people.find((p) => p.id === a.personId)}
				<div class="card-block">
					<strong>{who?.displayName ?? a.personId}</strong> · {a.role}
					<div>{a.status}{#if a.stagingOnly} · staging (safe point){/if}</div>
					<div style="color:var(--vg-muted);">{a.routeLabel} · ~{Math.round(a.illustrativeEtaSec)}s</div>
				</div>
			{/each}
		{/if}

		{#if incident.hospitalId}
			{@const hospital = snapshot.facilities.find((f) => f.id === incident.hospitalId)}
			<h2 class="section-title">Hospital coordination</h2>
			<div class="card-block">
				<strong>{hospital?.name ?? 'Demo Hospital'}</strong>
				<div>Fictional coordination panel — no live beds or institutional partnership.</div>
				{#if incident.vehicleId}
					{@const v = snapshot.vehicles.find((x) => x.id === incident.vehicleId)}
					<div style="margin-top:0.35rem;">{v?.label} · {v?.status}</div>
				{/if}
			</div>
		{/if}

		{#if incident.kind === 'security_sos'}
			<h2 class="section-title">Police coordination</h2>
			<div class="card-block">
				Demo Police Base — simulated professional response. No personal rescue points for officers.
			</div>
		{/if}

		<h2 class="section-title">Verification</h2>
		<div class="card-block">
			Simulated workflow — location proximity alone is insufficient.
			{#each incident.verificationChecks as check}
				<div style="margin-top:0.3rem;">
					{check.passed ? '✓' : '○'}
					{check.label}
				</div>
			{/each}
		</div>

		<h2 class="section-title">Benefits</h2>
		{#if awards.length === 0}
			<div class="card-block">No helper awards for this incident yet.</div>
		{:else}
			{#each awards as award}
				<div class="card-block">
					{award.credits} credits · {award.status}
					{#if award.reason}<div style="color:var(--vg-muted);">{award.reason}</div>{/if}
					<div style="font-size:0.75rem;color:var(--vg-muted);">{award.idempotencyKey}</div>
				</div>
			{/each}
		{/if}
		<button type="button" class="btn" onclick={onRetryAwards}>Retry pending awards</button>
	{:else if person}
		<h2 class="section-title">Selected person</h2>
		<div class="card-block person-card">
			<img class="person-photo" src={person.profile.photo} alt="" />
			<div>
				<strong>{person.displayName}</strong>
				<div>{person.role} · {person.availability}</div>
				<div>{person.profile.age} · {person.profile.neighborhood}</div>
				<div>{person.profile.summary}</div>
				<div>Consent to respond: {person.consentToRespond ? 'yes' : 'no'}</div>
				{#if person.qualifications.length}
					<div>Qualifications: {person.qualifications.join(', ')}</div>
				{/if}
				<div>Assigned incident: {person.assignedIncidentId ?? '—'}</div>
				<div>Benefit balance: {person.benefitBalance} demo credits</div>
				<div style="color:var(--vg-muted);margin-top:0.35rem;">ID {person.id} · fictional profile</div>
			</div>
		</div>
	{:else if facility}
		<h2 class="section-title">Facility</h2>
		<div class="card-block">
			<strong>{facility.name}</strong>
			<div>{facility.kind} · fictional operational capacity</div>
			{#if facility.sourceNote}
				<div style="margin-top:0.35rem;color:var(--vg-muted);">{facility.sourceNote}</div>
			{/if}
			<div style="margin-top:0.5rem;">Associated simulated staff:</div>
			{#each facility.staffIds as sid}
				{@const staff = snapshot.people.find((p) => p.id === sid)}
				<div>{staff?.displayName ?? sid} · {staff?.role}</div>
			{/each}
		</div>
	{:else}
		<h2 class="section-title">Detail</h2>
		<div class="card-block">
			Select an incident, professional, or facility on the map or from the lists. KPIs and the
			activity feed stay in sync with the simulation clock.
		</div>
	{/if}
</aside>
