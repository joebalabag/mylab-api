import type { Knex } from 'knex';

/**
 * Public self-registration captures the browser's resolved timezone so the
 * tenant provisioned on verify inherits the correct zone. Nullable because
 * the client hint may be missing or invalid; the verify step falls back to
 * the platform default.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('pending_tenant_registrations', (table) => {
		table.string('timezone', 64).nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('pending_tenant_registrations', (table) => {
		table.dropColumn('timezone');
	});
}
