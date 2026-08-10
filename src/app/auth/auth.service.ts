import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { MailerService } from '@/common/mailer/mailer.service';
import { formatReadableDateTime } from '@/common/helpers/timezone.helper';
import { Admin } from '../admin/admin.model';
import { User } from '../user/user.model';
import { UserPasswordReset } from '../user/user-password-reset.model';
import { Tenant } from '../tenant/tenant.model';
import { TenantSubscriptionPaymentService } from '../tenant-subscription-payment/tenant-subscription-payment.service';

// Reset link lives for 1 hour. Short window keeps a leaked link low-value
// while still giving the user room to open the email, click it, and choose
// a new password without racing a spinner.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export interface AdminLoginValidation {
	isAllowLogin: boolean;
	message: string;
	admin?: Admin;
}

export interface UserLoginValidation {
	isAllowLogin: boolean;
	message: string;
	user?: User;
	tenant?: Tenant;
}

@Injectable()
export class AuthService {
	private readonly logger = new Logger(AuthService.name);

	constructor(
		private readonly jwtService: JwtService,
		private readonly subscriptionPaymentService: TenantSubscriptionPaymentService,
		private readonly mailer: MailerService,
		private readonly config: ConfigService,
	) {}

	async hashPassword(plain: string): Promise<{ passphrase: string; keycode: string }> {
		const keycode = await bcrypt.genSalt(10);
		const passphrase = await bcrypt.hash(plain, keycode);
		return { passphrase, keycode };
	}

	async validatePassword(plain: string, hash: string): Promise<boolean> {
		return bcrypt.compare(plain, hash);
	}

	signAdminToken(admin: Admin): { access_token: string } {
		return {
			access_token: this.jwtService.sign({
				uuid: admin.uuid,
				username: admin.username,
				name: admin.name,
				role: admin.role,
				type: 'admin',
			}),
		};
	}

	signUserToken(user: User): { access_token: string } {
		return {
			access_token: this.jwtService.sign({
				uuid: user.uuid,
				username: user.username,
				name: user.name,
				role: user.role,
				tenant_uuid: user.tenant_uuid,
				type: 'user',
			}),
		};
	}

	async validateAdminLogin(username: string, password: string): Promise<AdminLoginValidation> {
		const admin = (await Admin.query().findOne({ username })) as Admin | undefined;
		if (!admin) return { isAllowLogin: false, message: 'Invalid username or password.' };

		if ((admin.status || '').toLowerCase() !== 'active') {
			return { isAllowLogin: false, message: `Your account is ${admin.status}.` };
		}

		const ok = await this.validatePassword(password, admin.passphrase);
		if (!ok) return { isAllowLogin: false, message: 'Invalid username or password.' };

		return { isAllowLogin: true, message: 'Login successful.', admin };
	}

	/**
	 * Verify a user's credentials without issuing a new token — for
	 * "manager override" flows where a cashier needs a supervisor to
	 * approve a sensitive action (void, discount override, etc.).
	 *
	 * Contract:
	 *   - user must exist, be active, and belong to `expected_tenant_uuid`
	 *   - user's role must be one of `admin` | `manager`
	 *   - password must match
	 *
	 * Never differentiates "wrong user" from "wrong password" from
	 * "not a manager" in the error message — an attacker shouldn't be
	 * able to enumerate accounts or role assignments via this endpoint.
	 */
	async validateManagerOverride(
		username: string,
		password: string,
		expected_tenant_uuid: string,
	): Promise<{ ok: boolean; message: string; user?: User }> {
		const genericFail = { ok: false, message: 'Invalid credentials or insufficient role.' };
		const user = (await User.query().findOne({ username })) as User | undefined;
		if (!user) return genericFail;
		if (user.tenant_uuid !== expected_tenant_uuid) return genericFail;
		if ((user.status || '').toLowerCase() !== 'active') return genericFail;
		const role = String(user.role || '').toLowerCase();
		if (role !== 'admin' && role !== 'manager') return genericFail;
		const ok = await this.validatePassword(password, user.passphrase);
		if (!ok) return genericFail;
		return { ok: true, message: 'Verified.', user };
	}

