import { AuditedModel } from '../audit-log/audited.model';

export class User extends AuditedModel {
	static tableName = 'users';
	static idColumn = 'uuid';
	static auditConfig = {
		entityType: 'user',
		labelField: 'username',
		redactFields: ['passphrase', 'keycode'],
	};

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
