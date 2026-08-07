import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';

/**
 * Adds tenant_uuid filter on top of the common dashboard query shape.
 * Super admin can list users across tenants, or narrow to a specific tenant.
 */
export class UserDashboardQueryDTO extends DashboardQueryDTO {
	@ApiProperty({ required: false, format: 'uuid', description: 'Filter users to a specific tenant' })
	@IsOptional()
	@IsUUID()
	tenant_uuid?: string;
}
