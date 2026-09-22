import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { transaction as objectionTransaction } from 'objection';
import { Tenant } from './tenant.model';
import { SubscriptionPlan } from '../subscription-plan/subscription-plan.model';
import { TenantSubscriptionHistory } from '../tenant-subscription-payment/tenant-subscription-history.model';
import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';
import { normalizeTimezone } from '@/common/helpers/timezone.helper';
import { MailerService } from '@/common/mailer/mailer.service';
import { decryptSecret } from '@/common/crypto/aes.util';

@Injectable()
export class TenantService {
	constructor(private readonly mailer: MailerService) {}
	async listDashboard(filters: DashboardQueryDTO): Promise<PagedResult<Tenant>> {
		const query = Tenant.query().orderBy('created_at', 'desc');

		if (filters.date_from) query.where('created_at', '>=', filters.date_from);
		if (filters.date_to) query.where('created_at', '<=', `${filters.date_to} 23:59:59`);

		if (filters.status && filters.status.length) {
			query.whereIn('status', filters.status);
		}

		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			query.where((qb) => {
				qb.where('display_name', 'ilike', kw)
					.orWhere('legal_name', 'ilike', kw)
					.orWhere('owner_name', 'ilike', kw)
					.orWhere('store_code', 'ilike', kw)
					.orWhere('branch', 'ilike', kw)
					.orWhere('city', 'ilike', kw)
					.orWhere('province', 'ilike', kw)
					.orWhere('email_address', 'ilike', kw);
			});
		}

		const page = await applyPagination<Tenant>(query as any, filters.page_number, filters.page_size);

