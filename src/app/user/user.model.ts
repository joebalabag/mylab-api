import { Model } from 'objection';

export class User extends Model {
	static tableName = 'users';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	username!: string;
	passphrase!: string;
	keycode!: string;
	name!: string;
	email?: string;
	role!: string;
	license_number?: string | null;
	lab_display_name?: string | null;
	last_logindate?: Date | null;
	last_change_password?: Date | null;
	status!: string;
	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
