import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);

export class SendTestMailDTO {
	@ApiProperty({ required: true, example: 'you@example.com' })
	@IsNotEmpty()
	@IsEmail()
	@MaxLength(255)
	to!: string;

	@ApiProperty({ required: false, example: 'MyLab — test email' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(200)
	subject?: string;

	@ApiProperty({ required: false, example: 'Hello from mylab-api!' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(5000)
	message?: string;
}
