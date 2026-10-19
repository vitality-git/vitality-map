const FEMALE_FIRST = new Set([
	'Alea',
	'Carla',
	'Elena',
	'Greta',
	'Inés',
	'Klara',
	'Marta',
	'Olivia',
	'Rosa',
	'Sofía',
	'Úrsula',
	'Vega',
	'Xenia',
	'Zoe',
	'Beatriz',
	'Diana'
]);

/** Photographic placeholder portrait. The demo name is fictional and is not this person’s name. */
export function portraitUrl(firstName: string, sequence: number): string {
	const folder = FEMALE_FIRST.has(firstName) ? 'women' : 'men';
	const n = ((sequence % 100) + 100) % 100;
	return `/portraits/med/${folder}/${n}.jpg`;
}
