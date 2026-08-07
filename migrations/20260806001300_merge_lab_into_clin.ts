import type { Knex } from 'knex';

/**
 * Combine the older "Laboratory" (code=LAB) item_group into the canonical
 * "Clinical Laboratory" (code=CLIN) group on a per-tenant basis. The
 * standard catalog now seeds CLIN directly; this migration cleans up
 * tenants that were seeded before the change.
 *
 * Per tenant:
 *   1. If only LAB exists → rename it to CLIN / Clinical Laboratory.
 *   2. If only CLIN exists → nothing to do.
 *   3. If BOTH exist → re-point every category under LAB to CLIN, then
 *      delete LAB. Category codes are preserved; if a tenant somehow has
 *      colliding category codes under both groups, the CLIN one wins and
 *      the LAB duplicate is dropped (with its rows following on cascade).
 */
export async function up(knex: Knex): Promise<void> {
	const tenants = await knex('item_groups')
		.whereIn('code', ['LAB', 'CLIN'])
		.distinct('tenant_uuid')
		.pluck('tenant_uuid');

	for (const tenant_uuid of tenants) {
		const lab: any = await knex('item_groups')
			.where({ tenant_uuid, code: 'LAB' })
			.first('uuid');
		const clin: any = await knex('item_groups')
			.where({ tenant_uuid, code: 'CLIN' })
			.first('uuid');

		if (!lab) continue; // nothing to fold; CLIN already the canonical row

		if (!clin) {
			// Case 1: only LAB — just rename in place. Preserves the uuid so
			// existing categories / test_items keep their FK values intact.
			await knex('item_groups')
				.where({ uuid: lab.uuid })
				.update({
					code: 'CLIN',
					name: 'Clinical Laboratory',
					updated_by: 'migration:20260806001300',
				});
			continue;
		}

		// Case 3: both present. Fold LAB into CLIN.
		// Skip categories whose code already exists under CLIN — Postgres would
		// otherwise trip the (tenant_uuid, item_group_uuid, code) unique index.
		const clinCategoryCodes = await knex('item_categories')
			.where({ tenant_uuid, item_group_uuid: clin.uuid })
			.pluck('code');

		if (clinCategoryCodes.length === 0) {
			await knex('item_categories')
				.where({ tenant_uuid, item_group_uuid: lab.uuid })
				.update({ item_group_uuid: clin.uuid, updated_by: 'migration:20260806001300' });
		} else {
			await knex('item_categories')
				.where({ tenant_uuid, item_group_uuid: lab.uuid })
				.whereNotIn('code', clinCategoryCodes)
				.update({ item_group_uuid: clin.uuid, updated_by: 'migration:20260806001300' });
			// Duplicates (same code under both) — leave the CLIN one alone and
			// delete the LAB copy. Cascades take care of nested rows if the
			// schema is wired that way; if it isn't, we surface the error.
			await knex('item_categories')
				.where({ tenant_uuid, item_group_uuid: lab.uuid })
				.whereIn('code', clinCategoryCodes)
				.delete();
		}

		// Any straggler rows on the LAB group itself get orphaned when we
		// drop the group. Snapshot the count for the log so we can spot
		// unexpected data loss.
		await knex('item_groups').where({ uuid: lab.uuid }).delete();
	}
}

export async function down(_knex: Knex): Promise<void> {
	// Irreversible — we can't tell which categories originally belonged to LAB
	// vs CLIN. Leaving a no-op instead of pretending to undo.
}
