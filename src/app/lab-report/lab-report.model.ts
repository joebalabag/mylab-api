import { Model } from 'objection';

export const LAB_REPORT_STATUSES = ['draft', 'finalized', 'voided'] as const;
export type LabReportStatus = (typeof LAB_REPORT_STATUSES)[number];

export class LabReport extends Model {
	static tableName = 'lab_reports';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	patient_requisition_uuid!: string;
	patient_uuid!: string;
	patient_case_uuid!: string;

	item_category_uuid?: string | null;
	item_category_code?: string | null;
	item_category_name?: string | null;

	lab_number!: string;

	status!: LabReportStatus;
	void_reason?: string | null;

	medtech_uuid?: string | null;
	medtech_name?: string | null;
	medtech_license?: string | null;
	pathologist_uuid?: string | null;
	pathologist_name?: string | null;
	pathologist_license?: string | null;
	finalized_at?: Date | null;
	voided_at?: Date | null;
	specimen_collected_at?: Date | string | null;

	test_items_summary?: string | null;
	remarks?: string | null;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
