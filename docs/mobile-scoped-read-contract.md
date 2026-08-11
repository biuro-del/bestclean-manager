# Mobile scoped read contract

Status date: 2026-08-11

This additive Data Connect contract supports bounded reads for
`app.cleanzi.pl`. It does not change or remove existing portal operations.

## Operations

- `WorkdaysPageForOrgByWorker` returns the selected worker's rows inside an
  explicit timestamp range with `limit` and `offset`.
- `EventsPageForOrgByWorker` does the same for events.
- `WorkdaysPageForOrgByWorkerAndStatus` returns only the selected worker,
  status, and timestamp range. The mobile client calls it for `RUNNING` and
  `ENDING` with a limit of five rows per status to preserve stale/open-workday
  detection without loading all workday history.

Every operation retains the existing organization membership and active-role
checks. The client must fail closed when a scoped operation is unavailable and
must not silently fall back to `EventsForOrg`, `WorkdaysForOrg`, or
`BackupCyclesForOrg`.

## Release order

1. Deploy the additive connector operation.
2. Verify authenticated `RUNNING` and `ENDING` canary reads for one worker.
3. Deploy the mobile build that calls the operation.
4. Compare equal before/after windows for datasource response bytes, operation
   count, latency, and Cloud SQL sent bytes.

Rollback the mobile build first. The additive query may remain deployed because
it does not alter schema or existing operation behavior.
