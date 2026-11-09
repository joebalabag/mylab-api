import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';
import { AuthService } from '../auth/auth.service';
import { Tenant } from '../tenant/tenant.model';
import { Owner } from './owner.model';
import { OwnerTenant } from './owner-tenant.model';

export interface OwnerListFilters extends DashboardQueryDTO {}

@Injectable()
export class OwnerService {
	private readonly logger = new Logger(OwnerService.name);

	constructor(private readonly authService: AuthService) {}

	async listDashboard(filters: OwnerListFilters): Promise<PagedResult<Owner>> {
		const query = Owner.query()
			.select(
				'owners.uuid',
				'owners.username',
				'owners.name',
				'owners.business_name',
				'owners.email',
				'owners.phone',
				'owners.logo_url',
				'owners.status',
				'owners.last_logindate',
				'owners.created_by',
				'owners.created_at',
				'owners.updated_at',
			)
			.orderBy('owners.created_at', 'desc');

		if (filters.date_from) query.where('owners.created_at', '>=', filters.date_from);
		if (filters.date_to)   query.where('owners.created_at', '<=', `${filters.date_to} 23:59:59`);
		if (filters.status && filters.status.length) query.whereIn('owners.status', filters.status);
		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			query.where((qb) => {
				qb.where('owners.username', 'ilike', kw)
					.orWhere('owners.name', 'ilike', kw)
					.orWhere('owners.business_name', 'ilike', kw)
					.orWhere('owners.email', 'ilike', kw)
					.orWhere('owners.phone', 'ilike', kw);
			});
		}

		const page = await applyPagination<Owner>(query as any, filters.page_number, filters.page_size);

