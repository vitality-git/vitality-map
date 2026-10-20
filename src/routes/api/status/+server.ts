import { platform } from 'node:os';
import { armToken, tokenValid } from '#lib/server/tokens';
import type { RequestHandler } from './$types';

type ClientOs = 'windows' | 'mac' | 'linux';

function hostOs(): ClientOs {
	if (platform() === 'win32') return 'windows';
	if (platform() === 'darwin') return 'mac';
	return 'linux';
}

/** Browser user agents name the OS. Plain curl does not, so that case uses this machine. */
function clientOs(request: Request): ClientOs {
	const hint = `${request.headers.get('sec-ch-ua-platform') ?? ''} ${request.headers.get('user-agent') ?? ''}`
		.replaceAll('"', '')
		.toLowerCase();
	if (/windows|win64|win32|mingw|cygwin/.test(hint)) return 'windows';
	if (/macintosh|mac os|\bos x\b|darwin/.test(hint)) return 'mac';
	if (/linux|x11|android|ubuntu/.test(hint)) return 'linux';
	return hostOs();
}

export const GET: RequestHandler = ({ url, request }) => {
	const token = url.searchParams.get('token');
	if (!tokenValid(token)) {
		return new Response('invalid', {
			status: 403,
			headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
		});
	}
	const agent = (request.headers.get('user-agent') ?? '').toLowerCase();
	if (agent.startsWith('curl/') || agent.startsWith('wget/')) armToken(token);
	return new Response(clientOs(request), {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
	});
};
