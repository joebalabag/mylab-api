import { Injectable } from '@nestjs/common';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { Tenant } from '../tenant/tenant.model';
import { Doctor } from './doctor.model';
import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import { DoctorDashboardQueryDTO } from './dto/doctor.dto';

@Injectable()
export class DoctorService {
	async listDashboard(filters: DoctorDashboardQueryDTO): Promise<PagedResult<Doctor>> {
		const query = Doctor.query().orderBy('name', 'asc');

		if (filters.tenant_uuid) query.where('tenant_uuid', filters.tenant_uuid);
		if (filters.specialty)   query.where('specialty', filters.specialty);

		if (filters.date_from) query.where('created_at', '>=', filters.date_from);
		if (filters.date_to)   query.where('created_at', '<=', `${filters.date_to} 23:59:59`);

		if (filters.status && filters.status.length) query.whereIn('status', filters.status);

		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			query.where((qb) => {
				qb.where('name', 'ilike', kw)
					.orWhere('license_number', 'ilike', kw)
					.orWhere('specialty', 'ilike', kw);
			});
		}

		return applyPagination<Doctor>(query as any, filters.page_number, filters.page_size);
	}

	async findByUuid(uuid: string): Promise<Doctor | undefined> {
		return Doctor.query().findById(uuid) as unknown as Doctor | undefined;
	}

	async tenantExists(tenant_uuid: string): Promise<boolean> {
		const row = await Tenant.query().findOne({ uuid: tenant_uuid });
		return !!row;
	}

	async create(data: {
		tenant_uuid: string;
		name: string;
		license_number?: string;
		specialty: string;
		esignature_image?: string;
		created_by: string;
	}): Promise<Doctor> {
		return Doctor.query().insertAndFetch({
			tenant_uuid: data.tenant_uuid,
			name: data.name,
			license_number: data.license_number ?? null,
			specialty: data.specialty,
			esignature_image: data.esignature_image ?? null,
			status: 'active',
			created_by: data.created_by,
		} as any) as unknown as Doctor;
	}

	async update(uuid: string, data: Partial<Doctor> & { updated_by: string }): Promise<Doctor | undefined> {
		return Doctor.query().patchAndFetchById(uuid, data as any) as unknown as Doctor | undefined;
	}

	async delete(uuid: string): Promise<{ count: number; removedFile?: string }> {
		const existing = await this.findByUuid(uuid);
		const removed = existing?.esignature_image ?? undefined;
		const count = await Doctor.query().delete().where({ uuid });
		if (count && removed) this.removeEsignatureFile(removed);
		return { count, removedFile: removed };
	}

	async setStatus(uuid: string, status: 'active' | 'inactive', updated_by: string): Promise<Doctor | undefined> {
		return this.update(uuid, { status, updated_by } as any);
	}

	// Same semantics as tenant.removeLogoFile — silently ignores foreign/missing paths.
	removeEsignatureFile(publicPathOrUrl: string): void {
		try {
			const stripped = publicPathOrUrl.replace(/^\/?public\//, '');
			if (!stripped || stripped.includes('..')) return;
			const abs = join(process.cwd(), 'public', stripped);
			if (existsSync(abs)) unlinkSync(abs);
		} catch {
			/* ignore */
		}
	}
}
