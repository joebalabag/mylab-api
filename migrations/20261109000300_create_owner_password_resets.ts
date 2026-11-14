import type { Knex } from 'knex';

/**
 * Mirrors user_password_resets but keyed to owners. Separate table instead
 * of a polymorphic column so FK constraints stay simple and the mailer
 * can key off a single columnist contract.
 *
 * Flow (identical to user reset):
 *   1. Super-admin or owner hits "forgot password" → we insert a row with
 *      a 64-char hex token and 1-hour expiry, then email the reset link.
 *   2. Owner clicks the link → frontend calls verify → backend confirms
 *      token exists, isn't used, hasn't expired.
 *   3. Owner submits new password → we update owners.passphrase +
 *      owners.keycode, stamp used_at here so the token can't be reused.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('owner_password_resets', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('owner_uuid').notNullable();
		table.string('token', 128).notNullable().unique();
		table.timestamp('expires_at').notNullable();
		table.timestamp('used_at').nullable();
		table.string('requested_ip', 64).nullable();
		table.string('requested_user_agent', 500).nullable();
		table.timestamps(true, true);

		table.index(['owner_uuid']);
		table.index(['expires_at']);
		table
			.foreign('owner_uuid')
			.references('uuid')
			.inTable('owners')
			.onDelete('CASCADE');
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('owner_password_resets');
}
