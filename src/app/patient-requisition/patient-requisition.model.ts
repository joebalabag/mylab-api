import { Model } from 'objection';

// Full lifecycle including the cashier states added by migration
// 20260804001600. The DB check constraint mirrors this set.
export const REQUISITION_STATUSES = ['draft', 'finalized', 'partially_paid', 'paid', 'cancelled'] as const;
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

export class PatientRequisition extends Model {
	static tableName = 'patient_requisitions';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	patient_case_uuid!: string;
	patient_uuid!: string;

	requisition_number!: string;
	requisition_date!: Date;
	notes?: string | null;
	physician?: string | null;

	subtotal!: number;
	total!: number;

	discount_uuid?: string | null;
	discount_code?: string | null;
	discount_name?: string | null;
	discount_type?: string | null;    // 'percent' | 'fix' | 'open_amount'
	discount_value?: number | null;   // snapshot of discounts.value
	discount_amount!: number;         // peso amount taken off subtotal

	status!: RequisitionStatus;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
