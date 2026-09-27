'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { Client } = require('pg')

const foundation = require('./test-profitability-foundation-pg17')

const ROOT_DIR = path.resolve(__dirname, '..')
const WRAPPER_PATH = path.join(
  ROOT_DIR,
  'dataconnect',
  'admin',
  '20260925_profitability_access_profile_v2_apply.psql',
)
const MIGRATION_PATH = path.join(
  ROOT_DIR,
  'dataconnect',
  'migrations',
  '20260925_profitability_access_profile_v2_additive.sql',
)
const CONFIRMATION = 'APPLY_PROFITABILITY_ACCESS_PROFILE_V2_ONLY_20260925'
const BACKUP_REFERENCE = 'local-access-profile-harness-20260927'
const ACCESS_TABLES = Object.freeze([
  'organization_access_profile',
  'profitability_access_enforcement',
  'profitability_target_history',
  'service_object_assignment',
])
const EFFECTS = Object.freeze({
  production: false,
  deploy: false,
  notifications: false,
  downstream: false,
})

function connectionUrlForRole(connectionString, roleName) {
  const parsed = new URL(connectionString)
  parsed.username = roleName
  parsed.password = ''
  return parsed.toString()
}

function wrapperVariables() {
  return {
    profitability_access_expected_database: foundation.EXPECTED_DATABASE,
    profitability_access_expected_provisioner: foundation.PROVISIONER_ROLE,
    profitability_access_expected_bootstrap_grantor: foundation.BOOTSTRAP_ROLE,
    profitability_access_expected_executor: foundation.MIGRATION_EXECUTOR_ROLE,
    profitability_access_expected_migration_runner: foundation.MIGRATION_RUNNER_ROLE,
    profitability_access_owner_role: foundation.OWNER_ROLE,
    profitability_access_session_role: foundation.SESSION_ROLE,
    profitability_access_runtime_role: foundation.RUNTIME_ROLE,
    profitability_access_backup_reference: BACKUP_REFERENCE,
    profitability_access_confirmation: CONFIRMATION,
  }
}

function runPsql({ psqlPath, connectionString, filePath, variables = {} }) {
  const args = ['-X', '--no-password', '--dbname', connectionString]
  for (const [name, value] of Object.entries(variables)) args.push('-v', `${name}=${value}`)
  args.push('-v', 'ON_ERROR_STOP=1', '-f', filePath)
  return spawnSync(psqlPath, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: '' },
    windowsHide: true,
  })
}

function runWrapper({ psqlPath, connectionString }) {
  const result = runPsql({
    psqlPath,
    connectionString,
    filePath: WRAPPER_PATH,
    variables: wrapperVariables(),
  })
  if (result.status !== 0) {
    throw new Error(`PROFITABILITY_ACCESS_V2_WRAPPER_FAILED:${result.stderr || result.stdout}`)
  }
  assert.match(result.stdout, /PROFITABILITY_ACCESS_PROFILE_V2_MIGRATION_APPLIED/)
}

function runWrapperRequiresFailure({ psqlPath, connectionString, marker }) {
  const result = runPsql({
    psqlPath,
    connectionString,
    filePath: WRAPPER_PATH,
    variables: wrapperVariables(),
  })
  assert.notEqual(result.status, 0, 'Drifted Access Profile V2 replay unexpectedly succeeded.')
  assert.match(`${result.stderr}\n${result.stdout}`, marker)
}

function assertRawMigrationRequiresGuard({ psqlPath, connectionString }) {
  const result = runPsql({
    psqlPath,
    connectionString,
    filePath: MIGRATION_PATH,
  })
  assert.notEqual(result.status, 0, 'Raw Access Profile V2 SQL unexpectedly ran without its wrapper.')
  assert.match(
    `${result.stderr}\n${result.stdout}`,
    /PROFITABILITY_ACCESS_V2_GUARDED_ENTRYPOINT_REQUIRED|PROFITABILITY_ACCESS_V2_MIGRATION_IDENTITY_MISMATCH/,
  )
}

