import { Model } from 'objection';

export class TestItemComponent extends Model {
	static tableName = 'test_item_components';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	test_item_uuid!: string;

	code!: string;
	name!: string;
	unit_of_measure?: string | null;
	reference_range?: string | null;
	lookup_values?: string | null;
	section?: string | null;
	display_order!: number;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
