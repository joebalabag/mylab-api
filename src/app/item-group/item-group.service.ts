import { Injectable } from '@nestjs/common';
import { transaction as objectionTransaction } from 'objection';
import { Tenant } from '../tenant/tenant.model';
import { ItemGroup } from './item-group.model';
import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import { ItemGroupDashboardQueryDTO } from './dto/item-group.dto';
import {
	getPreloadedGroupManifest,
	seedPreloadedGroupsForTenant,
} from '@/common/seed/standard-catalog';

@Injectable()
export class ItemGroupService {
	async listDashboard(filters: ItemGroupDashboardQueryDTO): Promise<PagedResult<ItemGroup>> {
		// Left-join the tagged signatory doctor so the dashboard can render
		// the doctor's name / specialty / license without a second round-trip.
		const query = ItemGroup.query()
			.alias('ig')
			.leftJoin('doctors as d', 'd.uuid', 'ig.signatory_doctor_uuid')
			.select(
				'ig.*',
				'd.name as signatory_doctor_name',
				'd.specialty as signatory_doctor_specialty',
				'd.license_number as signatory_doctor_license',
			)
			.orderBy('ig.name', 'asc');

		if (filters.tenant_uuid) query.where('ig.tenant_uuid', filters.tenant_uuid);

		if (filters.date_from) query.where('ig.created_at', '>=', filters.date_from);
		if (filters.date_to) query.where('ig.created_at', '<=', `${filters.date_to} 23:59:59`);

		if (filters.status && filters.status.length) {
			query.whereIn('ig.status', filters.status);
		}

		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			query.where((qb) => {
				qb.where('ig.code', 'ilike', kw).orWhere('ig.name', 'ilike', kw);
			});
		}

		return applyPagination<ItemGroup>(query as any, filters.page_number, filters.page_size);
	}

	async findByUuid(uuid: string): Promise<ItemGroup | undefined> {
		return ItemGroup.query().findOne({ uuid }) as unknown as ItemGroup | undefined;
	}

	async tenantExists(tenant_uuid: string): Promise<boolean> {
		const row = await Tenant.query().findOne({ uuid: tenant_uuid });
		return !!row;
	}

	async codeTaken(tenant_uuid: string, code: string, excludeUuid?: string): Promise<boolean> {
		const q = ItemGroup.query().where({ tenant_uuid, code });
		if (excludeUuid) q.andWhereNot('uuid', excludeUuid);
		const row = await q.first();
		return !!row;
	}

	async create(data: {
		tenant_uuid: string;
		code: string;
		name: string;
		description?: string;
		signatory_doctor_uuid?: string;
		tester_role?: string;
		created_by: string;
	}): Promise<ItemGroup> {
		return ItemGroup.query().insertAndFetch({
			tenant_uuid: data.tenant_uuid,
			code: data.code,
			name: data.name,
			description: data.description ?? null,
			signatory_doctor_uuid: data.signatory_doctor_uuid ?? null,
			tester_role: data.tester_role ?? null,
			status: 'active',
			created_by: data.created_by,
		} as any) as unknown as ItemGroup;
	}

	async update(
		uuid: string,
		data: Partial<ItemGroup> & { updated_by: string },
	): Promise<ItemGroup | undefined> {
		return ItemGroup.query().patchAndFetchById(uuid, data as any) as unknown as ItemGroup | undefined;
	}

	async delete(uuid: string): Promise<number> {
		return ItemGroup.query().delete().where({ uuid });
	}

	async setStatus(uuid: string, status: 'active' | 'inactive', updated_by: string): Promise<ItemGroup | undefined> {
		return this.update(uuid, { status, updated_by } as any);
	}

	/**
	 * Manifest of the pre-loaded catalog. Returns every item group in the
	 * standard catalog with its categories + test-item counts, so the
	 * frontend can render a group-level checklist for selective import.
	 * Purely static — reads from the seed module, no DB round-trip.
	 */
	getPreloadedCatalog() {
		return getPreloadedGroupManifest();
	}

	/**
	 * Import one or more pre-loaded groups (each with its categories +
	 * test items) into the given tenant. When `group_codes` is empty /
	 * omitted, the full catalog goes in; otherwise only the listed groups
	 * do. Idempotent — `upsert*` helpers inside the seed skip existing rows.
	 * Runs in a single transaction so a partial failure rolls back cleanly.
	 */
	async importPreloadedCatalog(tenant_uuid: string, actor: string, group_codes?: string[]) {
		const knex = ItemGroup.knex();
		return await objectionTransaction(knex, async (trx) => {
			return await seedPreloadedGroupsForTenant(trx as any, tenant_uuid, actor, {
				only_group_codes: group_codes,
			});
		});
	}
}