async function schemaFingerprint(client) {
  const result = await client.query(
    `select jsonb_build_object(
       'relations', (
         select jsonb_agg(jsonb_build_array(
           relation.relname, owner_role.rolname, relation.relpersistence,
           relation.relrowsecurity, relation.relforcerowsecurity,
           relation.relacl
         ) order by relation.relname)
           from pg_class relation
           join pg_namespace namespace on namespace.oid = relation.relnamespace
           join pg_roles owner_role on owner_role.oid = relation.relowner
          where namespace.nspname = 'public'
            and relation.relname = any($1::text[])
       ),
       'columns', (
         select jsonb_agg(jsonb_build_array(
            relation.relname, attribute.attname,
            format_type(attribute.atttypid, attribute.atttypmod),
            attribute.attnotnull,
            pg_get_expr(default_row.adbin, default_row.adrelid),
            attribute.attacl
         ) order by relation.relname, attribute.attnum)
           from pg_attribute attribute
           join pg_class relation on relation.oid = attribute.attrelid
           join pg_namespace namespace on namespace.oid = relation.relnamespace
           left join pg_attrdef default_row
             on default_row.adrelid = attribute.attrelid
            and default_row.adnum = attribute.attnum
          where namespace.nspname = 'public'
            and relation.relname = any($1::text[])
            and attribute.attnum > 0 and not attribute.attisdropped
       ),
       'constraints', (
         select jsonb_agg(jsonb_build_array(
           relation.relname, constraint_row.conname, constraint_row.contype,
           constraint_row.convalidated,
           pg_get_constraintdef(constraint_row.oid, true)
         ) order by relation.relname, constraint_row.conname)
           from pg_constraint constraint_row
           join pg_class relation on relation.oid = constraint_row.conrelid
           join pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public'
            and relation.relname = any($1::text[])
       ),
       'indexes', (
         select jsonb_agg(jsonb_build_array(
           table_row.relname, index_row.relname, owner_role.rolname,
           index_meta.indisvalid, index_meta.indisready,
           pg_get_indexdef(index_row.oid, 0, true),
           pg_get_expr(index_meta.indpred, index_meta.indrelid)
         ) order by table_row.relname, index_row.relname)
           from pg_index index_meta
           join pg_class table_row on table_row.oid = index_meta.indrelid
           join pg_class index_row on index_row.oid = index_meta.indexrelid
           join pg_namespace namespace on namespace.oid = table_row.relnamespace
           join pg_roles owner_role on owner_role.oid = index_row.relowner
          where namespace.nspname = 'public'
            and table_row.relname = any($1::text[])
       ),
       'policies', (
         select jsonb_agg(jsonb_build_array(
           table_row.relname, policy_row.polname, policy_row.polcmd,
           policy_row.polpermissive, policy_row.polroles,
           pg_get_expr(policy_row.polqual, policy_row.polrelid),
           pg_get_expr(policy_row.polwithcheck, policy_row.polrelid)
         ) order by table_row.relname, policy_row.polname)
           from pg_policy policy_row
           join pg_class table_row on table_row.oid = policy_row.polrelid
           join pg_namespace namespace on namespace.oid = table_row.relnamespace
          where namespace.nspname = 'public'
            and table_row.relname = any($1::text[])
       ),
       'triggers', (
         select jsonb_agg(jsonb_build_array(
           table_row.relname, trigger_row.tgname,
           pg_get_triggerdef(trigger_row.oid, true)
         ) order by table_row.relname, trigger_row.tgname)
           from pg_trigger trigger_row
           join pg_class table_row on table_row.oid = trigger_row.tgrelid
           join pg_namespace namespace on namespace.oid = table_row.relnamespace
          where namespace.nspname = 'public'
            and table_row.relname = any($1::text[])
            and not trigger_row.tgisinternal
       )
     ) as fingerprint`,
    [ACCESS_TABLES],
  )
  return crypto.createHash('sha256')
    .update(JSON.stringify(result.rows[0].fingerprint))
    .digest('hex')
}

