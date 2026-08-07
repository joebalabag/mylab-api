import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('tenants', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();

		table.string('display_name', 500).notNullable();
		table.string('legal_name', 500).nullable();
		table.string('store_code', 100).notNullable();
		table.string('branch', 255).nullable();
		table.string('terminal_id', 100).nullable();
		table.string('currency', 10).notNullable().defaultTo('PHP');
		table.string('company_logo', 1000).nullable();

		table.string('address_street1', 500).nullable();
		table.string('address_street2', 500).nullable();
		table.string('city', 255).nullable();
		table.string('province', 255).nullable();
		table.string('postal_code', 50).nullable();
		table.string('country', 100).nullable().defaultTo('Philippines');

		table.string('contact_number', 100).nullable();
		table.string('email_address', 255).nullable();
		table.string('website', 500).nullable();

		table.string('tin_number', 100).nullable();
		table.boolean('is_vat_registered').notNullable().defaultTo(false);
		table.boolean('show_tin_on_receipt').notNullable().defaultTo(true);

		table.text('receipt_header').nullable();
		table.text('receipt_footer').nullable();
		table.boolean('receipt_show_logo').notNullable().defaultTo(true);

		table.string('status', 50).notNullable().defaultTo('active');
		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.unique(['store_code', 'terminal_id']);
		table.index(['status']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('tenants');
}
