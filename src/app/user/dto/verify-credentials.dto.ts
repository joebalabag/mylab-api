import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

import { toBool } from '@/common/helpers/transform.helper';

export class VerifyCredentialsDTO {
	@ApiProperty({ required: true, minLength: 3, example: 'manager1' })
	@IsNotEmpty()
	@IsString()
	@MinLength(3)
	username!: string;

	@ApiProperty({ required: true, minLength: 6, example: 'mgrpass123' })
	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	password!: string;

	@ApiProperty({
		required: false,
		type: Boolean,
		default: false,
		description:
			'When true, skip the admin/manager role gate — any active user in the tenant is accepted. Used by low-stakes confirmations like the manual cash-drawer kick where the goal is only "prove the person at the terminal knows a valid password", not "prove they are a supervisor".',
	})
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	allow_any_role?: boolean;
}
