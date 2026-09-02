import { BadRequestException, Injectable } from '@nestjs/common';

import { Patient } from '../patient/patient.model';
import { PatientCase } from '../patient-case/patient-case.model';
import { Payment } from '../payment/payment.model';
import { LabReport } from '../lab-report/lab-report.model';

import { PatientService } from '../patient/patient.service';
import { PatientCaseService } from '../patient-case/patient-case.service';
import { PaymentService } from '../payment/payment.service';
import { LabReportService } from '../lab-report/lab-report.service';

import { SyncEntryDTO, SyncEntryResult } from './dto/offline-sync.dto';

/**
 * Dispatches a single sync entry to the appropriate domain service. Every
 * dispatch method is idempotent by (tenant_uuid, client_uuid): if a row with
 * the same client_uuid already exists in the target table, the dispatcher
 * returns it as `duplicate` instead of creating another. The idempotency-key
 * table gives us a first line of defense; this client_uuid check is the
 * belt-and-braces backstop for the case where the key has expired but the
 * client still retries.
 */
@Injectable()
export class SyncDispatcherService {
	constructor(
		private readonly patients: PatientService,
		private readonly cases: PatientCaseService,
		private readonly payments: PaymentService,
		private readonly labReports: LabReportService,
	) {}

	async dispatch(
		entry: SyncEntryDTO,
		ctx: { tenant_uuid: string; acting_user_name: string },
	): Promise<Omit<SyncEntryResult, 'entity_type' | 'client_uuid' | 'idempotency_key'>> {
		switch (entry.entity_type) {
			case 'patient':          return this.syncPatient(entry, ctx);
			case 'patient_case':     return this.syncPatientCase(entry, ctx);
			case 'payment':          return this.syncPayment(entry, ctx);
			case 'lab_report_results': return this.syncLabReportResults(entry, ctx);
			default:
				return { status: 'error', error: `Unknown entity_type '${(entry as any).entity_type}'` };
		}
	}

	private async syncPatient(
		entry: SyncEntryDTO,
		ctx: { tenant_uuid: string; acting_user_name: string },
	) {
		const existing = (await Patient.query()
			.findOne({ tenant_uuid: ctx.tenant_uuid, client_uuid: entry.client_uuid })) as unknown as Patient | undefined;
		if (existing) {
			return { status: 'duplicate' as const, server_uuid: existing.uuid, server_row: existing };
		}
		try {
			const row = await this.patients.create({
				...(entry.payload as any),
				// Use the client_uuid as the row's server-side uuid. Without this
				// the server would mint a fresh uuid, and the next /pull would
				// return the row keyed by that uuid — leaving the client with a
				// second Dexie row (original client_uuid + new server uuid) for
				// the same real record. Passing uuid keeps a 1:1 mapping.
				uuid: entry.client_uuid,
				tenant_uuid: ctx.tenant_uuid,
				created_by: ctx.acting_user_name,
				client_uuid: entry.client_uuid,
				created_offline_at: entry.created_offline_at,
			});
			return { status: 'ok' as const, server_uuid: row.uuid, server_row: row };
		} catch (err: any) {
			return { status: 'error' as const, error: err?.message || 'patient create failed' };
		}
	}

	private async syncPatientCase(
		entry: SyncEntryDTO,
		ctx: { tenant_uuid: string; acting_user_name: string },
	) {
		const existing = (await PatientCase.query()
			.findOne({ tenant_uuid: ctx.tenant_uuid, client_uuid: entry.client_uuid })) as unknown as PatientCase | undefined;
		if (existing) {
			return { status: 'duplicate' as const, server_uuid: existing.uuid, server_row: existing };
		}
		try {
			// The device may pass a still-pending patient client_uuid instead of
			// the server-side patient uuid — resolve it here.
			const payload = entry.payload as any;
			const patient_uuid = await this.resolvePatientUuid(ctx.tenant_uuid, payload.patient_uuid);
			const row = await this.cases.create({
				// See uuid comment in syncPatient — same reason: keep the local
				// Dexie row and the server row on a single primary key.
				uuid: entry.client_uuid,
				tenant_uuid: ctx.tenant_uuid,
				patient_uuid,
				case_type: payload.case_type,
				admission_date: payload.admission_date,
				chief_complaint: payload.chief_complaint ?? null,
				attending_physician: payload.attending_physician ?? null,
				referring_physician: payload.referring_physician ?? null,
				notes: payload.notes ?? null,
				created_by: ctx.acting_user_name,
				client_uuid: entry.client_uuid,
				created_offline_at: entry.created_offline_at,
			});
			return { status: 'ok' as const, server_uuid: row.uuid, server_row: row };
		} catch (err: any) {
			return { status: 'error' as const, error: err?.message || 'patient_case create failed' };
		}
	}

