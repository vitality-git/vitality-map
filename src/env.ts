import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	MINT_SECRET: {
		public: false,
		description: 'Secret for /api/mint. Tokens created there last 1 hour.',
		schema: (value: string | undefined) => value?.trim() ?? ''
	}
});
