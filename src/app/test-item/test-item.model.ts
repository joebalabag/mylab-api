import { Model } from 'objection';

export const RESULT_TYPES = ['single', 'panel', 'narrative', 'culture', 'matrix'] as const;
export type ResultType = (typeof RESULT_TYPES)[number];

// JSON shape stored on test_items.matrix_config for result_type='matrix'.
// Renders a grid of `rows × cols` result cells (e.g. parasitology).
export interface MatrixConfig {
	rows: string[];
	cols: string[];
}

export class TestItem extends Model {
	static tableName = 'test_items';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	item_category_uuid!: string;

	code!: string;
	name!: string;
	result_type!: ResultType;

	specimen?: string | null;
	unit_of_measure?: string | null;
	reference_range?: string | null;
	method?: string | null;
	lookup_values?: string | null;
	matrix_config?: MatrixConfig | null;

	si_conversion_factor?: number | string | null;
	si_unit_of_measure?: string | null;
	si_reference_range?: string | null;

	price!: number;
	description?: string | null;
	status!: string;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
