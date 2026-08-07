import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsDateString,
	IsEmail,
	IsIn,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);
const emptyToNull = ({ value }: { value: any }) => (value === '' ? null : value);

export const PATIENT_SEXES = ['M', 'F'] as const;
export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'] as const;

export class CreatePatientDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Tenant UUID (admin only).' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: true, example: 'Juan' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(255)
	first_name!: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	middle_name?: string;

	@ApiProperty({ required: true, example: 'Dela Cruz' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(255)
	last_name!: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(20)
	suffix?: string;

	@ApiProperty({ required: true, enum: PATIENT_SEXES })
	@IsNotEmpty()
	@IsIn(PATIENT_SEXES as unknown as string[])
	sex!: 'M' | 'F';

	@ApiProperty({ required: false, example: '1990-01-15', description: 'ISO date (YYYY-MM-DD).' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsDateString()
	birthdate?: string;

	@ApiProperty({ required: false, enum: CIVIL_STATUSES })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsIn(CIVIL_STATUSES as unknown as string[])
	civil_status?: string;

	@ApiProperty({ required: false, default: 'Filipino' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	nationality?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(50)
	contact_number?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsEmail()
	@MaxLength(255)
	email?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	address_street1?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	address_street2?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	city?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	province?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(50)
	postal_code?: string;

	@ApiProperty({ required: false, default: 'Philippines' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	country?: string;

	@ApiProperty({ required: false, example: 'O+' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(10)
	blood_type?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	allergies?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	notes?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(50)
	senior_citizen_number?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(50)
	pwd_number?: string;

	@ApiProperty({ required: false, description: 'PhilSys PSN. Any formatting accepted.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(50)
	national_id?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	emergency_contact_name?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	emergency_contact_relation?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(50)
	emergency_contact_number?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(50)
	philhealth_number?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	company?: string;

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
	@MaxLength(255)
	occupation?: string;
}

// Every field is optional; whatever comes in overrides the existing row.
// Empty strings are normalized to null so a UI clear-out reaches the DB.
export class UpdatePatientDTO {
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(255) first_name?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(255) middle_name?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(255) last_name?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(20)  suffix?: string;
	@ApiProperty({ required: false, enum: PATIENT_SEXES }) @Transform(emptyToUndef) @IsOptional() @IsIn(PATIENT_SEXES as unknown as string[]) sex?: 'M' | 'F';
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsDateString() birthdate?: string;
	@ApiProperty({ required: false, enum: CIVIL_STATUSES }) @Transform(emptyToNull) @IsOptional() @IsIn(CIVIL_STATUSES as unknown as string[]) civil_status?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(100) nationality?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(50)  contact_number?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsEmail() @MaxLength(255) email?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(500) address_street1?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(500) address_street2?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(255) city?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(255) province?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(50)  postal_code?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(100) country?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(10)  blood_type?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(2000) allergies?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(2000) notes?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(50)  senior_citizen_number?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(50)  pwd_number?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(50)  national_id?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(255) emergency_contact_name?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(100) emergency_contact_relation?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(50)  emergency_contact_number?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(50)  philhealth_number?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(255) company?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(255) referring_physician?: string;
	@ApiProperty({ required: false }) @Transform(emptyToNull) @IsOptional() @IsString() @MaxLength(255) occupation?: string;
}

export class SetPatientStatusDTO {
	@ApiProperty({ required: true, enum: ['active', 'inactive'] })
	@IsNotEmpty()
	@IsIn(['active', 'inactive'])
	status!: 'active' | 'inactive';
}

export class PatientDashboardQueryDTO extends DashboardQueryDTO {
	@ApiProperty({ required: false, format: 'uuid' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;
}

export class PatientSearchQueryDTO {
	@ApiProperty({ required: false, format: 'uuid' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	first_name?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	last_name?: string;

	@ApiProperty({ required: false, example: '1990-01-15' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsDateString()
	birthdate?: string;

	@ApiProperty({ required: false, default: 20 })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(100)
	limit?: number;
}
