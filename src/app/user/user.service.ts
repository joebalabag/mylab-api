import { Injectable } from '@nestjs/common';
import { transaction as objectionTransaction } from 'objection';
import { AuthService } from '../auth/auth.service';
import { Tenant } from '../tenant/tenant.model';
import { User } from './user.model';
import { UserPasswordHistory } from './user-password-history.model';
import { AccessTemplate } from '../access-template/access-template.model';
import { UserAccess } from '../user-access/user-access.model';
import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import { UserDashboardQueryDTO } from './dto/user-dashboard.dto';

@Injectable()
export class UserService {
	constructor(private readonly authService: AuthService) {}

	async listDashboard(filters: UserDashboardQueryDTO): Promise<PagedResult<User>> {
		const query = User.query()
			.select(
				'uuid',
				'tenant_uuid',
				'username',
				'name',
				'email',
				'role',
				'status',
				'last_logindate',
				'last_change_password',
				'created_at',
				'updated_at'
			)
			.orderBy('created_at', 'desc');

		if (filters.tenant_uuid) query.where('tenant_uuid', filters.tenant_uuid);

		if (filters.date_from) query.where('created_at', '>=', filters.date_from);
		if (filters.date_to) query.where('created_at', '<=', `${filters.date_to} 23:59:59`);

		if (filters.status && filters.status.length) {
			query.whereIn('status', filters.status);
		}

		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			query.where((qb) => {
				qb.where('username', 'ilike', kw).orWhere('name', 'ilike', kw).orWhere('email', 'ilike', kw);
			});
		}

