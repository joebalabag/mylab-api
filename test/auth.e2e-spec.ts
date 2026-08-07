import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './utils/create-app';
import { resetTables, seedAdmin } from './utils/db';

describe('Auth (e2e)', () => {
	let app: INestApplication;

	beforeAll(async () => {
		app = await createTestApp();
		await resetTables(app);
		await seedAdmin(app);
	});

	afterAll(async () => {
		await app.close();
	});

	it('POST /api/auth/admin/login — success', async () => {
		const res = await request(app.getHttpServer())
			.post('/api/auth/admin/login')
			.send({ username: 'admin', password: 'admin123' });

		expect(res.status).toBe(200);
		expect(res.body.response.access_token).toEqual(expect.any(String));
		expect(res.body.response.username).toBe('admin');
		expect(res.body.response.role).toBe('super_admin');
	});

	it('POST /api/auth/admin/login — wrong password → 401', async () => {
		const res = await request(app.getHttpServer())
			.post('/api/auth/admin/login')
			.send({ username: 'admin', password: 'wrong-password' });

		expect(res.status).toBe(401);
		expect(res.body.response).toBeNull();
	});

	it('POST /api/auth/admin/login — unknown user → 401', async () => {
		const res = await request(app.getHttpServer())
			.post('/api/auth/admin/login')
			.send({ username: 'ghost', password: 'admin123' });

		expect(res.status).toBe(401);
	});

	it('POST /api/auth/admin/login — validation fails on short password → 400', async () => {
		const res = await request(app.getHttpServer())
			.post('/api/auth/admin/login')
			.send({ username: 'admin', password: 'x' });

		expect(res.status).toBe(400);
	});

	it('POST /api/auth/admin/login — inactive admin blocked → 401', async () => {
		await resetTables(app);
		await seedAdmin(app, { username: 'blocked', status: 'inactive' });

		const res = await request(app.getHttpServer())
			.post('/api/auth/admin/login')
			.send({ username: 'blocked', password: 'admin123' });

		expect(res.status).toBe(401);
		expect(res.body.message).toMatch(/inactive/i);
	});
});
