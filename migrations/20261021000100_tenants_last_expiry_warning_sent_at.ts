import type { Knex } from 'knex';

/**
 * Tracks when the near-expiry warning email was last sent to a tenant owner.
 * Compared against current_subscription_start so a renewal (which bumps
 * subscription_start forward) naturally re-arms the warning for the next
 * cycle without needing a separate reset step.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table.timestamp('last_expiry_warning_sent_at').nullable();
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('tenants', (table) => {
		table.dropColumn('last_expiry_warning_sent_at');
	});
}
