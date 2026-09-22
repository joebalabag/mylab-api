import { Model } from 'objection';

/**
 * Dedupe cache for sync retries. See migration
 * 20260902000300_sync_infrastructure.
 */
export class IdempotencyKey extends Model {
	static tableName = 'idempotency_keys';
	static idColumn = 'key';

	key!: string;
	tenant_uuid!: string;
	endpoint!: string;
	response_snapshot!: unknown;
	response_status!: number;
	created_at!: Date;
	expires_at!: Date;
}
