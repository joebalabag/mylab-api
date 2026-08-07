import type { Knex } from 'knex';

/**
 * Expense entries logged against a tenant. Captures the operator who logged
 * it (user_uuid + snapshot), the operating date, category, amount, and a
 * status lifecycle (active | void). Voiding is preserved with an audit trail;
 * hard delete is also available for accidental entries.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('expenses', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');

		// Logged-by — SET NULL on user delete; snapshot columns survive.
		table.string('user_uuid').nullable().references('uuid').inTable('users').onDelete('SET NULL');
		table.string('cashier_name', 255).nullable();
		table.string('cashier_username', 255).nullable();

		table.date('date_transact').notNullable();
		table.string('category', 100).notNullable();
		table.string('description', 500).notNullable();
		table.decimal('amount', 14, 4).notNullable().defaultTo(0);
		table.text('notes').nullable();

		// 'active' | 'void'
		table.string('status', 50).notNullable().defaultTo('active');

		table.timestamp('voided_at').nullable();
		table.string('voided_by_uuid').nullable().references('uuid').inTable('users').onDelete('SET NULL');
		table.string('voided_by_name', 255).nullable();
		table.text('void_reason').nullable();

		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.index(['tenant_uuid', 'date_transact']);
		table.index(['tenant_uuid', 'user_uuid']);
		table.index(['tenant_uuid', 'category']);
		table.index(['tenant_uuid', 'status']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('expenses');
}
