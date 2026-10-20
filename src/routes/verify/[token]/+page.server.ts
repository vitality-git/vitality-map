import { consumeArm } from '#lib/server/tokens';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	if (!consumeArm(params.token)) {
		redirect(302, '/');
	}
	return { token: params.token };
};
