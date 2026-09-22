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

	@ApiProperty({
		required: false,
		enum: [1, 2],
		default: 1,
		description:
			'Number of tester signatories printed on a lab report. 1 → the finalizer signs (single line). 2 → creator signs slot 1, a credential-verified user signs slot 2 (collapses back to 1 if the resolved user is the same as slot 1).',
	})
	// Multipart form fields arrive as strings, so @Type(() => Number)
	// alone isn't enough — coerce explicitly and let @IsIn match against
	// the numeric enum.
	@Transform(({ value }) => {
		if (value === '' || value === undefined || value === null) return undefined;
		const n = Number(value);
		return Number.isFinite(n) ? n : value;
	})
	@IsOptional()
	@IsIn([1, 2])
	tester_signatory_count?: number;

	@ApiProperty({
		required: false,
		type: 'boolean',
		default: true,
		description:
			'When true, Tag as Final auto-emails the finalized PDF to the patient (skipped when patient has no email). When false, the send is manual only (Resend button in Print Preview).',
	})
	// Must use the shared `toBool` helper: the app-wide ValidationPipe runs
	// with `enableImplicitConversion: true`, which coerces "0" → true (any
	// non-empty string is truthy) BEFORE a plain @Transform runs. `toBool`
	// grabs the raw value off `obj[key]` to sidestep that.
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	auto_email_result_on_finalize?: boolean;
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

	@ApiProperty({ required: false, enum: [1, 2], description: 'See CreateTenantDTO.tester_signatory_count.' })
	// Multipart form fields arrive as strings, so @Type(() => Number)
	// alone isn't enough — coerce explicitly and let @IsIn match against
	// the numeric enum.
	@Transform(({ value }) => {
		if (value === '' || value === undefined || value === null) return undefined;
		const n = Number(value);
		return Number.isFinite(n) ? n : value;
	})
	@IsOptional()
	@IsIn([1, 2])
	tester_signatory_count?: number;

	@ApiProperty({ required: false, type: 'boolean', description: 'See CreateTenantDTO.auto_email_result_on_finalize.' })
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	auto_email_result_on_finalize?: boolean;

	// ── Per-tenant SMTP override ────────────────────────────────────
	// When smtp_use_own is true, lab-result emails go through the tenant's
	// own mailbox instead of the platform SMTP. Password is encrypted
	// server-side before it hits the DB.

	@ApiProperty({ required: false, type: 'boolean', description: 'True → use the tenant-provided smtp_* fields. False → platform default.' })
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	smtp_use_own?: boolean;

	@ApiProperty({ required: false, description: 'SMTP host, e.g. smtp.gmail.com.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	smtp_host?: string;

	@ApiProperty({ required: false, minimum: 1, maximum: 65535 })
	@Transform(({ value }) => {
		if (value === '' || value === undefined || value === null) return undefined;
		const n = Number(value);
		return Number.isFinite(n) ? n : value;
	})
	@IsOptional()
	@IsNumber()
	@Min(1)
	smtp_port?: number;

	@ApiProperty({ required: false, type: 'boolean', description: 'True for implicit TLS (usually port 465). Gmail App Passwords use false + port 587.' })
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	smtp_secure?: boolean;

	@ApiProperty({ required: false, description: 'SMTP username (usually the sending email address).' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	smtp_user?: string;

	@ApiProperty({ required: false, description: 'SMTP password (Gmail: use an App Password — never the real account password). Empty string means "keep the stored value".' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	smtp_password?: string;
}

/**
 * One-off SMTP sanity test invoked from the Company Settings page. All
 * fields except `password` are required; when `password` is empty, the
 * server falls back to the stored ciphertext for the acting user's tenant
 * so the operator can retest without re-typing.
 */
export class TestSmtpDTO {
	@ApiProperty({ required: true })
	@IsNotEmpty()
	@IsString()
	@MaxLength(255)
	host!: string;

	@ApiProperty({ required: true, minimum: 1, maximum: 65535 })
	@Transform(({ value }) => (value === '' || value == null ? undefined : Number(value)))
	@IsNumber()
	@Min(1)
	port!: number;

	@ApiProperty({ required: false, type: 'boolean', default: false })
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	secure?: boolean;

	@ApiProperty({ required: true })
	@IsNotEmpty()
	@IsString()
	@MaxLength(255)
	user!: string;

	@ApiProperty({ required: false, description: 'When empty, the stored ciphertext for the acting tenant is decrypted and used.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	password?: string;

	@ApiProperty({ required: true, description: 'Recipient of the test email.' })
	@IsNotEmpty()
	@IsEmail()
	@MaxLength(255)
	to!: string;
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
