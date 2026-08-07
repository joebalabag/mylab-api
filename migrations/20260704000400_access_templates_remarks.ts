import type { Knex } from 'knex';

/**
 * Human-readable description of what each permission node grants.
 * Rendered in the "Assign access" UI so the admin knows what they're toggling.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('access_templates', (table) => {
		table.text('remarks').nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('access_templates', (table) => {
		table.dropColumn('remarks');
	});
}
