import { Model } from 'objection';

export class AdminPasswordHistory extends Model {
	static tableName = 'admin_password_history';
	static idColumn = 'uuid';

	uuid!: string;
	admin_uuid!: string;
	passphrase!: string;
	keycode!: string;
	changed_by?: string;
	change_source?: string;
	created_at?: Date;
}
