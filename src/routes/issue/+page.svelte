<script lang="ts">
	let secret = $state('');
	let interviewer = $state('');
	let hours = $state(1);
	let busy = $state(false);
	let error = $state('');
	let token = $state('');
	let expiresAt = $state(0);
	let command = $state('');
	let copied = $state(false);
	let addedHours = $state(0);

	const expiresLabel = $derived(
		expiresAt ? new Date(expiresAt).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''
	);
	const ready = $derived(secret.trim() !== '' && interviewer.trim() !== '');

	async function requestToken(add: boolean): Promise<void> {
		error = '';
		copied = false;
		busy = true;
		try {
			const params = new URLSearchParams({
				format: 'json',
				secret,
				name: interviewer
			});
			if (add) {
				params.set('add', '1');
				params.set('hours', String(hours));
			}
			const res = await fetch(`/api/mint?${params.toString()}`);
			if (res.status === 400) {
				error = 'Enter the interviewer name using letters or numbers.';
				token = '';
				command = '';
				expiresAt = 0;
				return;
			}
			if (!res.ok) {
				error = 'That secret was not accepted.';
				token = '';
				command = '';
				expiresAt = 0;
				return;
			}
			const data = (await res.json()) as { token: string; expiresAt: number; command: string };
			token = data.token;
			expiresAt = data.expiresAt;
			command = data.command;
			addedHours = add ? hours : 0;
		} catch {
			error = 'The token service did not respond.';
		} finally {
			busy = false;
		}
	}

	function createToken(event: SubmitEvent): void {
		event.preventDefault();
		void requestToken(false);
	}

	async function copyCommand(): Promise<void> {
		await navigator.clipboard.writeText(command);
		copied = true;
	}
</script>

<svelte:head>
	<title>Create a 1-hour token</title>
</svelte:head>

<main class="issue">
	<form class="card" onsubmit={createToken}>
		<p class="brand">Vitality Guard</p>
		<h1>Create a 1-hour token</h1>
		<p class="lead">
			The pass is the interviewer’s name and lasts 1 hour. Add time here to keep the same pass open
			longer. Anyone else still sees the landing page.
		</p>
		<label>
			Interviewer name
			<input
				type="text"
				name="interviewer"
				autocomplete="name"
				required
				placeholder="Maria Lopez"
				bind:value={interviewer}
			/>
		</label>
		<label>
			Mint secret
			<input
				type="password"
				name="secret"
				autocomplete="current-password"
				required
				bind:value={secret}
			/>
		</label>
		<label>
			Hours to add
			<input type="number" name="hours" min="1" max="24" step="1" bind:value={hours} />
		</label>
		<div class="actions">
			<button class="btn btn-primary" type="submit" disabled={busy || !ready}>
				{busy ? 'Working…' : 'Create 1-hour token'}
			</button>
			<button class="btn" type="button" disabled={busy || !ready} onclick={() => requestToken(true)}>
				Add time
			</button>
		</div>
		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
	</form>

	{#if token}
		<section class="card result" aria-live="polite">
			<h2>Token for {token}</h2>
			<p>
				Valid until {expiresLabel}.
				{#if addedHours > 0}
					Added {addedHours} {addedHours === 1 ? 'hour' : 'hours'} to this pass.
				{:else}
					Creating this name again starts a fresh 1 hour.
				{/if}
			</p>
			<p class="token">{token}</p>
			<label>
				Command
				<textarea readonly rows="4">{command}</textarea>
			</label>
			<button class="btn" type="button" onclick={copyCommand}>
				{copied ? 'Copied' : 'Copy command'}
			</button>
		</section>
	{/if}
</main>

<style>
	.issue {
		min-height: 100dvh;
		display: grid;
		align-content: center;
		justify-items: center;
		gap: 1rem;
		padding: 2rem 1rem;
	}

	.card {
		width: min(520px, 100%);
		background: var(--vg-panel);
		border: 1px solid var(--vg-line);
		border-radius: var(--vg-radius);
		box-shadow: var(--vg-shadow);
		padding: 1.25rem 1.35rem 1.4rem;
	}

	.brand {
		margin: 0;
		font-family: var(--vg-display);
		font-weight: 700;
		color: var(--vg-navy);
	}

	h1,
	h2 {
		margin: 0.35rem 0 0.5rem;
		color: var(--vg-navy);
		font-size: 1.45rem;
	}

	h2 {
		font-size: 1.15rem;
	}

	.lead,
	p {
		color: var(--vg-muted);
		line-height: 1.45;
	}

	label {
		display: grid;
		gap: 0.35rem;
		margin: 1rem 0;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--vg-navy);
	}

	input,
	textarea {
		width: 100%;
		border: 1px solid var(--vg-line);
		border-radius: 6px;
		padding: 0.55rem 0.65rem;
		font: inherit;
		font-weight: 500;
		color: var(--vg-ink);
		background: var(--vg-panel-soft);
	}

	textarea {
		resize: vertical;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.error {
		color: var(--vg-alert);
		font-weight: 600;
	}

	.token {
		font-family: ui-monospace, Consolas, monospace;
		color: var(--vg-ink);
		word-break: break-all;
	}
</style>
