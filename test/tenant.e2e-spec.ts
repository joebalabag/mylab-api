import { INestApplication } from '@nestjs/common';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import * as request from 'supertest';
import { createTestApp } from './utils/create-app';
import { resetTables, seedAdmin } from './utils/db';
import { loginAsAdmin } from './utils/login';

// 1x1 transparent PNG
const TINY_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==',
	'base64'
);

describe('Tenant (e2e)', () => {
	let app: INestApplication;
	let token: string;
	const uploadedFiles: string[] = [];

	beforeAll(async () => {
		app = await createTestApp();
		await resetTables(app);
		await seedAdmin(app);
		token = await loginAsAdmin(app);
	});

	afterAll(async () => {
		// clean up uploaded files
		for (const url of uploadedFiles) {
			const rel = url.replace(/^\/?public\//, '');
			const abs = join(process.cwd(), 'public', rel);
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

	const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

	it('GET /api/tenant/dashboard — requires token', async () => {
		const res = await request(app.getHttpServer()).get('/api/tenant/dashboard');
		expect(res.status).toBe(401);
	});

	describe('CRUD lifecycle', () => {
		let createdUuid: string;
		let createdLogoUrl: string;

		it('POST /api/tenant/create — multipart with logo', async () => {
			const res = await auth(request(app.getHttpServer()).post('/api/tenant/create'))
				.field('display_name', 'Main Store')
				.field('legal_name', 'Main Store Corp.')
				.field('store_code', 'MAIN-01')
				.field('branch', 'HQ')
				.field('terminal_id', 'T01')
				.field('currency', 'PHP')
				.field('address_street1', '123 Rizal St')
				.field('city', 'San Pedro')
				.field('province', 'Laguna')
				.field('postal_code', '4023')
				.field('country', 'Philippines')
				.field('contact_number', '+63 917 000 0000')
				.field('email_address', 'store@example.com')
				.field('website', 'https://example.com')
				.field('tin_number', '000-000-000-000')
				.field('is_vat_registered', 'true')
				.field('show_tin_on_receipt', 'true')
				.field('receipt_header', 'Welcome to Main Store!')
				.field('receipt_footer', 'Thank you — come again')
				.field('receipt_show_logo', 'true')
				.attach('company_logo', TINY_PNG, 'logo.png');

			expect(res.status).toBe(200);
			expect(res.body.response.uuid).toEqual(expect.any(String));
			expect(res.body.response.display_name).toBe('Main Store');
			expect(res.body.response.is_vat_registered).toBe(true);
			expect(res.body.response.company_logo).toMatch(/^\/public\/uploads\/tenants\/logo\/\d{4}\/\d{2}\/.+\.png$/i);

			createdUuid = res.body.response.uuid;
			createdLogoUrl = res.body.response.company_logo;
			uploadedFiles.push(createdLogoUrl);

			// file should actually exist on disk
			const abs = join(process.cwd(), 'public', createdLogoUrl.replace(/^\/?public\//, ''));
			expect(existsSync(abs)).toBe(true);
		});

		it('POST /api/tenant/create — empty optional fields do not fail validators', async () => {
			const res = await auth(request(app.getHttpServer()).post('/api/tenant/create'))
				.field('display_name', 'Second Store')
				.field('store_code', 'BR-02')
				.field('email_address', '') // empty should be tolerated
				.field('website', ''); // empty should be tolerated
			expect(res.status).toBe(200);
			expect(res.body.response.email_address).toBeFalsy();
		});

		it('POST /api/tenant/create — duplicate store_code + terminal → 400', async () => {
			const res = await auth(request(app.getHttpServer()).post('/api/tenant/create'))
				.field('display_name', 'Dup')
				.field('store_code', 'MAIN-01')
				.field('terminal_id', 'T01');
			expect(res.status).toBe(400);
			expect(res.body.message).toMatch(/already exists/i);
		});

		it('GET /api/tenant/dashboard — filters', async () => {
			const res = await auth(
				request(app.getHttpServer()).get('/api/tenant/dashboard').query({
					keywords: 'main',
					status: 'active',
				})
			);
			expect(res.status).toBe(200);
			expect(res.body.response.results.some((t: any) => t.uuid === createdUuid)).toBe(true);
		});

		it('GET /api/tenant/view/:uuid', async () => {
			const res = await auth(request(app.getHttpServer()).get(`/api/tenant/view/${createdUuid}`));
			expect(res.status).toBe(200);
			expect(res.body.response.uuid).toBe(createdUuid);
		});

		it('PATCH /api/tenant/update/:uuid — replaces logo file', async () => {
			const res = await auth(request(app.getHttpServer()).patch(`/api/tenant/update/${createdUuid}`))
				.field('display_name', 'Main Store — Renamed')
				.attach('company_logo', TINY_PNG, 'logo-v2.png');

			expect(res.status).toBe(200);
			expect(res.body.response.display_name).toBe('Main Store — Renamed');
			expect(res.body.response.company_logo).not.toBe(createdLogoUrl);
			uploadedFiles.push(res.body.response.company_logo);

			// old logo should be gone
			const oldAbs = join(process.cwd(), 'public', createdLogoUrl.replace(/^\/?public\//, ''));
			expect(existsSync(oldAbs)).toBe(false);
		});

		it('PATCH /api/tenant/set-status/:uuid → inactive', async () => {
			const res = await auth(
				request(app.getHttpServer()).patch(`/api/tenant/set-status/${createdUuid}`).send({ status: 'inactive' })
			);
			expect(res.status).toBe(200);
			expect(res.body.response.status).toBe('inactive');
		});

		it('DELETE /api/tenant/delete/:uuid — also removes logo file', async () => {
			const before = await auth(request(app.getHttpServer()).get(`/api/tenant/view/${createdUuid}`));
			const logoUrl = before.body.response.company_logo;

			const res = await auth(request(app.getHttpServer()).delete(`/api/tenant/delete/${createdUuid}`));
			expect(res.status).toBe(200);
			expect(res.body.response.deleted).toBe(1);

			if (logoUrl) {
				const abs = join(process.cwd(), 'public', logoUrl.replace(/^\/?public\//, ''));
				expect(existsSync(abs)).toBe(false);
			}
		});
	});

	describe('validation guards', () => {
		it('POST /api/tenant/create — missing required display_name → 400', async () => {
			const res = await auth(request(app.getHttpServer()).post('/api/tenant/create'))
				.field('store_code', 'X-01');
			expect(res.status).toBe(400);
		});

		it('POST /api/tenant/create — bad email → 400', async () => {
			const res = await auth(request(app.getHttpServer()).post('/api/tenant/create'))
				.field('display_name', 'Bad Email Store')
				.field('store_code', 'BAD-01')
				.field('email_address', 'not-an-email');
			expect(res.status).toBe(400);
		});
	});
});
