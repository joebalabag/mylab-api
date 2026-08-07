import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { transaction as objectionTransaction } from 'objection';

import { MailerService } from '@/common/mailer/mailer.service';
import { AccessTemplate } from '../access-template/access-template.model';
import { SubscriptionPlan } from '../subscription-plan/subscription-plan.model';
import { Tenant } from '../tenant/tenant.model';
import { seedStandardCatalogForTenant } from '@/common/seed/standard-catalog';
import { TenantSubscriptionHistory } from '../tenant-subscription-payment/tenant-subscription-history.model';
import { User } from '../user/user.model';
import { UserAccess } from '../user-access/user-access.model';
import { PendingTenantRegistration } from './pending-tenant-registration.model';
import { RegisterTenantDTO } from './dto/tenant-registration.dto';
import { normalizeTimezone } from '@/common/helpers/timezone.helper';

const TOKEN_TTL_HOURS = 24;
// Legacy fallback for pending rows created before the plan-picker feature.
// New pending rows carry `subscription_plan_uuid` and don't touch this code.
const LEGACY_TRIAL_PLAN_CODE = 'TRIAL';

@Injectable()
export class TenantRegistrationService {
	private readonly logger = new Logger(TenantRegistrationService.name);

	constructor(
		private readonly mailer: MailerService,
		private readonly config: ConfigService,
	) {}

	async register(payload: RegisterTenantDTO): Promise<{ contact_email: string; expires_at: Date }> {
		const now = new Date();

		// One tenant registration per contact email.
		if (await User.query().findOne({ email: payload.contact_email })) {
			throw new BadRequestException('An account with this email already exists.');
		}

		// Block if a NON-expired pending registration is already using this email.
		const pendingClash = (await PendingTenantRegistration.query()
			.where('expires_at', '>', now)
			.andWhere('email_address', payload.contact_email)
			.first()) as PendingTenantRegistration | undefined;
		if (pendingClash) {
			throw new BadRequestException(
				'A pending registration already exists for this email. Check your inbox or request a new verification email.',
			);
		}

		// Validate the chosen trial plan up-front so the user gets a fast, clear
		// error at register time rather than at verify time (24 hours later).
		const chosenPlan = (await SubscriptionPlan.query().findOne({
			uuid: payload.subscription_plan_uuid,
		})) as SubscriptionPlan | undefined;
		if (!chosenPlan || chosenPlan.status !== 'active' || !chosenPlan.is_trial) {
			throw new BadRequestException(
				'The selected trial plan is not available. Refresh the page and pick another.',
			);
		}

		const rawToken = crypto.randomBytes(32).toString('hex');
		const expires_at = new Date(now.getTime() + TOKEN_TTL_HOURS * 3_600_000);

		await PendingTenantRegistration.query().insert({
			token: rawToken,
			expires_at,
			display_name: payload.store_name,
			email_address: payload.contact_email,
			contact_number: payload.contact_number,
			city: payload.city,
			province: payload.province,
			country: payload.country,
			name: payload.owner_name,
			// Client-supplied hint. Store as-is; the tenant insert on verify
			// runs it through normalizeTimezone so a stale/typo'd zone can't
			// poison the row.
			timezone: payload.timezone ?? null,
			subscription_plan_uuid: chosenPlan.uuid,
		} as any);

		await this.sendVerificationEmail(payload.contact_email, payload.owner_name, rawToken, expires_at);

		return { contact_email: payload.contact_email, expires_at };
	}

