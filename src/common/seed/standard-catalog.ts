/**
 * Standard "Hinigaran-style" laboratory catalog. Seeds one item_group with a
 * set of item_categories (Chemistry, Hematology, Urinalysis, Fecalysis,
 * Serology, Immunoassay, Coagulation, Endocrinology) plus every test_item
 * and panel component the template ships with.
 *
 * Called from:
 *   - `seeds/09_seed_standard_catalog_for_all_tenants.ts` (manual `npm run
 *     seed-latest` — installs the catalog for every existing tenant).
 *   - `TenantRegistrationService.verify(...)` (auto-installs it for every
 *     newly-registered tenant inside the same transaction).
 *
 * Idempotent: every insert looks up by (tenant_uuid, code) first and skips
 * when present. Safe to re-run.
 */

import type { Knex } from 'knex';

export interface CatalogCategory {
	code: string;
	name: string;
	color: string;
	print_title: string;
	print_template: 'default' | 'sectioned' | 'narrative' | 'matrix';
	print_paper_size: 'full' | 'half' | 'letter' | 'half_letter';
	combine_printout: boolean;
	description?: string;
}

export interface CatalogTestItemComponent {
	code: string;
	name: string;
	unit_of_measure?: string | null;
	reference_range?: string | null;
	lookup_values?: string | null;
	section?: string | null;
}

export interface CatalogTestItem {
	code: string;
	name: string;
	result_type: 'single' | 'panel' | 'narrative' | 'culture' | 'matrix';
	specimen?: string | null;
	unit_of_measure?: string | null;
	reference_range?: string | null;
	method?: string | null;
	lookup_values?: string | null;
	matrix_config?: { rows: string[]; cols: string[] } | null;
	description?: string | null;
	price?: number;
	components?: CatalogTestItemComponent[];
	category_code: string;
}

// Combined with the older "Laboratory" group — the standard catalog now
// installs a single "Clinical Laboratory" (CLIN) bucket. Migration
// `20260806001300_merge_lab_into_clin` fixes existing tenants that already
// had the older LAB group (moves its categories/items into CLIN and drops LAB).
export const STANDARD_GROUP = { code: 'CLIN', name: 'Clinical Laboratory', tester_role: 'Medical Technologist' };

export const STANDARD_CATEGORIES: CatalogCategory[] = [
	// Defaults: everything on a regular short bond (US Letter 8.5" × 11").
	// Categories named "Clinical Laboratory" or "Laboratory" get the half
	// short bond (5.5" × 8.5") by convention — see the sibling data-fix
	// migration `20260805001400`.
	{ code: 'CHEM', name: 'Chemistry',     color: '#0ea5e9', print_title: 'C L I N I C A L   C H E M I S T R Y', print_template: 'default',   print_paper_size: 'letter', combine_printout: true  },
	{ code: 'HEMA', name: 'Hematology',    color: '#ef4444', print_title: 'H E M A T O L O G Y',                 print_template: 'default',   print_paper_size: 'letter', combine_printout: true  },
	{ code: 'URIN', name: 'Urinalysis',    color: '#eab308', print_title: 'U R I N A L Y S I S',                 print_template: 'sectioned', print_paper_size: 'letter', combine_printout: true  },
	{ code: 'FECA', name: 'Fecalysis',     color: '#a16207', print_title: 'F E C A L Y S I S',                   print_template: 'sectioned', print_paper_size: 'letter', combine_printout: true  },
	{ code: 'SERO', name: 'Serology',      color: '#16a34a', print_title: 'S E R O L O G Y',                     print_template: 'default',   print_paper_size: 'letter', combine_printout: false },
	{ code: 'IMMU', name: 'Immunoassay',   color: '#059669', print_title: 'I M M U N O A S S A Y',               print_template: 'default',   print_paper_size: 'letter', combine_printout: false },
	{ code: 'COAG', name: 'Coagulation',   color: '#7c3aed', print_title: 'C O A G U L A T I O N',               print_template: 'default',   print_paper_size: 'letter', combine_printout: false },
	{ code: 'ENDO', name: 'Endocrinology', color: '#db2777', print_title: 'E N D O C R I N O L O G Y',           print_template: 'default',   print_paper_size: 'letter', combine_printout: false },
];

