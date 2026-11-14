import {
	Body,
	Controller,
	Delete,
	ForbiddenException,
	forwardRef,
	Get,
	Inject,
	Param,
	Patch,
	Post,
	Query,
	Req,
	Res,
	UploadedFile,
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';

import { ApiResponseHelper } from '@/common/helpers/response.helper';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';
import { imageFileFilter, makeUploadStorage, toPublicUrl } from '@/common/helpers/upload.helper';

import { OwnerService } from './owner.service';
import { Owner } from './owner.model';
import { Tenant } from '../tenant/tenant.model';
import { AuthService } from '../auth/auth.service';
import { TenantService } from '../tenant/tenant.service';
import { TenantMigrationService } from '../tenant/tenant-migration.service';
import { UserService } from '../user/user.service';
import {
	CopyTenantCatalogDTO,
	TenantMigrationPasswordDTO,
} from '../tenant/dto/tenant-migration.dto';
import {
	AssignTenantDTO,
	CreateOwnerDTO,
	OwnerUpdateMyProfileDTO,
	OwnerChangePasswordDTO,
	OwnerUpdateMyTenantDTO,
	OwnerCreateUserDTO,
	OwnerUpdateUserDTO,
	OwnerUserStatusDTO,
	OwnerBulkPriceEditDTO,
	SetOwnerStatusDTO,
	UpdateOwnerDTO,
} from './dto/owner.dto';

function requireAdmin(user: any) {
	if (user?.type !== 'admin') {
		throw new ForbiddenException('Admin token required.');
	}
}

function requireOwner(user: any): string {
	if (user?.type !== 'owner' || !user?.uuid) {
		throw new ForbiddenException('Owner token required.');
	}
	return user.uuid as string;
}

const OWNER_LOGO_OPTS = {
	storage: makeUploadStorage('owners/logo'),
	fileFilter: imageFileFilter,
	limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
};

@ApiTags('Owner')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('owner')
export class OwnerController {
	constructor(
		private readonly service: OwnerService,
		private readonly authService: AuthService,
		@Inject(forwardRef(() => TenantService))
		private readonly tenantService: TenantService,
		@Inject(forwardRef(() => TenantMigrationService))
		private readonly migrationService: TenantMigrationService,
		private readonly userService: UserService,
	) {}

	// ─── Owner self-service (/owner/me/*) ───────────────────────────────
	// All require `type: 'owner'` tokens. Super-admin endpoints below use
	// `type: 'admin'` instead.

	@Get('/me')
	@ApiOperation({ summary: 'Owner (self) - Get own profile.' })
	async getMe(@Res() res: Response, @CurrentUser() user: any) {
		try {
			const owner_uuid = requireOwner(user);
			const me = await this.service.findByUuid(owner_uuid);
			if (!me) return ApiResponseHelper.sendNotFound(res, 'Owner not found.');
			return ApiResponseHelper.sendResponse(res, me);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/me')
	@ApiOperation({ summary: 'Owner (self) - Update own profile. Status, username, and password are locked here — use the dedicated endpoints.' })
	@ApiBody({ type: OwnerUpdateMyProfileDTO })
	async updateMe(@Res() res: Response, @Body() data: OwnerUpdateMyProfileDTO, @CurrentUser() user: any) {
		try {
			const owner_uuid = requireOwner(user);
			if (data.email && (await this.service.emailTaken(data.email, owner_uuid))) {
				return ApiResponseHelper.sendAlreadyExist(res, 'Email already belongs to another owner.');
			}
			const updated = await this.service.update(owner_uuid, {
				...data,
				updated_by: user?.name || user?.username || 'owner-self',
			} as any);
			if (!updated) return ApiResponseHelper.sendNotFound(res, 'Owner not found.');
			return ApiResponseHelper.sendResponse(res, updated, 'Profile updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/me/change-password')
	@ApiOperation({ summary: 'Owner (self) - Change own password. Requires old password.' })
	@ApiBody({ type: OwnerChangePasswordDTO })
	async changeMyPassword(@Res() res: Response, @Body() data: OwnerChangePasswordDTO, @CurrentUser() user: any) {
		try {
			const owner_uuid = requireOwner(user);
			const me = await this.service.findByUuid(owner_uuid);
			if (!me) return ApiResponseHelper.sendNotFound(res, 'Owner not found.');

			const ok = await this.authService.validatePassword(data.old_password, me.passphrase);
			if (!ok) return ApiResponseHelper.sendResponse(res, null, 'Old password does not match.', 400);

			const updated = await this.service.setPassword(owner_uuid, data.password, me.username);
			return ApiResponseHelper.sendResponse(res, { uuid: updated?.uuid }, 'Password changed successfully.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/me/logo')
	@ApiOperation({ summary: 'Owner (self) - Upload or replace logo (multipart, max 2 MB, image only).' })
	@ApiConsumes('multipart/form-data')
	@UseInterceptors(FileInterceptor('logo', OWNER_LOGO_OPTS))
	async uploadLogo(
		@Res() res: Response,
		@UploadedFile() file: Express.Multer.File | undefined,
		@CurrentUser() user: any,
	) {
		try {
			const owner_uuid = requireOwner(user);
			if (!file) return ApiResponseHelper.sendBadRequest(res, 'No logo file received.');
			const me = await this.service.findByUuid(owner_uuid);
			if (!me) return ApiResponseHelper.sendNotFound(res, 'Owner not found.');

			const next_url = toPublicUrl(file.path);
			const updated = await this.service.update(owner_uuid, {
				logo_url: next_url,
				updated_by: user?.name || user?.username || 'owner-self',
			} as any);
			return ApiResponseHelper.sendResponse(res, updated, 'Logo updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Delete('/me/logo')
	@ApiOperation({ summary: 'Owner (self) - Clear the current logo.' })
	async clearLogo(@Res() res: Response, @CurrentUser() user: any) {
		try {
			const owner_uuid = requireOwner(user);
			const updated = await this.service.update(owner_uuid, {
				logo_url: null,
				updated_by: user?.name || user?.username || 'owner-self',
			} as any);
			if (!updated) return ApiResponseHelper.sendNotFound(res, 'Owner not found.');
			return ApiResponseHelper.sendResponse(res, updated, 'Logo cleared.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	// ─── Owner dashboard + tenants (Phase 2 Stage C) ─────────────────

	@Get('/me/summary')
	@ApiOperation({ summary: 'Owner (self) - Dashboard summary (aggregate across owned tenants).' })
	async getSummary(@Res() res: Response, @CurrentUser() user: any) {
		try {
			const owner_uuid = requireOwner(user);
			const summary = await this.service.getOwnerSummary(owner_uuid);
			return ApiResponseHelper.sendResponse(res, summary);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/me/tenants')
	@ApiOperation({ summary: 'Owner (self) - List owned tenants with per-tenant metrics.' })
	async listMyTenants(@Res() res: Response, @CurrentUser() user: any) {
		try {
			const owner_uuid = requireOwner(user);
			const rows = await this.service.listTenantsWithMetrics(owner_uuid);
			return ApiResponseHelper.sendResponse(res, rows);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/me/tenants/:uuid')
	@ApiOperation({
		summary:
			'Owner (self) - Edit a tenant you own. Covers display_name / branch / status / contact fields. TIN, address, receipts, and subscription stay with super-admin.',
	})
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: OwnerUpdateMyTenantDTO })
	async updateMyTenant(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: OwnerUpdateMyTenantDTO,
		@CurrentUser() user: any,
	) {
		try {
			const owner_uuid = requireOwner(user);
			if (!(await this.service.ownsTenant(owner_uuid, uuid))) {
				throw new ForbiddenException('Tenant is not owned by the signed-in owner.');
			}
			const updated = await this.tenantService.update(uuid, {
				...data,
				updated_by: user?.name || user?.username || 'owner-self',
			} as any);
			if (!updated) return ApiResponseHelper.sendNotFound(res, 'Tenant not found.');
			return ApiResponseHelper.sendResponse(res, updated, 'Tenant updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	// ─── Owner migrations (Phase 2 Stage D) ──────────────────────────

	@Get('/me/tenants/:uuid/migration/record-counts')
	@ApiOperation({ summary: 'Owner - Preview record counts the migration actions would touch. No password needed.' })
	@ApiParam({ name: 'uuid', required: true })
	async ownerMigrationRecordCounts(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() user: any) {
		try {
			requireOwner(user);
			const counts = await this.migrationService.recordCountsAsOwner(uuid, user);
			return ApiResponseHelper.sendResponse(res, counts);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/me/tenants/:uuid/migration/delete-transactions')
	@ApiOperation({ summary: 'Owner - Delete all transactions for an owned tenant. Re-verifies owner password.' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: TenantMigrationPasswordDTO })
	async ownerMigrationDeleteTransactions(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: TenantMigrationPasswordDTO,
		@CurrentUser() user: any,
	) {
		try {
			requireOwner(user);
			const counts = await this.migrationService.deleteTransactionsAsOwner(uuid, data.password, user);
			return ApiResponseHelper.sendResponse(res, { tenant_uuid: uuid, deleted: counts }, 'Transactions deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/me/tenants/:uuid/migration/delete-lookup-data')
	@ApiOperation({ summary: 'Owner - Delete lookup/catalog data for an owned tenant. Re-verifies owner password.' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: TenantMigrationPasswordDTO })
	async ownerMigrationDeleteLookupData(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: TenantMigrationPasswordDTO,
		@CurrentUser() user: any,
	) {
		try {
			requireOwner(user);
			const counts = await this.migrationService.deleteLookupDataAsOwner(uuid, data.password, user);
			return ApiResponseHelper.sendResponse(res, { tenant_uuid: uuid, deleted: counts }, 'Look-up data deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/me/tenants/:uuid/migration/delete-patient-records')
	@ApiOperation({ summary: 'Owner - Delete patient records + their transactions for an owned tenant. Re-verifies owner password.' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: TenantMigrationPasswordDTO })
	async ownerMigrationDeletePatientRecords(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: TenantMigrationPasswordDTO,
		@CurrentUser() user: any,
	) {
		try {
			requireOwner(user);
			const counts = await this.migrationService.deletePatientRecordsAsOwner(uuid, data.password, user);
			return ApiResponseHelper.sendResponse(res, { tenant_uuid: uuid, deleted: counts }, 'Patient records and transactions deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/me/tenants/:uuid/migration/copy-catalog')
	@ApiOperation({
		summary: 'Owner - Copy catalog from one owned tenant into another. Both tenants must belong to the signed-in owner.',
	})
	@ApiParam({ name: 'uuid', required: true, description: 'Target tenant UUID.' })
	@ApiBody({ type: CopyTenantCatalogDTO })
	async ownerMigrationCopyCatalog(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: CopyTenantCatalogDTO,
		@CurrentUser() user: any,
	) {
		try {
			requireOwner(user);
			const result = await this.migrationService.copyCatalogAsOwner(
				uuid,
				data.password,
				data.source_tenant_uuid,
				data.tables,
				user,
			);
			return ApiResponseHelper.sendResponse(res, result, 'Catalog copied.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	// ─── Owner catalog + price comparison (Phase 2 Stage E) ─────────

	@Get('/me/catalog')
	@ApiOperation({ summary: 'Owner (self) - Read catalog items for one owned tenant (test_items joined with category/group).' })
	async ownerCatalogList(
		@Res() res: Response,
		@Query('tenant_uuid') tenant_uuid: string | undefined,
		@CurrentUser() user: any,
	) {
		try {
			const owner_uuid = requireOwner(user);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');
			if (!(await this.service.ownsTenant(owner_uuid, tenant_uuid))) {
				throw new ForbiddenException('Tenant is not owned by the signed-in owner.');
			}
			const knex = Tenant.knex();
			const rows = await knex('test_items')
				.leftJoin('item_categories', 'item_categories.uuid', 'test_items.item_category_uuid')
				.leftJoin('item_groups', 'item_groups.uuid', 'item_categories.item_group_uuid')
				.where('test_items.tenant_uuid', tenant_uuid)
				.select(
					'test_items.uuid as uuid',
					'test_items.tenant_uuid as tenant_uuid',
					'test_items.code as item_code',
					'test_items.name as name',
					'test_items.price as price',
					'test_items.status as status',
					'item_categories.name as category',
					'item_groups.name as item_group',
				)
				.orderBy('test_items.code');
			return ApiResponseHelper.sendResponse(res, rows);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/me/catalog/compare')
	@ApiOperation({
		summary: 'Owner (self) - Price-comparison pivot of test_items across all owned tenants, keyed by item_code.',
	})
	async ownerCatalogCompare(@Res() res: Response, @CurrentUser() user: any) {
		try {
			const owner_uuid = requireOwner(user);
			const result = await this.service.priceComparison(owner_uuid);
			return ApiResponseHelper.sendResponse(res, result);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/me/catalog/:item_code/prices')
	@ApiOperation({
		summary:
			'Owner (self) - Bulk-edit prices for one item_code across owned tenants. Body: { prices: { tenant_uuid: price } }. Unowned tenants in the payload are silently skipped and reported in the response.',
	})
	@ApiParam({ name: 'item_code', required: true })
	@ApiBody({ type: OwnerBulkPriceEditDTO })
	async ownerCatalogBulkPriceEdit(
		@Res() res: Response,
		@Param('item_code') item_code: string,
		@Body() data: OwnerBulkPriceEditDTO,
		@CurrentUser() user: any,
	) {
		try {
			const owner_uuid = requireOwner(user);
			const result = await this.service.applyPriceEdits(
				owner_uuid,
				item_code,
				data.prices || {},
				user?.name || user?.username || 'owner-self',
				data.add || {},
				user,
			);
			const parts: string[] = [];
			if (result.touched) parts.push(`Updated ${result.touched} price${result.touched === 1 ? '' : 's'}`);
			if (result.added) parts.push(`added listing${result.added === 1 ? '' : 's'} to ${result.added} tenant${result.added === 1 ? '' : 's'}`);
			const summary = parts.length ? `${parts.join(' and ')}.` : 'No changes saved.';
			return ApiResponseHelper.sendResponse(res, result, summary);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	// ─── Owner users (Phase 2 Stage F) ──────────────────────────────

	@Get('/me/users')
	@ApiOperation({
		summary: 'Owner (self) - List users across owned tenants. Filters: tenant_uuid, status[], keywords, role.',
	})
	async ownerListUsers(
		@Res() res: Response,
		@Query('tenant_uuid') tenant_uuid: string | undefined,
		@Query('role') role: string | undefined,
		@Query() filters: DashboardQueryDTO,
		@CurrentUser() user: any,
	) {
		try {
			const owner_uuid = requireOwner(user);
			const ownedUuids = await this.service.listOwnedTenantUuids(owner_uuid);
			if (tenant_uuid) {
				if (!ownedUuids.includes(tenant_uuid)) {
					throw new ForbiddenException('Tenant is not owned by the signed-in owner.');
				}
			}
			const knex = Tenant.knex();
			const q = knex('users')
				.join('tenants', 'tenants.uuid', 'users.tenant_uuid')
				.whereIn('users.tenant_uuid', tenant_uuid ? [tenant_uuid] : ownedUuids)
				.select(
					'users.uuid as uuid',
					'users.tenant_uuid as tenant_uuid',
					'users.username as username',
					'users.name as name',
					'users.email as email',
					'users.role as role',
					'users.status as status',
					'users.last_logindate as last_logindate',
					'users.created_at as created_at',
					'tenants.display_name as tenant_display_name',
					'tenants.store_code as tenant_store_code',
				)
				.orderBy('users.created_at', 'desc');

			if (role) q.where('users.role', role);
			if (filters.status && filters.status.length) q.whereIn('users.status', filters.status);
			if (filters.keywords) {
				const kw = `%${filters.keywords}%`;
				q.where((qb) => {
					qb.where('users.username', 'ilike', kw)
						.orWhere('users.name', 'ilike', kw)
						.orWhere('users.email', 'ilike', kw);
				});
			}
			const rows = await q;
			return ApiResponseHelper.sendResponse(res, rows);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/me/users')
	@ApiOperation({ summary: 'Owner (self) - Create a user in one of the owned tenants.' })
	@ApiBody({ type: OwnerCreateUserDTO })
	async ownerCreateUser(@Res() res: Response, @Body() data: OwnerCreateUserDTO, @CurrentUser() user: any) {
		try {
			const owner_uuid = requireOwner(user);
			if (!(await this.service.ownsTenant(owner_uuid, data.tenant_uuid))) {
				throw new ForbiddenException('Tenant is not owned by the signed-in owner.');
			}
			if (await this.userService.usernameTaken(data.username)) {
				return ApiResponseHelper.sendAlreadyExist(res, 'Username already exists.');
			}
			const created = await this.userService.create({
				tenant_uuid: data.tenant_uuid,
				username: data.username,
				password: data.password,
				name: data.name,
				email: data.email,
				role: data.role,
				created_by: user?.name || user?.username || 'owner-self',
			});
			const { passphrase: _p, keycode: _k, ...safe } = created as any;
			return ApiResponseHelper.sendResponse(res, safe, 'User created.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/me/users/:uuid')
	@ApiOperation({ summary: 'Owner (self) - Update a user in an owned tenant.' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: OwnerUpdateUserDTO })
	async ownerUpdateUser(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: OwnerUpdateUserDTO,
		@CurrentUser() user: any,
	) {
		try {
			const owner_uuid = requireOwner(user);
			const target = await this.userService.findByUuid(uuid);
			if (!target) return ApiResponseHelper.sendNotFound(res, 'User not found.');
			if (!(await this.service.ownsTenant(owner_uuid, target.tenant_uuid))) {
				throw new ForbiddenException('User belongs to a tenant you do not own.');
			}
			const updated = await this.userService.update(uuid, {
				...data,
				updated_by: user?.name || user?.username || 'owner-self',
			} as any);
			const { passphrase: _p, keycode: _k, ...safe } = (updated || {}) as any;
			return ApiResponseHelper.sendResponse(res, safe, 'User updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/me/users/:uuid/status')
	@ApiOperation({ summary: 'Owner (self) - Toggle a user active/inactive in an owned tenant.' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: OwnerUserStatusDTO })
	async ownerSetUserStatus(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: OwnerUserStatusDTO,
		@CurrentUser() user: any,
	) {
		try {
			const owner_uuid = requireOwner(user);
			const target = await this.userService.findByUuid(uuid);
			if (!target) return ApiResponseHelper.sendNotFound(res, 'User not found.');
			if (!(await this.service.ownsTenant(owner_uuid, target.tenant_uuid))) {
				throw new ForbiddenException('User belongs to a tenant you do not own.');
			}
			const updated = await this.userService.setStatus(uuid, data.status, user?.name || user?.username || 'owner-self');
			const { passphrase: _p, keycode: _k, ...safe } = (updated || {}) as any;
			return ApiResponseHelper.sendResponse(res, safe, `User set to ${data.status}.`);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Delete('/me/users/:uuid')
	@ApiOperation({ summary: 'Owner (self) - Delete a user in an owned tenant.' })
	@ApiParam({ name: 'uuid', required: true })
	async ownerDeleteUser(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() user: any) {
		try {
			const owner_uuid = requireOwner(user);
			const target = await this.userService.findByUuid(uuid);
			if (!target) return ApiResponseHelper.sendNotFound(res, 'User not found.');
			if (!(await this.service.ownsTenant(owner_uuid, target.tenant_uuid))) {
				throw new ForbiddenException('User belongs to a tenant you do not own.');
			}
			const count = await this.userService.delete(uuid);
			return ApiResponseHelper.sendResponse(res, { uuid, deleted: count }, 'User deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	// ─── Super-admin owner management ──────────────────────────────────

	@Get('/dashboard')
	@ApiOperation({ summary: 'Owner - Dashboard list (admin only). Filters: date range, status[], keywords, pagination.' })
	async dashboard(@Res() res: Response, @Query() filters: DashboardQueryDTO, @CurrentUser() user: any) {
		try {
			requireAdmin(user);
			const output = await this.service.listDashboard(filters);
			return ApiResponseHelper.sendResponse(res, output);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/view/:uuid')
	@ApiOperation({ summary: 'Owner - View by uuid (admin only)' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() user: any) {
		try {
			requireAdmin(user);
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'Owner not found.');
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/username-available')
	@ApiOperation({ summary: 'Owner - Check username availability (admin only)' })
	async usernameAvailable(@Res() res: Response, @Query('username') username: string, @CurrentUser() user: any) {
		try {
			requireAdmin(user);
			const u = String(username || '').trim();
			if (u.length < 3) return ApiResponseHelper.sendResponse(res, { available: false, reason: 'too_short' });
			const taken = await this.service.usernameTaken(u);
			return ApiResponseHelper.sendResponse(res, { available: !taken });
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/create')
	@ApiOperation({ summary: 'Owner - Create (admin only)' })
	@ApiBody({ type: CreateOwnerDTO })
	async create(@Res() res: Response, @Body() data: CreateOwnerDTO, @CurrentUser() user: any) {
		try {
			requireAdmin(user);
			if (await this.service.usernameTaken(data.username)) {
				return ApiResponseHelper.sendAlreadyExist(res, 'Username already exists.');
			}
			if (data.email && (await this.service.emailTaken(data.email))) {
				return ApiResponseHelper.sendAlreadyExist(res, 'Email already belongs to another owner.');
			}
			const created = await this.service.create({
				username: data.username,
				password: data.password,
				name: data.name,
				business_name: data.business_name,
				email: data.email,
				phone: data.phone,
				created_by: user?.name || user?.username || 'system',
			});
			return ApiResponseHelper.sendResponse(res, created, 'Owner created.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/update/:uuid')
	@ApiOperation({ summary: 'Owner - Update profile (admin only)' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: UpdateOwnerDTO })
	async update(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: UpdateOwnerDTO,
		@CurrentUser() user: any,
	) {
		try {
			requireAdmin(user);
			if (data.email && (await this.service.emailTaken(data.email, uuid))) {
				return ApiResponseHelper.sendAlreadyExist(res, 'Email already belongs to another owner.');
			}
			const updated = await this.service.update(uuid, {
				...data,
				updated_by: user?.name || user?.username || 'system',
			} as any);
			if (!updated) return ApiResponseHelper.sendNotFound(res, 'Owner not found.');
			return ApiResponseHelper.sendResponse(res, updated, 'Owner updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/set-status/:uuid')
	@ApiOperation({ summary: 'Owner - Set active / inactive (admin only)' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SetOwnerStatusDTO })
	async setStatus(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SetOwnerStatusDTO,
		@CurrentUser() user: any,
	) {
		try {
			requireAdmin(user);
			const updated = await this.service.setStatus(uuid, data.status, user?.name || user?.username || 'system');
			if (!updated) return ApiResponseHelper.sendNotFound(res, 'Owner not found.');
			return ApiResponseHelper.sendResponse(res, updated, `Owner set to ${data.status}.`);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Delete('/delete/:uuid')
	@ApiOperation({ summary: 'Owner - Delete (admin only). Cascades assigned-tenant rows but keeps the tenants themselves.' })
	@ApiParam({ name: 'uuid', required: true })
	async delete(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() user: any) {
		try {
			requireAdmin(user);
			const count = await this.service.delete(uuid);
			if (!count) return ApiResponseHelper.sendNotFound(res, 'Owner not found.');
			return ApiResponseHelper.sendResponse(res, { uuid, deleted: count }, 'Owner deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/reset-password/:uuid')
	@ApiOperation({
		summary: 'Owner - Trigger password reset email (admin only). Stores a 1-hour token and emails the reset link.',
	})
	@ApiParam({ name: 'uuid', required: true })
	async resetPassword(
		@Res() res: Response,
		@Req() req: Request,
		@Param('uuid') uuid: string,
		@CurrentUser() user: any,
	) {
		try {
			requireAdmin(user);
			const ip = (req.ip || null) as string | null;
			const ua = (req.headers['user-agent'] as string) || null;
			const result = await this.authService.requestOwnerPasswordReset(uuid, ip, ua);
			if (!result.sent) {
				const msg = ({
					not_found:   'Owner not found.',
					inactive:    'Owner is inactive — activate the account before sending a reset.',
					no_email:    'Owner has no email on file. Set an email first.',
					mail_failed: 'Email delivery failed. Check SMTP configuration.',
				} as Record<string, string>)[result.reason || ''] || 'Could not send reset email.';
				return ApiResponseHelper.sendResponse(res, null, msg, 400);
			}
			return ApiResponseHelper.sendResponse(res, { sent: true }, 'Password-reset email sent.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/:uuid/tenants')
	@ApiOperation({ summary: 'Owner - List tenants assigned to this owner (admin only)' })
	@ApiParam({ name: 'uuid', required: true })
	async listAssigned(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() user: any) {
		try {
			requireAdmin(user);
			const rows = await this.service.listAssignedTenants(uuid);
			return ApiResponseHelper.sendResponse(res, rows);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/unassigned-tenants')
	@ApiOperation({ summary: 'Owner - List tenants with no owner (admin only). Powers the Assign-Tenant dropdown.' })
	async listUnassigned(@Res() res: Response, @CurrentUser() user: any) {
		try {
			requireAdmin(user);
			const rows = await this.service.listUnassignedTenants();
			return ApiResponseHelper.sendResponse(res, rows);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/:uuid/assign-tenant')
	@ApiOperation({ summary: 'Owner - Assign an unassigned tenant to this owner (admin only)' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: AssignTenantDTO })
	async assignTenant(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: AssignTenantDTO,
		@CurrentUser() user: any,
	) {
		try {
			requireAdmin(user);
			await this.service.assignTenant(uuid, data.tenant_uuid);
			return ApiResponseHelper.sendResponse(res, { owner_uuid: uuid, tenant_uuid: data.tenant_uuid }, 'Tenant assigned.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Delete('/:uuid/assign-tenant/:tenant_uuid')
	@ApiOperation({ summary: 'Owner - Unassign a tenant from this owner (admin only)' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiParam({ name: 'tenant_uuid', required: true })
	async unassignTenant(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Param('tenant_uuid') tenant_uuid: string,
		@CurrentUser() user: any,
	) {
		try {
			requireAdmin(user);
			const count = await this.service.unassignTenant(uuid, tenant_uuid);
			if (!count) return ApiResponseHelper.sendNotFound(res, 'Assignment not found.');
			return ApiResponseHelper.sendResponse(res, { owner_uuid: uuid, tenant_uuid, deleted: count }, 'Tenant unassigned.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