	async verify(
		token: string,
	): Promise<{ tenant_uuid: string; user_uuid: string; username: string }> {
		const pending = (await PendingTenantRegistration.query().findOne({ token })) as
			| PendingTenantRegistration
			| undefined;
		if (!pending) throw new NotFoundException('Verification token not found or already used.');
		if (new Date(pending.expires_at) < new Date()) {
			throw new BadRequestException('This verification link has expired. Request a new one.');
		}

		// Re-check email uniqueness between register and verify.
		if (await User.query().findOne({ email: pending.email_address })) {
			throw new BadRequestException('An account with this email was created while you were verifying. Please contact support.');
		}

		const plaintextPassword = generateInitialPassword();
		const salt = await bcrypt.genSalt(10);
		const hash = await bcrypt.hash(plaintextPassword, salt);

		// Prefer the plan the user picked at register time. Fall back to any
		// active is_trial plan for legacy pending rows that predate this feature;
		// last-resort fall back to the historical code='TRIAL' row so a very old
		// pending link still activates something reasonable. If none of the
		// above resolves, the register step already blocks new signups (via
		// register()'s plan validation) — this error surfaces only for
		// stale-link + no-trial-plan scenarios.
		let plan: SubscriptionPlan | undefined;
		if (pending.subscription_plan_uuid) {
			plan = (await SubscriptionPlan.query().findOne({ uuid: pending.subscription_plan_uuid })) as
				| SubscriptionPlan
				| undefined;
		}
		if (!plan || plan.status !== 'active' || !plan.is_trial) {
			plan = (await SubscriptionPlan.query()
				.where({ is_trial: true, status: 'active' })
				.orderBy('price', 'asc')
				.first()) as SubscriptionPlan | undefined;
		}
		if (!plan) {
			plan = (await SubscriptionPlan.query().findOne({ code: LEGACY_TRIAL_PLAN_CODE })) as
				| SubscriptionPlan
				| undefined;
		}
		if (!plan) {
			throw new BadRequestException(
				'No trial plan is available right now. Contact support so an admin can enable one.',
			);
		}

		const templates = (await AccessTemplate.query()) as unknown as AccessTemplate[];

		const { tenant, user } = await objectionTransaction(PendingTenantRegistration.knex(), async (trx) => {
			const now = new Date();
			const end = new Date(now);
			end.setDate(end.getDate() + Number(plan.days_duration));
			const warning_days = Number(plan.days_warning_for_near_expiry ?? 7);

			const store_code = await this.generateUniqueStoreCode(trx);
			const username = `admin.${store_code}`;

			// Paranoia: make sure no orphaned user already holds this derived
			// username. Highly unlikely because store_code is unique on tenants,
			// but usernames are global-unique too.
			if (await User.query(trx).findOne({ username })) {
				throw new BadRequestException(
					'Generated username collision. Retry the verification.',
				);
			}

			const tenant = (await Tenant.query(trx).insertAndFetch({
				display_name: pending.display_name,
				owner_name: pending.name,
				store_code,
				currency: 'PHP',
				timezone: normalizeTimezone(pending.timezone),
				city: pending.city ?? null,
				province: pending.province ?? null,
				country: pending.country ?? 'Philippines',
				email_address: pending.email_address,
				contact_number: pending.contact_number ?? null,
				is_vat_registered: false,
				show_tin_on_receipt: true,
				receipt_show_logo: true,
				status: 'active',
				current_subscription_plan_uuid: plan.uuid,
				current_subscription_days: plan.days_duration,
				current_subscription_start: now,
				current_subscription_expiry: end,
				current_subscription_expiry_warning_days: warning_days,
				current_subscription_plan_amount: plan.price,
				created_by: 'self-registration',
			} as any)) as unknown as Tenant;

			const user = (await User.query(trx).insertAndFetch({
				tenant_uuid: tenant.uuid,
				username,
				passphrase: hash,
				keycode: salt,
				name: pending.name,
				email: pending.email_address,
				role: 'admin',
				status: 'active',
				created_by: 'self-registration',
			} as any)) as unknown as User;

			await TenantSubscriptionHistory.query(trx).insert({
				tenant_uuid: tenant.uuid,
				subscription_plan_uuid: plan.uuid,
				subscription_plan_code: plan.code,
				subscription_plan_name: plan.name,
				subscription_start: now,
				subscription_end: end,
				subscription_days: plan.days_duration,
				expiry_warning_days: warning_days,
				subscription_plan_amount: plan.price,
				status: 'active',
				created_by: 'self-registration',
			} as any);

			if (templates.length) {
				await UserAccess.query(trx).insert(
					templates.map((t) => ({
						tenant_uuid: tenant.uuid,
						user_uuid: user.uuid,
						navigation_id: t.navigation_id,
						catalog_id: t.catalog_id,
						catalog: t.catalog,
						main_navigation: t.main_navigation,
						sub_navigation: t.sub_navigation,
						remarks: t.remarks ?? null,
						has_access: true,
						created_by: 'self-registration',
					})) as any,
				);
			}

			// Pre-seed the standard laboratory catalog (groups + categories +
			// test items) so a fresh tenant starts with the Hinigaran-style
			// panels wired up. Idempotent + inside the same transaction.
			try {
				await seedStandardCatalogForTenant(trx, tenant.uuid, 'auto-seed');
			} catch (e: any) {
				this.logger.warn(`Standard catalog auto-seed failed for tenant ${tenant.uuid}: ${e?.message}`);
			}

			// Purge the pending row now that everything's in place.
			await PendingTenantRegistration.query(trx).delete().where({ uuid: pending.uuid });

			return { tenant, user };
		});

		await this.sendWelcomeEmail(
			user.email || pending.email_address,
			user.name,
			user.username,
			plaintextPassword,
			tenant,
		);

		return { tenant_uuid: tenant.uuid, user_uuid: user.uuid, username: user.username };
	}

