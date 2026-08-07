import type { Knex } from 'knex';

/**
 * Line items on a requisition. Polymorphic source: a line can bill either a
 * single test_item or a bundled item_package. We do NOT enforce a FK on the
 * polymorphic source_uuid because a single column can't reference two tables;
 * the service validates that the uuid resolves to the claimed source_type at
 * write time.
 *
 * code/name/unit_price are snapshotted at add time so pricing changes on the
 * source catalog don't rewrite a patient's historical bill. line_total is
 * unit_price × quantity, materialized so lists don't have to compute it.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('patient_requisition_items', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');
		table
			.string('patient_requisition_uuid')
			.notNullable()
			.references('uuid')
			.inTable('patient_requisitions')
			.onDelete('CASCADE');

		// 'test_item' | 'item_package' — checked constraint below.
		table.string('source_type', 30).notNullable();
		table.string('source_uuid').notNullable();

		// Snapshotted for historical accuracy.
		table.string('code', 100).notNullable();
		table.string('name', 500).notNullable();
		table.decimal('unit_price', 14, 2).notNullable().defaultTo(0);
		table.integer('quantity').notNullable().defaultTo(1);
		table.decimal('line_total', 14, 2).notNullable().defaultTo(0);

		table.integer('display_order').notNullable().defaultTo(0);

		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.index(['tenant_uuid']);
		table.index(['patient_requisition_uuid', 'display_order']);
		table.index(['source_type', 'source_uuid']);
	});

	await knex.raw(`
		ALTER TABLE patient_requisition_items
		ADD CONSTRAINT patient_requisition_items_source_type_check
		CHECK (source_type IN ('test_item','item_package'))
	`);
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('patient_requisition_items');
}
