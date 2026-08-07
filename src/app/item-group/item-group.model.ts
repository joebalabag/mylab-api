import { Model } from 'objection';

export class ItemGroup extends Model {
	static tableName = 'item_groups';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	code!: string;
	name!: string;
	description?: string | null;
	signatory_doctor_uuid?: string | null;
	tester_role?: string | null;
	status!: string;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
