import type { Knex } from 'knex';

/**
 * Registration form now collects address (city/province/country) and no
 * longer collects store_code, legal_name, currency, or a separate username —
 * contact_email doubles as the login username, and store_code is generated
 * server-side. Drops the now-unused columns from pending_tenant_registrations.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('pending_tenant_registrations', (table) => {
		table.string('city', 200).nullable();
		table.string('province', 200).nullable();
		table.string('country', 100).nullable();
	});

	// Drop old columns that the form no longer collects. Existing pending rows
	// will lose the data — acceptable because verification tokens live only 24h.
	await knex.schema.alterTable('pending_tenant_registrations', (table) => {
		table.dropColumn('store_code');
		table.dropColumn('legal_name');
		table.dropColumn('currency');
		table.dropColumn('username');
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('pending_tenant_registrations', (table) => {
		table.string('store_code', 100).nullable();
		table.string('legal_name', 500).nullable();
		table.string('currency', 10).nullable().defaultTo('PHP');
		table.string('username', 100).nullable();
	});
	await knex.schema.alterTable('pending_tenant_registrations', (table) => {
		table.dropColumn('city');
		table.dropColumn('province');
		table.dropColumn('country');
	});
}
