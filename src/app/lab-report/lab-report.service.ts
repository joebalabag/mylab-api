import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { transaction as objectionTransaction } from 'objection';
import { createHmac, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { PatientRequisition } from '../patient-requisition/patient-requisition.model';
import { PatientRequisitionItem } from '../patient-requisition/patient-requisition-item.model';
import { TestItem } from '../test-item/test-item.model';
import { TestItemComponent } from '../test-item/test-item-component.model';
import { ItemCategory } from '../item-category/item-category.model';
import * as ejs from 'ejs';
import * as QRCode from 'qrcode';

import { UserService } from '../user/user.service';
import { MailerService, SmtpOverride } from '@/common/mailer/mailer.service';
import { renderHtmlToPdf } from '@/common/pdf/html-pdf.util';
import { decryptSecret } from '@/common/crypto/aes.util';
import { applyPagination, PagedResult } from '@/common/helpers/pagination.helper';

import { LabReport, LabReportStatus } from './lab-report.model';
import { LabReportItem } from './lab-report-item.model';
import { LabResultValue } from './lab-result-value.model';
import {
	CreateLabReportBatchDTO,
	LabReportDashboardQueryDTO,
	UpdateLabReportResultsDTO,
} from './dto/lab-report.dto';

export interface LabReportWithMeta extends LabReport {
	patient_number?: string | null;
	patient_first_name?: string | null;
	patient_last_name?: string | null;
	patient_sex?: string | null;
	patient_birthdate?: Date | string | null;
	patient_civil_status?: string | null;
	// Snapshotted so the frontend can decide whether to auto-email the
	// finalized result PDF (empty → skip send).
	patient_email?: string | null;
	// Comma-joined single-line address built from the patient's structured
	// address columns — printed on the lab report header.
	patient_address?: string | null;
	requisition_number?: string | null;
	// Referring physician, snapshotted from the requisition that owns this
	// lab report. Printed on the report header.
	physician?: string | null;
	patient_case_number?: string | null;
	item_category_color?: string | null;
	item_category_print_title?: string | null;
	item_category_print_template?: string | null;
	item_category_print_paper_size?: string | null;
	item_group_tester_role?: string | null;
	item_count?: number;
	items?: (LabReportItem & { values?: LabResultValue[] })[];
	// Signed, stateless token embedded in the QR code. Verifying re-derives
	// the HMAC with JWT_SECRET — no DB lookup or storage required.
	public_token?: string;
}

const PUBLIC_TOKEN_SECRET = () => process.env.JWT_SECRET || 'super-secret-change-me';

function b64urlEncode(buf: Buffer): string {
	return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function b64urlDecode(str: string): Buffer {
	const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
	return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

/**
 * Stateless "share link" token for a lab report. Format `<uuidB64>.<sigB64>`
 * where sig = HMAC-SHA256(uuid, JWT_SECRET). No expiry — reports are meant to
 * stay verifiable long-term; rotating JWT_SECRET invalidates every token.
 */
export function signLabReportPublicToken(uuid: string): string {
	const uuidBuf = Buffer.from(uuid, 'utf8');
	const sig = createHmac('sha256', PUBLIC_TOKEN_SECRET()).update(uuidBuf).digest();
	return `${b64urlEncode(uuidBuf)}.${b64urlEncode(sig)}`;
}
export function verifyLabReportPublicToken(token: string): string | null {
	if (!token || typeof token !== 'string' || !token.includes('.')) return null;
	const [uuidPart, sigPart] = token.split('.', 2);
	try {
		const uuidBuf = b64urlDecode(uuidPart);
		const sigBuf = b64urlDecode(sigPart);
		const expected = createHmac('sha256', PUBLIC_TOKEN_SECRET()).update(uuidBuf).digest();
		if (sigBuf.length !== expected.length) return null;
		if (!timingSafeEqual(sigBuf, expected)) return null;
		return uuidBuf.toString('utf8');
	} catch {
		return null;
	}
}

/**
 * Requisition-item view used by the "Add Laboratory" second modal. Includes
 * every paid, uncovered test_item line on a requisition alongside the
 * category snapshot needed for default grouping. Package lines (source_type =
 * item_package) are ignored — they were exploded into per-test rows at
 * requisition time and their child rows appear here as source_type=test_item.
 */
export interface UncoveredRequisitionItem {
	uuid: string;
	patient_requisition_uuid: string;
	source_uuid: string;             // test_item uuid
	test_code: string;
	test_name: string;
	unit_price: number;
	quantity: number;
	item_category_uuid: string | null;
	item_category_code: string | null;
	item_category_name: string | null;
	combine_printout: boolean;
	result_type: string | null;
}

@Injectable()
export class LabReportService {
	private readonly logger = new Logger(LabReportService.name);

	constructor(
		private readonly userService: UserService,
		private readonly mailer: MailerService,
	) {}

	async listDashboard(filters: LabReportDashboardQueryDTO): Promise<PagedResult<LabReportWithMeta>> {
		const query = LabReport.query()
			.alias('lr')
			.leftJoin('patients as p', 'p.uuid', 'lr.patient_uuid')
			.leftJoin('patient_requisitions as pr', 'pr.uuid', 'lr.patient_requisition_uuid')
			.leftJoin('patient_cases as pc', 'pc.uuid', 'lr.patient_case_uuid')
			.leftJoin('item_categories as ic', 'ic.uuid', 'lr.item_category_uuid')
			.leftJoin('item_groups as ig', 'ig.uuid', 'ic.item_group_uuid')
			.select(
				'lr.*',
				'p.patient_number as patient_number',
				'p.first_name as patient_first_name',
				'p.last_name as patient_last_name',
				'p.sex as patient_sex',
				'p.birthdate as patient_birthdate',
				'p.civil_status as patient_civil_status',
				'p.email as patient_email',
				LabReport.knex().raw(
					// Empty strings → NULL so CONCAT_WS skips them; result is
					// NULL (not "") when every part is blank.
					`NULLIF(CONCAT_WS(', ',
						NULLIF(p.address_street1, ''),
						NULLIF(p.address_street2, ''),
						NULLIF(p.city, ''),
						NULLIF(p.province, '')
					), '') AS patient_address`,
				),
				'pr.requisition_number as requisition_number',
				'pr.physician as physician',
				'pc.case_number as patient_case_number',
				'ic.color as item_category_color',
				'ic.print_title as item_category_print_title',
				'ic.print_template as item_category_print_template',
				'ic.print_paper_size as item_category_print_paper_size',
				'ig.tester_role as item_group_tester_role',
				LabReport.knex().raw(
					'(SELECT COUNT(*) FROM lab_report_items lri WHERE lri.lab_report_uuid = lr.uuid) AS item_count',
				),
			)
			.orderBy('lr.created_at', 'desc');

		if (filters.tenant_uuid) query.where('lr.tenant_uuid', filters.tenant_uuid);
		if (filters.patient_uuid) query.where('lr.patient_uuid', filters.patient_uuid);
		if (filters.patient_requisition_uuid) query.where('lr.patient_requisition_uuid', filters.patient_requisition_uuid);
		if (filters.item_category_uuid) query.where('lr.item_category_uuid', filters.item_category_uuid);
		if (filters.item_group_uuid) query.where('ic.item_group_uuid', filters.item_group_uuid);

		if (filters.date_from) query.where('lr.created_at', '>=', filters.date_from);
		if (filters.date_to) query.where('lr.created_at', '<=', `${filters.date_to} 23:59:59`);
		if (filters.status && filters.status.length) query.whereIn('lr.status', filters.status);

		if (filters.keywords) {
			const kw = `%${filters.keywords}%`;
			query.where((qb) => {
				qb.where('lr.lab_number', 'ilike', kw)
					.orWhere('pr.requisition_number', 'ilike', kw)
					.orWhere('p.patient_number', 'ilike', kw)
					.orWhere('p.first_name', 'ilike', kw)
					.orWhere('p.last_name', 'ilike', kw);
			});
		}

		return applyPagination<LabReportWithMeta>(query as any, filters.page_number, filters.page_size);
	}

	async findByUuid(uuid: string): Promise<LabReportWithMeta | undefined> {
		const parent = (await LabReport.query()
			.alias('lr')
			.leftJoin('patients as p', 'p.uuid', 'lr.patient_uuid')
			.leftJoin('patient_requisitions as pr', 'pr.uuid', 'lr.patient_requisition_uuid')
			.leftJoin('patient_cases as pc', 'pc.uuid', 'lr.patient_case_uuid')
			.leftJoin('item_categories as ic', 'ic.uuid', 'lr.item_category_uuid')
			.leftJoin('item_groups as ig', 'ig.uuid', 'ic.item_group_uuid')
			// Live-join the pathologist's current e-signature from the doctors
			// table. Previously we snapshotted this onto lab_reports at finalize
			// time, but the operator prefers a single source of truth — updating
			// the doctor's signature immediately reflects on their reports.
			.leftJoin('doctors as pd', 'pd.uuid', 'lr.pathologist_uuid')
			.select(
				'lr.*',
				'p.patient_number as patient_number',
				'p.first_name as patient_first_name',
				'p.last_name as patient_last_name',
				'p.sex as patient_sex',
				'p.birthdate as patient_birthdate',
				'p.civil_status as patient_civil_status',
				'p.email as patient_email',
				LabReport.knex().raw(
					// Empty strings → NULL so CONCAT_WS skips them; result is
					// NULL (not "") when every part is blank.
					`NULLIF(CONCAT_WS(', ',
						NULLIF(p.address_street1, ''),
						NULLIF(p.address_street2, ''),
						NULLIF(p.city, ''),
						NULLIF(p.province, '')
					), '') AS patient_address`,
				),
				'pr.requisition_number as requisition_number',
				'pr.physician as physician',
				'pc.case_number as patient_case_number',
				'ic.color as item_category_color',
				'ic.print_title as item_category_print_title',
				'ic.print_template as item_category_print_template',
				'ic.print_paper_size as item_category_print_paper_size',
				'ig.tester_role as item_group_tester_role',
				'pd.esignature_image as pathologist_esignature_image',
			)
			.findOne({ 'lr.uuid': uuid })) as unknown as LabReportWithMeta | undefined;
		if (!parent) return undefined;

		const items = (await LabReportItem.query()
			.where({ lab_report_uuid: uuid })
			.orderBy([
				{ column: 'display_order', order: 'asc' },
				{ column: 'created_at', order: 'asc' },
			])) as unknown as LabReportItem[];

		const values = items.length
			? ((await LabResultValue.query()
					.whereIn(
						'lab_report_item_uuid',
						items.map((i) => i.uuid),
					)
					.orderBy([
						{ column: 'display_order', order: 'asc' },
						{ column: 'created_at', order: 'asc' },
					])) as unknown as LabResultValue[])
			: [];
		const valuesByItem = new Map<string, LabResultValue[]>();
		for (const v of values) {
			const arr = valuesByItem.get(v.lab_report_item_uuid) || [];
			arr.push(v);
			valuesByItem.set(v.lab_report_item_uuid, arr);
		}

		return {
			...(parent as any),
			items: items.map((it) => ({ ...it, values: valuesByItem.get(it.uuid) || [] })),
			public_token: signLabReportPublicToken(parent.uuid),
		} as LabReportWithMeta;
	}

	/**
	 * Server-render the public lab report as self-contained HTML. Verifies
	 * the token, loads report + tenant, generates the QR code as a data URL,
	 * then executes the EJS template. Keeps the JSON payload off the
	 * recipient's Network tab: browsers see only the rendered HTML.
	 * Returns null on unknown / invalid tokens so the controller can 404.
	 */
	async renderPublicHtml(token: string): Promise<string | null> {
		const report = await this.findByPublicToken(token);
		if (!report) return null;
		const tenant = report.tenant || {};
		const frontendOrigin = (process.env.FRONTEND_ORIGIN
			|| (process.env.NODE_ENV === 'local' ? 'http://localhost:5173' : ''))
			.replace(/\/+$/, '');
		const apiOrigin = (process.env.API_ORIGIN || '').replace(/\/+$/, '');

		// Public-share URL the QR points at. Same string the operator's Print
		// Preview encodes — a recipient scanning the printed QR lands here.
		const publicUrl = frontendOrigin
			? `${frontendOrigin}/lab/view?t=${encodeURIComponent(token)}`
			: '';
		let qrDataUrl = '';
		if (publicUrl) {
			try {
				qrDataUrl = await QRCode.toDataURL(publicUrl, { margin: 0, width: 128, errorCorrectionLevel: 'M' });
			} catch (err: any) {
				this.logger.warn(`Failed to generate QR for public render: ${err?.message}`);
			}
		}

		// Header company name = first non-blank line of labHeaderText; fall
		// back to tenant display name. Matches LabReportPrintable's rule.
		const rawHeaderText = String(tenant.lab_header_text || '');
		const headerLines = rawHeaderText.split(/\r?\n/);
		const headerCompanyName = headerLines.find((l: string) => l.trim().length > 0) || tenant.display_name || '';
		let dropped = false;
		const restLinesArr: string[] = [];
		for (const l of headerLines) {
			if (!dropped && l.trim().length > 0) { dropped = true; continue; }
			if (dropped) restLinesArr.push(l);
		}
		const headerRestLines = restLinesArr.join('\n').trim();

		// Assets served through the API's /public/ mount. When frontend
		// nginx proxies /public/ back to the API, relative paths work in
		// production; for cross-origin fetches during dev we prefer absolute.
		const publicAsset = (p: string | undefined | null): string => {
			if (!p) return '';
			const clean = String(p).replace(/^\/+/, '');
			if (apiOrigin) return `${apiOrigin}/public/${clean}`;
			return `/public/${clean}`;
		};
		const tenantForTemplate = {
			name:            tenant.display_name || tenant.legal_name || '',
			logo:            publicAsset(tenant.company_logo),
			labHeaderMode:   tenant.lab_header_mode || 'logo_text',
			labHeaderImage:  publicAsset(tenant.lab_header_image),
		};

		// Chemistry-flat rule mirrors LabReportPrintable — chem panels get
		// one continuous analyte table instead of per-item blocks.
		const isChemistryFlat = (report.item_category_code || '') === 'CHEM';
		const anyUnitAcross = (report.items || []).some((it: any) =>
			(it.values || []).some((v: any) => !!(v.unit_of_measure && String(v.unit_of_measure).trim())),
		);
		const anyReferenceAcross = (report.items || []).some((it: any) =>
			(it.values || []).some((v: any) => !!(v.reference_range && String(v.reference_range).trim())),
		);

		// SI conversion helpers — mirror LabReportPrintable's `hasSi` / `siValue`
		// so the public HTML view matches the operator-side print exactly.
		const hasSi = (v: any): boolean => {
			const f = v?.si_conversion_factor;
			return f !== null && f !== undefined && f !== '' && !Number.isNaN(Number(f));
		};
		const anySiAcross = (report.items || []).some((it: any) =>
			(it.values || []).some((v: any) => hasSi(v)),
		);
		const siValue = (v: any): string => {
			if (!hasSi(v)) return '';
			const raw = String(v?.value_text ?? '').trim();
			const num = Number(raw);
			if (raw === '' || Number.isNaN(num)) return '';
			const factor = Number(v.si_conversion_factor);
			const converted = num * factor;
			const abs = Math.abs(converted);
			const decimals = abs >= 100 ? 1 : abs >= 10 ? 2 : abs >= 1 ? 3 : 4;
			return converted
				.toFixed(decimals)
				.replace(/(\.\d*?)0+$/, '$1')
				.replace(/\.$/, '');
		};

		// Colored category-band border + fill (8% alpha over the hex).
		const rawColor = String(report.item_category_color || '#64748b').trim();
		const hexMatch = /^#([0-9a-f]{6})$/i.exec(rawColor);
		const categoryColor = rawColor;
		let categoryFill = 'rgba(100, 116, 139, 0.08)';
		if (hexMatch) {
			const r = parseInt(hexMatch[1].slice(0, 2), 16);
			const g = parseInt(hexMatch[1].slice(2, 4), 16);
			const b = parseInt(hexMatch[1].slice(4, 6), 16);
			categoryFill = `rgba(${r}, ${g}, ${b}, 0.08)`;
		}

		// Manila-locale datetimes for the human-facing fields.
		const fmtDT = (v: any): string => {
			if (!v) return '';
			try {
				const d = v instanceof Date ? v : new Date(v);
				if (isNaN(d.getTime())) return '';
				return d.toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
			} catch { return ''; }
		};

		// Detailed "11Y-5M-4D" age string — same rule as the frontend.
		const ageStr = (() => {
			const bd = report.patient_birthdate;
			if (!bd) return '';
			const d = bd instanceof Date ? bd : new Date(bd as any);
			if (isNaN(d.getTime())) return '';
			const now = new Date();
			let years = now.getFullYear() - d.getFullYear();
			let months = now.getMonth() - d.getMonth();
			let days = now.getDate() - d.getDate();
			if (days < 0) {
				months--;
				const prevMonthLen = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
				days += prevMonthLen;
			}
			if (months < 0) { years--; months += 12; }
			return `${years}Y-${months}M-${days}D`;
		})();

		// Sex → title-case (m / male / MALE → Male).
		const sexStr = (() => {
			const raw = String(report.patient_sex || '').trim().toLowerCase();
			if (!raw) return '';
			if (raw === 'm' || raw === 'male') return 'Male';
			if (raw === 'f' || raw === 'female') return 'Female';
			return raw.charAt(0).toUpperCase() + raw.slice(1);
		})();

		const patientName = [report.patient_first_name, report.patient_last_name].filter(Boolean).join(' ');

		const locals = {
			report,
			tenant: tenantForTemplate,
			qrDataUrl,
			publicUrl,
			headerCompanyName,
			headerRestLines,
			isChemistryFlat,
			anyUnitAcross,
			anyReferenceAcross,
			anySiAcross,
			hasSi,
			siValue,
			categoryColor,
			categoryFill,
			patientName,
			ageStr,
			sexStr,
			specimenCollectedAtFmt: fmtDT(report.specimen_collected_at),
			finalizedAtFmt: fmtDT(report.finalized_at),
			printedAtFmt: fmtDT(new Date()),
			// Panel value grouping (mirror of LabReportPrintable.groupValuesBySection).
			groupValuesBySection: (values: any[]): Array<{ section: string; values: any[] }> => {
				if (!Array.isArray(values) || !values.length) return [];
				const map = new Map<string, any[]>();
				const order: string[] = [];
				for (const v of values) {
					const key = v.section || '';
					if (!map.has(key)) { map.set(key, []); order.push(key); }
					map.get(key)!.push(v);
				}
				return order.map((k) => ({ section: k, values: map.get(k)! }));
			},
			// Matrix rows × cols with a plain object keyed "row|col" for EJS
			// (no Map interop in EJS scriptlets).
			buildMatrixGrid: (it: any): { rows: string[]; cols: string[]; cells: Record<string, any> } => {
				const cfg = it?.matrix_config || {};
				const rows = Array.isArray(cfg.rows) ? cfg.rows : [];
				const cols = Array.isArray(cfg.cols) ? cfg.cols : [];
				const cells: Record<string, any> = {};
				for (const v of (it.values || [])) cells[String(v.component_code)] = v;
				return { rows, cols, cells };
			},
		};

		const templatePath = path.join(__dirname, 'templates', 'public-lab-report.ejs');
		const html = await ejs.renderFile(templatePath, locals, { async: true });
		return html;
	}

	// Public (no-auth) variant used by the QR-code landing page. Verifies the
	// signed token then reuses the standard findByUuid loader. Tenant meta
	// (name/logo/header) is joined in so the public page can render the same
	// header as the authenticated print preview.
	async findByPublicToken(token: string): Promise<any | undefined> {
		const uuid = verifyLabReportPublicToken(token);
		if (!uuid) return undefined;
		const report = await this.findByUuid(uuid);
		if (!report) return undefined;
		const tenant = (await LabReport.knex()('tenants')
			.select('display_name', 'legal_name', 'company_logo', 'lab_header_mode', 'lab_header_image', 'lab_header_text')
			.where({ uuid: report.tenant_uuid })
			.first()) as any;
		return { ...report, tenant };
	}

	/**
	 * Requisitions eligible for the Add Laboratory picker. A requisition is
	 * eligible when it is fully paid (status='paid') and at least one of its
	 * test_item lines is NOT already covered by a non-voided lab_report_item.
	 * The frontend uses this to power step 1 of the modal.
	 */
	async listEligibleRequisitions(tenant_uuid: string, keywords?: string, item_group_uuid?: string): Promise<any[]> {
		const knex = PatientRequisition.knex();
		const kw = keywords ? `%${keywords}%` : null;

		const q = knex('patient_requisitions as pr')
			.leftJoin('patients as p', 'p.uuid', 'pr.patient_uuid')
			.leftJoin('patient_cases as pc', 'pc.uuid', 'pr.patient_case_uuid')
			.where('pr.tenant_uuid', tenant_uuid)
			.andWhere('pr.status', 'paid');

		// When an item_group filter is active, keep only requisitions that
		// have at least one uncovered test_item under a category in that group.
		if (item_group_uuid) {
			q.whereExists(function () {
				this.select(knex.raw('1'))
					.from('patient_requisition_items as pri')
					.join('test_items as ti', 'ti.uuid', 'pri.source_uuid')
					.join('item_categories as ic', 'ic.uuid', 'ti.item_category_uuid')
					.whereRaw('pri.patient_requisition_uuid = pr.uuid')
					.andWhere('pri.source_type', 'test_item')
					.andWhereRaw('pri.payment_uuid IS NOT NULL')
					.andWhere('ic.item_group_uuid', item_group_uuid)
					.andWhere(function () {
						this.whereNotExists(function () {
							this.select(knex.raw('1'))
								.from('lab_report_items as lri')
								.whereRaw('lri.patient_requisition_item_uuid = pri.uuid')
								.andWhere('lri.is_active', true);
						});
					});
			});
		}

		const rows = await q
			.select(
				'pr.uuid as patient_requisition_uuid',
				'pr.requisition_number',
				'pr.requisition_date',
				'pr.created_by as requested_by',
				'pr.patient_uuid',
				'pr.patient_case_uuid',
				'p.patient_number',
				'p.first_name as patient_first_name',
				'p.last_name as patient_last_name',
				'pc.case_number as patient_case_number',
				knex.raw(`(
					SELECT COUNT(*) FROM patient_requisition_items pri
					WHERE pri.patient_requisition_uuid = pr.uuid
					  AND pri.source_type = 'test_item'
					  AND pri.payment_uuid IS NOT NULL
					  AND NOT EXISTS (
						SELECT 1 FROM lab_report_items lri
						WHERE lri.patient_requisition_item_uuid = pri.uuid
						  AND lri.is_active = true
					  )
				)::int AS uncovered_count`),
				// Distinct item_category names for the uncovered lines. Used by
				// the "Choose Requisition" modal so the operator can see which
				// panels are still pending before picking a requisition.
				knex.raw(`(
					SELECT string_agg(x.name, ', ') FROM (
						SELECT DISTINCT ic.name
						FROM patient_requisition_items pri
						JOIN test_items ti ON ti.uuid = pri.source_uuid
						LEFT JOIN item_categories ic ON ic.uuid = ti.item_category_uuid
						WHERE pri.patient_requisition_uuid = pr.uuid
						  AND pri.source_type = 'test_item'
						  AND pri.payment_uuid IS NOT NULL
						  AND ic.name IS NOT NULL
						  AND NOT EXISTS (
							SELECT 1 FROM lab_report_items lri
							WHERE lri.patient_requisition_item_uuid = pri.uuid
							  AND lri.is_active = true
						  )
						ORDER BY ic.name
					) x
				) AS uncovered_categories`),
				// Test-item names for every uncovered line (in requisition-line
				// order). Same predicate as uncovered_count / uncovered_categories.
				knex.raw(`(
					SELECT string_agg(pri.name, ', ' ORDER BY pri.display_order, pri.created_at)
					FROM patient_requisition_items pri
					WHERE pri.patient_requisition_uuid = pr.uuid
					  AND pri.source_type = 'test_item'
					  AND pri.payment_uuid IS NOT NULL
					  AND NOT EXISTS (
						SELECT 1 FROM lab_report_items lri
						WHERE lri.patient_requisition_item_uuid = pri.uuid
						  AND lri.is_active = true
					  )
				) AS uncovered_items`),
			)
			.orderBy('pr.requisition_date', 'desc')
			.limit(200);

		let out = rows.filter((r: any) => Number(r.uncovered_count || 0) > 0);
		if (kw) {
			out = out.filter((r: any) =>
				[
					r.requisition_number,
					r.patient_number,
					r.patient_first_name,
					r.patient_last_name,
					r.patient_case_number,
				].some((v) => v && String(v).toLowerCase().includes(String(keywords).toLowerCase())),
			);
		}
		return out;
	}

	/**
	 * The uncovered test_item lines for a given requisition + their category
	 * metadata. Used to render the second modal's grouped checkbox tree.
	 */
	async listUncoveredItems(
		tenant_uuid: string,
		patient_requisition_uuid: string,
	): Promise<{ requisition: any; items: UncoveredRequisitionItem[] }> {
		const requisition = (await PatientRequisition.query()
			.alias('pr')
			.leftJoin('patients as p', 'p.uuid', 'pr.patient_uuid')
			.leftJoin('patient_cases as pc', 'pc.uuid', 'pr.patient_case_uuid')
			.select(
				'pr.*',
				'p.patient_number as patient_number',
				'p.first_name as patient_first_name',
				'p.last_name as patient_last_name',
				'pc.case_number as patient_case_number',
			)
			.findOne({ 'pr.uuid': patient_requisition_uuid, 'pr.tenant_uuid': tenant_uuid })) as any;
		if (!requisition) {
			throw new BadRequestException('Requisition not found or belongs to a different tenant.');
		}
		if (requisition.status !== 'paid') {
			throw new BadRequestException('Requisition must be fully paid before creating a lab report.');
		}

		const knex = PatientRequisitionItem.knex();
		const rawItems = await knex('patient_requisition_items as pri')
			.leftJoin('test_items as ti', 'ti.uuid', 'pri.source_uuid')
			.leftJoin('item_categories as ic', 'ic.uuid', 'ti.item_category_uuid')
			.where('pri.patient_requisition_uuid', patient_requisition_uuid)
			.andWhere('pri.source_type', 'test_item')
			.whereNotNull('pri.payment_uuid')
			.whereNotExists(function () {
				this.select('lri.uuid')
					.from('lab_report_items as lri')
					.whereRaw('lri.patient_requisition_item_uuid = pri.uuid')
					.andWhere('lri.is_active', true);
			})
			.select(
				'pri.uuid',
				'pri.patient_requisition_uuid',
				'pri.source_uuid',
				'pri.code as test_code',
				'pri.name as test_name',
				'pri.unit_price',
				'pri.quantity',
				'ti.item_category_uuid',
				'ic.code as item_category_code',
				'ic.name as item_category_name',
				'ic.combine_printout',
				'ti.result_type',
			)
			.orderBy('pri.display_order', 'asc');

		return {
			requisition,
			items: rawItems.map((r: any) => ({
				uuid: r.uuid,
				patient_requisition_uuid: r.patient_requisition_uuid,
				source_uuid: r.source_uuid,
				test_code: r.test_code,
				test_name: r.test_name,
				unit_price: Number(r.unit_price ?? 0),
				quantity: Number(r.quantity ?? 1),
				item_category_uuid: r.item_category_uuid || null,
				item_category_code: r.item_category_code || null,
				item_category_name: r.item_category_name || null,
				combine_printout: r.combine_printout === true || r.combine_printout === 't',
				result_type: r.result_type || null,
			})),
		};
	}

	/**
	 * Race-safe next lab_number, format "{GROUP_CODE}{YY}-{MM}-{NNNNN}"
	 * (e.g. "LAB26-08-00001"). Sequence is scoped per (tenant, item_group,
	 * year, month) — each month starts fresh at 00001 for each item group.
	 * Uses an advisory transaction lock keyed on the same tuple so concurrent
	 * creators can't double-issue.
	 *
	 * Group code falls back to "LAB" if the report's category has no group
	 * (shouldn't happen in normal flow — categories must belong to a group).
	 */
	private async nextLabNumber(
		trx: any,
		tenant_uuid: string,
		group_code: string | null | undefined,
		at: Date,
	): Promise<string> {
		const code = (group_code || 'LAB').toUpperCase();
		const year = at.getFullYear();
		const month = at.getMonth() + 1;

		await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [
			`lab-number:${tenant_uuid}:${code}:${year}:${month}`,
		]);

		const existing = await trx('lab_number_sequences')
			.where({ tenant_uuid, group_code: code, year, month })
			.first();
		let nextValue: number;
		if (existing) {
			nextValue = Number(existing.next_value ?? 1);
			await trx('lab_number_sequences')
				.where({ tenant_uuid, group_code: code, year, month })
				.update({ next_value: nextValue + 1, updated_at: trx.fn.now() });
		} else {
			nextValue = 1;
			await trx('lab_number_sequences').insert({
				tenant_uuid,
				group_code: code,
				year,
				month,
				next_value: 2,
			});
		}
		const yy = String(year).slice(-2);
		const mm = String(month).padStart(2, '0');
		return `${code}${yy}-${mm}-${String(nextValue).padStart(5, '0')}`;
	}

	/**
	 * Create one lab_report per group. Validates in-tenant, paid, uncovered.
	 * Seeds lab_result_values for panel (per component) and single (one row)
	 * result types. narrative / culture rows leave narrative_text empty and
	 * insert no lab_result_values.
	 */
	async createBatch(
		payload: CreateLabReportBatchDTO,
		tenant_uuid: string,
		acting_user: { uuid?: string; name: string; lab_display_name?: string | null; license_number?: string | null },
		// Offline-sync provenance. When provided, stamps every generated
		// lab_report with the device wall-clock so audits can bucket rows
		// captured offline vs. online.
		offlineMeta?: { created_offline_at?: string | Date | null },
	): Promise<LabReport[]> {
		const knex = LabReport.knex();
		return objectionTransaction(knex, async (trx) => {
			// Fetch the acting user's lab-display and license so the medtech
			// snapshot on the report reflects their latest saved values.
			if (acting_user.uuid && (acting_user.lab_display_name == null || acting_user.license_number == null)) {
				const u = await trx('users')
					.where({ uuid: acting_user.uuid })
					.first('lab_display_name', 'license_number');
				if (u) {
					acting_user.lab_display_name = acting_user.lab_display_name ?? u.lab_display_name ?? null;
					acting_user.license_number   = acting_user.license_number   ?? u.license_number   ?? null;
				}
			}

			// tester_signatory_count = 1 means the finalizer signs (slot 1
			// filled at setFinal, not now). count = 2 keeps the historical
			// behavior of stamping the creator into slot 1 immediately so
			// the printout can show "who started the report" separately
			// from "who tagged it as final".
			const tenantRow = await trx('tenants')
				.where({ uuid: tenant_uuid })
				.first('tester_signatory_count');
			const testerCount = Number(tenantRow?.tester_signatory_count ?? 1);
			const stampCreatorAsSlot1 = testerCount === 2;

			const requisition = (await PatientRequisition.query(trx).findOne({
				uuid: payload.patient_requisition_uuid,
				tenant_uuid,
			})) as unknown as PatientRequisition | undefined;
			if (!requisition) {
				throw new BadRequestException('Requisition not found or belongs to a different tenant.');
			}
			if (requisition.status !== 'paid') {
				throw new BadRequestException('Requisition must be fully paid.');
			}

			const allRequestedItemUuids = Array.from(
				new Set(payload.groups.flatMap((g) => g.requisition_item_uuids)),
			);
			if (allRequestedItemUuids.length !== payload.groups.reduce((s, g) => s + g.requisition_item_uuids.length, 0)) {
				throw new BadRequestException('A requisition item cannot appear in more than one group.');
			}

			const requisitionItems = (await PatientRequisitionItem.query(trx)
				.whereIn('uuid', allRequestedItemUuids)
				.andWhere('patient_requisition_uuid', requisition.uuid)) as unknown as PatientRequisitionItem[];
			const itemByUuid = new Map(requisitionItems.map((r) => [r.uuid, r]));
			for (const uuid of allRequestedItemUuids) {
				const it = itemByUuid.get(uuid);
				if (!it) throw new BadRequestException(`Requisition item ${uuid} does not belong to this requisition.`);
				if (it.source_type !== 'test_item') {
					throw new BadRequestException(`Requisition item ${uuid} is not a test line.`);
				}
				if (!(it as any).payment_uuid) {
					throw new BadRequestException(`Requisition item ${uuid} is not paid.`);
				}
			}

			// Refuse to double-cover an item that already sits on a live lab_report.
			const alreadyCovered = (await LabReportItem.query(trx)
				.whereIn('patient_requisition_item_uuid', allRequestedItemUuids)
				.andWhere('is_active', true)
				.select('patient_requisition_item_uuid')) as unknown as Array<{ patient_requisition_item_uuid: string }>;
			if (alreadyCovered.length) {
				throw new BadRequestException(
					`Requisition item ${alreadyCovered[0].patient_requisition_item_uuid} is already on an active lab report.`,
				);
			}

			// Preload test_items + components once for the whole batch.
			const testItemUuids = Array.from(new Set(requisitionItems.map((r) => r.source_uuid)));
			const testItems = testItemUuids.length
				? ((await TestItem.query(trx).whereIn('uuid', testItemUuids)) as unknown as TestItem[])
				: [];
			const testItemByUuid = new Map(testItems.map((t) => [t.uuid, t]));

			const panelUuids = testItems.filter((t) => t.result_type === 'panel').map((t) => t.uuid);
			const components = panelUuids.length
				? ((await TestItemComponent.query(trx)
						.whereIn('test_item_uuid', panelUuids)
						.orderBy('display_order', 'asc')) as unknown as TestItemComponent[])
				: [];
			const componentsByTestItem = new Map<string, TestItemComponent[]>();
			for (const c of components) {
				const arr = componentsByTestItem.get(c.test_item_uuid) || [];
				arr.push(c);
				componentsByTestItem.set(c.test_item_uuid, arr);
			}

			const categoryUuids = Array.from(
				new Set(payload.groups.map((g) => g.item_category_uuid).filter(Boolean) as string[]),
			);
			const categories = categoryUuids.length
				? ((await ItemCategory.query(trx).whereIn('uuid', categoryUuids)) as unknown as ItemCategory[])
				: [];
			const categoryByUuid = new Map(categories.map((c) => [c.uuid, c]));

			// Preload the item group code for every category referenced in this
			// batch — lab_number is prefixed with the group code (e.g. LAB26-08-00001).
			const groupUuids = Array.from(new Set(categories.map((c) => c.item_group_uuid).filter(Boolean)));
			const groupCodeByUuid = new Map<string, string>();
			if (groupUuids.length) {
				const groupRows = (await trx('item_groups')
					.whereIn('uuid', groupUuids)
					.select('uuid', 'code')) as Array<{ uuid: string; code: string }>;
				for (const g of groupRows) groupCodeByUuid.set(g.uuid, g.code);
			}

			const created: LabReport[] = [];
			for (const group of payload.groups) {
				const cat = group.item_category_uuid ? categoryByUuid.get(group.item_category_uuid) : undefined;
				const groupCode = cat?.item_group_uuid ? groupCodeByUuid.get(cat.item_group_uuid) : undefined;
				const lab_number = await this.nextLabNumber(trx, tenant_uuid, groupCode, new Date());

				// Snapshot the test-item names so the dashboard doesn't have to
				// join back into patient_requisition_items to show what's on
				// each lab.
				const testNames = group.requisition_item_uuids.map((uuid) => {
					const rItem = itemByUuid.get(uuid)!;
					const ti = testItemByUuid.get(rItem.source_uuid);
					return ti?.name ?? rItem.name;
				});

				const report = (await LabReport.query(trx).insertAndFetch({
					// Offline sync dispatcher pre-generates the uuid client-side so
					// the local Dexie row and the server row share an identity.
					...(group.client_uuid ? { uuid: group.client_uuid } : {}),
					tenant_uuid,
					patient_requisition_uuid: requisition.uuid,
					patient_uuid: requisition.patient_uuid,
					patient_case_uuid: requisition.patient_case_uuid,
					item_category_uuid: cat?.uuid ?? null,
					item_category_code: cat?.code ?? null,
					item_category_name: cat?.name ?? null,
					lab_number,
					status: 'draft',
					client_uuid: group.client_uuid ?? null,
					created_offline_at: (offlineMeta?.created_offline_at as any) ?? null,
					// count=2 stamps the creator into slot 1 up front so the
					// finalize step captures the second signer. count=1 leaves
					// slot 1 null; setFinal fills it with whoever tags final.
					medtech_uuid:    stampCreatorAsSlot1 ? (acting_user.uuid ?? null)                                : null,
					medtech_name:    stampCreatorAsSlot1 ? (acting_user.lab_display_name || acting_user.name)         : null,
					medtech_license: stampCreatorAsSlot1 ? (acting_user.license_number ?? null)                       : null,
					test_items_summary: testNames.join(', '),
					remarks: group.remarks ?? null,
					created_by: acting_user.name,
				} as any)) as unknown as LabReport;

				let display_order = 0;
				for (const requisition_item_uuid of group.requisition_item_uuids) {
					const rItem = itemByUuid.get(requisition_item_uuid)!;
					const ti = testItemByUuid.get(rItem.source_uuid);
					const insertedItem = (await LabReportItem.query(trx).insertAndFetch({
						tenant_uuid,
						lab_report_uuid: report.uuid,
						patient_requisition_item_uuid: requisition_item_uuid,
						test_item_uuid: ti?.uuid ?? null,
						test_code: ti?.code ?? rItem.code,
						test_name: ti?.name ?? rItem.name,
						result_type: (ti?.result_type as any) ?? 'narrative',
						specimen: ti?.specimen ?? null,
						unit_of_measure: ti?.unit_of_measure ?? null,
						reference_range: ti?.reference_range ?? null,
						method: ti?.method ?? null,
						matrix_config: (ti as any)?.matrix_config ?? null,
						si_conversion_factor: (ti as any)?.si_conversion_factor ?? null,
						si_unit_of_measure: (ti as any)?.si_unit_of_measure ?? null,
						si_reference_range: (ti as any)?.si_reference_range ?? null,
						narrative_text: null,
						display_order: display_order++,
						created_by: acting_user.name,
					} as any)) as unknown as LabReportItem;

					// Seed result values for single/panel; leave narrative/culture empty.
					if (ti?.result_type === 'single') {
						await LabResultValue.query(trx).insert({
							tenant_uuid,
							lab_report_item_uuid: insertedItem.uuid,
							test_item_component_uuid: null,
							component_code: ti.code,
							component_name: ti.name,
							unit_of_measure: ti.unit_of_measure ?? null,
							reference_range: ti.reference_range ?? null,
							lookup_values: ti.lookup_values ?? null,
							si_conversion_factor: (ti as any).si_conversion_factor ?? null,
							si_unit_of_measure: (ti as any).si_unit_of_measure ?? null,
							si_reference_range: (ti as any).si_reference_range ?? null,
							value_text: null,
							value_numeric: null,
							flag: null,
							display_order: 0,
							created_by: acting_user.name,
						} as any);
					} else if (ti?.result_type === 'panel') {
						const comps = componentsByTestItem.get(ti.uuid) || [];
						let cOrder = 0;
						for (const c of comps) {
							await LabResultValue.query(trx).insert({
								tenant_uuid,
								lab_report_item_uuid: insertedItem.uuid,
								test_item_component_uuid: c.uuid,
								component_code: c.code,
								component_name: c.name,
								unit_of_measure: c.unit_of_measure ?? null,
								reference_range: c.reference_range ?? null,
								lookup_values: c.lookup_values ?? null,
								si_conversion_factor: (c as any).si_conversion_factor ?? null,
								si_unit_of_measure: (c as any).si_unit_of_measure ?? null,
								si_reference_range: (c as any).si_reference_range ?? null,
								value_text: null,
								value_numeric: null,
								flag: null,
								display_order: cOrder++,
								created_by: acting_user.name,
							} as any);
						}
					} else if (ti?.result_type === 'matrix' && (ti as any).matrix_config) {
						// Matrix: one lab_result_value per (row, col) cell.
						// component_code = "row|col" so we can reconstruct the grid
						// at render time without an extra join.
						const cfg = (ti as any).matrix_config as { rows?: string[]; cols?: string[] };
						const rows = Array.isArray(cfg.rows) ? cfg.rows : [];
						const cols = Array.isArray(cfg.cols) ? cfg.cols : [];
						let cOrder = 0;
						for (const rw of rows) {
							for (const co of cols) {
								await LabResultValue.query(trx).insert({
									tenant_uuid,
									lab_report_item_uuid: insertedItem.uuid,
									test_item_component_uuid: null,
									component_code: `${rw}|${co}`,
									component_name: `${rw} · ${co}`,
									unit_of_measure: null,
									reference_range: null,
									lookup_values: null,
									value_text: null,
									value_numeric: null,
									flag: null,
									display_order: cOrder++,
									created_by: acting_user.name,
								} as any);
							}
						}
					}
				}

				created.push(report);
			}

			return created;
		});
	}

	/**
	 * Draft-only bulk update of result rows across a lab_report. Rejects the
	 * write when the report is finalized or voided (edit-after-final is not
	 * allowed — void + re-issue instead).
	 */
	async updateResults(
		lab_report_uuid: string,
		payload: UpdateLabReportResultsDTO,
		acting_user: { name: string },
	): Promise<LabReportWithMeta> {
		const knex = LabReport.knex();
		await objectionTransaction(knex, async (trx) => {
			const report = (await LabReport.query(trx).findById(lab_report_uuid)) as unknown as LabReport | undefined;
			if (!report) throw new BadRequestException('Lab report not found.');
			if (report.status !== 'draft') {
				throw new BadRequestException('Only draft lab reports can be edited. Void + re-issue to correct.');
			}

			const requestedItemUuids = payload.items.map((i) => i.lab_report_item_uuid);
			const items = (await LabReportItem.query(trx)
				.whereIn('uuid', requestedItemUuids)
				.andWhere('lab_report_uuid', lab_report_uuid)) as unknown as LabReportItem[];
			const itemsByUuid = new Map(items.map((i) => [i.uuid, i]));
			for (const u of requestedItemUuids) {
				if (!itemsByUuid.has(u)) {
					throw new BadRequestException(`Lab report item ${u} does not belong to this report.`);
				}
			}

			for (const block of payload.items) {
				const item = itemsByUuid.get(block.lab_report_item_uuid)!;

				if (item.result_type === 'narrative' || item.result_type === 'culture') {
					await LabReportItem.query(trx).patchAndFetchById(item.uuid, {
						narrative_text: block.narrative_text ?? null,
						updated_by: acting_user.name,
					} as any);
					continue;
				}

				// single / panel — reconcile lab_result_values by uuid. Client is
				// expected to echo back the seeded rows with values filled in;
				// missing rows are left as-is (partial saves supported).
				if (!block.values || !block.values.length) continue;

				const existing = (await LabResultValue.query(trx).where({
					lab_report_item_uuid: item.uuid,
				})) as unknown as LabResultValue[];
				const existingByUuid = new Map(existing.map((v) => [v.uuid, v]));

				for (const row of block.values) {
					if (!row.uuid) continue;         // insertions handled server-side at create-time only
					if (!existingByUuid.has(row.uuid)) {
						throw new BadRequestException(`Result value ${row.uuid} does not belong to this report item.`);
					}
					await LabResultValue.query(trx).patchAndFetchById(row.uuid, {
						value_text: row.value_text ?? null,
						value_numeric: row.value_numeric ?? null,
						flag: row.flag ?? null,
						updated_by: acting_user.name,
					} as any);
				}
			}

			const parentPatch: any = { updated_by: acting_user.name, updated_at: new Date() };
			if (payload.remarks !== undefined) parentPatch.remarks = payload.remarks ?? null;
			// specimen_collected_at is nullable — pass through as-is (including null to clear).
			if (Object.prototype.hasOwnProperty.call(payload, 'specimen_collected_at')) {
				parentPatch.specimen_collected_at = payload.specimen_collected_at ?? null;
			}
			await LabReport.query(trx).patchAndFetchById(lab_report_uuid, parentPatch);
		});

		// Read AFTER commit so the returned payload reflects the writes. Doing
		// this inside the transaction on a fresh (non-trx) connection would
		// return stale values on READ COMMITTED and make the UI look like the
		// save had no effect.
		return (await this.findByUuid(lab_report_uuid)) as LabReportWithMeta;
	}

	async setFinal(
		lab_report_uuid: string,
		payload: {
			pathologist_name?: string;
			pathologist_doctor_uuid?: string;
			// Second-tester credential ceremony (only used when the tenant
			// is configured for tester_signatory_count = 2).
			signatory_username?: string;
			signatory_password?: string;
		},
		acting_user: { uuid?: string; name: string; lab_display_name?: string | null; license_number?: string | null },
	): Promise<LabReport> {
		const report = (await LabReport.query().findById(lab_report_uuid)) as unknown as LabReport | undefined;
		if (!report) throw new BadRequestException('Lab report not found.');
		if (report.status !== 'draft') {
			throw new BadRequestException(`Only draft reports can be finalized (current status: ${report.status}).`);
		}

		// ── Tester signatory (medtech) resolution ──────────────────────
		// count = 1 → the person hitting "Tag as Final" IS the signature;
		//             stamp slot 1 (medtech_*) from the acting user. Slot
		//             2 stays null.
		// count = 2 → the credential ceremony resolves who signs slot 2.
		//             Slot 1 was already stamped at createBatch (the
		//             creator). If the resolved user == slot 1, collapse
		//             back to a single signature (slot 2 stays null).
		const tenantRow = await LabReport.knex()('tenants')
			.where({ uuid: report.tenant_uuid })
			.first('tester_signatory_count');
		const testerCount = Number(tenantRow?.tester_signatory_count ?? 1);

		// Refresh acting_user.lab_display_name / license_number the same
		// way createBatch does — the fields on the session snapshot may
		// be stale if the user updated their profile mid-session. Runs
		// for both signatory counts because the pathologist fallback
		// (below) also honors these fields.
		if (acting_user.uuid && (acting_user.lab_display_name == null || acting_user.license_number == null)) {
			const u = await LabReport.knex()('users')
				.where({ uuid: acting_user.uuid })
				.first('lab_display_name', 'license_number');
			if (u) {
				acting_user.lab_display_name = acting_user.lab_display_name ?? u.lab_display_name ?? null;
				acting_user.license_number   = acting_user.license_number   ?? u.license_number   ?? null;
			}
		}

		const testerPatch: Record<string, any> = {};
		if (testerCount === 1) {
			testerPatch.medtech_uuid    = acting_user.uuid ?? null;
			testerPatch.medtech_name    = acting_user.lab_display_name || acting_user.name;
			testerPatch.medtech_license = acting_user.license_number ?? null;
			// Always clear slot 2 for count=1 tenants so a report that was
			// previously finalized under count=2 (then reopened) doesn't
			// leak an orphan second signature after re-finalization.
			testerPatch.medtech2_uuid    = null;
			testerPatch.medtech2_name    = null;
			testerPatch.medtech2_license = null;
		} else {
			// count = 2 — credential ceremony required.
			if (!payload.signatory_username || !payload.signatory_password) {
				throw new BadRequestException('A second signatory\'s credentials are required to finalize this report.');
			}
			const check = await this.userService.verifyLabSignatoryCredentials(
				report.tenant_uuid,
				payload.signatory_username,
				payload.signatory_password,
			);
			if (!check.verified) {
				// invalid / inactive → 401; forbidden (no lab_display_name) → 400
				if (check.code === 'forbidden') throw new BadRequestException(check.message);
				throw new UnauthorizedException(check.message);
			}
			if (check.user.uuid === report.medtech_uuid) {
				// Resolved to slot 1 (creator). Not an error — collapse to
				// a single printed signature (slot 2 stays null).
				testerPatch.medtech2_uuid    = null;
				testerPatch.medtech2_name    = null;
				testerPatch.medtech2_license = null;
			} else {
				testerPatch.medtech2_uuid    = check.user.uuid;
				testerPatch.medtech2_name    = check.user.lab_display_name || check.user.name;
				testerPatch.medtech2_license = check.user.license_number ?? null;
			}
		}

		// Resolve the pathologist signatory. Priority:
		//   1. Explicit doctor uuid on the payload → snapshot name/license, link uuid
		//   2. Explicit pathologist_name on the payload → use verbatim, no license
		//   3. Item group's default signatory doctor → snapshot name/license, link uuid
		//   4. Acting user's name → name only
		// e-signature is NOT snapshotted — it lives on doctors.esignature_image
		// and is looked up at read time via lr.pathologist_uuid.
		let doctorSnapshot: { name: string; license: string | null; uuid: string | null } | null = null;

		if (payload.pathologist_doctor_uuid) {
			const d = await this.loadDoctor(payload.pathologist_doctor_uuid, report.tenant_uuid);
			if (d) doctorSnapshot = { name: d.name, license: d.license_number ?? null, uuid: d.uuid };
		}
		if (!doctorSnapshot && !payload.pathologist_name && report.item_category_uuid) {
			const d = await this.resolveGroupSignatory(report.item_category_uuid);
			if (d) doctorSnapshot = { name: d.name, license: d.license_number ?? null, uuid: d.uuid };
		}

		const finalName    = doctorSnapshot?.name    ?? payload.pathologist_name ?? acting_user.lab_display_name ?? acting_user.name;
		const finalLicense = doctorSnapshot?.license ?? null;
		const finalUuid    = doctorSnapshot?.uuid    ?? acting_user.uuid ?? null;

		const now = new Date();
		return (await LabReport.query().patchAndFetchById(lab_report_uuid, {
			status: 'finalized',
			pathologist_uuid: finalUuid,
			pathologist_name: finalName,
			pathologist_license: finalLicense,
			finalized_at: now,
			updated_at: now,
			updated_by: acting_user.name,
			...testerPatch,
		} as any)) as unknown as LabReport;
	}

	/**
	 * Reopen a finalized report back to draft so the operator can amend
	 * results. Clears the pathologist snapshot fields (name, license, uuid)
	 * and finalized_at so the report reads as a fresh draft. Only allowed on
	 * finalized reports — voided reports must be re-issued from the source
	 * requisition instead.
	 */
	async unsetFinal(
		lab_report_uuid: string,
		acting_user: { name: string },
	): Promise<LabReport> {
		const report = (await LabReport.query().findById(lab_report_uuid)) as unknown as LabReport | undefined;
		if (!report) throw new BadRequestException('Lab report not found.');
		if (report.status !== 'finalized') {
			throw new BadRequestException(`Only finalized reports can be un-finalized (current status: ${report.status}).`);
		}
		// Tester slot 2 (medtech2_*) was set at finalize; clear it so the
		// re-finalize path re-runs the credential ceremony. Slot 1 depends
		// on the tenant's current tester_signatory_count:
		//   count = 2 → slot 1 was stamped at createBatch (creator);
		//               preserve it so the "creator" identity survives the
		//               reopen.
		//   count = 1 → slot 1 was stamped at finalize (finalizer); clear
		//               it so the next finalize re-stamps.
		const tenantRow = await LabReport.knex()('tenants')
			.where({ uuid: report.tenant_uuid })
			.first('tester_signatory_count');
		const testerCount = Number(tenantRow?.tester_signatory_count ?? 1);

		const patch: Record<string, any> = {
			status: 'draft',
			pathologist_uuid: null,
			pathologist_name: null,
			pathologist_license: null,
			finalized_at: null,
			medtech2_uuid: null,
			medtech2_name: null,
			medtech2_license: null,
			updated_at: new Date(),
			updated_by: acting_user.name,
		};
		if (testerCount === 1) {
			patch.medtech_uuid    = null;
			patch.medtech_name    = null;
			patch.medtech_license = null;
		}
		return (await LabReport.query().patchAndFetchById(lab_report_uuid, patch as any)) as unknown as LabReport;
	}

	/**
	 * Email the finalized report to the patient. Frontend posts the same
	 * print-ready HTML the print popup uses; we render it to PDF via headless
	 * Chromium (Puppeteer) so the attachment matches Print Preview exactly.
	 * Returns a flag so the caller can distinguish sent / no-email / not-finalized.
	 */
	async emailResultToPatient(
		lab_report_uuid: string,
		payload: { html: string; base_href?: string; filename?: string },
	): Promise<{ sent: boolean; skipped_reason?: 'no_email' | 'not_finalized' }> {
		const report = await this.findByUuid(lab_report_uuid);
		if (!report) throw new BadRequestException('Lab report not found.');
		if (report.status !== 'finalized') {
			return { sent: false, skipped_reason: 'not_finalized' };
		}
		const to = (report.patient_email || '').trim();
		if (!to) return { sent: false, skipped_reason: 'no_email' };

		if (!payload.html?.trim()) throw new BadRequestException('Empty HTML payload.');
		// Fall back to FRONTEND_ORIGIN when the client didn't supply a base
		// (e.g. an older cached bundle). Without one, relative asset URLs in
		// the HTML would fail to resolve during render.
		const baseHref = payload.base_href?.trim() || process.env.FRONTEND_ORIGIN?.trim() || undefined;
		const pdfBuf = await renderHtmlToPdf(payload.html, {
			baseHref,
			label: report.lab_number ? String(report.lab_number) : lab_report_uuid,
		});
		if (!pdfBuf.length) throw new BadRequestException('Puppeteer produced an empty PDF.');

		const tenantRow = await LabReport.knex()('tenants')
			.select('display_name', 'legal_name',
				'smtp_use_own', 'smtp_host', 'smtp_port', 'smtp_secure',
				'smtp_user', 'smtp_password_enc')
			.where({ uuid: report.tenant_uuid })
			.first();
		const tenantName = tenantRow?.display_name || tenantRow?.legal_name || 'MyLab';

		// Assemble the per-send SMTP override when the tenant opted in AND
		// every required field is populated. Missing anything → fall back to
		// the platform mailer so we still get the email out.
		let smtpOverride: SmtpOverride | undefined;
		if (tenantRow?.smtp_use_own && tenantRow.smtp_host && tenantRow.smtp_port && tenantRow.smtp_user && tenantRow.smtp_password_enc) {
			const password = decryptSecret(tenantRow.smtp_password_enc);
			if (password) {
				smtpOverride = {
					host:     String(tenantRow.smtp_host),
					port:     Number(tenantRow.smtp_port),
					secure:   !!tenantRow.smtp_secure,
					user:     String(tenantRow.smtp_user),
					password,
				};
			} else {
				this.logger.warn(`Tenant ${report.tenant_uuid} opted into own SMTP but password could not be decrypted; falling back to platform default.`);
			}
		}

		const patientName =
			[report.patient_first_name, report.patient_last_name].filter(Boolean).join(' ').trim() ||
			'Patient';
		// Actual test-item names printed on the report (e.g. "LDL Cholesterol,
		// Potassium"). findByUuid already loads items[] in display order —
		// prefer that over the coarser category title or the createBatch-time
		// summary so the recipient sees exactly what was run.
		const testSummary =
			(Array.isArray((report as any).items) && (report as any).items.length
				? (report as any).items.map((it: any) => it.test_name).filter(Boolean).join(', ')
				: '')
			|| (report as any).test_items_summary
			|| (report as any).item_category_print_title
			|| '';
		const finalizedAt = report.finalized_at
			? new Date(report.finalized_at as any).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
			: '';

		// nodemailer's attachment path option needs a filesystem path, so
		// spool the PDF to the OS temp dir and clean it up after send. The
		// filename shown in the email is set via `attachments[].filename`.
		const safeLabNumber = String(report.lab_number || report.uuid).replace(/[^A-Za-z0-9_.-]/g, '_');
		const attachFilename = payload.filename?.trim() || `Lab Report ${safeLabNumber}.pdf`;
		const tmpPath = path.join(os.tmpdir(), `mylab-${safeLabNumber}-${Date.now()}.pdf`);
		await fs.promises.writeFile(tmpPath, pdfBuf);

		try {
			await this.mailer.sendTemplate(
				to,
				'lab-report-ready',
				{
					patient_name: patientName,
					tenant_name: tenantName,
					lab_number: report.lab_number || '(pending)',
					test_summary: testSummary,
					finalized_at: finalizedAt,
				},
				{
					attachments: [
						{ filename: attachFilename, path: tmpPath, contentType: 'application/pdf' },
					],
					smtp: smtpOverride,
					// Recipient sees "MyLab Diagnostics <lab@yourclinic.com>"
					// instead of a bare email — makes the message obviously
					// legitimate. Falls back to the platform name when the
					// tenant has no display name on record.
					fromName: tenantName,
				},
			);
			return { sent: true };
		} finally {
			fs.promises.unlink(tmpPath).catch((err) => {
				this.logger.warn(`Failed to remove temp PDF ${tmpPath}: ${err?.message}`);
			});
		}
	}

	/**
	 * Fetch a doctor by uuid, scoped to the tenant. Returns undefined when
	 * missing or cross-tenant — the caller then falls back through the
	 * priority chain.
	 */
	private async loadDoctor(
		uuid: string,
		tenant_uuid: string,
	): Promise<{ uuid: string; name: string; license_number?: string | null; esignature_image?: string | null } | undefined> {
		const row = await LabReport.knex()('doctors')
			.where({ uuid, tenant_uuid })
			.first('uuid', 'name', 'license_number', 'esignature_image');
		return row as any;
	}

	/**
	 * Walk item_category → item_group → doctors.signatory_doctor_uuid to
	 * find the default signatory for this lab report's category.
	 */
	private async resolveGroupSignatory(
		item_category_uuid: string,
	): Promise<{ uuid: string; name: string; license_number?: string | null; esignature_image?: string | null } | undefined> {
		const row = await LabReport.knex()('item_categories as ic')
			.join('item_groups as ig', 'ig.uuid', 'ic.item_group_uuid')
			.join('doctors as d', 'd.uuid', 'ig.signatory_doctor_uuid')
			.where('ic.uuid', item_category_uuid)
			.first('d.uuid', 'd.name', 'd.license_number', 'd.esignature_image');
		return row as any;
	}

	/**
	 * Read-only helper used by the frontend's finalize modal to preview the
	 * default signatory before submitting. Nullable — the group may not have
	 * one, in which case the modal falls back to a manual name entry.
	 */
	async getDefaultSignatory(lab_report_uuid: string): Promise<any | null> {
		const report = (await LabReport.query().findById(lab_report_uuid)) as unknown as LabReport | undefined;
		if (!report?.item_category_uuid) return null;
		const doc = await this.resolveGroupSignatory(report.item_category_uuid);
		return doc || null;
	}

	async void(
		lab_report_uuid: string,
		reason: string,
		acting_user: { name: string },
	): Promise<LabReport> {
		const knex = LabReport.knex();
		return objectionTransaction(knex, async (trx) => {
			const report = (await LabReport.query(trx).findById(lab_report_uuid)) as unknown as LabReport | undefined;
			if (!report) throw new BadRequestException('Lab report not found.');
			if (report.status === 'voided') {
				throw new BadRequestException('Lab report is already voided.');
			}
			// Release every requisition_item this report was covering so the
			// operator can re-issue a new draft against the same items.
			await LabReportItem.query(trx)
				.patch({ is_active: false, updated_by: acting_user.name } as any)
				.where({ lab_report_uuid });
			const now = new Date();
			return (await LabReport.query(trx).patchAndFetchById(lab_report_uuid, {
				status: 'voided',
				void_reason: reason,
				voided_at: now,
				updated_at: now,
				updated_by: acting_user.name,
			} as any)) as unknown as LabReport;
		});
	}

	async setStatus(uuid: string, status: LabReportStatus, updated_by: string) {
		return LabReport.query().patchAndFetchById(uuid, { status, updated_by } as any);
	}
}
