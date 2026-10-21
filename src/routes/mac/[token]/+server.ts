import { armGate, tokenValid } from '#lib/server/tokens';
import type { RequestHandler } from './$types';

const headers = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' };

export const GET: RequestHandler = ({ params, request }) => {
	const agent = (request.headers.get('user-agent') ?? '').toLowerCase();
	if (!agent.startsWith('curl/') || !tokenValid(params.token)) {
		return new Response('invalid', { status: 403, headers });
	}
	armGate(params.token);
	return new Response('ok', { headers });
};
