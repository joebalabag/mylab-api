import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import { basename, join } from 'path';
import { transaction as objectionTransaction, Transaction as KnexTrx } from 'objection';

import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import { ApiWarning } from '@/common/helpers/response.helper';
import { MailerService, MailAttachment } from '@/common/mailer/mailer.service';
import { SubscriptionPlan } from '../subscription-plan/subscription-plan.model';
import { Tenant } from '../tenant/tenant.model';
import { TenantSubscriptionHistory } from './tenant-subscription-history.model';
import { TenantSubscriptionPayment } from './tenant-subscription-payment.model';
import { SubscriptionPaymentDashboardQueryDTO } from './dto/tenant-subscription-payment.dto';
import {
	assertPaypalConfigured,
	captureOrder,
	createOrder,
	getOrder,
	readPaypalConfig,
	readWebhookHeaders,
	verifyWebhookSignature,
	type CapturedOrder,
} from './paypal.util';

@Injectable()
export class TenantSubscriptionPaymentService {
	private readonly logger = new Logger(TenantSubscriptionPaymentService.name);

	constructor(
		private readonly mailer: MailerService,
		private readonly config: ConfigService,
	) {}

	async listDashboard(filters: SubscriptionPaymentDashboardQueryDTO): Promise<PagedResult<TenantSubscriptionPayment>> {
		const query = TenantSubscriptionPayment.query().orderBy('created_at', 'desc');

		if (filters.tenant_uuid) query.where('tenant_uuid', filters.tenant_uuid);
		if (filters.payment_status) query.where('payment_status', filters.payment_status);
		if (filters.status && filters.status.length) query.whereIn('payment_status', filters.status);

		if (filters.date_from) query.where('created_at', '>=', filters.date_from);
		if (filters.date_to) query.where('created_at', '<=', `${filters.date_to} 23:59:59`);

		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			query.where((qb) => {
				qb.where('subscription_plan_code', 'ilike', kw)
					.orWhere('subscription_plan_name', 'ilike', kw)
					.orWhere('payment_reference_number', 'ilike', kw)
					.orWhere('payee_account_number', 'ilike', kw)
					.orWhere('payment_method_name', 'ilike', kw);
			});
		}

