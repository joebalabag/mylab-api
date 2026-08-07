import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { Match } from '@/common/validators/match.validator';

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);
const SkipIfBlank = () =>
	ValidateIf((_o, value) => value !== undefined && value !== null && value !== '');

export class CreateUserDTO {
	@ApiProperty({
		required: false,
		format: 'uuid',
		description:
			'Tenant UUID. Required with admin token. Ignored/overridden when using a user token (auto-scoped to the caller tenant).',
	})
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: true, example: 'jdoe' })
	@IsNotEmpty()
	@IsString()
	@MinLength(3)
	username!: string;

	@ApiProperty({ required: true, minLength: 6, example: 'user1234' })
	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	password!: string;

	@ApiProperty({ required: true, minLength: 6, example: 'user1234' })
	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	@Match('password', { message: 'Passwords do not match' })
	confirm_password!: string;

	@ApiProperty({ required: true, example: 'John Doe' })
	@IsNotEmpty()
	@IsString()
	name!: string;

	@ApiProperty({ required: false, example: 'jdoe@example.com' })
	@Transform(emptyToUndef)
	@SkipIfBlank()
	@IsEmail()
	email?: string;

	@ApiProperty({ required: false, enum: ['manager', 'cashier', 'stock_clerk', 'staff'], default: 'cashier' })
	@IsOptional()
	@IsString()
	role?: string;

	@ApiProperty({ required: false, example: '00112233', description: 'PRC / Professional license number — printed under the medtech signature on lab reports.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	license_number?: string;

	@ApiProperty({
		required: false,
		example: 'Juan D. Cruz, RMT',
		description: 'Name shown on the lab report as the tester. Falls back to `name` when omitted.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	lab_display_name?: string;
}

export class UpdateUserDTO {
	@ApiProperty({ required: false })
	@IsOptional()
	@IsString()
	name?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@SkipIfBlank()
	@IsEmail()
	email?: string;

	@ApiProperty({ required: false, enum: ['manager', 'cashier', 'stock_clerk', 'staff'] })
	@IsOptional()
	@IsString()
	role?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	license_number?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	lab_display_name?: string;
}

export class SetUserStatusDTO {
	@ApiProperty({ required: true, enum: ['active', 'inactive'] })
	@IsNotEmpty()
	@IsIn(['active', 'inactive'])
	status!: 'active' | 'inactive';
}

export class DashboardChangeUserPasswordDTO {
	@ApiProperty({ required: true, minLength: 6 })
	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	password!: string;

	@ApiProperty({ required: true, minLength: 6 })
	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	@Match('password', { message: 'Passwords do not match' })
	confirm_password!: string;
}

export class ProfileChangeUserPasswordDTO {
	@ApiProperty({ required: true, minLength: 6 })
	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	old_password!: string;

	@ApiProperty({ required: true, minLength: 6 })
	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	password!: string;

	@ApiProperty({ required: true, minLength: 6 })
	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	@Match('password', { message: 'Passwords do not match' })
	confirm_password!: string;
}
