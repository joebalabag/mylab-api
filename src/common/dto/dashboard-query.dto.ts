import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Base DTO for dashboard/list endpoints.
 * Provides: date_from, date_to, status[], keywords, page_number, page_size.
 * All fields optional so endpoints can pick and choose which they honor.
 */
export class DashboardQueryDTO {
	@ApiProperty({ required: false, example: '2026-01-01', description: 'Start date (inclusive)' })
	@IsOptional()
	@IsDateString()
	date_from?: string;

	@ApiProperty({ required: false, example: '2026-12-31', description: 'End date (inclusive)' })
	@IsOptional()
	@IsDateString()
	date_to?: string;

	@ApiProperty({
		required: false,
		type: [String],
		example: ['active', 'inactive'],
		description: 'List of status values to filter by. Pass as repeated query params or CSV.',
	})
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	@Transform(({ value }) => {
		if (value === undefined || value === null || value === '') return undefined;
		if (Array.isArray(value)) return value;
		return String(value)
			.split(',')
			.map((v) => v.trim())
			.filter(Boolean);
	})
	status?: string[];

	@ApiProperty({ required: false, description: 'Search keyword' })
	@IsOptional()
	@IsString()
	keywords?: string;

	@ApiProperty({
		required: false,
		default: 1,
		description: 'Page number (1-based). Set 0 to disable pagination.',
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	page_number?: number = 1;

	@ApiProperty({
		required: false,
		default: 25,
		description: 'Page size / limit. Ignored when page_number = 0.',
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	page_size?: number = 25;
}
