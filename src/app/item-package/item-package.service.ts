import { BadRequestException, Injectable } from '@nestjs/common';
import { transaction as objectionTransaction } from 'objection';
import { Tenant } from '../tenant/tenant.model';
import { TestItem } from '../test-item/test-item.model';
import { ItemPackage } from './item-package.model';
import { ItemPackageItem } from './item-package-item.model';
import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import { ItemPackageDashboardQueryDTO, ItemPackageItemRowDTO } from './dto/item-package.dto';

export interface ItemPackageWithItems extends ItemPackage {
	item_count?: number;
	items?: Array<
		ItemPackageItem & {
			test_item_code?: string | null;
			test_item_name?: string | null;
			test_item_result_type?: string | null;
			test_item_current_price?: number | null;
		}
	>;
}

@Injectable()
export class ItemPackageService {
	async listDashboard(filters: ItemPackageDashboardQueryDTO): Promise<PagedResult<ItemPackageWithItems>> {
		const query = ItemPackage.query()
			.alias('ip')
			.select('ip.*')
			.select(
				ItemPackage.knex().raw(
					'(SELECT COUNT(*) FROM item_package_items ipi WHERE ipi.item_package_uuid = ip.uuid) AS item_count',
				),
			)
			.orderBy('ip.created_at', 'desc');

		if (filters.tenant_uuid) query.where('ip.tenant_uuid', filters.tenant_uuid);

		if (filters.date_from) query.where('ip.created_at', '>=', filters.date_from);
		if (filters.date_to) query.where('ip.created_at', '<=', `${filters.date_to} 23:59:59`);

		if (filters.status && filters.status.length) {
			query.whereIn('ip.status', filters.status);
		}

		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			query.where((qb) => {
				qb.where('ip.code', 'ilike', kw).orWhere('ip.name', 'ilike', kw);
			});
		}

