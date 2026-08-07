import type { Knex } from 'knex';

/**
 * Backfill grants for the fine-grained access-template rows that were added
 * after most tenants had already been provisioned. Rules:
 *
 *   • Every existing user_accesses row is keyed by (user_uuid, navigation_id).
 *   • For each new template row we insert a matching user_accesses grant
 *     when the target user ALREADY has a grant for the parent module
 *     (matched by main_navigation).
 *
 * Specific rules:
 *   Cashier fine-grained (nav 210–213)     → granted to users with ANY
 *                                             main_navigation='cashier' grant.
 *   Laboratory fine-grained (nav 220–226)  → granted to users with ANY
 *                                             main_navigation='laboratory' grant.
 *   Dashboard (nav 300) + Setup Readiness
 *   (nav 301)                              → granted to EVERY user with any
 *                                             existing grant (they were
 *                                             provisioned through the normal
 *                                             flow — they should see the
 *                                             top-level overview pages).
 *
 * Idempotent — skips users who already have the target navigation_id.
 * Note: the model tableName is `user_accesses` (plural), not `user_access`.
 */
const CASHIER_NEW    = [210, 211, 212, 213];
const LABORATORY_NEW = [220, 221, 222, 223, 224, 225, 226];
const TOP_LEVEL_NEW  = [300, 301];

async function grantIfMissing(
	knex: Knex,
	user: { uuid: string; tenant_uuid: string },
	template: any,
): Promise<boolean> {
	const existing = await knex('user_accesses')
		.where({ user_uuid: user.uuid, navigation_id: template.navigation_id })
		.first('uuid');
	if (existing) return false;
	await knex('user_accesses').insert({
		tenant_uuid: user.tenant_uuid,
		user_uuid: user.uuid,
		navigation_id: template.navigation_id,
		catalog_id: template.catalog_id,
		catalog: template.catalog,
		main_navigation: template.main_navigation,
		sub_navigation: template.sub_navigation,
		remarks: template.remarks ?? null,
		has_access: true,
		created_by: 'migration:20260806001600',
	});
	return true;
}

export async function up(knex: Knex): Promise<void> {
	const templates = await knex('access_templates')
		.whereIn('navigation_id', [...CASHIER_NEW, ...LABORATORY_NEW, ...TOP_LEVEL_NEW])
		.select('*');
	if (!templates.length) return; // seed hasn't been run yet — nothing to grant.

	const byId = new Map<number, any>();
	for (const t of templates) byId.set(Number(t.navigation_id), t);

	// Rule 1 & 2 — users with a parent-module grant get the new fine-grained rows.
	for (const [moduleName, navList] of [
		['cashier',    CASHIER_NEW]    as const,
		['laboratory', LABORATORY_NEW] as const,
	]) {
		const parents = await knex('user_accesses')
			.where({ main_navigation: moduleName, has_access: true })
			.distinct('user_uuid', 'tenant_uuid')
			.select('user_uuid', 'tenant_uuid');
		for (const p of parents) {
			for (const navId of navList) {
				const tpl = byId.get(navId);
				if (!tpl) continue;
				await grantIfMissing(knex, { uuid: p.user_uuid, tenant_uuid: p.tenant_uuid }, tpl);
			}
		}
	}

	// Rule 3 — Dashboard + Setup Readiness go to every user that has any grant.
	const everyGranted = await knex('user_accesses')
		.where({ has_access: true })
		.distinct('user_uuid', 'tenant_uuid')
		.select('user_uuid', 'tenant_uuid');
	for (const u of everyGranted) {
		for (const navId of TOP_LEVEL_NEW) {
			const tpl = byId.get(navId);
			if (!tpl) continue;
			await grantIfMissing(knex, { uuid: u.user_uuid, tenant_uuid: u.tenant_uuid }, tpl);
		}
	}
}

export async function down(knex: Knex): Promise<void> {
	// Only revoke rows this migration inserted — leaves manually-granted rows
	// with the same navigation_id alone via the created_by stamp.
	await knex('user_accesses')
		.where({ created_by: 'migration:20260806001600' })
		.delete();
}
