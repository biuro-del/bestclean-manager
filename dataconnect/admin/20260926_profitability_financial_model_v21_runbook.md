# Profitability Financial Model V2.1 — local candidate runbook

Status: source candidate only. This document is not approval to run a migration,
change a flag, insert an enforcement marker or deploy code.

## Data contract

- `object_financial_entry.value_basis` is exactly `PLAN`, `ESTIMATE` or
  `ACTUAL`. Existing V2 rows become `ACTUAL`.
- `value_key` is a stable key for one logical value in one object and accounting
  period. The effective view replaces `ESTIMATE` only when an active `ACTUAL`
  has the same tenant, object, key, cost group, category, currency, recurrence
  and exact date/period boundaries. It never replaces a value in another month.
- `PLAN` is not part of `profitability_effective_financial_entry`; planning must
  be queried explicitly and compared with, not added to, effective actuals.
- Hygiene rows are immutable versions. Runtime may insert a version and perform
  only `DRAFT -> POSTED|VOID` or `POSTED -> VOID|ARCHIVED`. Price, cost, basis,
  period and version identity cannot be overwritten.
- `ACTUAL` hygiene cost wins over `ESTIMATE`, and `ESTIMATE` over `PLAN`, only
  for the same recognition key and exact billing period.
- `IN_CONTRACT` produces zero additional revenue. `MONTHLY_EXTRA` produces its
  configured net price. `AD_HOC` is absent from the effective view until it is
  explicitly `POSTED`.
- Margin uses the margin formula `(price - cost) / price`, stored as generated
  basis points. It is not markup.
- A command receipt is unique by `(org_id, command_id)` and binds the command to
  one object, kind and SHA-256 request hash. Only one transition from
  `IN_PROGRESS` to `SUCCEEDED` or `FAILED` is allowed.

## Deny-side enforcement

`profitability_financial_model_enforcement` is deliberately seedless. Adding a
tenant row is a separate activation operation. Once present, backend reads and
writes for that tenant must fail closed unless all of the following are true:

1. the V2.1 schema fingerprint is valid;
2. the V2.1 runtime feature flag is enabled;
3. the tenant is in the V2.1 allowlist;
4. the API uses only the effective views for realized profitability.

Turning a flag off after enforcement must not reactivate legacy summation. A
safe operational response is to disable profitability requests for the tenant
until a V2.1-capable backend is restored.

## Controlled rollout order

1. Reconfirm remote/default branch and production revision.
2. Build a clean main-aligned candidate; do not deploy this dirty worktree.
3. Run static tests and the disposable local PostgreSQL 17 replay harness.
4. Take and verify a production Cloud SQL backup.
5. Run a read-only production preflight for Foundation V2, roles, extension,
   runtime ACL and absence/shape of all V2.1 markers.
6. Apply the guarded V2.1 wrapper with flags and allowlist still OFF.
7. Verify schema fingerprint, zero seed rows and runtime ACL.
8. Deploy V2.1-capable backend and portal with the feature OFF.
9. Canary one explicitly approved organization.
10. Insert that organization's enforcement row only in the same controlled
    activation window, then verify API, logs, calculations and role projections.

Rollback after enforcement must use a V2.1-capable previous release or a
fail-closed maintenance response. Never silently fall back to a query that sums
both `ESTIMATE` and `ACTUAL`.

## Local verification

```powershell
node --test test/profitability-financial-model-v21-migration.test.js
& .\scripts\test-profitability-v21-pg17.ps1 `
  -RunLocalEphemeralSmoke `
  -Confirmation I_CONFIRM_LOCAL_EPHEMERAL_POSTGRESQL_17_PROFITABILITY_V21_SMOKE
git diff --check
```
