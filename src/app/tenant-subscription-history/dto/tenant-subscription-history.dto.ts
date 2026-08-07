import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';
import { emptyToUndef, toBool } from '@/common/helpers/transform.helper';

export class SubscriptionHistoryDashboardQueryDTO extends DashboardQueryDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Filter to a specific tenant (admin only).' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;

	@ApiProperty({
		required: false,
		enum: ['active', 'scheduled', 'expired', 'cancelled'],
		description: 'Row status. Also honored via inherited `status[]` for multi-select.',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsIn(['active', 'scheduled', 'expired', 'cancelled'])
	row_status?: 'active' | 'scheduled' | 'expired' | 'cancelled';

	@ApiProperty({
		required: false,
		format: 'uuid',
		description: 'Only history rows created by this payment (from an approval).',
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsUUID()
	payment_uuid?: string;

	@ApiProperty({
		required: false,
		type: Boolean,
		description: 'When true, only rows created by super-admin overrides (alter_reason IS NOT NULL).',
	})
	@Transform(toBool)
	@IsOptional()
	@IsBoolean()
	has_alter_reason?: boolean;
}

export class SubscriptionHistoryForTenantQueryDTO {
	@ApiProperty({
		required: false,
		enum: ['active', 'scheduled', 'expired', 'cancelled'],
	})
	@Transform(emptyToUndef)
	@IsOptional()
	@IsIn(['active', 'scheduled', 'expired', 'cancelled'])
	row_status?: 'active' | 'scheduled' | 'expired' | 'cancelled';

	@ApiProperty({ required: false, description: 'Cap the number of rows returned (default: all).' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	limit?: string;
}
