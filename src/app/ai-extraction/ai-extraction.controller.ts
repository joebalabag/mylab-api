import {
	BadRequestException,
	Controller,
	Post,
	Res,
	UploadedFile,
	UseGuards,
	UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { Response } from 'express';
import { basename } from 'path';

import { ApiResponseHelper } from '@/common/helpers/response.helper';
import { imageFileFilter, makeUploadStorage, toPublicUrl } from '@/common/helpers/upload.helper';
import { SkipSubscriptionCheck } from '@/common/decorators/skip-subscription-check.decorator';
import { PaymentExtractionService } from '../tenant-subscription-payment/payment-extraction.service';

const RECEIPT_UPLOAD_OPTS = {
	storage: makeUploadStorage('ai-extraction/receipts'),
	fileFilter: imageFileFilter,
	limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
};

class UploadReceiptBodyDTO {
	@ApiProperty({
		type: 'string',
		format: 'binary',
		description: 'Receipt / payment-slip image (jpg / jpeg / png / webp / gif / svg, up to 10 MB).',
	})
	@IsOptional()
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	file?: any;
}

/**
 * General-purpose "preview" extraction endpoint. Upload a receipt/payment-slip
 * image, get back the file's public URL + AI-derived fields. Doesn't persist
 * anything to the DB — this is meant for the frontend to preview fields
 * BEFORE committing an actual payment record.
 */
@ApiTags('AI Extraction')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('ai-extraction')
export class AiExtractionController {
	constructor(private readonly extractor: PaymentExtractionService) {}

	@Post('/receipt')
	@SkipSubscriptionCheck()
	@ApiOperation({
		summary:
			'Upload a receipt/payment-slip image, run AI extraction, and return the parsed fields + the stored file URL. Nothing is persisted to the DB.',
	})
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		description: 'Multipart body with `file` field (jpg / jpeg / png / webp / gif / svg, up to 10 MB).',
		type: UploadReceiptBodyDTO,
	})
	@UseInterceptors(FileInterceptor('file', RECEIPT_UPLOAD_OPTS))
	async uploadReceipt(@Res() res: Response, @UploadedFile() file: Express.Multer.File | undefined) {
		try {
			if (!file) throw new BadRequestException('file is required.');

			const file_url = toPublicUrl(file.path);
			const filename = basename(file.path);

			const extraction = await this.extractor.extractFromFile(file.path, file.mimetype);

			return ApiResponseHelper.sendResponse(
				res,
				{
					file_url,
					filename,
					original_name: file.originalname,
					size_bytes: file.size,
					mime_type: file.mimetype,
					extraction,
				},
				extraction ? 'Extraction complete.' : 'File uploaded — extraction returned no data.'
			);
		} catch (error: any) {
			return ApiResponseHelper.sendResponse(res, null, error?.message, error?.status ?? 500);
		}
	}
}
