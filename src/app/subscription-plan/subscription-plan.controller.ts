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
import { SkipSubscriptionCheck } from '@/common/decorators/skip-subscription-check.decorator';
import { imageFileFilter, makeUploadStorage, toPublicUrl } from '@/common/helpers/upload.helper';

import { SubscriptionPlanService } from './subscription-plan.service';
import {
	CreateSubscriptionPlanDTO,
	SetSubscriptionPlanStatusDTO,
	SubscriptionPlanDashboardQueryDTO,
	UpdateSubscriptionPlanDTO,
} from './dto/subscription-plan.dto';

const QRCODE_UPLOAD_OPTS = {
	storage: makeUploadStorage('subscription-plans/qrcode'),
	fileFilter: imageFileFilter,
	limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
};

function requireAdmin(current: any) {
	if (current?.type !== 'admin') throw new ForbiddenException('Admin token required.');
}

// Trial plans are contractually free — a paid "trial" is a discount plan, not
// a trial. On CREATE we still hard-reject a mismatch so the admin notices; on
// UPDATE we auto-heal by forcing price=0 whenever is_trial=true resolves in
// the effective post-patch state (see coerceTrialFreeOnUpdate). That was the
// old behavior tripping "Trial plans must be free" on QR-only edits where the
// stored is_trial disagreed with the checkbox state.
function assertTrialIsFree(is_trial: boolean | undefined, price: number | undefined) {
	if (is_trial === true && price != null && Number(price) !== 0) {
		throw new BadRequestException('Trial plans must be free (price = 0).');
	}
}

// Update-path version: instead of throwing on mismatch, silently zero out the
// price so a "make this a trial" toggle Just Works even if the admin forgot to
// clear the amount field. Returns the (possibly patched) price to persist.
function coerceTrialFreeOnUpdate(is_trial: boolean, incomingPrice: number | undefined): number | undefined {
	if (is_trial === true && incomingPrice != null && Number(incomingPrice) !== 0) return 0;
	return incomingPrice;
}

@ApiTags('Subscription Plan')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('subscription-plan')
export class SubscriptionPlanController {
	constructor(private readonly service: SubscriptionPlanService) {}

