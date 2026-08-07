import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './utils/create-app';
import { getKnex, resetTables, seedAdmin, seedTenant, seedUser } from './utils/db';
import { loginAsAdmin, loginAsUser } from './utils/login';

describe('User (e2e)', () => {
	let app: INestApplication;
	let adminToken: string;
	let tenant: { uuid: string; store_code: string; display_name: string };
	let seededUser: { uuid: string; username: string; password: string; tenant_uuid: string };

	beforeAll(async () => {
		app = await createTestApp();
		await resetTables(app);
		await seedAdmin(app);
		adminToken = await loginAsAdmin(app);
		tenant = await seedTenant(app, { store_code: 'USER-TEST-01', display_name: 'User Test Store' });
		seededUser = await seedUser(app, tenant.uuid);
	});

	afterAll(async () => {
		await app.close();
	});

	const withAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);

	describe('POST /api/auth/user/login', () => {
		it('success — tenant details auto-resolved', async () => {
			const res = await request(app.getHttpServer())
				.post('/api/auth/user/login')
				.send({ username: seededUser.username, password: seededUser.password });

			expect(res.status).toBe(200);
			expect(res.body.response.access_token).toEqual(expect.any(String));
			expect(res.body.response.tenant_uuid).toBe(tenant.uuid);
			expect(res.body.response.tenant?.store_code).toBe(tenant.store_code);
			expect(res.body.response.type).toBe('user');
		});

		it('unknown user → 401', async () => {
			const res = await request(app.getHttpServer())
				.post('/api/auth/user/login')
				.send({ username: 'ghost-user', password: 'whatever123' });
			expect(res.status).toBe(401);
		});

		it('wrong password → 401', async () => {
			const res = await request(app.getHttpServer())
				.post('/api/auth/user/login')
				.send({ username: seededUser.username, password: 'nope-nope' });
			expect(res.status).toBe(401);
		});

		it('inactive user blocked → 401', async () => {
			const inactive = await seedUser(app, tenant.uuid, { username: 'sleeper', status: 'inactive' });
			const res = await request(app.getHttpServer())
				.post('/api/auth/user/login')
				.send({ username: inactive.username, password: inactive.password });
			expect(res.status).toBe(401);
			expect(res.body.message).toMatch(/inactive/i);
		});

		it('inactive tenant blocks login → 401', async () => {
			const off = await seedTenant(app, { store_code: 'OFF-99', display_name: 'Off Store', status: 'inactive' });
			const orphan = await seedUser(app, off.uuid, { username: 'orphan-user' });
			const res = await request(app.getHttpServer())
				.post('/api/auth/user/login')
				.send({ username: orphan.username, password: orphan.password });
			expect(res.status).toBe(401);
			expect(res.body.message).toMatch(/tenant/i);
		});
	});

	describe('Admin-managed CRUD', () => {
		let createdUuid: string;

		it('GET /api/user/dashboard — requires admin token', async () => {
			const res = await request(app.getHttpServer()).get('/api/user/dashboard');
			expect(res.status).toBe(401);
		});

		it('GET /api/user/dashboard — lists users', async () => {
			const res = await withAdmin(request(app.getHttpServer()).get('/api/user/dashboard'));
			expect(res.status).toBe(200);
			expect(res.body.response.results.length).toBeGreaterThanOrEqual(1);
			expect(res.body.response.results.every((u: any) => !u.passphrase && !u.keycode)).toBe(true);
		});

		it('GET /api/user/dashboard — filter by tenant_uuid + status', async () => {
			const res = await withAdmin(
				request(app.getHttpServer())
					.get('/api/user/dashboard')
					.query({ tenant_uuid: tenant.uuid, status: 'active', keywords: 'jdoe' })
			);
			expect(res.status).toBe(200);
			expect(res.body.response.results.every((u: any) => u.tenant_uuid === tenant.uuid)).toBe(true);
		});

		it('POST /api/user/create — success', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).post('/api/user/create').send({
					tenant_uuid: tenant.uuid,
					username: 'newcashier',
					password: 'cashier123',
					confirm_password: 'cashier123',
					name: 'New Cashier',
					email: 'new@example.com',
					role: 'cashier',
				})
			);
			expect(res.status).toBe(200);
			expect(res.body.response.uuid).toEqual(expect.any(String));
			expect(res.body.response.tenant_uuid).toBe(tenant.uuid);
			expect(res.body.response.passphrase).toBeUndefined();
			createdUuid = res.body.response.uuid;
		});

		it('POST /api/user/create — unknown tenant → 400', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).post('/api/user/create').send({
					tenant_uuid: '00000000-0000-0000-0000-000000000000',
					username: 'nope-tenant',
					password: 'cashier123',
					confirm_password: 'cashier123',
					name: 'Nope',
				})
			);
			expect(res.status).toBe(400);
			expect(res.body.message).toMatch(/tenant/i);
		});

		it('POST /api/user/create — duplicate username (globally) → 400', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).post('/api/user/create').send({
					tenant_uuid: tenant.uuid,
					username: 'newcashier',
					password: 'cashier123',
					confirm_password: 'cashier123',
					name: 'Dupe',
				})
			);
			expect(res.status).toBe(400);
			expect(res.body.message).toMatch(/already exists/i);
		});

		it('POST /api/user/create — same username different tenant is also rejected (global uniqueness)', async () => {
			const otherTenant = await seedTenant(app, { store_code: 'OTHER-9', display_name: 'Other' });
			const res = await withAdmin(
				request(app.getHttpServer()).post('/api/user/create').send({
					tenant_uuid: otherTenant.uuid,
					username: 'newcashier',
					password: 'cashier123',
					confirm_password: 'cashier123',
					name: 'Dupe X-Tenant',
				})
			);
			expect(res.status).toBe(400);
		});

		it('POST /api/user/create — password mismatch → 400', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).post('/api/user/create').send({
					tenant_uuid: tenant.uuid,
					username: 'diffpw',
					password: 'cashier123',
					confirm_password: 'nope-nope',
					name: 'Mismatch',
				})
			);
			expect(res.status).toBe(400);
		});

		it('GET /api/user/view/:uuid', async () => {
			const res = await withAdmin(request(app.getHttpServer()).get(`/api/user/view/${createdUuid}`));
			expect(res.status).toBe(200);
			expect(res.body.response.username).toBe('newcashier');
			expect(res.body.response.passphrase).toBeUndefined();
		});

		it('PATCH /api/user/update/:uuid', async () => {
			const res = await withAdmin(
				request(app.getHttpServer())
					.patch(`/api/user/update/${createdUuid}`)
					.send({ name: 'Renamed Cashier', role: 'manager' })
			);
			expect(res.status).toBe(200);
			expect(res.body.response.name).toBe('Renamed Cashier');
			expect(res.body.response.role).toBe('manager');
		});

		it('PATCH /api/user/set-status/:uuid → inactive', async () => {
			const res = await withAdmin(
				request(app.getHttpServer()).patch(`/api/user/set-status/${createdUuid}`).send({ status: 'inactive' })
			);
			expect(res.status).toBe(200);
			expect(res.body.response.status).toBe('inactive');
		});

		it('PATCH /api/user/change-password/:uuid — dashboard flow, no old password', async () => {
			const res = await withAdmin(
				request(app.getHttpServer())
					.patch(`/api/user/change-password/${createdUuid}`)
					.send({ password: 'brand-new-123', confirm_password: 'brand-new-123' })
			);
			expect(res.status).toBe(200);

			const k = getKnex(app);
			const history = await k('user_password_history').where({ user_uuid: createdUuid });
			expect(history.length).toBeGreaterThanOrEqual(1);
			expect(history[0].change_source).toBe('dashboard');
			expect(history[0].tenant_uuid).toBe(tenant.uuid);

			const updatedUser = await k('users').where({ uuid: createdUuid }).first();
			expect(updatedUser.last_change_password).toBeTruthy();
		});

		it('DELETE /api/user/delete/:uuid', async () => {
			const res = await withAdmin(request(app.getHttpServer()).delete(`/api/user/delete/${createdUuid}`));
			expect(res.status).toBe(200);
			expect(res.body.response.deleted).toBe(1);
		});
	});

	describe('Manager user-token access', () => {
		let managerToken: string;
		let cashierToken: string;
		let managerInfo: { uuid: string; username: string; password: string; tenant_uuid: string };
		let cashierInfo: { uuid: string; username: string; password: string; tenant_uuid: string };
		let otherTenant: { uuid: string; store_code: string; display_name: string };

		beforeAll(async () => {
			managerInfo = await seedUser(app, tenant.uuid, { username: 'mgr-token-user', role: 'manager' });
			cashierInfo = await seedUser(app, tenant.uuid, { username: 'cashier-token-user', role: 'cashier' });
			otherTenant = await seedTenant(app, { store_code: 'MGR-OTHER', display_name: 'Other Store' });

			managerToken = await loginAsUser(app, managerInfo.username, managerInfo.password);
			cashierToken = await loginAsUser(app, cashierInfo.username, cashierInfo.password);
		});

		it('manager can list dashboard (auto-scoped to own tenant)', async () => {
			// seed a user in another tenant that must NOT appear in the manager's result
			await seedUser(app, otherTenant.uuid, { username: 'other-tenant-user' });

			const res = await request(app.getHttpServer())
				.get('/api/user/dashboard')
				.set('Authorization', `Bearer ${managerToken}`);
			expect(res.status).toBe(200);
			expect(res.body.response.results.every((u: any) => u.tenant_uuid === tenant.uuid)).toBe(true);
			expect(res.body.response.results.some((u: any) => u.username === 'other-tenant-user')).toBe(false);
		});

		it('cashier is 403 on dashboard', async () => {
			const res = await request(app.getHttpServer())
				.get('/api/user/dashboard')
				.set('Authorization', `Bearer ${cashierToken}`);
			expect(res.status).toBe(403);
		});

		it('manager can create user — tenant_uuid auto-filled from token', async () => {
			const res = await request(app.getHttpServer())
				.post('/api/user/create')
				.set('Authorization', `Bearer ${managerToken}`)
				.send({
					// intentionally no tenant_uuid — controller fills from token
					username: 'made-by-mgr',
					password: 'cashier123',
					confirm_password: 'cashier123',
					name: 'Made by manager',
					role: 'cashier',
				});
			expect(res.status).toBe(200);
			expect(res.body.response.tenant_uuid).toBe(tenant.uuid);
		});

		it('manager cannot spoof a different tenant on create', async () => {
			const res = await request(app.getHttpServer())
				.post('/api/user/create')
				.set('Authorization', `Bearer ${managerToken}`)
				.send({
					tenant_uuid: otherTenant.uuid, // ignored
					username: 'mgr-spoof-attempt',
					password: 'cashier123',
					confirm_password: 'cashier123',
					name: 'Spoof',
				});
			expect(res.status).toBe(200);
			expect(res.body.response.tenant_uuid).toBe(tenant.uuid);
		});

		it('manager cannot update a user in another tenant → 403', async () => {
			const otherUser = await seedUser(app, otherTenant.uuid, { username: 'guarded-target' });
			const res = await request(app.getHttpServer())
				.patch(`/api/user/update/${otherUser.uuid}`)
				.set('Authorization', `Bearer ${managerToken}`)
				.send({ name: 'hijacked' });
			expect(res.status).toBe(403);
		});

		it('cashier cannot create a user → 403', async () => {
			const res = await request(app.getHttpServer())
				.post('/api/user/create')
				.set('Authorization', `Bearer ${cashierToken}`)
				.send({
					username: 'cashier-should-not-make-this',
					password: 'cashier123',
					confirm_password: 'cashier123',
					name: 'Nope',
				});
			expect(res.status).toBe(403);
		});
	});

	describe('POST /api/user/verify-credentials', () => {
		let cashierToken: string;
		let cashier: { uuid: string; username: string; password: string; tenant_uuid: string };
		let manager: { uuid: string; username: string; password: string; tenant_uuid: string };
		let admin: { uuid: string; username: string; password: string; tenant_uuid: string };
		let otherTenant: { uuid: string; store_code: string; display_name: string };
		let otherTenantManager: { uuid: string; username: string; password: string; tenant_uuid: string };

		beforeAll(async () => {
			cashier = await seedUser(app, tenant.uuid, { username: 'vc-cashier', role: 'cashier' });
			manager = await seedUser(app, tenant.uuid, { username: 'vc-manager', role: 'manager' });
			admin = await seedUser(app, tenant.uuid, { username: 'vc-admin', role: 'admin' });

			otherTenant = await seedTenant(app, { store_code: 'VC-OTHER', display_name: 'Other Tenant' });
			otherTenantManager = await seedUser(app, otherTenant.uuid, {
				username: 'vc-other-mgr',
				role: 'manager',
			});

			cashierToken = await loginAsUser(app, cashier.username, cashier.password);
		});

		it('no token → 401', async () => {
			const res = await request(app.getHttpServer())
				.post('/api/user/verify-credentials')
				.send({ username: manager.username, password: manager.password });
			expect(res.status).toBe(401);
		});

		it('admin token → 403 (needs user token to know current tenant)', async () => {
			const res = await withAdmin(
				request(app.getHttpServer())
					.post('/api/user/verify-credentials')
					.send({ username: manager.username, password: manager.password })
			);
			expect(res.status).toBe(403);
		});

		it('manager creds → verified: true', async () => {
			const res = await request(app.getHttpServer())
				.post('/api/user/verify-credentials')
				.set('Authorization', `Bearer ${cashierToken}`)
				.send({ username: manager.username, password: manager.password });
			expect(res.status).toBe(200);
			expect(res.body.response.verified).toBe(true);
			expect(res.body.response.user.role).toBe('manager');
			expect(res.body.response.user.uuid).toBe(manager.uuid);
		});

		it('admin creds → verified: true', async () => {
			const res = await request(app.getHttpServer())
				.post('/api/user/verify-credentials')
				.set('Authorization', `Bearer ${cashierToken}`)
				.send({ username: admin.username, password: admin.password });
			expect(res.status).toBe(200);
			expect(res.body.response.verified).toBe(true);
			expect(res.body.response.user.role).toBe('admin');
		});

		it('cashier creds → 403 (role not allowed)', async () => {
			const res = await request(app.getHttpServer())
				.post('/api/user/verify-credentials')
				.set('Authorization', `Bearer ${cashierToken}`)
				.send({ username: cashier.username, password: cashier.password });
			expect(res.status).toBe(403);
			expect(res.body.response.verified).toBe(false);
		});

		it('wrong password → 401', async () => {
			const res = await request(app.getHttpServer())
				.post('/api/user/verify-credentials')
				.set('Authorization', `Bearer ${cashierToken}`)
				.send({ username: manager.username, password: 'wrong-pass' });
			expect(res.status).toBe(401);
			expect(res.body.response.verified).toBe(false);
		});

		it('unknown username → 401', async () => {
			const res = await request(app.getHttpServer())
				.post('/api/user/verify-credentials')
				.set('Authorization', `Bearer ${cashierToken}`)
				.send({ username: 'no-such-user', password: 'whatever123' });
			expect(res.status).toBe(401);
		});

		it('manager from another tenant → 401 (tenant-scoped lookup)', async () => {
			const res = await request(app.getHttpServer())
				.post('/api/user/verify-credentials')
				.set('Authorization', `Bearer ${cashierToken}`)
				.send({ username: otherTenantManager.username, password: otherTenantManager.password });
			expect(res.status).toBe(401);
		});

		it('inactive manager blocked → 401', async () => {
			const sleeper = await seedUser(app, tenant.uuid, {
				username: 'vc-inactive-mgr',
				role: 'manager',
				status: 'inactive',
			});
			const res = await request(app.getHttpServer())
				.post('/api/user/verify-credentials')
				.set('Authorization', `Bearer ${cashierToken}`)
				.send({ username: sleeper.username, password: sleeper.password });
			expect(res.status).toBe(401);
			expect(res.body.message).toMatch(/inactive/i);
		});
	});

	describe('Profile change-password (user token)', () => {
		let userToken: string;

		beforeAll(async () => {
			userToken = await loginAsUser(app, seededUser.username, seededUser.password);
		});

		it('rejects admin token', async () => {
			const res = await withAdmin(
				request(app.getHttpServer())
					.patch('/api/user/profile/change-password')
					.send({ old_password: seededUser.password, password: 'newpass1', confirm_password: 'newpass1' })
			);
			expect(res.status).toBe(403);
		});

		it('wrong old password → 400', async () => {
			const res = await request(app.getHttpServer())
				.patch('/api/user/profile/change-password')
				.set('Authorization', `Bearer ${userToken}`)
				.send({ old_password: 'nope-nope', password: 'aaaaaa1', confirm_password: 'aaaaaa1' });
			expect(res.status).toBe(400);
			expect(res.body.message).toMatch(/old password/i);
		});

		it('success + logs history + login with new password', async () => {
			const newPass = 'my-new-secret';
			const res = await request(app.getHttpServer())
				.patch('/api/user/profile/change-password')
				.set('Authorization', `Bearer ${userToken}`)
				.send({ old_password: seededUser.password, password: newPass, confirm_password: newPass });
			expect(res.status).toBe(200);

			const k = getKnex(app);
			const history = await k('user_password_history').where({ user_uuid: seededUser.uuid, change_source: 'profile' });
			expect(history.length).toBeGreaterThanOrEqual(1);

			const relogin = await request(app.getHttpServer())
				.post('/api/auth/user/login')
				.send({ username: seededUser.username, password: newPass });
			expect(relogin.status).toBe(200);
		});
	});
});
