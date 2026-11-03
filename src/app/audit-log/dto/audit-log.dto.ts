import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';

const emptyToUndef = ({ value }: { value: any }) => (value === '' ? undefined : value);

export const AUDIT_ACTIONS = [
	'create',
	'update',
	'delete',
	'login',
	'login_failed',
	'logout',
	'password_reset_request',
	'password_reset_complete',
] as const;

export class AuditLogDashboardQueryDTO extends DashboardQueryDTO {
	@ApiProperty({ required: false, description: 'Tenant uuid (super-admin only; ignored for tenant users).' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(64)
	tenant_uuid?: string;

	@ApiProperty({ required: false, description: 'Filter by entity type, e.g. "payment", "lab_report".' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(64)
	entity_type?: string;

	@ApiProperty({ required: false, description: 'Filter by entity uuid.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(64)
	entity_uuid?: string;

	@ApiProperty({ required: false, description: 'Filter by actor uuid.' })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsString()
	@MaxLength(64)
	actor_uuid?: string;

	@ApiProperty({ required: false, enum: AUDIT_ACTIONS })
	@Transform(emptyToUndef)
	@IsOptional()
	@IsIn(AUDIT_ACTIONS as unknown as string[])
	action?: string;
}
