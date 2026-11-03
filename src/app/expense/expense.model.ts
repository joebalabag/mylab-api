import { AuditedModel } from '../audit-log/audited.model';

export type ExpenseStatus = 'active' | 'void';

export class Expense extends AuditedModel {
	static tableName = 'expenses';
	static idColumn = 'uuid';
	static auditConfig = { entityType: 'expense', labelField: 'description' };

	uuid!: string;
	tenant_uuid!: string;

	user_uuid?: string | null;
	cashier_name?: string | null;
	cashier_username?: string | null;

	date_transact!: string; // 'YYYY-MM-DD'
	category!: string;
	description!: string;
	amount!: number;
	notes?: string | null;

	status!: ExpenseStatus;

	voided_at?: Date | null;
	voided_by_uuid?: string | null;
	voided_by_name?: string | null;
	void_reason?: string | null;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
