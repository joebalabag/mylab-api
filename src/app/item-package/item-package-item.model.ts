import { Model } from 'objection';

export class ItemPackageItem extends Model {
	static tableName = 'item_package_items';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	item_package_uuid!: string;
	test_item_uuid!: string;

	current_price!: number;
	new_price!: number;
	display_order!: number;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
