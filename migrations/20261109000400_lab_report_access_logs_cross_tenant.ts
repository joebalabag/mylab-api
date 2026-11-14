import type { Knex } from 'knex';

/**
 * Phase 3 — Branch result search.
 *
 * Augments lab_report_access_logs so cross-branch reads (a lab user from
 * tenant A pulling a FINAL report from tenant B, both owned by the same
 * owner) are visible in the audit trail.
 *
 *   accessed_from_tenant_uuid — the caller's HOME tenant. NULL when the
 *                                access is public (QR scan) or same-tenant.
 *   cross_tenant              — convenience flag so the UI/query can show
 *                                the "accessed from another branch" badge
 *                                without joining back to the report's tenant.
 *
 * Both columns are nullable/default so existing rows don't need a backfill.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.alterTable('lab_report_access_logs', (table) => {
		table.string('accessed_from_tenant_uuid').nullable();
		table.boolean('cross_tenant').notNullable().defaultTo(false);

		table
			.foreign('accessed_from_tenant_uuid')
			.references('uuid')
			.inTable('tenants')
			.onDelete('SET NULL');

		table.index(['cross_tenant']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.alterTable('lab_report_access_logs', (table) => {
		table.dropForeign(['accessed_from_tenant_uuid']);
		table.dropIndex(['cross_tenant']);
		table.dropColumn('cross_tenant');
		table.dropColumn('accessed_from_tenant_uuid');
	});
}
