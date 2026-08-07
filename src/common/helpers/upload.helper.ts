import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const PUBLIC_ROOT = 'public';

/**
 * Build a multer disk storage for a given upload category.
 *
 * Resulting on-disk path:
 *   public/uploads/<category>/YYYY/MM/<uuid>.<ext>
 *
 * Resulting public URL (served by useStaticAssets):
 *   /public/uploads/<category>/YYYY/MM/<uuid>.<ext>
 */
export function makeUploadStorage(category: string) {
	return diskStorage({
		destination: (_req, _file, cb) => {
			const now = new Date();
			const year = String(now.getFullYear());
			const month = String(now.getMonth() + 1).padStart(2, '0');
			const dir = join(process.cwd(), PUBLIC_ROOT, 'uploads', category, year, month);
			if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
			cb(null, dir);
		},
		filename: (_req, file, cb) => {
			const ext = extname(file.originalname).toLowerCase();
			cb(null, `${uuidv4()}${ext}`);
		},
	});
}

/**
 * Multer storage that picks the destination category based on the upload's
 * fieldname. Used with FileFieldsInterceptor when a single request accepts
 * multiple image fields that should land in different folders.
 *
 *   makeFieldRoutedStorage({ company_logo: 'tenants/logo', lab_header_image: 'tenants/lab-header' })
 */
export function makeFieldRoutedStorage(routes: Record<string, string>) {
	return diskStorage({
		destination: (_req, file, cb) => {
			const category = routes[file.fieldname] || 'misc';
			const now = new Date();
			const year = String(now.getFullYear());
			const month = String(now.getMonth() + 1).padStart(2, '0');
			const dir = join(process.cwd(), PUBLIC_ROOT, 'uploads', category, year, month);
			if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
			cb(null, dir);
		},
		filename: (_req, file, cb) => {
			const ext = extname(file.originalname).toLowerCase();
			cb(null, `${uuidv4()}${ext}`);
		},
	});
}

/**
 * Reject anything that isn't an image (jpg/jpeg/png/webp/gif/svg).
 */
export function imageFileFilter(
	_req: any,
	file: Express.Multer.File,
	cb: (err: Error | null, accept: boolean) => void
) {
	const allowed = /\.(jpe?g|png|webp|gif|svg)$/i;
	if (!allowed.test(file.originalname)) {
		return cb(new BadRequestException('Only image files (jpg, jpeg, png, webp, gif, svg) are allowed.'), false);
	}
	cb(null, true);
}

/**
 * Convert an absolute multer path back to the public-facing URL.
 */
export function toPublicUrl(absolutePath: string): string {
	const rel = absolutePath.split(PUBLIC_ROOT).pop() || absolutePath;
	return `/${PUBLIC_ROOT}${rel.replace(/\\/g, '/')}`;
}
