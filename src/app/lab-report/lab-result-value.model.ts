import { Model } from 'objection';

export const RESULT_VALUE_FLAGS = ['normal', 'low', 'high', 'abnormal', 'critical'] as const;
export type ResultValueFlag = (typeof RESULT_VALUE_FLAGS)[number];

export class LabResultValue extends Model {
	static tableName = 'lab_result_values';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	lab_report_item_uuid!: string;
	test_item_component_uuid?: string | null;

	component_code!: string;
	component_name!: string;
	unit_of_measure?: string | null;
	reference_range?: string | null;
	lookup_values?: string | null;

	si_conversion_factor?: number | string | null;
	si_unit_of_measure?: string | null;
	si_reference_range?: string | null;

	value_text?: string | null;
	value_numeric?: number | null;
	flag?: ResultValueFlag | null;

	display_order!: number;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
