/**
 * IANA timezone helpers shared by the tenant and discount modules.
 *
 * The valid-zone set is built lazily off Node's `Intl.supportedValuesOf`
 * (available on all our supported runtimes) so we don't ship a static list
 * that drifts out of date. Falls back to accepting anything that
 * `Intl.DateTimeFormat` doesn't throw on if `supportedValuesOf` is missing.
 */

export const DEFAULT_TENANT_TIMEZONE = 'Asia/Manila';

let cachedZoneSet: Set<string> | null = null;

function loadZoneSet(): Set<string> | null {
	if (cachedZoneSet) return cachedZoneSet;
	const anyIntl = Intl as any;
	if (typeof anyIntl.supportedValuesOf !== 'function') return null;
	try {
		const zones: string[] = anyIntl.supportedValuesOf('timeZone');
		cachedZoneSet = new Set(zones);
		return cachedZoneSet;
	} catch {
		return null;
	}
}

export function isValidTimezone(tz: unknown): tz is string {
	if (typeof tz !== 'string' || !tz.trim()) return false;
	const zones = loadZoneSet();
	if (zones) return zones.has(tz);
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: tz });
		return true;
	} catch {
		return false;
	}
}

/** Return the input if it's a valid IANA zone, else the platform default. */
export function normalizeTimezone(tz: unknown): string {
	return isValidTimezone(tz) ? (tz as string) : DEFAULT_TENANT_TIMEZONE;
}
