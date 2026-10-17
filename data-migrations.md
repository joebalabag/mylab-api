# Data migrations

One-off data scripts live under `scripts/` and are prefixed with an underscore
(`_*.ts`) so they are easy to grep and clearly separate from the Knex
schema migrations under `migrations/`.

They are plain `ts-node` scripts that read `knexfile.ts`, which in turn loads
`.env.${NODE_ENV || 'local'}`. There are no npm script aliases — invoke them
directly.

## Running

Dry-run first (no `--commit` flag → prints counts, writes nothing):

```powershell
# local (default — reads .env.local)
npx ts-node scripts/<script-name>.ts

# staging / production
cross-env NODE_ENV=staging npx ts-node scripts/<script-name>.ts
cross-env NODE_ENV=production npx ts-node scripts/<script-name>.ts
```

Commit:

```powershell
npx ts-node scripts/<script-name>.ts --commit
```

Every data-migration script in `scripts/` must support this pattern:
dry-run by default, writes only when `--commit` is passed, and wraps all
writes in a single `db.transaction` so a failure rolls back cleanly.

## Tenant → tenant copy

### `_copy-tenant-catalog.ts`

Copies the full laboratory catalog from one tenant to another. Tables:

- `doctors`
- `discounts`
- `item_groups`
- `item_categories`
- `test_items`
- `test_item_components`
- `item_packages`
- `item_package_items`

To use, set the two UUIDs at the top of the file and run:

```ts
const SRC_TENANT = '<from-tenant-uuid>';
const TGT_TENANT = '<to-tenant-uuid>';
```

The script re-maps every `uuid` primary key and every tenant-scoped foreign
key (`item_group_uuid`, `item_category_uuid`, `test_item_uuid`,
`item_package_uuid`, `signatory_doctor_uuid`) so the target tenant ends up
with its own independent graph — no shared ids with the source.

Notes:

- Codes (`code` columns) are unique **per tenant**. The script warns if the
  target already has catalog rows; proceed only if you understand the
  overlap. A clean target tenant is the safe case.
- `created_at` / `updated_at` are reset to "now" on insert.

### `_copy-tenant-branding.ts`

Copies `company_logo`, `lab_header_mode`, `lab_header_image`,
`lab_header_text` from one tenant to another on the `tenants` table.
Physical image files under `public/uploads/...` are duplicated under fresh
UUIDs on the host that runs the script, so later edits via the UI don't
unlink a file the other tenant still references. Run on the host that
actually has the files (production host for a prod copy).

Same `SRC_TENANT` / `TGT_TENANT` constants at the top; same `--commit`
convention.

## Tenant purge

### `_delete-tenant-catalog.ts`

Deletes the full laboratory catalog for a single tenant. Tables (deleted in
FK-safe order, children → parents):

- `item_package_items`
- `item_packages`
- `test_item_components`
- `test_items`
- `item_categories`
- `item_groups`

To use, set the UUID at the top of the file and run:

```ts
const TENANT_UUID = '<tenant-uuid>';
```

The script refuses to run while `TENANT_UUID` is left at the placeholder
zero-UUID, so an accidental invocation can't fire against the wrong tenant.

Notes:

- `doctors` and `discounts` are **not** included — those often outlive a
  catalog rebuild. If you also want them gone, add them manually.
- Lab reports snapshot catalog FKs (`lab_report_items.test_item_uuid`,
  `lab_result_values.test_item_component_uuid`,
  `lab_report_items.item_package_uuid`). If any still reference these rows
  under `ON DELETE RESTRICT`, the transaction rolls back — that's the safe
  outcome. Purge or null those references separately before re-running.
- Dry-run prints BEFORE counts only; `--commit` additionally prints deleted
  counts and AFTER counts.

## Writing a new data script

Template to follow:

1. Hard-code the inputs at the top as named constants (tenant UUIDs,
   codes, etc.) so the "what will this do?" review is a one-screen diff.
2. Read `--commit` from `process.argv`. Dry-run is the default.
3. Print row counts / before-state, then the planned inserts / updates.
4. Wrap all writes in `db.transaction` so a mid-run failure leaves no
   partial state.
5. On commit, print the after-state so the operator sees what landed.
6. Always `await db.destroy()` in a `finally` block.
