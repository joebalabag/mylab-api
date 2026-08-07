import { Injectable } from '@nestjs/common';

import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import { AccessTemplate } from './access-template.model';
import { AccessTemplateDashboardQueryDTO } from './dto/access-template.dto';

@Injectable()
export class AccessTemplateService {
	async listDashboard(filters: AccessTemplateDashboardQueryDTO): Promise<PagedResult<AccessTemplate>> {
		const query = AccessTemplate.query().orderBy('navigation_id', 'asc');

		if (filters.catalog) query.where('catalog', filters.catalog);
		if (filters.main_navigation) query.where('main_navigation', filters.main_navigation);
		if (filters.has_access === true || filters.has_access === false) {
			query.where('has_access', filters.has_access);
		}

		if (filters.date_from) query.where('created_at', '>=', filters.date_from);
		if (filters.date_to) query.where('created_at', '<=', `${filters.date_to} 23:59:59`);

		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			query.where((qb) => {
				qb.where('catalog', 'ilike', kw)
					.orWhere('main_navigation', 'ilike', kw)
					.orWhere('sub_navigation', 'ilike', kw)
					.orWhere('remarks', 'ilike', kw);
			});
		}

		return applyPagination<AccessTemplate>(query as any, filters.page_number, filters.page_size);
	}

	async findByUuid(uuid: string): Promise<AccessTemplate | undefined> {
		return AccessTemplate.query().findOne({ uuid }) as unknown as AccessTemplate | undefined;
	}

	async navigationIdTaken(navigation_id: number, excludeUuid?: string): Promise<boolean> {
		const q = AccessTemplate.query().where({ navigation_id });
		if (excludeUuid) q.andWhereNot('uuid', excludeUuid);
		const row = await q.first();
		return !!row;
	}

	async tripleTaken(
		catalog: string,
		main_navigation: string,
		sub_navigation: string,
		excludeUuid?: string,
	): Promise<boolean> {
		const q = AccessTemplate.query().where({ catalog, main_navigation, sub_navigation });
		if (excludeUuid) q.andWhereNot('uuid', excludeUuid);
		const row = await q.first();
		return !!row;
	}

	async create(data: {
		navigation_id: number;
		catalog_id: number;
		catalog: string;
		main_navigation: string;
		sub_navigation: string;
		remarks?: string;
		has_access?: boolean;
		created_by: string;
	}): Promise<AccessTemplate> {
		return AccessTemplate.query().insertAndFetch({
			navigation_id: data.navigation_id,
			catalog_id: data.catalog_id,
			catalog: data.catalog,
			main_navigation: data.main_navigation,
			sub_navigation: data.sub_navigation,
			remarks: data.remarks ?? null,
			has_access: data.has_access ?? false,
			created_by: data.created_by,
		} as any) as unknown as AccessTemplate;
	}

	async update(
		uuid: string,
		data: Partial<AccessTemplate> & { updated_by: string },
	): Promise<AccessTemplate | undefined> {
		return AccessTemplate.query().patchAndFetchById(uuid, data as any) as unknown as
			| AccessTemplate
			| undefined;
	}

	async delete(uuid: string): Promise<{ count: number }> {
		const count = await AccessTemplate.query().delete().where({ uuid });
		return { count };
	}
}
