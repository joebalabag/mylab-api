import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './utils/create-app';
import { getKnex, resetTables, seedAdmin } from './utils/db';
import { loginAsAdmin } from './utils/login';

describe('Admin (e2e)', () => {
	let app: INestApplication;
	let token: string;

	beforeAll(async () => {
		app = await createTestApp();
		await resetTables(app);
		await seedAdmin(app);
		token = await loginAsAdmin(app);
	});

	afterAll(async () => {
		await app.close();
	});

	const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);

	it('GET /api/admin/dashboard — requires token', async () => {
		const res = await request(app.getHttpServer()).get('/api/admin/dashboard');
		expect(res.status).toBe(401);
	});

	it('GET /api/admin/dashboard — returns paged results', async () => {
		const res = await auth(request(app.getHttpServer()).get('/api/admin/dashboard'));
		expect(res.status).toBe(200);
		expect(Array.isArray(res.body.response.results)).toBe(true);
		expect(res.body.response.total).toBeGreaterThanOrEqual(1);
	});

	it('GET /api/admin/dashboard — keyword + status filter', async () => {
		const res = await auth(
			request(app.getHttpServer()).get('/api/admin/dashboard').query({
				keywords: 'admin',
				status: 'active',
				page_number: 1,
				page_size: 10,
			})
		);
		expect(res.status).toBe(200);
		expect(res.body.response.results.every((r: any) => r.status === 'active')).toBe(true);
	});

	describe('CRUD lifecycle', () => {
		let createdUuid: string;

		it('POST /api/admin/create', async () => {
			const res = await auth(
				request(app.getHttpServer()).post('/api/admin/create').send({
					username: 'jdoe',
					password: 'secret123',
					confirm_password: 'secret123',
					name: 'John Doe',
					email: 'jdoe@example.com',
					role: 'admin',
				})
			);
			expect(res.status).toBe(200);
			expect(res.body.response.uuid).toEqual(expect.any(String));
			expect(res.body.response.passphrase).toBeUndefined();
			expect(res.body.response.keycode).toBeUndefined();
			createdUuid = res.body.response.uuid;
		});

		it('POST /api/admin/create — duplicate username → 400', async () => {
			const res = await auth(
				request(app.getHttpServer()).post('/api/admin/create').send({
					username: 'jdoe',
					password: 'secret123',
					confirm_password: 'secret123',
					name: 'John Doe 2',
				})
			);
			expect(res.status).toBe(400);
			expect(res.body.message).toMatch(/already exists/i);
		});

		it('POST /api/admin/create — password mismatch → 400', async () => {
			const res = await auth(
				request(app.getHttpServer()).post('/api/admin/create').send({
					username: 'someone',
					password: 'secret123',
					confirm_password: 'differ123',
					name: 'Some One',
				})
			);
			expect(res.status).toBe(400);
		});

		it('GET /api/admin/view/:uuid', async () => {
			const res = await auth(request(app.getHttpServer()).get(`/api/admin/view/${createdUuid}`));
			expect(res.status).toBe(200);
			expect(res.body.response.username).toBe('jdoe');
			expect(res.body.response.passphrase).toBeUndefined();
		});

		it('PATCH /api/admin/update/:uuid', async () => {
			const res = await auth(
				request(app.getHttpServer())
					.patch(`/api/admin/update/${createdUuid}`)
					.send({ name: 'Johnny Doe', role: 'manager' })
			);
			expect(res.status).toBe(200);
			expect(res.body.response.name).toBe('Johnny Doe');
			expect(res.body.response.role).toBe('manager');
		});

		it('PATCH /api/admin/set-status/:uuid → inactive', async () => {
			const res = await auth(
				request(app.getHttpServer()).patch(`/api/admin/set-status/${createdUuid}`).send({ status: 'inactive' })
			);
			expect(res.status).toBe(200);
			expect(res.body.response.status).toBe('inactive');
		});

		it('PATCH /api/admin/change-password/:uuid — dashboard flow, no old password', async () => {
			const res = await auth(
				request(app.getHttpServer())
					.patch(`/api/admin/change-password/${createdUuid}`)
					.send({ password: 'brand-new-123', confirm_password: 'brand-new-123' })
			);
			expect(res.status).toBe(200);

			// history row should have been inserted
			const k = getKnex(app);
			const history = await k('admin_password_history').where({ admin_uuid: createdUuid });
			expect(history.length).toBeGreaterThanOrEqual(1);
			expect(history[0].change_source).toBe('dashboard');
		});

		it('DELETE /api/admin/delete/:uuid', async () => {
			const res = await auth(request(app.getHttpServer()).delete(`/api/admin/delete/${createdUuid}`));
			expect(res.status).toBe(200);
			expect(res.body.response.deleted).toBe(1);
		});

		it('DELETE /api/admin/delete — self-delete blocked', async () => {
			const seeded = await getKnex(app).select('uuid').from('admins').where({ username: 'admin' }).first();
			const res = await auth(request(app.getHttpServer()).delete(`/api/admin/delete/${seeded.uuid}`));
			expect(res.status).toBe(400);
			expect(res.body.message).toMatch(/cannot delete your own/i);
		});
	});

	describe('Profile change-password', () => {
		it('PATCH /api/admin/profile/change-password — wrong old password → 400', async () => {
			const res = await auth(
				request(app.getHttpServer())
					.patch('/api/admin/profile/change-password')
					.send({ old_password: 'nope-nope', password: 'aaaaaa1', confirm_password: 'aaaaaa1' })
			);
			expect(res.status).toBe(400);
			expect(res.body.message).toMatch(/old password/i);
		});

		it('PATCH /api/admin/profile/change-password — success + logs history', async () => {
			const res = await auth(
				request(app.getHttpServer())
					.patch('/api/admin/profile/change-password')
					.send({ old_password: 'admin123', password: 'admin456', confirm_password: 'admin456' })
			);
			expect(res.status).toBe(200);

			const k = getKnex(app);
			const seeded = await k('admins').where({ username: 'admin' }).first();
			const history = await k('admin_password_history').where({ admin_uuid: seeded.uuid, change_source: 'profile' });
			expect(history.length).toBeGreaterThanOrEqual(1);

			// login now succeeds only with new password
			const loginRes = await request(app.getHttpServer())
				.post('/api/auth/admin/login')
				.send({ username: 'admin', password: 'admin456' });
			expect(loginRes.status).toBe(200);
		});
	});
});
