import type { Knex } from 'knex';
import { seedStandardCatalogForTenant } from '../src/common/seed/standard-catalog';

/**
 * Manual seed — installs the standard laboratory catalog (groups + categories
 * + test items + components + matrix configs) into every existing tenant.
 * Idempotent: safe to run repeatedly, existing rows are skipped.
 */
export async function seed(knex: Knex): Promise<void> {
	const tenants = await knex('tenants').select('uuid', 'display_name');
	for (const t of tenants) {
		await knex.transaction(async (trx) => {
			const out = await seedStandardCatalogForTenant(trx, t.uuid, 'system-seed');
			// Log per-tenant so failures are easy to attribute.
			// eslint-disable-next-line no-console
			console.log(
				`[standard-catalog] tenant=${t.display_name} (${t.uuid.slice(0, 8)}) ` +
				`categories+=${out.categoriesCreated} test_items+=${out.testItemsCreated}`,
			);
		});
	}
}
