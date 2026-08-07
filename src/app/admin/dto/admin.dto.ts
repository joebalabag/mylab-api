import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { Match } from '@/common/validators/match.validator';

export class CreateAdminDTO {
	@ApiProperty({ required: true, example: 'jdoe' })
	@IsNotEmpty()
	@IsString()
	@MinLength(3)
	username!: string;

	@ApiProperty({ required: true, minLength: 6, example: 'secret123' })
	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	password!: string;

	@ApiProperty({ required: true, minLength: 6, example: 'secret123' })
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
	@IsOptional()
	@IsEmail()
	email?: string;

	@ApiProperty({ required: false, enum: ['super_admin', 'admin', 'cashier', 'manager'], default: 'admin' })
	@IsOptional()
	@IsString()
	role?: string;
}

export class UpdateAdminDTO {
	@ApiProperty({ required: false, example: 'John Doe' })
	@IsOptional()
	@IsString()
	name?: string;

	@ApiProperty({ required: false, example: 'jdoe@example.com' })
	@IsOptional()
	@IsEmail()
	email?: string;

	@ApiProperty({ required: false, enum: ['super_admin', 'admin', 'cashier', 'manager'] })
	@IsOptional()
	@IsString()
	role?: string;
}

export class SetAdminStatusDTO {
	@ApiProperty({ required: true, enum: ['active', 'inactive'] })
	@IsNotEmpty()
	@IsIn(['active', 'inactive'])
	status!: 'active' | 'inactive';
}

export class DashboardChangePasswordDTO {
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

export class ProfileChangePasswordDTO {
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
