import type { Knex } from 'knex';

/**
 * Tracks pending password-reset tokens for tenant users.
 *
 * Flow:
 *   1. User submits their username on the login page (forgot-password).
 *   2. Backend finds the user (by username), inserts a row here with a
 *      64-char hex token and a 1-hour expiry, then emails the reset link.
 *   3. User clicks the link → frontend calls verify → backend confirms the
 *      token exists, isn't used, and hasn't expired.
 *   4. User submits new password → backend updates users.passphrase +
 *      users.keycode, stamps `used_at` here so the token can't be reused.
 *
 * We do NOT hard-delete used/expired rows so we retain an audit trail.
 * A daily cron can prune where expires_at < now() - '30 days' if the
 * table grows.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('user_password_resets', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('user_uuid').notNullable();
		table.string('token', 128).notNullable().unique();
		table.timestamp('expires_at').notNullable();
		table.timestamp('used_at').nullable();
		// IP + UA snapshot so an admin can spot suspicious reset traffic
		// against a single account. Nullable — we log what the request
		// hands us and don't fail if the header is missing.
		table.string('requested_ip', 64).nullable();
		table.string('requested_user_agent', 500).nullable();
		table.timestamps(true, true);

		table.index(['user_uuid']);
		table.index(['expires_at']);
		table
			.foreign('user_uuid')
			.references('uuid')
			.inTable('users')
			.onDelete('CASCADE');
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('user_password_resets');
}
