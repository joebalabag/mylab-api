import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);

export class CreateItemGroupDTO {
	@ApiProperty({
		required: false,
		format: 'uuid',
		description: 'Tenant UUID. Required with admin token. Ignored/overridden when using a user token.',
	})
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: true, example: 'GRP-001', description: 'Short code, unique per tenant' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	code!: string;

	@ApiProperty({ required: true, example: 'Reagents' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(500)
	name!: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	description?: string;

	@ApiProperty({ required: false, format: 'uuid', description: 'Default signatory doctor for lab reports created from tests in this group. Snapshots into the pathologist fields when finalizing.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsUUID()
	signatory_doctor_uuid?: string;

	@ApiProperty({
		required: false,
		example: 'Medical Technologist',
		description: 'Role of the person who runs the test (Medical Technologist, Radiologic Technologist, Sonographer, etc.). Prints under the medtech signature.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	tester_role?: string;
}

export class UpdateItemGroupDTO {
	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	code?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	name?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(2000)
	description?: string;

	@ApiProperty({ required: false, format: 'uuid' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsUUID()
	signatory_doctor_uuid?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	tester_role?: string;
}

export class SetItemGroupStatusDTO {
	@ApiProperty({ required: true, enum: ['active', 'inactive'] })
	@IsNotEmpty()
	@IsIn(['active', 'inactive'])
	status!: 'active' | 'inactive';
}

export class ItemGroupDashboardQueryDTO extends DashboardQueryDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Filter to a specific tenant (admin only)' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;
}

export class ImportPreloadedCatalogDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Admin only.' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({
		required: false,
		type: [String],
		description:
			'Item-group codes to import. Each ticked group brings its own categories + test items. Omit / empty = import every group in the catalog.',
	})
	@IsOptional()
	@IsArray()
	@ArrayNotEmpty()
	@IsString({ each: true })
	group_codes?: string[];
}
