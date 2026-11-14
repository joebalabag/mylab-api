import { Pojo } from 'objection';
import { AuditedModel } from '../audit-log/audited.model';

export class Owner extends AuditedModel {
	static tableName = 'owners';
	static idColumn = 'uuid';
	static auditConfig = {
		entityType: 'owner',
		labelField: 'username',
		// Owners live above the tenant plane, like admins.
		tenantField: null as string | null,
		redactFields: ['passphrase', 'keycode'],
	};

	// Strip the password hash from every serialized response.
	$formatJson(json: Pojo): Pojo {
		const out = super.$formatJson(json);
		delete out.passphrase;
		delete out.keycode;
		return out;
	}

	uuid!: string;
	username!: string;
	passphrase!: string;
	keycode!: string;
	name!: string;
	business_name?: string | null;
	email?: string | null;
	phone?: string | null;
	logo_url?: string | null;
	last_logindate?: Date | null;
	status!: string;
	created_by?: string;
	updated_by?: string;
	change_password_datetime?: Date | null;
	change_password_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