async function assertExactOwnersAclAndNoSeeds(client) {
  const relations = await client.query(
    `select relation.relname, owner_role.rolname as owner_name,
            relation.relpersistence, relation.relrowsecurity, relation.relforcerowsecurity
       from pg_class relation
       join pg_namespace namespace on namespace.oid = relation.relnamespace
       join pg_roles owner_role on owner_role.oid = relation.relowner
      where namespace.nspname = 'public'
        and relation.relname = any($1::text[])
      order by relation.relname`,
    [ACCESS_TABLES],
  )
  assert.equal(relations.rows.length, ACCESS_TABLES.length)
  for (const row of relations.rows) {
    assert.equal(row.owner_name, foundation.OWNER_ROLE)
    assert.equal(row.relpersistence, 'p')
    assert.equal(row.relrowsecurity, false)
    assert.equal(row.relforcerowsecurity, false)

    const privileges = await client.query(
      `select grantee_role.rolname as grantee, privilege_row.privilege_type,
              privilege_row.is_grantable
         from pg_class relation
         cross join lateral aclexplode(
           coalesce(relation.relacl, acldefault('r', relation.relowner))
         ) privilege_row
         left join pg_roles grantee_role on grantee_role.oid = privilege_row.grantee
        where relation.oid = format('public.%I', $1::text)::regclass
        order by grantee, privilege_row.privilege_type`,
      [row.relname],
    )
    const runtimeRows = privileges.rows.filter((item) => item.grantee === foundation.RUNTIME_ROLE)
    const ownerRows = privileges.rows.filter((item) => item.grantee === foundation.OWNER_ROLE)
    assert.deepEqual(runtimeRows, [{
      grantee: foundation.RUNTIME_ROLE,
      privilege_type: 'SELECT',
      is_grantable: false,
    }])
    assert.deepEqual(ownerRows, [
      { grantee: foundation.OWNER_ROLE, privilege_type: 'DELETE', is_grantable: false },
      { grantee: foundation.OWNER_ROLE, privilege_type: 'INSERT', is_grantable: false },
      { grantee: foundation.OWNER_ROLE, privilege_type: 'MAINTAIN', is_grantable: false },
      { grantee: foundation.OWNER_ROLE, privilege_type: 'REFERENCES', is_grantable: false },
      { grantee: foundation.OWNER_ROLE, privilege_type: 'SELECT', is_grantable: false },
      { grantee: foundation.OWNER_ROLE, privilege_type: 'TRIGGER', is_grantable: false },
      { grantee: foundation.OWNER_ROLE, privilege_type: 'TRUNCATE', is_grantable: false },
      { grantee: foundation.OWNER_ROLE, privilege_type: 'UPDATE', is_grantable: false },
    ])
    assert.equal(privileges.rows.length, 9)

    const columnPrivileges = await client.query(
      `select attribute.attname, privilege_row.privilege_type,
              privilege_row.is_grantable
         from pg_attribute attribute
         cross join lateral aclexplode(attribute.attacl) privilege_row
        where attribute.attrelid = format('public.%I', $1::text)::regclass
          and attribute.attnum > 0
          and not attribute.attisdropped`,
      [row.relname],
    )
    assert.deepEqual(columnPrivileges.rows, [])

    const rowCount = await client.query(
      `select count(*)::integer as count from public.${row.relname}`,
    )
    assert.equal(rowCount.rows[0].count, 0, `${row.relname} unexpectedly contains seed rows.`)
  }
}

