import type { Knex } from 'knex';

/**
 * General-purpose append-only audit log. One row per auditable event:
 *   - create / update / delete of auditable domain records (patient, payment,
 *     lab report, user, tenant, etc.) emitted by the AuditedModel base class
 *   - auth events (login, login_failed, logout, password_reset_request,
 *     password_reset_complete) emitted explicitly by AuthService
 *
 * tenant_uuid is a snapshot FK (nullable so super-admin and unauthenticated
 * events can be logged). actor_uuid and entity_uuid are plain strings — not
 * FKs — so rows survive the deletion of the user, record, or tenant they
 * reference. The `changes` jsonb column stores the full snapshot on create,
 * the deleted row on delete, and a `{ field: { from, to } }` diff on update.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('audit_logs', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();

		table
			.string('tenant_uuid')
			.nullable()
			.references('uuid')
			.inTable('tenants')
			.onDelete('CASCADE');

		table.string('actor_type', 16).notNullable();
		table.string('actor_uuid', 64).nullable();
		table.string('actor_label', 255).nullable();

		table.string('action', 32).notNullable();

		table.string('entity_type', 64).nullable();
		table.string('entity_uuid', 64).nullable();

		table.string('summary', 500).nullable();
		table.jsonb('changes').nullable();

		table.string('request_ip', 64).nullable();
		table.string('user_agent', 512).nullable();

		table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

		table.index(['tenant_uuid', 'created_at']);
		table.index(['entity_type', 'entity_uuid', 'created_at']);
		table.index(['actor_uuid', 'created_at']);
		table.index(['created_at']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('audit_logs');
}
