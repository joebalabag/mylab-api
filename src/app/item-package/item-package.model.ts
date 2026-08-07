import { Model } from 'objection';

export class ItemPackage extends Model {
	static tableName = 'item_packages';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	code!: string;
	name!: string;
	description?: string | null;
	package_price!: number;
	status!: string;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