	async resendVerification(contact_email: string): Promise<{ ok: true }> {
		// If none pending, return ok so we don't leak whether an account exists.
		const now = new Date();
		const pending = (await PendingTenantRegistration.query()
			.where({ email_address: contact_email })
			.andWhere('expires_at', '>', now)
			.first()) as PendingTenantRegistration | undefined;
		if (!pending) return { ok: true };

		const rawToken = crypto.randomBytes(32).toString('hex');
		const expires_at = new Date(now.getTime() + TOKEN_TTL_HOURS * 3_600_000);

		await PendingTenantRegistration.query()
			.patch({ token: rawToken, expires_at } as any)
			.where({ uuid: pending.uuid });

		await this.sendVerificationEmail(contact_email, pending.name, rawToken, expires_at);
		return { ok: true };
	}

	/**
	 * Generate a 6-character uppercase alphanumeric store code, unique in the
	 * tenants table. Avoids visually confusing chars (0, O, 1, I, L).
	 */
	private async generateUniqueStoreCode(trx: any): Promise<string> {
		const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 chars
		for (let attempt = 0; attempt < 20; attempt++) {
			const bytes = crypto.randomBytes(6);
			let code = '';
			for (let i = 0; i < 6; i++) code += alphabet[bytes[i] % alphabet.length];
			const taken = await Tenant.query(trx).findOne({ store_code: code });
			if (!taken) return code;
		}
		throw new BadRequestException('Could not allocate a unique store code. Try again.');
	}

	private appUrl(): string {
		return String(this.config.get<string>('APP_URL') || 'http://localhost:5173').replace(/\/$/, '');
	}

	private async sendVerificationEmail(
		to: string,
		name: string,
		token: string,
		expires_at: Date,
	): Promise<void> {
		await this.mailer.sendTemplate(to, 'verification', {
			name,
			verify_url: `${this.appUrl()}/verify?token=${token}`,
			expires_at: expires_at.toISOString(),
		});
	}

	private async sendWelcomeEmail(
		to: string,
		name: string,
		username: string,
		password: string,
		tenant: Tenant,
	): Promise<void> {
		await this.mailer.sendTemplate(to, 'welcome', {
			name,
			store_name: tenant.display_name,
			store_code: tenant.store_code,
			username,
			password,
			trial_expiry: tenant.current_subscription_expiry
				? new Date(tenant.current_subscription_expiry).toISOString()
				: null,
			login_url: `${this.appUrl()}/login`,
		});
	}
}

/**
 * Generate a 12-char initial password: 8 random URL-safe chars + a suffix
 * that guarantees the mix (upper, lower, digit, symbol) so users don't hit
 * the app's future password-policy checks on their very first login.
 */
function generateInitialPassword(): string {
	const random = crypto.randomBytes(12).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
	return `${random}A9!`;
}
