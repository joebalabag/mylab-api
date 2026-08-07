import {
	Body,
	Controller,
	ForbiddenException,
	Get,
	Param,
	Post,
	Query,
	Res,
	UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { ApiResponseHelper } from '@/common/helpers/response.helper';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

import { UserAccessService } from './user-access.service';
import { SaveUserAccessDTO, UserAccessListQueryDTO } from './dto/user-access.dto';
import { User } from '../user/user.model';

function assertCanManageUser(current: any, target: User) {
	if (current?.type === 'admin') return;
	if (current?.type === 'user' && current.tenant_uuid === target.tenant_uuid) return;
	throw new ForbiddenException('Target user belongs to a different tenant.');
}

@ApiTags('User Access')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('user-access')
export class UserAccessController {
	constructor(private readonly service: UserAccessService) {}

	@Get('/for-user/:user_uuid')
	@ApiOperation({
		summary:
			'User Access - Merged permission matrix for a user. Returns EVERY access_templates row combined with the user\'s user_accesses override (if any). Template rows not yet assigned to the user come back with has_access=false and is_assigned=false, so newly added template nodes show up automatically. Admin: any user. User token: only users in own tenant. Optional only_granted filter.',
	})
	@ApiParam({ name: 'user_uuid', required: true })
	async forUser(
		@Res() res: Response,
		@Param('user_uuid') user_uuid: string,
		@Query() filters: UserAccessListQueryDTO,
		@CurrentUser() current: any,
	) {
		try {
			const target = await this.service.getUser(user_uuid);
			if (!target) return ApiResponseHelper.sendNotFound(res, 'User not found.');
			assertCanManageUser(current, target);
			const rows = await this.service.listForUser(user_uuid, filters);
			return ApiResponseHelper.sendResponse(res, rows);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/me')
	@ApiOperation({
		summary:
			'User Access - Merged permission matrix for the current user token (same shape as /for-user/:user_uuid). Includes template rows the user has not been assigned yet.',
	})
	async me(
		@Res() res: Response,
		@Query() filters: UserAccessListQueryDTO,
		@CurrentUser() current: any,
	) {
		try {
			if (current?.type !== 'user') throw new ForbiddenException('User token required.');
			const rows = await this.service.listForUser(current.uuid, filters);
			return ApiResponseHelper.sendResponse(res, rows);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/save/:user_uuid')
	@ApiOperation({
		summary:
			'User Access - Bulk save the full permission matrix for a user. All existing rows for the user are deleted and replaced with the payload (atomic transaction). Items reference access_templates by navigation_id; catalog / main / sub / remarks are snapshotted from the template.',
	})
	@ApiParam({ name: 'user_uuid', required: true })
	@ApiBody({ type: SaveUserAccessDTO })
	async save(
		@Res() res: Response,
		@Param('user_uuid') user_uuid: string,
		@Body() data: SaveUserAccessDTO,
		@CurrentUser() current: any,
	) {
		try {
			const target = await this.service.getUser(user_uuid);
			if (!target) return ApiResponseHelper.sendNotFound(res, 'User not found.');
			assertCanManageUser(current, target);

			const rows = await this.service.saveForUser(
				user_uuid,
				data,
				current?.name || current?.username || 'system',
			);
			return ApiResponseHelper.sendResponse(res, rows, 'Access saved.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
