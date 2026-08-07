import type { Knex } from 'knex';

const TENANT_STORE_CODE = 'JB-LAB';

interface GroupSeed {
	code: string;
	name: string;
	description: string;
	categories: Array<{ code: string; name: string; description: string }>;
}

/**
 * Standard medical-laboratory taxonomy for Joebalabag Laboratory. Groups
 * follow the usual clinical / anatomic / molecular split; categories are the
 * individual lab sections (Clinical Chemistry, Hematology, Serology, etc.).
 * Idempotent — safe to rerun.
 */
const GROUPS: GroupSeed[] = [
	{
		code: 'CLIN',
		name: 'Clinical Laboratory',
		description: 'Routine wet-lab diagnostics performed on blood, urine, and other body fluids.',
		categories: [
			{
				code: 'CHEM',
				name: 'Clinical Chemistry',
				description: 'Serum, plasma, and urine chemistry panels (glucose, lipids, liver, kidney, electrolytes).',
			},
			{
				code: 'HEMA',
				name: 'Hematology',
				description: 'Complete blood count, peripheral smear, RBC/WBC morphology, ESR.',
			},
			{
				code: 'COAG',
				name: 'Coagulation',
				description: 'PT/INR, aPTT, bleeding/clotting time, D-dimer, fibrinogen.',
			},
			{
				code: 'SERO',
				name: 'Serology / Immunology',
				description: 'Antibody / antigen tests: hepatitis panel, HIV, dengue, syphilis, ANA.',
			},
			{
				code: 'MICR',
				name: 'Microbiology',
				description: 'Culture and sensitivity, Gram stain, AFB stain, KOH prep.',
			},
			{
				code: 'CMIC',
				name: 'Clinical Microscopy',
				description: 'Urinalysis, fecalysis, semen analysis, body-fluid analysis.',
			},
			{
				code: 'PARA',
				name: 'Parasitology',
				description: 'Stool O&P, blood parasite smears, malaria RDT.',
			},
			{
				code: 'BBNK',
				name: 'Blood Bank',
				description: 'Blood typing, crossmatching, antibody screening, direct/indirect Coombs.',
			},
			{
				code: 'ENDO',
				name: 'Endocrinology',
				description: 'Thyroid panel, reproductive hormones, cortisol, HbA1c.',
			},
			{
				code: 'TOXI',
				name: 'Toxicology',
				description: 'Therapeutic drug monitoring and drug-of-abuse screening.',
			},
		],
	},
	{
		code: 'PATH',
		name: 'Anatomic Pathology',
		description: 'Tissue-based diagnostics including biopsy and cytology specimens.',
		categories: [
			{
				code: 'HIST',
				name: 'Histopathology',
				description: 'Surgical biopsy processing, H&E staining, tissue diagnosis.',
			},
			{
				code: 'CYTO',
				name: 'Cytology',
				description: 'Pap smears, FNAB, body-fluid cytology, exfoliative cytology.',
			},
			{
				code: 'IHC',
				name: 'Immunohistochemistry',
				description: 'IHC staining for tumor markers and tissue-antigen identification.',
			},
		],
	},
	{
		code: 'MOL',
		name: 'Molecular Diagnostics',
		description: 'DNA / RNA-based assays and molecular pathology.',
		categories: [
			{
				code: 'PCR',
				name: 'Molecular Biology (PCR)',
				description: 'RT-PCR and PCR panels: COVID-19, HPV, HBV/HCV viral load, TB GeneXpert.',
			},
			{
				code: 'GENE',
				name: 'Genetic Testing',
				description: 'Genotyping, cancer-mutation panels, pharmacogenomics.',
			},
		],
	},
	{
		code: 'IMG',
		name: 'Diagnostic Imaging',
		description: 'Image-based diagnostics reported as narrative reads by a radiologist.',
		categories: [
			{
				code: 'XRAY',
				name: 'X-ray / Radiography',
				description: 'Plain film studies: chest, abdomen, skeletal, KUB, dental.',
			},
			{
				code: 'UTZ',
				name: 'Ultrasound',
				description: 'B-mode and Doppler ultrasound: whole abdomen, pelvic, thyroid, breast, OB.',
			},
			{
				code: 'CT',
				name: 'CT Scan',
				description: 'Computed tomography with or without contrast.',
			},
			{
				code: 'MRI',
				name: 'MRI',
				description: 'Magnetic resonance imaging studies.',
			},
			{
				code: 'MAMM',
				name: 'Mammography',
				description: 'Screening and diagnostic mammography.',
			},
			{
				code: 'FLUO',
				name: 'Fluoroscopy',
				description: 'Real-time contrast studies (upper GI, barium enema, IVP, HSG).',
			},
		],
	},
	{
		code: 'OTHR',
		name: 'Other Diagnostics',
		description: 'Cardio-pulmonary and physiologic tests reported outside the wet lab.',
		categories: [
			{
				code: 'ECG',
				name: 'Electrocardiography (ECG)',
				description: '12-lead ECG, stress ECG, Holter monitoring.',
			},
			{
				code: 'ECHO',
				name: 'Echocardiography',
				description: '2D echo, Doppler echo, transesophageal echo (TEE).',
			},
			{
				code: 'PFT',
				name: 'Pulmonary Function',
				description: 'Spirometry, lung volumes, diffusion capacity.',
			},
			{
				code: 'EEG',
				name: 'Electroencephalography (EEG)',
				description: 'Routine EEG, sleep-deprived EEG.',
			},
			{
				code: 'AUDIO',
				name: 'Audiometry',
				description: 'Pure-tone audiometry, tympanometry.',
			},
		],
	},
];

export async function seed(knex: Knex): Promise<void> {
	const tenant = await knex('tenants').where({ store_code: TENANT_STORE_CODE }).first();
	if (!tenant) {
		// Tenant hasn't been seeded yet — nothing to attach items to.
		return;
	}

	for (const g of GROUPS) {
		let group = await knex('item_groups')
			.where({ tenant_uuid: tenant.uuid, code: g.code })
			.first();
		if (!group) {
			const [inserted] = await knex('item_groups')
				.insert({
					tenant_uuid: tenant.uuid,
					code: g.code,
					name: g.name,
					description: g.description,
					status: 'active',
					created_by: 'seed',
				})
				.returning('*');
			group = inserted;
		}

		for (const c of g.categories) {
			const existing = await knex('item_categories')
				.where({ tenant_uuid: tenant.uuid, code: c.code })
				.first();
			if (existing) continue;

			await knex('item_categories').insert({
				tenant_uuid: tenant.uuid,
				item_group_uuid: group.uuid,
				code: c.code,
				name: c.name,
				description: c.description,
				status: 'active',
				created_by: 'seed',
			});
		}
	}
}
