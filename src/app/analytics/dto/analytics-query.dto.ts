import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

/**
 * Date-range query shared across every analytics endpoint. `date_from` and
 * `date_to` are inclusive (`payment_date >= date_from` and
 * `payment_date <= date_to 23:59:59`, matching the payment.service pattern).
 * Blank/omitted = "no bound on that side" — endpoints choose sensible
 * fallbacks (e.g. last-30-days) if both are missing.
 *
 * `tenant_uuid` is admin-only; user tokens are scoped to their own tenant
 * by the controller regardless of what the client passes.
 */
export class AnalyticsQueryDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Admin only.' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: false, example: '2026-08-01' })
	@IsOptional()
	@IsDateString()
	date_from?: string;

	@ApiProperty({ required: false, example: '2026-08-31' })
	@IsOptional()
	@IsDateString()
	date_to?: string;

	@ApiProperty({ required: false, default: 10, description: 'Row cap for top-N endpoints.' })
	@Transform(({ value }) => (value === '' || value === undefined ? undefined : value))
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	limit?: number = 10;
}
