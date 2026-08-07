import { INestApplication } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import * as request from 'supertest';
import { createTestApp } from './utils/create-app';
import { resetTables, seedAdmin, seedTenant, seedUser } from './utils/db';
import { loginAsAdmin, loginAsUser } from './utils/login';

const TINY_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==',
	'base64'
);

describe('Subscription Plan (e2e)', () => {
	let app: INestApplication;
	let adminToken: string;
	let userToken: string;

	beforeAll(async () => {
		app = await createTestApp();
		await resetTables(app);
		await seedAdmin(app);
		adminToken = await loginAsAdmin(app);

		const tenant = await seedTenant(app, { store_code: 'SP-01', display_name: 'SP Store' });
		const u = await seedUser(app, tenant.uuid, { username: 'sp-user' });
		userToken = await loginAsUser(app, u.username, u.password);
	});

	afterAll(async () => {
		await app.close();
	});

	const withAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);

	describe('CRUD lifecycle', () => {
		let createdUuid: string;

		it('GET /api/subscription-plan/dashboard — no token → 401', async () => {
			const res = await request(app.getHttpServer()).get('/api/subscription-plan/dashboard');
			expect(res.status).toBe(401);
		});

		it('GET /api/subscription-plan/dashboard — user token → 403 (admin only)', async () => {
			const res = await request(app.getHttpServer())
				.get('/api/subscription-plan/dashboard')
				.set('Authorization', `Bearer ${userToken}`);
			expect(res.status).toBe(403);
		});

		it('POST /api/subscription-plan/create — admin', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).post('/api/subscription-plan/create').send({
					code: 'BASIC-30',
					name: 'Basic (Monthly)',
					price: 199,
					days_duration: 30,
					features: '- 1 store\n- 100 products\n- Email support',
					days_warning_for_near_expiry: 5,
				})
			);
			expect(res.status).toBe(200);
			expect(res.body.response.uuid).toEqual(expect.any(String));
			expect(res.body.response.status).toBe('active');
			expect(Number(res.body.response.price)).toBe(199);
			expect(res.body.response.days_duration).toBe(30);
			expect(res.body.response.days_warning_for_near_expiry).toBe(5);
			expect(res.body.response.features).toMatch(/1 store/);
			createdUuid = res.body.response.uuid;
		});

		it('POST /api/subscription-plan/create — omits days_warning_for_near_expiry → defaults to 7', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).post('/api/subscription-plan/create').send({
					code: 'PRO-30',
					name: 'Pro (Monthly)',
					price: 499,
					days_duration: 30,
				})
			);
			expect(res.status).toBe(200);
			expect(res.body.response.days_warning_for_near_expiry).toBe(7);
		});

		it('POST /api/subscription-plan/create — duplicate code → 400', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).post('/api/subscription-plan/create').send({
					code: 'BASIC-30',
					name: 'Dup',
					price: 100,
					days_duration: 30,
				})
			);
			expect(res.status).toBe(400);
			expect(res.body.message).toMatch(/already exists/i);
		});

		it('POST /api/subscription-plan/create — days_duration=0 → 400', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).post('/api/subscription-plan/create').send({
					code: 'BAD-DAYS',
					name: 'Bad',
					price: 10,
					days_duration: 0,
				})
			);
			expect(res.status).toBe(400);
		});

		it('GET /api/subscription-plan/view/:uuid', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).get(`/api/subscription-plan/view/${createdUuid}`)
			);
			expect(res.status).toBe(200);
			expect(res.body.response.code).toBe('BASIC-30');
		});

		it('PATCH /api/subscription-plan/update/:uuid — change price + features', async () => {
			const res = await withAdmin(
				request(app.getHttpServer())
					.patch(`/api/subscription-plan/update/${createdUuid}`)
					.send({ price: 249, features: '- 2 stores\n- 500 products' })
			);
			expect(res.status).toBe(200);
			expect(Number(res.body.response.price)).toBe(249);
			expect(res.body.response.features).toMatch(/2 stores/);
		});

		it('PATCH /api/subscription-plan/update/:uuid — colliding code → 400', async () => {
			const res = await withAdmin(
				request(app.getHttpServer())
					.patch(`/api/subscription-plan/update/${createdUuid}`)
					.send({ code: 'PRO-30' })
			);
			expect(res.status).toBe(400);
			expect(res.body.message).toMatch(/already exists/i);
		});

		it('PATCH /api/subscription-plan/set-status/:uuid → inactive', async () => {
			const res = await withAdmin(
				request(app.getHttpServer())
					.patch(`/api/subscription-plan/set-status/${createdUuid}`)
					.send({ status: 'inactive' })
			);
			expect(res.status).toBe(200);
			expect(res.body.response.status).toBe('inactive');
		});

		it('DELETE /api/subscription-plan/delete/:uuid', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).delete(`/api/subscription-plan/delete/${createdUuid}`)
			);
			expect(res.status).toBe(200);
			expect(res.body.response.deleted).toBe(1);
		});
	});

	describe('qrcode_for_payment upload', () => {
		let planUuid: string;
		let firstQrUrl: string;

		it('POST /create — multipart with qrcode file', async () => {
			const res = await withAdmin(request(app.getHttpServer()).post('/api/subscription-plan/create'))
				.field('code', 'QR-PLAN-1')
				.field('name', 'QR Plan')
				.field('price', '299')
				.field('days_duration', '30')
				.attach('qrcode_for_payment', TINY_PNG, 'qrcode.png');

			expect(res.status).toBe(200);
			expect(res.body.response.qrcode_for_payment).toMatch(
				/^\/public\/uploads\/subscription-plans\/qrcode\/\d{4}\/\d{2}\/.+\.png$/i
			);
			// file exists on disk
			const abs = join(
				process.cwd(),
				'public',
				res.body.response.qrcode_for_payment.replace(/^\/?public\//, '')
			);
			expect(existsSync(abs)).toBe(true);

			planUuid = res.body.response.uuid;
			firstQrUrl = res.body.response.qrcode_for_payment;
		});

		it('POST /create — omitted file works (backward compat, no qrcode)', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).post('/api/subscription-plan/create').send({
					code: 'NO-QR',
					name: 'No QR Plan',
					price: 199,
					days_duration: 30,
				})
			);
			expect(res.status).toBe(200);
			expect(res.body.response.qrcode_for_payment).toBeFalsy();
		});

		it('PATCH /update — replacing qrcode deletes the previous file', async () => {
			const res = await withAdmin(request(app.getHttpServer()).patch(`/api/subscription-plan/update/${planUuid}`))
				.field('name', 'QR Plan (v2)')
				.attach('qrcode_for_payment', TINY_PNG, 'qrcode-v2.png');
			expect(res.status).toBe(200);
			expect(res.body.response.name).toBe('QR Plan (v2)');
			expect(res.body.response.qrcode_for_payment).not.toBe(firstQrUrl);

			const oldAbs = join(process.cwd(), 'public', firstQrUrl.replace(/^\/?public\//, ''));
			expect(existsSync(oldAbs)).toBe(false);
		});

		it('DELETE /delete — also removes qrcode file from disk', async () => {
			const view = await withAdmin(request(app.getHttpServer()).get(`/api/subscription-plan/view/${planUuid}`));
			const qrUrl = view.body.response.qrcode_for_payment;

			const res = await withAdmin(
				request(app.getHttpServer()).delete(`/api/subscription-plan/delete/${planUuid}`)
			);
			expect(res.status).toBe(200);

			const abs = join(process.cwd(), 'public', qrUrl.replace(/^\/?public\//, ''));
			expect(existsSync(abs)).toBe(false);
		});
	});

	describe('Dashboard filters', () => {
		beforeAll(async () => {
			await withAdmin(
				request(app.getHttpServer()).post('/api/subscription-plan/create').send({
					code: 'TRIAL-14',
					name: 'Trial',
					price: 0,
					days_duration: 14,
					features: 'Trial features',
				})
			);
		});

		it('keyword search hits code/name/features', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).get('/api/subscription-plan/dashboard').query({ keywords: 'trial' })
			);
			expect(res.status).toBe(200);
			expect(res.body.response.results.some((p: any) => p.code === 'TRIAL-14')).toBe(true);
		});

		it('status filter', async () => {
			const res = await withAdmin(
				request(app.getHttpServer())
					.get('/api/subscription-plan/dashboard')
					.query({ status: 'active' })
			);
			expect(res.status).toBe(200);
			expect(res.body.response.results.every((p: any) => p.status === 'active')).toBe(true);
		});
	});
});
