<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Create a 1-hour token</title>
	<style>
		body { margin: 0; min-height: 100vh; display: grid; align-content: center; justify-items: center; gap: 1rem; padding: 2rem 1rem; font-family: "Source Sans 3", system-ui, sans-serif; background: #e9eef3; color: #14233a; }
		.card { width: min(720px, 100%); background: #fff; border: 1px solid #d5dde6; border-radius: 8px; padding: 1.25rem 1.35rem 1.4rem; }
		h1 { margin: 0.35rem 0 0.5rem; color: #0f2744; font-size: 1.45rem; }
		p { color: #5c6b7a; line-height: 1.45; }
		label { display: grid; gap: 0.35rem; margin: 1rem 0; font-size: 0.85rem; font-weight: 600; color: #0f2744; }
		input, textarea { width: 100%; border: 1px solid #d5dde6; border-radius: 6px; padding: 0.55rem 0.65rem; font: inherit; background: #f3f6f9; }
		button { border: 1px solid #1f7a72; background: #1f7a72; color: #fff; border-radius: 6px; padding: 0.45rem 0.75rem; font: inherit; font-weight: 600; cursor: pointer; }
		.actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
		.error { color: #d64545; font-weight: 600; }
		.token { font-family: ui-monospace, Consolas, monospace; color: #14233a; word-break: break-all; }
		.hidden { display: none; }
	</style>
</head>
<body>
	<form class="card" id="form">
		<p style="font-weight:700;color:#0f2744">Vitality Guard</p>
		<h1>Create a token</h1>
		<p>The pass is the interviewer’s name. Set how many hours it lasts, add more time, or delete it.</p>
		<label>Interviewer name <input type="text" id="name" required placeholder="Maria Lopez" autocomplete="name"></label>
		<label>Mint secret <input type="password" id="secret" required autocomplete="current-password"></label>
		<label>Lifetime in hours <input type="number" id="hours" min="1" max="24" step="1" value="1"></label>
		<div class="actions">
			<button type="submit">Create token</button>
			<button type="button" id="add">Add time</button>
			<button type="button" id="delete">Delete token</button>
		</div>
		<p class="error hidden" id="error" role="alert"></p>
	</form>
	<section class="card hidden" id="result">
		<h1>Token ready</h1>
		<p id="until"></p>
		<p class="token" id="token"></p>
		<div id="commands">
			<p>Run the command for that computer. It checks the token, then opens the simulation.</p>
			<label>Windows <textarea id="windows" rows="3" readonly></textarea></label>
			<button type="button" data-copy="windows">Copy Windows command</button>
			<label>Mac <textarea id="mac" rows="3" readonly></textarea></label>
			<button type="button" data-copy="mac">Copy Mac command</button>
			<label>Linux <textarea id="linux" rows="3" readonly></textarea></label>
			<button type="button" data-copy="linux">Copy Linux command</button>
		</div>
	</section>
	<script>
		async function requestToken(action) {
			const secret = document.getElementById('secret').value;
			const name = document.getElementById('name').value;
			const hours = document.getElementById('hours').value || '1';
			const error = document.getElementById('error');
			error.classList.add('hidden');
			let url = '/api/mint.php?format=json&secret=' + encodeURIComponent(secret) + '&name=' + encodeURIComponent(name) + '&hours=' + encodeURIComponent(hours);
			if (action === 'add') url += '&add=1';
			if (action === 'delete') url += '&delete=1';
			const res = await fetch(url);
			if (!res.ok) {
				error.textContent = res.status === 400 ? 'Enter the interviewer name using letters or numbers.' : 'That secret was not accepted.';
				error.classList.remove('hidden');
				return;
			}
			const data = await res.json();
			document.getElementById('token').textContent = data.token;
			const commands = document.getElementById('commands');
			if (action === 'delete') {
				document.getElementById('until').textContent = data.token + ' is deleted.';
				commands.classList.add('hidden');
			} else {
				const extra = action === 'add' ? ' Added ' + hours + ' hour(s).' : ' This pass lasts ' + hours + ' hour(s).';
				document.getElementById('until').textContent = 'Valid until ' + new Date(data.expiresAt).toLocaleString() + '.' + extra;
				document.getElementById('windows').value = data.commands.windows;
				document.getElementById('mac').value = data.commands.mac;
				document.getElementById('linux').value = data.commands.linux;
				commands.classList.remove('hidden');
			}
			document.getElementById('result').classList.remove('hidden');
		}
		document.getElementById('form').addEventListener('submit', (event) => {
			event.preventDefault();
			requestToken('create');
		});
		document.getElementById('add').addEventListener('click', () => requestToken('add'));
		document.getElementById('delete').addEventListener('click', () => requestToken('delete'));
		document.querySelectorAll('[data-copy]').forEach((button) => {
			button.addEventListener('click', async () => {
				const which = button.getAttribute('data-copy');
				await navigator.clipboard.writeText(document.getElementById(which).value);
				button.textContent = 'Copied';
			});
		});
	</script>
</body>
</html>
