import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	IsDateString,
	IsIn,
	IsNotEmpty,
	IsNumber,
	IsObject,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	Min,
} from 'class-validator';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);

/**
 * Body is now JSON — the receipt file was already uploaded via
 * POST /api/ai-extraction/receipt; the caller passes back that URL.
 */
export class UploadSubscriptionPaymentDTO {
	@ApiProperty({
		required: false,
		format: 'uuid',
		description:
			'Tenant UUID. Required with an admin token. Ignored/overridden when using a user token (auto-scoped).',
	})
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: true, format: 'uuid', description: 'Subscription plan to purchase' })
	@IsNotEmpty()
	@IsUUID()
	subscription_plan_uuid!: string;

	@ApiProperty({
		required: true,
		example: 199,
		description: 'Amount the tenant paid — may differ from the plan price.',
	})
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	amount_paid!: number;

	@ApiProperty({
		required: false,
		example: '/public/uploads/ai-extraction/receipts/2026/07/xxxx.png',
		description:
			'Public URL of the proof-of-payment file previously uploaded via /ai-extraction/receipt.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(1000)
	payment_attachment_url?: string;

	/* Prefill / override fields. These are what the frontend collected from
	   the AI extraction preview (and possibly edited before submitting). */

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	payment_reference_number?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	payee_account_number?: string;

	@ApiProperty({ required: false, example: 'ewallet' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	payment_method?: string;

	@ApiProperty({ required: false, example: 'GCash' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	payment_method_name?: string;

	@ApiProperty({ required: false, example: '2026-07-03T10:15:00+08:00' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsDateString()
	payment_datetime?: string;

	@ApiProperty({
		required: false,
		description:
			'Optional raw AI extraction blob from /ai-extraction/receipt (for audit / re-processing). Stored as-is in ai_extraction JSONB.',
	})
	@IsOptional()
	@IsObject()
	ai_extraction?: any;
}

export class ApproveSubscriptionPaymentDTO {
	@ApiProperty({
		required: false,
		description: 'Optional override for the subscription start date. Defaults to now.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsDateString()
	subscription_start?: string;
}

export class RejectSubscriptionPaymentDTO {
	@ApiProperty({ required: true })
	@IsNotEmpty()
	@IsString()
	rejection_reason!: string;
}

export class CreatePaypalOrderDTO {
	@ApiProperty({
		required: false,
		format: 'uuid',
		description: 'Tenant UUID. Required with an admin token. Ignored/overridden when using a user token.',
	})
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: true, format: 'uuid', description: 'Subscription plan to purchase' })
	@IsNotEmpty()
	@IsUUID()
	subscription_plan_uuid!: string;
}

export class CapturePaypalOrderDTO {
	@ApiProperty({
		required: false,
		format: 'uuid',
		description: 'Tenant UUID. Required with an admin token. Ignored/overridden when using a user token.',
	})
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: true, description: 'PayPal order id returned by createPaypalOrder.' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(64)
	order_id!: string;
}

export class SubscriptionPaymentDashboardQueryDTO extends DashboardQueryDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Filter to a specific tenant (admin only)' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: false, enum: ['pending', 'approved', 'rejected'] })
	@IsOptional()
	@IsIn(['pending', 'approved', 'rejected'])
	payment_status?: 'pending' | 'approved' | 'rejected';
}
