import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ForgotPasswordDTO {
	@ApiProperty({ required: true, minLength: 3, example: 'admin.ABC123' })
	@IsNotEmpty()
	@IsString()
	@MinLength(3)
	username!: string;
}

export class ResetPasswordDTO {
	@ApiProperty({ required: true, minLength: 32, description: 'Reset token from the email link.' })
	@IsNotEmpty()
	@IsString()
	@MinLength(32)
	token!: string;

	@ApiProperty({ required: true, minLength: 8, example: 'Str0ngPass!' })
	@IsNotEmpty()
	@IsString()
	@MinLength(8)
	new_password!: string;
}