		return applyPagination<ItemPackageWithItems>(query as any, filters.page_number, filters.page_size);
	}

	async findByUuid(uuid: string): Promise<ItemPackageWithItems | undefined> {
		const parent = (await ItemPackage.query().findOne({ uuid })) as unknown as ItemPackage | undefined;
		if (!parent) return undefined;

		// Eager-load items joined against test_items so the frontend can render
		// the package table without a second round-trip. `test_item_current_price`
		// is the LIVE price today — displayed alongside the stored snapshot so
		// the operator can spot when the source price has drifted.
		const items = (await ItemPackageItem.query()
			.alias('ipi')
			.leftJoin('test_items as ti', 'ti.uuid', 'ipi.test_item_uuid')
			.select(
				'ipi.*',
				'ti.code as test_item_code',
				'ti.name as test_item_name',
				'ti.result_type as test_item_result_type',
				'ti.price as test_item_current_price',
			)
			.where('ipi.item_package_uuid', uuid)
			.orderBy([
				{ column: 'ipi.display_order', order: 'asc' },
				{ column: 'ipi.created_at', order: 'asc' },
			])) as unknown as ItemPackageWithItems['items'];

		return { ...(parent as any), items } as ItemPackageWithItems;
	}

	async tenantExists(tenant_uuid: string): Promise<boolean> {
		const row = await Tenant.query().findOne({ uuid: tenant_uuid });
		return !!row;
	}

	async codeTaken(tenant_uuid: string, code: string, excludeUuid?: string): Promise<boolean> {
		const q = ItemPackage.query().where({ tenant_uuid, code });
		if (excludeUuid) q.andWhereNot('uuid', excludeUuid);
		const row = await q.first();
		return !!row;
	}

	async create(data: {
		tenant_uuid: string;
		code: string;
		name: string;
		description?: string;
		created_by: string;
	}): Promise<ItemPackage> {
		return ItemPackage.query().insertAndFetch({
			tenant_uuid: data.tenant_uuid,
			code: data.code,
			name: data.name,
			description: data.description ?? null,
			package_price: 0,
			status: 'active',
			created_by: data.created_by,
		} as any) as unknown as ItemPackage;
	}

	async update(
		uuid: string,
		data: Partial<ItemPackage> & { updated_by: string },
	): Promise<ItemPackage | undefined> {
		// Never let the caller manually overwrite package_price — it's a cached
		// SUM(items.new_price) and syncItems is the only writer.
		const { package_price: _drop, ...rest } = data as any;
		return ItemPackage.query().patchAndFetchById(uuid, rest as any) as unknown as ItemPackage | undefined;
	}

	async delete(uuid: string): Promise<number> {
		return ItemPackage.query().delete().where({ uuid });
	}

	async setStatus(uuid: string, status: 'active' | 'inactive', updated_by: string) {
		return this.update(uuid, { status, updated_by } as any);
	}

	/**
	 * Whole-list sync of a package's items. Runs in a single transaction:
	 *   - Rows with matching uuid → PATCH (current_price, new_price, order)
	 *   - Rows without uuid → INSERT (auto-fills current_price from test_items.price
	 *     when the caller omitted it)
	 *   - Any existing row whose uuid isn't in the payload → DELETE
	 *
	 * Then recomputes parent.package_price = SUM(new_price) and persists.
	 * Rejects if any test_item_uuid doesn't belong to the same tenant.
	 */
	async syncItems(
		pkg: ItemPackage,
		rows: ItemPackageItemRowDTO[],
		updated_by: string,
	): Promise<{ items: ItemPackageItem[]; package_price: number }> {
		const knex = ItemPackageItem.knex();
		return objectionTransaction(knex, async (trx) => {
			// Preload existing items for the diff.
			const existing = (await ItemPackageItem.query(trx).where({
				item_package_uuid: pkg.uuid,
			})) as unknown as ItemPackageItem[];
			const existingByUuid = new Map(existing.map((c) => [c.uuid, c]));

			// Preload the referenced test_items in one shot so we can validate
			// tenancy and pull `price` for auto-fill without N+1 lookups.
			const testItemUuids = Array.from(new Set(rows.map((r) => r.test_item_uuid)));
			const testItems = testItemUuids.length
				? ((await TestItem.query(trx)
					.whereIn('uuid', testItemUuids)) as unknown as TestItem[])
				: [];
			const testItemByUuid = new Map(testItems.map((t) => [t.uuid, t]));

			for (const r of rows) {
				const ti = testItemByUuid.get(r.test_item_uuid);
				if (!ti) throw new BadRequestException(`Test item ${r.test_item_uuid} not found.`);
				if (ti.tenant_uuid !== pkg.tenant_uuid) {
					throw new BadRequestException('Test item belongs to a different tenant.');
				}
			}

			// Reject same test_item appearing twice in the payload.
			const seenTiCounts = new Map<string, number>();
			for (const r of rows) {
				seenTiCounts.set(r.test_item_uuid, (seenTiCounts.get(r.test_item_uuid) || 0) + 1);
			}
			for (const [ti_uuid, count] of seenTiCounts) {
				if (count > 1) {
					throw new BadRequestException('Same test item cannot appear twice in the package.');
				}
			}

			const seenUuids = new Set<string>();
			for (let i = 0; i < rows.length; i++) {
				const row = rows[i];
				const order = row.display_order ?? i;
				const ti = testItemByUuid.get(row.test_item_uuid)!;
				const current_price = row.current_price != null ? Number(row.current_price) : Number(ti.price ?? 0);
				const new_price = Number(row.new_price);

				if (row.uuid) {
					if (!existingByUuid.has(row.uuid)) {
						throw new BadRequestException(`Item ${row.uuid} does not belong to this package.`);
					}
					await ItemPackageItem.query(trx).patchAndFetchById(row.uuid, {
						test_item_uuid: row.test_item_uuid,
						current_price,
						new_price,
						display_order: order,
						updated_by,
					} as any);
					seenUuids.add(row.uuid);
				} else {
					const inserted = (await ItemPackageItem.query(trx).insertAndFetch({
						tenant_uuid: pkg.tenant_uuid,
						item_package_uuid: pkg.uuid,
						test_item_uuid: row.test_item_uuid,
						current_price,
						new_price,
						display_order: order,
						created_by: updated_by,
					} as any)) as unknown as ItemPackageItem;
					seenUuids.add(inserted.uuid);
				}
			}

			const toDelete = existing.filter((c) => !seenUuids.has(c.uuid)).map((c) => c.uuid);
			if (toDelete.length) {
				await ItemPackageItem.query(trx).delete().whereIn('uuid', toDelete);
			}

			const finalItems = (await ItemPackageItem.query(trx)
				.where({ item_package_uuid: pkg.uuid })
				.orderBy([
					{ column: 'display_order', order: 'asc' },
					{ column: 'created_at', order: 'asc' },
				])) as unknown as ItemPackageItem[];

			// Recompute cached total. Round to 2 decimals so display and DB agree.
			const package_price = Math.round(
				finalItems.reduce((sum, it) => sum + Number(it.new_price || 0), 0) * 100,
			) / 100;
			await ItemPackage.query(trx).patchAndFetchById(pkg.uuid, {
				package_price,
				updated_by,
			} as any);

			return { items: finalItems, package_price };
		});
	}
}