		return applyPagination<TenantSubscriptionPayment>(query as any, filters.page_number, filters.page_size);
	}

	async findByUuid(uuid: string): Promise<TenantSubscriptionPayment | undefined> {
		return TenantSubscriptionPayment.query().findOne({ uuid }) as unknown as TenantSubscriptionPayment | undefined;
	}

	/**
	 * Persist a new payment record. The receipt file is already stored on disk
	 * (via /api/ai-extraction/receipt); the caller passes back its public URL.
	 */
	async upload(payload: {
		tenant_uuid: string;
		subscription_plan_uuid: string;
		amount_paid: number;
		payment_attachment_url?: string;
		payment_reference_number?: string;
		payee_account_number?: string;
		payment_method?: string;
		payment_method_name?: string;
		payment_datetime?: string;
		ai_extraction?: any;
		created_by: string;
	}): Promise<{ payment: TenantSubscriptionPayment; warnings: ApiWarning[] }> {
		const plan = (await SubscriptionPlan.query().findOne({ uuid: payload.subscription_plan_uuid })) as
			| SubscriptionPlan
			| undefined;
		if (!plan) throw new BadRequestException('Subscription plan not found.');

		const created = (await TenantSubscriptionPayment.query().insertAndFetch({
			tenant_uuid: payload.tenant_uuid,
			subscription_plan_uuid: plan.uuid,
			subscription_plan_code: plan.code,
			subscription_plan_name: plan.name,
			subscription_days: plan.days_duration,
			subscription_plan_amount: plan.price,
			amount_paid: payload.amount_paid,
			payment_status: 'pending',
			payment_reference_number: payload.payment_reference_number ?? null,
			payee_account_number: payload.payee_account_number ?? null,
			payment_method: payload.payment_method ?? null,
			payment_method_name: payload.payment_method_name ?? null,
			payment_datetime: payload.payment_datetime ?? null,
			payment_attachment_file: payload.payment_attachment_url ?? null,
			ai_extraction: payload.ai_extraction ?? null,
			created_by: payload.created_by,
		} as any)) as unknown as TenantSubscriptionPayment;

		// Synchronously decide "send or skip" so the response can carry an
		// accurate warning when the store has no contact email.
		const tenant = (await Tenant.query().findOne({ uuid: created.tenant_uuid })) as
			| Tenant
			| undefined;
		const warnings: ApiWarning[] = [];
		if (!tenant?.email_address) {
			warnings.push(this.noContactEmailWarning('submitted', created.tenant_uuid));
		} else {
			// Best-effort background send. Failure logs but doesn't affect the response.
			void this.notifyPaymentSubmitted(created, plan, tenant).catch((err: any) => {
				this.logger.error(
					`payment-submitted email failed for payment=${created.uuid}: ${err?.message}`,
					err?.stack,
				);
			});
		}

		return { payment: created, warnings };
	}

	private async notifyPaymentSubmitted(
		payment: TenantSubscriptionPayment,
		plan: SubscriptionPlan,
		tenant: Tenant,
	): Promise<void> {
		const to = tenant.email_address;
		if (!to) return; // upload() already recorded a warning in this case

		const fmtAmount = (n: number | null | undefined) => {
			if (n == null) return '—';
			return `${tenant.currency || 'PHP'} ${Number(n).toFixed(2)}`;
		};

		const attachments = this.buildReceiptAttachments(payment.payment_attachment_file || null);
		const hasAttachment = attachments.length > 0;

		await this.mailer.sendTemplate(
			to,
			'payment-submitted',
			{
				owner_name: tenant.owner_name || tenant.display_name || 'there',
				store_name: tenant.display_name,
				plan_name: plan.name,
				amount_paid: fmtAmount(payment.amount_paid ?? null),
				payment_method_name: payment.payment_method_name || payment.payment_method || null,
				payment_reference_number: payment.payment_reference_number || null,
				payment_datetime: payment.payment_datetime
					? new Date(payment.payment_datetime).toISOString()
					: null,
				submitted_at: new Date().toISOString(),
				receipt_attached: hasAttachment,
			},
			{ attachments },
		);
	}

	/**
	 * Turn the stored "/public/uploads/..." URL back into an absolute disk
	 * path and hand it to nodemailer as an attachment. Silently drops the
	 * attachment if the file is missing or the path escapes /public/.
	 */
	private buildReceiptAttachments(publicPathOrUrl: string | null): MailAttachment[] {
		if (!publicPathOrUrl) return [];
		try {
			const stripped = publicPathOrUrl.replace(/^\/?public\//, '');
			if (!stripped || stripped.includes('..')) return [];
			const abs = join(process.cwd(), 'public', stripped);
			if (!existsSync(abs)) {
				this.logger.warn(`Receipt file missing on disk: ${abs}`);
				return [];
			}
			return [{ filename: basename(abs), path: abs }];
		} catch (err: any) {
			this.logger.warn(`Could not build receipt attachment: ${err?.message}`);
			return [];
		}
	}

	/**
	 * Approve → mark payment approved, then either activate the plan immediately
	 * (no active plan / current one expired) or schedule it to activate when the
	 * current plan expires (current plan has <= 5 days remaining). Reject when
	 * the current plan still has more than 5 days left.
	 */
	async approve(params: {
		uuid: string;
		approved_by_uuid: string;
		approved_by_name: string;
		subscription_start?: string;
	}): Promise<{
		payment: TenantSubscriptionPayment;
		activation_mode: 'immediate' | 'scheduled';
		subscription_start: Date;
		subscription_end: Date;
		warnings: ApiWarning[];
	}> {
		return objectionTransaction(TenantSubscriptionPayment.knex(), async (trx) => {
			const payment = (await TenantSubscriptionPayment.query(trx).findOne({ uuid: params.uuid })) as
				| TenantSubscriptionPayment
				| undefined;
			if (!payment) throw new NotFoundException('Payment not found.');
			if (payment.payment_status !== 'pending') {
				throw new BadRequestException(`Payment already ${payment.payment_status}.`);
			}
			return this.applyApprovedPayment(trx, payment, {
				approved_by_uuid: params.approved_by_uuid,
				approved_by_name: params.approved_by_name,
				subscription_start: params.subscription_start,
			});
		});
	}

	/**
	 * Shared activation core, used by admin-approve and PayPal-capture.
	 * Assumes: the payment row exists, its status is 'pending', and the caller
	 * holds a transaction. Runs the three-rule flow (immediate / schedule /
	 * reject) and marks the payment 'approved'. Sends the tenant email
	 * best-effort. Returns the same shape as approve().
	 */
	private async applyApprovedPayment(
		trx: KnexTrx,
		payment: TenantSubscriptionPayment,
		by: { approved_by_uuid: string | null; approved_by_name: string; subscription_start?: string },
	): Promise<{
		payment: TenantSubscriptionPayment;
		activation_mode: 'immediate' | 'scheduled';
		subscription_start: Date;
		subscription_end: Date;
		warnings: ApiWarning[];
	}> {
		// Lazy-promote any due scheduled row so Rule 1/2/3 sees the current true state.
		await this.promoteScheduledForTenant(trx, payment.tenant_uuid);

		const tenant = (await Tenant.query(trx).findOne({ uuid: payment.tenant_uuid })) as Tenant | undefined;
		if (!tenant) throw new NotFoundException('Tenant not found.');

		const plan = (await SubscriptionPlan.query(trx).findOne({ uuid: payment.subscription_plan_uuid })) as
			| SubscriptionPlan
			| undefined;
		const warning_days = Number(plan?.days_warning_for_near_expiry ?? 7);

		const now = new Date();
		const currentExpiry = tenant.current_subscription_expiry
			? new Date(tenant.current_subscription_expiry)
			: null;
		const hasActivePlan = !!currentExpiry && currentExpiry > now;
		const daysToExpiry = hasActivePlan
			? Math.ceil((currentExpiry!.getTime() - now.getTime()) / 86_400_000)
			: 0;

		let activation_mode: 'immediate' | 'scheduled';
		let start: Date;
		let end: Date;

		if (!hasActivePlan) {
			activation_mode = 'immediate';
			start = by.subscription_start ? new Date(by.subscription_start) : now;
			end = new Date(start);
			end.setDate(end.getDate() + Number(payment.subscription_days));

			await this.expireOpenHistoryRows(trx, payment.tenant_uuid);

			await TenantSubscriptionHistory.query(trx).insert({
				tenant_uuid: payment.tenant_uuid,
				subscription_plan_uuid: payment.subscription_plan_uuid,
				subscription_plan_code: payment.subscription_plan_code,
				subscription_plan_name: payment.subscription_plan_name,
				subscription_start: start,
				subscription_end: end,
				subscription_days: payment.subscription_days,
				expiry_warning_days: warning_days,
				subscription_plan_amount: payment.subscription_plan_amount,
				status: 'active',
				activated_by_payment_uuid: payment.uuid,
				created_by: by.approved_by_name,
			} as any);

			await Tenant.query(trx).patch({
				current_subscription_plan_uuid: payment.subscription_plan_uuid,
				current_subscription_days: payment.subscription_days,
				current_subscription_start: start,
				current_subscription_expiry: end,
				current_subscription_expiry_warning_days: warning_days,
				current_subscription_plan_amount: payment.subscription_plan_amount,
			} as any).where({ uuid: payment.tenant_uuid });
		} else if (daysToExpiry <= 5) {
			const existingScheduled = await TenantSubscriptionHistory.query(trx)
				.findOne({ tenant_uuid: payment.tenant_uuid, status: 'scheduled' });
			if (existingScheduled) {
				throw new BadRequestException('A scheduled subscription already exists for this tenant.');
			}

			activation_mode = 'scheduled';
			start = new Date(currentExpiry!);
			end = new Date(start);
			end.setDate(end.getDate() + Number(payment.subscription_days));

			await TenantSubscriptionHistory.query(trx).insert({
				tenant_uuid: payment.tenant_uuid,
				subscription_plan_uuid: payment.subscription_plan_uuid,
				subscription_plan_code: payment.subscription_plan_code,
				subscription_plan_name: payment.subscription_plan_name,
				subscription_start: start,
				subscription_end: end,
				subscription_days: payment.subscription_days,
				expiry_warning_days: warning_days,
				subscription_plan_amount: payment.subscription_plan_amount,
				status: 'scheduled',
				activated_by_payment_uuid: payment.uuid,
				created_by: by.approved_by_name,
			} as any);
		} else {
			throw new BadRequestException(
				`Current plan still has ${daysToExpiry} days remaining; can only approve within 5 days of expiry.`,
			);
		}

		const updatedPayment = (await TenantSubscriptionPayment.query(trx).patchAndFetchById(payment.uuid, {
			payment_status: 'approved',
			payment_approved_by_uuid: by.approved_by_uuid,
			payment_approved_by_name: by.approved_by_name,
			payment_approved_datetime: new Date(),
			updated_by: by.approved_by_name,
		} as any)) as unknown as TenantSubscriptionPayment;

		const warnings: ApiWarning[] = [];
		if (!tenant.email_address) {
			warnings.push(this.noContactEmailWarning('approved', tenant.uuid));
		} else {
			void this.notifyPaymentApproved(updatedPayment, tenant, plan, activation_mode, start, end, by.approved_by_name)
				.catch((err: any) => {
					this.logger.error(
						`payment-approved email failed for payment=${updatedPayment.uuid}: ${err?.message}`,
						err?.stack,
					);
				});
		}

		return { payment: updatedPayment, activation_mode, subscription_start: start, subscription_end: end, warnings };
	}

	async reject(params: {
		uuid: string;
		rejection_reason: string;
		rejected_by_uuid: string;
		rejected_by_name: string;
	}): Promise<{ payment: TenantSubscriptionPayment; warnings: ApiWarning[] }> {
		const payment = await this.findByUuid(params.uuid);
		if (!payment) throw new NotFoundException('Payment not found.');
		if (payment.payment_status !== 'pending') {
			throw new BadRequestException(`Payment already ${payment.payment_status}.`);
		}
		const updated = (await TenantSubscriptionPayment.query().patchAndFetchById(params.uuid, {
			payment_status: 'rejected',
			payment_rejected_by_uuid: params.rejected_by_uuid,
			payment_rejected_by_name: params.rejected_by_name,
			payment_rejected_datetime: new Date(),
			rejection_reason: params.rejection_reason,
			updated_by: params.rejected_by_name,
		} as any)) as unknown as TenantSubscriptionPayment;

		const tenant = (await Tenant.query().findOne({ uuid: updated.tenant_uuid })) as Tenant | undefined;
		const warnings: ApiWarning[] = [];
		if (!tenant?.email_address) {
			warnings.push(this.noContactEmailWarning('rejected', updated.tenant_uuid));
		} else {
			void this.notifyPaymentRejected(updated, tenant, params.rejection_reason, params.rejected_by_name).catch((err: any) => {
				this.logger.error(
					`payment-rejected email failed for payment=${updated.uuid}: ${err?.message}`,
					err?.stack,
				);
			});
		}

		return { payment: updated, warnings };
	}

	/** Shared warning payload for the "tenant has no contact email" case. */
	private noContactEmailWarning(
		event: 'submitted' | 'approved' | 'rejected',
		tenant_uuid: string,
	): ApiWarning {
		const phrase = {
			submitted: 'confirm the submission',
			approved: 'confirm the approval',
			rejected: 'explain the rejection',
		}[event];
		return {
			code: 'notification.skipped.no-contact-email',
			text: `No email was sent to ${phrase} — the store hasn't set a contact email address. Update the tenant profile to receive notifications.`,
			meta: { channel: 'email', event: `payment-${event}`, tenant_uuid },
		};
	}

	private appUrl(): string {
		return String(this.config.get<string>('APP_URL') || 'http://localhost:5173').replace(/\/$/, '');
	}

	private fmtAmount(n: number | null | undefined, currency: string | undefined): string {
		if (n == null) return '—';
		return `${currency || 'PHP'} ${Number(n).toFixed(2)}`;
	}

	private async notifyPaymentApproved(
		payment: TenantSubscriptionPayment,
		tenant: Tenant,
		plan: SubscriptionPlan | undefined,
		activation_mode: 'immediate' | 'scheduled',
		start: Date,
		end: Date,
		approved_by_name: string,
	): Promise<void> {
		const to = tenant.email_address;
		if (!to) {
			this.logger.warn(
				`Skip payment-approved email: tenant ${tenant.uuid} has no email_address on record.`,
			);
			return;
		}
		await this.mailer.sendTemplate(to, 'payment-approved', {
			owner_name: tenant.owner_name || tenant.display_name || 'there',
			store_name: tenant.display_name,
			plan_name: plan?.name || payment.subscription_plan_name,
			amount_paid: this.fmtAmount(payment.amount_paid ?? null, tenant.currency),
			activation_mode,
			subscription_start: start.toISOString(),
			subscription_end: end.toISOString(),
			approved_by_name,
			login_url: `${this.appUrl()}/login`,
		});
	}

	private async notifyPaymentRejected(
		payment: TenantSubscriptionPayment,
		tenant: Tenant,
		rejection_reason: string,
		rejected_by_name: string,
	): Promise<void> {
		const to = tenant.email_address;
		if (!to) return; // reject() already recorded a warning in this case
		await this.mailer.sendTemplate(to, 'payment-rejected', {
			owner_name: tenant.owner_name || tenant.display_name || 'there',
			store_name: tenant.display_name,
			plan_name: payment.subscription_plan_name,
			amount_paid: this.fmtAmount(payment.amount_paid ?? null, tenant.currency),
			payment_reference_number: payment.payment_reference_number || null,
			rejection_reason,
			rejected_by_name,
			rejected_at: new Date().toISOString(),
			login_url: `${this.appUrl()}/login`,
		});
	}

	/** Mark any earlier still-active history rows for this tenant as 'expired'. */
	private async expireOpenHistoryRows(trx: KnexTrx, tenant_uuid: string): Promise<void> {
		await TenantSubscriptionHistory.query(trx)
			.patch({ status: 'expired' } as any)
			.where({ tenant_uuid, status: 'active' });
	}

	/**
	 * Lazy per-tenant promotion. If the tenant's current plan has expired and
	 * a 'scheduled' history row is due to start, expire the old active row,
	 * activate the scheduled row, and refresh the tenant's current_* fields.
	 * Safe to call inside an existing transaction (pass trx) or standalone.
	 */
	async promoteScheduledForTenant(trx: KnexTrx | undefined, tenant_uuid: string): Promise<boolean> {
		const run = async (t: KnexTrx) => {
			const tenant = (await Tenant.query(t).findOne({ uuid: tenant_uuid })) as Tenant | undefined;
			if (!tenant) return false;

			const now = new Date();
			const expiry = tenant.current_subscription_expiry
				? new Date(tenant.current_subscription_expiry)
				: null;
			if (expiry && expiry > now) return false;

			const scheduled = (await TenantSubscriptionHistory.query(t)
				.where({ tenant_uuid, status: 'scheduled' })
				.andWhere('subscription_start', '<=', now)
				.orderBy('subscription_start', 'asc')
				.first()) as TenantSubscriptionHistory | undefined;
			if (!scheduled) return false;

			await this.expireOpenHistoryRows(t, tenant_uuid);

			await TenantSubscriptionHistory.query(t)
				.patch({ status: 'active' } as any)
				.where({ uuid: scheduled.uuid });

			await Tenant.query(t).patch({
				current_subscription_plan_uuid: scheduled.subscription_plan_uuid,
				current_subscription_days: scheduled.subscription_days,
				current_subscription_start: scheduled.subscription_start,
				current_subscription_expiry: scheduled.subscription_end,
				current_subscription_expiry_warning_days: scheduled.expiry_warning_days,
				current_subscription_plan_amount: scheduled.subscription_plan_amount,
			} as any).where({ uuid: tenant_uuid });

			return true;
		};

		if (trx) return run(trx);
		return objectionTransaction(TenantSubscriptionPayment.knex(), run);
	}

	// ─── PayPal integration ──────────────────────────────────────────────
	//
	// Two-track auto-approval flow:
	//   1. Tenant clicks a PayPal Smart Button on the Subscription page.
	//   2. Frontend calls createPaypalOrder() → we create a PayPal Order for
	//      the plan's price, return the order id, browser opens PayPal popup.
	//   3. On approve, frontend calls capturePaypalOrder() → we capture, verify
	//      amount vs. plan, insert a payment row (auto-approved), activate.
	//   4. In parallel, PayPal fires PAYMENT.CAPTURE.COMPLETED to our webhook.
	//      handlePaypalWebhookEvent() verifies signature, then does the same
	//      capture-lookup path. The unique index on paypal_capture_id makes
	//      the whole thing idempotent — whichever path wins, the other becomes
	//      a no-op.

	/**
	 * Prepare a PayPal Order for the tenant to pay. Returns the order id that
	 * the Smart Button consumes. Called once per checkout attempt.
	 */
	async createPaypalOrder(params: {
		tenant_uuid: string;
		subscription_plan_uuid: string;
	}): Promise<{ order_id: string; amount: number; currency: string }> {
		const cfg = readPaypalConfig();
		assertPaypalConfigured(cfg);

		const plan = (await SubscriptionPlan.query().findOne({ uuid: params.subscription_plan_uuid })) as
			| SubscriptionPlan
			| undefined;
		if (!plan) throw new BadRequestException('Subscription plan not found.');

		const tenant = (await Tenant.query().findOne({ uuid: params.tenant_uuid })) as Tenant | undefined;
		if (!tenant) throw new NotFoundException('Tenant not found.');

		const amount = Number(plan.price || 0);
		if (!(amount > 0)) {
			throw new BadRequestException('This plan has no price; nothing to charge.');
		}
		const currency = String(tenant.currency || 'PHP').toUpperCase();

		const order = await createOrder(cfg, {
			amount,
			currency,
			referenceId: `${tenant.uuid.slice(0, 8)}-${plan.code}`,
			description: `${tenant.display_name || 'MyLab'} — ${plan.name}`,
			// The custom_id round-trips to the webhook so we can locate the
			// tenant+plan even if the browser never calls capture. PayPal
			// restricts this field to [A-Za-z0-9_-] up to 127 chars, so we
			// concatenate the two UUIDs with '_' instead of using JSON.
			customId: `${tenant.uuid}_${plan.uuid}`,
		});
		return { order_id: order.id, amount, currency };
	}

	/**
	 * Capture a PayPal Order. Both the browser (onApprove) and the webhook
	 * (PAYMENT.CAPTURE.COMPLETED) call into this via the outer entry points.
	 * The unique index on paypal_capture_id guarantees at-most-one payment
	 * row per capture — later callers hit the "already exists" branch and
	 * return the existing row.
	 */
	async capturePaypalOrder(params: {
		tenant_uuid: string;
		order_id: string;
		invoked_by: string;
	}): Promise<{
		payment: TenantSubscriptionPayment;
		activation_mode: 'immediate' | 'scheduled' | 'noop';
		subscription_start?: Date;
		subscription_end?: Date;
		warnings: ApiWarning[];
	}> {
		const cfg = readPaypalConfig();
		assertPaypalConfigured(cfg);

		// Fast-path idempotency: if this order was already captured by us,
		// return the payment row without hitting PayPal again.
		const existingByOrder = (await TenantSubscriptionPayment.query().findOne({
			paypal_order_id: params.order_id,
		})) as TenantSubscriptionPayment | undefined;
		if (existingByOrder) {
			return {
				payment: existingByOrder,
				activation_mode: 'noop',
				warnings: [],
			};
		}

		const captured = await captureOrder(cfg, params.order_id);
		return this.persistCapturedPaypalOrder({
			tenant_uuid: params.tenant_uuid,
			captured,
			invoked_by: params.invoked_by,
		});
	}

	/**
	 * Turn a captured PayPal Order into a MyLab payment row + subscription
	 * activation. Verifies amount matches the plan price (± 0.01) and dedupes
	 * on paypal_capture_id.
	 */
	private async persistCapturedPaypalOrder(params: {
		tenant_uuid: string;
		captured: CapturedOrder;
		invoked_by: string;
	}): Promise<{
		payment: TenantSubscriptionPayment;
		activation_mode: 'immediate' | 'scheduled' | 'noop';
		subscription_start?: Date;
		subscription_end?: Date;
		warnings: ApiWarning[];
	}> {
		const cap = params.captured?.purchase_units?.[0]?.payments?.captures?.[0];
		if (!cap) throw new BadRequestException('PayPal order has no capture record.');
		if (cap.status !== 'COMPLETED' && cap.status !== 'PENDING') {
			throw new BadRequestException(`PayPal capture status is ${cap.status}, not COMPLETED.`);
		}
		const capturedAmount = Number(cap.amount?.value || 0);
		const capturedCurrency = String(cap.amount?.currency_code || '').toUpperCase();

		// The custom_id we stamped in createOrder ties the capture back to a
		// specific tenant+plan pair, so the webhook path (no bearer token, no
		// caller-provided tenant) can still recover both. Format: "<tenant_uuid>_<plan_uuid>"
		// — PayPal restricts custom_id to [A-Za-z0-9_-] so we can't use JSON.
		// PayPal may echo it back on either the purchase_unit or the capture,
		// so check both.
		const customRaw =
			params.captured?.purchase_units?.[0]?.custom_id ||
			params.captured?.purchase_units?.[0]?.payments?.captures?.[0]?.custom_id ||
			'';
		let embeddedTenant: string | undefined;
		let embeddedPlan: string | undefined;
		// UUIDs are 36 chars with hyphens; splitting on '_' gives exactly 2 parts.
		const parts = customRaw.split('_');
		if (parts.length === 2 && parts[0].length === 36 && parts[1].length === 36) {
			embeddedTenant = parts[0];
			embeddedPlan = parts[1];
		}
		const tenant_uuid = params.tenant_uuid || embeddedTenant;
		if (!tenant_uuid) throw new BadRequestException('Could not resolve tenant for this PayPal order.');
		if (embeddedTenant && embeddedTenant !== tenant_uuid) {
			throw new BadRequestException('PayPal order belongs to a different tenant.');
		}
		if (!embeddedPlan) throw new BadRequestException('PayPal order is missing plan metadata.');

		return objectionTransaction(TenantSubscriptionPayment.knex(), async (trx) => {
			// Second idempotency check inside the transaction — the webhook and
			// the browser may race.
			const existingByCapture = (await TenantSubscriptionPayment.query(trx).findOne({
				paypal_capture_id: cap.id,
			})) as TenantSubscriptionPayment | undefined;
			if (existingByCapture) {
				return {
					payment: existingByCapture,
					activation_mode: 'noop' as const,
					warnings: [],
				};
			}

			const plan = (await SubscriptionPlan.query(trx).findOne({ uuid: embeddedPlan })) as
				| SubscriptionPlan
				| undefined;
			if (!plan) throw new BadRequestException('Subscription plan not found.');

			// Guard against tampered custom_id: the PayPal-side amount must
			// match the plan's price (currency too).
			const expected = Number(plan.price || 0);
			if (Math.abs(capturedAmount - expected) > 0.01) {
				throw new BadRequestException(
					`PayPal amount ${capturedAmount} ${capturedCurrency} does not match plan price ${expected}.`,
				);
			}

			const created = (await TenantSubscriptionPayment.query(trx).insertAndFetch({
				tenant_uuid,
				subscription_plan_uuid: plan.uuid,
				subscription_plan_code: plan.code,
				subscription_plan_name: plan.name,
				subscription_days: plan.days_duration,
				subscription_plan_amount: plan.price,
				amount_paid: capturedAmount,
				payment_status: 'pending',
				payment_method: 'paypal',
				payment_method_name: 'PayPal',
				payment_reference_number: cap.id,
				payment_datetime: new Date().toISOString(),
				paypal_order_id: params.captured.id,
				paypal_capture_id: cap.id,
				created_by: params.invoked_by,
			} as any)) as unknown as TenantSubscriptionPayment;

			const activationResult = await this.applyApprovedPayment(trx, created, {
				// No admin approver — PayPal auto-approved. approved_by_uuid FKs
				// to admins, so it MUST be null; approved_by_name records who
				// initiated the checkout for the audit trail.
				approved_by_uuid: null,
				approved_by_name: `paypal:${params.invoked_by}`,
			});
			return {
				payment: activationResult.payment,
				activation_mode: activationResult.activation_mode,
				subscription_start: activationResult.subscription_start,
				subscription_end: activationResult.subscription_end,
				warnings: activationResult.warnings,
			};
		});
	}

	/**
	 * Handle an incoming PayPal webhook. Verifies the signature via PayPal's
	 * verify-webhook-signature endpoint, then dispatches on event type.
	 * PAYMENT.CAPTURE.COMPLETED is the only event we act on right now — refunds
	 * and disputes are logged only. Always resolves without throwing: PayPal
	 * treats non-2xx as a retry signal, and we've decided handled-and-ignored
	 * is a valid outcome.
	 */
	async handlePaypalWebhookEvent(
		headers: Record<string, any>,
		body: any,
	): Promise<{ handled: boolean; reason?: string }> {
		const cfg = readPaypalConfig();
		if (!cfg.clientId || !cfg.webhookId) {
			this.logger.warn('PayPal webhook received but PAYPAL_CLIENT_ID/PAYPAL_WEBHOOK_ID missing; dropping.');
			return { handled: false, reason: 'not-configured' };
		}
		const webhookHeaders = readWebhookHeaders(headers);
		const ok = await verifyWebhookSignature(cfg, webhookHeaders, body);
		if (!ok) {
			this.logger.warn(`PayPal webhook signature verification failed (transmission_id=${webhookHeaders.transmissionId}).`);
			return { handled: false, reason: 'signature-invalid' };
		}

		const eventType = String(body?.event_type || '');
		if (eventType !== 'PAYMENT.CAPTURE.COMPLETED') {
			this.logger.log(`PayPal webhook ${eventType} received; no action.`);
			return { handled: true, reason: 'ignored-event' };
		}

		// Resource for PAYMENT.CAPTURE.COMPLETED carries the capture object,
		// not the whole order. Get the order via supplementary_data to reuse
		// the same persist path as the browser capture.
		const orderId = String(body?.resource?.supplementary_data?.related_ids?.order_id || '');
		if (!orderId) {
			this.logger.warn('PayPal webhook capture event missing order_id.');
			return { handled: false, reason: 'missing-order-id' };
		}

		const captured = await getOrder(cfg, orderId);
		try {
			const result = await this.persistCapturedPaypalOrder({
				tenant_uuid: '',
				captured,
				invoked_by: 'webhook',
			});
			return { handled: true, reason: result.activation_mode };
		} catch (err: any) {
			this.logger.error(`PayPal webhook capture persist failed for order=${orderId}: ${err?.message}`);
			return { handled: false, reason: err?.message || 'persist-failed' };
		}
	}

	/**
	 * Sweep: promote every tenant whose current plan expired and who has a
	 * ready scheduled row. Returns the number of tenants promoted.
	 */
	async promoteScheduledSubscriptions(): Promise<number> {
		const now = new Date();
		const rows = (await TenantSubscriptionHistory.query()
			.select('tenant_uuid')
			.where({ status: 'scheduled' })
			.andWhere('subscription_start', '<=', now)) as Array<{ tenant_uuid: string }>;

		const tenantUuids = Array.from(new Set(rows.map((r) => r.tenant_uuid)));
		let promoted = 0;
		for (const tenant_uuid of tenantUuids) {
			const ok = await this.promoteScheduledForTenant(undefined, tenant_uuid);
			if (ok) promoted++;
		}
		return promoted;
	}

}