	private async syncPayment(
		entry: SyncEntryDTO,
		ctx: { tenant_uuid: string; acting_user_name: string },
	) {
		const existing = (await Payment.query()
			.findOne({ tenant_uuid: ctx.tenant_uuid, client_uuid: entry.client_uuid })) as unknown as Payment | undefined;
		if (existing) {
			return { status: 'duplicate' as const, server_uuid: existing.uuid, server_row: existing };
		}
		try {
			const payload = entry.payload as any;
			// Same patient_case_uuid resolution — a payment offline may reference
			// a case that itself was created offline earlier in the same session.
			const patient_case_uuid = await this.resolveCaseUuid(ctx.tenant_uuid, payload.patient_case_uuid);
			const row = await this.payments.createPayment({
				...payload,
				// See uuid comment in syncPatient — same reason: keep the local
				// Dexie row and the server row on a single primary key.
				uuid: entry.client_uuid,
				patient_case_uuid,
				tenant_uuid: ctx.tenant_uuid,
				created_by: ctx.acting_user_name,
				client_uuid: entry.client_uuid,
				created_offline_at: entry.created_offline_at,
			});
			return { status: 'ok' as const, server_uuid: row.uuid, server_row: row };
		} catch (err: any) {
			// Over-payment / already-paid / etc. surface as conflict, not error —
			// the sync UI can offer to open the record for manual review.
			const msg = String(err?.message || 'payment create failed');
			const isConflict = /already paid|over|tenant|finalized/i.test(msg);
			return { status: (isConflict ? 'conflict' : 'error') as 'conflict' | 'error', error: msg };
		}
	}

	private async syncLabReportResults(
		entry: SyncEntryDTO,
		ctx: { tenant_uuid: string; acting_user_name: string },
	) {
		// For lab_report_results the client_uuid IS the lab_report_uuid (updates,
		// not inserts). We rely on idempotency keys to dedupe repeated updates.
		try {
			const payload = entry.payload as any;
			const row = await this.labReports.updateResults(
				entry.client_uuid,
				payload,
				{ name: ctx.acting_user_name },
			);
			// Best-effort audit stamp — record offline provenance on the parent
			// report so we can bucket "results captured offline" in reporting.
			await LabReport.query()
				.patch({ created_offline_at: entry.created_offline_at as any } as any)
				.where({ uuid: entry.client_uuid, tenant_uuid: ctx.tenant_uuid })
				.whereNull('created_offline_at');
			return { status: 'ok' as const, server_uuid: row.uuid, server_row: row };
		} catch (err: any) {
			return { status: 'error' as const, error: err?.message || 'lab_report results update failed' };
		}
	}

	// ── UUID resolution helpers ────────────────────────────────────────────
	// A device sending a batch may include entries whose payloads point at
	// records still queued earlier in the same batch. The dispatcher processes
	// entries in order, so by the time a child arrives its parent is on disk —
	// look up by (tenant, client_uuid) first, fall back to (tenant, uuid).

	private async resolvePatientUuid(tenant_uuid: string, uuid: string): Promise<string> {
		if (!uuid) throw new BadRequestException('patient_uuid required.');
		const byClient = (await Patient.query()
			.findOne({ tenant_uuid, client_uuid: uuid })) as unknown as Patient | undefined;
		if (byClient) return byClient.uuid;
		const byServer = (await Patient.query()
			.findOne({ tenant_uuid, uuid })) as unknown as Patient | undefined;
		if (byServer) return byServer.uuid;
		throw new BadRequestException(`Patient ${uuid} not found for tenant.`);
	}

	private async resolveCaseUuid(tenant_uuid: string, uuid: string): Promise<string> {
		if (!uuid) throw new BadRequestException('patient_case_uuid required.');
		const byClient = (await PatientCase.query()
			.findOne({ tenant_uuid, client_uuid: uuid })) as unknown as PatientCase | undefined;
		if (byClient) return byClient.uuid;
		const byServer = (await PatientCase.query()
			.findOne({ tenant_uuid, uuid })) as unknown as PatientCase | undefined;
		if (byServer) return byServer.uuid;
		throw new BadRequestException(`Patient case ${uuid} not found for tenant.`);
	}
}
