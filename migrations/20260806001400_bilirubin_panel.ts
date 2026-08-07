import type { Knex } from 'knex';

/**
 * Install a "Bilirubin" panel test item (BILI) composed of three components:
 *   Bilirubin Total (BILI-T)   0.20 – 1.20 mg/dL
 *   Bilirubin Direct (BILI-D)  0.00 – 0.30 mg/dL
 *   Bilirubin Indirect (BILI-I) 0.10 – 1.00 mg/dL
 *
 * Idempotent per tenant: skips tenants that already have a BILI test_item.
 * The three legacy single-value rows (BILI-T / BILI-D / BILI-I) are LEFT
 * INTACT — historic payments may reference them and some workflows still
 * bill them individually. If you want to retire them, do it separately after
 * confirming no active data depends on them.
 *
 * Anchors the new panel under the CHEM item_category. When a tenant doesn't
 * have a CHEM category yet the migration skips them; the row will be added
 * automatically the next time they run the pre-loaded catalog import.
 */
export async function up(knex: Knex): Promise<void> {
	const tenants = await knex('tenants').select('uuid');

	for (const t of tenants) {
		const tenant_uuid = t.uuid;

		// Skip if BILI already exists on this tenant.
		const existing = await knex('test_items')
			.where({ tenant_uuid, code: 'BILI' })
			.first('uuid');
		if (existing) continue;

		// Find the CHEM category — required as the parent. Skip tenants that
		// haven't installed it yet.
		const chemCat = await knex('item_categories')
			.where({ tenant_uuid, code: 'CHEM' })
			.first('uuid');
		if (!chemCat) continue;

		// Insert the panel row.
		const [inserted] = await knex('test_items')
			.insert({
				tenant_uuid,
				item_category_uuid: chemCat.uuid,
				code: 'BILI',
				name: 'Bilirubin',
				result_type: 'panel',
				specimen: 'Serum',
				status: 'active',
				price: 0,
				created_by: 'migration:20260806001400',
			})
			.returning('uuid');
		const uuid = typeof inserted === 'object' ? inserted.uuid : inserted;

		// Insert its three components.
		const rows = [
			{ code: 'BILI-T', name: 'Bilirubin Total',    unit_of_measure: 'mg/dL', reference_range: '0.20 – 1.20 mg/dL' },
			{ code: 'BILI-D', name: 'Bilirubin Direct',   unit_of_measure: 'mg/dL', reference_range: '0.00 – 0.30 mg/dL' },
			{ code: 'BILI-I', name: 'Bilirubin Indirect', unit_of_measure: 'mg/dL', reference_range: '0.10 – 1.00 mg/dL' },
		];
		let order = 0;
		for (const c of rows) {
			await knex('test_item_components').insert({
				tenant_uuid,
				test_item_uuid: uuid,
				code: c.code,
				name: c.name,
				unit_of_measure: c.unit_of_measure,
				reference_range: c.reference_range,
				lookup_values: null,
				section: null,
				display_order: order++,
				created_by: 'migration:20260806001400',
			});
		}
	}
}

export async function down(knex: Knex): Promise<void> {
	// Drop the panel + its components for every tenant that has the panel
	// specifically installed by THIS migration. Rows created outside of it
	// stay. `test_item_components` cascades from `test_items` in the schema;
	// if not, we do it manually here for safety.
	const rows = await knex('test_items')
		.where({ code: 'BILI', created_by: 'migration:20260806001400' })
		.select('uuid');
	for (const r of rows) {
		await knex('test_item_components').where({ test_item_uuid: r.uuid }).delete();
		await knex('test_items').where({ uuid: r.uuid }).delete();
	}
}
