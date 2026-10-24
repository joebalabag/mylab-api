import type { Knex } from 'knex';

/**
 * Append-only audit log of public (QR-code) accesses to a finalized lab
 * report. One row is inserted every time the server-rendered public view
 * (/lab-report/public/render?t=<token>) resolves to a real report. Lets
 * the operator see "did the recipient actually view their result" from
 * the Print Preview modal.
 *
 * tenant_uuid is snapshotted so authed listing can filter without a JOIN
 * to lab_reports. FK onDelete=CASCADE on both sides so purging a tenant
 * or voiding + hard-deleting a report cleans up its view history too.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('lab_report_access_logs', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table
			.string('lab_report_uuid')
			.notNullable()
			.references('uuid')
			.inTable('lab_reports')
			.onDelete('CASCADE');
		table
			.string('tenant_uuid')
			.notNullable()
			.references('uuid')
			.inTable('tenants')
			.onDelete('CASCADE');

		table.timestamp('accessed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
		table.string('client_ip', 64).nullable();
		table.string('user_agent', 512).nullable();

		table.index(['lab_report_uuid', 'accessed_at']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('lab_report_access_logs');
}
