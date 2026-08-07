import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
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
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';

import { AdminService } from './admin.service';
import { AuthService } from '../auth/auth.service';
import {
	CreateAdminDTO,
	DashboardChangePasswordDTO,
	ProfileChangePasswordDTO,
	SetAdminStatusDTO,
	UpdateAdminDTO,
} from './dto/admin.dto';

@ApiTags('Admin')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('admin')
export class AdminController {
	constructor(
		private readonly adminService: AdminService,
		private readonly authService: AuthService
	) {}

	@Get('/dashboard')
	@ApiOperation({ summary: 'Admin - Dashboard list (filters: date range, status[], keywords, pagination)' })
	async dashboard(@Res() res: Response, @Query() filters: DashboardQueryDTO) {
		try {
			const output = await this.adminService.listDashboard(filters);
			return ApiResponseHelper.sendResponse(res, output);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, 500);
		}
	}

	@Get('/view/:uuid')
	@ApiOperation({ summary: 'Admin - View by uuid' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string) {
		try {
			const output = await this.adminService.findByUuid(uuid);
			if (!output) return ApiResponseHelper.sendNotFound(res, 'Admin not found.');

			const { passphrase: _p, keycode: _k, ...safe } = output as any;
			return ApiResponseHelper.sendResponse(res, safe);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, 500);
		}
	}

	@Post('/create')
	@ApiOperation({ summary: 'Admin - Create' })
	@ApiBody({ type: CreateAdminDTO })
	async create(@Res() res: Response, @Body() data: CreateAdminDTO, @CurrentUser() user: any) {
		try {
			if (await this.adminService.usernameTaken(data.username)) {
				return ApiResponseHelper.sendAlreadyExist(res, 'Username already exists.');
			}

			const created = await this.adminService.create({
				username: data.username,
				password: data.password,
				name: data.name,
				email: data.email,
				role: data.role,
				created_by: user?.name || user?.username || 'system',
			});

			const { passphrase: _p, keycode: _k, ...safe } = created as any;
			return ApiResponseHelper.sendResponse(res, safe, 'Admin created.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, 500);
		}
	}

	@Patch('/update/:uuid')
	@ApiOperation({ summary: 'Admin - Update' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: UpdateAdminDTO })
	async update(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: UpdateAdminDTO,
		@CurrentUser() user: any
	) {
		try {
			const updated = await this.adminService.update(uuid, {
				...data,
				updated_by: user?.name || user?.username || 'system',
			} as any);
			if (!updated) return ApiResponseHelper.sendNotFound(res, 'Admin not found.');

			const { passphrase: _p, keycode: _k, ...safe } = updated as any;
			return ApiResponseHelper.sendResponse(res, safe, 'Admin updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, 500);
		}
	}

	@Delete('/delete/:uuid')
	@ApiOperation({ summary: 'Admin - Delete' })
	@ApiParam({ name: 'uuid', required: true })
	async delete(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() user: any) {
		try {
			if (user?.uuid === uuid) {
				return ApiResponseHelper.sendBadRequest(res, 'You cannot delete your own account.');
			}

			const count = await this.adminService.delete(uuid);
			if (!count) return ApiResponseHelper.sendNotFound(res, 'Admin not found.');
			return ApiResponseHelper.sendResponse(res, { uuid, deleted: count }, 'Admin deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, 500);
		}
	}

	@Patch('/set-status/:uuid')
	@ApiOperation({ summary: 'Admin - Set active / inactive' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SetAdminStatusDTO })
	async setStatus(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SetAdminStatusDTO,
		@CurrentUser() user: any
	) {
		try {
			const updated = await this.adminService.setStatus(uuid, data.status, user?.name || user?.username || 'system');
			if (!updated) return ApiResponseHelper.sendNotFound(res, 'Admin not found.');

			const { passphrase: _p, keycode: _k, ...safe } = updated as any;
			return ApiResponseHelper.sendResponse(res, safe, `Admin set to ${data.status}.`);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, 500);
		}
	}

	@Patch('/change-password/:uuid')
	@ApiOperation({ summary: 'Admin - Change password from dashboard (no old password required)' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: DashboardChangePasswordDTO })
	async changePasswordDashboard(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: DashboardChangePasswordDTO,
		@CurrentUser() user: any
	) {
		try {
			const updated = await this.adminService.changePassword({
				uuid,
				newPassword: data.password,
				changed_by: user?.name || user?.username || 'system',
				source: 'dashboard',
			});
			if (!updated) return ApiResponseHelper.sendNotFound(res, 'Admin not found.');

			return ApiResponseHelper.sendResponse(res, { uuid: updated.uuid }, 'Password changed successfully.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, 500);
		}
	}

	@Patch('/profile/change-password')
	@ApiOperation({ summary: 'Admin - Change own password (profile) — requires old password' })
	@ApiBody({ type: ProfileChangePasswordDTO })
	async changePasswordProfile(
		@Res() res: Response,
		@Body() data: ProfileChangePasswordDTO,
		@CurrentUser() user: any
	) {
		try {
			const me = await this.adminService.findByUuid(user.uuid);
			if (!me) return ApiResponseHelper.sendNotFound(res, 'Admin not found.');

			const ok = await this.authService.validatePassword(data.old_password, me.passphrase);
			if (!ok) return ApiResponseHelper.sendResponse(res, null, 'Old password does not match.', 400);

			const updated = await this.adminService.changePassword({
				uuid: me.uuid,
				newPassword: data.password,
				changed_by: me.name || me.username,
				source: 'profile',
			});

			return ApiResponseHelper.sendResponse(res, { uuid: updated?.uuid }, 'Password changed successfully.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, 500);
		}
	}
}
