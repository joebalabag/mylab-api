import { Model } from 'objection';

export class AccessTemplate extends Model {
	static tableName = 'access_templates';
	static idColumn = 'uuid';

	uuid!: string;
	navigation_id!: number;
	catalog_id!: number;
	catalog!: string;
	main_navigation!: string;
	sub_navigation!: string;
	has_access!: boolean;
	remarks?: string | null;
	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
