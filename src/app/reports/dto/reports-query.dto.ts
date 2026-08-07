import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);

/**
 * Base query for every /reports/* endpoint. All fields optional; endpoints
 * choose sensible defaults (usually last-30-days) when both bounds are omitted.
 * `tenant_uuid` is admin-only; user tokens are always scoped to their own
 * tenant by the controller.
 */
export class ReportsQueryDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Admin only.' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: false, example: '2026-08-01' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsDateString()
	date_from?: string;

	@ApiProperty({ required: false, example: '2026-08-31' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsDateString()
	date_to?: string;

	@ApiProperty({ required: false, description: 'Filter by cashier / recorder name (payments.created_by).' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	created_by?: string;

	@ApiProperty({ required: false, description: 'Filter expenses to a single category. Omit for all.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	category?: string;

	@ApiProperty({ required: false, default: 50 })
	@Transform(emptyToUndef)
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(500)
	limit?: number = 50;
}

/**
 * Year-scoped query for the Monthly reports. Defaults to the current year.
 */
export class ReportsYearQueryDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Admin only.' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: false, example: 2026 })
	@Transform(emptyToUndef)
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(2000)
	@Max(2100)
	year?: number;
}
