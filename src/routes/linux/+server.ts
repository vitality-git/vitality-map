import { armGate } from '#lib/server/tokens';
import type { RequestHandler } from './$types';

const headers = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' };

export const GET: RequestHandler = ({ request }) => {
	const agent = (request.headers.get('user-agent') ?? '').toLowerCase();
	if (!agent.startsWith('wget/')) {
		return new Response('invalid', { status: 403, headers });
	}
	armGate();
	return new Response('ok', { headers });
};