// Reactivity lookup shared across the qualitative serology tests.
const REACTIVE_LOOKUP = 'Reactive,Non-Reactive';
const POSNEG_LOOKUP   = 'Positive,Negative';
const ICA_METHOD      = 'Qualitative Immunochromatographic Assay';
const FIA_METHOD      = 'Fluorescence Immunoassay';

export const STANDARD_TEST_ITEMS: CatalogTestItem[] = [
	// ─── Chemistry (each analyte a `single` test — billable independently) ───
	{ category_code: 'CHEM', code: 'FBS',        name: 'Fasting Blood Sugar',   result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/dL', reference_range: '70-110 mg/dL' },
	{ category_code: 'CHEM', code: 'BS-2HPP',    name: 'Blood Sugar 2hrs PP',   result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/dL', reference_range: 'up to 150 mg/dL' },
	{ category_code: 'CHEM', code: 'RBS',        name: 'Random Blood Sugar',    result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/dL' },
	{ category_code: 'CHEM', code: 'CHOL',       name: 'Cholesterol',           result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/dL', reference_range: 'Up to 200 mg/dL' },
	{ category_code: 'CHEM', code: 'HDL',        name: 'HDL Cholesterol',       result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/dL', reference_range: 'M: 35-62 mg/dL · F: 35-54 mg/dL' },
	{ category_code: 'CHEM', code: 'LDL',        name: 'LDL Cholesterol',       result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/dL', reference_range: 'Up to 150 mg/dL' },
	{ category_code: 'CHEM', code: 'TRIG',       name: 'Triglycerides',         result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/dL', reference_range: 'Up to 160 mg/dL' },
	{ category_code: 'CHEM', code: 'CREA',       name: 'Creatinine',            result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/dL', reference_range: 'M: 0.8-1.4 mg/dL · F: 0.6-1.2 mg/dL' },
	{ category_code: 'CHEM', code: 'URIC',       name: 'Uric Acid',             result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/dL', reference_range: 'M: 3.5-7.2 mg/dL · F: 2.6-6.0 mg/dL' },
	{ category_code: 'CHEM', code: 'SGPT',       name: 'SGPT (ALT)',            result_type: 'single', specimen: 'Serum', unit_of_measure: 'U/L',   reference_range: '0-41 U/L' },
	{ category_code: 'CHEM', code: 'SGOT',       name: 'SGOT (AST)',            result_type: 'single', specimen: 'Serum', unit_of_measure: 'U/L',   reference_range: '0-40 U/L' },
	{ category_code: 'CHEM', code: 'ALP',        name: 'Alkaline Phosphatase',  result_type: 'single', specimen: 'Serum', unit_of_measure: 'U/L',   reference_range: 'M: 80-306 U/L · F: 64-306 U/L' },
	// Bilirubin panel — the three fractions are always reported together, so
	// this bills as one test and the report renders all three rows.
	{
		category_code: 'CHEM', code: 'BILI', name: 'Bilirubin', result_type: 'panel', specimen: 'Serum',
		components: [
			{ code: 'BILI-T', name: 'Bilirubin Total',    unit_of_measure: 'mg/dL', reference_range: '0.20 – 1.20 mg/dL' },
			{ code: 'BILI-D', name: 'Bilirubin Direct',   unit_of_measure: 'mg/dL', reference_range: '0.00 – 0.30 mg/dL' },
			{ code: 'BILI-I', name: 'Bilirubin Indirect', unit_of_measure: 'mg/dL', reference_range: '0.10 – 1.00 mg/dL' },
		],
	},
	{ category_code: 'CHEM', code: 'NA',         name: 'Sodium',                result_type: 'single', specimen: 'Serum', unit_of_measure: 'mmol/L',reference_range: '135-148 mmol/L' },
	{ category_code: 'CHEM', code: 'K',          name: 'Potassium',             result_type: 'single', specimen: 'Serum', unit_of_measure: 'mmol/L',reference_range: '3.7-5.3 mmol/L' },
	{ category_code: 'CHEM', code: 'CA',         name: 'Calcium',               result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/dL', reference_range: '8.1-10.4 mg/dL' },
	{ category_code: 'CHEM', code: 'UREA',       name: 'Blood Urea Nitrogen',   result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/dL', reference_range: '15-39 mg/dL' },
	{ category_code: 'CHEM', code: 'ALB',        name: 'Albumin',               result_type: 'single', specimen: 'Serum', unit_of_measure: 'g/dL',  reference_range: '3.8-5.15 g/dL' },

	// ─── Hematology ───
	{
		category_code: 'HEMA', code: 'CBC', name: 'Complete Blood Count', result_type: 'panel', specimen: 'Whole Blood',
		components: [
			{ code: 'HCT',  name: 'Hematocrit',      unit_of_measure: 'L/L',       reference_range: 'M: 0.42-0.56 · F: 0.36-0.42', section: 'Main Values' },
			{ code: 'HGB',  name: 'Hemoglobin',      unit_of_measure: 'g/L',       reference_range: 'M: 140-188 g/L · F: 120-140 g/L', section: 'Main Values' },
			{ code: 'PLT',  name: 'Platelet Count',  unit_of_measure: 'x10^9/L',   reference_range: '150-400 x10^9/L', section: 'Main Values' },
			{ code: 'RBC',  name: 'RBC Count',       unit_of_measure: 'x10^12/L',  reference_range: '4.5-5.0 x10^12/L', section: 'Main Values' },
			{ code: 'WBC',  name: 'WBC Count',       unit_of_measure: 'x10^9/L',   reference_range: '5-10 x10^9/L', section: 'Main Values' },
			{ code: 'NEU',  name: 'Neutrophils',     unit_of_measure: '%',         reference_range: '55-65 %', section: 'Differential Count' },
			{ code: 'LYM',  name: 'Lymphocytes',     unit_of_measure: '%',         reference_range: '25-35 %', section: 'Differential Count' },
			{ code: 'MON',  name: 'Monocytes',       unit_of_measure: '%',         reference_range: '4-8 %',   section: 'Differential Count' },
			{ code: 'EOS',  name: 'Eosinophils',     unit_of_measure: '%',         reference_range: '1-3 %',   section: 'Differential Count' },
			{ code: 'BAS',  name: 'Basophils',       unit_of_measure: '%',         reference_range: '0-1 %',   section: 'Differential Count' },
			{ code: 'STAB', name: 'Stabs',           unit_of_measure: '%',         reference_range: '0-5 %',   section: 'Differential Count' },
		],
	},
	{ category_code: 'HEMA', code: 'ESR',  name: 'Erythrocyte Sedimentation Rate', result_type: 'single', specimen: 'Whole Blood', unit_of_measure: 'mm/hr', reference_range: 'M: 0-10 mm/hr · F: 0-20 mm/hr' },
	{ category_code: 'HEMA', code: 'BT',   name: 'Bleeding Time',                  result_type: 'single', specimen: 'Whole Blood', unit_of_measure: 'min',   reference_range: '1-3 min' },
	{ category_code: 'HEMA', code: 'CT',   name: 'Clotting Time',                  result_type: 'single', specimen: 'Whole Blood', unit_of_measure: 'min',   reference_range: '3-5 min' },
	{ category_code: 'HEMA', code: 'RETI', name: 'Reticulocyte Count',             result_type: 'single', specimen: 'Whole Blood', unit_of_measure: '%',     reference_range: '0.05-1.5 %' },
	{
		category_code: 'HEMA', code: 'BLDTYP', name: 'Blood Type', result_type: 'panel', specimen: 'Whole Blood',
		components: [
			{ code: 'ABO', name: 'ABO Group', lookup_values: 'A,B,AB,O' },
			{ code: 'RH',  name: 'Rh Group',  lookup_values: 'Positive,Negative' },
		],
	},

	// ─── Urinalysis (one big panel with sub-sections) ───
	{
		category_code: 'URIN', code: 'UA', name: 'Urinalysis', result_type: 'panel', specimen: 'Urine',
		components: [
			{ code: 'COLOR',     name: 'Color',              section: 'Physical Properties' },
			{ code: 'TRANS',     name: 'Transparency',       section: 'Physical Properties' },
			{ code: 'PH',        name: 'pH',                 section: 'Chemical Properties' },
			{ code: 'SG',        name: 'Specific Gravity',   section: 'Chemical Properties' },
			{ code: 'ALB',       name: 'Albumin',            section: 'Chemical Properties', lookup_values: 'Negative,Trace,+1,+2,+3,+4' },
			{ code: 'SUGAR',     name: 'Sugar',              section: 'Chemical Properties', lookup_values: 'Negative,Trace,+1,+2,+3,+4' },
			{ code: 'ACETONE',   name: 'Acetone',            section: 'Chemical Properties', lookup_values: 'Negative,Trace,+1,+2,+3,+4' },
			{ code: 'PUS',       name: 'Pus Cells',          unit_of_measure: '/hpf', section: 'Microscopic — Cells' },
			{ code: 'RBC',       name: 'Red Blood Cells',    unit_of_measure: '/hpf', section: 'Microscopic — Cells' },
			{ code: 'YEAST',     name: 'Yeast Cells',        unit_of_measure: '/hpf', section: 'Microscopic — Cells' },
			{ code: 'SQUAM',     name: 'Squamous',           unit_of_measure: '/lpf', section: 'Microscopic — Cells' },
			{ code: 'RENAL',     name: 'Renal',              unit_of_measure: '/hpf', section: 'Microscopic — Cells' },
			{ code: 'HYALINE',   name: 'Hyaline',            unit_of_measure: '/lpf', section: 'Microscopic — Casts' },
			{ code: 'WAXY',      name: 'Waxy',               unit_of_measure: '/lpf', section: 'Microscopic — Casts' },
			{ code: 'CGRAN',     name: 'Coarse Granular',    unit_of_measure: '/lpf', section: 'Microscopic — Casts' },
			{ code: 'FGRAN',     name: 'Fine Granular',      unit_of_measure: '/lpf', section: 'Microscopic — Casts' },
			{ code: 'AMURATE',   name: 'Amorphous Urates',   section: 'Microscopic — Crystals' },
			{ code: 'AMPHOS',    name: 'Amorphous Phosphates', section: 'Microscopic — Crystals' },
			{ code: 'CAOX',      name: 'Calcium Oxalate',    section: 'Microscopic — Crystals' },
			{ code: 'TRIPO4',    name: 'Triple Phosphate',   section: 'Microscopic — Crystals' },
			{ code: 'BACT',      name: 'Bacteria',           section: 'Microscopic — Others' },
			{ code: 'MUCUS',     name: 'Mucus Threads',      section: 'Microscopic — Others' },
		],
	},

	// ─── Fecalysis: gross exam panel + parasitology matrix ───
	{
		category_code: 'FECA', code: 'STOOL', name: 'Stool Examination', result_type: 'panel', specimen: 'Stool',
		components: [
			{ code: 'COLOR',   name: 'Color',        section: 'Gross Examination' },
			{ code: 'CONSIST', name: 'Consistency',  section: 'Gross Examination' },
			{ code: 'OCCULT',  name: 'Occult Blood', lookup_values: 'Negative,Positive', section: 'Gross Examination' },
			{ code: 'OTHERS',  name: 'Others',       section: 'Gross Examination' },
		],
	},
	{
		category_code: 'FECA', code: 'PARA', name: 'Parasitology (Ova & Cyst)',
		result_type: 'matrix', specimen: 'Stool',
		matrix_config: {
			rows: ['Ascaris', 'Hookworm', 'Trichuris', 'E. histolytica', 'E. coli'],
			cols: ['Cyst', 'Trophozoite'],
		},
	},

	// ─── Serology (single tests, individually orderable) ───
	{ category_code: 'SERO', code: 'HBSAG',  name: 'HBsAg (Hepatitis B Surface Antigen)', result_type: 'single', specimen: 'Serum', method: ICA_METHOD, lookup_values: REACTIVE_LOOKUP },
	{ category_code: 'SERO', code: 'ANTITP', name: 'Anti-TP (Syphilis)',                  result_type: 'single', specimen: 'Serum', method: ICA_METHOD, lookup_values: REACTIVE_LOOKUP },
	{ category_code: 'SERO', code: 'ANTIHAV',name: 'Anti-HAV IgM (Hepatitis A)',          result_type: 'single', specimen: 'Serum', method: ICA_METHOD, lookup_values: REACTIVE_LOOKUP },
	{ category_code: 'SERO', code: 'BHCG',   name: 'Serum Pregnancy Test (β-hCG)',        result_type: 'single', specimen: 'Serum', method: ICA_METHOD, lookup_values: POSNEG_LOOKUP },

	// ─── Immunoassay ───
	{ category_code: 'IMMU', code: 'TSH',   name: 'TSH',   result_type: 'single', specimen: 'Serum', unit_of_measure: 'mIU/L', reference_range: '0.3-4.2 mIU/L', method: FIA_METHOD },
	{ category_code: 'IMMU', code: 'HBA1C', name: 'HbA1c', result_type: 'single', specimen: 'Whole Blood', unit_of_measure: '%', reference_range: '4.0-6.0 %', method: FIA_METHOD },

	// ─── Coagulation ───
	{
		category_code: 'COAG', code: 'PT', name: 'Prothrombin Time', result_type: 'panel', specimen: 'Plasma',
		components: [
			{ code: 'RESULT',  name: 'Result',     unit_of_measure: 'sec' },
			{ code: 'CONTROL', name: 'Control',    unit_of_measure: 'sec' },
			{ code: 'ISI',     name: 'ISI' },
			{ code: 'INR',     name: 'INR' },
			{ code: 'ACT',     name: '% Activity', unit_of_measure: '%' },
		],
	},

	// ─── Endocrinology ───
	{
		category_code: 'ENDO', code: 'OGTT75', name: '75g Oral Glucose Tolerance Test', result_type: 'panel', specimen: 'Serum',
		components: [
			{ code: 'FBS',  name: 'Fasting Blood Sugar', unit_of_measure: 'mg/dL', reference_range: '70-110 mg/dL' },
			{ code: 'H1',   name: '1st Hour',            unit_of_measure: 'mg/dL' },
			{ code: 'H2',   name: '2nd Hour',            unit_of_measure: 'mg/dL' },
		],
	},
];

// ─── Seeder ───────────────────────────────────────────────────────────────

async function upsertItemGroup(trx: Knex.Transaction, tenant_uuid: string, actor: string): Promise<string> {
	// Backward-compat single-group helper used by seedStandardCatalogForTenant.
	// The multi-group flow uses upsertItemGroupGeneric below.
	return upsertItemGroupGeneric(trx, tenant_uuid, STANDARD_GROUP, 'Standard laboratory panels', actor);
}

async function upsertItemGroupGeneric(
	trx: Knex.Transaction,
	tenant_uuid: string,
	g: { code: string; name: string; tester_role?: string },
	description: string,
	actor: string,
): Promise<string> {
	const existing = await trx('item_groups').where({ tenant_uuid, code: g.code }).first();
	if (existing?.uuid) {
		if (existing.tester_role == null && g.tester_role) {
			await trx('item_groups')
				.where({ uuid: existing.uuid })
				.update({ tester_role: g.tester_role, updated_by: actor });
		}
		return existing.uuid;
	}
	const [row] = await trx('item_groups')
		.insert({
			tenant_uuid,
			code: g.code,
			name: g.name,
			description,
			tester_role: g.tester_role ?? null,
			status: 'active',
			created_by: actor,
		})
		.returning('uuid');
	return typeof row === 'object' ? row.uuid : row;
}

async function upsertCategory(
	trx: Knex.Transaction,
	tenant_uuid: string,
	item_group_uuid: string,
	cat: CatalogCategory,
	actor: string,
): Promise<string> {
	const existing = await trx('item_categories')
		.where({ tenant_uuid, code: cat.code })
		.first();
	if (existing?.uuid) {
		// Patch in any new nullable field the row predates.
		const patch: any = {};
		if (existing.color == null)            patch.color = cat.color;
		if (existing.print_title == null)      patch.print_title = cat.print_title;
		if (existing.print_template == null)   patch.print_template = cat.print_template;
		if (existing.print_paper_size == null) patch.print_paper_size = cat.print_paper_size;
		if (existing.combine_printout == null) patch.combine_printout = cat.combine_printout;
		if (Object.keys(patch).length) {
			await trx('item_categories').where({ uuid: existing.uuid }).update({ ...patch, updated_by: actor });
		}
		return existing.uuid;
	}
	const [row] = await trx('item_categories')
		.insert({
			tenant_uuid,
			item_group_uuid,
			code: cat.code,
			name: cat.name,
			description: cat.description ?? null,
			combine_printout: cat.combine_printout,
			color: cat.color,
			print_title: cat.print_title,
			print_template: cat.print_template,
			print_paper_size: cat.print_paper_size,
			status: 'active',
			created_by: actor,
		})
		.returning('uuid');
	return typeof row === 'object' ? row.uuid : row;
}

async function upsertTestItem(
	trx: Knex.Transaction,
	tenant_uuid: string,
	item_category_uuid: string,
	ti: CatalogTestItem,
	actor: string,
): Promise<{ uuid: string; created: boolean }> {
	const existing = await trx('test_items')
		.where({ tenant_uuid, code: ti.code })
		.first();
	if (existing?.uuid) return { uuid: existing.uuid, created: false };
	const [row] = await trx('test_items')
		.insert({
			tenant_uuid,
			item_category_uuid,
			code: ti.code,
			name: ti.name,
			result_type: ti.result_type,
			specimen: ti.specimen ?? null,
			unit_of_measure: ti.unit_of_measure ?? null,
			reference_range: ti.reference_range ?? null,
			method: ti.method ?? null,
			lookup_values: ti.lookup_values ?? null,
			matrix_config: ti.matrix_config ? JSON.stringify(ti.matrix_config) : null,
			description: ti.description ?? null,
			price: ti.price ?? 0,
			status: 'active',
			created_by: actor,
		})
		.returning('uuid');
	const uuid = typeof row === 'object' ? row.uuid : row;
	if (ti.components?.length) {
		let order = 0;
		for (const c of ti.components) {
			await trx('test_item_components').insert({
				tenant_uuid,
				test_item_uuid: uuid,
				code: c.code,
				name: c.name,
				unit_of_measure: c.unit_of_measure ?? null,
				reference_range: c.reference_range ?? null,
				lookup_values: c.lookup_values ?? null,
				section: c.section ?? null,
				display_order: order++,
				created_by: actor,
			});
		}
	}
	return { uuid, created: true };
}

/**
 * Install the standard catalog for a single tenant. Idempotent — existing
 * rows are skipped (or their new nullable fields patched in). Runs inside
 * whatever transaction the caller passes; called both from the manual seed
 * and from TenantRegistrationService.verify().
 */
export async function seedStandardCatalogForTenant(
	trx: Knex.Transaction,
	tenant_uuid: string,
	actor: string = 'system-seed',
	options: { only_category_codes?: string[] } = {},
): Promise<{ groupUuid: string; categoriesCreated: number; testItemsCreated: number }> {
	const groupUuid = await upsertItemGroup(trx, tenant_uuid, actor);

	// Optional whitelist so callers can install just a subset (e.g. an ops
	// user picking a checklist from the frontend). Undefined = full catalog.
	const only = options.only_category_codes && options.only_category_codes.length
		? new Set(options.only_category_codes)
		: null;
	const cats = only ? STANDARD_CATEGORIES.filter((c) => only.has(c.code)) : STANDARD_CATEGORIES;

	const catUuidByCode = new Map<string, string>();
	let categoriesCreated = 0;
	for (const cat of cats) {
		const before = await trx('item_categories').where({ tenant_uuid, code: cat.code }).first();
		const uuid = await upsertCategory(trx, tenant_uuid, groupUuid, cat, actor);
		catUuidByCode.set(cat.code, uuid);
		if (!before) categoriesCreated++;
	}

	let testItemsCreated = 0;
	for (const ti of STANDARD_TEST_ITEMS) {
		const catUuid = catUuidByCode.get(ti.category_code);
		if (!catUuid) continue; // category not in this import batch
		const res = await upsertTestItem(trx, tenant_uuid, catUuid, ti, actor);
		if (res.created) testItemsCreated++;
	}

	return { groupUuid, categoriesCreated, testItemsCreated };
}

// ═══════════════════════════════════════════════════════════════════════════
// MULTI-GROUP PRE-LOADED CATALOG
// Every group here is user-selectable from the Item Groups → "Import from
// pre-loaded" checklist. Each group bundles its own categories and (where
// applicable) test items. Clinical Laboratory reuses STANDARD_CATEGORIES /
// STANDARD_TEST_ITEMS so we don't duplicate the hundreds of test-item rows.
// The other groups ship with categories only; test items can be added later
// by the tenant or in future seed passes.
// ═══════════════════════════════════════════════════════════════════════════

export interface PreloadedCategory extends CatalogCategory {
	test_items?: CatalogTestItem[];
}
export interface PreloadedGroup {
	code: string;
	name: string;
	description: string;
	tester_role?: string;
	categories: PreloadedCategory[];
}

// Compact defaults for the "categories-only" groups (no test items shipped).
// Colors chosen so the frontend chip previews stay distinct per group.
const CAT = (
	code: string, name: string, description: string, color: string,
	print_paper_size: CatalogCategory['print_paper_size'] = 'letter',
): PreloadedCategory => ({
	code, name, description, color,
	print_title: name.toUpperCase().split('').join(' '),
	print_template: 'default',
	print_paper_size,
	combine_printout: false,
});

export const PRELOADED_GROUPS: PreloadedGroup[] = [
	{
		code: 'CLIN',
		name: 'Clinical Laboratory',
		description: 'Routine wet-lab diagnostics performed on blood, urine, and other body fluids.',
		tester_role: 'Medical Technologist',
		// Reuse the existing single-group data — this is the primary group new
		// tenants auto-install with. Test items are attached per category via
		// the shared STANDARD_TEST_ITEMS array.
		categories: STANDARD_CATEGORIES.map((c) => ({
			...c,
			test_items: STANDARD_TEST_ITEMS.filter((ti) => ti.category_code === c.code),
		})),
	},
	{
		code: 'PATH',
		name: 'Anatomic Pathology',
		description: 'Tissue-based diagnostics including biopsy and cytology specimens.',
		tester_role: 'Pathologist',
		categories: [
			CAT('HIST', 'Histopathology',       'Surgical biopsy processing, H&E staining, tissue diagnosis.',       '#7c3aed'),
			CAT('CYTO', 'Cytology',             'Pap smears, FNAB, body-fluid cytology, exfoliative cytology.',      '#a855f7'),
			CAT('IHC',  'Immunohistochemistry', 'IHC staining for tumor markers and tissue-antigen identification.', '#c026d3'),
		],
	},
	{
		code: 'MOL',
		name: 'Molecular Diagnostics',
		description: 'DNA / RNA-based assays and molecular pathology.',
		tester_role: 'Medical Technologist',
		categories: [
			CAT('PCR',  'Molecular Biology (PCR)', 'RT-PCR / PCR panels: COVID-19, HPV, HBV/HCV viral load, TB GeneXpert.', '#0d9488'),
			CAT('GENE', 'Genetic Testing',         'Genotyping, cancer-mutation panels, pharmacogenomics.',                  '#14b8a6'),
		],
	},
	{
		code: 'IMG',
		name: 'Diagnostic Imaging',
		description: 'Image-based diagnostics reported as narrative reads by a radiologist.',
		tester_role: 'Radiologic Technologist',
		categories: [
			CAT('XRAY', 'X-ray / Radiography', 'Plain film studies: chest, abdomen, skeletal, KUB, dental.',          '#0ea5e9'),
			CAT('UTZ',  'Ultrasound',          'B-mode and Doppler ultrasound: whole abdomen, pelvic, thyroid, OB.',  '#38bdf8'),
			CAT('CT',   'CT Scan',             'Computed tomography with or without contrast.',                        '#0284c7'),
			CAT('MRI',  'MRI',                 'Magnetic resonance imaging studies.',                                  '#0369a1'),
			CAT('MAMM', 'Mammography',         'Screening and diagnostic mammography.',                                '#075985'),
			CAT('FLUO', 'Fluoroscopy',         'Real-time contrast studies (upper GI, barium enema, IVP, HSG).',       '#164e63'),
		],
	},
	{
		code: 'OTHR',
		name: 'Other Diagnostics',
		description: 'Cardio-pulmonary and physiologic tests reported outside the wet lab.',
		tester_role: 'Cardiovascular Technician',
		categories: [
			CAT('ECG',   'Electrocardiography (ECG)',       '12-lead ECG, stress ECG, Holter monitoring.',    '#ef4444'),
			CAT('ECHO',  'Echocardiography',                '2D echo, Doppler echo, transesophageal echo.',   '#f97316'),
			CAT('PFT',   'Pulmonary Function',              'Spirometry, lung volumes, diffusion capacity.',  '#eab308'),
			CAT('EEG',   'Electroencephalography (EEG)',    'Routine EEG, sleep-deprived EEG.',               '#84cc16'),
			CAT('AUDIO', 'Audiometry',                      'Pure-tone audiometry, tympanometry.',            '#22c55e'),
		],
	},
];

/**
 * Manifest of what's installable — light payload for the frontend checklist.
 */
export function getPreloadedGroupManifest() {
	return {
		groups: PRELOADED_GROUPS.map((g) => ({
			code: g.code,
			name: g.name,
			description: g.description,
			tester_role: g.tester_role ?? null,
			categories_count: g.categories.length,
			test_items_count: g.categories.reduce((s, c) => s + (c.test_items?.length || 0), 0),
			categories: g.categories.map((c) => ({
				code: c.code,
				name: c.name,
				color: c.color,
				description: c.description ?? null,
				test_items_count: c.test_items?.length || 0,
			})),
		})),
	};
}

/**
 * Install one or more pre-loaded groups (each with its categories + test
 * items) into the given tenant. `only_group_codes` filters — omit / pass
 * empty for the full catalog. Idempotent (upsert-based).
 *
 * Skips categories whose code already exists on the tenant but under a
 * DIFFERENT group — moving them would break existing tenant customizations.
 */
export async function seedPreloadedGroupsForTenant(
	trx: Knex.Transaction,
	tenant_uuid: string,
	actor: string = 'system-seed',
	options: { only_group_codes?: string[] } = {},
): Promise<{
	groupsCreated: number;
	categoriesCreated: number;
	testItemsCreated: number;
	skippedCategories: Array<{ group_code: string; category_code: string; reason: string }>;
}> {
	const only = options.only_group_codes && options.only_group_codes.length
		? new Set(options.only_group_codes)
		: null;
	const groups = only ? PRELOADED_GROUPS.filter((g) => only.has(g.code)) : PRELOADED_GROUPS;

	let groupsCreated = 0;
	let categoriesCreated = 0;
	let testItemsCreated = 0;
	const skippedCategories: Array<{ group_code: string; category_code: string; reason: string }> = [];

	for (const g of groups) {
		const before = await trx('item_groups').where({ tenant_uuid, code: g.code }).first();
		const groupUuid = await upsertItemGroupGeneric(trx, tenant_uuid, g, g.description, actor);
		if (!before) groupsCreated++;

		for (const cat of g.categories) {
			// Guard: same category code may exist on a different group (e.g. a
			// SERO in Clinical Laboratory won't be re-parented if the tenant
			// already has a SERO somewhere else). Skip and report rather than
			// silently move rows around.
			const existingCat = await trx('item_categories')
				.where({ tenant_uuid, code: cat.code })
				.first();
			if (existingCat && existingCat.item_group_uuid !== groupUuid) {
				skippedCategories.push({
					group_code: g.code,
					category_code: cat.code,
					reason: 'Category code already exists under a different group.',
				});
				continue;
			}

			const catBefore = existingCat;
			const catUuid = await upsertCategory(trx, tenant_uuid, groupUuid, cat, actor);
			if (!catBefore) categoriesCreated++;

			if (cat.test_items?.length) {
				for (const ti of cat.test_items) {
					const res = await upsertTestItem(trx, tenant_uuid, catUuid, ti, actor);
					if (res.created) testItemsCreated++;
				}
			}
		}
	}

	return { groupsCreated, categoriesCreated, testItemsCreated, skippedCategories };
}
