import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	ArrayMinSize,
	IsArray,
	IsIn,
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
	PAYMENT_METHODS,
	PaymentMethod,
	RESOLUTION_METHODS,
	ResolutionMethod,
} from '../payment.model';

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);

export class PaymentDashboardQueryDTO extends DashboardQueryDTO {
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

	@ApiProperty({ required: false, enum: PAYMENT_METHODS })
	@IsOptional()
	@IsIn(PAYMENT_METHODS as unknown as string[])
	payment_method?: PaymentMethod;
}

export class UnpaidCasesQueryDTO {
	@ApiProperty({ required: false, format: 'uuid' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	keywords?: string;
}

export class UnpaidItemsQueryDTO {
	@ApiProperty({ required: false, format: 'uuid' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: true, format: 'uuid' })
	@IsNotEmpty()
	@IsUUID()
	patient_case_uuid!: string;
}

/**
 * One item to settle in the create payload. The client sends the requisition
 * item uuid and the amounts as they appear on-screen. The service validates:
 *   - line belongs to the case's tenant
 *   - line is currently unpaid (payment_uuid IS NULL)
 *   - source requisition status is finalized (or partially_paid)
 */
export class CreatePaymentItemRowDTO {
	@ApiProperty({ required: true, format: 'uuid' })
	@IsNotEmpty()
	@IsUUID()
	patient_requisition_item_uuid!: string;

	@ApiProperty({ required: false, description: 'Cashier can override the quoted line discount. Ignored if payment-level discount is set.' })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	line_discount_amount?: number;
}

export class CreatePaymentDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Admin only.' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: true, format: 'uuid' })
	@IsNotEmpty()
	@IsUUID()
	patient_case_uuid!: string;

	@ApiProperty({ required: true, type: [CreatePaymentItemRowDTO], description: 'Which requisition items are being settled.' })
	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => CreatePaymentItemRowDTO)
	items!: CreatePaymentItemRowDTO[];

	@ApiProperty({ required: false, format: 'uuid', description: 'Payment-level discount override. Distributes proportionally across items.' })
	@IsOptional()
	@IsUUID()
	discount_uuid?: string;

	@ApiProperty({ required: false, description: 'Required only for open_amount discount type.' })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	discount_open_amount?: number;

	@ApiProperty({ required: true, enum: PAYMENT_METHODS })
	@IsNotEmpty()
	@IsIn(PAYMENT_METHODS as unknown as string[])
	payment_method!: PaymentMethod;

	@ApiProperty({ required: false, description: 'Cash tendered. Ignored for non-cash methods.' })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	amount_tendered?: number;

	@ApiProperty({
		required: false,
		description: 'eWallet provider (GCash, Maya, …) or bank name (BDO, BPI, …). Required for ewallet and bank_transfer.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	channel?: string;

	@ApiProperty({
		required: false,
		description: 'Transaction / OR / PO # for ewallet, bank_transfer, or arrangement payments.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	reference?: string;

	@ApiProperty({
		required: false,
		description: 'Who\'s on the hook for arrangement payments (company / guarantor). Required for accounts_receivable.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	billed_to?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	notes?: string;

	// Offline-sync provenance. Not exposed to the online cashier UI — populated
	// only by the /offline/sync dispatcher when replaying an outbox entry.
	@ApiProperty({ required: false, description: 'Offline sync only.' })
	@IsOptional()
	@IsString()
	@MaxLength(64)
	client_uuid?: string;

	@ApiProperty({ required: false, description: 'Offline sync only — device wall-clock.' })
	@IsOptional()
	@IsString()
	created_offline_at?: string;
}

/**
 * Mark an arrangement payment (A/R, insurance, paid outside, other) as
 * actually settled. Records the real method that came in so the audit trail
 * shows how the money was received.
 */
export class ResolveArrangementDTO {
	@ApiProperty({ required: true, enum: RESOLUTION_METHODS })
	@IsNotEmpty()
	@IsIn(RESOLUTION_METHODS as unknown as string[])
	resolved_method!: ResolutionMethod;

	@ApiProperty({
		required: false,
		description: 'Required when resolved_method is ewallet or bank_transfer.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	resolved_channel?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	resolved_reference?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	resolved_notes?: string;
}
