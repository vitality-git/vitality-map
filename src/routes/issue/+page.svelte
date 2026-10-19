<script lang="ts">
	let secret = $state('');
	let interviewer = $state('');
	let busy = $state(false);
	let error = $state('');
	let token = $state('');
	let expiresAt = $state(0);
	let command = $state('');
	let copied = $state(false);

	const expiresLabel = $derived(
		expiresAt ? new Date(expiresAt).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' }) : ''
	);

	async function createToken(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		error = '';
		copied = false;
		busy = true;
		try {
			const res = await fetch(
				`/api/mint?format=json&secret=${encodeURIComponent(secret)}&name=${encodeURIComponent(interviewer)}`
			);
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
		} catch {
			error = 'The token service did not respond.';
		} finally {
			busy = false;
		}
	}

	async function copyCommand(): Promise<void> {
		await navigator.clipboard.writeText(command);
		copied = true;
	}
</script>

<svelte:head>
	<title>Create a 2-hour token</title>
</svelte:head>

<main class="issue">
	<form class="card" onsubmit={createToken}>
		<p class="brand">Vitality Guard</p>
		<h1>Create a 2-hour token</h1>
		<p class="lead">
			The pass is the interviewer’s name. It stops working two hours after it is created. Anyone else
			still sees the landing page.
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
		<button class="btn btn-primary" type="submit" disabled={busy || secret.trim() === '' || interviewer.trim() === ''}>
			{busy ? 'Creating…' : 'Create token'}
		</button>
		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
	</form>

	{#if token}
		<section class="card result" aria-live="polite">
			<h2>Token for {token}</h2>
			<p>Valid until {expiresLabel}. The same name can be issued again to start a new 2 hours.</p>
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
