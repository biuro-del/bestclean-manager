# Workday/Cycles API status

## Implemented in `functions/src/index.js`

- `auth/me` (session-validated)
- `workday/utilityId`
- `workday/active`
- `workday/start`
- `workday/beginEnding`
- `workday/cancelEnding`
- `workday/closeNow`
- `zones/resolve`
- `cycles/active`
- `cycles/start`
- `cycles/stop`
- `cycles/stopAndStart`

## Security model

- Every non-public route uses:
  - Firebase ID token verification
  - `sessions/{uid}.activeSessionId` check
  - optional `deviceId` match
  - `users/{uid}.active` gate

## Current dependencies

- `zones/{roomId}` collection must be populated for QR resolution.
- `runtimeConfig/workday` (optional):
  - `startRoomId`
  - `stopRules` (`[{ roomId, graceMinutes }]`)
  - `defaultGraceMinutes`

## Not implemented yet (next stage)

- `workday/stopCycleAndBeginEnding`
- `workday/cancelEndingAndStartCycle`
- pause endpoints (`workday/pause*`)
- checklist endpoints
- worklog/month summary endpoints
- schedule endpoint
