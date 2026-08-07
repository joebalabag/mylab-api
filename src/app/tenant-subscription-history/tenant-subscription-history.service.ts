import { Injectable } from '@nestjs/common';

import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import { TenantSubscriptionHistory } from '../tenant-subscription-payment/tenant-subscription-history.model';
import {
	SubscriptionHistoryDashboardQueryDTO,
	SubscriptionHistoryForTenantQueryDTO,
} from './dto/tenant-subscription-history.dto';

@Injectable()
export class TenantSubscriptionHistoryService {
	async listDashboard(
		filters: SubscriptionHistoryDashboardQueryDTO,
	): Promise<PagedResult<TenantSubscriptionHistory>> {
		const query = TenantSubscriptionHistory.query().orderBy('created_at', 'desc');

		if (filters.tenant_uuid) query.where('tenant_uuid', filters.tenant_uuid);
		if (filters.payment_uuid) query.where('activated_by_payment_uuid', filters.payment_uuid);

		if (filters.row_status) query.where('status', filters.row_status);
		if (filters.status && filters.status.length) query.whereIn('status', filters.status);

		if (filters.has_alter_reason === true) query.whereNotNull('alter_reason');
		if (filters.has_alter_reason === false) query.whereNull('alter_reason');

		if (filters.date_from) query.where('created_at', '>=', filters.date_from);
		if (filters.date_to) query.where('created_at', '<=', `${filters.date_to} 23:59:59`);

		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			query.where((qb) => {
				qb.where('subscription_plan_code', 'ilike', kw)
					.orWhere('subscription_plan_name', 'ilike', kw)
					.orWhere('alter_reason', 'ilike', kw)
					.orWhere('created_by', 'ilike', kw);
			});
		}

		return applyPagination<TenantSubscriptionHistory>(query as any, filters.page_number, filters.page_size);
	}

	async findByUuid(uuid: string): Promise<TenantSubscriptionHistory | undefined> {
		return TenantSubscriptionHistory.query().findOne({ uuid }) as unknown as
			| TenantSubscriptionHistory
			| undefined;
	}

	async listForTenant(
		tenant_uuid: string,
		filters: SubscriptionHistoryForTenantQueryDTO,
	): Promise<TenantSubscriptionHistory[]> {
		const query = TenantSubscriptionHistory.query()
			.where({ tenant_uuid })
			.orderBy('subscription_start', 'desc');

		if (filters.row_status) query.where('status', filters.row_status);

		const limit = filters.limit ? Number(filters.limit) : NaN;
		if (Number.isFinite(limit) && limit > 0) query.limit(limit);

		return query as unknown as Promise<TenantSubscriptionHistory[]>;
	}
}
