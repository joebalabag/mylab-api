import { Injectable } from '@nestjs/common';
import { transaction as objectionTransaction } from 'objection';
import { Tenant } from '../tenant/tenant.model';
import { ItemCategory } from '../item-category/item-category.model';
import { TestItem, ResultType } from './test-item.model';
import { TestItemComponent } from './test-item-component.model';
import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import { TestItemComponentRowDTO, TestItemDashboardQueryDTO } from './dto/test-item.dto';

export interface TestItemWithCategory extends TestItem {
	item_category_code?: string | null;
	item_category_name?: string | null;
	item_group_uuid?: string | null;
	item_group_code?: string | null;
	item_group_name?: string | null;
	components?: TestItemComponent[];
}

@Injectable()
export class TestItemService {
	async listDashboard(filters: TestItemDashboardQueryDTO): Promise<PagedResult<TestItemWithCategory>> {
		const query = TestItem.query()
			.alias('ti')
			.leftJoin('item_categories as ic', 'ic.uuid', 'ti.item_category_uuid')
			.leftJoin('item_groups as ig', 'ig.uuid', 'ic.item_group_uuid')
			.select(
				'ti.*',
				'ic.code as item_category_code',
				'ic.name as item_category_name',
				'ig.uuid as item_group_uuid',
				'ig.code as item_group_code',
				'ig.name as item_group_name',
			)
			.orderBy('ti.name', 'asc');

		if (filters.tenant_uuid)        query.where('ti.tenant_uuid', filters.tenant_uuid);
		if (filters.item_category_uuid) query.where('ti.item_category_uuid', filters.item_category_uuid);
		if (filters.item_group_uuid)    query.where('ig.uuid', filters.item_group_uuid);
		if (filters.result_type)        query.where('ti.result_type', filters.result_type);

		if (filters.date_from) query.where('ti.created_at', '>=', filters.date_from);
		if (filters.date_to)   query.where('ti.created_at', '<=', `${filters.date_to} 23:59:59`);

		if (filters.status && filters.status.length) {
			query.whereIn('ti.status', filters.status);
		}

		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			query.where((qb) => {
				qb.where('ti.code', 'ilike', kw)
					.orWhere('ti.name', 'ilike', kw)
					.orWhere('ic.name', 'ilike', kw)
					.orWhere('ig.name', 'ilike', kw);
			});
		}