		return applyPagination<User>(query as any, filters.page_number, filters.page_size);
	}

	async findByUuid(uuid: string, tenantScope?: string): Promise<User | undefined> {
		const q = User.query().findOne({ uuid });
		if (tenantScope) q.where('tenant_uuid', tenantScope);
		return q as unknown as User | undefined;
	}

	async tenantExists(tenant_uuid: string): Promise<boolean> {
		const row = await Tenant.query().findOne({ uuid: tenant_uuid });
		return !!row;
	}

	async usernameTaken(username: string, excludeUuid?: string): Promise<boolean> {
		const q = User.query().where({ username });
		if (excludeUuid) q.andWhereNot('uuid', excludeUuid);
		const row = await q.first();
		return !!row;
	}

	async create(data: {
		tenant_uuid: string;
		username: string;
		password: string;
		name: string;
		email?: string;
		role?: string;
		license_number?: string;
		lab_display_name?: string;
		created_by: string;
	}): Promise<User> {
		const { passphrase, keycode } = await this.authService.hashPassword(data.password);
		const knex = User.knex();
		return await objectionTransaction(knex, async (trx) => {
			const inserted = (await User.query(trx).insertAndFetch({
				tenant_uuid: data.tenant_uuid,
				username: data.username,
				passphrase,
				keycode,
				name: data.name,
				email: data.email,
				role: data.role || 'cashier',
				license_number: data.license_number ?? null,
				lab_display_name: data.lab_display_name ?? null,
				status: 'active',
				created_by: data.created_by,
			})) as unknown as User;

			// Auto-grant the entire access matrix when this is the tenant's
			// FIRST user (any provisioning path — self-registration is handled
			// separately in TenantRegistrationService, this catches super-admin
			// "create tenant + user" and any other creation route).
			// After that, subsequent users start with zero grants — the admin
			// picks perms in User Management → Assign Access.
			const others: any = await User.query(trx)
				.where({ tenant_uuid: data.tenant_uuid })
				.whereNot({ uuid: inserted.uuid })
				.count({ n: '*' })
				.first();
			const isFirstUser = Number((others as any)?.n ?? 0) === 0;
			if (isFirstUser) {
				const templates = (await AccessTemplate.query(trx)) as unknown as AccessTemplate[];
				if (templates.length) {
					await UserAccess.query(trx).insert(
						templates.map((t: any) => ({
							tenant_uuid: data.tenant_uuid,
							user_uuid: inserted.uuid,
							navigation_id: t.navigation_id,
							catalog_id: t.catalog_id,
							catalog: t.catalog,
							main_navigation: t.main_navigation,
							sub_navigation: t.sub_navigation,
							remarks: t.remarks ?? null,
							has_access: true,
							created_by: data.created_by,
						})) as any,
					);
				}
			}

			return inserted;
		});
	}

	async update(uuid: string, data: Partial<User> & { updated_by: string }): Promise<User | undefined> {
		return User.query().patchAndFetchById(uuid, data as any) as unknown as User | undefined;
	}

	async delete(uuid: string): Promise<number> {
		return User.query().delete().where({ uuid });
	}

	async setStatus(uuid: string, status: 'active' | 'inactive', updated_by: string): Promise<User | undefined> {
		return this.update(uuid, { status, updated_by } as any);
	}

	/**
	 * Supervisor-override credential check.
	 * Looks up `username` **within `tenant_uuid`** (so a cashier can't approve using
	 * a manager from another tenant, even though usernames are globally unique).
	 *
	 * Returns:
	 *   { verified: false, code: 'invalid'   } — username/password mismatch or not in tenant
	 *   { verified: false, code: 'inactive'  } — target user is not active
	 *   { verified: false, code: 'forbidden' } — target role is not admin/manager
	 *   { verified: true,  user: <safe fields> }
	 */
	async verifyCredentials(
		tenant_uuid: string,
		username: string,
		password: string,
		allowedRoles: string[] = ['admin', 'manager']
	): Promise<
		| { verified: false; code: 'invalid' | 'inactive' | 'forbidden'; message: string }
		| { verified: true; user: Pick<User, 'uuid' | 'username' | 'name' | 'role' | 'tenant_uuid'> }
	> {
		const target = (await User.query().findOne({ tenant_uuid, username })) as User | undefined;
		if (!target) return { verified: false, code: 'invalid', message: 'Invalid credentials.' };

		if ((target.status || '').toLowerCase() !== 'active') {
			return { verified: false, code: 'inactive', message: `Account is ${target.status}.` };
		}

		const ok = await this.authService.validatePassword(password, target.passphrase);
		if (!ok) return { verified: false, code: 'invalid', message: 'Invalid credentials.' };

		if (!allowedRoles.includes((target.role || '').toLowerCase())) {
			return {
				verified: false,
				code: 'forbidden',
				message: `Only ${allowedRoles.join(' or ')} can approve this action.`,
			};
		}

		return {
			verified: true,
			user: {
				uuid: target.uuid,
				username: target.username,
				name: target.name,
				role: target.role,
				tenant_uuid: target.tenant_uuid,
			},
		};
	}

	/**
	 * Lab-report signatory credential check (used by the count=2 finalize
	 * ceremony). Distinct from {@link verifyCredentials} because:
	 *   • the eligibility rule is "active user with lab_display_name set",
	 *     not "admin / manager role",
	 *   • callers need the resolved user's `lab_display_name` and
	 *     `license_number` to snapshot onto lab_reports.medtech2_*.
	 * Same tenant-scoped lookup: usernames are globally unique but we still
	 * enforce tenant match so cross-tenant credentials can't be used to
	 * finalize.
	 */
	async verifyLabSignatoryCredentials(
		tenant_uuid: string,
		username: string,
		password: string,
	): Promise<
		| { verified: false; code: 'invalid' | 'inactive' | 'forbidden'; message: string }
		| { verified: true; user: { uuid: string; name: string; lab_display_name: string | null; license_number: string | null } }
	> {
		const target = (await User.query().findOne({ tenant_uuid, username })) as User | undefined;
		if (!target) return { verified: false, code: 'invalid', message: 'Invalid credentials.' };

		if ((target.status || '').toLowerCase() !== 'active') {
			return { verified: false, code: 'inactive', message: `Account is ${target.status}.` };
		}

		const ok = await this.authService.validatePassword(password, target.passphrase);
		if (!ok) return { verified: false, code: 'invalid', message: 'Invalid credentials.' };

		if (!target.lab_display_name || !String(target.lab_display_name).trim()) {
			return {
				verified: false,
				code: 'forbidden',
				message: 'This user has no lab display name configured and cannot sign lab reports.',
			};
		}

		return {
			verified: true,
			user: {
				uuid: target.uuid,
				name: target.name,
				lab_display_name: target.lab_display_name ?? null,
				license_number: (target as any).license_number ?? null,
			},
		};
	}

	async changePassword(params: {
		uuid: string;
		newPassword: string;
		changed_by: string;
		source: 'dashboard' | 'profile';
	}): Promise<User | undefined> {
		const { uuid, newPassword, changed_by, source } = params;

		const current = await this.findByUuid(uuid);
		if (!current) return undefined;

		await UserPasswordHistory.query().insert({
			tenant_uuid: current.tenant_uuid,
			user_uuid: uuid,
			passphrase: current.passphrase,
			keycode: current.keycode,
			changed_by,
			change_source: source,
		});

		const { passphrase, keycode } = await this.authService.hashPassword(newPassword);
		const now = new Date();
		return User.query().patchAndFetchById(uuid, {
			passphrase,
			keycode,
			last_change_password: now,
			updated_by: changed_by,
		} as any) as unknown as User;
	}
}
