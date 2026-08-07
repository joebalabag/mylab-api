import { BadRequestException, Injectable } from '@nestjs/common';
import { transaction as objectionTransaction } from 'objection';
import { Tenant } from '../tenant/tenant.model';
import { Patient } from '../patient/patient.model';
import { PatientCase, CaseType } from './patient-case.model';
import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';
import { PatientCaseDashboardQueryDTO } from './dto/patient-case.dto';

export interface PatientCaseWithPatient extends PatientCase {
	patient_number?: string | null;
	patient_first_name?: string | null;
	patient_middle_name?: string | null;
	patient_last_name?: string | null;
	patient_suffix?: string | null;
	patient_sex?: string | null;
	patient_birthdate?: Date | string | null;
}

@Injectable()
export class PatientCaseService {
	async listDashboard(
		filters: PatientCaseDashboardQueryDTO,
	): Promise<PagedResult<PatientCaseWithPatient>> {
		const query = PatientCase.query()
			.alias('pc')
			.leftJoin('patients as p', 'p.uuid', 'pc.patient_uuid')
			.select(
				'pc.*',
				'p.patient_number as patient_number',
				'p.first_name as patient_first_name',
				'p.middle_name as patient_middle_name',
				'p.last_name as patient_last_name',
				'p.suffix as patient_suffix',
				'p.sex as patient_sex',
				'p.birthdate as patient_birthdate',
			)
			.orderBy('pc.admission_date', 'desc');

		if (filters.tenant_uuid) query.where('pc.tenant_uuid', filters.tenant_uuid);
		if (filters.patient_uuid) query.where('pc.patient_uuid', filters.patient_uuid);
		if (filters.case_type) query.where('pc.case_type', filters.case_type);

		if (filters.date_from) query.where('pc.admission_date', '>=', filters.date_from);
		if (filters.date_to) query.where('pc.admission_date', '<=', `${filters.date_to} 23:59:59`);

		if (filters.status && filters.status.length) {
			query.whereIn('pc.status', filters.status);
		}

		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			query.where((qb) => {
				qb.where('pc.case_number', 'ilike', kw)
					.orWhere('p.patient_number', 'ilike', kw)
					.orWhere('p.first_name', 'ilike', kw)
					.orWhere('p.last_name', 'ilike', kw)
					.orWhere('pc.chief_complaint', 'ilike', kw);
			});
		}

		return applyPagination<PatientCaseWithPatient>(query as any, filters.page_number, filters.page_size);
	}

	async findByUuid(uuid: string): Promise<PatientCaseWithPatient | undefined> {
		const row = await PatientCase.query()
			.alias('pc')
			.leftJoin('patients as p', 'p.uuid', 'pc.patient_uuid')
			.select(
				'pc.*',
				'p.patient_number as patient_number',
				'p.first_name as patient_first_name',
				'p.middle_name as patient_middle_name',
				'p.last_name as patient_last_name',
				'p.suffix as patient_suffix',
				'p.sex as patient_sex',
				'p.birthdate as patient_birthdate',
			)
			.findOne({ 'pc.uuid': uuid });
		return row as unknown as PatientCaseWithPatient | undefined;
	}

	async tenantExists(tenant_uuid: string): Promise<boolean> {
		const row = await Tenant.query().findOne({ uuid: tenant_uuid });
		return !!row;
	}

	/** Confirms the patient belongs to the tenant. */
	async findPatientInTenant(patient_uuid: string, tenant_uuid: string): Promise<Patient | undefined> {
		return Patient.query().findOne({ uuid: patient_uuid, tenant_uuid }) as unknown as Patient | undefined;
	}

	/**
	 * Race-safe per-(tenant, case_type) case_number generation. Serializes
	 * concurrent creates on the same tenant+type via a transaction-scoped
	 * advisory lock. Format: "<TYPE>-NNNNNN" (OPD-000001).
	 */
	async create(data: {
		tenant_uuid: string;
		patient_uuid: string;
		case_type?: CaseType;
		admission_date?: string | Date;
		discharge_date?: string | Date | null;
		chief_complaint?: string | null;
		attending_physician?: string | null;
		referring_physician?: string | null;
		notes?: string | null;
		created_by: string;
	}): Promise<PatientCase> {
		const case_type: CaseType = (data.case_type as CaseType) || 'OPD';
		const knex = PatientCase.knex();
		return objectionTransaction(knex, async (trx) => {
			await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
				`patient-case:${data.tenant_uuid}:${case_type}`,
			]);

			const maxRow = (await PatientCase.query(trx)
				.where({ tenant_uuid: data.tenant_uuid, case_type })
				.max('case_number as max_num')
				.first()) as { max_num?: string } | undefined;

			let next = 1;
			if (maxRow?.max_num) {
				const match = String(maxRow.max_num).match(/(\d+)$/);
				if (match) next = parseInt(match[1], 10) + 1;
			}
			const case_number = `${case_type}-${String(next).padStart(6, '0')}`;

			const inserted = (await PatientCase.query(trx).insertAndFetch({
				tenant_uuid: data.tenant_uuid,
				patient_uuid: data.patient_uuid,
				case_number,
				case_type,
				admission_date: (data.admission_date as any) ?? new Date(),
				discharge_date: (data.discharge_date as any) ?? null,
				chief_complaint: data.chief_complaint ?? null,
				attending_physician: data.attending_physician ?? null,
				referring_physician: data.referring_physician ?? null,
				notes: data.notes ?? null,
				status: 'open',
				created_by: data.created_by,
			} as any)) as unknown as PatientCase;
			return inserted;
		});
	}

	async update(
		uuid: string,
		data: Partial<PatientCase> & { updated_by: string },
	): Promise<PatientCase | undefined> {
		// case_number is server-generated and immutable once assigned.
		const { case_number: _drop, ...rest } = data as any;
		return PatientCase.query().patchAndFetchById(uuid, rest as any) as unknown as PatientCase | undefined;
	}

	async delete(uuid: string): Promise<number> {
		return PatientCase.query().delete().where({ uuid });
	}

	async setStatus(uuid: string, status: string, updated_by: string) {
		if (!['open', 'closed', 'cancelled'].includes(status)) {
			throw new BadRequestException('Invalid status.');
		}
		return this.update(uuid, { status, updated_by } as any);
	}
}
