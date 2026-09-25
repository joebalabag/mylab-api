/**
 * Small helpers to pull the caller's IP and User-Agent off an Express
 * request in a way that survives nginx / proxy in front. Kept out of the
 * interceptor and controller so both share one source of truth.
 */

/**
 * Best-effort client IP. Prefers the leftmost entry of X-Forwarded-For
 * (set by nginx / any well-behaved reverse proxy), then falls back to
 * Express's req.ip, then the raw socket peer. IPv4-mapped IPv6 prefix
 * (`::ffff:`) is stripped so the display reads as a plain dotted quad.
 *
 * NOTE: We do not toggle Express's `trust proxy` here — that would change
 * how req.ip resolves everywhere in the app, which is a bigger blast
 * radius than a monitoring panel warrants. We just read the header
 * ourselves.
 */
export function extractClientIp(req: any): string | undefined {
	const raw =
		firstForwarded(req?.headers?.['x-forwarded-for']) ||
		(typeof req?.ip === 'string' ? req.ip : undefined) ||
		req?.socket?.remoteAddress ||
		req?.connection?.remoteAddress;
	if (!raw) return undefined;
	const trimmed = String(raw).trim();
	if (!trimmed) return undefined;
	return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
}

function firstForwarded(header: unknown): string | undefined {
	if (!header) return undefined;
	const raw = Array.isArray(header) ? header[0] : String(header);
	const first = String(raw).split(',')[0]?.trim();
	return first || undefined;
}

/**
 * Trim absurdly long UA strings so a rogue client can't bloat the
 * in-memory presence map. Real browsers stay well under 512 chars.
 */
export function extractUserAgent(req: any): string | undefined {
	const raw = req?.headers?.['user-agent'];
	if (!raw) return undefined;
	const s = String(raw);
	return s.length > 512 ? s.slice(0, 512) : s;
}
