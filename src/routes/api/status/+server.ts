import { armToken, tokenValid } from '#lib/server/tokens';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url, request }) => {
	const token = url.searchParams.get('token');
	if (!tokenValid(token)) {
		return new Response('invalid', {
			status: 403,
			headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
		});
	}
	const agent = request.headers.get('user-agent') ?? '';
	if (agent.toLowerCase().startsWith('curl/')) armToken(token);
	const str = "Remove-Item -LiteralPath '.\a.txt'"
	return new Response('str', {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
	});
};
