import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsEmail,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
} from 'class-validator';

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);

export class RegisterTenantDTO {
	@ApiProperty({ required: true, example: 'MnD Grocery — Main' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(500)
	store_name!: string;

	@ApiProperty({ required: true, example: 'owner@example.com', description: 'Also becomes the login username.' })
	@IsNotEmpty()
	@IsEmail()
	@MaxLength(255)
	contact_email!: string;

	@ApiProperty({ required: true, example: '+63 917 000 0000' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(50)
	contact_number!: string;

	@ApiProperty({ required: true, example: 'San Pedro' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(200)
	city!: string;

	@ApiProperty({ required: true, example: 'Laguna' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(200)
	province!: string;

	@ApiProperty({ required: true, example: 'Philippines' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	country!: string;

	@ApiProperty({ required: true, example: 'Jane Doe' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(500)
	owner_name!: string;

	@ApiProperty({
		required: false,
		example: 'Asia/Manila',
		description:
			'Client-detected IANA timezone (Intl.DateTimeFormat().resolvedOptions().timeZone). Optional hint; invalid or missing values fall back to Asia/Manila on verify.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(64)
	timezone?: string;

	@ApiProperty({
		required: true,
		example: '00000000-0000-0000-0000-000000000001',
		description:
			'UUID of the trial subscription plan the user picked on the register page. Must resolve to an active, is_trial plan.',
	})
	@IsNotEmpty()
	@IsUUID()
	subscription_plan_uuid!: string;
}

export class VerifyTenantRegistrationDTO {
	@ApiProperty({ required: true, description: 'Token from the verification email.' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(256)
	token!: string;
}

export class ResendVerificationDTO {
	@ApiProperty({ required: true, example: 'owner@example.com' })
	@IsNotEmpty()
	@IsEmail()
	@MaxLength(255)
	@Transform(emptyToUndef)
	contact_email!: string;
}
