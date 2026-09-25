import { Model } from 'objection';
import { ResultType } from '../test-item/test-item.model';

export class LabReportItem extends Model {
	static tableName = 'lab_report_items';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	lab_report_uuid!: string;
	patient_requisition_item_uuid!: string;
	test_item_uuid?: string | null;

	test_code!: string;
	test_name!: string;
	result_type!: ResultType;
	specimen?: string | null;
	unit_of_measure?: string | null;
	reference_range?: string | null;
	method?: string | null;
	matrix_config?: { rows: string[]; cols: string[] } | null;

	si_conversion_factor?: number | string | null;
	si_unit_of_measure?: string | null;
	si_reference_range?: string | null;

	narrative_text?: string | null;
	display_order!: number;
	is_active!: boolean;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
