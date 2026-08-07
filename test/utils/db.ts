import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { Knex } from 'knex';
import { KnexService } from '../../src/knex/knex.service';

export function getKnex(app: INestApplication): Knex {
	return app.get(KnexService).knex;
}

export async function resetTables(app: INestApplication): Promise<void> {
	const k = getKnex(app);
	await k('transaction_lines').del();
	await k('transactions').del();
	await k('held_order_lines').del();
	await k('held_orders').del();
	await k('discounts').del();
	await k('products').del();
	await k('product_categories').del();
	await k('generics').del();
	await k('tenant_subscription_payments').del();
	await k('tenant_subscription_history').del();
	// tenant.current_subscription_plan_uuid FKs subscription_plans (SET NULL),
	// so we can drop plans safely — but do it AFTER wiping payments.
	await k('subscription_plans').del();
	await k('user_password_history').del();
	await k('users').del();
	await k('admin_password_history').del();
	await k('admins').del();
	await k('tenants').del();
}

export async function seedAdmin(
	app: INestApplication,
	overrides: Partial<{ username: string; password: string; name: string; email: string; role: string; status: string }> = {}
): Promise<{ uuid: string; username: string; password: string }> {
	const k = getKnex(app);
	const username = overrides.username ?? 'admin';
	const password = overrides.password ?? 'admin123';
	const salt = await bcrypt.genSalt(10);
	const passphrase = await bcrypt.hash(password, salt);

	const [row] = await k('admins')
		.insert({
			username,
			passphrase,
			keycode: salt,
			name: overrides.name ?? 'Super Admin',
			email: overrides.email ?? `${username}@example.com`,
			role: overrides.role ?? 'super_admin',
			status: overrides.status ?? 'active',
			created_by: 'test',
		})
		.returning(['uuid', 'username']);

	return { uuid: row.uuid, username: row.username, password };
}

export async function seedTenant(
	app: INestApplication,
	overrides: Partial<{ store_code: string; display_name: string; status: string }> = {}
): Promise<{ uuid: string; store_code: string; display_name: string }> {
	const k = getKnex(app);
	const store_code = overrides.store_code ?? 'MAIN-01';
	const display_name = overrides.display_name ?? 'Main Store';
	const [row] = await k('tenants')
		.insert({
			store_code,
			display_name,
			currency: 'PHP',
			country: 'Philippines',
			is_vat_registered: false,
			show_tin_on_receipt: true,
			receipt_show_logo: true,
			status: overrides.status ?? 'active',
			created_by: 'test',
		})
		.returning(['uuid', 'store_code', 'display_name']);

	return { uuid: row.uuid, store_code: row.store_code, display_name: row.display_name };
}

export async function seedUser(
	app: INestApplication,
	tenant_uuid: string,
	overrides: Partial<{ username: string; password: string; name: string; email: string; role: string; status: string }> = {}
): Promise<{ uuid: string; username: string; password: string; tenant_uuid: string }> {
	const k = getKnex(app);
	const username = overrides.username ?? 'jdoe';
	const password = overrides.password ?? 'user1234';
	const salt = await bcrypt.genSalt(10);
	const passphrase = await bcrypt.hash(password, salt);

	const [row] = await k('users')
		.insert({
			tenant_uuid,
			username,
			passphrase,
			keycode: salt,
			name: overrides.name ?? 'John Doe',
			email: overrides.email ?? `${username}@example.com`,
			role: overrides.role ?? 'cashier',
			status: overrides.status ?? 'active',
			created_by: 'test',
		})
		.returning(['uuid', 'username', 'tenant_uuid']);

	return { uuid: row.uuid, username: row.username, tenant_uuid: row.tenant_uuid, password };
}
