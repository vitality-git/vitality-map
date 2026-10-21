<script lang="ts">
	import { onMount } from 'svelte';

	type LiveToken = { token: string; expiresAt: number; enabled: boolean };
	type Commands = { windows: string; mac: string; linux: string };

	let secret = $state('');
	let interviewer = $state('');
	let hours = $state(1);
	let busy = $state(false);
	let error = $state('');
	let notice = $state('');
	let tokens = $state<LiveToken[]>([]);
	let loaded = $state(false);
	let openToken = $state('');
	let commands = $state<Commands>({ windows: '', mac: '', linux: '' });
	let copied = $state('');
	let now = $state(Date.now());

	const ready = $derived(secret.trim() !== '' && interviewer.trim() !== '');

	onMount(() => {
		const timer = setInterval(() => {
			now = Date.now();
		}, 1000);
		return () => clearInterval(timer);
	});

	function remaining(expiresAt: number): string {
		const ms = expiresAt - now;
		if (ms <= 0) return 'Expired';
		const hoursLeft = Math.floor(ms / 3600000);
		const minutes = Math.floor((ms % 3600000) / 60000);
		const seconds = Math.floor((ms % 60000) / 1000);
		if (hoursLeft > 0) return `${hoursLeft}h ${minutes}m`;
		if (minutes > 0) return `${minutes}m ${seconds}s`;
		return `${seconds}s`;
	}

	function when(ms: number): string {
		return new Date(ms).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	async function callMint(params: URLSearchParams): Promise<Response> {
		params.set('format', 'json');
		params.set('secret', secret);
		return fetch(`/api/mint?${params.toString()}`);
	}

	async function loadTokens(): Promise<void> {
		error = '';
		if (secret.trim() === '') {
			error = 'Enter the mint secret to see the tokens.';
			return;
		}
		busy = true;
		try {
			const res = await callMint(new URLSearchParams({ list: '1' }));
			if (!res.ok) {
				error = 'That secret was not accepted.';
				tokens = [];
				loaded = false;
				return;
			}
			const data = (await res.json()) as { tokens: LiveToken[] };
			tokens = data.tokens;
			loaded = true;
		} catch {
			error = 'The token service did not respond.';
		} finally {
			busy = false;
		}
	}

	function takeList(data: { tokens?: LiveToken[] }): void {
		if (data.tokens) {
			tokens = data.tokens;
			loaded = true;
		}
	}

	async function requestToken(action: 'create' | 'add'): Promise<void> {
		error = '';
		notice = '';
		copied = '';
		busy = true;
		try {
			const params = new URLSearchParams({ name: interviewer, hours: String(hours) });
			if (action === 'add') params.set('add', '1');
			const res = await callMint(params);
			if (res.status === 400) {
				error = 'Enter the interviewer name using letters or numbers.';
				return;
			}
			if (!res.ok) {
				error = 'That secret was not accepted.';
				return;
			}
			const data = (await res.json()) as { token: string; commands: Commands; tokens?: LiveToken[] };
			openToken = data.token;
			commands = data.commands;
			notice =
				action === 'add'
					? `Added ${hours} ${hours === 1 ? 'hour' : 'hours'} to ${data.token}.`
					: `${data.token} is on and lasts ${hours} ${hours === 1 ? 'hour' : 'hours'}.`;
			takeList(data);
		} catch {
			error = 'The token service did not respond.';
		} finally {
			busy = false;
		}
	}

	function createToken(event: SubmitEvent): void {
		event.preventDefault();
		void requestToken('create');
	}

	async function setEnabled(token: string, enabled: boolean): Promise<void> {
		error = '';
		notice = '';
		busy = true;
		try {
			const res = await callMint(new URLSearchParams({ name: token, enabled: enabled ? '1' : '0' }));
			if (!res.ok) {
				error = 'That token could not be changed.';
				return;
			}
			const data = (await res.json()) as { tokens?: LiveToken[] };
			takeList(data);
			notice = enabled ? `${token} shows the simulation.` : `${token} shows the landing page.`;
		} catch {
			error = 'The token service did not respond.';
		} finally {
			busy = false;
		}
	}

	async function removeToken(token: string): Promise<void> {
		error = '';
		notice = '';
		busy = true;
		try {
			const res = await callMint(new URLSearchParams({ name: token, delete: '1' }));
			if (!res.ok) {
				error = 'That token could not be deleted.';
				return;
			}
			const data = (await res.json()) as { tokens?: LiveToken[] };
			takeList(data);
			if (openToken === token) openToken = '';
			notice = `${token} was deleted.`;
		} catch {
			error = 'The token service did not respond.';
		} finally {
			busy = false;
		}
	}

	async function copyCommand(which: keyof Commands): Promise<void> {
		await navigator.clipboard.writeText(commands[which]);
		copied = which;
	}
</script>

<svelte:head>
	<title>Token controls</title>
</svelte:head>

<main class="issue">
	<div class="left">
	<section class="card">
		<p class="brand">Vitality Guard</p>
		<h1>Token controls</h1>
		<p class="lead">
			The list on the right shows every live token, the time left, and Activate, Deactivate, or Remove.
		</p>
		<label>
			Mint secret
			<input type="password" name="secret" autocomplete="current-password" bind:value={secret} />
		</label>
		<button class="btn btn-primary" type="button" disabled={busy || secret.trim() === ''} onclick={loadTokens}>
			{busy ? 'Working…' : 'Show live tokens'}
		</button>
		{#if error}
			<p class="error" role="alert">{error}</p>
		{/if}
		{#if notice}
			<p class="notice" role="status">{notice}</p>
		{/if}
	</section>

	<form class="card" onsubmit={createToken}>
		<h2>Create or extend</h2>
		<label>
			Interviewer name
			<input type="text" name="interviewer" autocomplete="name" required placeholder="Maria Lopez" bind:value={interviewer} />
		</label>
		<label>
			Hours
			<input type="number" name="hours" min="1" max="24" step="1" bind:value={hours} />
		</label>
		<div class="actions">
			<button class="btn btn-primary" type="submit" disabled={busy || !ready}>Create token</button>
			<button class="btn" type="button" disabled={busy || !ready} onclick={() => requestToken('add')}>Add hours</button>
		</div>
	</form>

	{#if openToken}
		<section class="card">
			<h2>Commands for {openToken}</h2>
			<p>These check the token, then open the simulation.</p>
			{#each [['windows', 'Windows'], ['mac', 'Mac'], ['linux', 'Linux']] as [key, label] (key)}
				<label>
					{label}
					<textarea readonly rows="3">{commands[key as keyof Commands]}</textarea>
				</label>
				<button class="btn" type="button" onclick={() => copyCommand(key as keyof Commands)}>
					{copied === key ? 'Copied' : `Copy ${label}`}
				</button>
			{/each}
		</section>
	{/if}
	</div>

	<aside class="card side" aria-live="polite">
		<h2>Live tokens <span class="count">{loaded ? tokens.length : '—'}</span></h2>
		{#if !loaded}
			<p>Enter the mint secret, then show the list.</p>
		{:else if tokens.length === 0}
			<p>No live tokens.</p>
		{:else}
			<ul class="token-list">
				{#each tokens as item (item.token)}
					<li class:off={!item.enabled}>
						<div class="token-main">
							<p class="token">{item.token}</p>
							<p class="remain">{remaining(item.expiresAt)} left</p>
							<p class="meta">{item.enabled ? 'Simulation' : 'Landing page'} · until {when(item.expiresAt)}</p>
						</div>
						<div class="row-actions">
							<button class="btn good" type="button" disabled={busy || item.enabled} onclick={() => setEnabled(item.token, true)}>
								Activate
							</button>
							<button class="btn" type="button" disabled={busy || !item.enabled} onclick={() => setEnabled(item.token, false)}>
								Deactivate
							</button>
							<button class="btn danger" type="button" disabled={busy} onclick={() => removeToken(item.token)}>
								Remove
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</aside>
</main>

<style>
	.issue {
		min-height: 100dvh;
		display: grid;
		grid-template-columns: minmax(280px, 1fr) minmax(320px, 1fr);
		align-items: start;
		gap: 1rem;
		padding: 1.25rem;
	}

	.left {
		display: grid;
		gap: 1rem;
		min-width: 0;
	}

	.side {
		position: sticky;
		top: 1rem;
	}

	.card {
		width: 100%;
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
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.count {
		font-size: 0.8rem;
		background: var(--vg-panel-soft);
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
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

	.notice {
		color: var(--vg-teal);
		font-weight: 600;
	}

	.token-list {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.65rem;
	}

	.remain {
		margin: 0.2rem 0 0;
		color: var(--vg-navy);
		font-weight: 700;
	}

	.row-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.65rem;
	}

	.good {
		background: var(--vg-teal);
		border-color: var(--vg-teal);
		color: #fff;
	}

	.good:disabled,
	.btn:disabled {
		opacity: 0.45;
		cursor: default;
	}

	.token-list li {
		display: block;
		border: 1px solid var(--vg-line);
		border-radius: 8px;
		padding: 0.75rem;
		background: #f4fbf8;
	}

	.token-list li.off {
		background: var(--vg-panel-soft);
	}

	.token-main {
		min-width: 0;
	}

	.token {
		margin: 0;
		font-family: ui-monospace, Consolas, monospace;
		color: var(--vg-ink);
		word-break: break-all;
		font-weight: 700;
	}

	.meta {
		margin: 0.15rem 0 0;
		font-size: 0.85rem;
	}

	.switch {
		min-width: 9.5rem;
		border-radius: 999px;
		border: 1px solid var(--vg-line);
		background: #fff;
		color: var(--vg-navy);
		font: inherit;
		font-weight: 700;
		padding: 0.55rem 0.8rem;
		cursor: pointer;
	}

	.switch.on {
		background: var(--vg-teal);
		border-color: var(--vg-teal);
		color: #fff;
	}

	.danger {
		background: #fff;
		color: var(--vg-alert);
		border-color: #f0c2c2;
	}

	@media (max-width: 860px) {
		.issue {
			grid-template-columns: 1fr;
		}

		.side {
			position: static;
		}
	}
</style>
