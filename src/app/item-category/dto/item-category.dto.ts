import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);

export class CreateItemCategoryDTO {
	@ApiProperty({
		required: false,
		format: 'uuid',
		description: 'Tenant UUID. Required with admin token. Ignored/overridden when using a user token.',
	})
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: true, format: 'uuid', description: 'Parent item group UUID (must belong to same tenant).' })
	@IsNotEmpty()
	@IsUUID()
	item_group_uuid!: string;

	@ApiProperty({ required: true, example: 'CAT-001', description: 'Short code, unique per tenant' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	code!: string;

	@ApiProperty({ required: true, example: 'Blood Chemistry' })
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

	@ApiProperty({
		required: false,
		default: true,
		description:
			'When true, requisition items under this category collapse into one lab_report / one print-out. When false, each test_item becomes its own lab_report.',
	})
	@IsOptional()
	@Transform(({ value }) => (value === '' || value === undefined ? undefined : value === true || value === 'true'))
	@IsBoolean()
	combine_printout?: boolean;

	@ApiProperty({ required: false, description: 'Hex color used for the section band on the printed report (e.g. "#0ea5e9").' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(20)
	color?: string;

	@ApiProperty({ required: false, description: 'Section title printed above the results (e.g. "CLINICAL CHEMISTRY").' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(255)
	print_title?: string;

	@ApiProperty({ required: false, enum: ['default', 'sectioned', 'narrative', 'matrix'] })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsIn(['default', 'sectioned', 'narrative', 'matrix'])
	print_template?: string;

	@ApiProperty({ required: false, enum: ['full', 'half', 'letter', 'half_letter', 'legal', 'half_letter_crosswise', 'half_legal_crosswise'], description: 'Paper size for the printed report.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsIn(['full', 'half', 'letter', 'half_letter', 'legal', 'half_letter_crosswise', 'half_legal_crosswise'])
	print_paper_size?: string;
}

export class UpdateItemCategoryDTO {
	@ApiProperty({ required: false, format: 'uuid' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsUUID()
	item_group_uuid?: string;

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

	@ApiProperty({ required: false })
	@IsOptional()
	@Transform(({ value }) => (value === '' || value === undefined ? undefined : value === true || value === 'true'))
	@IsBoolean()
	combine_printout?: boolean;

	@ApiProperty({ required: false }) @Transform(emptyToUndef) @IsOptional() @IsString() @MaxLength(20) color?: string;
	@ApiProperty({ required: false }) @Transform(emptyToUndef) @IsOptional() @IsString() @MaxLength(255) print_title?: string;
	@ApiProperty({ required: false, enum: ['default', 'sectioned', 'narrative', 'matrix'] })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsIn(['default', 'sectioned', 'narrative', 'matrix'])
	print_template?: string;
	@ApiProperty({ required: false, enum: ['full', 'half', 'letter', 'half_letter', 'legal', 'half_letter_crosswise', 'half_legal_crosswise'] })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsIn(['full', 'half', 'letter', 'half_letter', 'legal', 'half_letter_crosswise', 'half_legal_crosswise'])
	print_paper_size?: string;
}

export class SetItemCategoryStatusDTO {
	@ApiProperty({ required: true, enum: ['active', 'inactive'] })
	@IsNotEmpty()
	@IsIn(['active', 'inactive'])
	status!: 'active' | 'inactive';
}

export class ItemCategoryDashboardQueryDTO extends DashboardQueryDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Filter to a specific tenant (admin only)' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: false, format: 'uuid', description: 'Filter to categories under this item group.' })
	@IsOptional()
	@IsUUID()
	item_group_uuid?: string;
}
