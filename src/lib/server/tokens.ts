import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FILE = join(process.cwd(), 'data', 'tokens.json');
const HOUR_MS = 60 * 60 * 1000;
const ARM_MS = 60 * 1000;
const MAX_HOURS = 24;

type TokenRecord = { expiresAt: number; armedUntil?: number };
type Store = Record<string, TokenRecord>;

function asRecord(value: unknown): TokenRecord | null {
	if (typeof value === 'number' && Number.isFinite(value)) return { expiresAt: value };
	if (!value || typeof value !== 'object') return null;
	const expiresAt = (value as { expiresAt?: unknown }).expiresAt;
	if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;
	const armedUntil = (value as { armedUntil?: unknown }).armedUntil;
	const record: TokenRecord = { expiresAt };
	if (typeof armedUntil === 'number' && Number.isFinite(armedUntil)) record.armedUntil = armedUntil;
	return record;
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

function saveToken(token: string, expiresAt: number, keepArm: boolean): void {
	const store = readStore();
	const now = Date.now();
	for (const [key, record] of Object.entries(store)) {
		if (record.expiresAt < now) delete store[key];
	}
	const previous = store[token];
	const next: TokenRecord = { expiresAt };
	if (keepArm && previous?.armedUntil && previous.armedUntil > now) next.armedUntil = previous.armedUntil;
	store[token] = next;
	writeStore(store);
}

/** Starts a fresh 1-hour pass for this interviewer name. */
export function mintToken(name: string): { token: string; expiresAt: number } | null {
	const token = interviewerSlug(name);
	if (!token) return null;
	const expiresAt = Date.now() + HOUR_MS;
	saveToken(token, expiresAt, false);
	return { token, expiresAt };
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
	const current = store[token]?.expiresAt ?? 0;
	const expiresAt = (current > now ? current : now) + clampHours(hours) * HOUR_MS;
	saveToken(token, expiresAt, true);
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
	return true;
}

/** curl status checks call this. The verify page is refused until it happens. */
export function armToken(token: string | null): void {
	if (!token || !TOKEN_PATTERN.test(token)) return;
	const store = readStore();
	const record = store[token];
	const now = Date.now();
	if (!record || record.expiresAt < now) return;
	record.armedUntil = now + ARM_MS;
	writeStore(store);
}

/** One browser open after a curl check. A typed verify link has nothing to consume. */
export function consumeArm(token: string | null): boolean {
	if (!token || !TOKEN_PATTERN.test(token)) return false;
	const store = readStore();
	const record = store[token];
	const now = Date.now();
	if (!record || record.expiresAt < now) return false;
	if (!record.armedUntil || record.armedUntil < now) return false;
	delete record.armedUntil;
	writeStore(store);
	return true;
}
