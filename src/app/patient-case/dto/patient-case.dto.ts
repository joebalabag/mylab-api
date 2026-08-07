import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsDateString,
	IsIn,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
} from 'class-validator';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';
import { CASE_STATUSES, CASE_TYPES, CaseStatus, CaseType } from '../patient-case.model';

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);
const emptyToNull = ({ value }: { value: any }) => (value === '' ? null : value);

export class CreatePatientCaseDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Admin only.' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: true, format: 'uuid' })
	@IsNotEmpty()
	@IsUUID()
	patient_uuid!: string;

	@ApiProperty({
		required: false,
		enum: CASE_TYPES,
		default: 'OPD',
		description: 'Case type. Defaults to OPD (only surface implemented today).',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsIn(CASE_TYPES as unknown as string[])
	case_type?: CaseType;

	@ApiProperty({ required: false, description: 'ISO timestamp. Defaults to now() on the server.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsDateString()
	admission_date?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsDateString()
	discharge_date?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	chief_complaint?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	attending_physician?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	referring_physician?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	notes?: string;
}

export class UpdatePatientCaseDTO {
	@ApiProperty({ required: false, enum: CASE_TYPES })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsIn(CASE_TYPES as unknown as string[])
	case_type?: CaseType;

	@ApiProperty({ required: false })
	@Transform(emptyToNull)
	@IsOptional()
	@IsDateString()
	admission_date?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToNull)
	@IsOptional()
	@IsDateString()
	discharge_date?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(2000)
	chief_complaint?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(255)
	attending_physician?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(255)
	referring_physician?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(2000)
	notes?: string;
}

export class SetPatientCaseStatusDTO {
	@ApiProperty({ required: true, enum: CASE_STATUSES })
	@IsNotEmpty()
	@IsIn(CASE_STATUSES as unknown as string[])
	status!: CaseStatus;
}

export class PatientCaseDashboardQueryDTO extends DashboardQueryDTO {
	@ApiProperty({ required: false, format: 'uuid' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: false, format: 'uuid', description: 'Filter to a single patient.' })
	@IsOptional()
	@IsUUID()
	patient_uuid?: string;

	@ApiProperty({ required: false, enum: CASE_TYPES })
	@IsOptional()
	@IsIn(CASE_TYPES as unknown as string[])
	case_type?: CaseType;
}
