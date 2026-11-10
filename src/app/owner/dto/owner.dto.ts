import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsEmail,
	IsIn,
	IsNotEmpty,
	IsObject,
	IsOptional,
	IsString,
	MinLength,
} from 'class-validator';
import { Match } from '@/common/validators/match.validator';
import { IsPriceMap } from '@/common/validators/price-map.validator';

export class CreateOwnerDTO {
	@ApiProperty({ required: true, example: 'juan' })
	@Transform(({ value }) => String(value ?? '').trim().toLowerCase())
	@IsNotEmpty()
	@IsString()
	@MinLength(3)
	username!: string;

	@ApiProperty({ required: true, minLength: 8, example: 'owner1234' })
	@IsNotEmpty()
	@IsString()
	@MinLength(8)
	password!: string;

	@ApiProperty({ required: true, minLength: 8, example: 'owner1234' })
	@IsNotEmpty()
	@IsString()
	@MinLength(8)
	@Match('password', { message: 'Passwords do not match' })
	confirm_password!: string;

	@ApiProperty({ required: true, example: 'Juan Dela Cruz' })
	@IsNotEmpty()
	@IsString()
	name!: string;

	@ApiProperty({ required: false, example: 'Alpha Diagnostics Group' })
	@IsOptional()
	@IsString()
	business_name?: string;

	@ApiProperty({ required: false, example: 'juan@alphadiag.ph' })
	@IsOptional()
	@IsEmail()
	email?: string;

	@ApiProperty({ required: false, example: '+63 917 555 0101' })
	@IsOptional()
	@IsString()
	phone?: string;
}

export class UpdateOwnerDTO {
	@ApiProperty({ required: false, example: 'Juan Dela Cruz' })
	@IsOptional()
	@IsString()
	name?: string;

	@ApiProperty({ required: false, example: 'Alpha Diagnostics Group' })
	@IsOptional()
	@IsString()
	business_name?: string;

	@ApiProperty({ required: false, example: 'juan@alphadiag.ph' })
	@IsOptional()
	@IsEmail()
	email?: string;

	@ApiProperty({ required: false, example: '+63 917 555 0101' })
	@IsOptional()
	@IsString()
	phone?: string;
}

export class SetOwnerStatusDTO {
	@ApiProperty({ required: true, enum: ['active', 'inactive'] })
	@IsNotEmpty()
	@IsIn(['active', 'inactive'])
	status!: 'active' | 'inactive';
}

export class AssignTenantDTO {
	@ApiProperty({ required: true, example: 't-a-main' })
	@IsNotEmpty()
	@IsString()
	tenant_uuid!: string;
}

// Phase 2 — Owner self-service DTOs.
// Separate from UpdateOwnerDTO so the super-admin flow can edit fields
// (e.g. status) the owner cannot touch from their own session.
export class OwnerUpdateMyProfileDTO {
	@ApiProperty({ required: false, example: 'Juan Dela Cruz' })
	@IsOptional()
	@IsString()
	name?: string;

	@ApiProperty({ required: false, example: 'Alpha Diagnostics Group' })
	@IsOptional()
	@IsString()
	business_name?: string;

	@ApiProperty({ required: false, example: 'juan@alphadiag.ph' })
	@IsOptional()
	@IsEmail()
	email?: string;

	@ApiProperty({ required: false, example: '+63 917 555 0101' })
	@IsOptional()
	@IsString()
	phone?: string;
}

export class OwnerChangePasswordDTO {
	@ApiProperty({ required: true, minLength: 8 })
	@IsNotEmpty()
	@IsString()
	@MinLength(8)
	old_password!: string;

	@ApiProperty({ required: true, minLength: 8 })
	@IsNotEmpty()
	@IsString()
	@MinLength(8)
	password!: string;

	@ApiProperty({ required: true, minLength: 8 })
	@IsNotEmpty()
	@IsString()
	@MinLength(8)
	@Match('password', { message: 'Passwords do not match' })
	confirm_password!: string;
}

// Owner-side partial tenant edit. Super-admin UpdateTenantDTO covers many
// fields the owner isn't allowed to touch (TIN, subscription, receipts).
// This DTO is intentionally narrow — matches the OwnerTenantsView form.
export class OwnerUpdateMyTenantDTO {
	@ApiProperty({ required: false })
	@IsOptional()
	@IsString()
	display_name?: string;

	@ApiProperty({ required: false })
	@IsOptional()
	@IsString()
	branch?: string;

	@ApiProperty({ required: false })
	@IsOptional()
	@IsString()
	contact_number?: string;

	@ApiProperty({ required: false })
	@IsOptional()
	@IsEmail()
	email_address?: string;

	@ApiProperty({ required: false, enum: ['active', 'inactive'] })
	@IsOptional()
	@IsIn(['active', 'inactive'])
	status?: 'active' | 'inactive';
}

export class OwnerCreateUserDTO {
	@ApiProperty({ required: true })
	@IsNotEmpty()
	@IsString()
	tenant_uuid!: string;

	@ApiProperty({ required: true })
	@Transform(({ value }) => String(value ?? '').trim().toLowerCase())
	@IsNotEmpty()
	@IsString()
	@MinLength(3)
	username!: string;

	@ApiProperty({ required: true, minLength: 8 })
	@IsNotEmpty()
	@IsString()
	@MinLength(8)
	password!: string;

	@ApiProperty({ required: true })
	@IsNotEmpty()
	@IsString()
	@MinLength(8)
	@Match('password', { message: 'Passwords do not match' })
	confirm_password!: string;

	@ApiProperty({ required: true })
	@IsNotEmpty()
	@IsString()
	name!: string;

	@ApiProperty({ required: false })
	@IsOptional()
	@IsEmail()
	email?: string;

	@ApiProperty({ required: false })
	@IsOptional()
	@IsString()
	role?: string;
}

export class OwnerUpdateUserDTO {
	@ApiProperty({ required: false })
	@IsOptional()
	@IsString()
	name?: string;

	@ApiProperty({ required: false })
	@IsOptional()
	@IsEmail()
	email?: string;

	@ApiProperty({ required: false })
	@IsOptional()
	@IsString()
	role?: string;
}

export class OwnerUserStatusDTO {
	@ApiProperty({ required: true, enum: ['active', 'inactive'] })
	@IsNotEmpty()
	@IsIn(['active', 'inactive'])
	status!: 'active' | 'inactive';
}

export class OwnerBulkPriceEditDTO {
	// `prices` updates listings that already exist on the target tenant.
	// `add` opts into cloning the item row (and its test_item_components,
	// plus item_group/item_category if missing) from the owner's most
	// recently modified listing of the same item_code, then stamping the
	// supplied price. Separate keys so a client typing into a "Not listed"
	// input cannot clone catalog rows without explicit intent.
	@ApiProperty({
		required: true,
		example: { 't-a-main': 350, 't-a-south': 320 },
		description: 'Map of tenant_uuid → price. Only tenants the caller owns are applied. Tenants without an existing listing are skipped — use `add` to clone from another tenant.',
	})
	@IsNotEmpty()
	@IsObject()
	@IsPriceMap()
	prices!: Record<string, number>;

	@ApiProperty({
		required: false,
		example: { 't-a-north': 310 },
		description: 'Map of tenant_uuid → price for tenants that do NOT currently list the item. The item row is cloned from the owner-owned tenant whose test_items row has the most recent updated_at, along with its test_item_components; the target tenant\'s item_category/item_group are auto-created by code if missing.',
	})
	@IsOptional()
	@IsObject()
	@IsPriceMap()
	add?: Record<string, number>;
}
