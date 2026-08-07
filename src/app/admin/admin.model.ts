import { Model } from 'objection';

export class Admin extends Model {
	static tableName = 'admins';
	static idColumn = 'uuid';

	uuid!: string;
	username!: string;
	passphrase!: string;
	keycode!: string;
	name!: string;
	email?: string;
	role!: string;
	last_logindate?: Date | null;
	status!: string;
	created_by?: string;
	updated_by?: string;
	change_password_datetime?: Date | null;
	change_password_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
