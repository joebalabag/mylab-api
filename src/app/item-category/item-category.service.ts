import { Injectable } from '@nestjs/common';
import { Tenant } from '../tenant/tenant.model';
import { ItemGroup } from '../item-group/item-group.model';
import { ItemCategory } from './item-category.model';
import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import { ItemCategoryDashboardQueryDTO } from './dto/item-category.dto';

export interface ItemCategoryWithGroup extends ItemCategory {
	item_group_code?: string | null;
	item_group_name?: string | null;
}

@Injectable()
export class ItemCategoryService {
	async listDashboard(filters: ItemCategoryDashboardQueryDTO): Promise<PagedResult<ItemCategoryWithGroup>> {
		const query = ItemCategory.query()
			.alias('ic')
			.leftJoin('item_groups as ig', 'ig.uuid', 'ic.item_group_uuid')
			.select(
				'ic.*',
				'ig.code as item_group_code',
				'ig.name as item_group_name',
			)
			.orderBy('ic.name', 'asc');

		if (filters.tenant_uuid) query.where('ic.tenant_uuid', filters.tenant_uuid);
		if (filters.item_group_uuid) query.where('ic.item_group_uuid', filters.item_group_uuid);

		if (filters.date_from) query.where('ic.created_at', '>=', filters.date_from);
		if (filters.date_to) query.where('ic.created_at', '<=', `${filters.date_to} 23:59:59`);

		if (filters.status && filters.status.length) {
			query.whereIn('ic.status', filters.status);
		}

		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			query.where((qb) => {
				qb.where('ic.code', 'ilike', kw)
					.orWhere('ic.name', 'ilike', kw)
					.orWhere('ig.name', 'ilike', kw);
			});
		}

		return applyPagination<ItemCategoryWithGroup>(query as any, filters.page_number, filters.page_size);
	}

	async findByUuid(uuid: string): Promise<ItemCategoryWithGroup | undefined> {
		const row = await ItemCategory.query()
			.alias('ic')
			.leftJoin('item_groups as ig', 'ig.uuid', 'ic.item_group_uuid')
			.select('ic.*', 'ig.code as item_group_code', 'ig.name as item_group_name')
			.findOne({ 'ic.uuid': uuid });
		return row as unknown as ItemCategoryWithGroup | undefined;
	}

	async tenantExists(tenant_uuid: string): Promise<boolean> {
		const row = await Tenant.query().findOne({ uuid: tenant_uuid });
		return !!row;
	}

	/** Confirms the group belongs to the tenant. Returns the group row or null. */
	async findGroupInTenant(item_group_uuid: string, tenant_uuid: string): Promise<ItemGroup | undefined> {
		return ItemGroup.query().findOne({ uuid: item_group_uuid, tenant_uuid }) as unknown as ItemGroup | undefined;
	}

	async codeTaken(tenant_uuid: string, code: string, excludeUuid?: string): Promise<boolean> {
		const q = ItemCategory.query().where({ tenant_uuid, code });
		if (excludeUuid) q.andWhereNot('uuid', excludeUuid);
		const row = await q.first();
		return !!row;
	}

	async create(data: {
		tenant_uuid: string;
		item_group_uuid: string;
		code: string;
		name: string;
		description?: string;
		combine_printout?: boolean;
		color?: string;
		print_title?: string;
		print_template?: string;
		print_paper_size?: string;
		created_by: string;
	}): Promise<ItemCategory> {
		return ItemCategory.query().insertAndFetch({
			tenant_uuid: data.tenant_uuid,
			item_group_uuid: data.item_group_uuid,
			code: data.code,
			name: data.name,
			description: data.description ?? null,
			combine_printout: data.combine_printout ?? true,
			color: data.color ?? null,
			print_title: data.print_title ?? null,
			print_template: data.print_template ?? null,
			print_paper_size: data.print_paper_size ?? null,
			status: 'active',
			created_by: data.created_by,
		} as any) as unknown as ItemCategory;
	}

	async update(
		uuid: string,
		data: Partial<ItemCategory> & { updated_by: string },
	): Promise<ItemCategory | undefined> {
		return ItemCategory.query().patchAndFetchById(uuid, data as any) as unknown as ItemCategory | undefined;
	}

	async delete(uuid: string): Promise<number> {
		return ItemCategory.query().delete().where({ uuid });
	}

	async setStatus(uuid: string, status: 'active' | 'inactive', updated_by: string): Promise<ItemCategory | undefined> {
		return this.update(uuid, { status, updated_by } as any);
	}
}
