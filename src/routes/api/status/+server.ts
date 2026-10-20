import { tokenValid } from '#lib/server/tokens';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	const token = url.searchParams.get('token');
	if (!tokenValid(token)) {
		return new Response('invalid', {
			status: 403,
			headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
		});
	}
	return new Response('ok', {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
	});
};
