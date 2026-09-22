import type { Knex } from 'knex';

/**
 * One row per station (browser install) that has enabled offline mode for a
 * given user. `device_id` is generated on the client the first time the user
 * hits "Enable offline mode" and stored in IndexedDB; every subsequent
 * offline-token issuance is scoped to that device_id.
 *
 * We don't hard-lock a tenant to specific devices — a user can enable offline
 * on any laptop they log into. The table exists so admins can:
 *   - see which stations have offline mode active
 *   - revoke a stolen/decommissioned station (sets revoked_at, invalidates
 *     the offline JWT on next refresh)
 *   - correlate sync_outbox_log entries back to a device_label
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('offline_devices', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table.string('user_uuid').notNullable().references('uuid').inTable('users').onDelete('CASCADE');

		// Client-generated UUID stored on the device. Unique per tenant so a
		// user re-enabling on the same device reuses the same row.
		table.string('device_id').notNullable();
		table.string('device_label', 255).nullable();      // e.g. "Front counter laptop"
		table.string('user_agent', 500).nullable();        // captured at enable time for debugging

		table.timestamp('first_enabled_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
		table.timestamp('last_seen_at',    { useTz: true }).nullable();
		table.timestamp('last_sync_at',    { useTz: true }).nullable();
		table.timestamp('revoked_at',      { useTz: true }).nullable();
		table.string('revoked_by', 255).nullable();
		table.string('revoke_reason', 255).nullable();

		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.unique(['tenant_uuid', 'device_id']);
		table.index(['tenant_uuid', 'user_uuid']);
		table.index(['tenant_uuid', 'revoked_at']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('offline_devices');
}
