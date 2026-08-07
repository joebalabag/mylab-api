import type { Knex } from 'knex';

/**
 * The doctor signatory belongs on item_group, not item_category. Move the
 * column, taking any existing (never-populated in practice) reference along
 * for safety.
 */
export async function up(knex: Knex): Promise<void> {
	const hasOnGroups = await knex.schema.hasColumn('item_groups', 'signatory_doctor_uuid');
	if (!hasOnGroups) {
		await knex.schema.alterTable('item_groups', (table) => {
			table.string('signatory_doctor_uuid').nullable()
				.references('uuid').inTable('doctors').onDelete('SET NULL');
			table.index(['tenant_uuid', 'signatory_doctor_uuid']);
		});
	}

	// Carry over any pre-existing references from category → group (best effort).
	await knex.raw(`
		UPDATE item_groups ig
		SET signatory_doctor_uuid = ic.signatory_doctor_uuid
		FROM item_categories ic
		WHERE ic.item_group_uuid = ig.uuid
		  AND ic.signatory_doctor_uuid IS NOT NULL
		  AND ig.signatory_doctor_uuid IS NULL
	`);

	const hasOnCats = await knex.schema.hasColumn('item_categories', 'signatory_doctor_uuid');
	if (hasOnCats) {
		// Try to drop the index first (name may vary by knex version — attempt then ignore).
		try {
			await knex.schema.alterTable('item_categories', (table) => {
				table.dropIndex(['tenant_uuid', 'signatory_doctor_uuid']);
			});
		} catch { /* ignore missing-index errors */ }
		await knex.schema.alterTable('item_categories', (table) => {
			table.dropColumn('signatory_doctor_uuid');
		});
	}
}

export async function down(knex: Knex): Promise<void> {
	const hasOnCats = await knex.schema.hasColumn('item_categories', 'signatory_doctor_uuid');
	if (!hasOnCats) {
		await knex.schema.alterTable('item_categories', (table) => {
			table.string('signatory_doctor_uuid').nullable()
				.references('uuid').inTable('doctors').onDelete('SET NULL');
			table.index(['tenant_uuid', 'signatory_doctor_uuid']);
		});
	}
	try {
		await knex.schema.alterTable('item_groups', (table) => {
			table.dropIndex(['tenant_uuid', 'signatory_doctor_uuid']);
		});
	} catch { /* ignore */ }
	await knex.schema.alterTable('item_groups', (table) => {
		table.dropColumn('signatory_doctor_uuid');
	});
}
