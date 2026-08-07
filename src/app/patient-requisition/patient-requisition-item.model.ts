import { Model } from 'objection';

export const REQUISITION_SOURCE_TYPES = ['test_item', 'item_package'] as const;
export type RequisitionSourceType = (typeof REQUISITION_SOURCE_TYPES)[number];

export class PatientRequisitionItem extends Model {
	static tableName = 'patient_requisition_items';
	static idColumn = 'uuid';

	uuid!: string;
	tenant_uuid!: string;
	patient_requisition_uuid!: string;

	source_type!: RequisitionSourceType;
	source_uuid!: string;

	code!: string;
	name!: string;
	unit_price!: number;
	quantity!: number;
	line_total!: number;

	// Per-line discount attribution. Recomputed by the service on syncItems
	// and setDiscount. line_selling_price = line_total - line_discount_amount.
	line_discount_amount!: number;
	line_selling_price!: number;

	// Package origin. When the operator picks a package it explodes into one
	// row per contained test_item; these fields preserve the package it came
	// from so the UI can group the rows visually and reports know the bundle.
	// NULL = standalone test. Code/name are snapshotted for label stability.
	package_uuid?: string | null;
	package_code?: string | null;
	package_name?: string | null;

	display_order!: number;

	created_by?: string;
	updated_by?: string;
	created_at?: Date;
	updated_at?: Date;
}
