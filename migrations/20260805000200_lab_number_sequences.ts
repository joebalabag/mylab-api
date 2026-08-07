import type { Knex } from 'knex';

/**
 * Per-tenant, per-year running counter for lab_number generation. The
 * lab-report service takes an advisory lock keyed on (tenant, year), upserts
 * this row incrementing next_value, then formats L-YYYY-NNNNNN. Kept as a
 * dedicated table (rather than a MAX() scan of lab_reports) so number
 * assignment stays cheap regardless of report volume, and the counter
 * survives if a report row is later hard-deleted.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('lab_number_sequences', (table) => {
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table.integer('year').notNullable();
		table.integer('next_value').notNullable().defaultTo(1);
		table.timestamps(true, true);

		table.primary(['tenant_uuid', 'year']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('lab_number_sequences');
}
