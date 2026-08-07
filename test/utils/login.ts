import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';

export async function loginAsAdmin(
	app: INestApplication,
	username = 'admin',
	password = 'admin123'
): Promise<string> {
	const res = await request(app.getHttpServer())
		.post('/api/auth/admin/login')
		.send({ username, password });

	if (res.status !== 200 || !res.body?.response?.access_token) {
		throw new Error(`Admin login failed (status ${res.status}): ${JSON.stringify(res.body)}`);
	}
	return res.body.response.access_token;
}

export async function loginAsUser(
	app: INestApplication,
	username: string,
	password: string
): Promise<string> {
	const res = await request(app.getHttpServer())
		.post('/api/auth/user/login')
		.send({ username, password });

	if (res.status !== 200 || !res.body?.response?.access_token) {
		throw new Error(`User login failed (status ${res.status}): ${JSON.stringify(res.body)}`);
	}
	return res.body.response.access_token;
}