	@Get('/dashboard')
	@SkipSubscriptionCheck()
	@ApiOperation({
		summary:
			'Subscription Plan - Dashboard list (any authenticated token). Filters: date range, status[], keywords, pagination.',
	})
	async dashboard(
		@Res() res: Response,
		@Query() filters: SubscriptionPlanDashboardQueryDTO,
		@CurrentUser() _current: any
	) {
		try {
			const output = await this.service.listDashboard(filters);
			return ApiResponseHelper.sendResponse(res, output);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/view/:uuid')
	@SkipSubscriptionCheck()
	@ApiOperation({ summary: 'Subscription Plan - View by uuid (admin only)' })
	@ApiParam({ name: 'uuid', required: true })
	async view(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			requireAdmin(current);
			const row = await this.service.findByUuid(uuid);
			if (!row) return ApiResponseHelper.sendNotFound(res, 'Plan not found.');
			return ApiResponseHelper.sendResponse(res, row);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Get('/price-history/:uuid')
	@SkipSubscriptionCheck()
	@ApiOperation({
		summary:
			'Subscription Plan - Price change history (admin only). Newest first. Includes the initial `create` row (old_price = null).',
	})
	@ApiParam({ name: 'uuid', required: true })
	async priceHistory(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			requireAdmin(current);
			const plan = await this.service.findByUuid(uuid);
			if (!plan) return ApiResponseHelper.sendNotFound(res, 'Plan not found.');
			const rows = await this.service.listPriceHistory(uuid);
			return ApiResponseHelper.sendResponse(res, rows);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Post('/create')
	@ApiOperation({
		summary:
			'Subscription Plan - Create (admin only). multipart/form-data with optional qrcode_for_payment image; JSON body also accepted when no file.',
	})
	@ApiConsumes('multipart/form-data', 'application/json')
	@ApiBody({ type: CreateSubscriptionPlanDTO })
	@UseInterceptors(FileInterceptor('qrcode_for_payment', QRCODE_UPLOAD_OPTS))
	async create(
		@Res() res: Response,
		@Body() data: CreateSubscriptionPlanDTO,
		@UploadedFile() file: Express.Multer.File | undefined,
		@CurrentUser() current: any
	) {
		try {
			requireAdmin(current);

			if (await this.service.codeTaken(data.code)) {
				if (file?.path) this.service.removeQrcodeFile(toPublicUrl(file.path));
				return ApiResponseHelper.sendAlreadyExist(res, 'Code already exists.');
			}

			assertTrialIsFree(data.is_trial, data.price);

			const { qrcode_for_payment: _ignore, ...rest } = data as any;
			const created = await this.service.create({
				...rest,
				allowed_modules: data.allowed_modules as any,
				max_terminals: data.max_terminals ?? null,
				is_trial: data.is_trial ?? false,
				qrcode_for_payment: file ? toPublicUrl(file.path) : undefined,
				created_by: current?.name || current?.username || 'system',
			});
			return ApiResponseHelper.sendResponse(res, created, 'Plan created.');
		} catch (error: any) {
			if (file?.path) this.service.removeQrcodeFile(toPublicUrl(file.path));
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/update/:uuid')
	@ApiOperation({
		summary:
			'Subscription Plan - Update (admin only). Sending qrcode_for_payment replaces the previous file. JSON also accepted when no file.',
	})
	@ApiParam({ name: 'uuid', required: true })
	@ApiConsumes('multipart/form-data', 'application/json')
	@ApiBody({ type: UpdateSubscriptionPlanDTO })
	@UseInterceptors(FileInterceptor('qrcode_for_payment', QRCODE_UPLOAD_OPTS))
	async update(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: UpdateSubscriptionPlanDTO,
		@UploadedFile() file: Express.Multer.File | undefined,
		@CurrentUser() current: any
	) {
		try {
			requireAdmin(current);

			const existing = await this.service.findByUuid(uuid);
			if (!existing) {
				if (file?.path) this.service.removeQrcodeFile(toPublicUrl(file.path));
				return ApiResponseHelper.sendNotFound(res, 'Plan not found.');
			}

			if (data.code && data.code !== existing.code) {
				if (await this.service.codeTaken(data.code, uuid)) {
					if (file?.path) this.service.removeQrcodeFile(toPublicUrl(file.path));
					return ApiResponseHelper.sendAlreadyExist(res, 'Code already exists.');
				}
			}

			// Compute the post-patch state, then auto-coerce price to 0 if the
			// resulting row would be a trial. Never throws — the effect matches
			// what the admin almost always wants and avoids the confusing error
			// when is_trial in the DB has drifted from what the checkbox shows,
			// or when the multipart boolean round-trip flips a value silently.
			const effectiveIsTrial = data.is_trial != null ? data.is_trial : existing.is_trial;
			const patchedPrice = coerceTrialFreeOnUpdate(effectiveIsTrial, data.price);
			if (patchedPrice !== data.price) data.price = patchedPrice;

			const { qrcode_for_payment: _ignore, ...rest } = data as any;
			const patch: any = {
				...rest,
				updated_by: current?.name || current?.username || 'system',
			};
			if (file) {
				patch.qrcode_for_payment = toPublicUrl(file.path);
				if (existing.qrcode_for_payment) this.service.removeQrcodeFile(existing.qrcode_for_payment);
			}

			const updated = await this.service.update(uuid, patch);
			return ApiResponseHelper.sendResponse(res, updated, 'Plan updated.');
		} catch (error: any) {
			if (file?.path) this.service.removeQrcodeFile(toPublicUrl(file.path));
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Delete('/delete/:uuid')
	@ApiOperation({ summary: 'Subscription Plan - Delete (admin only). Also removes the qrcode image file if present.' })
	@ApiParam({ name: 'uuid', required: true })
	async delete(@Res() res: Response, @Param('uuid') uuid: string, @CurrentUser() current: any) {
		try {
			requireAdmin(current);
			const { count } = await this.service.delete(uuid);
			if (!count) return ApiResponseHelper.sendNotFound(res, 'Plan not found.');
			return ApiResponseHelper.sendResponse(res, { uuid, deleted: count }, 'Plan deleted.');
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}

	@Patch('/set-status/:uuid')
	@ApiOperation({ summary: 'Subscription Plan - Set active / inactive (admin only)' })
	@ApiParam({ name: 'uuid', required: true })
	@ApiBody({ type: SetSubscriptionPlanStatusDTO })
	async setStatus(
		@Res() res: Response,
		@Param('uuid') uuid: string,
		@Body() data: SetSubscriptionPlanStatusDTO,
		@CurrentUser() current: any
	) {
		try {
			requireAdmin(current);
			const updated = await this.service.setStatus(
				uuid,
				data.status,
				current?.name || current?.username || 'system'
			);
			if (!updated) return ApiResponseHelper.sendNotFound(res, 'Plan not found.');
			return ApiResponseHelper.sendResponse(res, updated, `Plan set to ${data.status}.`);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
