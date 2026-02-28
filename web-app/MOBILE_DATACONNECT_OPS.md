# Mobile Data Connect Operations

The mobile app currently runs in fallback mode for cycle events.

Why:
- deployed Data Connect connector does not expose custom operations:
  - `InsertEventForOrg`
  - `UpdateEventForOrg`

Temporary app behavior:
- `workday` START/STOP is still written correctly.
- cycle event writes use fallback (no direct `InsertEventForOrg` / `UpdateEventForOrg` call).

How to re-enable direct event mutations:
1. Deploy missing operations to the connector used by:
   - project: `iclean-room`
   - service: `iclean-room-service`
   - location: `europe-west3`
2. Set env:
   - `VITE_MOBILE_EVENT_MUTATIONS=true`
3. Rebuild and redeploy mobile app.

## Required Operations

The app expects these operation names and variables.

### 1) `InsertEventForOrg` (mutation)
Variables expected by app:
- `orgId: string`
- `eventId: string`
- `zoneId?: string | null`
- `workerLogin?: string | null`
- `startAt?: TimestampString | null`
- `endAt?: TimestampString | null`
- `durationSec?: number | null`
- `status?: string | null`
- `closeMarkedAt?: TimestampString | null`
- `endReason?: string | null`
- `comment?: string | null`
- `deviceId?: string | null`
- `startEventId?: string | null`
- `endEventId?: string | null`

Return shape expected by SDK:
- `event_insert: BackupCycle_Key`

### 2) `UpdateEventForOrg` (mutation)
Variables expected by app:
- same as `InsertEventForOrg`

Return shape expected by SDK:
- `event_update?: BackupCycle_Key | null`

### 3) `EventsForOrg` (query, optional but recommended)
Variables:
- `orgId: string`

Used as a secondary read path for event history.

## Quick Verification (CLI)

After deploy, run:

```bash
firebase dataconnect:execute - CheckMutationFields --project iclean-room --service iclean-room-service --location europe-west3
```

with:

```graphql
query CheckMutationFields {
  __type(name: "Mutation") {
    fields { name }
  }
}
```

Confirm fields include:
- `InsertEventForOrg`
- `UpdateEventForOrg`

