import { Model } from 'objection';

export class UserPasswordHistory extends Model {
	static tableName = 'user_password_history';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	user_uuid!: string;
	passphrase!: string;
	keycode!: string;
	changed_by?: string;
	change_source?: string;
	created_at?: Date;
}
