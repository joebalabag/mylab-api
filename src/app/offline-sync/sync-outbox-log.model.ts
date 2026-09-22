import { Model } from 'objection';

/**
 * Server-side audit trail of every sync attempt. Populated by the sync
 * controller in Phase 2. See migration 20260902000300_sync_infrastructure.
 */
export class SyncOutboxLog extends Model {
	static tableName = 'sync_outbox_log';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	device_id!: string;
	user_uuid?: string | null;

	entity_type!: 'patient' | 'patient_case' | 'payment' | 'lab_report';
	entity_uuid!: string;
	server_uuid?: string | null;
	idempotency_key?: string | null;

	created_offline_at?: Date | null;
	synced_at!: Date;
	clock_skew_seconds?: number | null;

	status!: 'ok' | 'conflict' | 'error' | 'duplicate';
	error?: string | null;
}
