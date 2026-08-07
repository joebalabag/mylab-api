import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './utils/create-app';
import { resetTables, seedAdmin, seedTenant, seedUser } from './utils/db';
import { loginAsAdmin, loginAsUser } from './utils/login';

describe('Discount (e2e)', () => {
	let app: INestApplication;
	let adminToken: string;
	let userToken: string;
	let tenant: { uuid: string; store_code: string; display_name: string };
	let otherTenant: { uuid: string; store_code: string; display_name: string };

	beforeAll(async () => {
		app = await createTestApp();
		await resetTables(app);
		await seedAdmin(app);
		adminToken = await loginAsAdmin(app);

		tenant = await seedTenant(app, { store_code: 'DISC-01', display_name: 'Disc Store' });
		otherTenant = await seedTenant(app, { store_code: 'DISC-02', display_name: 'Other Disc Store' });

		const seededUser = await seedUser(app, tenant.uuid, { username: 'discuser' });
		userToken = await loginAsUser(app, seededUser.username, seededUser.password);
	});

	afterAll(async () => {
		await app.close();
	});

	const withAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);
	const withUser = (req: request.Test) => req.set('Authorization', `Bearer ${userToken}`);

	describe('CRUD lifecycle', () => {
		let percentUuid: string;

		it('GET /api/discount/dashboard — no token → 401', async () => {
			const res = await request(app.getHttpServer()).get('/api/discount/dashboard');
			expect(res.status).toBe(401);
		});

		it('POST /api/discount/create — percent, admin', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).post('/api/discount/create').send({
					tenant_uuid: tenant.uuid,
					code: 'SC-20',
					name: 'Senior Citizen 20%',
					discount_type: 'percent',
					value: 20,
				})
			);
			expect(res.status).toBe(200);
			expect(res.body.response.uuid).toEqual(expect.any(String));
			expect(res.body.response.discount_type).toBe('percent');
			expect(Number(res.body.response.value)).toBe(20);
			percentUuid = res.body.response.uuid;
		});

		it('POST /api/discount/create — fix, admin', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).post('/api/discount/create').send({
					tenant_uuid: tenant.uuid,
					code: 'PROMO-50',
					name: 'Promo Fifty Off',
					discount_type: 'fix',
					value: 50,
				})
			);
			expect(res.status).toBe(200);
			expect(res.body.response.discount_type).toBe('fix');
			expect(Number(res.body.response.value)).toBe(50);
		});

		it('POST /api/discount/create — open_amount, value forced to 0', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).post('/api/discount/create').send({
					tenant_uuid: tenant.uuid,
					code: 'OPEN',
					name: 'Manual Amount',
					discount_type: 'open_amount',
					value: 999, // should be ignored
				})
			);
			expect(res.status).toBe(200);
			expect(res.body.response.discount_type).toBe('open_amount');
			expect(Number(res.body.response.value)).toBe(0);
		});

		it('POST /api/discount/create — invalid discount_type → 400', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).post('/api/discount/create').send({
					tenant_uuid: tenant.uuid,
					code: 'BAD',
					name: 'Bad type',
					discount_type: 'buy_one_get_one',
					value: 0,
				})
			);
			expect(res.status).toBe(400);
		});

		it('POST /api/discount/create — percent > 100 → 400', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).post('/api/discount/create').send({
					tenant_uuid: tenant.uuid,
					code: 'TOO-BIG',
					name: 'Too big pct',
					discount_type: 'percent',
					value: 150,
				})
			);
			expect(res.status).toBe(400);
		});

		it('POST /api/discount/create — duplicate code within tenant → 400', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).post('/api/discount/create').send({
					tenant_uuid: tenant.uuid,
					code: 'SC-20',
					name: 'Dup',
					discount_type: 'percent',
					value: 20,
				})
			);
			expect(res.status).toBe(400);
			expect(res.body.message).toMatch(/already exists/i);
		});

		it('POST /api/discount/create — same code allowed on a different tenant', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).post('/api/discount/create').send({
					tenant_uuid: otherTenant.uuid,
					code: 'SC-20',
					name: 'Senior Citizen 20% (other tenant)',
					discount_type: 'percent',
					value: 20,
				})
			);
			expect(res.status).toBe(200);
		});

		it('GET /api/discount/view/:uuid', async () => {
			const res = await withAdmin(request(app.getHttpServer()).get(`/api/discount/view/${percentUuid}`));
			expect(res.status).toBe(200);
			expect(res.body.response.code).toBe('SC-20');
		});

		it('PATCH /api/discount/update/:uuid — change name + value', async () => {
			const res = await withAdmin(
				request(app.getHttpServer())
					.patch(`/api/discount/update/${percentUuid}`)
					.send({ name: 'Senior Citizen (renamed)', value: 25 })
			);
			expect(res.status).toBe(200);
			expect(res.body.response.name).toBe('Senior Citizen (renamed)');
			expect(Number(res.body.response.value)).toBe(25);
		});

		it('PATCH /api/discount/update/:uuid — switch to open_amount forces value=0', async () => {
			const res = await withAdmin(
				request(app.getHttpServer())
					.patch(`/api/discount/update/${percentUuid}`)
					.send({ discount_type: 'open_amount', value: 77 })
			);
			expect(res.status).toBe(200);
			expect(res.body.response.discount_type).toBe('open_amount');
			expect(Number(res.body.response.value)).toBe(0);
		});

		it('PATCH /api/discount/set-status/:uuid → inactive', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).patch(`/api/discount/set-status/${percentUuid}`).send({ status: 'inactive' })
			);
			expect(res.status).toBe(200);
			expect(res.body.response.status).toBe('inactive');
		});

		it('DELETE /api/discount/delete/:uuid', async () => {
			const res = await withAdmin(request(app.getHttpServer()).delete(`/api/discount/delete/${percentUuid}`));
			expect(res.status).toBe(200);
			expect(res.body.response.deleted).toBe(1);
		});
	});

	describe('User-token scope', () => {
		it('POST /api/discount/create — user token auto-fills tenant_uuid', async () => {
			const res = await withUser(
				request(app.getHttpServer()).post('/api/discount/create').send({
					code: 'USR-5',
					name: '5% off user-made',
					discount_type: 'percent',
					value: 5,
				})
			);
			expect(res.status).toBe(200);
			expect(res.body.response.tenant_uuid).toBe(tenant.uuid);
		});

		it('POST /api/discount/create — user cannot spoof another tenant', async () => {
			const res = await withUser(
				request(app.getHttpServer()).post('/api/discount/create').send({
					tenant_uuid: otherTenant.uuid,
					code: 'USR-SPOOF',
					name: 'Spoof',
					discount_type: 'fix',
					value: 10,
				})
			);
			expect(res.status).toBe(200);
			expect(res.body.response.tenant_uuid).toBe(tenant.uuid);
		});

		it('GET /api/discount/dashboard — user auto-scoped to own tenant', async () => {
			const res = await withUser(request(app.getHttpServer()).get('/api/discount/dashboard'));
			expect(res.status).toBe(200);
			expect(res.body.response.results.every((d: any) => d.tenant_uuid === tenant.uuid)).toBe(true);
		});

		it('PATCH /api/discount/update/:uuid — user cannot touch other-tenant discount', async () => {
			const other = await withAdmin(
				request(app.getHttpServer()).post('/api/discount/create').send({
					tenant_uuid: otherTenant.uuid,
					code: 'GUARDED',
					name: 'Guarded',
					discount_type: 'fix',
					value: 5,
				})
			);
			const otherUuid = other.body.response.uuid;

			const res = await withUser(
				request(app.getHttpServer()).patch(`/api/discount/update/${otherUuid}`).send({ name: 'Hijacked' })
			);
			expect(res.status).toBe(403);
		});
	});

	describe('Dashboard filters', () => {
		it('filter by discount_type', async () => {
			const res = await withAdmin(
				request(app.getHttpServer())
					.get('/api/discount/dashboard')
					.query({ tenant_uuid: tenant.uuid, discount_type: 'fix' })
			);
			expect(res.status).toBe(200);
			expect(res.body.response.results.every((d: any) => d.discount_type === 'fix')).toBe(true);
		});

		it('keyword search on code/name', async () => {
			const res = await withAdmin(
				request(app.getHttpServer())
					.get('/api/discount/dashboard')
					.query({ tenant_uuid: tenant.uuid, keywords: 'promo' })
			);
			expect(res.status).toBe(200);
			expect(res.body.response.results.some((d: any) => /promo/i.test(d.name))).toBe(true);
		});
	});
});
