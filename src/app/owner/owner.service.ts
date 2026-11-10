import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { transaction as objectionTransaction } from 'objection';
import { v4 as uuidv4 } from 'uuid';
import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import { DashboardQueryDTO } from '@/common/dto/dashboard-query.dto';
import { recordAuditEvent, TrxLike } from '../audit-log/audit-log.service';
import { AuditActor, AuditRequestMeta } from '../audit-log/audit-context';
import { AuthService } from '../auth/auth.service';
import { Tenant } from '../tenant/tenant.model';
import { Owner } from './owner.model';
import { OwnerTenant } from './owner-tenant.model';

// Audit response contract — exported so the controller can match the shape.
export interface PriceEditSkip {
	tenant_uuid: string;
	reason: string;
}
export interface PriceEditResult {
	touched: number;
	added: number;
	skipped: PriceEditSkip[];
	// Tenants where the clone had to auto-create an item_group. The caller
	// should wire up a signatory_doctor_uuid later or printed reports will
	// render without a signatory. Keyed by tenant_uuid.
	new_group_needs_signatory: string[];
}

function ownerActor(current: any): AuditActor {
	// actorFromCurrent() in audit-context.ts routes `owner` to `'anonymous'`;
	// we build the actor inline so audit rows attribute catalog clones to the
	// signed-in owner rather than an anonymous caller.
	if (current?.type === 'owner' && current?.uuid) {
		return {
			actor_type: 'owner',
			actor_uuid: current.uuid,
			actor_label: current.name || current.username || null,
			tenant_uuid: null,
		};
	}
	return { actor_type: 'anonymous', actor_uuid: null, actor_label: null, tenant_uuid: null };
}

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
	// `prices` updates existing listings; `add` opts into cloning the item
	// (and its test_item_components, plus item_group/item_category if
	// missing) from the owner-owned tenant whose test_items row has the
	// most recent updated_at, then stamping the supplied price. Split by
	// key so a UI bug can't accidentally clone catalog rows. Each clone
	// runs in its own transaction so one bad target doesn't poison the
	// others. `currentUser` is only used to attribute the audit rows that
	// `cloneItemIntoTenant` emits inside the trx — operational path is
	// unchanged if it's omitted.
	async applyPriceEdits(
		owner_uuid: string,
		item_code: string,
		pricesByTenant: Record<string, number>,
		updated_by: string,
		addsByTenant: Record<string, number> = {},
		currentUser: any = null,
		requestMeta: AuditRequestMeta | null = null,
	): Promise<PriceEditResult> {
		const ownedUuids = new Set(await this.listOwnedTenantUuids(owner_uuid));
		let touched = 0;
		let added = 0;
		const skipped: PriceEditSkip[] = [];
		const new_group_needs_signatory: string[] = [];
		const skip = (tenant_uuid: string, reason: string) => skipped.push({ tenant_uuid, reason });
		const knex = Tenant.knex();

		for (const [tenant_uuid, price] of Object.entries(pricesByTenant)) {
			if (!ownedUuids.has(tenant_uuid)) {
				skip(tenant_uuid, 'not-owned');
				continue;
			}
			const num = Number(price);
			if (!Number.isFinite(num) || num < 0) {
				skip(tenant_uuid, 'invalid-price');
				continue;
			}
			const n = await knex('test_items')
				.where({ tenant_uuid, code: item_code })
				.update({ price: num, updated_by, updated_at: new Date() });
			if (n > 0) touched += n;
			else skip(tenant_uuid, 'no-existing-listing');
		}

		// --- Clone-and-add path ---
		// C1: a tenant already handled by `prices` must not be processed
		//     here or `touched` double-counts via the race-guard UPDATE.
		// C2: the source candidate pool excludes every add-target so a row
		//     that appeared between read-time and clone-time cannot become
		//     the source for its own clone.
		const pricedKeys = new Set(Object.keys(pricesByTenant));
		const addTargets = new Set<string>();
		const addEntries: Array<[string, number]> = [];

		for (const [tenant_uuid, price] of Object.entries(addsByTenant)) {
			if (!ownedUuids.has(tenant_uuid)) {
				skip(tenant_uuid, 'not-owned');
				continue;
			}
			if (pricedKeys.has(tenant_uuid)) {
				skip(tenant_uuid, 'already-in-prices');
				continue;
			}
			addEntries.push([tenant_uuid, price]);
			addTargets.add(tenant_uuid);
		}

		if (addEntries.length) {
			const sourcePool = Array.from(ownedUuids).filter((u) => !addTargets.has(u));
			const source = await this.pickLatestSourceForItem(sourcePool, item_code);
			if (!source) {
				for (const [t] of addEntries) skip(t, 'no-source-tenant-has-this-item');
			} else {
				const actor = ownerActor(currentUser);
				for (const [tenant_uuid, price] of addEntries) {
					const num = Number(price);
					if (!Number.isFinite(num) || num < 0) {
						skip(tenant_uuid, 'invalid-price');
						continue;
					}
					// Race window: a row may appear on the target between
					// pricing read-time and clone-time. Treat as an update
					// instead of inserting a duplicate.
					const existing = await knex('test_items')
						.where({ tenant_uuid, code: item_code })
						.update({ price: num, updated_by, updated_at: new Date() });
					if (existing > 0) {
						touched += existing;
						continue;
					}
					try {
						const cloneResult = await this.cloneItemIntoTenant(
							source,
							tenant_uuid,
							num,
							updated_by,
							actor,
							requestMeta,
						);
						added += 1;
						if (cloneResult.created_group) new_group_needs_signatory.push(tenant_uuid);
					} catch (err) {
						const message = (err as Error).message || 'clone failed';
						this.logger.warn(
							`Failed to clone item_code=${item_code} into tenant=${tenant_uuid}: ${message}`,
						);
						skip(tenant_uuid, message);
					}
				}
			}
		}

		return { touched, added, skipped, new_group_needs_signatory };
	}

	// Pick the test_items row for a given item_code whose updated_at is
	// highest across the owner's tenants, together with its parent category
	// and group rows. Returned shape is fully populated so the caller can
	// clone without re-reading.
	private async pickLatestSourceForItem(tenantUuids: string[], item_code: string) {
		if (!tenantUuids.length) return null;
		const knex = Tenant.knex();
		const ti = await knex('test_items')
			.whereIn('tenant_uuid', tenantUuids)
			.andWhere('code', item_code)
			.orderBy('updated_at', 'desc')
			.first();
		if (!ti) return null;

		const category = ti.item_category_uuid
			? await knex('item_categories').where({ uuid: ti.item_category_uuid }).first()
			: null;
		const group = category?.item_group_uuid
			? await knex('item_groups').where({ uuid: category.item_group_uuid }).first()
			: null;
		const components = await knex('test_item_components')
			.where({ test_item_uuid: ti.uuid })
			.orderBy('display_order', 'asc');

		return { test_item: ti, category, group, components };
	}

	// Clone one item (and its components, plus category/group if missing)
	// from `source` into `targetTenantUuid` in a single transaction. The
	// resolved category/group on the target are matched by `code`; a
	// missing row on the target is created from the source row's fields.
	// Returns `created_group: true` when a new item_group was inserted so
	// the caller can warn the owner that signatory_doctor_uuid is null.
	// All inserts emit audit events attached to the trx — the audit layer
	// discards them on rollback.
	private async cloneItemIntoTenant(
		source: {
			test_item: any;
			category: any | null;
			group: any | null;
			components: any[];
		},
		targetTenantUuid: string,
		price: number,
		updated_by: string,
		actor: AuditActor,
		requestMeta: AuditRequestMeta | null,
	): Promise<{ created_group: boolean }> {
		// B1 guard — `test_items.item_category_uuid` is NOT NULL. If the
		// source row has no resolved category (row is orphaned or column
		// was null), inserting into the target would trip a Postgres
		// constraint violation that leaks into the user-facing skip
		// reason. Fail fast with a business-level message instead.
		if (!source.category) {
			throw new ConflictException(
				`Source item "${source.test_item?.code ?? ''}" has no item_category — cannot clone into target tenant. Fix the source listing's category first.`,
			);
		}

		const knex = Tenant.knex();
		const now = new Date();
		let created_group = false;

		await objectionTransaction(knex, async (trx) => {
			// Knex trx objects are thenable at runtime (commit = resolve,
			// rollback = reject). The Objection typings don't surface that,
			// so cast once and reuse.
			const auditTrx = trx as unknown as TrxLike;
			// Resolve or create item_group on target by code.
			let targetGroupUuid: string | null = null;
			if (source.group) {
				const existingGroup = await trx('item_groups')
					.where({ tenant_uuid: targetTenantUuid, code: source.group.code })
					.first();
				if (existingGroup) {
					targetGroupUuid = existingGroup.uuid;
				} else {
					targetGroupUuid = uuidv4();
					const newGroup = {
						uuid: targetGroupUuid,
						tenant_uuid: targetTenantUuid,
						code: source.group.code,
						name: source.group.name,
						description: source.group.description ?? null,
						// signatory_doctor_uuid references a doctor row that
						// is tenant-scoped on the source — do not carry it
						// across. The target owner can wire it up later.
						signatory_doctor_uuid: null,
						tester_role: source.group.tester_role ?? null,
						status: source.group.status ?? 'active',
						created_by: updated_by,
						updated_by,
						created_at: now,
						updated_at: now,
					};
					await trx('item_groups').insert(newGroup);
					created_group = true;
					recordAuditEvent(
						{
							tenant_uuid: targetTenantUuid,
							actor,
							request: requestMeta,
							action: 'create',
							entity_type: 'item_group',
							entity_uuid: targetGroupUuid,
							summary: `Created item_group "${newGroup.code}" (clone-and-add from sibling branch)`,
							changes: { after: newGroup },
						},
						auditTrx,
					);
				}
			}

			// Resolve or create item_category on target by code.
			let targetCategoryUuid: string | null = null;
			if (source.category) {
				const existingCat = await trx('item_categories')
					.where({ tenant_uuid: targetTenantUuid, code: source.category.code })
					.first();
				if (existingCat) {
					targetCategoryUuid = existingCat.uuid;
				} else {
					if (!targetGroupUuid) {
						throw new ConflictException(
							`Cannot create item_category "${source.category.code}" on target tenant: parent item_group is missing on the source.`,
						);
					}
					targetCategoryUuid = uuidv4();
					const newCategory = {
						uuid: targetCategoryUuid,
						tenant_uuid: targetTenantUuid,
						item_group_uuid: targetGroupUuid,
						code: source.category.code,
						name: source.category.name,
						description: source.category.description ?? null,
						combine_printout: !!source.category.combine_printout,
						color: source.category.color ?? null,
						print_title: source.category.print_title ?? null,
						print_template: source.category.print_template ?? null,
						print_paper_size: source.category.print_paper_size ?? null,
						status: source.category.status ?? 'active',
						created_by: updated_by,
						updated_by,
						created_at: now,
						updated_at: now,
					};
					await trx('item_categories').insert(newCategory);
					recordAuditEvent(
						{
							tenant_uuid: targetTenantUuid,
							actor,
							request: requestMeta,
							action: 'create',
							entity_type: 'item_category',
							entity_uuid: targetCategoryUuid,
							summary: `Created item_category "${newCategory.code}" (clone-and-add from sibling branch)`,
							changes: { after: newCategory },
						},
						auditTrx,
					);
				}
			}

			// Insert the test_items row.
			const newTestItemUuid = uuidv4();
			const src = source.test_item;
			const newTestItem = {
				uuid: newTestItemUuid,
				tenant_uuid: targetTenantUuid,
				item_category_uuid: targetCategoryUuid,
				code: src.code,
				name: src.name,
				result_type: src.result_type,
				specimen: src.specimen ?? null,
				unit_of_measure: src.unit_of_measure ?? null,
				reference_range: src.reference_range ?? null,
				method: src.method ?? null,
				lookup_values: src.lookup_values ?? null,
				matrix_config: src.matrix_config ?? null,
				si_conversion_factor: src.si_conversion_factor ?? null,
				si_unit_of_measure: src.si_unit_of_measure ?? null,
				si_reference_range: src.si_reference_range ?? null,
				price,
				description: src.description ?? null,
				status: src.status ?? 'active',
				created_by: updated_by,
				updated_by,
				created_at: now,
				updated_at: now,
			};
			await trx('test_items').insert(newTestItem);
			recordAuditEvent(
				{
					tenant_uuid: targetTenantUuid,
					actor,
					request: requestMeta,
					action: 'create',
					entity_type: 'test_item',
					entity_uuid: newTestItemUuid,
					summary: `Created test_item "${newTestItem.code}" (clone-and-add from sibling branch)`,
					changes: { after: newTestItem },
				},
				auditTrx,
			);

			// Clone components verbatim with new uuids + the new test_item_uuid.
			if (source.components?.length) {
				const rows = source.components.map((c: any) => ({
					uuid: uuidv4(),
					tenant_uuid: targetTenantUuid,
					test_item_uuid: newTestItemUuid,
					code: c.code,
					name: c.name,
					unit_of_measure: c.unit_of_measure ?? null,
					reference_range: c.reference_range ?? null,
					lookup_values: c.lookup_values ?? null,
					section: c.section ?? null,
					display_order: c.display_order ?? 0,
					si_conversion_factor: c.si_conversion_factor ?? null,
					si_unit_of_measure: c.si_unit_of_measure ?? null,
					si_reference_range: c.si_reference_range ?? null,
					created_by: updated_by,
					updated_by,
					created_at: now,
					updated_at: now,
				}));
				await trx('test_item_components').insert(rows);
				// One audit row per component — a bulk "N components" entry
				// would hide individual deletes/reassignments later.
				for (const row of rows) {
					recordAuditEvent(
						{
							tenant_uuid: targetTenantUuid,
							actor,
							request: requestMeta,
							action: 'create',
							entity_type: 'test_item_component',
							entity_uuid: row.uuid,
							summary: `Created test_item_component "${row.code}" (clone-and-add from sibling branch)`,
							changes: { after: row },
						},
						auditTrx,
					);
				}
			}
		});

		return { created_group };
	}
}
