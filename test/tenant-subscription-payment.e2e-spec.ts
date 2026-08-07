import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './utils/create-app';
import { getKnex, resetTables, seedAdmin, seedTenant, seedUser } from './utils/db';
import { loginAsAdmin, loginAsUser } from './utils/login';

// URL matches what /api/ai-extraction/receipt would return.
const FAKE_ATTACHMENT_URL = '/public/uploads/ai-extraction/receipts/2026/07/deadbeef.png';

describe('Tenant Subscription Payment (e2e)', () => {
	let app: INestApplication;
	let adminToken: string;
	let userToken: string;
	let tenant: { uuid: string; store_code: string; display_name: string };
	let otherTenant: { uuid: string; store_code: string; display_name: string };
	let planUuid: string;

	async function createPlan(overrides: any = {}) {
		const res = await request(app.getHttpServer())
			.post('/api/subscription-plan/create')
			.set('Authorization', `Bearer ${adminToken}`)
			.send({
				code: overrides.code ?? 'BASIC-30',
				name: overrides.name ?? 'Basic Monthly',
				price: overrides.price ?? 199,
				days_duration: overrides.days_duration ?? 30,
				features: overrides.features ?? '- 1 store',
				days_warning_for_near_expiry: overrides.days_warning_for_near_expiry ?? 5,
			});
		return res.body.response.uuid as string;
	}

	beforeAll(async () => {
		app = await createTestApp();
		await resetTables(app);
		await seedAdmin(app);
		adminToken = await loginAsAdmin(app);

		tenant = await seedTenant(app, { store_code: 'TSP-01', display_name: 'Sub Store' });
		otherTenant = await seedTenant(app, { store_code: 'TSP-02', display_name: 'Other Sub Store' });

		const u = await seedUser(app, tenant.uuid, { username: 'tsp-user' });
		userToken = await loginAsUser(app, u.username, u.password);

		planUuid = await createPlan();
	});

	afterAll(async () => {
		await app.close();
	});

	const withAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`);
	const withUser = (req: request.Test) => req.set('Authorization', `Bearer ${userToken}`);

	describe('POST /upload', () => {
		it('user token: JSON body, amount_paid + attachment_url stored, tenant auto-scoped', async () => {
			const res = await withUser(
				request(app.getHttpServer()).post('/api/tenant-subscription-payment/upload')
			).send({
				subscription_plan_uuid: planUuid,
				amount_paid: 199,
				payment_attachment_url: FAKE_ATTACHMENT_URL,
				payment_reference_number: 'REF-12345',
				payee_account_number: '1234-5678',
				payment_method: 'ewallet',
				payment_method_name: 'GCash',
				payment_datetime: '2026-07-03T10:15:00+08:00',
				ai_extraction: {
					payment_reference_number: 'REF-12345',
					amount_paid: 199,
					confidence: 0.87,
				},
			});

			expect(res.status).toBe(200);
			expect(res.body.response.tenant_uuid).toBe(tenant.uuid);
			expect(res.body.response.payment_status).toBe('pending');
			expect(res.body.response.subscription_plan_code).toBe('BASIC-30');
			expect(res.body.response.subscription_days).toBe(30);
			expect(Number(res.body.response.subscription_plan_amount)).toBe(199);
			expect(Number(res.body.response.amount_paid)).toBe(199);
			expect(res.body.response.payment_attachment_file).toBe(FAKE_ATTACHMENT_URL);
			expect(res.body.response.ai_extraction).toEqual(
				expect.objectContaining({ payment_reference_number: 'REF-12345', amount_paid: 199 })
			);
		});

		it('unknown plan → 400', async () => {
			const res = await withUser(
				request(app.getHttpServer()).post('/api/tenant-subscription-payment/upload')
			).send({
				subscription_plan_uuid: '00000000-0000-0000-0000-000000000000',
				amount_paid: 100,
			});
			expect(res.status).toBe(400);
			expect(res.body.message).toMatch(/plan/i);
		});

		it('missing amount_paid → 400', async () => {
			const res = await withUser(
				request(app.getHttpServer()).post('/api/tenant-subscription-payment/upload')
			).send({ subscription_plan_uuid: planUuid });
			expect(res.status).toBe(400);
		});

		it('user cannot spoof another tenant', async () => {
			const res = await withUser(
				request(app.getHttpServer()).post('/api/tenant-subscription-payment/upload')
			).send({
				tenant_uuid: otherTenant.uuid,
				subscription_plan_uuid: planUuid,
				amount_paid: 199,
			});
			expect(res.status).toBe(200);
			expect(res.body.response.tenant_uuid).toBe(tenant.uuid);
		});
	});

	describe('Approve → activates subscription', () => {
		let paymentUuid: string;

		beforeEach(async () => {
			const up = await withUser(
				request(app.getHttpServer()).post('/api/tenant-subscription-payment/upload')
			).send({
				subscription_plan_uuid: planUuid,
				amount_paid: 199,
				payment_reference_number: 'REF-APP',
			});
			paymentUuid = up.body.response.uuid;
		});

		it('PATCH /approve — user token → 403', async () => {
			const res = await withUser(
				request(app.getHttpServer()).patch(`/api/tenant-subscription-payment/approve/${paymentUuid}`)
			).send({});
			expect(res.status).toBe(403);
		});

		it('PATCH /approve — admin: sets tenants.current_*, writes history, patches payment', async () => {
			const start = '2026-07-03T00:00:00+08:00';
			const res = await withAdmin(
				request(app.getHttpServer()).patch(`/api/tenant-subscription-payment/approve/${paymentUuid}`)
			).send({ subscription_start: start });
			expect(res.status).toBe(200);
			expect(res.body.response.payment_status).toBe('approved');
			expect(res.body.response.payment_approved_datetime).toBeTruthy();

			const k = getKnex(app);
			const t = await k('tenants').where({ uuid: tenant.uuid }).first();
			expect(t.current_subscription_plan_uuid).toBe(planUuid);
			expect(t.current_subscription_days).toBe(30);
			expect(t.current_subscription_expiry_warning_days).toBe(5);
			expect(Number(t.current_subscription_plan_amount)).toBe(199);
			expect(new Date(t.current_subscription_start).getTime()).toBe(new Date(start).getTime());
			const expectedEnd = new Date(start);
			expectedEnd.setDate(expectedEnd.getDate() + 30);
			expect(new Date(t.current_subscription_expiry).getTime()).toBe(expectedEnd.getTime());

			const history = await k('tenant_subscription_history').where({ tenant_uuid: tenant.uuid, status: 'active' });
			expect(history.length).toBe(1);
			expect(history[0].subscription_plan_code).toBe('BASIC-30');
			expect(history[0].activated_by_payment_uuid).toBe(paymentUuid);
		});

		it('PATCH /approve — approving a second payment expires prior history row', async () => {
			await withAdmin(
				request(app.getHttpServer()).patch(`/api/tenant-subscription-payment/approve/${paymentUuid}`)
			).send({});

			const up2 = await withUser(
				request(app.getHttpServer()).post('/api/tenant-subscription-payment/upload')
			).send({ subscription_plan_uuid: planUuid, amount_paid: 199 });
			const second = up2.body.response.uuid;

			await withAdmin(
				request(app.getHttpServer()).patch(`/api/tenant-subscription-payment/approve/${second}`)
			).send({});

			const k = getKnex(app);
			const rows = await k('tenant_subscription_history').where({ tenant_uuid: tenant.uuid });
			const active = rows.filter((r: any) => r.status === 'active');
			const expired = rows.filter((r: any) => r.status === 'expired');
			expect(active.length).toBe(1);
			expect(active[0].activated_by_payment_uuid).toBe(second);
			expect(expired.length).toBeGreaterThanOrEqual(1);
		});

		it('PATCH /approve — cannot re-approve a non-pending payment', async () => {
			await withAdmin(
				request(app.getHttpServer()).patch(`/api/tenant-subscription-payment/approve/${paymentUuid}`)
			).send({});
			const res = await withAdmin(
				request(app.getHttpServer()).patch(`/api/tenant-subscription-payment/approve/${paymentUuid}`)
			).send({});
			expect(res.status).toBe(400);
			expect(res.body.message).toMatch(/already/i);
		});
	});

	describe('Reject', () => {
		it('PATCH /reject — admin', async () => {
			const up = await withUser(
				request(app.getHttpServer()).post('/api/tenant-subscription-payment/upload')
			).send({ subscription_plan_uuid: planUuid, amount_paid: 199 });
			const uuid = up.body.response.uuid;

			const res = await withAdmin(
				request(app.getHttpServer()).patch(`/api/tenant-subscription-payment/reject/${uuid}`)
			).send({ rejection_reason: 'reference # not readable' });
			expect(res.status).toBe(200);
			expect(res.body.response.payment_status).toBe('rejected');
			expect(res.body.response.rejection_reason).toMatch(/not readable/);
		});

		it('PATCH /reject — user token → 403', async () => {
			const up = await withUser(
				request(app.getHttpServer()).post('/api/tenant-subscription-payment/upload')
			).send({ subscription_plan_uuid: planUuid, amount_paid: 199 });

			const res = await withUser(
				request(app.getHttpServer()).patch(`/api/tenant-subscription-payment/reject/${up.body.response.uuid}`)
			).send({ rejection_reason: 'nope' });
			expect(res.status).toBe(403);
		});
	});

	describe('Dashboard', () => {
		it('user auto-scoped to own tenant', async () => {
			const res = await withUser(request(app.getHttpServer()).get('/api/tenant-subscription-payment/dashboard'));
			expect(res.status).toBe(200);
			expect(res.body.response.results.every((r: any) => r.tenant_uuid === tenant.uuid)).toBe(true);
		});

		it('admin can filter by payment_status', async () => {
			const res = await withAdmin(
				request(app.getHttpServer())
					.get('/api/tenant-subscription-payment/dashboard')
					.query({ payment_status: 'pending' })
			);
			expect(res.status).toBe(200);
			expect(res.body.response.results.every((r: any) => r.payment_status === 'pending')).toBe(true);
		});
	});
});