		// Attach tenant_count per owner for the Super Owners list. One extra
		// query keyed on the page's owner_uuids — no N+1. Skip when page is
		// empty.
		const ownerUuids = (page.results || []).map((r: any) => r.uuid).filter(Boolean);
		if (ownerUuids.length) {
			const rows = (await OwnerTenant.query()
				.select('owner_uuid')
				.whereIn('owner_uuid', ownerUuids)
				.count('* as count')
				.groupBy('owner_uuid')) as unknown as Array<{ owner_uuid: string; count: string | number }>;
			const map = new Map<string, number>();
			for (const r of rows) map.set(r.owner_uuid, Number(r.count));
			for (const o of page.results as any[]) {
				o.tenant_count = map.get(o.uuid) ?? 0;
			}
		}
		return page;
	}

	async findByUuid(uuid: string): Promise<Owner | undefined> {
		return Owner.query().findOne({ uuid }) as unknown as Owner | undefined;
	}

	async usernameTaken(username: string, excludeUuid?: string): Promise<boolean> {
		const u = String(username ?? '').trim().toLowerCase();
		const q = Owner.query().whereRaw('LOWER(username) = ?', [u]);
		if (excludeUuid) q.andWhereNot('uuid', excludeUuid);
		return !!(await q.first());
	}

	async emailTaken(email: string, excludeUuid?: string): Promise<boolean> {
		const e = String(email ?? '').trim().toLowerCase();
		if (!e) return false;
		const q = Owner.query().whereRaw('LOWER(email) = ?', [e]);
		if (excludeUuid) q.andWhereNot('uuid', excludeUuid);
		return !!(await q.first());
	}

	async create(data: {
		username: string;
		password: string;
		name: string;
		business_name?: string;
		email?: string;
		phone?: string;
		created_by: string;
	}): Promise<Owner> {
		const { passphrase, keycode } = await this.authService.hashPassword(data.password);
		return Owner.query().insertAndFetch({
			username: data.username,
			passphrase,
			keycode,
			name: data.name,
			business_name: data.business_name,
			email: data.email,
			phone: data.phone,
			status: 'active',
			created_by: data.created_by,
		}) as unknown as Owner;
	}

	async update(uuid: string, data: Partial<Owner> & { updated_by: string }): Promise<Owner | undefined> {
		return Owner.query().patchAndFetchById(uuid, data as any) as unknown as Owner | undefined;
	}

	async setStatus(uuid: string, status: 'active' | 'inactive', updated_by: string): Promise<Owner | undefined> {
		return this.update(uuid, { status, updated_by } as any);
	}

	async delete(uuid: string): Promise<number> {
		// CASCADE on the FK clears owner_tenants and owner_password_resets.
		return Owner.query().delete().where({ uuid });
	}

	/* ─── Assigned tenants ─────────────────────────────────────── */

	async listAssignedTenants(owner_uuid: string): Promise<any[]> {
		return Tenant.query()
			.join('owner_tenants', 'owner_tenants.tenant_uuid', 'tenants.uuid')
			.where('owner_tenants.owner_uuid', owner_uuid)
			.select(
				'tenants.uuid as tenant_uuid',
				'tenants.display_name',
				'tenants.store_code',
				'tenants.branch',
				'tenants.status',
				'owner_tenants.created_at as assigned_at',
			)
			.orderBy('tenants.display_name') as unknown as any[];
	}

	async listUnassignedTenants(): Promise<any[]> {
		return Tenant.query()
			.leftJoin('owner_tenants', 'owner_tenants.tenant_uuid', 'tenants.uuid')
			.whereNull('owner_tenants.owner_uuid')
			.select(
				'tenants.uuid as tenant_uuid',
				'tenants.display_name',
				'tenants.store_code',
				'tenants.branch',
				'tenants.status',
			)
			.orderBy('tenants.display_name') as unknown as any[];
	}

	async assignTenant(owner_uuid: string, tenant_uuid: string): Promise<void> {
		// Pre-check so we return 409 with a friendly message instead of a
		// raw UNIQUE-violation SQL error.
		const existing = await OwnerTenant.query().findOne({ tenant_uuid });
		if (existing) {
			if (existing.owner_uuid === owner_uuid) return; // idempotent
			throw new ConflictException('Tenant is already assigned to another owner.');
		}
		await OwnerTenant.query().insert({ owner_uuid, tenant_uuid } as any);
	}

	async unassignTenant(owner_uuid: string, tenant_uuid: string): Promise<number> {
		return OwnerTenant.query().delete().where({ owner_uuid, tenant_uuid });
	}

	/* ─── Direct password set (super-admin override) ──────────── */

	async setPassword(uuid: string, newPassword: string, changed_by: string): Promise<Owner | undefined> {
		const owner = await this.findByUuid(uuid);
		if (!owner) return undefined;
		const { passphrase, keycode } = await this.authService.hashPassword(newPassword);
		return Owner.query().patchAndFetchById(uuid, {
			passphrase,
			keycode,
			change_password_datetime: new Date(),
			change_password_by: changed_by,
			updated_by: changed_by,
		} as any) as unknown as Owner;
	}

	/* ─── Ownership helpers (used by Phase 2 owner-self endpoints) ─── */

	async ownsTenant(owner_uuid: string, tenant_uuid: string): Promise<boolean> {
		const row = await OwnerTenant.query().findOne({ owner_uuid, tenant_uuid });
		return !!row;
	}

	async listOwnedTenantUuids(owner_uuid: string): Promise<string[]> {
		const rows = (await OwnerTenant.query()
			.where({ owner_uuid })
			.select('tenant_uuid')) as unknown as Array<{ tenant_uuid: string }>;
		return rows.map((r) => r.tenant_uuid);
	}

	/* ─── Phase 2 — Owner-scoped metrics ─────────────────────── */

	// Shape matches what OwnerDashboardView / OwnerTenantsView consume.
	// Returns per-tenant metrics joined onto the owner's assigned tenants.
	async listTenantsWithMetrics(owner_uuid: string): Promise<any[]> {
		const tenantRows = (await Tenant.query()
			.join('owner_tenants', 'owner_tenants.tenant_uuid', 'tenants.uuid')
			.where('owner_tenants.owner_uuid', owner_uuid)
			.select(
				'tenants.uuid as tenant_uuid',
				'tenants.display_name',
				'tenants.store_code',
				'tenants.branch',
				'tenants.email_address',
				'tenants.contact_number',
				'tenants.status',
				'owner_tenants.created_at as assigned_at',
			)
			.orderBy('tenants.display_name')) as unknown as any[];

		if (!tenantRows.length) return [];

		const knex = Tenant.knex();
		const tenantUuids = tenantRows.map((t) => t.tenant_uuid);
		const todayStart = new Date();
		todayStart.setHours(0, 0, 0, 0);
		const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

		// Active users per tenant
		const activeUsersRows = (await knex('users')
			.whereIn('tenant_uuid', tenantUuids)
			.andWhere('status', 'active')
			.groupBy('tenant_uuid')
			.select('tenant_uuid')
			.count('* as count')) as Array<{ tenant_uuid: string; count: string | number }>;

		// Today's finalized lab reports (fallback to lab_reports.created_at if finalized_at is absent)
		const todayTestsRows = (await knex('lab_reports')
			.whereIn('tenant_uuid', tenantUuids)
			.andWhere('finalized_at', '>=', todayStart)
			.groupBy('tenant_uuid')
			.select('tenant_uuid')
			.count('* as count')) as Array<{ tenant_uuid: string; count: string | number }>;

		// MTD revenue — sum of completed payment totals since the 1st of the
		// month. `payments.total` is the cached payable amount; `voided`
		// rows are excluded so a reversed sale doesn't double-count.
		const mtdRevenueRows = (await knex('payments')
			.whereIn('tenant_uuid', tenantUuids)
			.andWhere('created_at', '>=', monthStart)
			.andWhereNot('status', 'voided')
			.groupBy('tenant_uuid')
			.select('tenant_uuid')
			.sum('total as total')) as Array<{ tenant_uuid: string; total: string | number | null }>;

		// Pending requisitions — fully paid, awaiting lab results. Covers the
		// "paid" state; drafts / cancellations / partials are excluded so
		// the dashboard number reflects actionable backlog.
		const pendingRows = (await knex('patient_requisitions')
			.whereIn('tenant_uuid', tenantUuids)
			.andWhere('status', 'paid')
			.groupBy('tenant_uuid')
			.select('tenant_uuid')
			.count('* as count')) as Array<{ tenant_uuid: string; count: string | number }>;

		// Last result timestamp
		const lastResultRows = (await knex('lab_reports')
			.whereIn('tenant_uuid', tenantUuids)
			.whereNotNull('finalized_at')
			.groupBy('tenant_uuid')
			.select('tenant_uuid')
			.max('finalized_at as last')) as Array<{ tenant_uuid: string; last: Date | null }>;

		const byTenant: Record<string, any> = {};
		for (const t of tenantRows) {
			byTenant[t.tenant_uuid] = {
				...t,
				active_users: 0,
				today_tests: 0,
				mtd_revenue: 0,
				pending_requisitions: 0,
				last_result_at: null,
			};
		}
		for (const r of activeUsersRows) byTenant[r.tenant_uuid].active_users = Number(r.count);
		for (const r of todayTestsRows) byTenant[r.tenant_uuid].today_tests = Number(r.count);
		for (const r of mtdRevenueRows) byTenant[r.tenant_uuid].mtd_revenue = Number(r.total || 0);
		for (const r of pendingRows) byTenant[r.tenant_uuid].pending_requisitions = Number(r.count);
		for (const r of lastResultRows) byTenant[r.tenant_uuid].last_result_at = r.last;

		return Object.values(byTenant).sort((a: any, b: any) => a.display_name.localeCompare(b.display_name));
	}

	// Aggregated dashboard summary across the owner's tenants.
	async getOwnerSummary(owner_uuid: string): Promise<{
		tenant_count: number;
		active_users: number;
		today_tests: number;
		mtd_revenue: number;
		pending_requisitions: number;
	}> {
		const list = await this.listTenantsWithMetrics(owner_uuid);
		return list.reduce(
			(acc, t: any) => ({
				tenant_count: acc.tenant_count + 1,
				active_users: acc.active_users + (t.active_users || 0),
				today_tests: acc.today_tests + (t.today_tests || 0),
				mtd_revenue: acc.mtd_revenue + (t.mtd_revenue || 0),
				pending_requisitions: acc.pending_requisitions + (t.pending_requisitions || 0),
			}),
			{ tenant_count: 0, active_users: 0, today_tests: 0, mtd_revenue: 0, pending_requisitions: 0 },
		);
	}

	/* ─── Phase 2 — Catalog comparison ──────────────────────────── */

	// Returns { tenants: [...], rows: [{ item_code, name, item_group, category, prices: { tenant_uuid: price }, min, max, has_gap }] }
	async priceComparison(owner_uuid: string): Promise<{ tenants: any[]; rows: any[] }> {
		const tenantUuids = await this.listOwnedTenantUuids(owner_uuid);
		if (!tenantUuids.length) return { tenants: [], rows: [] };

		const tenants = (await Tenant.query()
			.whereIn('uuid', tenantUuids)
			.select('uuid as tenant_uuid', 'display_name', 'store_code', 'branch')
			.orderBy('display_name')) as unknown as any[];

		const knex = Tenant.knex();
		const rows = (await knex('test_items')
			.leftJoin('item_categories', 'item_categories.uuid', 'test_items.item_category_uuid')
			.leftJoin('item_groups', 'item_groups.uuid', 'item_categories.item_group_uuid')
			.whereIn('test_items.tenant_uuid', tenantUuids)
			.select(
				'test_items.uuid as uuid',
				'test_items.tenant_uuid as tenant_uuid',
				'test_items.code as item_code',
				'test_items.name as name',
				'test_items.price as price',
				'test_items.status as status',
				'item_categories.name as category',
				'item_groups.name as item_group',
			)) as Array<any>;

		const byCode = new Map<string, any>();
		for (const r of rows) {
			const existing = byCode.get(r.item_code) || {
				item_code: r.item_code,
				name: r.name,
				item_group: r.item_group || null,
				category: r.category || null,
				prices: {} as Record<string, number>,
			};
			existing.prices[r.tenant_uuid] = Number(r.price || 0);
			if (!existing.name || (r.name && r.name.length > existing.name.length)) existing.name = r.name;
			if (!existing.item_group && r.item_group) existing.item_group = r.item_group;
			if (!existing.category && r.category) existing.category = r.category;
			byCode.set(r.item_code, existing);
		}

		const pivot = Array.from(byCode.values()).map((row) => {
			const vals = Object.values(row.prices) as number[];
			const min = vals.length ? Math.min(...vals) : null;
			const max = vals.length ? Math.max(...vals) : null;
			return {
				...row,
				min,
				max,
				has_gap: min != null && max != null && max - min > 0.0001,
			};
		});
		pivot.sort((a, b) => a.item_code.localeCompare(b.item_code));

		return { tenants, rows: pivot };
	}

	// Bulk patch prices for one item_code across the owner's tenants.
	// Payload shape: { tenant_uuid: price } — unspecified tenants are left
	// alone; tenants that don't currently list the item are skipped (we don't
	// invent catalog rows without a category and group assignment).
	async applyPriceEdits(
		owner_uuid: string,
		item_code: string,
		pricesByTenant: Record<string, number>,
		updated_by: string,
	): Promise<{ touched: number; skipped: string[] }> {
		const ownedUuids = new Set(await this.listOwnedTenantUuids(owner_uuid));
		let touched = 0;
		const skipped: string[] = [];
		const knex = Tenant.knex();

		for (const [tenant_uuid, price] of Object.entries(pricesByTenant)) {
			if (!ownedUuids.has(tenant_uuid)) {
				skipped.push(tenant_uuid);
				continue;
			}
			const num = Number(price);
			if (!Number.isFinite(num) || num < 0) {
				skipped.push(tenant_uuid);
				continue;
			}
			const n = await knex('test_items')
				.where({ tenant_uuid, code: item_code })
				.update({ price: num, updated_by, updated_at: new Date() });
			if (n > 0) touched += n;
			else skipped.push(tenant_uuid);
		}
		return { touched, skipped };
	}
}
