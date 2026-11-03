import { promises as dns } from 'dns';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MX_TTL_MS = 60 * 60 * 1000;
const DNS_TIMEOUT_MS = 2000;

const mxCache = new Map<string, { ok: boolean; expires: number }>();

export function isSyntacticallyValidEmail(email: string): boolean {
	return EMAIL_RE.test(email);
}

export async function hasDeliverableMx(email: string): Promise<boolean> {
	if (!isSyntacticallyValidEmail(email)) return false;
	const domain = email.split('@')[1].toLowerCase();

	const cached = mxCache.get(domain);
	if (cached && cached.expires > Date.now()) return cached.ok;

	const ok = await resolveMxWithTimeout(domain);
	mxCache.set(domain, { ok, expires: Date.now() + MX_TTL_MS });
	return ok;
}

async function resolveMxWithTimeout(domain: string): Promise<boolean> {
	try {
		const records = await Promise.race([
			dns.resolveMx(domain),
			new Promise<never>((_, rej) =>
				setTimeout(() => rej(new Error('dns-timeout')), DNS_TIMEOUT_MS),
			),
		]);
		// RFC 7505: a single MX with an empty exchange ("null MX") means
		// the domain explicitly refuses mail — treat as undeliverable.
		if (records.length === 1 && records[0].exchange === '') return false;
		return records.length > 0;
	} catch {
		// ENOTFOUND / ENODATA / timeout → undeliverable. Biased toward
		// blocking to protect sender reputation; flip if transient DNS
		// failures cause meaningful false-positives in practice.
		return false;
	}
}
