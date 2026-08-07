import { Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { Admin } from './admin.model';
import { AdminPasswordHistory } from './admin-password-history.model';
import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';

@Injectable()
export class AdminService {
	constructor(private readonly authService: AuthService) {}

	async listDashboard(filters: DashboardQueryDTO): Promise<PagedResult<Admin>> {
		const query = Admin.query()
			.select('uuid', 'username', 'name', 'email', 'role', 'status', 'last_logindate', 'created_at', 'updated_at')
			.orderBy('created_at', 'desc');

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

		return applyPagination<Admin>(query as any, filters.page_number, filters.page_size);
	}

	async findByUuid(uuid: string): Promise<Admin | undefined> {
		return Admin.query().findOne({ uuid }) as unknown as Admin | undefined;
	}

	async usernameTaken(username: string, excludeUuid?: string): Promise<boolean> {
		const q = Admin.query().where({ username });
		if (excludeUuid) q.andWhereNot('uuid', excludeUuid);
		const row = await q.first();
		return !!row;
	}

	async create(data: {
		username: string;
		password: string;
		name: string;
		email?: string;
		role?: string;
		created_by: string;
	}): Promise<Admin> {
		const { passphrase, keycode } = await this.authService.hashPassword(data.password);
		return Admin.query().insertAndFetch({
			username: data.username,
			passphrase,
			keycode,
			name: data.name,
			email: data.email,
			role: data.role || 'super_admin',
			status: 'active',
			created_by: data.created_by,
		}) as unknown as Admin;
	}

	async update(uuid: string, data: Partial<Admin> & { updated_by: string }): Promise<Admin | undefined> {
		return Admin.query().patchAndFetchById(uuid, data as any) as unknown as Admin | undefined;
	}

	async delete(uuid: string): Promise<number> {
		return Admin.query().delete().where({ uuid });
	}

	async setStatus(uuid: string, status: 'active' | 'inactive', updated_by: string): Promise<Admin | undefined> {
		return this.update(uuid, { status, updated_by } as any);
	}

	async changePassword(params: {
		uuid: string;
		newPassword: string;
		changed_by: string;
		source: 'dashboard' | 'profile';
	}): Promise<Admin | undefined> {
		const { uuid, newPassword, changed_by, source } = params;

		const current = await this.findByUuid(uuid);
		if (!current) return undefined;

		await AdminPasswordHistory.query().insert({
			admin_uuid: uuid,
			passphrase: current.passphrase,
			keycode: current.keycode,
			changed_by,
			change_source: source,
		});

		const { passphrase, keycode } = await this.authService.hashPassword(newPassword);
		return Admin.query().patchAndFetchById(uuid, {
			passphrase,
			keycode,
			change_password_datetime: new Date(),
			change_password_by: changed_by,
			updated_by: changed_by,
		} as any) as unknown as Admin;
	}
}
