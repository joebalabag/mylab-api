import type { Knex } from 'knex';

/**
 * Backfill grants for the per-report access rows added in seed
 * 04_seed_access_templates (navigation_id 400–411). Reports were previously
 * ungated — every authenticated user could see every report page. This
 * migration onboards existing tenants to the new fine-grained model without
 * silently locking anyone out on upgrade.
 *
 * Rule: grant every report row to any user who already has the Dashboard
 * grant (navigation_id 300). Dashboard is the closest analog — an overview /
 * management page — so users trusted with the dashboard are trusted with
 * reports. Cashiers / medtechs typically don't hold the dashboard row and so
 * won't receive report access; admins can assign specific report rows to
 * them via the User Access page later.
 *
 * Idempotent — skips users who already have the target navigation_id.
 */
const REPORT_NAV_IDS = [400, 401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411];

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
		created_by: 'migration:20260925000100',
	});
	return true;
}

export async function up(knex: Knex): Promise<void> {
	const templates = await knex('access_templates')
		.whereIn('navigation_id', REPORT_NAV_IDS)
		.select('*');
	if (!templates.length) return; // seed hasn't been run yet — nothing to grant.

	const byId = new Map<number, any>();
	for (const t of templates) byId.set(Number(t.navigation_id), t);

	// Users who currently have the Dashboard grant (nav 300, has_access=true).
	const dashboardUsers = await knex('user_accesses')
		.where({ navigation_id: 300, has_access: true })
		.distinct('user_uuid', 'tenant_uuid')
		.select('user_uuid', 'tenant_uuid');

	for (const u of dashboardUsers) {
		for (const navId of REPORT_NAV_IDS) {
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
		.where({ created_by: 'migration:20260925000100' })
		.delete();
}
