import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	IsIn,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	Max,
	MaxLength,
	Min,
	ValidateIf,
} from 'class-validator';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);

/** Storage / API values for the discount_type column. */
export const DISCOUNT_TYPES = ['percent', 'fix', 'open_amount'] as const;
export type DiscountTypeValue = (typeof DISCOUNT_TYPES)[number];

export class CreateDiscountDTO {
	@ApiProperty({
		required: false,
		format: 'uuid',
		description:
			'Tenant UUID. Required with admin token. Ignored/overridden when using a user token (auto-scoped).',
	})
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: true, example: 'SC-20', description: 'Short code, unique per tenant' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	code!: string;

	@ApiProperty({ required: true, example: 'Senior Citizen 20%' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(500)
	name!: string;

	@ApiProperty({
		required: true,
		enum: DISCOUNT_TYPES,
		description:
			'percent → value is a % (0–100); fix → value is a fixed amount; open_amount → value entered at use time (input value ignored / treated as 0).',
	})
	@IsNotEmpty()
	@IsIn(DISCOUNT_TYPES as unknown as string[])
	discount_type!: DiscountTypeValue;

	@ApiProperty({
		required: false,
		example: 20,
		description: 'Numeric value. For percent: 0–100. For fix: >= 0. For open_amount: ignored.',
	})
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	@ValidateIf((o) => o.discount_type === 'percent')
	@Max(100, { message: 'value must be between 0 and 100 for percent discount' })
	value?: number;
}

export class UpdateDiscountDTO {
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

	@ApiProperty({ required: false, enum: DISCOUNT_TYPES })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsIn(DISCOUNT_TYPES as unknown as string[])
	discount_type?: DiscountTypeValue;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	@ValidateIf((o) => o.discount_type === 'percent')
	@Max(100, { message: 'value must be between 0 and 100 for percent discount' })
	value?: number;
}

export class SetDiscountStatusDTO {
	@ApiProperty({ required: true, enum: ['active', 'inactive'] })
	@IsNotEmpty()
	@IsIn(['active', 'inactive'])
	status!: 'active' | 'inactive';
}

export class DiscountDashboardQueryDTO extends DashboardQueryDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Filter to a specific tenant (admin only)' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: false, enum: DISCOUNT_TYPES })
	@IsOptional()
	@IsIn(DISCOUNT_TYPES as unknown as string[])
	discount_type?: DiscountTypeValue;
}
