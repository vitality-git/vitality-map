import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = join(process.cwd(), 'data', 'tokens.json');
const GATE_FILE = join(process.cwd(), 'data', 'gate.json');
const HOUR_MS = 60 * 60 * 1000;
const ARM_MS = 60 * 1000;
const MAX_HOURS = 24;

type Store = Record<string, number>;

function readStore(): Store {
	try {
		return JSON.parse(readFileSync(FILE, 'utf8')) as Store;
	} catch {
		return {};
	}
}

function writeStore(store: Store): void {
	mkdirSync(join(process.cwd(), 'data'), { recursive: true });
	writeFileSync(FILE, JSON.stringify(store));
}

const TOKEN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;

export function interviewerSlug(name: string): string | null {
	const token = name
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (token.length < 2 || !TOKEN_PATTERN.test(token)) return null;
	return token;
}

export function clampHours(value: number): number {
	if (!Number.isFinite(value)) return 1;
	return Math.min(MAX_HOURS, Math.max(1, Math.floor(value)));
}

function saveToken(token: string, expiresAt: number): void {
	const store = readStore();
	const now = Date.now();
	for (const [key, exp] of Object.entries(store)) {
		if (exp < now) delete store[key];
	}
	store[token] = expiresAt;
	writeStore(store);
}

/** Starts a fresh pass for this interviewer name. Hours are chosen on the issue page. */
export function mintToken(name: string, hours = 1): { token: string; expiresAt: number } | null {
	const token = interviewerSlug(name);
	if (!token) return null;
	const expiresAt = Date.now() + clampHours(hours) * HOUR_MS;
	saveToken(token, expiresAt);
	return { token, expiresAt };
}

/** Removes this interviewer pass, live or expired. */
export function deleteToken(name: string): string | null {
	const token = interviewerSlug(name);
	if (!token) return null;
	const store = readStore();
	delete store[token];
	writeStore(store);
	return token;
}

/** Adds hours onto a live pass. An expired or missing pass starts from now. */
export function extendToken(
	name: string,
	hours: number
): { token: string; expiresAt: number } | null {
	const token = interviewerSlug(name);
	if (!token) return null;
	const store = readStore();
	const now = Date.now();
	const current = store[token] ?? 0;
	const expiresAt = (current > now ? current : now) + clampHours(hours) * HOUR_MS;
	saveToken(token, expiresAt);
	return { token, expiresAt };
}

export function tokenValid(token: string | null): boolean {
	if (!token || !TOKEN_PATTERN.test(token)) return false;
	const store = readStore();
	const expiresAt = store[token];
	if (!expiresAt || expiresAt < Date.now()) {
		if (expiresAt) {
			delete store[token];
			writeStore(store);
		}
		return false;
	}
	return true;
}

/** The OS command calls this for one exact token. Other names stay closed. */
export function armGate(token: string): void {
	mkdirSync(join(process.cwd(), 'data'), { recursive: true });
	writeFileSync(GATE_FILE, JSON.stringify({ token, until: Date.now() + ARM_MS }));
}

/** One browser open for this exact token. A different name, or no command, fails. */
export function consumeGate(token: string): boolean {
	let until = 0;
	let armed = '';
	try {
		const parsed = JSON.parse(readFileSync(GATE_FILE, 'utf8')) as { token?: unknown; until?: unknown };
		if (typeof parsed.until === 'number') until = parsed.until;
		if (typeof parsed.token === 'string') armed = parsed.token;
	} catch {
		until = 0;
	}
	if (armed !== token || until < Date.now()) return false;
	writeFileSync(GATE_FILE, JSON.stringify({ token: '', until: 0 }));
	return true;
}
