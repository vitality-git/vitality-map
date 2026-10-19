const FIRST = [
	'Alea', 'Bruno', 'Carla', 'Diego', 'Elena', 'Felipe', 'Greta', 'Hugo', 'Inés', 'Javier',
	'Klara', 'Luis', 'Marta', 'Nico', 'Olivia', 'Pablo', 'Quinn', 'Rosa', 'Sofía', 'Tomás',
	'Úrsula', 'Vega', 'Walter', 'Xenia', 'Yago', 'Zoe', 'Álvaro', 'Beatriz', 'César', 'Diana'
];

const LAST = [
	'Alonso', 'Blanco', 'Cortés', 'Delgado', 'Espina', 'Ferrer', 'García', 'Herrera', 'Ibáñez',
	'Jiménez', 'López', 'Morales', 'Navarro', 'Ortega', 'Prieto', 'Ruiz', 'Sanz', 'Torres',
	'Vega', 'Walsh', 'Nieto', 'Campos', 'Ramos', 'Soler', 'Molina'
];

export function fictionalName(seedIndex: number): string {
	const first = FIRST[seedIndex % FIRST.length];
	const last = LAST[Math.floor(seedIndex / FIRST.length) % LAST.length];
	return `${first} ${last}`;
}
