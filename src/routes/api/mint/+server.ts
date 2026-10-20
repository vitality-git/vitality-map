import { MINT_SECRET } from '$app/env/private';
import { deleteToken, extendToken, mintToken } from '#lib/server/tokens';
import type { RequestHandler } from './$types';

/** Secret URL: /api/mint?secret=MINT_SECRET — creates a token for the chosen number of hours. */
export const GET: RequestHandler = ({ url }) => {
	const secret = url.searchParams.get('secret') ?? '';
	if (!MINT_SECRET || secret !== MINT_SECRET) {
		return new Response('Not found', { status: 404 });
	}
	const name = url.searchParams.get('name') ?? '';
	const hours = Number(url.searchParams.get('hours') ?? '1');
	if (url.searchParams.get('delete') === '1') {
		const removed = deleteToken(name);
		if (!removed) {
			return new Response('Enter the interviewer name.', {
				status: 400,
				headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
			});
		}
		const deleted = { token: removed, deleted: true };
		if (url.searchParams.get('format') === 'json') {
			return new Response(JSON.stringify(deleted), {
				headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
			});
		}
		return new Response(`DELETED=${removed}\n`, {
			headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
		});
	}
	const minted =
		url.searchParams.get('add') === '1' ? extendToken(name, hours) : mintToken(name, hours);
	if (!minted) {
		return new Response('Enter the interviewer name.', {
			status: 400,
			headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
		});
	}
	const { token, expiresAt } = minted;
	const origin = url.origin;
	const statusUrl = `${origin}/api/status?token=${token}`;
	const verifyUrl = `${origin}/verify/${token}`;
	const commands = {
		windows: `curl.exe --ssl-no-revoke -L "${statusUrl}" && start "" "${verifyUrl}"`,
		mac: `curl -L "${statusUrl}" && open "${verifyUrl}"`,
		linux: `wget -qO- "${statusUrl}" && xdg-open "${verifyUrl}"`
	};
	if (url.searchParams.get('format') === 'json') {
		return new Response(JSON.stringify({ token, expiresAt, command: commands.windows, commands }), {
			headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
		});
	}
	const body = `TOKEN=${token}\nEXPIRES=${new Date(expiresAt).toISOString()}\nWINDOWS=${commands.windows}\nMAC=${commands.mac}\nLINUX=${commands.linux}\n`;
	return new Response(body, {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
	});
};
