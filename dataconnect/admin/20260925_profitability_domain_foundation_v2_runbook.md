# Profitability Domain Foundation V2 - guarded runbook

Status: review candidate only. This document authorizes nothing by itself.

Foundation V2 is additive and deliberately empty. It creates ten profitability
relations, but does not map clients to objects, seed users or organizations,
backfill operational data, change `zone`/`task`/`event`, enable the API, or
expose financial data.

## Immutable rollout facts for this candidate

- database: `iclean-room-database`;
- PostgreSQL major: 17;
- approved backup reference: `1790402094445`;
- required extension fingerprint: `btree_gist`, version `1.7`, schema `public`;
- confirmation token:
  `APPLY_PROFITABILITY_DOMAIN_FOUNDATION_V2_ONLY_20260926`;
- supported entrypoint only:
  `dataconnect/admin/20260925_profitability_domain_foundation_v2_apply.psql`;
- raw SQL must never be executed directly.

Two independently guarded prerequisites are available for separate database-
administrator approvals; running the Foundation entrypoint does not run them:

- `dataconnect/admin/20260925_profitability_btree_gist_preprovision.psql`;
- `dataconnect/admin/20260925_profitability_foundation_v2_roles_preprovision.psql`.

If any fact is stale, stop. Take a new approved backup and prepare a new
reviewed candidate instead of weakening a guard.

## Closed role graph (separate approval required)

Foundation does not create roles or credentials. A database administrator must
preprovision one dedicated restricted provisioner and the five Foundation roles
in a separate, audited action. PostgreSQL 17 retains exactly five automatic
creator edges and the provisioner creates exactly three explicit `SET ROLE`
edges:

```text
bootstrap role pg_get_userbyid(10)
  -- grantor of five automatic ADMIN TRUE / INHERIT FALSE / SET FALSE edges -->
profitability_provisioner LOGIN CREATEROLE NOINHERIT
  <-- member of each of the five Foundation roles through those edges only

profitability_migration_executor LOGIN NOINHERIT
  -- grantor profitability_provisioner; SET TRUE / INHERIT FALSE / ADMIN FALSE -->
profitability_migration_runner NOLOGIN NOINHERIT
  -- grantor profitability_provisioner; SET TRUE / INHERIT FALSE / ADMIN FALSE -->
profitability_owner NOLOGIN NOINHERIT

profitability_session LOGIN NOINHERIT
  -- grantor profitability_provisioner; SET TRUE / INHERIT FALSE / ADMIN FALSE -->
profitability_runtime NOLOGIN NOINHERIT
```

The provisioner must be exactly `LOGIN CREATEROLE NOINHERIT NOSUPERUSER
NOBYPASSRLS NOCREATEDB NOREPLICATION`, with connection limit `-1`, no validity
limit and no role configuration. The five Foundation roles must be `NOINHERIT
NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`; only executor
and session are `LOGIN`. Exactly eight membership rows may touch these six
roles: the five automatic edges with grantor OID `10` and the three explicit
edges with grantor `profitability_provisioner`. No other edge is accepted.
Credentials for LOGIN roles are provisioned out of band and must never be
stored in this repository. The only supported way to create the five
Foundation roles and their ACL is the guarded role preprovisioner. Do not copy
individual `CREATE ROLE`, `GRANT` or `REVOKE` statements out of it.

Before it runs, a separately controlled disposable bootstrap session creates
`profitability_provisioner`. The control-plane administrator, not the disposable
bootstrap, gives the provisioner only `CONNECT WITH GRANT OPTION` on the target
database and `USAGE, CREATE WITH GRANT OPTION` on `public`, then activates one
temporary credential. PostgreSQL 17 also creates an automatic
`profitability_provisioner -> bootstrap` membership. Therefore ending the
session is not enough: remove the disposable bootstrap account through the
same control-plane workflow that created it and independently confirm that the
membership disappeared. Do not try to normalize that edge from the restricted
provisioner. Only then run the guarded entrypoint as the exact restricted
provisioner:

```text
psql [approved secret-free provisioner connection arguments] \
  -v profitability_roles_expected_database=iclean-room-database \
  -v profitability_roles_expected_admin=profitability_provisioner \
  -v profitability_roles_expected_bootstrap_grantor=<exact-pg_get_userbyid-10-role> \
  -v profitability_roles_backup_reference=1790402094445 \
  -v profitability_roles_confirmation=PROVISION_PROFITABILITY_FOUNDATION_V2_ROLES_ONLY_20260926 \
  -f dataconnect/admin/20260925_profitability_foundation_v2_roles_preprovision.psql
```

The entrypoint validates the complete role and ACL surface before mutation,
creates every Foundation LOGIN role with `PASSWORD NULL`, checks the exact
eight-edge graph, and sets the provisioner's password to `NULL` in the same
transaction. After the success marker, an independent administrator must
confirm the role graph and failed fresh provisioner login before removing its
operator-only secret.

A fresh installation with zero Foundation roles does not read `pg_authid`.
Every replay or partial-state recovery does, and deliberately fails closed when
the catalog is unavailable. On Cloud SQL such a maintenance window requires a
separately controlled temporary value of
`cloudsql.pg_authid_select_role=profitability_provisioner`, verification that
the role can read only that catalog, and restoration of the prior flag value
after the replay. Do not weaken the guard or leave catalog access enabled.

