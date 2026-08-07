import { Injectable } from '@nestjs/common';
import { Tenant } from '../tenant/tenant.model';
import { Discount, DiscountType } from './discount.model';
import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import { DiscountDashboardQueryDTO } from './dto/discount.dto';

@Injectable()
export class DiscountService {
	async listDashboard(filters: DiscountDashboardQueryDTO): Promise<PagedResult<Discount>> {
		const query = Discount.query().orderBy('created_at', 'desc');

		if (filters.tenant_uuid) query.where('tenant_uuid', filters.tenant_uuid);
		if (filters.discount_type) query.where('discount_type', filters.discount_type);

		if (filters.date_from) query.where('created_at', '>=', filters.date_from);
		if (filters.date_to) query.where('created_at', '<=', `${filters.date_to} 23:59:59`);

		if (filters.status && filters.status.length) {
			query.whereIn('status', filters.status);
		}

		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			query.where((qb) => {
				qb.where('code', 'ilike', kw).orWhere('name', 'ilike', kw);
			});
		}

		return applyPagination<Discount>(query as any, filters.page_number, filters.page_size);
	}

	async findByUuid(uuid: string): Promise<Discount | undefined> {
		return Discount.query().findOne({ uuid }) as unknown as Discount | undefined;
	}

	async tenantExists(tenant_uuid: string): Promise<boolean> {
		const row = await Tenant.query().findOne({ uuid: tenant_uuid });
		return !!row;
	}

	async codeTaken(tenant_uuid: string, code: string, excludeUuid?: string): Promise<boolean> {
		const q = Discount.query().where({ tenant_uuid, code });
		if (excludeUuid) q.andWhereNot('uuid', excludeUuid);
		const row = await q.first();
		return !!row;
	}

	async create(data: {
		tenant_uuid: string;
		code: string;
		name: string;
		discount_type: DiscountType;
		value?: number;
		created_by: string;
	}): Promise<Discount> {
		return Discount.query().insertAndFetch({
			tenant_uuid: data.tenant_uuid,
			code: data.code,
			name: data.name,
			discount_type: data.discount_type,
			// open_amount always stored as 0 — actual amount comes from the UI at use time
			value: data.discount_type === 'open_amount' ? 0 : data.value ?? 0,
			status: 'active',
			created_by: data.created_by,
		} as any) as unknown as Discount;
	}

	async update(
		uuid: string,
		data: Partial<Discount> & { updated_by: string },
	): Promise<Discount | undefined> {
		return Discount.query().patchAndFetchById(uuid, data as any) as unknown as Discount | undefined;
	}

	async delete(uuid: string): Promise<number> {
		return Discount.query().delete().where({ uuid });
	}

	async setStatus(uuid: string, status: 'active' | 'inactive', updated_by: string): Promise<Discount | undefined> {
		return this.update(uuid, { status, updated_by } as any);
	}
}
