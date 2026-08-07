import type { Knex } from 'knex';

/**
 * Password is now collected on the verification page instead of at
 * registration, so pending rows no longer carry a hashed password.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('pending_tenant_registrations', (table) => {
		table.dropColumn('passphrase');
		table.dropColumn('keycode');
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('pending_tenant_registrations', (table) => {
		table.string('passphrase', 500).nullable();
		table.string('keycode', 500).nullable();
	});
}
