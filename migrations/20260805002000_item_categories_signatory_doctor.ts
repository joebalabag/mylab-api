import type { Knex } from 'knex';

/**
 * Optional per-category signatory. When a lab report is created / finalized
 * from a test under this category, the pathologist snapshot is auto-filled
 * from this doctor (name, license, e-signature).
 *
 * SET NULL on delete — removing a doctor doesn't cascade-drop the category,
 * it just clears the reference and the operator picks a new one on the next
 * finalize.
 */
export async function up(knex: Knex): Promise<void> {
	const has = await knex.schema.hasColumn('item_categories', 'signatory_doctor_uuid');
	if (!has) {
		await knex.schema.alterTable('item_categories', (table) => {
			table.string('signatory_doctor_uuid').nullable()
				.references('uuid').inTable('doctors').onDelete('SET NULL');
			table.index(['tenant_uuid', 'signatory_doctor_uuid']);
		});
	}
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('item_categories', (table) => {
		table.dropIndex(['tenant_uuid', 'signatory_doctor_uuid']);
		table.dropColumn('signatory_doctor_uuid');
	});
}