		// Attach a lightweight snapshot of any scheduled subscription so the
		// super-admin table can badge tenants who've already queued their next
		// renewal. Single extra query keyed on the page's tenant uuids — no
		// N+1. When no rows are on the current page (empty search), skip it.
		const tenantUuids = (page.results || []).map((r: any) => r.uuid).filter(Boolean);
		if (tenantUuids.length) {
			const scheduled = (await TenantSubscriptionHistory.query()
				.whereIn('tenant_uuid', tenantUuids)
				.andWhere('status', 'scheduled')) as unknown as Array<{
				tenant_uuid: string;
				subscription_plan_uuid?: string | null;
				subscription_plan_code: string;
				subscription_plan_name: string;
				subscription_start: Date;
				subscription_end: Date;
				subscription_days: number;
				subscription_plan_amount: number;
			}>;
			const bySchedTenant = new Map<string, (typeof scheduled)[number]>();
			for (const row of scheduled) {
				// If a tenant somehow has multiple scheduled rows, keep the earliest.
				const prev = bySchedTenant.get(row.tenant_uuid);
				if (!prev || new Date(row.subscription_start) < new Date(prev.subscription_start)) {
					bySchedTenant.set(row.tenant_uuid, row);
				}
			}
			for (const t of page.results as any[]) {
				const s = bySchedTenant.get(t.uuid);
				t.next_subscription = s
					? {
							subscription_plan_uuid:  s.subscription_plan_uuid ?? null,
							subscription_plan_code:  s.subscription_plan_code,
							subscription_plan_name:  s.subscription_plan_name,
							subscription_start:      s.subscription_start,
							subscription_end:        s.subscription_end,
							subscription_days:       s.subscription_days,
							subscription_plan_amount: s.subscription_plan_amount,
						}
					: null;
			}
		}
		return page;
	}

	async findByUuid(uuid: string): Promise<Tenant | undefined> {
		return Tenant.query().findOne({ uuid }) as unknown as Tenant | undefined;
	}

	async storeCodeTaken(store_code: string, terminal_id?: string, excludeUuid?: string): Promise<boolean> {
		const q = Tenant.query().where({ store_code });
		if (terminal_id) q.andWhere({ terminal_id });
		else q.andWhere((qb) => qb.whereNull('terminal_id'));
		if (excludeUuid) q.andWhereNot('uuid', excludeUuid);
		const row = await q.first();
		return !!row;
	}

	async create(data: Partial<Tenant> & { created_by: string }): Promise<Tenant> {
		const payload: any = {
			currency: 'PHP',
			country: 'Philippines',
			is_vat_registered: false,
			show_tin_on_receipt: true,
			receipt_show_logo: true,
			status: 'active',
			...data,
		};
		payload.timezone = normalizeTimezone(payload.timezone);
		return Tenant.query().insertAndFetch(payload) as unknown as Tenant;
	}

	async update(uuid: string, data: Partial<Tenant> & { updated_by: string }): Promise<Tenant | undefined> {
		const payload: any = { ...data };
		// Only touch timezone when the caller sent one; invalid input silently
		// falls back to the platform default so we never persist garbage.
		if (payload.timezone !== undefined) payload.timezone = normalizeTimezone(payload.timezone);
		return Tenant.query().patchAndFetchById(uuid, payload) as unknown as Tenant | undefined;
	}

	async delete(uuid: string): Promise<{ count: number; removedLogo?: string }> {
		const existing = await this.findByUuid(uuid);
		const count = await Tenant.query().delete().where({ uuid });
		let removedLogo: string | undefined;
		if (existing?.company_logo) {
			this.removeLogoFile(existing.company_logo);
			removedLogo = existing.company_logo;
		}
		return { count, removedLogo };
	}

	async setStatus(uuid: string, status: 'active' | 'inactive', updated_by: string): Promise<Tenant | undefined> {
		return this.update(uuid, { status, updated_by } as any);
	}

	/**
	 * Super-admin override of the tenant's current subscription state. Any of
	 * the value fields may be omitted (falls back to current). Writes a new
	 * tenant_subscription_history row tagged with `alter_reason`, expires the
	 * previously-active history row, and patches tenants.current_*.
	 * Runs in a single transaction.
	 */
	async alterSubscription(
		uuid: string,
		payload: {
			alter_reason: string;
			current_subscription_plan_uuid?: string;
			current_subscription_days?: number;
			current_subscription_expiry?: string;
			current_subscription_plan_amount?: number;
		},
		altered_by: string,
	): Promise<Tenant> {
		return objectionTransaction(Tenant.knex(), async (trx) => {
			const tenant = (await Tenant.query(trx).findOne({ uuid })) as Tenant | undefined;
			if (!tenant) throw new NotFoundException('Tenant not found.');

			const nextPlanUuid =
				payload.current_subscription_plan_uuid ?? tenant.current_subscription_plan_uuid ?? null;
			// Start date is not editable via this API. Keep the tenant's existing
			// value, or default to today if none has ever been set.
			const nextStart = tenant.current_subscription_start
				? new Date(tenant.current_subscription_start)
				: new Date();
			const nextDays =
				payload.current_subscription_days != null
					? Number(payload.current_subscription_days)
					: tenant.current_subscription_days != null
					? Number(tenant.current_subscription_days)
					: null;
			const nextExpiry = payload.current_subscription_expiry
				? new Date(payload.current_subscription_expiry)
				: tenant.current_subscription_expiry
				? new Date(tenant.current_subscription_expiry)
				: null;
			const nextAmount =
				payload.current_subscription_plan_amount != null
					? Number(payload.current_subscription_plan_amount)
					: Number(tenant.current_subscription_plan_amount ?? 0);

			// Detect no-op override so we don't create an audit row for nothing.
			const planChanged =
				payload.current_subscription_plan_uuid !== undefined &&
				payload.current_subscription_plan_uuid !== (tenant.current_subscription_plan_uuid ?? undefined);
			const daysChanged =
				payload.current_subscription_days !== undefined &&
				Number(payload.current_subscription_days) !== Number(tenant.current_subscription_days ?? NaN);
			const expiryChanged =
				payload.current_subscription_expiry !== undefined &&
				new Date(payload.current_subscription_expiry).getTime() !==
					(tenant.current_subscription_expiry
						? new Date(tenant.current_subscription_expiry).getTime()
						: NaN);
			const amountChanged =
				payload.current_subscription_plan_amount !== undefined &&
				Number(payload.current_subscription_plan_amount) !== Number(tenant.current_subscription_plan_amount ?? NaN);

			if (!planChanged && !daysChanged && !expiryChanged && !amountChanged) {
				throw new BadRequestException('No fields changed; nothing to alter.');
			}

			// Snapshot plan code/name/warning-days for the history row. If the plan
			// itself is changing, adopt the new plan's warning-days too.
			let plan_code = '';
			let plan_name = '';
			let warning_days = Number(tenant.current_subscription_expiry_warning_days ?? 7);
			if (nextPlanUuid) {
				const plan = (await SubscriptionPlan.query(trx).findOne({ uuid: nextPlanUuid })) as
					| SubscriptionPlan
					| undefined;
				if (!plan) throw new BadRequestException('Subscription plan not found.');
				plan_code = plan.code;
				plan_name = plan.name;
				if (planChanged) warning_days = Number(plan.days_warning_for_near_expiry ?? warning_days);
			}

			if (!nextExpiry || nextDays == null) {
				throw new BadRequestException(
					'Tenant has no active subscription to alter. Provide days and expiry.',
				);
			}

			await TenantSubscriptionHistory.query(trx)
				.patch({ status: 'expired' } as any)
				.where({ tenant_uuid: uuid, status: 'active' });

			await TenantSubscriptionHistory.query(trx).insert({
				tenant_uuid: uuid,
				subscription_plan_uuid: nextPlanUuid,
				subscription_plan_code: plan_code,
				subscription_plan_name: plan_name,
				subscription_start: nextStart,
				subscription_end: nextExpiry,
				subscription_days: nextDays,
				expiry_warning_days: warning_days,
				subscription_plan_amount: nextAmount,
				status: 'active',
				activated_by_payment_uuid: null,
				alter_reason: payload.alter_reason,
				created_by: altered_by,
			} as any);

			const updated = (await Tenant.query(trx).patchAndFetchById(uuid, {
				current_subscription_plan_uuid: nextPlanUuid,
				current_subscription_days: nextDays,
				current_subscription_start: nextStart,
				current_subscription_expiry: nextExpiry,
				current_subscription_expiry_warning_days: warning_days,
				current_subscription_plan_amount: nextAmount,
				updated_by: altered_by,
			} as any)) as unknown as Tenant;

			return updated;
		});
	}

	/**
	 * Delete a previous logo file from disk so old uploads don't pile up.
	 * Silently ignores missing/foreign paths.
	 */
	removeLogoFile(publicPathOrUrl: string): void {
		try {
			// stored value looks like "/public/uploads/tenants/logo/2026/07/xxx.png"
			const stripped = publicPathOrUrl.replace(/^\/?public\//, '');
			if (!stripped || stripped.includes('..')) return;
			const abs = join(process.cwd(), 'public', stripped);
			if (existsSync(abs)) unlinkSync(abs);
		} catch {
			/* ignore */
		}
	}

	// Symmetric to removeLogoFile — same URL shape ("/public/uploads/…"),
	// separate method so callers stay readable at the call site.
	removeLabHeaderFile(publicPathOrUrl: string): void {
		this.removeLogoFile(publicPathOrUrl);
	}

	/**
	 * Fire a single test email against the supplied SMTP config. When
	 * `password` is empty the stored encrypted password on the tenant row
	 * is used — lets the operator retest existing settings without
	 * re-typing. Errors are converted to the SMTP driver's message so the
	 * UI can surface it (invalid credentials, connection refused, etc.).
	 */
	async testSmtp(input: {
		tenant_uuid: string;
		host: string;
		port: number;
		secure?: boolean;
		user: string;
		password?: string;
		to: string;
	}): Promise<{ sent: boolean }> {
		let password = (input.password || '').trim();
		let tenantName = '';
		{
			const row = await Tenant.query()
				.findById(input.tenant_uuid)
				.select('smtp_password_enc', 'display_name', 'legal_name');
			if (!password) {
				password = decryptSecret((row as any)?.smtp_password_enc);
				if (!password) throw new BadRequestException('SMTP password is required (no stored password to reuse).');
			}
			tenantName = (row as any)?.display_name || (row as any)?.legal_name || '';
		}
		try {
			await this.mailer.send(
				input.to,
				'MyLab · SMTP test email',
				`<p>Hi,</p>
<p>This is a test email from your MyLab tenant's Company Settings → Emailing Results panel. If you're reading this, your SMTP credentials are working.</p>
<p style="font-size:12px;color:#64748b">Sent via ${input.host}:${input.port} as ${input.user}.</p>`,
				undefined,
				{
					smtp: {
						host: input.host,
						port: Number(input.port),
						secure: !!input.secure,
						user: input.user,
						password,
					},
					// So the operator's own inbox shows the sender as
					// "Clinic Name <lab@clinic.com>" during the test —
					// same alias production lab-result emails will use.
					fromName: tenantName || undefined,
				},
			);
			return { sent: true };
		} catch (err: any) {
			throw new BadRequestException(err?.message || 'SMTP send failed.');
		}
	}
}
