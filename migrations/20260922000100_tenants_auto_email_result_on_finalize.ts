import type { Knex } from 'knex';

/**
 * Per-tenant setting for whether Tag as Final auto-sends the finalized
 * lab report PDF to the patient's email on file.
 *
 *   true  → the operator's Tag-as-Final action fires the email as soon
 *           as the report is locked (skipped silently when the patient
 *           has no email on file).
 *   false → email is opt-in only; the operator clicks the "Resend to
 *           patient" button in Print Preview when they want to send.
 *
 * Default = true to preserve behavior for existing tenants that were
 * relying on the auto-send.
 */
export async function up(knex: Knex): Promise<void> {
	const has = await knex.schema.hasColumn('tenants', 'auto_email_result_on_finalize');
	if (!has) {
		await knex.schema.alterTable('tenants', (table) => {
			table.boolean('auto_email_result_on_finalize').notNullable().defaultTo(true);
		});
	}
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table.dropColumn('auto_email_result_on_finalize');
	});
}
