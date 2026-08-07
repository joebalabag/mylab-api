import { Model } from 'objection';

export class ItemCategory extends Model {
	static tableName = 'item_categories';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	item_group_uuid!: string;
	code!: string;
	name!: string;
	description?: string | null;
	combine_printout!: boolean;
	color?: string | null;
	print_title?: string | null;
	print_template?: string | null;
	print_paper_size?: string | null;
	status!: string;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
