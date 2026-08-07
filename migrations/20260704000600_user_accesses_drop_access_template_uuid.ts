import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('user_accesses', (table) => {
		table.dropColumn('access_template_uuid');
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('user_accesses', (table) => {
		table
			.string('access_template_uuid')
			.nullable()
			.references('uuid')
			.inTable('access_templates')
			.onDelete('SET NULL');
	});
}
