import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

/**
 * Manager re-authentication payload for sensitive actions (voiding a
 * payment, overriding a discount, etc.). Doesn't issue a new token —
 * the caller keeps their own session and gets back only a
 * confirmation that the passed manager credentials are valid.
 */
export class VerifyManagerDTO {
	@ApiProperty({ required: true, minLength: 3, example: 'manager1' })
	@IsNotEmpty()
	@IsString()
	@MinLength(3)
	username!: string;

	@ApiProperty({ required: true, minLength: 6, example: 'secret1234' })
	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	password!: string;
}
