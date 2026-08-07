import type { Knex } from 'knex';

/**
 * Store owner / contact person name on the tenant itself so it appears in
 * tenant CRUD responses without a users join. Populated at self-registration
 * from the owner_name field and editable via the tenant update endpoint.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table.string('owner_name', 500).nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table.dropColumn('owner_name');
	});
}
