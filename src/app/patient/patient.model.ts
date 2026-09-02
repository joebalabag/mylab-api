import { Model } from 'objection';

export type PatientSex = 'M' | 'F';

export class Patient extends Model {
	static tableName = 'patients';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;

	// Identity
	patient_number!: string;
	first_name!: string;
	middle_name?: string | null;
	last_name!: string;
	suffix?: string | null;
	sex!: PatientSex;
	birthdate?: Date | string | null;
	civil_status?: string | null;
	nationality?: string | null;

	// Contact
	contact_number?: string | null;
	email?: string | null;
	address_street1?: string | null;
	address_street2?: string | null;
	city?: string | null;
	province?: string | null;
	postal_code?: string | null;
	country?: string | null;

	// Medical
	blood_type?: string | null;
	allergies?: string | null;
	notes?: string | null;

	// PH IDs
	senior_citizen_number?: string | null;
	pwd_number?: string | null;
	national_id?: string | null;

	// Emergency contact
	emergency_contact_name?: string | null;
	emergency_contact_relation?: string | null;
	emergency_contact_number?: string | null;

	// Billing / referral
	philhealth_number?: string | null;
	company?: string | null;
	referring_physician?: string | null;

	// Other
	occupation?: string | null;

	status!: string;

	// Offline-sync fields. See migration 20260902000100.
	client_uuid?: string | null;
	created_offline_at?: Date | null;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
