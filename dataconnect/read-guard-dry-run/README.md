# Data Connect read-guard dry run

This directory is a local, isolated deployment input for validating a connector-only delta against the deployed July 2026 source snapshot. It is not a production deployment instruction.

- `schema/` is copied from the deployed schema snapshot only so Data Connect can compile the connector. The local compiler input normalizes the optional UTF-8 BOM and line endings; the schema content is otherwise identical.
- `connectors/example/queries.gql` and `mutations.gql` preserve the deployed connector baseline as local evidence only; they are not listed in `connectorDirs` and cannot be deployed from this configuration.
- `connectors/read-guard/` is a new, parallel connector containing only bounded reference-data reads. It intentionally excludes incompatible fields and the `IndividualClientJob` operation, while leaving the deployed `example` connector unchanged for older clients.
- The generated SDK is written to `web-app/apps/portal-web/src/dataconnect-read-guard-generated`; do not edit it manually.
- The CLI dry run always calculates a main-schema migration, even with a connector-only filter. Treat it as a compiler and drift diagnostic, not as a simulation of the connector-only release.
- Any future production command must target only `dataconnect:iclean-room-service:read-guard`; that connector-only release path excludes main-schema migration. It still requires final validation and explicit production approval.
