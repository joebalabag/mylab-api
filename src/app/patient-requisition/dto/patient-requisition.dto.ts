import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	ArrayMaxSize,
	IsArray,
	IsDateString,
	IsIn,
	IsInt,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';
import {
	REQUISITION_SOURCE_TYPES,
	RequisitionSourceType,
} from '../patient-requisition-item.model';
import { REQUISITION_STATUSES, RequisitionStatus } from '../patient-requisition.model';

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);

export class CreatePatientRequisitionDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Admin only.' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: true, format: 'uuid' })
	@IsNotEmpty()
	@IsUUID()
	patient_case_uuid!: string;

	@ApiProperty({ required: false, description: 'Defaults to now() on the server.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsDateString()
	requisition_date?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	notes?: string;
}

export class UpdatePatientRequisitionDTO {
	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsDateString()
	requisition_date?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	notes?: string;
}

export class SetPatientRequisitionStatusDTO {
	@ApiProperty({ required: true, enum: REQUISITION_STATUSES })
	@IsNotEmpty()
	@IsIn(REQUISITION_STATUSES as unknown as string[])
	status!: RequisitionStatus;
}

/**
 * Apply / change / clear the requisition-level discount.
 *
 *   discount_uuid = null (or clear=true) → removes any existing discount.
 *   discount_uuid = uuid  → snapshots the discount and recomputes:
 *     percent      → discount_amount = subtotal × value / 100
 *     fix          → discount_amount = min(subtotal, value)
 *     open_amount  → discount_amount = min(subtotal, discount_open_amount)
 *                    — operator MUST pass discount_open_amount for this type.
 * total is always recomputed = subtotal - discount_amount.
 */
export class SetPatientRequisitionDiscountDTO {
	@ApiProperty({ required: false, format: 'uuid', nullable: true, description: 'Discount uuid, or null to clear.' })
	@IsOptional()
	@IsUUID()
	discount_uuid?: string | null;

	@ApiProperty({ required: false, default: false, description: 'Explicitly clears the current discount.' })
	@IsOptional()
	clear?: boolean;

	@ApiProperty({ required: false, description: 'Required only for open_amount discount type.' })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	discount_open_amount?: number;
}

export class PatientRequisitionDashboardQueryDTO extends DashboardQueryDTO {
	@ApiProperty({ required: false, format: 'uuid' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: false, format: 'uuid' })
	@IsOptional()
	@IsUUID()
	patient_case_uuid?: string;

	@ApiProperty({ required: false, format: 'uuid' })
	@IsOptional()
	@IsUUID()
	patient_uuid?: string;
}

/** Single requisition line inside a SyncPatientRequisitionItemsDTO payload. */
export class PatientRequisitionItemRowDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Existing line uuid; omit to insert.' })
	@IsOptional()
	@IsUUID()
	uuid?: string;

	@ApiProperty({ required: true, enum: REQUISITION_SOURCE_TYPES })
	@IsNotEmpty()
	@IsIn(REQUISITION_SOURCE_TYPES as unknown as string[])
	source_type!: RequisitionSourceType;

	@ApiProperty({ required: true, format: 'uuid' })
	@IsNotEmpty()
	@IsUUID()
	source_uuid!: string;

	@ApiProperty({ required: false, default: 1 })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	quantity?: number;

	@ApiProperty({
		required: false,
		description:
			'Optional unit-price override (rare — for special-case pricing at the counter). Server auto-fills from the source catalog when omitted.',
	})
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	unit_price?: number;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(0)
	display_order?: number;

	// Package attribution — populated by the frontend when the row was
	// spawned by exploding a package. NULL for standalone tests. Snapshots
	// let the report renderer group and label without a live lookup.
	@ApiProperty({ required: false, format: 'uuid', description: 'Source package uuid (only when this line came from a package explode).' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsUUID()
	package_uuid?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	package_code?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	package_name?: string;
}

/**
 * Whole-list sync of a requisition's items. Semantics mirror the item-package
 * sync: uuid → PATCH, no uuid → INSERT (server snapshots code/name/price from
 * the source catalog), missing uuid → DELETE. After sync, subtotal + total
 * are recomputed = SUM(line_total).
 */
export class SyncPatientRequisitionItemsDTO {
	@ApiProperty({ required: true, type: [PatientRequisitionItemRowDTO] })
	@IsArray()
	@ArrayMaxSize(200)
	@ValidateNested({ each: true })
	@Type(() => PatientRequisitionItemRowDTO)
	items!: PatientRequisitionItemRowDTO[];
}
