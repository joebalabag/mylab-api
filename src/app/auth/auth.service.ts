import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { Admin } from '../admin/admin.model';
import { User } from '../user/user.model';
import { Tenant } from '../tenant/tenant.model';
import { TenantSubscriptionPaymentService } from '../tenant-subscription-payment/tenant-subscription-payment.service';

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
	constructor(
		private readonly jwtService: JwtService,
		private readonly subscriptionPaymentService: TenantSubscriptionPaymentService,
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
}
