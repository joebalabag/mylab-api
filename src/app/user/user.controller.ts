import {
	Body,
	Controller,
	Delete,
	ForbiddenException,
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
import { SkipSubscriptionCheck } from '@/common/decorators/skip-subscription-check.decorator';

import { UserService } from './user.service';
import { AuthService } from '../auth/auth.service';
import {
	CreateUserDTO,
	DashboardChangeUserPasswordDTO,
	ProfileChangeUserPasswordDTO,
	SetUserStatusDTO,
	UpdateUserDTO,
} from './dto/user.dto';
import { UserDashboardQueryDTO } from './dto/user-dashboard.dto';
import { VerifyCredentialsDTO } from './dto/verify-credentials.dto';
import { User } from './user.model';

/**
 * User-management endpoints can be called by:
 *   - `admin` token (super admin) — cross-tenant, uses body/query tenant_uuid as-is.
 *   - `user` token whose role is `admin` or `manager` — auto-scoped to the caller's own tenant.
 * Other user roles (cashier, stock_clerk, staff…) get 403.
 */
const MANAGER_ROLES = ['admin', 'manager'];

function isManagerUser(current: any): boolean {
	return current?.type === 'user' && MANAGER_ROLES.includes((current.role || '').toLowerCase());
}

function requireUser(current: any) {
	if (current?.type !== 'user') throw new ForbiddenException('User token required.');
}

/**
 * Resolves the tenant scope for a request:
 *   - admin token: uses whatever `requestedTenantUuid` was asked for.
 *   - manager user token: forces caller's own tenant (body/query tenant_uuid ignored).
 *   - anyone else: 403.
 */
function resolveTenantScope(current: any, requestedTenantUuid?: string): string | undefined {
	if (current?.type === 'admin') return requestedTenantUuid;
	if (isManagerUser(current)) return current.tenant_uuid;
	throw new ForbiddenException('Requires admin token or user with admin/manager role.');
}

function assertOwnsUser(current: any, existing: User) {
	if (current?.type === 'admin') return;
	if (isManagerUser(current) && current.tenant_uuid === existing.tenant_uuid) return;
	throw new ForbiddenException('User belongs to a different tenant, or your role is not permitted.');
}

@ApiTags('User')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('user')
export class UserController {
	constructor(
		private readonly service: UserService,
		private readonly authService: AuthService
	) {}

	@Get('/dashboard')
	@ApiOperation({
		summary:
			'User - Dashboard list. Admin cross-tenant; user (admin/manager role) auto-scoped to own tenant. Filters: tenant_uuid, date range, status[], keywords, pagination',
	})
	async dashboard(@Res() res: Response, @Query() filters: UserDashboardQueryDTO, @CurrentUser() current: any) {
		try {
			const scoped: UserDashboardQueryDTO = {
				...filters,
				tenant_uuid: resolveTenantScope(current, filters.tenant_uuid),
			};
			const output = await this.service.listDashboard(scoped);
			return ApiResponseHelper.sendResponse(res, output);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/view/:uuid')
	@ApiOperation({ summary: 'User - View by uuid' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'User not found.');
			assertOwnsUser(current, row);

			const { passphrase: _p, keycode: _k, ...safe } = row as any;
			return ApiResponseHelper.sendResponse(res, safe);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/create')
	@ApiOperation({ summary: 'User - Create' })
	@ApiBody({ type: CreateUserDTO })
	async create(@Res() res: Response, @Body() data: CreateUserDTO, @CurrentUser() current: any) {
		try {
			const tenant_uuid = resolveTenantScope(current, data.tenant_uuid);
			if (!tenant_uuid) {
				return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');
			}

			if (current?.type === 'admin' && !(await this.service.tenantExists(tenant_uuid))) {
				return ApiResponseHelper.sendBadRequest(res, 'Tenant does not exist.');
			}
			if (await this.service.usernameTaken(data.username)) {
				return ApiResponseHelper.sendAlreadyExist(res, 'Username already exists.');
			}

			const created = await this.service.create({
				tenant_uuid,
				username: data.username,
				password: data.password,
				name: data.name,
				email: data.email,
				role: data.role,
				license_number: data.license_number,
				lab_display_name: data.lab_display_name,
				created_by: current?.name || current?.username || 'system',
			});

			const { passphrase: _p, keycode: _k, ...safe } = created as any;
			return ApiResponseHelper.sendResponse(res, safe, 'User created.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/update/:uuid')
	@ApiOperation({ summary: 'User - Update' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: UpdateUserDTO })
	async update(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: UpdateUserDTO,
		@CurrentUser() current: any
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'User not found.');
			assertOwnsUser(current, existing);

			const updated = await this.service.update(uuid, {
				...data,
				updated_by: current?.name || current?.username || 'system',
			} as any);

			const { passphrase: _p, keycode: _k, ...safe } = updated as any;
			return ApiResponseHelper.sendResponse(res, safe, 'User updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Delete('/delete/:uuid')
	@ApiOperation({ summary: 'User - Delete' })
	@ApiParam({ name: 'uuid', required: true })
	async delete(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'User not found.');
			assertOwnsUser(current, existing);

			if (current?.type === 'user' && current.uuid === uuid) {
				return ApiResponseHelper.sendBadRequest(res, 'You cannot delete your own account.');
			}

			const count = await this.service.delete(uuid);
			return ApiResponseHelper.sendResponse(res, { uuid, deleted: count }, 'User deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/set-status/:uuid')
	@ApiOperation({ summary: 'User - Set active / inactive' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SetUserStatusDTO })
	async setStatus(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SetUserStatusDTO,
		@CurrentUser() current: any
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'User not found.');
			assertOwnsUser(current, existing);

			const updated = await this.service.setStatus(uuid, data.status, current?.name || current?.username || 'system');

			const { passphrase: _p, keycode: _k, ...safe } = updated as any;
			return ApiResponseHelper.sendResponse(res, safe, `User set to ${data.status}.`);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/change-password/:uuid')
	@ApiOperation({ summary: 'User - Change password from dashboard (no old password required)' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: DashboardChangeUserPasswordDTO })
	async changePasswordDashboard(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: DashboardChangeUserPasswordDTO,
		@CurrentUser() current: any
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'User not found.');
			assertOwnsUser(current, existing);

			const updated = await this.service.changePassword({
				uuid,
				newPassword: data.password,
				changed_by: current?.name || current?.username || 'system',
				source: 'dashboard',
			});
			return ApiResponseHelper.sendResponse(res, { uuid: updated?.uuid }, 'Password changed successfully.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/verify-credentials')
	@ApiOperation({
		summary:
			'Verify supervisor credentials (admin/manager role only). Scoped to the caller tenant from the user token — used for overrides like void-transaction.',
	})
	@ApiBody({ type: VerifyCredentialsDTO })
	async verifyCredentials(
		@Res() res: Response,
		@Body() data: VerifyCredentialsDTO,
		@CurrentUser() current: any
	) {
		try {
			requireUser(current);

			// `allow_any_role` broadens the whitelist to every valid tenant role,
			// so low-stakes confirms (drawer kick, etc.) accept any active user.
			// Default (undefined/false) keeps the supervisor gate for existing
			// callers (void authorization, etc.).
			const allowedRoles = data.allow_any_role
				? ['admin', 'manager', 'cashier', 'stock_clerk', 'staff']
				: undefined; // service uses its default: admin/manager
			const result = await this.service.verifyCredentials(
				current.tenant_uuid,
				data.username,
				data.password,
				allowedRoles,
			);

			if (!result.verified) {
				const status = result.code === 'forbidden' ? 403 : 401;
				return ApiResponseHelper.sendResponse(res, { verified: false }, result.message, status);
			}

			return ApiResponseHelper.sendResponse(res, { verified: true, user: result.user }, 'Credentials verified.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/profile/change-password')
	@SkipSubscriptionCheck()
	@ApiOperation({ summary: 'User - Change own password (user token only, requires old password)' })
	@ApiBody({ type: ProfileChangeUserPasswordDTO })
	async changePasswordProfile(
		@Res() res: Response,
		@Body() data: ProfileChangeUserPasswordDTO,
		@CurrentUser() current: any
	) {
		try {
			requireUser(current);

			const me = await this.service.findByUuid(current.uuid);
			if (!me) return ApiResponseHelper.sendNotFound(res, 'User not found.');

			const ok = await this.authService.validatePassword(data.old_password, me.passphrase);
			if (!ok) return ApiResponseHelper.sendResponse(res, null, 'Old password does not match.', 400);

			const updated = await this.service.changePassword({
				uuid: me.uuid,
				newPassword: data.password,
				changed_by: me.name || me.username,
				source: 'profile',
			});

			return ApiResponseHelper.sendResponse(res, { uuid: updated?.uuid }, 'Password changed successfully.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
