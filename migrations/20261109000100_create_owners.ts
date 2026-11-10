import type { Knex } from 'knex';

/**
 * Multi-tenant branch feature — Phase 1 schema.
 *
 * Owners are a new identity type sitting alongside admins and users. An
 * owner has no `tenant_uuid` — they're scoped by the owner_tenants join
 * (one tenant may have at most one owner; one owner may have many tenants).
 *
 * Shape mirrors `admins`: username is globally unique and lowercased on
 * insert (service layer), passphrase + keycode hold the bcrypt hash + salt,
 * status gates login. See
 * laboratory/docs/superpowers/specs/2026-11-09-multi-tenant-print-design.md.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('owners', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('username', 255).notNullable().unique();
		table.string('passphrase', 500).notNullable();
		table.string('keycode', 500).notNullable();
		table.string('name', 500).notNullable();
		table.string('business_name', 500).nullable();
		table.string('email', 255).nullable();
		table.string('phone', 64).nullable();
		// Data URL or public asset URL for the owner's logo. Rendered in the
		// Owner Console sidebar banner and (optionally) on printed branch
		// reports. Nullable; frontend falls back to default MyLab branding.
		table.text('logo_url').nullable();
		table.timestamp('last_logindate').nullable();
		table.string('status', 50).notNullable().defaultTo('active');
		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamp('change_password_datetime').nullable();
		table.string('change_password_by', 255).nullable();
		table.timestamps(true, true);

		table.index(['status']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('owners');
}
