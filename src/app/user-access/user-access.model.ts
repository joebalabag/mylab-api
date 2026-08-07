import { Model } from 'objection';

export class UserAccess extends Model {
	static tableName = 'user_accesses';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	user_uuid!: string;

	navigation_id!: number;
	catalog_id!: number;
	catalog!: string;
	main_navigation!: string;
	sub_navigation!: string;

	remarks?: string | null;
	has_access!: boolean;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