async function runHarness() {
  if (!fs.existsSync(WRAPPER_PATH) || !fs.existsSync(MIGRATION_PATH)) {
    throw new Error('PROFITABILITY_ACCESS_V2_FILES_MISSING')
  }

  const launchOptions = { args: [foundation.RUN_ARGUMENT], env: process.env }
  const launch = foundation.parseLaunchConfiguration(launchOptions)
  const foundationResult = await foundation.runHarness(launchOptions)
  assert.equal(foundationResult.ok, true)

  // Production must prepare this source-table privilege as a separate,
  // explicitly approved owner/admin step. The Access migration itself never
  // escalates or reuses a broad migration role to manufacture the FK grant.
  const sourceAclAdmin = new Client({ connectionString: launch.connectionString })
  await sourceAclAdmin.connect()
  try {
    await sourceAclAdmin.query(
      `grant references (org_id, uid) on table public.organization_member
         to profitability_owner`,
    )
  } finally {
    await sourceAclAdmin.end()
  }

  const executorUrl = connectionUrlForRole(
    launch.connectionString,
    foundation.MIGRATION_EXECUTOR_ROLE,
  )
  assertRawMigrationRequiresGuard({
    psqlPath: launch.psqlPath,
    connectionString: executorUrl,
  })
  runWrapper({ psqlPath: launch.psqlPath, connectionString: executorUrl })

  const admin = new Client({ connectionString: launch.connectionString })
  await admin.connect()
  let firstFingerprint
  try {
    await assertExactOwnersAclAndNoSeeds(admin)
    firstFingerprint = await schemaFingerprint(admin)

    await admin.query(
      `alter index public.organization_access_profile_lookup_idx
         rename to organization_access_profile_lookup_idx_partial`,
    )
  } finally {
    await admin.end()
  }

  runWrapperRequiresFailure({
    psqlPath: launch.psqlPath,
    connectionString: executorUrl,
    marker: /PROFITABILITY_ACCESS_V2_PARTIAL_TARGET:9\/10/,
  })

  const repair = new Client({ connectionString: launch.connectionString })
  await repair.connect()
  try {
    await repair.query(
      `alter index public.organization_access_profile_lookup_idx_partial
         rename to organization_access_profile_lookup_idx`,
    )
  } finally {
    await repair.end()
  }

    runWrapper({ psqlPath: launch.psqlPath, connectionString: executorUrl })

  const replay = new Client({ connectionString: launch.connectionString })
  await replay.connect()
  try {
    assert.equal(await schemaFingerprint(replay), firstFingerprint)
    await assertExactOwnersAclAndNoSeeds(replay)

    await replay.query(
      `grant profitability_owner to profitability_runtime
         with admin false, inherit false, set true`,
    )
    const roleGraphDriftFingerprint = await schemaFingerprint(replay)
    try {
      runWrapperRequiresFailure({
        psqlPath: launch.psqlPath,
        connectionString: executorUrl,
        marker: /PROFITABILITY_ACCESS_V2_MEMBERSHIP_GRAPH_INVALID/,
      })
      assert.equal(
        await schemaFingerprint(replay),
        roleGraphDriftFingerprint,
        'Rejected role-graph replay silently changed the Access schema.',
      )
    } finally {
      await replay.query(
        `revoke profitability_owner from profitability_runtime`,
      )
    }
    assert.equal(await schemaFingerprint(replay), firstFingerprint)

    await replay.query(`alter role profitability_migration_executor inherit`)
    const roleAttributeDriftFingerprint = await schemaFingerprint(replay)
    try {
      runWrapperRequiresFailure({
        psqlPath: launch.psqlPath,
        connectionString: executorUrl,
        marker: /PROFITABILITY_ACCESS_V2_EXECUTOR_ROLE_INVALID/,
      })
      assert.equal(
        await schemaFingerprint(replay),
        roleAttributeDriftFingerprint,
        'Rejected role-attribute replay silently changed the Access schema.',
      )
    } finally {
      await replay.query(`alter role profitability_migration_executor noinherit`)
    }
    assert.equal(await schemaFingerprint(replay), firstFingerprint)

    await replay.query(
      `grant update on table public.organization_access_profile
         to profitability_runtime`,
    )
    const driftFingerprint = await schemaFingerprint(replay)
    runWrapperRequiresFailure({
      psqlPath: launch.psqlPath,
      connectionString: executorUrl,
      marker: /PROFITABILITY_ACCESS_V2_REPLAY_RELATION_ACL_MISMATCH:organization_access_profile/,
    })
    assert.equal(
      await schemaFingerprint(replay),
      driftFingerprint,
      'Rejected ACL replay silently repaired the drift.',
    )
    await replay.query(
      `revoke update on table public.organization_access_profile
         from profitability_runtime`,
    )
    assert.equal(await schemaFingerprint(replay), firstFingerprint)

    await replay.query(
      `grant select (finance_profile) on table public.organization_access_profile
         to ${foundation.FOREIGN_ROLE}`,
    )
    const columnAclDriftFingerprint = await schemaFingerprint(replay)
    try {
      runWrapperRequiresFailure({
        psqlPath: launch.psqlPath,
        connectionString: executorUrl,
        marker: /PROFITABILITY_ACCESS_V2_REPLAY_COLUMN_ACL_MISMATCH:organization_access_profile/,
      })
      assert.equal(
        await schemaFingerprint(replay),
        columnAclDriftFingerprint,
        'Rejected column-ACL replay silently repaired the drift.',
      )
    } finally {
      await replay.query(
        `revoke select (finance_profile) on table public.organization_access_profile
           from ${foundation.FOREIGN_ROLE}`,
      )
    }
    assert.equal(await schemaFingerprint(replay), firstFingerprint)
  } finally {
    await replay.end()
  }

  return {
    ok: true,
    fingerprint: firstFingerprint,
    effects: EFFECTS,
    checks: [
      'foundation-v2-full-harness',
      'access-profile-v2-first-apply',
      'raw-sql-entrypoint-guard',
      'partial-target-replay-rejected',
      'access-profile-v2-idempotent-replay',
      'exact-owner-runtime-acl-and-zero-seeds',
      'unsafe-runtime-to-owner-role-graph-drift-rejected',
      'unsafe-executor-role-attribute-drift-rejected',
      'acl-drift-rejected-without-repair',
      'column-acl-drift-rejected-without-repair',
    ],
  }
}

if (require.main === module) {
  runHarness()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error.stack || error)
      process.exitCode = 1
    })
}

module.exports = {
  ACCESS_TABLES,
  BACKUP_REFERENCE,
  CONFIRMATION,
  EFFECTS,
  MIGRATION_PATH,
  WRAPPER_PATH,
  assertRawMigrationRequiresGuard,
  runHarness,
  schemaFingerprint,
}