		return applyPagination<TestItemWithCategory>(query as any, filters.page_number, filters.page_size);
	}

	async findByUuid(uuid: string): Promise<TestItemWithCategory | undefined> {
		const row = await TestItem.query()
			.alias('ti')
			.leftJoin('item_categories as ic', 'ic.uuid', 'ti.item_category_uuid')
			.leftJoin('item_groups as ig', 'ig.uuid', 'ic.item_group_uuid')
			.select(
				'ti.*',
				'ic.code as item_category_code',
				'ic.name as item_category_name',
				'ig.uuid as item_group_uuid',
				'ig.code as item_group_code',
				'ig.name as item_group_name',
			)
			.findOne({ 'ti.uuid': uuid });
		if (!row) return undefined;

		// Panels are the only kind that use components, but we eager-load for
		// every result_type — the renderer decides whether to show them and
		// this way the view endpoint stays a single query shape.
		const components = (await TestItemComponent.query()
			.where({ test_item_uuid: (row as any).uuid })
			.orderBy([
				{ column: 'display_order', order: 'asc' },
				{ column: 'created_at', order: 'asc' },
			])) as unknown as TestItemComponent[];

		return { ...(row as unknown as TestItemWithCategory), components } as unknown as TestItemWithCategory;
	}

	async tenantExists(tenant_uuid: string): Promise<boolean> {
		const row = await Tenant.query().findOne({ uuid: tenant_uuid });
		return !!row;
	}

	/** Confirms the category belongs to the tenant and returns it (or undefined). */
	async findCategoryInTenant(item_category_uuid: string, tenant_uuid: string): Promise<ItemCategory | undefined> {
		return ItemCategory.query().findOne({
			uuid: item_category_uuid,
			tenant_uuid,
		}) as unknown as ItemCategory | undefined;
	}

	async codeTaken(tenant_uuid: string, code: string, excludeUuid?: string): Promise<boolean> {
		const q = TestItem.query().where({ tenant_uuid, code });
		if (excludeUuid) q.andWhereNot('uuid', excludeUuid);
		const row = await q.first();
		return !!row;
	}

	async create(data: {
		tenant_uuid: string;
		item_category_uuid: string;
		code: string;
		name: string;
		result_type: ResultType;
		specimen?: string;
		unit_of_measure?: string;
		reference_range?: string;
		method?: string;
		lookup_values?: string;
		matrix_config?: { rows: string[]; cols: string[] } | null;
		price?: number;
		description?: string;
		created_by: string;
	}): Promise<TestItem> {
		return TestItem.query().insertAndFetch({
			tenant_uuid: data.tenant_uuid,
			item_category_uuid: data.item_category_uuid,
			code: data.code,
			name: data.name,
			result_type: data.result_type,
			specimen: data.specimen ?? null,
			unit_of_measure: data.unit_of_measure ?? null,
			reference_range: data.reference_range ?? null,
			method: data.method ?? null,
			lookup_values: data.lookup_values ?? null,
			matrix_config: data.matrix_config ?? null,
			price: data.price ?? 0,
			description: data.description ?? null,
			status: 'active',
			created_by: data.created_by,
		} as any) as unknown as TestItem;
	}

	async update(
		uuid: string,
		data: Partial<TestItem> & { updated_by: string },
	): Promise<TestItem | undefined> {
		return TestItem.query().patchAndFetchById(uuid, data as any) as unknown as TestItem | undefined;
	}

	async delete(uuid: string): Promise<number> {
		return TestItem.query().delete().where({ uuid });
	}

	async setStatus(uuid: string, status: 'active' | 'inactive', updated_by: string): Promise<TestItem | undefined> {
		return this.update(uuid, { status, updated_by } as any);
	}

	/**
	 * Whole-list sync of a test item's components. Runs in a single transaction:
	 *   1. Rows with matching uuid → PATCH
	 *   2. Rows without uuid → INSERT (server-assigned uuid)
	 *   3. Existing rows whose uuid isn't in the payload → DELETE
	 *
	 * Rejects when a payload uuid doesn't belong to the parent (defends against
	 * cross-item mutation via forged uuid). Returns the fresh, ordered list.
	 */
	async syncComponents(
		testItem: TestItem,
		rows: TestItemComponentRowDTO[],
		updated_by: string,
	): Promise<TestItemComponent[]> {
		const knex = TestItemComponent.knex();
		return objectionTransaction(knex, async (trx) => {
			const existing = (await TestItemComponent.query(trx).where({
				test_item_uuid: testItem.uuid,
			})) as unknown as TestItemComponent[];
			const existingByUuid = new Map(existing.map((c) => [c.uuid, c]));

			const seenUuids = new Set<string>();

			for (let i = 0; i < rows.length; i++) {
				const row = rows[i];
				const order = row.display_order ?? i;
				if (row.uuid) {
					const target = existingByUuid.get(row.uuid);
					if (!target) {
						throw new Error(`Component ${row.uuid} does not belong to this test item.`);
					}
					await TestItemComponent.query(trx).patchAndFetchById(row.uuid, {
						code: row.code,
						name: row.name,
						unit_of_measure: row.unit_of_measure ?? null,
						reference_range: row.reference_range ?? null,
						lookup_values: row.lookup_values ?? null,
						section: row.section ?? null,
						display_order: order,
						updated_by,
					} as any);
					seenUuids.add(row.uuid);
				} else {
					const inserted = (await TestItemComponent.query(trx).insertAndFetch({
						tenant_uuid: testItem.tenant_uuid,
						test_item_uuid: testItem.uuid,
						code: row.code,
						name: row.name,
						unit_of_measure: row.unit_of_measure ?? null,
						reference_range: row.reference_range ?? null,
						lookup_values: row.lookup_values ?? null,
						section: row.section ?? null,
						display_order: order,
						created_by: updated_by,
					} as any)) as unknown as TestItemComponent;
					seenUuids.add(inserted.uuid);
				}
			}

			const toDelete = existing.filter((c) => !seenUuids.has(c.uuid)).map((c) => c.uuid);
			if (toDelete.length) {
				await TestItemComponent.query(trx).delete().whereIn('uuid', toDelete);
			}

			return (await TestItemComponent.query(trx)
				.where({ test_item_uuid: testItem.uuid })
				.orderBy([
					{ column: 'display_order', order: 'asc' },
					{ column: 'created_at', order: 'asc' },
				])) as unknown as TestItemComponent[];
		});
	}
}
