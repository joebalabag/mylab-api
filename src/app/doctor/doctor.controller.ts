import {
	BadRequestException,
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
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';

import { ApiResponseHelper } from '@/common/helpers/response.helper';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { makeUploadStorage, toPublicUrl } from '@/common/helpers/upload.helper';

import { DoctorService } from './doctor.service';
import {
	CreateDoctorDTO,
	DoctorDashboardQueryDTO,
	SetDoctorStatusDTO,
	UpdateDoctorDTO,
} from './dto/doctor.dto';
import { Doctor } from './doctor.model';

// E-signature uploads are PNG-only — the print/report layer expects a
// transparent background so the signature overlays the signature line
// cleanly. JPG/WEBP/SVG are rejected.
function pngOnlyFilter(
	_req: any,
	file: Express.Multer.File,
	cb: (err: Error | null, accept: boolean) => void,
) {
	const okExt = /\.png$/i.test(file.originalname);
	const okMime = (file.mimetype || '').toLowerCase() === 'image/png';
	if (!okExt || !okMime) {
		return cb(new BadRequestException('E-signature must be a PNG image (with transparent background).'), false);
	}
	cb(null, true);
}

const ESIG_UPLOAD_OPTS = {
	storage: makeUploadStorage('tenants/doctor-esignature'),
	fileFilter: pngOnlyFilter,
	limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
};

function resolveTenantScope(current: any, requestedTenantUuid?: string): string | undefined {
	if (current?.type === 'admin') return requestedTenantUuid;
	if (current?.type === 'user') return current.tenant_uuid;
	throw new ForbiddenException('Invalid token type.');
}
function assertOwns(current: any, existing: Doctor) {
	if (current?.type === 'admin') return;
	if (current?.type === 'user' && current.tenant_uuid === existing.tenant_uuid) return;
	throw new ForbiddenException('Doctor belongs to a different tenant.');
}

@ApiTags('Doctor')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('doctor')
export class DoctorController {
	constructor(private readonly service: DoctorService) {}

	@Get('/dashboard')
	@ApiOperation({ summary: 'Doctor - Dashboard list.' })
	async dashboard(
		@Res() res: Response,
		@Query() filters: DoctorDashboardQueryDTO,
		@CurrentUser() current: any,
	) {
		try {
			const scoped: DoctorDashboardQueryDTO = {
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
	@ApiOperation({ summary: 'Doctor - View by uuid' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'Doctor not found.');
			assertOwns(current, row);
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/create')
	@ApiOperation({ summary: 'Doctor - Create (multipart/form-data, optional esignature_image file)' })
	@ApiConsumes('multipart/form-data')
	@ApiBody({ type: CreateDoctorDTO })
	@UseInterceptors(FileInterceptor('esignature_image', ESIG_UPLOAD_OPTS))
	async create(
		@Res() res: Response,
		@Body() data: CreateDoctorDTO,
		@UploadedFile() file: Express.Multer.File | undefined,
		@CurrentUser() current: any,
	) {
		try {
			const tenant_uuid = resolveTenantScope(current, data.tenant_uuid);
			if (!tenant_uuid) return ApiResponseHelper.sendBadRequest(res, 'tenant_uuid is required.');
			if (current?.type === 'admin' && !(await this.service.tenantExists(tenant_uuid))) {
				if (file?.path) this.service.removeEsignatureFile(toPublicUrl(file.path));
				return ApiResponseHelper.sendBadRequest(res, 'Tenant does not exist.');
			}

			const { esignature_image: _ignored, ...rest } = data as any;
			const created = await this.service.create({
				tenant_uuid,
				name: rest.name,
				license_number: rest.license_number,
				specialty: rest.specialty,
				esignature_image: file ? toPublicUrl(file.path) : undefined,
				created_by: current?.name || current?.username || 'system',
			});
			return ApiResponseHelper.sendResponse(res, created, 'Doctor created.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/update/:uuid')
	@ApiOperation({ summary: 'Doctor - Update (multipart/form-data, optional esignature_image replacement)' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiConsumes('multipart/form-data')
	@ApiBody({ type: UpdateDoctorDTO })
	@UseInterceptors(FileInterceptor('esignature_image', ESIG_UPLOAD_OPTS))
	async update(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: UpdateDoctorDTO,
		@UploadedFile() file: Express.Multer.File | undefined,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) {
				if (file?.path) this.service.removeEsignatureFile(toPublicUrl(file.path));
				return ApiResponseHelper.sendNotFound(res, 'Doctor not found.');
			}
			assertOwns(current, existing);

			const { esignature_image: _ignored, ...rest } = data as any;
			const patch: any = { ...rest, updated_by: current?.name || current?.username || 'system' };
			if (file) {
				patch.esignature_image = toPublicUrl(file.path);
				if (existing.esignature_image) this.service.removeEsignatureFile(existing.esignature_image);
			}
			const updated = await this.service.update(uuid, patch);
			return ApiResponseHelper.sendResponse(res, updated, 'Doctor updated.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Delete('/delete/:uuid')
	@ApiOperation({ summary: 'Doctor - Delete' })
	@ApiParam({ name: 'uuid', required: true })
	async delete(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Doctor not found.');
			assertOwns(current, existing);
			const { count } = await this.service.delete(uuid);
			return ApiResponseHelper.sendResponse(res, { uuid, deleted: count }, 'Doctor deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/set-status/:uuid')
	@ApiOperation({ summary: 'Doctor - Set active / inactive' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SetDoctorStatusDTO })
	async setStatus(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SetDoctorStatusDTO,
		@CurrentUser() current: any,
	) {
		try {
			const existing = await this.service.findByUuid(uuid);
			if (!existing) return ApiResponseHelper.sendNotFound(res, 'Doctor not found.');
			assertOwns(current, existing);
			const updated = await this.service.setStatus(uuid, data.status, current?.name || current?.username || 'system');
			return ApiResponseHelper.sendResponse(res, updated, `Doctor set to ${data.status}.`);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
