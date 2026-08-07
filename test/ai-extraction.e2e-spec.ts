import { INestApplication } from '@nestjs/common';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import * as request from 'supertest';
import { createTestApp } from './utils/create-app';
import { resetTables, seedAdmin } from './utils/db';
import { loginAsAdmin } from './utils/login';

const TINY_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==',
	'base64'
);

describe('AI Extraction (e2e)', () => {
	let app: INestApplication;
	let adminToken: string;
	const uploadedUrls: string[] = [];

	beforeAll(async () => {
		app = await createTestApp();
		await resetTables(app);
		await seedAdmin(app);
		adminToken = await loginAsAdmin(app);
	});

	afterAll(async () => {
		for (const url of uploadedUrls) {
			const abs = join(process.cwd(), 'public', url.replace(/^\/?public\//, ''));
			if (existsSync(abs)) {
				try {
					unlinkSync(abs);
				} catch {
					/* ignore */
				}
			}
		}
		await app.close();
	});

	const withAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);

	it('POST /api/ai-extraction/receipt — no token → 401', async () => {
		const res = await request(app.getHttpServer())
			.post('/api/ai-extraction/receipt')
			.attach('file', TINY_PNG, 'receipt.png');
		expect(res.status).toBe(401);
	});

	it('POST /api/ai-extraction/receipt — no file → 400', async () => {
		const res = await withAdmin(request(app.getHttpServer()).post('/api/ai-extraction/receipt'));
		expect(res.status).toBe(400);
	});

	it('POST /api/ai-extraction/receipt — saves file, returns URL + filename, extraction may be null', async () => {
		const res = await withAdmin(
			request(app.getHttpServer()).post('/api/ai-extraction/receipt')
		).attach('file', TINY_PNG, 'my-receipt.png');

		expect(res.status).toBe(200);
		expect(res.body.response.file_url).toMatch(/^\/public\/uploads\/ai-extraction\/receipts\/\d{4}\/\d{2}\/.+\.png$/i);
		expect(res.body.response.filename).toMatch(/\.png$/i);
		expect(res.body.response.original_name).toBe('my-receipt.png');
		expect(res.body.response.mime_type).toMatch(/png/i);
		expect(res.body.response.size_bytes).toBeGreaterThan(0);
		// extraction is null in test env (AI_VISION_PROVIDER=none) and/or via size guard
		expect(res.body.response.extraction).toBeNull();

		uploadedUrls.push(res.body.response.file_url);

		// File exists on disk
		const abs = join(process.cwd(), 'public', res.body.response.file_url.replace(/^\/?public\//, ''));
		expect(existsSync(abs)).toBe(true);
	});

	it('POST /api/ai-extraction/receipt — non-image → 400', async () => {
		const textFile = Buffer.from('hello, this is not an image');
		const res = await withAdmin(
			request(app.getHttpServer()).post('/api/ai-extraction/receipt')
		).attach('file', textFile, 'notes.txt');
		expect(res.status).toBe(400);
	});
});
