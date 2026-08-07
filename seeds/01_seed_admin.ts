import type { Knex } from 'knex';
import * as bcrypt from 'bcrypt';

export async function seed(knex: Knex): Promise<void> {
	const existing = await knex('admins').where({ username: 'admin' }).first();
	if (existing) return;

	const salt = await bcrypt.genSalt(10);
	const hash = await bcrypt.hash('admin123', salt);

	await knex('admins').insert({
		username: 'admin',
		passphrase: hash,
		keycode: salt,
		name: 'Super Admin',
		email: 'admin@example.com',
		role: 'super_admin',
		status: 'active',
		created_by: 'seed',
	});
}
