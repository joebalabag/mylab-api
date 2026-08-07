import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	IsIn,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	MaxLength,
	Min,
} from 'class-validator';

import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);

export const EXPENSE_STATUSES = ['active', 'void'] as const;

export class CreateExpenseDTO {
	@ApiProperty({
		required: false,
		format: 'uuid',
		description: 'Tenant UUID. Required with admin token; auto-scoped for user tokens.',
	})
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({
		required: false,
		format: 'uuid',
		description:
			'Owner user UUID. Optional — falls back to the current user token; admin may set explicitly to log on behalf of another cashier.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsUUID()
	user_uuid?: string;

	@ApiProperty({
		required: true,
		example: '2026-07-11',
		description: 'Transaction date (YYYY-MM-DD).',
	})
	@IsNotEmpty()
	@Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date_transact must be YYYY-MM-DD' })
	date_transact!: string;

	@ApiProperty({ required: true, example: 'Utilities' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	category!: string;

	@ApiProperty({ required: true, example: 'Electric bill – July' })
	@IsNotEmpty()
	@IsString()
	@MaxLength(500)
	description!: string;

	@ApiProperty({ required: true, example: 2500 })
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	amount!: number;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	notes?: string;
}

export class UpdateExpenseDTO {
	@ApiProperty({
		required: false,
		format: 'uuid',
		description:
			'Ignored. Tenant is inherited from the existing row — accepted here so clients can echo the record back safely.',
	})
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: false, example: '2026-07-11' })
	@Transform(emptyToUndef)
	@IsOptional()
	@Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date_transact must be YYYY-MM-DD' })
	date_transact?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	category?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(500)
	description?: string;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@Type(() => Number)
	@IsOptional()
	@IsNumber()
	@Min(0)
	amount?: number;

	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	notes?: string;
}

export class SetExpenseStatusDTO {
	@ApiProperty({ required: true, enum: EXPENSE_STATUSES })
	@IsNotEmpty()
	@IsIn(EXPENSE_STATUSES as unknown as string[])
	status!: 'active' | 'void';
}

export class VoidExpenseDTO {
	@ApiProperty({ required: false })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	reason?: string;
}

export class ExpenseDashboardQueryDTO extends DashboardQueryDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Filter by tenant (admin only).' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({ required: false, format: 'uuid' })
	@IsOptional()
	@IsUUID()
	user_uuid?: string;

	@ApiProperty({ required: false, example: 'Utilities' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(100)
	category?: string;

	@ApiProperty({
		required: false,
		example: '2026-07-01',
		description: 'Filter by date_transact lower bound (inclusive).',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date_transact_from must be YYYY-MM-DD' })
	date_transact_from?: string;

	@ApiProperty({
		required: false,
		example: '2026-07-31',
		description: 'Filter by date_transact upper bound (inclusive).',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date_transact_to must be YYYY-MM-DD' })
	date_transact_to?: string;
}
