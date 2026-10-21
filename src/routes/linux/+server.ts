import type { RequestHandler } from './$types';

const headers = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' };

export const GET: RequestHandler = () => new Response('invalid', { status: 403, headers });
