import { Model } from 'objection';

export const PAYMENT_METHODS = [
	'cash', 'ewallet', 'bank_transfer', 'insurance',
	'accounts_receivable', 'paid_outside', 'charity', 'other',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Methods where money actually changes hands at the counter (or via an
// online payment that clears immediately). These want a `channel` + `reference`
// for the proof-of-payment slip but no follow-up settlement.
export const CHANNELED_PAYMENT_METHODS = ['ewallet', 'bank_transfer'] as const;

// "Arrangement" methods — the requisition is unblocked so the workflow can
// proceed, but the actual money is expected to arrive later (or never, for
// charity). These need billed_to at capture time and support the
// PATCH /payment/resolve/:uuid flow to record eventual settlement.
export const ARRANGEMENT_PAYMENT_METHODS = [
	'accounts_receivable', 'insurance', 'paid_outside', 'charity', 'other',
] as const;

// Charity waivers self-resolve — no follow-up collection is ever expected.
export const SELF_RESOLVING_ARRANGEMENTS = ['charity'] as const;

// Methods a cashier can pick to actually SETTLE an arrangement later. No
// point in resolving A/R with A/R.
export const RESOLUTION_METHODS = ['cash', 'ewallet', 'bank_transfer'] as const;
export type ResolutionMethod = (typeof RESOLUTION_METHODS)[number];

export const PAYMENT_STATUSES = ['completed', 'voided'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export class Payment extends Model {
	static tableName = 'payments';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	patient_case_uuid!: string;
	patient_uuid!: string;

	payment_number!: string;
	payment_date!: Date;

	subtotal!: number;
	total!: number;

	discount_uuid?: string | null;
	discount_code?: string | null;
	discount_name?: string | null;
	discount_type?: string | null;
	discount_value?: number | null;
	discount_amount!: number;

	payment_method!: PaymentMethod;
	amount_tendered?: number | null;
	change_amount?: number | null;

	// Capture-time proof-of-payment (ewallet / bank_transfer) + arrangement
	// audit (accounts_receivable / insurance / paid_outside / other).
	channel?: string | null;
	reference?: string | null;
	billed_to?: string | null;

	// Resolution trail for arrangement payments. NULL arrangement_resolved_at =
	// still pending. Charity is treated as auto-resolved by the app layer.
	arrangement_resolved_at?: Date | null;
	resolved_method?: ResolutionMethod | null;
	resolved_channel?: string | null;
	resolved_reference?: string | null;
	resolved_notes?: string | null;
	resolved_by?: string | null;

	notes?: string | null;
	status!: PaymentStatus;

	// Offline-sync fields. See migration 20260902000100.
	client_uuid?: string | null;
	created_offline_at?: Date | null;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
