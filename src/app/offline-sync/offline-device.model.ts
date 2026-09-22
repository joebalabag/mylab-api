import { Model } from 'objection';

/**
 * Registry of stations that have enabled offline mode for a given user.
 * See migration 20260902000200_offline_devices for column-level rationale.
 */
export class OfflineDevice extends Model {
	static tableName = 'offline_devices';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	user_uuid!: string;

	device_id!: string;
	device_label?: string | null;
	user_agent?: string | null;

	first_enabled_at!: Date;
	last_seen_at?: Date | null;
	last_sync_at?: Date | null;
	revoked_at?: Date | null;
	revoked_by?: string | null;
	revoke_reason?: string | null;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
