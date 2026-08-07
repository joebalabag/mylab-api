import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class UserLoginDTO {
	@ApiProperty({ required: true, minLength: 3, example: 'jdoe' })
	@IsNotEmpty()
	@IsString()
	@MinLength(3)
	username!: string;

	@ApiProperty({ required: true, minLength: 6, example: 'user1234' })
	@IsNotEmpty()
	@IsString()
	@MinLength(6)
	password!: string;
}
