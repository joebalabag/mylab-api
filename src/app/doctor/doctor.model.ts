import { Model } from 'objection';

// Only lab- / diagnostic-test-related specialties. Doctors here sign off on
// generated reports (pathologist on lab, radiologist on imaging, etc.).
export const DOCTOR_SPECIALTIES = [
	'Pathologist',
	'Clinical Pathologist',
	'Anatomic Pathologist',
	'Radiologist',
	'Sonologist',
	'Cardiologist',
	'Nuclear Medicine Specialist',
	'Other',
] as const;
export type DoctorSpecialty = (typeof DOCTOR_SPECIALTIES)[number];

export class Doctor extends Model {
	static tableName = 'doctors';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;

	name!: string;
	license_number?: string | null;
	specialty!: string;
	esignature_image?: string | null;

	status!: string;
	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
