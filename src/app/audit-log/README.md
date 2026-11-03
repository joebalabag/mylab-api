# audit_log

General-purpose append-only audit log. One row per auditable event in
`audit_logs` (see migration `20261103000100_audit_logs.ts`).

## What gets logged

- **create / update / delete** of auditable domain records. Fires automatically
  via Objection lifecycle hooks on `AuditedModel`. Any model that extends
  `AuditedModel` with a `static auditConfig = {...}` is covered.
- **Auth events** — `login`, `login_failed`, `logout`, `password_reset_request`,
  `password_reset_complete`. Emitted explicitly from `auth.controller.ts` /
  `auth.service.ts` using `recordAuditEvent(...)`.

## Actor propagation

`AuditContextInterceptor` wraps every HTTP request in an `AsyncLocalStorage`
frame carrying the acting user and request metadata. The `AuditedModel` hooks
read from that frame via `resolveActor()` / `resolveRequest()`. Services do
NOT need to pass `.context({...})` on their query builders — it just works.

For code paths with no HTTP request (schedulers, seeders, boot-time hooks),
the ALS store is empty and events are attributed to `SYSTEM_ACTOR`.

## Writes are fire-and-forget

`AuditService.record()` schedules the insert on the next microtask so it
lands AFTER the business transaction commits, and swallows its own errors
(logged, not re-thrown). An audit insert failure never rolls back a real
operation.

## Env settings

- `AUDIT_LOG_ENABLED` — master kill-switch (default `true`). When `false`,
  model lifecycle hooks and explicit `recordAuditEvent()` calls become
  no-ops. Reads of historical rows via the dashboard endpoints continue to
  work regardless, so flipping this off doesn't hide the existing archive.
- `AUDIT_LOG_RETENTION_MONTHS` — integer, default 12. Set `0` to disable
  pruning (keep every row forever). Independent of `AUDIT_LOG_ENABLED` so
  retention keeps running on the historical archive even if new writes are
  switched off.
- `AUDIT_LOG_PRUNE_CRON` — cron expression (default `"0 3 * * *"`).
- `AUDIT_LOG_PRUNE_TZ` — timezone (default `"Asia/Manila"`).

The nightly prune is chunked (10 000 rows / batch) so a long-neglected table
doesn't blow up the WAL in a single transaction.

## Known gaps (v1)

- **Bare `Model.query().patch({...}).where(...)`** — Objection fires
  `$beforeUpdate` on an instance built from the patch alone, with no idColumn
  set. The hook short-circuits (no entity_uuid), so these writes are NOT
  logged. Prefer `patchAndFetchById(uuid, {...})` for anything worth auditing.
  Known offenders in the codebase: login-timestamp bookkeeping in
  `auth.controller.ts` — correctly out-of-scope.
- **Bare `Model.query().delete().where(...)`** — same reason, no hooks fire.
  Use `.deleteById(uuid)` instead for auditable deletes.
- **Retention / pruning** — table grows forever. Revisit at ~10M rows.
- **DB-level append-only guard** — none. Append-only is enforced only in app
  code (no PATCH/DELETE endpoints on the controller).

## Reading the log

- `GET /api/audit-log/dashboard` — tenant-scoped list. Tenant users see only
  their own rows; super-admins can pass `tenant_uuid` to narrow.
- `GET /api/audit-log/entity/:type/:uuid` — per-record history.
- `GET /api/super/audit-log/dashboard` — cross-tenant list (admin only).

All endpoints accept standard dashboard filters: `date_from`, `date_to`,
`keywords`, pagination, plus audit-specific `entity_type`, `entity_uuid`,
`actor_uuid`, `action`.
