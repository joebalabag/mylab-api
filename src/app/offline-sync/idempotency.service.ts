import { Injectable } from '@nestjs/common';

import { IdempotencyKey } from './idempotency-key.model';

// Keys expire after 30 days — the max supported offline window. Long enough
// that a late-draining retry still finds its answer; short enough that the
// table doesn't grow unbounded. Cleanup happens in-band on lookup misses.
const IDEMPOTENCY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class IdempotencyService {
	/** Returns the cached snapshot if `key` was seen for this tenant + endpoint. */
	async lookup(
		tenant_uuid: string,
		endpoint: string,
		key: string,
	): Promise<{ status: number; snapshot: unknown } | null> {
		const row = (await IdempotencyKey.query().findOne({ key, tenant_uuid, endpoint })) as
			| IdempotencyKey
			| undefined;
		if (!row) return null;
		if (new Date(row.expires_at) < new Date()) {
			await IdempotencyKey.query().deleteById(row.key);
			return null;
		}
		return { status: row.response_status, snapshot: row.response_snapshot };
	}

	async store(
		tenant_uuid: string,
		endpoint: string,
		key: string,
		snapshot: unknown,
		status = 200,
	): Promise<void> {
		const now = new Date();
		const expires_at = new Date(now.getTime() + IDEMPOTENCY_TTL_MS);
		// Upsert — an idempotency key should only ever be written once per
		// (tenant, endpoint, key). Conflict-on-key means a concurrent retry
		// beat us; that's fine, keep the earlier snapshot.
		await IdempotencyKey.query()
			.insert({
				key,
				tenant_uuid,
				endpoint,
				response_snapshot: snapshot as any,
				response_status: status,
				created_at: now,
				expires_at,
			} as any)
			.onConflict('key')
			.ignore();
	}
}
