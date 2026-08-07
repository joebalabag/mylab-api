import type { Knex } from 'knex';

const TENANT_STORE_CODE = 'JB-LAB';

type ResultType = 'single' | 'panel' | 'narrative' | 'culture';

interface ComponentSeed {
	code: string;
	name: string;
	unit_of_measure?: string;
	reference_range?: string;
}

interface TestItemSeed {
	category_code: string;
	code: string;
	name: string;
	result_type: ResultType;
	specimen?: string;
	unit_of_measure?: string;
	reference_range?: string;
	price?: number;
	description?: string;
	components?: ComponentSeed[];
}

/**
 * Representative Philippine-lab menu across every seeded category. Prices are
 * illustrative averages; codes are tenant-unique. Panels ship with proper
 * sub-analyte components so the report renderer's panel template has real
 * rows to render.
 * Idempotent — safe to rerun.
 */
const ITEMS: TestItemSeed[] = [
	// ─── CLIN / CHEM (Clinical Chemistry) ──────────────────────────────
	{ category_code: 'CHEM', code: 'FBS',     name: 'Fasting Blood Sugar',        result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/dL', reference_range: '70-100', price: 100 },
	{ category_code: 'CHEM', code: 'RBS',     name: 'Random Blood Sugar',         result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/dL', reference_range: '<200',   price: 100 },
	{ category_code: 'CHEM', code: 'HBA1C',   name: 'HbA1c (Glycated Hemoglobin)', result_type: 'single', specimen: 'EDTA Blood', unit_of_measure: '%', reference_range: '4.0-6.0', price: 600 },
	{ category_code: 'CHEM', code: 'BUN',     name: 'Blood Urea Nitrogen',        result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/dL', reference_range: '7-20',   price: 120 },
	{ category_code: 'CHEM', code: 'CREA',    name: 'Creatinine',                 result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/dL', reference_range: '0.6-1.2', price: 120 },
	{ category_code: 'CHEM', code: 'UA',      name: 'Uric Acid',                  result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/dL', reference_range: '3.5-7.2', price: 150 },
	{ category_code: 'CHEM', code: 'SGPT',    name: 'SGPT (ALT)',                 result_type: 'single', specimen: 'Serum', unit_of_measure: 'U/L',   reference_range: '7-56',   price: 150 },
	{ category_code: 'CHEM', code: 'SGOT',    name: 'SGOT (AST)',                 result_type: 'single', specimen: 'Serum', unit_of_measure: 'U/L',   reference_range: '10-40',  price: 150 },
	{ category_code: 'CHEM', code: 'ALKP',    name: 'Alkaline Phosphatase',       result_type: 'single', specimen: 'Serum', unit_of_measure: 'U/L',   reference_range: '44-147', price: 180 },
	// Bilirubin — reported as a three-fraction panel. Kept in lockstep with
	// STANDARD_TEST_ITEMS in standard-catalog.ts (same code + components).
	{
		category_code: 'CHEM', code: 'BILI', name: 'Bilirubin', result_type: 'panel', specimen: 'Serum', price: 180,
		components: [
			{ code: 'BILI-T', name: 'Bilirubin Total',    unit_of_measure: 'mg/dL', reference_range: '0.20 – 1.20 mg/dL' },
			{ code: 'BILI-D', name: 'Bilirubin Direct',   unit_of_measure: 'mg/dL', reference_range: '0.00 – 0.30 mg/dL' },
			{ code: 'BILI-I', name: 'Bilirubin Indirect', unit_of_measure: 'mg/dL', reference_range: '0.10 – 1.00 mg/dL' },
		],
	},
	{ category_code: 'CHEM', code: 'NA',      name: 'Sodium',                     result_type: 'single', specimen: 'Serum', unit_of_measure: 'mEq/L', reference_range: '135-145', price: 150 },
	{ category_code: 'CHEM', code: 'K',       name: 'Potassium',                  result_type: 'single', specimen: 'Serum', unit_of_measure: 'mEq/L', reference_range: '3.5-5.0', price: 150 },
	{ category_code: 'CHEM', code: 'CL',      name: 'Chloride',                   result_type: 'single', specimen: 'Serum', unit_of_measure: 'mEq/L', reference_range: '96-106',  price: 150 },
	{ category_code: 'CHEM', code: 'CA',      name: 'Calcium (Total)',            result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/dL', reference_range: '8.5-10.2', price: 180 },
	{
		category_code: 'CHEM', code: 'LIPID', name: 'Lipid Profile',              result_type: 'panel',  specimen: 'Serum (fasting)', price: 500,
		description: 'Fasting lipid panel — total cholesterol, HDL, LDL, VLDL, triglycerides, and ratio.',
		components: [
			{ code: 'CHOL',  name: 'Total Cholesterol', unit_of_measure: 'mg/dL', reference_range: '<200' },
			{ code: 'TRIG',  name: 'Triglycerides',     unit_of_measure: 'mg/dL', reference_range: '<150' },
			{ code: 'HDL',   name: 'HDL Cholesterol',   unit_of_measure: 'mg/dL', reference_range: '>40 (M) / >50 (F)' },
			{ code: 'LDL',   name: 'LDL Cholesterol',   unit_of_measure: 'mg/dL', reference_range: '<100' },
			{ code: 'VLDL',  name: 'VLDL Cholesterol',  unit_of_measure: 'mg/dL', reference_range: '<30' },
			{ code: 'CRATIO', name: 'Total/HDL Ratio',  unit_of_measure: '',      reference_range: '<5.0' },
		],
	},

	// ─── CLIN / HEMA (Hematology) ──────────────────────────────────────
	{
		category_code: 'HEMA', code: 'CBC', name: 'Complete Blood Count', result_type: 'panel', specimen: 'EDTA Blood', price: 250,
		description: 'Automated CBC with 5-part differential.',
		components: [
			{ code: 'WBC',   name: 'White Blood Cell Count',       unit_of_measure: 'x10^9/L',  reference_range: '4.5-11.0' },
			{ code: 'RBC',   name: 'Red Blood Cell Count',         unit_of_measure: 'x10^12/L', reference_range: '4.5-5.9' },
			{ code: 'HGB',   name: 'Hemoglobin',                   unit_of_measure: 'g/dL',     reference_range: '13.5-17.5 (M) / 12.0-15.5 (F)' },
			{ code: 'HCT',   name: 'Hematocrit',                   unit_of_measure: '%',        reference_range: '41-53 (M) / 36-46 (F)' },
			{ code: 'MCV',   name: 'Mean Corpuscular Volume',      unit_of_measure: 'fL',       reference_range: '80-100' },
			{ code: 'MCH',   name: 'Mean Corpuscular Hemoglobin',  unit_of_measure: 'pg',       reference_range: '27-33' },
			{ code: 'MCHC',  name: 'MCHC',                         unit_of_measure: 'g/dL',     reference_range: '32-36' },
			{ code: 'RDW',   name: 'Red Cell Distribution Width',  unit_of_measure: '%',        reference_range: '11.5-14.5' },
			{ code: 'PLT',   name: 'Platelet Count',               unit_of_measure: 'x10^9/L',  reference_range: '150-450' },
			{ code: 'MPV',   name: 'Mean Platelet Volume',         unit_of_measure: 'fL',       reference_range: '7.4-10.4' },
			{ code: 'NEUT',  name: 'Neutrophils',                  unit_of_measure: '%',        reference_range: '40-70' },
			{ code: 'LYMPH', name: 'Lymphocytes',                  unit_of_measure: '%',        reference_range: '20-40' },
			{ code: 'MONO',  name: 'Monocytes',                    unit_of_measure: '%',        reference_range: '2-10' },
			{ code: 'EOS',   name: 'Eosinophils',                  unit_of_measure: '%',        reference_range: '1-6' },
			{ code: 'BASO',  name: 'Basophils',                    unit_of_measure: '%',        reference_range: '0-2' },
		],
	},
	{ category_code: 'HEMA', code: 'ESR',    name: 'Erythrocyte Sedimentation Rate', result_type: 'single', specimen: 'EDTA Blood', unit_of_measure: 'mm/hr', reference_range: '0-20 (M) / 0-30 (F)', price: 150 },
	{ category_code: 'HEMA', code: 'RETIC',  name: 'Reticulocyte Count',             result_type: 'single', specimen: 'EDTA Blood', unit_of_measure: '%',     reference_range: '0.5-1.5', price: 200 },
	{ category_code: 'HEMA', code: 'PSMEAR', name: 'Peripheral Blood Smear',         result_type: 'narrative', specimen: 'EDTA Blood', price: 250 },

	// ─── CLIN / COAG (Coagulation) ─────────────────────────────────────
	{ category_code: 'COAG', code: 'PT',    name: 'Prothrombin Time / INR', result_type: 'single', specimen: 'Citrated plasma', unit_of_measure: 'sec', reference_range: '10-13 (INR 0.8-1.2)', price: 250 },
	{ category_code: 'COAG', code: 'APTT',  name: 'Activated Partial Thromboplastin Time', result_type: 'single', specimen: 'Citrated plasma', unit_of_measure: 'sec', reference_range: '25-35', price: 250 },
	{ category_code: 'COAG', code: 'DDIM',  name: 'D-dimer', result_type: 'single', specimen: 'Citrated plasma', unit_of_measure: 'ng/mL', reference_range: '<500', price: 900 },
	{ category_code: 'COAG', code: 'FIB',   name: 'Fibrinogen', result_type: 'single', specimen: 'Citrated plasma', unit_of_measure: 'mg/dL', reference_range: '200-400', price: 500 },
	{ category_code: 'COAG', code: 'BT',    name: 'Bleeding Time (Ivy)', result_type: 'single', specimen: 'Skin puncture', unit_of_measure: 'min', reference_range: '2-8', price: 120 },
	{ category_code: 'COAG', code: 'CT',    name: 'Clotting Time', result_type: 'single', specimen: 'Whole blood', unit_of_measure: 'min', reference_range: '5-10', price: 120 },

	// ─── CLIN / SERO (Serology / Immunology) ───────────────────────────
	{ category_code: 'SERO', code: 'HBSAG',   name: 'HBsAg (Hepatitis B Surface Antigen)', result_type: 'single', specimen: 'Serum', reference_range: 'Non-reactive', price: 250 },
	{ category_code: 'SERO', code: 'ANTIHBS', name: 'Anti-HBs (Hepatitis B Surface Antibody)', result_type: 'single', specimen: 'Serum', unit_of_measure: 'mIU/mL', reference_range: '≥10 = protective', price: 350 },
	{ category_code: 'SERO', code: 'ANTIHCV', name: 'Anti-HCV', result_type: 'single', specimen: 'Serum', reference_range: 'Non-reactive', price: 400 },
	{ category_code: 'SERO', code: 'HIV',     name: 'HIV Screening', result_type: 'single', specimen: 'Serum', reference_range: 'Non-reactive', price: 300 },
	{ category_code: 'SERO', code: 'VDRL',    name: 'VDRL / RPR (Syphilis screen)', result_type: 'single', specimen: 'Serum', reference_range: 'Non-reactive', price: 200 },
	{ category_code: 'SERO', code: 'CRP',     name: 'C-Reactive Protein (Quantitative)', result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/L', reference_range: '<10', price: 350 },
	{ category_code: 'SERO', code: 'ASO',     name: 'Anti-Streptolysin O Titer', result_type: 'single', specimen: 'Serum', unit_of_measure: 'IU/mL', reference_range: '<200', price: 350 },
	{ category_code: 'SERO', code: 'RF',      name: 'Rheumatoid Factor', result_type: 'single', specimen: 'Serum', unit_of_measure: 'IU/mL', reference_range: '<14', price: 400 },
	{ category_code: 'SERO', code: 'PTEST',   name: 'Pregnancy Test (Qualitative)', result_type: 'single', specimen: 'Urine or Serum', reference_range: 'Negative / Positive', price: 100 },
	{
		category_code: 'SERO', code: 'DENG', name: 'Dengue Serology Panel', result_type: 'panel', specimen: 'Serum', price: 800,
		description: 'NS1 antigen + IgM/IgG antibodies.',
		components: [
			{ code: 'NS1', name: 'Dengue NS1 Antigen', reference_range: 'Non-reactive' },
			{ code: 'IGM', name: 'Dengue IgM Antibody', reference_range: 'Non-reactive' },
			{ code: 'IGG', name: 'Dengue IgG Antibody', reference_range: 'Non-reactive' },
		],
	},

	// ─── CLIN / MICR (Microbiology) ────────────────────────────────────
	{ category_code: 'MICR', code: 'GRAM',   name: 'Gram Stain',           result_type: 'narrative', specimen: 'Swab / body fluid', price: 200 },
	{ category_code: 'MICR', code: 'AFB',    name: 'AFB Stain (Ziehl-Neelsen)', result_type: 'narrative', specimen: 'Sputum', price: 200 },
	{ category_code: 'MICR', code: 'KOH',    name: 'KOH Preparation',      result_type: 'narrative', specimen: 'Skin scraping', price: 200 },
	{ category_code: 'MICR', code: 'CSURN',  name: 'Urine Culture & Sensitivity',  result_type: 'culture', specimen: 'Clean-catch urine', price: 700 },
	{ category_code: 'MICR', code: 'CSBLD',  name: 'Blood Culture & Sensitivity',  result_type: 'culture', specimen: 'Blood',              price: 1200 },
	{ category_code: 'MICR', code: 'CSSPU',  name: 'Sputum Culture & Sensitivity', result_type: 'culture', specimen: 'Sputum',             price: 700 },
	{ category_code: 'MICR', code: 'CSWND',  name: 'Wound Culture & Sensitivity',  result_type: 'culture', specimen: 'Wound swab',         price: 700 },

	// ─── CLIN / CMIC (Clinical Microscopy) ─────────────────────────────
	{
		category_code: 'CMIC', code: 'URIN', name: 'Urinalysis (Routine)', result_type: 'panel', specimen: 'Random urine', price: 150,
		description: 'Physical, chemical, and microscopic examination.',
		components: [
			{ code: 'UCOLOR', name: 'Color',              reference_range: 'Yellow' },
			{ code: 'UAPPR',  name: 'Appearance',         reference_range: 'Clear' },
			{ code: 'UPH',    name: 'pH',                 reference_range: '4.5-8.0' },
			{ code: 'USG',    name: 'Specific Gravity',   reference_range: '1.005-1.030' },
			{ code: 'UPROT',  name: 'Protein',            reference_range: 'Negative' },
			{ code: 'UGLU',   name: 'Glucose',            reference_range: 'Negative' },
			{ code: 'UKET',   name: 'Ketones',            reference_range: 'Negative' },
			{ code: 'UBLD',   name: 'Blood',              reference_range: 'Negative' },
			{ code: 'UBIL',   name: 'Bilirubin',          reference_range: 'Negative' },
			{ code: 'UURO',   name: 'Urobilinogen',       reference_range: 'Normal' },
			{ code: 'UNIT',   name: 'Nitrites',           reference_range: 'Negative' },
			{ code: 'ULEU',   name: 'Leukocyte Esterase', reference_range: 'Negative' },
			{ code: 'UWBC',   name: 'WBC (microscopic)',  unit_of_measure: '/hpf', reference_range: '0-5' },
			{ code: 'URBC',   name: 'RBC (microscopic)',  unit_of_measure: '/hpf', reference_range: '0-2' },
			{ code: 'UEPI',   name: 'Epithelial Cells',   unit_of_measure: '/hpf', reference_range: 'Few' },
			{ code: 'UBACT',  name: 'Bacteria',           reference_range: 'None seen' },
			{ code: 'UCAST',  name: 'Casts',              reference_range: 'None seen' },
			{ code: 'UCRYST', name: 'Crystals',           reference_range: 'None seen' },
			{ code: 'UMUC',   name: 'Mucus Threads',      reference_range: 'Few' },
		],
	},
	{
		category_code: 'CMIC', code: 'FECA', name: 'Fecalysis (Routine)', result_type: 'panel', specimen: 'Random stool', price: 120,
		description: 'Macro + microscopic stool examination.',
		components: [
			{ code: 'FCOL',   name: 'Color',           reference_range: 'Brown' },
			{ code: 'FCONS',  name: 'Consistency',     reference_range: 'Formed' },
			{ code: 'FOB',    name: 'Occult Blood',    reference_range: 'Negative' },
			{ code: 'FPARA',  name: 'Parasites / Ova', reference_range: 'No ova/parasites seen' },
			{ code: 'FWBC',   name: 'WBC',             unit_of_measure: '/hpf', reference_range: '0-3' },
			{ code: 'FRBC',   name: 'RBC',             unit_of_measure: '/hpf', reference_range: '0-1' },
			{ code: 'FYEAST', name: 'Yeast Cells',     reference_range: 'None seen' },
			{ code: 'FFAT',   name: 'Fat Globules',    reference_range: 'None seen' },
		],
	},
	{
		category_code: 'CMIC', code: 'SEMA', name: 'Semen Analysis', result_type: 'panel', specimen: 'Semen (3-5 days abstinence)', price: 800,
		components: [
			{ code: 'SVOL',  name: 'Volume',              unit_of_measure: 'mL',        reference_range: '≥1.5' },
			{ code: 'SCONC', name: 'Concentration',       unit_of_measure: 'x10^6/mL', reference_range: '≥15' },
			{ code: 'SMOT',  name: 'Motility (progressive)', unit_of_measure: '%',    reference_range: '≥32' },
			{ code: 'SMORP', name: 'Morphology (normal forms)', unit_of_measure: '%', reference_range: '≥4' },
			{ code: 'SPH',   name: 'pH',                  reference_range: '7.2-8.0' },
			{ code: 'SLIQ',  name: 'Liquefaction Time',   unit_of_measure: 'min',     reference_range: '<60' },
		],
	},

	// ─── CLIN / PARA (Parasitology) ────────────────────────────────────
	{ category_code: 'PARA', code: 'MALS',  name: 'Malaria Smear',           result_type: 'single', specimen: 'EDTA Blood', reference_range: 'No malaria parasites seen', price: 250 },
	{ category_code: 'PARA', code: 'OVAP',  name: 'Stool for Ova & Parasites', result_type: 'narrative', specimen: 'Stool', price: 200 },

	// ─── CLIN / BBNK (Blood Bank) ──────────────────────────────────────
	{ category_code: 'BBNK', code: 'BLDTP',  name: 'Blood Typing (ABO + Rh)', result_type: 'single', specimen: 'EDTA Blood', reference_range: 'Report ABO group + Rh', price: 150 },
	{ category_code: 'BBNK', code: 'XM',     name: 'Cross Matching',          result_type: 'single', specimen: 'EDTA Blood', reference_range: 'Compatible / Incompatible', price: 400 },
	{ category_code: 'BBNK', code: 'DCOOMBS', name: 'Direct Coombs Test',     result_type: 'single', specimen: 'EDTA Blood', reference_range: 'Negative', price: 450 },
	{ category_code: 'BBNK', code: 'ICOOMBS', name: 'Indirect Coombs Test',   result_type: 'single', specimen: 'Serum',      reference_range: 'Negative', price: 450 },

	// ─── CLIN / ENDO (Endocrinology / Hormones) ────────────────────────
	{ category_code: 'ENDO', code: 'TSH',   name: 'TSH (Thyroid Stimulating Hormone)', result_type: 'single', specimen: 'Serum', unit_of_measure: 'μIU/mL', reference_range: '0.4-4.0', price: 500 },
	{ category_code: 'ENDO', code: 'FT4',   name: 'Free T4',   result_type: 'single', specimen: 'Serum', unit_of_measure: 'ng/dL', reference_range: '0.8-1.8', price: 550 },
	{ category_code: 'ENDO', code: 'FT3',   name: 'Free T3',   result_type: 'single', specimen: 'Serum', unit_of_measure: 'pg/mL', reference_range: '2.3-4.2', price: 550 },
	{ category_code: 'ENDO', code: 'CORT',  name: 'Cortisol (AM)', result_type: 'single', specimen: 'Serum', unit_of_measure: 'μg/dL', reference_range: '6-23',  price: 650 },
	{ category_code: 'ENDO', code: 'PSA',   name: 'Prostate Specific Antigen', result_type: 'single', specimen: 'Serum', unit_of_measure: 'ng/mL', reference_range: '<4.0', price: 800 },
	{ category_code: 'ENDO', code: 'CEA',   name: 'Carcinoembryonic Antigen',  result_type: 'single', specimen: 'Serum', unit_of_measure: 'ng/mL', reference_range: '<5.0 (non-smoker)', price: 900 },
	{ category_code: 'ENDO', code: 'AFP',   name: 'Alpha-Fetoprotein',         result_type: 'single', specimen: 'Serum', unit_of_measure: 'ng/mL', reference_range: '<10', price: 900 },
	{ category_code: 'ENDO', code: 'CA125', name: 'CA 125',                    result_type: 'single', specimen: 'Serum', unit_of_measure: 'U/mL',  reference_range: '<35', price: 1100 },
	{ category_code: 'ENDO', code: 'BHCG',  name: 'Beta-hCG (Quantitative)',   result_type: 'single', specimen: 'Serum', unit_of_measure: 'mIU/mL', reference_range: '<5 (non-pregnant)', price: 700 },

	// ─── CLIN / TOXI (Toxicology) ──────────────────────────────────────
	{
		category_code: 'TOXI', code: 'DOA5', name: 'Drug Test — 5 Panel', result_type: 'panel', specimen: 'Urine', price: 500,
		components: [
			{ code: 'AMP',  name: 'Amphetamines',      reference_range: 'Negative' },
			{ code: 'MET',  name: 'Methamphetamine',   reference_range: 'Negative' },
			{ code: 'COC',  name: 'Cocaine metabolite', reference_range: 'Negative' },
			{ code: 'OPI',  name: 'Opiates',           reference_range: 'Negative' },
			{ code: 'THC',  name: 'THC / Cannabinoids', reference_range: 'Negative' },
		],
	},
	{ category_code: 'TOXI', code: 'ETOH', name: 'Blood Alcohol Level', result_type: 'single', specimen: 'Serum', unit_of_measure: 'mg/dL', reference_range: '<10', price: 500 },

	// ─── PATH / HIST (Histopathology) ──────────────────────────────────
	{ category_code: 'HIST', code: 'BIOP',   name: 'Biopsy — Small Specimen',    result_type: 'narrative', specimen: 'Tissue (biopsy)', price: 2000 },
	{ category_code: 'HIST', code: 'BIOPL',  name: 'Biopsy — Large / Complex',   result_type: 'narrative', specimen: 'Tissue (surgical)', price: 3500 },

	// ─── PATH / CYTO (Cytology) ────────────────────────────────────────
	{ category_code: 'CYTO', code: 'PAP',    name: 'Pap Smear (Conventional)',   result_type: 'narrative', specimen: 'Cervical scrape', price: 500 },
	{ category_code: 'CYTO', code: 'FNAB',   name: 'Fine Needle Aspiration Biopsy', result_type: 'narrative', specimen: 'Aspirate',    price: 1500 },
	{ category_code: 'CYTO', code: 'FLUIDC', name: 'Body Fluid Cytology',        result_type: 'narrative', specimen: 'Pleural / peritoneal fluid', price: 1200 },

	// ─── PATH / IHC (Immunohistochemistry) ─────────────────────────────
	{ category_code: 'IHC',  code: 'IHC1',   name: 'IHC — Single Marker',        result_type: 'narrative', specimen: 'Paraffin-embedded tissue', price: 1500 },
	{ category_code: 'IHC',  code: 'IHCBR',  name: 'Breast Cancer IHC Panel (ER/PR/HER2/Ki-67)', result_type: 'narrative', specimen: 'Breast tissue block', price: 6000 },

	// ─── MOL / PCR ─────────────────────────────────────────────────────
	{ category_code: 'PCR',  code: 'COVPCR', name: 'SARS-CoV-2 RT-PCR',          result_type: 'single', specimen: 'Nasopharyngeal swab', reference_range: 'Not detected', price: 1800 },
	{ category_code: 'PCR',  code: 'HPVDNA', name: 'HPV DNA (High-risk types)',  result_type: 'single', specimen: 'Cervical sample', reference_range: 'Not detected', price: 2500 },
	{ category_code: 'PCR',  code: 'HBVQ',   name: 'HBV DNA (Quantitative)',     result_type: 'single', specimen: 'Serum', unit_of_measure: 'IU/mL', reference_range: 'Below detection limit', price: 4000 },
	{ category_code: 'PCR',  code: 'TBGEN',  name: 'TB GeneXpert (MTB/RIF)',     result_type: 'single', specimen: 'Sputum', reference_range: 'MTB not detected', price: 1200 },

	// ─── MOL / GENE ────────────────────────────────────────────────────
	{ category_code: 'GENE', code: 'BRCA',   name: 'BRCA1 / BRCA2 Sequencing',   result_type: 'narrative', specimen: 'EDTA Blood', price: 22000 },
	{ category_code: 'GENE', code: 'EGFR',   name: 'EGFR Mutation Analysis',     result_type: 'narrative', specimen: 'Tumor tissue', price: 15000 },

	// ─── IMG / XRAY ────────────────────────────────────────────────────
	{ category_code: 'XRAY', code: 'CXRPA',  name: 'Chest X-ray (PA)',           result_type: 'narrative', specimen: 'Chest PA', price: 300 },
	{ category_code: 'XRAY', code: 'CXRPAL', name: 'Chest X-ray (PA & Lateral)', result_type: 'narrative', specimen: 'Chest PA & Lateral', price: 400 },
	{ category_code: 'XRAY', code: 'ABDX',   name: 'Plain Abdomen (Supine)',     result_type: 'narrative', specimen: 'Abdomen', price: 350 },
	{ category_code: 'XRAY', code: 'KUB',    name: 'KUB (Kidneys, Ureters, Bladder)', result_type: 'narrative', specimen: 'KUB projection', price: 400 },
	{ category_code: 'XRAY', code: 'CSPN',   name: 'Cervical Spine X-ray',       result_type: 'narrative', specimen: 'Cervical spine (AP/Lat)', price: 500 },
	{ category_code: 'XRAY', code: 'LSPN',   name: 'Lumbosacral Spine X-ray',    result_type: 'narrative', specimen: 'LS spine (AP/Lat)', price: 550 },
	{ category_code: 'XRAY', code: 'EXTX',   name: 'Extremity X-ray (per part)', result_type: 'narrative', specimen: 'Extremity', price: 400 },

	// ─── IMG / UTZ ─────────────────────────────────────────────────────
	{ category_code: 'UTZ',  code: 'UTZWA',  name: 'Whole Abdomen Ultrasound',   result_type: 'narrative', specimen: 'Whole abdomen', price: 900 },
	{ category_code: 'UTZ',  code: 'UTZUA',  name: 'Upper Abdomen Ultrasound',   result_type: 'narrative', specimen: 'Upper abdomen', price: 700 },
	{ category_code: 'UTZ',  code: 'UTZLA',  name: 'Lower Abdomen Ultrasound',   result_type: 'narrative', specimen: 'Lower abdomen', price: 700 },
	{ category_code: 'UTZ',  code: 'UTZPEL', name: 'Pelvic Ultrasound',          result_type: 'narrative', specimen: 'Pelvis', price: 800 },
	{ category_code: 'UTZ',  code: 'UTZTV',  name: 'Transvaginal Ultrasound',    result_type: 'narrative', specimen: 'Pelvis (transvaginal)', price: 1200 },
	{ category_code: 'UTZ',  code: 'UTZTHY', name: 'Thyroid Ultrasound',         result_type: 'narrative', specimen: 'Thyroid', price: 900 },
	{ category_code: 'UTZ',  code: 'UTZBRS', name: 'Breast Ultrasound',          result_type: 'narrative', specimen: 'Bilateral breasts', price: 1200 },
	{ category_code: 'UTZ',  code: 'UTZOB1', name: 'OB Ultrasound (1st Trimester)', result_type: 'narrative', specimen: 'Gravid uterus', price: 900 },
	{ category_code: 'UTZ',  code: 'UTZOB2', name: 'OB Ultrasound (2nd/3rd Trimester)', result_type: 'narrative', specimen: 'Gravid uterus', price: 1100 },
	{ category_code: 'UTZ',  code: 'UTZCAS', name: 'Congenital Anomaly Scan',    result_type: 'narrative', specimen: 'Gravid uterus (20-24 wks)', price: 2500 },

	// ─── IMG / CT ──────────────────────────────────────────────────────
	{ category_code: 'CT',   code: 'CTCR',   name: 'Cranial CT (Plain)',         result_type: 'narrative', specimen: 'Cranium', price: 4500 },
	{ category_code: 'CT',   code: 'CTCH',   name: 'Chest CT (Plain)',           result_type: 'narrative', specimen: 'Thorax',  price: 5500 },
	{ category_code: 'CT',   code: 'CTAB',   name: 'Abdominal CT (Plain)',       result_type: 'narrative', specimen: 'Abdomen', price: 6000 },
	{ category_code: 'CT',   code: 'CTABC',  name: 'Abdominal CT with Contrast', result_type: 'narrative', specimen: 'Abdomen (contrast)', price: 8500 },

	// ─── IMG / MRI ─────────────────────────────────────────────────────
	{ category_code: 'MRI',  code: 'MRIBR',  name: 'MRI Brain (Plain)',          result_type: 'narrative', specimen: 'Brain', price: 9500 },
	{ category_code: 'MRI',  code: 'MRILSP', name: 'MRI Lumbar Spine',           result_type: 'narrative', specimen: 'Lumbar spine', price: 10500 },
	{ category_code: 'MRI',  code: 'MRIKN',  name: 'MRI Knee',                   result_type: 'narrative', specimen: 'Knee joint',   price: 11000 },

	// ─── IMG / MAMM ────────────────────────────────────────────────────
	{ category_code: 'MAMM', code: 'MAMSCR', name: 'Screening Mammography',      result_type: 'narrative', specimen: 'Bilateral breasts', price: 1500 },
	{ category_code: 'MAMM', code: 'MAMDX',  name: 'Diagnostic Mammography',     result_type: 'narrative', specimen: 'Bilateral breasts', price: 2500 },

	// ─── IMG / FLUO ────────────────────────────────────────────────────
	{ category_code: 'FLUO', code: 'BASW',   name: 'Barium Swallow',             result_type: 'narrative', specimen: 'Esophagus (contrast)', price: 2500 },
	{ category_code: 'FLUO', code: 'UGIS',   name: 'Upper GI Series',            result_type: 'narrative', specimen: 'Stomach + duodenum (contrast)', price: 3500 },
	{ category_code: 'FLUO', code: 'IVP',    name: 'Intravenous Pyelogram',      result_type: 'narrative', specimen: 'KUB (IV contrast)', price: 4000 },
	{ category_code: 'FLUO', code: 'HSG',    name: 'Hysterosalpingography',      result_type: 'narrative', specimen: 'Uterus + tubes (contrast)', price: 4500 },

	// ─── OTHR / ECG ────────────────────────────────────────────────────
	{ category_code: 'ECG',  code: 'ECG12',  name: '12-lead ECG',                result_type: 'narrative', specimen: '12-lead', price: 250 },
	{ category_code: 'ECG',  code: 'TMET',   name: 'Treadmill Stress Test',      result_type: 'narrative', specimen: 'Bruce / modified Bruce protocol', price: 2500 },
	{ category_code: 'ECG',  code: 'HLTR',   name: 'Holter Monitoring (24 hr)',  result_type: 'narrative', specimen: 'Ambulatory ECG', price: 4000 },

	// ─── OTHR / ECHO ───────────────────────────────────────────────────
	{ category_code: 'ECHO', code: '2DECHO', name: '2D Echo with Doppler',       result_type: 'narrative', specimen: 'Precordium', price: 3000 },

	// ─── OTHR / PFT ────────────────────────────────────────────────────
	{ category_code: 'PFT',  code: 'SPIRO',  name: 'Spirometry',                 result_type: 'narrative', specimen: 'Pulmonary (spirometer)', price: 800 },
	{ category_code: 'PFT',  code: 'SPIROBD', name: 'Spirometry with Bronchodilator', result_type: 'narrative', specimen: 'Pulmonary (pre/post BD)', price: 1200 },

	// ─── OTHR / EEG ────────────────────────────────────────────────────
	{ category_code: 'EEG',  code: 'REEG',   name: 'Routine EEG',                result_type: 'narrative', specimen: '10-20 lead EEG', price: 2500 },

	// ─── OTHR / AUDIO ──────────────────────────────────────────────────
	{ category_code: 'AUDIO', code: 'PTA',   name: 'Pure-tone Audiometry',       result_type: 'narrative', specimen: 'Bilateral ears', price: 600 },
	{ category_code: 'AUDIO', code: 'TYMP',  name: 'Tympanometry',               result_type: 'narrative', specimen: 'Bilateral ears', price: 500 },
];

export async function seed(knex: Knex): Promise<void> {
	const tenant = await knex('tenants').where({ store_code: TENANT_STORE_CODE }).first();
	if (!tenant) return;

	// Preload categories once so we can resolve category_code → uuid without
	// hammering the DB with one lookup per test item.
	const categoryRows = await knex('item_categories')
		.where({ tenant_uuid: tenant.uuid })
		.select('uuid', 'code');
	const categoryByCode = new Map<string, string>(categoryRows.map((r: any) => [r.code, r.uuid]));

	for (const item of ITEMS) {
		const category_uuid = categoryByCode.get(item.category_code);
		if (!category_uuid) {
			// eslint-disable-next-line no-console
			console.warn(`[seed 07] Skipping ${item.code}: category ${item.category_code} not found.`);
			continue;
		}

		let row = await knex('test_items')
			.where({ tenant_uuid: tenant.uuid, code: item.code })
			.first();
		if (!row) {
			const [inserted] = await knex('test_items')
				.insert({
					tenant_uuid: tenant.uuid,
					item_category_uuid: category_uuid,
					code: item.code,
					name: item.name,
					result_type: item.result_type,
					specimen: item.specimen ?? null,
					unit_of_measure: item.unit_of_measure ?? null,
					reference_range: item.reference_range ?? null,
					price: item.price ?? 0,
					description: item.description ?? null,
					status: 'active',
					created_by: 'seed',
				})
				.returning('*');
			row = inserted;
		}

		if (item.result_type === 'panel' && item.components?.length) {
			for (let i = 0; i < item.components.length; i++) {
				const c = item.components[i];
				const exists = await knex('test_item_components')
					.where({ test_item_uuid: row.uuid, code: c.code })
					.first();
				if (exists) continue;
				await knex('test_item_components').insert({
					tenant_uuid: tenant.uuid,
					test_item_uuid: row.uuid,
					code: c.code,
					name: c.name,
					unit_of_measure: c.unit_of_measure ?? null,
					reference_range: c.reference_range ?? null,
					display_order: i,
					created_by: 'seed',
				});
			}
		}
	}
}
