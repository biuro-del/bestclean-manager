# Data Connect read-guard dry run

This directory is a local, isolated deployment input for validating a connector-only delta against the deployed July 2026 source snapshot. It is not a production deployment instruction.

- `schema/` is copied from the deployed schema snapshot only so Data Connect can compile the connector. The local compiler input normalizes the optional UTF-8 BOM and line endings; the schema content is otherwise identical.
- `connectors/example/queries.gql` and `mutations.gql` preserve the deployed connector baseline.
- `connectors/example/read-guard-pages.gql` adds bounded reference-data reads. It intentionally excludes incompatible fields and the `IndividualClientJob` operation.
- Run only `firebase deploy --only dataconnect:iclean-room-service:example --dry-run` with `firebase.read-guard-dry-run.json` until a separately approved connector release exists.
