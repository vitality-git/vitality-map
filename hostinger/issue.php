<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>Create a 2-hour token</title>
	<style>
		body { margin: 0; min-height: 100vh; display: grid; align-content: center; justify-items: center; gap: 1rem; padding: 2rem 1rem; font-family: "Source Sans 3", system-ui, sans-serif; background: #e9eef3; color: #14233a; }
		.card { width: min(520px, 100%); background: #fff; border: 1px solid #d5dde6; border-radius: 8px; padding: 1.25rem 1.35rem 1.4rem; }
		h1 { margin: 0.35rem 0 0.5rem; color: #0f2744; font-size: 1.45rem; }
		p { color: #5c6b7a; line-height: 1.45; }
		label { display: grid; gap: 0.35rem; margin: 1rem 0; font-size: 0.85rem; font-weight: 600; color: #0f2744; }
		input, textarea { width: 100%; border: 1px solid #d5dde6; border-radius: 6px; padding: 0.55rem 0.65rem; font: inherit; background: #f3f6f9; }
		button { border: 1px solid #1f7a72; background: #1f7a72; color: #fff; border-radius: 6px; padding: 0.45rem 0.75rem; font: inherit; font-weight: 600; cursor: pointer; }
		.error { color: #d64545; font-weight: 600; }
		.token { font-family: ui-monospace, Consolas, monospace; color: #14233a; word-break: break-all; }
		.hidden { display: none; }
	</style>
</head>
<body>
	<form class="card" id="form">
		<p style="font-weight:700;color:#0f2744">Vitality Guard</p>
		<h1>Create a 2-hour token</h1>
		<p>The token opens the city simulation. It stops working two hours after it is created.</p>
		<label>Interviewer name <input type="text" id="name" required placeholder="Maria Lopez" autocomplete="name"></label>
		<label>Mint secret <input type="password" id="secret" required autocomplete="current-password"></label>
		<button type="submit">Create token</button>
		<p class="error hidden" id="error" role="alert"></p>
	</form>
	<section class="card hidden" id="result">
		<h1>Token ready</h1>
		<p id="until"></p>
		<p class="token" id="token"></p>
		<label>Command <textarea id="command" rows="4" readonly></textarea></label>
		<button type="button" id="copy">Copy command</button>
	</section>
	<script>
		const form = document.getElementById('form');
		form.addEventListener('submit', async (event) => {
			event.preventDefault();
			const secret = document.getElementById('secret').value;
			const name = document.getElementById('name').value;
			const error = document.getElementById('error');
			error.classList.add('hidden');
			const res = await fetch('/api/mint.php?format=json&secret=' + encodeURIComponent(secret) + '&name=' + encodeURIComponent(name));
			if (!res.ok) {
				error.textContent = 'That secret was not accepted.';
				error.classList.remove('hidden');
				return;
			}
			const data = await res.json();
			document.getElementById('token').textContent = data.token;
			document.getElementById('command').value = data.command;
			document.getElementById('until').textContent = 'Valid until ' + new Date(data.expiresAt).toLocaleString() + '.';
			document.getElementById('result').classList.remove('hidden');
		});
		document.getElementById('copy').addEventListener('click', async () => {
			await navigator.clipboard.writeText(document.getElementById('command').value);
			document.getElementById('copy').textContent = 'Copied';
		});
	</script>
</body>
</html>
