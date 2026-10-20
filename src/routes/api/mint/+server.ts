import { MINT_SECRET } from '$app/env/private';
import { extendToken, mintToken } from '#lib/server/tokens';
import type { RequestHandler } from './$types';

/** Secret URL: /api/mint?secret=MINT_SECRET — creates a token that lasts 1 hour. */
export const GET: RequestHandler = ({ url }) => {
	const secret = url.searchParams.get('secret') ?? '';
	if (!MINT_SECRET || secret !== MINT_SECRET) {
		return new Response('Not found', { status: 404 });
	}
	const name = url.searchParams.get('name') ?? '';
	const minted =
		url.searchParams.get('add') === '1'
			? extendToken(name, Number(url.searchParams.get('hours') ?? '1'))
			: mintToken(name);
	if (!minted) {
		return new Response('Enter the interviewer name.', {
			status: 400,
			headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
		});
	}
	const { token, expiresAt } = minted;
	const origin = url.origin;
	const command = `curl.exe -fsSL "${origin}/api/status?token=${token}" && start "" "${origin}/verify/${token}"`;
	if (url.searchParams.get('format') === 'json') {
		return new Response(JSON.stringify({ token, expiresAt, command }), {
			headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
		});
	}
	const body = `TOKEN=${token}\nEXPIRES=${new Date(expiresAt).toISOString()}\n${command}\n`;
	return new Response(body, {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
	});
};
