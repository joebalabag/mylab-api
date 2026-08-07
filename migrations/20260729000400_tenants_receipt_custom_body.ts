import type { Knex } from 'knex';

/**
 * "Whole-body" receipt customization.
 *
 * The existing `receipt_header` / `receipt_footer` are small free-form text
 * lines that get *appended* to the auto-generated header (store name,
 * address, TIN, etc.) and footer (thank-you line + UUID). Tenants that
 * want a fully-custom receipt — no auto store block at all — flip the
 * corresponding `receipt_use_custom_*` toggle and put their entire
 * multi-line text into `receipt_custom_*`. The renderer then skips the
 * auto sections entirely and prints the custom block as-is.
 *
 * Both toggles default to false so existing tenants keep today's exact
 * receipt layout. `receipt_custom_*` are nullable strings so an operator
 * can flip the toggle on without immediately supplying text (empty +
 * toggle-on means "print nothing there", useful for a footer-off case).
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table.boolean('receipt_use_custom_header').notNullable().defaultTo(false);
		table.text('receipt_custom_header').nullable();
		table.boolean('receipt_use_custom_footer').notNullable().defaultTo(false);
		table.text('receipt_custom_footer').nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table.dropColumn('receipt_custom_footer');
		table.dropColumn('receipt_use_custom_footer');
		table.dropColumn('receipt_custom_header');
		table.dropColumn('receipt_use_custom_header');
	});
}
