import type { Knex } from 'knex';

/**
 * Two tables that back the offline → online sync path:
 *
 *   idempotency_keys
 *     Dedupe repeated sync attempts. When a station retries the same outbox
 *     entry (flaky connection mid-drain) it sends the same Idempotency-Key
 *     header; the sync controller returns the stored response_snapshot
 *     instead of executing the write twice. Keys expire after 30 days — long
 *     enough to cover the max offline window, short enough to keep the table
 *     small.
 *
 *   sync_outbox_log
 *     Server-side audit trail. For every entry a device syncs we record
 *     which device, which entity, and whether it succeeded. Feeds:
 *       - admin "recent sync activity" panel
 *       - post-mortem when a branch reports missing records
 *       - clock-skew analytics (created_offline_at vs synced_at delta)
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('idempotency_keys', (table) => {
		table.string('key').primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table.string('endpoint', 255).notNullable();
		table.jsonb('response_snapshot').notNullable();
		table.integer('response_status').notNullable();
		table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
		table.timestamp('expires_at', { useTz: true }).notNullable();

		table.index(['tenant_uuid', 'endpoint']);
		table.index(['expires_at']);
	});

	await knex.schema.createTable('sync_outbox_log', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table.string('device_id').notNullable();       // matches offline_devices.device_id
		table.string('user_uuid').nullable();          // may be null if device revoked mid-flight

		table.string('entity_type', 50).notNullable(); // 'patient' | 'patient_case' | 'payment' | 'lab_report'
		table.string('entity_uuid').notNullable();     // client_uuid the device sent
		table.string('server_uuid').nullable();        // resolved server-side uuid (usually == entity_uuid)
		table.string('idempotency_key').nullable();

		table.timestamp('created_offline_at', { useTz: true }).nullable(); // device clock
		table.timestamp('synced_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
		// Convenience column: created_offline_at - synced_at, populated by the
		// sync controller. Lets us bucket by skew without a subquery in reports.
		table.integer('clock_skew_seconds').nullable();

		table.string('status', 20).notNullable();      // 'ok' | 'conflict' | 'error' | 'duplicate'
		table.text('error').nullable();

		table.index(['tenant_uuid', 'device_id', 'synced_at']);
		table.index(['tenant_uuid', 'entity_type', 'entity_uuid']);
		table.index(['tenant_uuid', 'status']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('sync_outbox_log');
	await knex.schema.dropTable('idempotency_keys');
}
