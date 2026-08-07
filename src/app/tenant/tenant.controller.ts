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
	UploadedFile,
	UploadedFiles,
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { ApiResponseHelper } from '@/common/helpers/response.helper';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { SkipSubscriptionCheck } from '@/common/decorators/skip-subscription-check.decorator';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';
import { imageFileFilter, makeFieldRoutedStorage, makeUploadStorage, toPublicUrl } from '@/common/helpers/upload.helper';

import { TenantService } from './tenant.service';
import {
	AlterTenantSubscriptionDTO,
	CreateTenantDTO,
	SetTenantStatusDTO,
	UpdateTenantDTO,
} from './dto/tenant.dto';

const LOGO_UPLOAD_OPTS = {
	storage: makeUploadStorage('tenants/logo'),
	fileFilter: imageFileFilter,
	limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
};

// Multi-field upload for tenant create/update. Both fields are optional so
// the frontend can send just one (logo OR lab_header_image) or both. Files
// route to different subfolders based on the fieldname.
const TENANT_FILE_FIELDS = [
	{ name: 'company_logo', maxCount: 1 },
	{ name: 'lab_header_image', maxCount: 1 },
];
const TENANT_FILE_OPTS = {
	storage: makeFieldRoutedStorage({
		company_logo: 'tenants/logo',
		lab_header_image: 'tenants/lab-header',
	}),
	fileFilter: imageFileFilter,
	limits: { fileSize: 5 * 1024 * 1024 },
};

@ApiTags('Tenant')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('tenant')
export class TenantController {
	constructor(private readonly service: TenantService) {}

	@Get('/dashboard')
	@ApiOperation({ summary: 'Tenant - Dashboard list (filters: date range, status[], keywords, pagination)' })
	async dashboard(@Res() res: Response, @Query() filters: DashboardQueryDTO) {
		try {
			const output = await this.service.listDashboard(filters);
			return ApiResponseHelper.sendResponse(res, output);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, 500);
		}
	}

	@Get('/view/:uuid')
	@SkipSubscriptionCheck()
	@ApiOperation({ summary: 'Tenant - View by uuid' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string) {
		try {
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'Tenant not found.');
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, 500);
		}
	}

	@Post('/create')
	@ApiOperation({ summary: 'Tenant - Create (multipart/form-data, optional company_logo and/or lab_header_image files)' })
	@ApiConsumes('multipart/form-data')
	@ApiBody({ type: CreateTenantDTO })
	@UseInterceptors(FileFieldsInterceptor(TENANT_FILE_FIELDS, TENANT_FILE_OPTS))
	async create(
		@Res() res: Response,
		@Body() data: CreateTenantDTO,
		@UploadedFiles() files: { company_logo?: Express.Multer.File[]; lab_header_image?: Express.Multer.File[] } | undefined,
		@CurrentUser() user: any
	) {
		try {
			const logoFile = files?.company_logo?.[0];
			const headerFile = files?.lab_header_image?.[0];

			if (await this.service.storeCodeTaken(data.store_code, data.terminal_id)) {
				if (logoFile?.path) this.service.removeLogoFile(toPublicUrl(logoFile.path));
				if (headerFile?.path) this.service.removeLabHeaderFile(toPublicUrl(headerFile.path));
				return ApiResponseHelper.sendAlreadyExist(res, 'Store code + terminal combination already exists.');
			}

			const { company_logo: _ignoredLogo, lab_header_image: _ignoredHeader, ...rest } = data as any;
			const created = await this.service.create({
				...rest,
				company_logo:     logoFile   ? toPublicUrl(logoFile.path)   : undefined,
				lab_header_image: headerFile ? toPublicUrl(headerFile.path) : undefined,
				created_by: user?.name || user?.username || 'system',
			});

			return ApiResponseHelper.sendResponse(res, created, 'Tenant created.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, 500);
		}
	}

	@Patch('/update/:uuid')
	@ApiOperation({ summary: 'Tenant - Update (multipart/form-data, optional replacement for company_logo and/or lab_header_image)' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiConsumes('multipart/form-data')
	@ApiBody({ type: UpdateTenantDTO })
	@UseInterceptors(FileFieldsInterceptor(TENANT_FILE_FIELDS, TENANT_FILE_OPTS))
	async update(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: UpdateTenantDTO,
		@UploadedFiles() files: { company_logo?: Express.Multer.File[]; lab_header_image?: Express.Multer.File[] } | undefined,
		@CurrentUser() user: any
	) {
		try {
			const logoFile = files?.company_logo?.[0];
			const headerFile = files?.lab_header_image?.[0];

			const existing = await this.service.findByUuid(uuid);
			if (!existing) {
				if (logoFile?.path)   this.service.removeLogoFile(toPublicUrl(logoFile.path));
				if (headerFile?.path) this.service.removeLabHeaderFile(toPublicUrl(headerFile.path));
				return ApiResponseHelper.sendNotFound(res, 'Tenant not found.');
			}

			const { company_logo: _ignoredLogo, lab_header_image: _ignoredHeader, ...rest } = data as any;
			const patch: any = {
				...rest,
				updated_by: user?.name || user?.username || 'system',
			};
			if (logoFile) {
				patch.company_logo = toPublicUrl(logoFile.path);
				if (existing.company_logo) this.service.removeLogoFile(existing.company_logo);
			}
			if (headerFile) {
				patch.lab_header_image = toPublicUrl(headerFile.path);
				if (existing.lab_header_image) this.service.removeLabHeaderFile(existing.lab_header_image);
			}

			const updated = await this.service.update(uuid, patch);
			return ApiResponseHelper.sendResponse(res, updated, 'Tenant updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, 500);
		}
	}

	@Delete('/delete/:uuid')
	@ApiOperation({ summary: 'Tenant - Delete' })
	@ApiParam({ name: 'uuid', required: true })
	async delete(@Res() res: Response, @Param('uuid') uuid: string) {
		try {
			const { count } = await this.service.delete(uuid);
			if (!count) return ApiResponseHelper.sendNotFound(res, 'Tenant not found.');
			return ApiResponseHelper.sendResponse(res, { uuid, deleted: count }, 'Tenant deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, 500);
		}
	}

	@Patch('/alter-subscription/:uuid')
	@ApiOperation({
		summary:
			'Tenant - Super-admin override of the current subscription state. Any of the value fields may be omitted (falls back to current); alter_reason is required. Writes a new tenant_subscription_history row tagged with the reason, expires the prior active row, and patches tenants.current_*.',
	})
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: AlterTenantSubscriptionDTO })
	async alterSubscription(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: AlterTenantSubscriptionDTO,
		@CurrentUser() current: any,
	) {
		try {
			if (current?.type !== 'admin') throw new ForbiddenException('Admin token required.');
			const updated = await this.service.alterSubscription(uuid, data, current?.name || current?.username || 'admin');
			return ApiResponseHelper.sendResponse(res, updated, 'Tenant subscription altered.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/set-status/:uuid')
	@ApiOperation({ summary: 'Tenant - Set active / inactive' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SetTenantStatusDTO })
	async setStatus(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SetTenantStatusDTO,
		@CurrentUser() user: any
	) {
		try {
			const updated = await this.service.setStatus(uuid, data.status, user?.name || user?.username || 'system');
			if (!updated) return ApiResponseHelper.sendNotFound(res, 'Tenant not found.');
			return ApiResponseHelper.sendResponse(res, updated, `Tenant set to ${data.status}.`);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, 500);
		}
	}
}
