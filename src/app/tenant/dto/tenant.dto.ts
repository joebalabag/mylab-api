import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	IsBoolean,
	IsDateString,
	IsEmail,
	IsIn,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	IsUrl,
	IsUUID,
	MaxLength,
	Min,
	ValidateIf,
} from 'class-validator';
import { emptyToUndef, toBool } from '@/common/helpers/transform.helper';

// `IsOptional` only skips null/undefined; we want empty-string treated the same.
const SkipIfBlank = () =>
	ValidateIf((_o, value) => value !== undefined && value !== null && value !== '');

export class CreateTenantDTO {
	@ApiProperty({ required: true, example: 'MnD Diagnostic Lab — Main' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(500)
	display_name!: string;

	@ApiProperty({ required: false, example: 'MnD Diagnostics Corp.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	legal_name?: string;

	@ApiProperty({ required: false, example: 'Jane Doe', description: 'Store owner / primary contact name.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	owner_name?: string;

	@ApiProperty({ required: true, example: 'MNDG-001' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	store_code!: string;

	@ApiProperty({ required: false, example: 'Main Branch' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	branch?: string;

	@ApiProperty({ required: false, example: 'T01' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	terminal_id?: string;

	@ApiProperty({ required: false, default: 'PHP', example: 'PHP' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(10)
	currency?: string;

	@ApiProperty({ required: false, example: '123 Rizal St.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	address_street1?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	address_street2?: string;

	@ApiProperty({ required: false, example: 'San Pedro' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	city?: string;

	@ApiProperty({ required: false, example: 'Laguna' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	province?: string;

	@ApiProperty({ required: false, example: '4023' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	postal_code?: string;

	@ApiProperty({ required: false, default: 'Philippines' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	country?: string;

	@ApiProperty({ required: false, example: '+63 917 000 0000' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	contact_number?: string;

	@ApiProperty({ required: false, example: 'store@example.com' })
	@Transform(emptyToUndef)
	@SkipIfBlank()
	@IsEmail()
	email_address?: string;

	@ApiProperty({ required: false, example: 'https://example.com' })
	@Transform(emptyToUndef)
	@SkipIfBlank()
	@IsUrl({ require_tld: false })
	website?: string;

	@ApiProperty({
		required: false,
		example: 'Asia/Manila',
		description:
			'IANA timezone name. Drives the discount scheduling engine (day-of-week / time-of-day windows). Invalid values fall back to Asia/Manila.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(64)
	timezone?: string;

	@ApiProperty({ required: false, example: '000-000-000-000' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	tin_number?: string;

	@ApiProperty({ required: false, type: Boolean, default: false })
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	is_vat_registered?: boolean;

	@ApiProperty({ required: false, type: Boolean, default: true })
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	show_tin_on_receipt?: boolean;

	@ApiProperty({ required: false, description: 'Free-form receipt header text' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	receipt_header?: string;

	@ApiProperty({ required: false, description: 'Free-form receipt footer text' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	receipt_footer?: string;

	@ApiProperty({ required: false, type: Boolean, default: true })
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	receipt_show_logo?: boolean;

	@ApiProperty({
		required: false,
		type: Boolean,
		default: false,
		description:
			'When true, the receipt renderer skips the auto-generated store header (name, address, TIN, phone, email) and prints `receipt_custom_header` as-is.',
	})
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	receipt_use_custom_header?: boolean;

	@ApiProperty({ required: false, description: 'Free-form multi-line custom header. Used when receipt_use_custom_header=true.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	receipt_custom_header?: string;

	@ApiProperty({
		required: false,
		type: Boolean,
		default: false,
		description:
			'When true, the receipt renderer skips the auto footer (thank-you text + UUID) and prints `receipt_custom_footer` as-is.',
	})
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	receipt_use_custom_footer?: boolean;

	@ApiProperty({ required: false, description: 'Free-form multi-line custom footer. Used when receipt_use_custom_footer=true.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	receipt_custom_footer?: string;

	@ApiProperty({
		required: false,
		type: 'string',
		format: 'binary',
		description: 'Company logo (image file — jpg/png/webp/gif/svg)',
	})
	@IsOptional()
	company_logo?: any;

	@ApiProperty({
		required: false,
		enum: ['image', 'logo_text'],
		description:
			'Lab report Result Header mode. `image` renders `lab_header_image` as a full-width banner. `logo_text` renders company_logo on the left + `lab_header_text` on the right. Defaults to logo_text.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsIn(['image', 'logo_text'])
	lab_header_mode?: string;

	@ApiProperty({ required: false, description: 'Free-form multi-line header text used in logo_text mode.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	lab_header_text?: string;

	@ApiProperty({
		required: false,
		type: 'string',
		format: 'binary',
		description: 'Lab report header banner image (image mode). Used as the full-width report header.',
	})
	@IsOptional()
	lab_header_image?: any;
}

export class UpdateTenantDTO {
	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	display_name?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	legal_name?: string;

	@ApiProperty({ required: false, description: 'Store owner / primary contact name.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	owner_name?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	store_code?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	branch?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	terminal_id?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	currency?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	address_street1?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	address_street2?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	city?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	province?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	postal_code?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	country?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	contact_number?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@SkipIfBlank()
	@IsEmail()
	email_address?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@SkipIfBlank()
	@IsUrl({ require_tld: false })
	website?: string;

	@ApiProperty({
		required: false,
		example: 'Asia/Manila',
		description: 'IANA timezone name. Invalid values fall back to Asia/Manila.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(64)
	timezone?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	tin_number?: string;

	@ApiProperty({ required: false, type: Boolean })
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	is_vat_registered?: boolean;

	@ApiProperty({ required: false, type: Boolean })
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	show_tin_on_receipt?: boolean;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	receipt_header?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	receipt_footer?: string;

	@ApiProperty({ required: false, type: Boolean })
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	receipt_show_logo?: boolean;

	@ApiProperty({ required: false, type: Boolean, description: 'See CreateTenantDTO.receipt_use_custom_header.' })
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	receipt_use_custom_header?: boolean;

	@ApiProperty({ required: false, description: 'Free-form multi-line custom header.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	receipt_custom_header?: string;

	@ApiProperty({ required: false, type: Boolean, description: 'See CreateTenantDTO.receipt_use_custom_footer.' })
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	receipt_use_custom_footer?: boolean;

	@ApiProperty({ required: false, description: 'Free-form multi-line custom footer.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	receipt_custom_footer?: string;

	@ApiProperty({
		required: false,
		type: 'string',
		format: 'binary',
		description: 'Company logo (image file). Replaces any existing logo.',
	})
	@IsOptional()
	company_logo?: any;

	@ApiProperty({ required: false, enum: ['image', 'logo_text'] })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsIn(['image', 'logo_text'])
	lab_header_mode?: string;

	@ApiProperty({ required: false, description: 'Free-form multi-line header text used in logo_text mode.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	lab_header_text?: string;

	@ApiProperty({
		required: false,
		type: 'string',
		format: 'binary',
		description: 'Lab report header banner image (image mode). Replaces any existing.',
	})
	@IsOptional()
	lab_header_image?: any;
}

export class SetTenantStatusDTO {
	@ApiProperty({ required: true, enum: ['active', 'inactive'] })
	@IsNotEmpty()
	@IsIn(['active', 'inactive'])
	status!: 'active' | 'inactive';
}

/**
 * Super-admin override of a tenant's current subscription state. All value
 * fields are optional — pass only the ones changing. `alter_reason` is always
 * required; the change is recorded as a new `tenant_subscription_history` row.
 */
export class AlterTenantSubscriptionDTO {
	@ApiProperty({ required: true, description: 'Audit reason for the override.' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(2000)
	alter_reason!: string;

	@ApiProperty({ required: false, format: 'uuid' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsUUID()
	current_subscription_plan_uuid?: string;

	@ApiProperty({ required: false, example: 30 })
	@Transform(emptyToUndef)
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	current_subscription_days?: number;

	@ApiProperty({ required: false, example: '2026-08-03' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsDateString()
	current_subscription_expiry?: string;

	@ApiProperty({ required: false, example: 199 })
	@Transform(emptyToUndef)
	@IsOptional()
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	current_subscription_plan_amount?: number;
}