Do not manually recreate, normalize or revoke the five automatic PG17 creator
edges. The role preprovisioner and migration wrapper require their exact OID-10
grantor, options and count. Before approval, verify the resulting attributes,
direct schema ACL and all rows in `pg_auth_members`. Do not reuse the shared
workforce-schedule runner. The three DDL-capable Foundation roles
(`profitability_migration_executor`, `profitability_migration_runner`,
`profitability_owner`) must also have no relation, sequence or function rows in
`pg_default_acl`; the migration aborts and rolls back if any such default ACL
exists.

## Required preflight

1. Verify the remote commit and deployment target again.
2. Confirm the backup is successful and restorable.
3. Confirm primary/read-write PG17 and exact extension fingerprint.
4. Confirm all source tenant key fingerprints (`organizations`,
   `organization_member`, `client`, `worker`, `task`, `zone`, `event`).
5. Confirm none of the ten target relations, the versioned trigger function,
   identity sequence, or legacy `profitability_permission` exists.
6. Confirm feature flags remain OFF and the organization allowlist is empty.
7. Run the static contract suite and real PG17 harness from a clean checkout.

## Guarded invocation shape

Use a secret-free connection mechanism for the exact executor. Do not place a
URI or password in shell history, source files or logs.

```text
psql [approved secret-free connection arguments] \
  -v profitability_foundation_expected_database=iclean-room-database \
  -v profitability_foundation_expected_executor=profitability_migration_executor \
  -v profitability_foundation_expected_provisioner=profitability_provisioner \
  -v profitability_foundation_expected_bootstrap_grantor=<exact-pg_get_userbyid-10-role> \
  -v profitability_foundation_expected_migration_runner=profitability_migration_runner \
  -v profitability_foundation_owner_role=profitability_owner \
  -v profitability_foundation_runtime_role=profitability_runtime \
  -v profitability_foundation_session_role=profitability_session \
  -v profitability_foundation_expected_btree_gist_version=1.7 \
  -v profitability_foundation_expected_btree_gist_schema=public \
  -v profitability_foundation_backup_reference=1790402094445 \
  -v profitability_foundation_confirmation=APPLY_PROFITABILITY_DOMAIN_FOUNDATION_V2_ONLY_20260926 \
  -f dataconnect/admin/20260925_profitability_domain_foundation_v2_apply.psql
```

The wrapper owns one transaction, uses bounded lock/statement/idle timeouts,
takes an advisory transaction lock, switches through the reviewed role graph,
and includes the raw SQL once. Any failed guard or postflight rolls back all
Foundation DDL.

The PG17 replay gate uses an exact, OID-independent catalog fingerprint. It
validates persistent heap relations, exact column types and collations, rejects
domains, RLS policies and user rewrite rules, and fingerprints defaults,
constraints, indexes, the immutable trigger function, static identity-sequence
parameters, application triggers and the enabled internal FK triggers. A drift
is reported and rolled back; the migration never repairs it automatically.

## Immediate post-migration credential containment

After a successful migration and before any later activation work, disable the
external login of `profitability_migration_executor` or revoke/rotate its
one-time credential using the separately approved administrator mechanism.
Then verify that the executor can no longer open a new database session. Do not
store the replacement credential in this repository, shell history or logs.
Re-enabling the executor for a future migration requires a new approval and a
fresh preflight of the complete role graph.

`profitability_provisioner` remains a dedicated `LOGIN CREATEROLE NOINHERIT`
role because PostgreSQL 17 ties the five creator edges to it. After successful
preprovisioning it has no password credential. Every future maintenance window
must activate a new temporary credential out of band and revalidate that its
only memberships are the five automatic PG17 creator edges described above.

While that credential is active, `CREATEROLE` together with the automatic
`ADMIN TRUE` edges lets the provisioner modify the target-role graph and grant
itself `SET` or `INHERIT`; `SET FALSE` and `INHERIT FALSE` on the automatic
edges are therefore not a security boundary during that window. Safety depends
on keeping the window short and controlled, preserving `PASSWORD NULL` outside
it, running the independent postflight, confirming the fresh-login failure and
removing the operator secret immediately afterwards.

## Runtime ACL

`profitability_session` receives no direct table, sequence or function ACL. A
dedicated connection pool must explicitly `SET ROLE profitability_runtime`.

- SELECT only: `service_object`, `periodic_work`, `periodic_work_zone`;
- SELECT/INSERT/UPDATE: `worker_cost_rate`, `object_contract_version`,
  `object_equipment`, `financial_period`;
- SELECT/INSERT: `object_financial_entry`, `profitability_snapshot`,
  `profitability_audit`;
- sequence: USAGE only on `profitability_audit_audit_id_seq`;
- no DELETE, TRUNCATE, REFERENCES, TRIGGER, grant option or column ACL;
- no EXECUTE on the internal immutable-trigger function;
- no grants to a shared application role.

## Activation and rollback

This migration does not activate the module. Keep the feature flag OFF and the
allowlist empty until operational mappings, Access V2, the dedicated runtime
pool and authenticated API tests are separately approved.

Operational rollback after successful additive DDL is:

1. keep the feature flag OFF (or turn it OFF);
2. keep the allowlist empty;
3. revoke CONNECT from `profitability_session` or disable its external login;
4. retain the additive tables for forensic review.

There is intentionally no destructive down migration. Do not drop tables,
roles or `btree_gist`; use backup restore only for a separately approved
disaster-recovery event.
