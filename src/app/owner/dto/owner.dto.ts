import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsEmail,
	IsIn,
	IsNotEmpty,
	IsOptional,
	IsString,
	MinLength,
} from 'class-validator';
import { Match } from '@/common/validators/match.validator';

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
	// Keyed by tenant_uuid → price. Unspecified tenants are left alone;
	// tenants that don't currently list the item are skipped (we don't
	// invent catalog rows without a category + group assignment).
	@ApiProperty({
		required: true,
		example: { 't-a-main': 350, 't-a-south': 320 },
		description: 'Map of tenant_uuid → price. Only tenants the caller owns are applied.',
	})
	@IsNotEmpty()
	prices!: Record<string, number>;
}
