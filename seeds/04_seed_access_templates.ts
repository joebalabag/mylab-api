import type { Knex } from 'knex';

interface Row {
	navigation_id: number;
	catalog_id: number;
	catalog: string;
	main_navigation: string;
	sub_navigation: string;
	remarks: string;
}

const ROWS: Row[] = [
	{
		navigation_id: 23,
		catalog_id: 1,
		catalog: 'expenses',
		main_navigation: 'expenses',
		sub_navigation: 'all-access',
		remarks: 'Log and manage tenant expenses (utilities, supplies, etc.). Includes create, edit, void, and delete.',
	},
	{
		navigation_id: 6,
		catalog_id: 4,
		catalog: 'catalog',
		main_navigation: 'discounts',
		sub_navigation: 'all-access',
		remarks: 'Configure discount rules (fixed, percentage, senior/PWD) that cashiers can apply at checkout.',
	},
	{
		navigation_id: 100,
		catalog_id: 1,
		catalog: 'catalog',
		main_navigation: 'item groups',
		sub_navigation: 'all-access',
		remarks: 'Create and manage top-level item groups (e.g., Reagents, Consumables) that organize the inventory.',
	},
	{
		navigation_id: 101,
		catalog_id: 2,
		catalog: 'catalog',
		main_navigation: 'item categories',
		sub_navigation: 'all-access',
		remarks: 'Create and manage item categories under each item group (e.g., Blood Chemistry under Reagents).',
	},
	{
		navigation_id: 102,
		catalog_id: 3,
		catalog: 'catalog',
		main_navigation: 'test items',
		sub_navigation: 'all-access',
		remarks: 'Create and manage individual test items (single / panel / narrative / culture) grouped by category.',
	},
	{
		navigation_id: 200,
		catalog_id: 1,
		catalog: 'patients',
		main_navigation: 'patients',
		sub_navigation: 'all-access',
		remarks: 'Register and manage patient master records. Search-first on Add to reduce duplicates.',
	},
	{
		navigation_id: 103,
		catalog_id: 4,
		catalog: 'catalog',
		main_navigation: 'item packages',
		sub_navigation: 'all-access',
		remarks: 'Bundle test items into packages at a discounted price. Used for patient requisition and payment.',
	},
	{
		navigation_id: 201,
		catalog_id: 2,
		catalog: 'patients',
		main_navigation: 'patient cases',
		sub_navigation: 'all-access',
		remarks: 'Register patient cases (OPD / IPD / ER) and add test requisitions against each case.',
	},
	// nav 202 (cashier all-access) and nav 203 (laboratory all-access) were
	// retired in favor of the fine-grained rows below. The corresponding
	// user_accesses rows were dropped by migration 20260806001700.
	{
		navigation_id: 10,
		catalog_id: 1,
		catalog: 'administrative',
		main_navigation: 'user management',
		sub_navigation: 'add user',
		remarks: 'Create new user accounts belonging to this tenant.',
	},
	{
		navigation_id: 11,
		catalog_id: 2,
		catalog: 'administrative',
		main_navigation: 'user management',
		sub_navigation: 'edit user',
		remarks: 'Modify existing user profile fields (name, role, contact info).',
	},
	{
		navigation_id: 12,
		catalog_id: 3,
		catalog: 'administrative',
		main_navigation: 'user management',
		sub_navigation: 'change password',
		remarks: 'Reset or update the login password of any tenant user.',
	},
	{
		navigation_id: 13,
		catalog_id: 4,
		catalog: 'administrative',
		main_navigation: 'user management',
		sub_navigation: 'assign access',
		remarks: 'Grant or revoke navigation permissions (this access matrix) for other users.',
	},
	{
		navigation_id: 14,
		catalog_id: 5,
		catalog: 'administrative',
		main_navigation: 'user management',
		sub_navigation: 'activate/deactivate user',
		remarks: 'Enable or disable a user account without deleting it.',
	},
	{
		navigation_id: 15,
		catalog_id: 6,
		catalog: 'administrative',
		main_navigation: 'user management',
		sub_navigation: 'delete user',
		remarks: 'Permanently remove a user account and its associated login credentials.',
	},
	{
		navigation_id: 16,
		catalog_id: 7,
		catalog: 'administrative',
		main_navigation: 'subscription',
		sub_navigation: 'all-access',
		remarks: 'View the current subscription, submit payment receipts, and see billing history.',
	},
	{
		navigation_id: 17,
		catalog_id: 8,
		catalog: 'administrative',
		main_navigation: 'store settings',
		sub_navigation: 'all-access',
		remarks: 'Edit the tenant profile: display name, address, logo, receipt header/footer, TIN, and other store-wide settings.',
	},

	// ─── Cashier — fine-grained ────────────────────────────────────────
	// Kept alongside the existing `cashier all-access` row (nav 202) so
	// legacy grants still work; new tenants can use these narrower perms.
	{
		navigation_id: 210,
		catalog_id: 5,
		catalog: 'patients',
		main_navigation: 'cashier',
		sub_navigation: 'dashboard',
		remarks: 'Open the Cashier page — view the payments list, filter, search, and re-print receipts.',
	},
	{
		navigation_id: 211,
		catalog_id: 6,
		catalog: 'patients',
		main_navigation: 'cashier',
		sub_navigation: 'new payment',
		remarks: 'Create a new payment against a patient case\'s unpaid requisition items (cash, ewallet, bank transfer, or arrangement).',
	},
	{
		navigation_id: 212,
		catalog_id: 7,
		catalog: 'patients',
		main_navigation: 'cashier',
		sub_navigation: 'void',
		remarks: 'Void a completed payment. Requires a supervisor re-authentication before the void goes through.',
	},
	{
		navigation_id: 213,
		catalog_id: 8,
		catalog: 'patients',
		main_navigation: 'cashier',
		sub_navigation: 'resolve arrangement',
		remarks: 'Mark an A/R, insurance, paid-outside, or other arrangement as settled by capturing the real method received.',
	},

	// ─── Laboratory — fine-grained ─────────────────────────────────────
	// Kept alongside the existing `laboratory all-access` row (nav 203).
	{
		navigation_id: 220,
		catalog_id: 9,
		catalog: 'patients',
		main_navigation: 'laboratory',
		sub_navigation: 'dashboard',
		remarks: 'Open the Laboratory page — view the lab reports list, filter by category / group / status / date range.',
	},
	{
		navigation_id: 221,
		catalog_id: 10,
		catalog: 'patients',
		main_navigation: 'laboratory',
		sub_navigation: 'add',
		remarks: 'Create a draft lab report from a paid requisition item.',
	},
	{
		navigation_id: 222,
		catalog_id: 11,
		catalog: 'patients',
		main_navigation: 'laboratory',
		sub_navigation: 'edit',
		remarks: 'Encode or modify result values on a draft lab report before it is finalized.',
	},
	{
		navigation_id: 223,
		catalog_id: 12,
		catalog: 'patients',
		main_navigation: 'laboratory',
		sub_navigation: 'view',
		remarks: 'Open a lab report to view its details and result values (read-only view of drafts and finalized reports).',
	},
	{
		navigation_id: 224,
		catalog_id: 13,
		catalog: 'patients',
		main_navigation: 'laboratory',
		sub_navigation: 'tag as final',
		remarks: 'Finalize a draft lab report — locks the values and stamps the medtech / pathologist signature.',
	},
	{
		navigation_id: 225,
		catalog_id: 14,
		catalog: 'patients',
		main_navigation: 'laboratory',
		sub_navigation: 'untag as final',
		remarks: 'Revert a finalized lab report back to draft for corrections. Typically requires manager approval.',
	},
	{
		navigation_id: 226,
		catalog_id: 15,
		catalog: 'patients',
		main_navigation: 'laboratory',
		sub_navigation: 'print preview',
		remarks: 'Open the print preview to inspect the report layout and send it to the printer.',
	},

	// ─── Dashboard & Setup Readiness — top-level overview pages ────────
	// Grouped under their own `dashboard` catalog since they aren't
	// scoped to patient / catalog / administrative sections.
	{
		navigation_id: 300,
		catalog_id: 1,
		catalog: 'dashboard',
		main_navigation: 'dashboard',
		sub_navigation: 'all-access',
		remarks: 'View the tenant dashboard: revenue KPIs, method breakdown, receivables aging, throughput, top tests, expenses.',
	},
	{
		navigation_id: 301,
		catalog_id: 2,
		catalog: 'dashboard',
		main_navigation: 'setup readiness',
		sub_navigation: 'all-access',
		remarks: 'View the Setup Readiness checklist — the one-time configuration required before the lab can accept patients.',
	},
];

export async function seed(knex: Knex): Promise<void> {
	for (const row of ROWS) {
		const existing = await knex('access_templates')
			.where({
				catalog: row.catalog,
				main_navigation: row.main_navigation,
				sub_navigation: row.sub_navigation,
			})
			.first();

		if (existing) {
			// Sync remarks (and navigation/catalog IDs) if they've drifted from the source of truth.
			if (
				existing.remarks !== row.remarks ||
				existing.navigation_id !== row.navigation_id ||
				existing.catalog_id !== row.catalog_id
			) {
				await knex('access_templates')
					.where({ uuid: existing.uuid })
					.update({
						navigation_id: row.navigation_id,
						catalog_id: row.catalog_id,
						remarks: row.remarks,
						updated_by: 'seed',
					});
			}
			continue;
		}

		await knex('access_templates').insert({
			...row,
			has_access: false,
			created_by: 'seed',
		});
	}
}
