import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);

export class CreateDoctorDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Admin only.' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: true, example: 'Joe P. Balabag, M.D.' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(255)
	name!: string;

	@ApiProperty({ required: false, example: '00112233', description: 'PRC / Professional license number.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	license_number?: string;

	@ApiProperty({ required: true, example: 'Pathologist' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	specialty!: string;

	@ApiProperty({
		required: false,
		type: 'string',
		format: 'binary',
		description: 'E-signature image — PNG only, transparent background recommended.',
	})
	@IsOptional()
	esignature_image?: any;
}

export class UpdateDoctorDTO {
	@ApiProperty({ required: false }) @Transform(emptyToUndef) @IsOptional() @IsString() @MaxLength(255) name?: string;
	@ApiProperty({ required: false }) @Transform(emptyToUndef) @IsOptional() @IsString() @MaxLength(100) license_number?: string;
	@ApiProperty({ required: false }) @Transform(emptyToUndef) @IsOptional() @IsString() @MaxLength(100) specialty?: string;

	@ApiProperty({ required: false, type: 'string', format: 'binary', description: 'Replacement e-signature image (PNG only).' })
	@IsOptional()
	esignature_image?: any;
}

export class SetDoctorStatusDTO {
	@ApiProperty({ required: true, enum: ['active', 'inactive'] })
	@IsNotEmpty()
	@IsIn(['active', 'inactive'])
	status!: 'active' | 'inactive';
}

export class DoctorDashboardQueryDTO extends DashboardQueryDTO {
	@ApiProperty({ required: false, format: 'uuid' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: false, description: 'Filter by specialty name.' })
	@IsOptional()
	@IsString()
	specialty?: string;
}
