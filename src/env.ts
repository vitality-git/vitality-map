import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	PUBLIC_GOOGLE_MAPS_API_KEY: {
		public: true,
		schema: (value: string | undefined) => value?.trim() ?? ''
	},
	PUBLIC_GOOGLE_MAPS_MAP_ID: {
		public: true,
		schema: (value: string | undefined) => value?.trim() || 'DEMO_MAP_ID'
	},
	MINT_SECRET: {
		public: false,
		description: 'Secret for /api/mint. Tokens created there last 2 hours.',
		schema: (value: string | undefined) => value?.trim() ?? ''
	}
});