	async validateUserLogin(username: string, password: string): Promise<UserLoginValidation> {
		const user = (await User.query().findOne({ username })) as User | undefined;
		if (!user) return { isAllowLogin: false, message: 'Invalid username or password.' };

		// Lazy-promote any due scheduled subscription so tenant.current_* is fresh.
		await this.subscriptionPaymentService.promoteScheduledForTenant(undefined, user.tenant_uuid);

		const tenant = (await Tenant.query().findOne({ uuid: user.tenant_uuid })) as Tenant | undefined;
		if (!tenant) return { isAllowLogin: false, message: 'Tenant not found for user.' };
		if ((tenant.status || '').toLowerCase() !== 'active') {
			return { isAllowLogin: false, message: `Tenant is ${tenant.status}.`, tenant };
		}

		if ((user.status || '').toLowerCase() !== 'active') {
			return { isAllowLogin: false, message: `Your account is ${user.status}.`, tenant };
		}

		const ok = await this.validatePassword(password, user.passphrase);
		if (!ok) return { isAllowLogin: false, message: 'Invalid username or password.', tenant };

		return { isAllowLogin: true, message: 'Login successful.', user, tenant };
	}

	// ─── Forgot password ─────────────────────────────────────────────────
	// Every branch of requestPasswordReset() returns success. That prevents
	// an attacker from probing the endpoint to enumerate valid usernames or
	// discover which accounts have an email on file. Silent failures still
	// get logged server-side so an admin can investigate.

	async requestPasswordReset(
		username: string,
		ip: string | null,
		userAgent: string | null,
	): Promise<void> {
		const trimmed = String(username || '').trim();
		if (!trimmed) return;

		const user = (await User.query().findOne({ username: trimmed })) as User | undefined;
		if (!user) {
			this.logger.log(`Password reset requested for unknown username '${trimmed}' — silently ignored.`);
			return;
		}
		if ((user.status || '').toLowerCase() !== 'active') {
			this.logger.log(`Password reset requested for inactive user '${trimmed}' — silently ignored.`);
			return;
		}
		if (!user.email) {
			this.logger.log(`Password reset requested for '${trimmed}' but no email on file — silently ignored.`);
			return;
		}

		const rawToken = crypto.randomBytes(32).toString('hex');
		const expires_at = new Date(Date.now() + RESET_TOKEN_TTL_MS);

		// Invalidate any prior, still-live reset tokens for this user by
		// stamping used_at=now. Only the most recent link should ever work,
		// otherwise a leaked-then-superseded token stays usable for its
		// full TTL and confuses the "if you didn't request this" flow.
		await UserPasswordReset.query()
			.patch({ used_at: new Date() } as any)
			.where({ user_uuid: user.uuid })
			.whereNull('used_at')
			.where('expires_at', '>', new Date());

		await UserPasswordReset.query().insert({
			user_uuid: user.uuid,
			token: rawToken,
			expires_at,
			requested_ip: ip,
			requested_user_agent: userAgent ? userAgent.slice(0, 500) : null,
		} as any);

		await this.sendPasswordResetEmail(user, rawToken, expires_at);
	}

	async verifyPasswordResetToken(token: string): Promise<{ ok: true; username: string; expires_at: Date }> {
		const row = (await UserPasswordReset.query().findOne({ token })) as UserPasswordReset | undefined;
		if (!row) throw new NotFoundException('Reset link is invalid.');
		if (row.used_at) throw new BadRequestException('This reset link has already been used. Request a new one.');
		if (new Date(row.expires_at) < new Date()) {
			throw new BadRequestException('This reset link has expired. Request a new one.');
		}

		const user = (await User.query().findOne({ uuid: row.user_uuid })) as User | undefined;
		if (!user) throw new NotFoundException('Reset link is invalid.');
		if ((user.status || '').toLowerCase() !== 'active') {
			throw new BadRequestException('This account is not active. Contact your admin.');
		}
		return { ok: true, username: user.username, expires_at: new Date(row.expires_at) };
	}

	async consumePasswordResetToken(
		token: string,
		newPassword: string,
	): Promise<{ ok: true; username: string }> {
		const verified = await this.verifyPasswordResetToken(token);
		const row = (await UserPasswordReset.query().findOne({ token })) as UserPasswordReset;

		const { passphrase, keycode } = await this.hashPassword(newPassword);
		const now = new Date();

		await User.query()
			.patch({ passphrase, keycode, last_change_password: now } as any)
			.where({ uuid: row.user_uuid });
		await UserPasswordReset.query()
			.patch({ used_at: now } as any)
			.where({ uuid: row.uuid });

		return { ok: true, username: verified.username };
	}

	private appUrl(): string {
		return String(this.config.get<string>('APP_URL') || 'http://localhost:5173').replace(/\/$/, '');
	}

	private async sendPasswordResetEmail(user: User, token: string, expires_at: Date): Promise<void> {
		if (!user.email) return; // Guarded upstream but keep the check for safety.
		await this.mailer.sendTemplate(user.email, 'password-reset', {
			name: user.name,
			username: user.username,
			reset_url: `${this.appUrl()}/reset-password?token=${token}`,
			expires_at: formatReadableDateTime(expires_at),
		});
	}
}
