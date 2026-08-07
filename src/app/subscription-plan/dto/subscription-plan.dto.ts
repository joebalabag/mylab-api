import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';
import { PLAN_MODULE_KEYS } from '../subscription-plan.model';

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);

// multipart/form-data submits array fields as either a real array (a[]) or
// comma-joined + JSON-stringified strings. Normalize both so the same field
// validates identically whether the caller uses fetch(FormData) or axios(JSON).
const toModuleArray = ({ value }: { value: any }): string[] | undefined => {
	if (value === '' || value == null) return undefined;
	if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return undefined;
		if (trimmed.startsWith('[')) {
			try {
				const parsed = JSON.parse(trimmed);
				if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
			} catch { /* fall through to CSV path */ }
		}
		return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
	}
	return undefined;
};

// Empty string on max_terminals means "clear the cap" — treat as null so the
// column goes back to unlimited. Numeric 0 is not meaningful (can't run a plan
// with zero terminals) but we let the @Min(1) validator reject it clearly.
const emptyToNull = ({ value }: { value: any }) => {
	if (value === '' || value === undefined) return null;
	return value;
};

// multipart/form-data always encodes booleans as strings ('true'/'false' or
// '0'/'1'). Normalize to a real boolean so IsBoolean() doesn't reject 'true'.
const toBool = ({ value }: { value: any }): boolean | undefined => {
	if (value === '' || value === undefined || value === null) return undefined;
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value !== 0;
	if (typeof value === 'string') {
		const s = value.trim().toLowerCase();
		if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
		if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
	}
	return undefined;
};

export class CreateSubscriptionPlanDTO {
	@ApiProperty({ required: true, example: 'PRO-30' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	code!: string;

	@ApiProperty({ required: true, example: 'Pro (Monthly)' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(500)
	name!: string;

	@ApiProperty({ required: true, example: 499 })
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	price!: number;

	@ApiProperty({ required: true, example: 30, description: 'Duration of the plan in days' })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	days_duration!: number;

	@ApiProperty({ required: false, description: 'Free-form features text (one per line, markdown, etc.)' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	features?: string;

	@ApiProperty({
		required: false,
		example: 7,
		default: 7,
		description: 'Days before expiry to start warning subscribers',
	})
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(0)
	days_warning_for_near_expiry?: number;

	@ApiProperty({
		required: false,
		type: 'string',
		format: 'binary',
		description: 'QR code image tenants scan to pay this plan (jpg / png / webp / gif / svg).',
	})
	@IsOptional()
	qrcode_for_payment?: any;

	@ApiProperty({ required: false, example: '1234567890', description: 'Payee account number.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	account_number?: string;

	@ApiProperty({ required: false, example: 'MnD Grocery Corp.', description: 'Payee account name.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	account_name?: string;

	@ApiProperty({
		required: false,
		example: 'GCash',
		description: 'Payee account type / provider — e.g. "BDO", "GCash", "BPI". Free-form.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	account_type?: string;

	@ApiProperty({
		required: false,
		type: [String],
		enum: PLAN_MODULE_KEYS,
		example: ['order_pos', 'terminal_pos'],
		description:
			'POS/KDS modules unlocked by this plan. Accepts a real array, a JSON-string, or a comma-separated string. "kds" bundles the KDS POS view and the Kitchen Display.',
	})
	@Transform(toModuleArray)
	@IsOptional()
	@IsArray()
	@ArrayUnique()
	@IsIn(PLAN_MODULE_KEYS as unknown as string[], { each: true })
	allowed_modules?: string[];

	@ApiProperty({
		required: false,
		example: 3,
		description: 'Max active terminals a tenant on this plan can run. Blank / null = unlimited.',
	})
	@Transform(emptyToNull)
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	max_terminals?: number | null;

	@ApiProperty({
		required: false,
		example: false,
		description:
			'When true, this plan is offered as a pickable option on the public register page. Trials must be free (price = 0) — the controller rejects create/update with is_trial=true and price>0.',
	})
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	is_trial?: boolean;
}

export class UpdateSubscriptionPlanDTO {
	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	code?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	name?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	price?: number;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	days_duration?: number;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	features?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(0)
	days_warning_for_near_expiry?: number;

	@ApiProperty({
		required: false,
		type: 'string',
		format: 'binary',
		description: 'Replacement QR code image. Previous file is deleted from disk.',
	})
	@IsOptional()
	qrcode_for_payment?: any;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	account_number?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	account_name?: string;

	@ApiProperty({ required: false, description: 'Free-form provider label (e.g. "BDO", "GCash", "BPI").' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	account_type?: string;

	@ApiProperty({
		required: false,
		type: [String],
		enum: PLAN_MODULE_KEYS,
		description:
			'Replacement module list. Sending an empty list turns off all POS/KDS access for this plan; non-POS modules stay universally available.',
	})
	@Transform(toModuleArray)
	@IsOptional()
	@IsArray()
	@ArrayUnique()
	@IsIn(PLAN_MODULE_KEYS as unknown as string[], { each: true })
	allowed_modules?: string[];

	@ApiProperty({ required: false, description: 'Max active terminals — blank / null = unlimited.' })
	@Transform(emptyToNull)
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	max_terminals?: number | null;

	@ApiProperty({ required: false, description: 'Toggle whether this plan is offered on the public register page. Trials must be free.' })
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	is_trial?: boolean;
}

export class SetSubscriptionPlanStatusDTO {
	@ApiProperty({ required: true, enum: ['active', 'inactive'] })
	@IsNotEmpty()
	@IsIn(['active', 'inactive'])
	status!: 'active' | 'inactive';
}

export class SubscriptionPlanDashboardQueryDTO extends DashboardQueryDTO {}
