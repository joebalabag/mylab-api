import type { Knex } from 'knex';

/**
 * Insert the Audit Log access_templates row (navigation_id 500) and grant it
 * to every existing admin-role user so the Admin → Audit Logs sidebar entry
 * appears for them on first reload after this upgrade.
 *
 * Non-admin users do NOT get the grant — the audit log is sensitive and
 * tenants may want to restrict it; admins can hand it out individually from
 * the User Access page.
 *
 * Idempotent — skips rows that already exist.
 */
const ROW = {
	navigation_id: 500,
	catalog_id: 1,
	catalog: 'administration',
	main_navigation: 'audit log',
	sub_navigation: 'all-access',
	remarks: 'View the tenant-scoped audit log — who did what, when, including auth events and record changes.',
};

export async function up(knex: Knex): Promise<void> {
	const existingTemplate = await knex('access_templates')
		.where({
			catalog: ROW.catalog,
			main_navigation: ROW.main_navigation,
			sub_navigation: ROW.sub_navigation,
		})
		.first('uuid');
	if (!existingTemplate) {
		await knex('access_templates').insert({ ...ROW, has_access: false, created_by: 'migration:20261103000200' });
	}

	const admins = await knex('users')
		.whereRaw('LOWER(role) = ?', ['admin'])
		.select('uuid', 'tenant_uuid');

	for (const u of admins) {
		const existingGrant = await knex('user_accesses')
			.where({ user_uuid: u.uuid, navigation_id: ROW.navigation_id })
			.first('uuid');
		if (existingGrant) continue;

		await knex('user_accesses').insert({
			tenant_uuid: u.tenant_uuid,
			user_uuid: u.uuid,
			navigation_id: ROW.navigation_id,
			catalog_id: ROW.catalog_id,
			catalog: ROW.catalog,
			main_navigation: ROW.main_navigation,
			sub_navigation: ROW.sub_navigation,
			remarks: ROW.remarks,
			has_access: true,
			created_by: 'migration:20261103000200',
		});
	}
}

export async function down(knex: Knex): Promise<void> {
	await knex('user_accesses').where({ created_by: 'migration:20261103000200' }).delete();
	await knex('access_templates')
		.where({
			catalog: ROW.catalog,
			main_navigation: ROW.main_navigation,
			sub_navigation: ROW.sub_navigation,
			created_by: 'migration:20261103000200',
		})
		.delete();
}
