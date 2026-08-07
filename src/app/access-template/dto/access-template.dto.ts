import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	IsBoolean,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';
import { emptyToUndef, toBool } from '@/common/helpers/transform.helper';

export class CreateAccessTemplateDTO {
	@ApiProperty({ required: true, example: 18, description: 'Global row order (unique across the table).' })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	navigation_id!: number;

	@ApiProperty({ required: true, example: 5, description: 'Order within the parent catalog (unique per catalog).' })
	@Type(() => Number)
	@IsInt()
	@Min(1)
	catalog_id!: number;

	@ApiProperty({ required: true, example: 'catalog' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	catalog!: string;

	@ApiProperty({ required: true, example: 'brands' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(200)
	main_navigation!: string;

	@ApiProperty({ required: true, example: 'all-access' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(200)
	sub_navigation!: string;

	@ApiProperty({ required: false, description: 'Human-readable description of what this permission grants.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	remarks?: string;

	@ApiProperty({ required: false, type: Boolean, default: false })
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	has_access?: boolean;
}

export class UpdateAccessTemplateDTO {
	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	navigation_id?: number;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsInt()
	@Min(1)
	catalog_id?: number;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	catalog?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(200)
	main_navigation?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(200)
	sub_navigation?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	remarks?: string;

	@ApiProperty({ required: false, type: Boolean })
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	has_access?: boolean;
}

export class AccessTemplateDashboardQueryDTO extends DashboardQueryDTO {
	@ApiProperty({ required: false, description: 'Filter to one catalog (e.g., "administrative").' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	catalog?: string;

	@ApiProperty({ required: false, description: 'Filter to one main_navigation (e.g., "user management").' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	main_navigation?: string;

	@ApiProperty({ required: false, type: Boolean, description: 'Filter by default has_access value.' })
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	has_access?: boolean;
}
