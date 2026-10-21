import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = join(process.cwd(), 'data', 'tokens.json');
const GATE_FILE = join(process.cwd(), 'data', 'gate.json');
const HOUR_MS = 60 * 60 * 1000;
const ARM_MS = 60 * 1000;
const MAX_HOURS = 24;

type TokenRecord = { expiresAt: number; enabled: boolean };
type Store = Record<string, TokenRecord>;

export type LiveToken = { token: string; expiresAt: number; enabled: boolean };

function asRecord(value: unknown): TokenRecord | null {
	if (typeof value === 'number' && Number.isFinite(value)) return { expiresAt: value, enabled: true };
	if (!value || typeof value !== 'object') return null;
	const expiresAt = (value as { expiresAt?: unknown }).expiresAt;
	if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;
	return { expiresAt, enabled: (value as { enabled?: unknown }).enabled !== false };
}

function readStore(): Store {
	try {
		const raw = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, unknown>;
		const store: Store = {};
		for (const [key, value] of Object.entries(raw)) {
			const record = asRecord(value);
			if (record) store[key] = record;
		}
		return store;
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

function saveToken(token: string, expiresAt: number, enabled = true): void {
	const store = readStore();
	const now = Date.now();
	for (const [key, record] of Object.entries(store)) {
		if (record.expiresAt < now) delete store[key];
	}
	store[token] = { expiresAt, enabled };
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
	const current = store[token];
	const base = current && current.expiresAt > now ? current.expiresAt : now;
	const expiresAt = base + clampHours(hours) * HOUR_MS;
	saveToken(token, expiresAt, current?.enabled !== false);
	return { token, expiresAt };
}

export function tokenValid(token: string | null): boolean {
	if (!token || !TOKEN_PATTERN.test(token)) return false;
	const store = readStore();
	const record = store[token];
	if (!record || record.expiresAt < Date.now()) {
		if (record) {
			delete store[token];
			writeStore(store);
		}
		return false;
	}
	return record.enabled;
}

/** Live passes, including ones switched off. Expired names are removed. */
export function listTokens(): LiveToken[] {
	const store = readStore();
	const now = Date.now();
	let dirty = false;
	for (const [key, record] of Object.entries(store)) {
		if (record.expiresAt < now) {
			delete store[key];
			dirty = true;
		}
	}
	if (dirty) writeStore(store);
	return Object.entries(store)
		.map(([token, record]) => ({ token, expiresAt: record.expiresAt, enabled: record.enabled }))
		.sort((a, b) => a.token.localeCompare(b.token));
}

/** Off shows the landing page. On shows the simulation. */
export function setTokenEnabled(name: string, enabled: boolean): LiveToken | null {
	const token = interviewerSlug(name);
	if (!token) return null;
	const store = readStore();
	const record = store[token];
	if (!record || record.expiresAt < Date.now()) return null;
	record.enabled = enabled;
	writeStore(store);
	return { token, expiresAt: record.expiresAt, enabled };
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
