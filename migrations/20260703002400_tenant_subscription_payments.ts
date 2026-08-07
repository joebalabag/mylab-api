import type { Knex } from 'knex';

/**
 * Tenant uploads proof of payment for a subscription plan. Backend attempts
 * to auto-extract fields from the attached image, then super admin approves
 * or rejects. Approval writes the subscription onto tenants + history.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('tenant_subscription_payments', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');

		table
			.string('subscription_plan_uuid')
			.notNullable()
			.references('uuid')
			.inTable('subscription_plans')
			.onDelete('RESTRICT');
		// Snapshots at upload time (in case plan is later edited)
		table.string('subscription_plan_code', 100).notNullable();
		table.string('subscription_plan_name', 500).notNullable();
		table.integer('subscription_days').notNullable();
		table.decimal('subscription_plan_amount', 14, 4).notNullable().defaultTo(0);

		// Approval workflow
		table.string('payment_status', 50).notNullable().defaultTo('pending'); // pending|approved|rejected

		// Payment details — provided by the tenant or auto-extracted from the attachment
		table.string('payment_reference_number', 255).nullable();
		table.string('payee_account_number', 255).nullable();
		table.string('payment_method', 100).nullable();          // e.g. 'bank_transfer' | 'ewallet' | 'cash_deposit'
		table.string('payment_method_name', 255).nullable();     // e.g. 'BDO' | 'GCash' | 'Maya'
		table.timestamp('payment_datetime').nullable();

		// Audit
		table.string('payment_approved_by_uuid').nullable().references('uuid').inTable('admins').onDelete('SET NULL');
		table.string('payment_approved_by_name', 255).nullable();
		table.timestamp('payment_approved_datetime').nullable();

		table.string('payment_rejected_by_uuid').nullable().references('uuid').inTable('admins').onDelete('SET NULL');
		table.string('payment_rejected_by_name', 255).nullable();
		table.timestamp('payment_rejected_datetime').nullable();
		table.text('rejection_reason').nullable();

		// Uploaded file (served via /public)
		table.string('payment_attachment_file', 1000).nullable();

		// Raw AI extraction result (for audit / re-processing)
		table.jsonb('ai_extraction').nullable();

		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.index(['tenant_uuid', 'payment_status']);
		table.index(['payment_status']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('tenant_subscription_payments');
}
