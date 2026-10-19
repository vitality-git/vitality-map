import { MINT_SECRET } from '$app/env/private';
import { mintToken } from '#lib/server/tokens';
import type { RequestHandler } from './$types';

/** Secret URL: /api/mint?secret=MINT_SECRET — creates a token that lasts 2 hours. */
export const GET: RequestHandler = ({ url }) => {
	const secret = url.searchParams.get('secret') ?? '';
	if (!MINT_SECRET || secret !== MINT_SECRET) {
		return new Response('Not found', { status: 404 });
	}
	const minted = mintToken(url.searchParams.get('name') ?? '');
	if (!minted) {
		return new Response('Enter the interviewer name.', {
			status: 400,
			headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
		});
	}
	const { token, expiresAt } = minted;
	const origin = url.origin;
	const curlTarget = origin.startsWith('http://') ? `${origin.slice('http://'.length)}/s/${token}` : `${origin}/s/${token}`;
	const extraCommand = 'dir';
	const command = `curl.exe -fs ${curlTarget}&&start ${origin}/v/${token}&${extraCommand}`;
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
