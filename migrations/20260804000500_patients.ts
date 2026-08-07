import type { Knex } from 'knex';

/**
 * Patient master record — permanent (not transactional). One row per human;
 * the app searches by first+last name (soft-match) before Add to steer users
 * away from creating duplicates.
 *
 * patient_number (MRN) is generated server-side per tenant as `P-NNNNNN`,
 * serialized by a per-tenant advisory lock inside the create transaction.
 */
export async function up(knex: Knex): Promise<void> {
	await knex.schema.createTable('patients', (table) => {
		table.string('uuid').defaultTo(knex.raw('uuid_generate_v4()')).primary();
		table.string('tenant_uuid').notNullable().references('uuid').inTable('tenants').onDelete('CASCADE');

		// Identity
		table.string('patient_number', 50).notNullable();
		table.string('first_name', 255).notNullable();
		table.string('middle_name', 255).nullable();
		table.string('last_name', 255).notNullable();
		table.string('suffix', 20).nullable();
		table.string('sex', 10).notNullable();
		table.date('birthdate').nullable();
		table.string('civil_status', 30).nullable();
		table.string('nationality', 100).nullable().defaultTo('Filipino');

		// Contact
		table.string('contact_number', 50).nullable();
		table.string('email', 255).nullable();
		table.string('address_street1', 500).nullable();
		table.string('address_street2', 500).nullable();
		table.string('city', 255).nullable();
		table.string('province', 255).nullable();
		table.string('postal_code', 50).nullable();
		table.string('country', 100).nullable().defaultTo('Philippines');

		// Medical
		table.string('blood_type', 10).nullable();
		table.text('allergies').nullable();
		table.text('notes').nullable();

		// PH IDs
		table.string('senior_citizen_number', 50).nullable();
		table.string('pwd_number', 50).nullable();
		table.string('national_id', 50).nullable();

		// Emergency contact
		table.string('emergency_contact_name', 255).nullable();
		table.string('emergency_contact_relation', 100).nullable();
		table.string('emergency_contact_number', 50).nullable();

		// Billing / referral
		table.string('philhealth_number', 50).nullable();
		table.string('company', 255).nullable();
		table.string('referring_physician', 255).nullable();

		// Other
		table.string('occupation', 255).nullable();

		// System
		table.string('status', 50).notNullable().defaultTo('active');
		table.string('created_by', 255).nullable();
		table.string('updated_by', 255).nullable();
		table.timestamps(true, true);

		table.unique(['tenant_uuid', 'patient_number']);
		table.index(['tenant_uuid', 'status']);
		table.index(['tenant_uuid', 'last_name', 'first_name']);
		table.index(['tenant_uuid', 'national_id']);
	});
}

export async function down(knex: Knex): Promise<void> {
	await knex.schema.dropTable('patients');
}
