import { Model } from 'objection';

export const CASE_TYPES = ['OPD', 'IPD', 'ER'] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_STATUSES = ['open', 'closed', 'cancelled'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export class PatientCase extends Model {
	static tableName = 'patient_cases';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	patient_uuid!: string;

	case_number!: string;
	case_type!: CaseType;

	admission_date!: Date;
	discharge_date?: Date | null;

	chief_complaint?: string | null;
	attending_physician?: string | null;
	referring_physician?: string | null;
	notes?: string | null;

	status!: CaseStatus;

	// Offline-sync fields. See migration 20260902000100.
	client_uuid?: string | null;
	created_offline_at?: Date | null;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
