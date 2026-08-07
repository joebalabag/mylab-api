import type { Knex } from 'knex';
import * as bcrypt from 'bcrypt';

const TENANT_DISPLAY_NAME = 'Joebalabag Laboratory';
const TENANT_STORE_CODE = 'JB-LAB';
const ADMIN_USERNAME = 'cadmin';
const ADMIN_PASSWORD = 'admin123';

/**
 * Seeds "Joebalabag Laboratory" and its tenant admin (cadmin / admin123).
 * Also mirrors every access-template row into user_accesses with has_access=true
 * so cadmin can open every module in the sidebar out of the box.
 * The subscription expiry is set 100 years out so SubscriptionGuard never blocks it.
 */
export async function seed(knex: Knex): Promise<void> {
	// ─── Tenant ───────────────────────────────────────────────────────
	let tenant = await knex('tenants').where({ store_code: TENANT_STORE_CODE }).first();
	if (!tenant) {
		const farFutureExpiry = new Date();
		farFutureExpiry.setFullYear(farFutureExpiry.getFullYear() + 100);

		const [inserted] = await knex('tenants')
			.insert({
				display_name: TENANT_DISPLAY_NAME,
				legal_name: TENANT_DISPLAY_NAME,
				owner_name: 'Joe Balabag',
				store_code: TENANT_STORE_CODE,
				branch: 'Main Branch',
				terminal_id: '01',
				currency: 'PHP',
				country: 'Philippines',
				timezone: 'Asia/Manila',
				is_vat_registered: false,
				show_tin_on_receipt: false,
				receipt_show_logo: false,
				receipt_use_custom_header: false,
				receipt_use_custom_footer: false,
				current_subscription_expiry: farFutureExpiry,
				current_subscription_plan_amount: 0,
				status: 'active',
				created_by: 'seed',
			})
			.returning('*');
		tenant = inserted;
	}

	// ─── Admin user (cadmin) ──────────────────────────────────────────
	let user = await knex('users').where({ username: ADMIN_USERNAME }).first();
	if (!user) {
		const salt = await bcrypt.genSalt(10);
		const hash = await bcrypt.hash(ADMIN_PASSWORD, salt);

		const [inserted] = await knex('users')
			.insert({
				tenant_uuid: tenant.uuid,
				username: ADMIN_USERNAME,
				passphrase: hash,
				keycode: salt,
				name: 'Clinic Admin',
				email: 'admin@joebalabag.lab',
				role: 'admin',
				status: 'active',
				created_by: 'seed',
			})
			.returning('*');
		user = inserted;
	}

	// ─── Grant every current access-template row to cadmin ────────────
	const templates = await knex('access_templates').select(
		'navigation_id',
		'catalog_id',
		'catalog',
		'main_navigation',
		'sub_navigation',
		'remarks',
	);

	for (const t of templates) {
		const existing = await knex('user_accesses')
			.where({
				user_uuid: user.uuid,
				main_navigation: t.main_navigation,
				sub_navigation: t.sub_navigation,
			})
			.first();
		if (existing) {
			if (!existing.has_access) {
				await knex('user_accesses')
					.where({ uuid: existing.uuid })
					.update({ has_access: true, updated_by: 'seed' });
			}
			continue;
		}
		await knex('user_accesses').insert({
			tenant_uuid: tenant.uuid,
			user_uuid: user.uuid,
			navigation_id: t.navigation_id,
			catalog_id: t.catalog_id,
			catalog: t.catalog,
			main_navigation: t.main_navigation,
			sub_navigation: t.sub_navigation,
			remarks: t.remarks,
			has_access: true,
			created_by: 'seed',
		});
	}
}
