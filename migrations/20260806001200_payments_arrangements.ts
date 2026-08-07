import type { Knex } from 'knex';

/**
 * Cashier "arrangement" payments — settlements that don't collect cash at
 * the counter but still need to unblock the requisition:
 *   accounts_receivable | insurance | paid_outside | charity | other
 *
 * Also splits capture-time proof-of-payment fields out of `notes`:
 *   channel     — eWallet provider (GCash, Maya…) or bank name (BDO, BPI…)
 *   reference   — transaction / OR # / PO #
 *   billed_to   — who's on the hook for arrangement payments (company name)
 *
 * And a resolution trail so ops can mark an A/R / insurance / paid-outside
 * bill as actually settled later — with the real method that came in:
 *   arrangement_resolved_at + resolved_{method,channel,reference,notes,by}
 *
 * Enum change: `card` and `gcash` retired from the method whitelist.
 *   `card`  → migrated to `other`   (rarely used in this deployment)
 *   `gcash` → migrated to `ewallet` (semantically the same slot, wider label)
 *
 * The new whitelist:
 *   cash | ewallet | bank_transfer | insurance |
 *   accounts_receivable | paid_outside | charity | other
 */
export async function up(knex: Knex): Promise<void> {
	// 1. Backfill legacy method values before tightening the CHECK constraint —
	//    otherwise the new constraint fails on existing rows.
	await knex.raw(`UPDATE payments SET payment_method = 'ewallet' WHERE payment_method = 'gcash'`);
	await knex.raw(`UPDATE payments SET payment_method = 'other'   WHERE payment_method = 'card'`);

	// 2. Swap the CHECK constraint to the new whitelist.
	await knex.raw(`ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check`);
	await knex.raw(`
		ALTER TABLE payments
		ADD CONSTRAINT payments_method_check
		CHECK (payment_method IN (
			'cash', 'ewallet', 'bank_transfer', 'insurance',
			'accounts_receivable', 'paid_outside', 'charity', 'other'
		))
	`);

	// 3. Capture-time fields.
	await knex.schema.alterTable('payments', (table) => {
		table.string('channel', 100).nullable();     // eWallet provider or bank name
		table.string('reference', 255).nullable();   // txn / OR / PO #
		table.string('billed_to', 255).nullable();   // arrangements only
	});

	// 4. Resolution trail. `arrangement_resolved_at` NULL = still pending.
	await knex.schema.alterTable('payments', (table) => {
		table.timestamp('arrangement_resolved_at', { useTz: true }).nullable();
		table.string('resolved_method', 50).nullable();
		table.string('resolved_channel', 100).nullable();
		table.string('resolved_reference', 255).nullable();
		table.text('resolved_notes').nullable();
		table.string('resolved_by', 255).nullable();
	});

	await knex.raw(`
		ALTER TABLE payments
		ADD CONSTRAINT payments_resolved_method_check
		CHECK (resolved_method IS NULL OR resolved_method IN (
			'cash', 'ewallet', 'bank_transfer'
		))
	`);

	// Speeds up the "pending arrangements" tab counter.
	await knex.raw(`
		CREATE INDEX IF NOT EXISTS payments_pending_arrangements_idx
		ON payments (tenant_uuid, arrangement_resolved_at)
		WHERE payment_method IN ('accounts_receivable', 'insurance', 'paid_outside', 'other')
		  AND status = 'completed'
	`);
}

export async function down(knex: Knex): Promise<void> {
	await knex.raw(`DROP INDEX IF EXISTS payments_pending_arrangements_idx`);
	await knex.raw(`ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_resolved_method_check`);
	await knex.schema.alterTable('payments', (table) => {
		table.dropColumn('resolved_by');
		table.dropColumn('resolved_notes');
		table.dropColumn('resolved_reference');
		table.dropColumn('resolved_channel');
		table.dropColumn('resolved_method');
		table.dropColumn('arrangement_resolved_at');
		table.dropColumn('billed_to');
		table.dropColumn('reference');
		table.dropColumn('channel');
	});
	await knex.raw(`ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check`);
	// Restore the original method values first, then re-add the old constraint.
	await knex.raw(`UPDATE payments SET payment_method = 'gcash' WHERE payment_method = 'ewallet'`);
	// (No reverse for card — we don't know which 'other' rows were originally 'card'.)
	await knex.raw(`
		ALTER TABLE payments
		ADD CONSTRAINT payments_method_check
		CHECK (payment_method IN ('cash','card','gcash','bank_transfer','insurance','other'))
	`);
}
