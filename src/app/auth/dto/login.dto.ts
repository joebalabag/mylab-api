import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class LoginDTO {
	@ApiProperty({ required: true, minLength: 3, example: 'admin' })
	@IsNotEmpty()
	@IsString()
	@MinLength(3)
	username!: string;

	@ApiProperty({ required: true, minLength: 6, example: 'admin123' })
	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	password!: string;
}
