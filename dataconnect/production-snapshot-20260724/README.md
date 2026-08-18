# Data Connect production snapshot — 2026-07-24

Read-only snapshot of the deployed `iclean-room-service` schema and `example` connector, captured on 2026-08-11 for source reconciliation.

- Project/service: `iclean-room` / `iclean-room-service` (`europe-west3`)
- Cloud SQL: `iclean-room-instance` / `iclean-room-database`
- Deployed schema update: `2026-07-24T19:02:00.520545841Z`
- Deployed connector update: `2026-07-24T19:02:03.155808060Z`
- Snapshot content was rechecked against the deployed service after LF normalization and terminal-newline normalization.

This directory is evidence and a reconciliation baseline. It must not be deployed directly. Any release must first derive a minimal reviewed connector delta and pass a connector-only dry run; schema or Cloud SQL changes require separate, explicit production authorization.
