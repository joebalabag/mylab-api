import type { Knex } from 'knex';

/**
 * Per-tenant SMTP override so tenants can use their own mailbox (typically
 * a Gmail App Password account) for lab-result emails instead of the
 * platform's default SMTP.
 *
 *   smtp_use_own = false → mailer uses the process-wide SMTP_HOST env config
 *   smtp_use_own = true  → mailer builds a one-off transporter from the
 *                          per-tenant smtp_* columns for every send
 *
 * The password column stores an AES-256-GCM ciphertext (see aes.util.ts),
 * so a raw DB dump doesn't leak plaintext credentials.
 */
export async function up(knex: Knex): Promise<void> {
	const hasUseOwn = await knex.schema.hasColumn('tenants', 'smtp_use_own');
	if (!hasUseOwn) {
		await knex.schema.alterTable('tenants', (table) => {
			table.boolean('smtp_use_own').notNullable().defaultTo(false);
			table.string('smtp_host', 255).nullable();
			table.integer('smtp_port').nullable();
			table.boolean('smtp_secure').notNullable().defaultTo(false);
			table.string('smtp_user', 255).nullable();
			// AES-GCM ciphertext is base64-encoded and always fits in text.
			table.text('smtp_password_enc').nullable();
		});
	}
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table.dropColumn('smtp_use_own');
		table.dropColumn('smtp_host');
		table.dropColumn('smtp_port');
		table.dropColumn('smtp_secure');
		table.dropColumn('smtp_user');
		table.dropColumn('smtp_password_enc');
	});
}
