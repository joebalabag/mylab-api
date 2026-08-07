import { Injectable } from '@nestjs/common';
import { transaction as objectionTransaction } from 'objection';
import { Tenant } from '../tenant/tenant.model';
import { Patient } from './patient.model';
import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import { PatientDashboardQueryDTO, PatientSearchQueryDTO } from './dto/patient.dto';

@Injectable()
export class PatientService {
	async listDashboard(filters: PatientDashboardQueryDTO): Promise<PagedResult<Patient>> {
		const query = Patient.query().orderBy('created_at', 'desc');

		if (filters.tenant_uuid) query.where('tenant_uuid', filters.tenant_uuid);

		if (filters.date_from) query.where('created_at', '>=', filters.date_from);
		if (filters.date_to) query.where('created_at', '<=', `${filters.date_to} 23:59:59`);

		if (filters.status && filters.status.length) {
			query.whereIn('status', filters.status);
		}

		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			query.where((qb) => {
				qb.where('patient_number', 'ilike', kw)
					.orWhere('first_name', 'ilike', kw)
					.orWhere('middle_name', 'ilike', kw)
					.orWhere('last_name', 'ilike', kw)
					.orWhere('contact_number', 'ilike', kw)
					.orWhere('national_id', 'ilike', kw);
			});
		}

		return applyPagination<Patient>(query as any, filters.page_number, filters.page_size);
	}

	async findByUuid(uuid: string): Promise<Patient | undefined> {
		return Patient.query().findOne({ uuid }) as unknown as Patient | undefined;
	}

	async tenantExists(tenant_uuid: string): Promise<boolean> {
		const row = await Tenant.query().findOne({ uuid: tenant_uuid });
		return !!row;
	}

	/**
	 * Duplicate-check hook the frontend calls before opening the Add form.
	 * Case-insensitive `ILIKE` on name (prefix-friendly), plus an optional
	 * birthdate exact filter for tiebreaking. Tenant-scoped.
	 * Returns up to `limit` rows (default 20, max 100).
	 */
	async search(filters: PatientSearchQueryDTO & { tenant_uuid: string }): Promise<Patient[]> {
		const query = Patient.query()
			.where({ tenant_uuid: filters.tenant_uuid })
			.orderBy([{ column: 'last_name' }, { column: 'first_name' }]);

		if (filters.first_name) query.where('first_name', 'ilike', `${filters.first_name}%`);
		if (filters.last_name) query.where('last_name', 'ilike', `${filters.last_name}%`);
		if (filters.birthdate) query.where('birthdate', filters.birthdate);

		const limit = filters.limit ?? 20;
		return (await query.limit(limit)) as unknown as Patient[];
	}

	/**
	 * Race-safe per-tenant MRN generation. Serializes concurrent creates on
	 * the same tenant via a transaction-scoped Postgres advisory lock —
	 * released automatically at commit/rollback.
	 * Format: `P-` + 6-digit zero-padded sequence (P-000001, P-000002…).
	 */
	async create(data: Partial<Patient> & { tenant_uuid: string; created_by: string }): Promise<Patient> {
		const knex = Patient.knex();
		return objectionTransaction(knex, async (trx) => {
			await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
				`patient-mrn:${data.tenant_uuid}`,
			]);

			const maxRow = (await Patient.query(trx)
				.where({ tenant_uuid: data.tenant_uuid })
				.max('patient_number as max_num')
				.first()) as { max_num?: string } | undefined;

			let next = 1;
			if (maxRow?.max_num) {
				const match = String(maxRow.max_num).match(/(\d+)$/);
				if (match) next = parseInt(match[1], 10) + 1;
			}
			const patient_number = `P-${String(next).padStart(6, '0')}`;

			const inserted = (await Patient.query(trx).insertAndFetch({
				...data,
				patient_number,
				status: (data as any).status || 'active',
			} as any)) as unknown as Patient;
			return inserted;
		});
	}

	async update(uuid: string, data: Partial<Patient> & { updated_by: string }): Promise<Patient | undefined> {
		return Patient.query().patchAndFetchById(uuid, data as any) as unknown as Patient | undefined;
	}

	async delete(uuid: string): Promise<number> {
		return Patient.query().delete().where({ uuid });
	}

	async setStatus(uuid: string, status: 'active' | 'inactive', updated_by: string): Promise<Patient | undefined> {
		return this.update(uuid, { status, updated_by } as any);
	}
}
