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
  '20260926_profitability_financial_model_v21_apply.psql',
)
const MIGRATION_PATH = path.join(
  ROOT_DIR,
  'dataconnect',
  'migrations',
  '20260926_profitability_financial_model_v21_additive.sql',
)
const CONFIRMATION = 'APPLY_PROFITABILITY_FINANCIAL_MODEL_V21_ONLY_20260926'
const BACKUP_REFERENCE = 'local-v21-harness-20260926'
const EFFECTS = Object.freeze({
  production: false,
  deploy: false,
  notifications: false,
  downstream: false,
})

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function connectionUrlForRole(connectionString, roleName) {
  const parsed = new URL(connectionString)
  parsed.username = roleName
  parsed.password = ''
  return parsed.toString()
}

function runWrapper({ psqlPath, connectionString }) {
  const variables = {
    profitability_v21_expected_database: foundation.EXPECTED_DATABASE,
    profitability_v21_expected_executor: foundation.MIGRATION_EXECUTOR_ROLE,
    profitability_v21_expected_migration_runner: foundation.MIGRATION_RUNNER_ROLE,
    profitability_v21_owner_role: foundation.OWNER_ROLE,
    profitability_v21_runtime_role: foundation.RUNTIME_ROLE,
    profitability_v21_backup_reference: BACKUP_REFERENCE,
    profitability_v21_confirmation: CONFIRMATION,
  }
  const args = ['-X', '--no-password', '--dbname', connectionString]
  for (const [name, value] of Object.entries(variables)) {
    args.push('-v', `${name}=${value}`)
  }
  args.push('-f', WRAPPER_PATH)
  const result = spawnSync(psqlPath, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: '' },
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(`PROFITABILITY_V21_WRAPPER_FAILED:${result.stderr || result.stdout}`)
  }
  assert.match(result.stdout, /PROFITABILITY_FINANCIAL_MODEL_V21_MIGRATION_APPLIED/)
}

function runRawMigrationRequiresGuard({ psqlPath, connectionString }) {
  const result = spawnSync(
    psqlPath,
    ['-X', '--no-password', '--dbname', connectionString, '-v', 'ON_ERROR_STOP=1', '-f', MIGRATION_PATH],
    {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      env: { ...process.env, PGPASSWORD: '' },
      windowsHide: true,
    },
  )
  assert.notEqual(result.status, 0, 'Raw V2.1 SQL unexpectedly ran without its wrapper.')
  assert.match(
    `${result.stderr}\n${result.stdout}`,
    /PROFITABILITY_V21_GUARDED_ENTRYPOINT_REQUIRED|PROFITABILITY_V21_MIGRATION_IDENTITY_MISMATCH/,
  )
}

function runWrapperRequiresFailure({ psqlPath, connectionString, marker }) {
  const variables = {
    profitability_v21_expected_database: foundation.EXPECTED_DATABASE,
    profitability_v21_expected_executor: foundation.MIGRATION_EXECUTOR_ROLE,
    profitability_v21_expected_migration_runner: foundation.MIGRATION_RUNNER_ROLE,
    profitability_v21_owner_role: foundation.OWNER_ROLE,
    profitability_v21_runtime_role: foundation.RUNTIME_ROLE,
    profitability_v21_backup_reference: BACKUP_REFERENCE,
    profitability_v21_confirmation: CONFIRMATION,
  }
  const args = ['-X', '--no-password', '--dbname', connectionString]
  for (const [name, value] of Object.entries(variables)) args.push('-v', `${name}=${value}`)
  args.push('-f', WRAPPER_PATH)
  const result = spawnSync(psqlPath, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: '' },
    windowsHide: true,
  })
  assert.notEqual(result.status, 0, 'Drifted V2.1 replay unexpectedly succeeded.')
  assert.match(`${result.stderr}\n${result.stdout}`, marker)
}

async function schemaFingerprint(client) {
  const result = await client.query(
    `select jsonb_build_object(
       'columns', (
         select jsonb_agg(jsonb_build_array(
           relation.relname, attribute.attname,
           pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
           attribute.attnotnull, pg_get_expr(default_row.adbin, default_row.adrelid)
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
           relation.relname, constraint_row.conname,
           pg_get_constraintdef(constraint_row.oid, true)
         ) order by relation.relname, constraint_row.conname)
           from pg_constraint constraint_row
           join pg_class relation on relation.oid = constraint_row.conrelid
           join pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public'
            and relation.relname = any($1::text[])
       ),
       'views', (
         select jsonb_agg(jsonb_build_array(
           relation.relname, relation.oid, relation.reloptions,
           pg_get_viewdef(relation.oid, true)
         ) order by relation.relname)
           from pg_class relation
           join pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public'
            and relation.relname = any($2::text[])
       ),
       'indexes', (
         select jsonb_agg(jsonb_build_array(
           index_row.relname, index_row.oid,
           pg_get_indexdef(index_row.oid, 0, true)
         ) order by index_row.relname)
           from pg_class index_row
           join pg_namespace namespace on namespace.oid = index_row.relnamespace
          where namespace.nspname = 'public'
            and index_row.relname = any($3::text[])
       ),
       'functions', (
         select jsonb_agg(jsonb_build_array(
           function_row.proname, function_row.oid,
           pg_get_functiondef(function_row.oid)
         ) order by function_row.proname)
           from pg_proc function_row
           join pg_namespace namespace on namespace.oid = function_row.pronamespace
          where namespace.nspname = 'public'
            and function_row.proname = any($4::text[])
       ),
       'triggers', (
         select jsonb_agg(jsonb_build_array(
           relation.relname, trigger_row.tgname,
           pg_get_triggerdef(trigger_row.oid, true)
         ) order by relation.relname, trigger_row.tgname)
           from pg_trigger trigger_row
           join pg_class relation on relation.oid = trigger_row.tgrelid
           join pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public'
            and trigger_row.tgname = any($5::text[])
            and not trigger_row.tgisinternal
       )
     ) as fingerprint`,
    [
      [
        'object_financial_entry',
        'profitability_command_receipt',
        'profitability_financial_model_enforcement',
        'object_hygiene_package_version',
      ],
      ['profitability_effective_financial_entry', 'profitability_effective_hygiene_package'],
      [
        'object_financial_entry_active_value_basis_uidx',
        'profitability_command_receipt_created_idx',
        'object_hygiene_package_active_recognition_uidx',
        'object_hygiene_package_lookup_idx',
      ],
      [
        'profitability_v21_guard_command_receipt',
        'profitability_v21_guard_hygiene_package',
        'profitability_v21_validate_financial_pair',
        'profitability_v21_validate_hygiene_pair',
      ],
      [
        'profitability_command_receipt_transition_v21',
        'object_hygiene_package_transition_v21',
        'object_financial_entry_pair_dimensions_v21',
        'object_hygiene_package_pair_dimensions_v21',
      ],
    ],
  )
  return crypto.createHash('sha256')
    .update(JSON.stringify(result.rows[0].fingerprint))
    .digest('hex')
}

async function behaviorSmoke(connectionString) {
  const admin = new Client({ connectionString })
  const runtime = new Client({
    connectionString: connectionUrlForRole(connectionString, foundation.SESSION_ROLE),
  })
  await admin.connect()
  await runtime.connect()
  try {
    await admin.query(
      `insert into public.service_object
        (org_id, object_id, client_id, name, created_by_uid)
       values ('harness-alpha', 'V21-OBJECT', 'CLIENT-A', 'V21 Object', 'uid-a')`,
    )

    await runtime.query('begin')
    await runtime.query('set local role profitability_runtime')

    const entrySql = `insert into public.object_financial_entry
      (org_id, object_id, entry_id, entry_group, category, name,
       amount_minor, currency, occurred_on, recurrence, created_by_uid,
       value_basis, value_key)
      values ('harness-alpha', 'V21-OBJECT', $1, 'MATERIAL', 'HYGIENE', $2,
              $3, 'PLN', date '2026-09-01', 'ONE_TIME', 'uid-a', $4, $5)`
    await runtime.query(entrySql, ['PLAN-1', 'Plan', 12000, 'PLAN', 'soap-2026-09'])
    await runtime.query(entrySql, ['EST-1', 'Estimate', 10000, 'ESTIMATE', 'soap-2026-09'])
    await runtime.query(entrySql, ['ACT-1', 'Actual', 8000, 'ACTUAL', 'soap-2026-09'])

    const effectiveEntries = await runtime.query(
      `select entry_id, value_basis, amount_minor
         from public.profitability_effective_financial_entry
        where org_id = 'harness-alpha' and object_id = 'V21-OBJECT'
        order by entry_id`,
    )
    assert.deepEqual(effectiveEntries.rows, [{
      entry_id: 'ACT-1',
      value_basis: 'ACTUAL',
      amount_minor: '8000',
    }])
    const effectiveEntryTotal = await runtime.query(
      `select count(*)::integer as row_count,
              coalesce(sum(amount_minor), 0)::bigint as amount_minor
         from public.profitability_effective_financial_entry
        where org_id = 'harness-alpha'
          and object_id = 'V21-OBJECT'
          and value_key = 'soap-2026-09'`,
    )
    assert.deepEqual(effectiveEntryTotal.rows[0], {
      row_count: 1,
      amount_minor: '8000',
    })

    await runtime.query(entrySql, [
      'EST-MISMATCH',
      'Estimate mismatch guard',
      4000,
      'ESTIMATE',
      'mismatch-2026-09',
    ])
    await runtime.query('savepoint financial_dimension_mismatch')
    await assert.rejects(
      runtime.query(
        `insert into public.object_financial_entry
          (org_id, object_id, entry_id, entry_group, category, name,
           amount_minor, currency, occurred_on, recurrence, created_by_uid,
           value_basis, value_key)
         values ('harness-alpha', 'V21-OBJECT', 'ACT-MISMATCH',
                 'TRANSPORT', 'TRAVEL', 'Actual mismatch guard',
                 3900, 'PLN', date '2026-09-01', 'ONE_TIME', 'uid-a',
                 'ACTUAL', 'mismatch-2026-09')`,
      ),
      /PROFITABILITY_V21_FINANCIAL_PAIR_DIMENSION_MISMATCH/i,
    )
    await runtime.query('rollback to savepoint financial_dimension_mismatch')

    await runtime.query(
      `insert into public.profitability_command_receipt
        (org_id, command_id, object_id, command_kind, request_sha256, created_by_uid)
       values ('harness-alpha', 'CMD-1', 'V21-OBJECT', 'UPSERT_HYGIENE', $1, 'uid-a')`,
      ['a'.repeat(64)],
    )
    await runtime.query(
      `update public.profitability_command_receipt
          set state = 'SUCCEEDED', result_reference = 'PKG-1',
              updated_at = now(), completed_at = now()
        where org_id = 'harness-alpha' and command_id = 'CMD-1'`,
    )
    await runtime.query('savepoint terminal_receipt')
    await assert.rejects(
      runtime.query(
        `update public.profitability_command_receipt
            set updated_at = now()
          where org_id = 'harness-alpha' and command_id = 'CMD-1'`,
      ),
      /invalid profitability command receipt transition/i,
    )
    await runtime.query('rollback to savepoint terminal_receipt')
    await runtime.query('rollback')

    const concurrentEstimate = new Client({
      connectionString: connectionUrlForRole(connectionString, foundation.SESSION_ROLE),
    })
    const concurrentActual = new Client({
      connectionString: connectionUrlForRole(connectionString, foundation.SESSION_ROLE),
    })
    await concurrentEstimate.connect()
    await concurrentActual.connect()
    try {
      await concurrentEstimate.query('begin')
      await concurrentActual.query('begin')
      await concurrentEstimate.query('set local role profitability_runtime')
      await concurrentActual.query('set local role profitability_runtime')
      await concurrentEstimate.query(
        `insert into public.object_financial_entry
          (org_id, object_id, entry_id, entry_group, category, name,
           amount_minor, currency, occurred_on, recurrence, created_by_uid,
           value_basis, value_key)
         values ('harness-alpha', 'V21-OBJECT', 'EST-CONCURRENT',
                 'MATERIAL', 'HYGIENE', 'Concurrent estimate',
                 5000, 'PLN', date '2026-09-02', 'ONE_TIME', 'uid-a',
                 'ESTIMATE', 'concurrent-2026-09')`,
      )

      let concurrentOutcome = 'PENDING'
      const concurrentAttempt = concurrentActual.query(
        `insert into public.object_financial_entry
          (org_id, object_id, entry_id, entry_group, category, name,
           amount_minor, currency, occurred_on, recurrence, created_by_uid,
           value_basis, value_key)
         values ('harness-alpha', 'V21-OBJECT', 'ACT-CONCURRENT',
                 'TRANSPORT', 'TRAVEL', 'Concurrent actual mismatch',
                 4900, 'PLN', date '2026-09-02', 'ONE_TIME', 'uid-a',
                 'ACTUAL', 'concurrent-2026-09')`,
      ).then(
        () => { concurrentOutcome = 'RESOLVED' },
        (error) => { concurrentOutcome = error },
      )
      await delay(150)
      assert.equal(
        concurrentOutcome,
        'PENDING',
        'Concurrent ACTUAL did not wait for the stable-key transaction lock.',
      )
      await concurrentEstimate.query('commit')
      await concurrentAttempt
      assert.ok(concurrentOutcome instanceof Error)
      assert.match(
        concurrentOutcome.message,
        /PROFITABILITY_V21_FINANCIAL_PAIR_DIMENSION_MISMATCH/i,
      )
      await concurrentActual.query('rollback')
    } finally {
      await concurrentEstimate.query('rollback').catch(() => {})
      await concurrentActual.query('rollback').catch(() => {})
      await concurrentEstimate.end().catch(() => {})
      await concurrentActual.end().catch(() => {})
    }

    await runtime.query('begin')
    await runtime.query('set local role profitability_runtime')
    const packageSql = `insert into public.object_hygiene_package_version
      (org_id, object_id, package_id, package_version_id, version_no,
       recognition_key, package_name, billing_mode, value_basis,
       price_net_minor, cost_minor, effective_from, effective_to,
       status, created_by_uid)
      values ('harness-alpha', 'V21-OBJECT', 'PKG-1', $1, $2,
              'PKG-1:2026-09', 'Pakiet higieny', 'IN_CONTRACT', $3,
              10000, $4, date '2026-09-01', date '2026-10-01',
              'POSTED', 'uid-a')`
    await runtime.query(packageSql, ['PKG-PLAN', 1, 'PLAN', 7600])
    await runtime.query(packageSql, ['PKG-EST', 1, 'ESTIMATE', 8000])
    await runtime.query(packageSql, ['PKG-ACT', 1, 'ACTUAL', 8500])
    await runtime.query(
      `insert into public.object_hygiene_package_version
        (org_id, object_id, package_id, package_version_id, version_no,
         recognition_key, package_name, billing_mode, value_basis,
         price_net_minor, cost_minor, effective_from, effective_to,
         status, created_by_uid)
       values ('harness-alpha', 'V21-OBJECT', 'PKG-MISMATCH', 'PKG-MISMATCH-EST', 1,
               'PKG-MISMATCH:2026-09', 'Mismatch estimate', 'IN_CONTRACT', 'ESTIMATE',
               10000, 8100, date '2026-09-01', date '2026-10-01',
               'POSTED', 'uid-a')`,
    )
    await runtime.query('savepoint hygiene_dimension_mismatch')
    await assert.rejects(
      runtime.query(
        `insert into public.object_hygiene_package_version
          (org_id, object_id, package_id, package_version_id, version_no,
           recognition_key, package_name, billing_mode, value_basis,
           price_net_minor, cost_minor, effective_from, effective_to,
           status, created_by_uid)
         values ('harness-alpha', 'V21-OBJECT', 'PKG-OTHER', 'PKG-MISMATCH-ACT', 1,
                 'PKG-MISMATCH:2026-09', 'Mismatch actual', 'MONTHLY_EXTRA', 'ACTUAL',
                 10000, 8200, date '2026-09-02', date '2026-10-01',
                 'POSTED', 'uid-a')`,
      ),
      /PROFITABILITY_V21_HYGIENE_PAIR_DIMENSION_MISMATCH/i,
    )
    await runtime.query('rollback to savepoint hygiene_dimension_mismatch')
    await runtime.query(
      `insert into public.object_hygiene_package_version
        (org_id, object_id, package_id, package_version_id, version_no,
         recognition_key, package_name, billing_mode, value_basis,
         price_net_minor, cost_minor, effective_from, occurred_on,
         status, created_by_uid)
       values ('harness-alpha', 'V21-OBJECT', 'PKG-ADHOC', 'PKG-ADHOC-DRAFT', 1,
               'PKG-ADHOC:2026-09-15', 'Dostawa ad hoc', 'AD_HOC', 'ACTUAL',
               5000, 4000, date '2026-09-15', date '2026-09-15',
               'DRAFT', 'uid-a')`,
    )
    await runtime.query(
      `update public.object_hygiene_package_version
          set status = 'POSTED', updated_at = now(), updated_by_uid = 'uid-a'
        where org_id = 'harness-alpha'
          and object_id = 'V21-OBJECT'
          and package_version_id = 'PKG-ADHOC-DRAFT'`,
    )
    const packages = await runtime.query(
      `select package_version_id, value_basis, margin_bps, recognized_revenue_minor
         from public.profitability_effective_hygiene_package
        where org_id = 'harness-alpha' and object_id = 'V21-OBJECT'
        order by package_version_id`,
    )
    assert.deepEqual(packages.rows, [
      {
        package_version_id: 'PKG-ACT',
        value_basis: 'ACTUAL',
        margin_bps: 1500,
        recognized_revenue_minor: '0',
      },
      {
        package_version_id: 'PKG-ADHOC-DRAFT',
        value_basis: 'ACTUAL',
        margin_bps: 2000,
        recognized_revenue_minor: '5000',
      },
      {
        package_version_id: 'PKG-MISMATCH-EST',
        value_basis: 'ESTIMATE',
        margin_bps: 1900,
        recognized_revenue_minor: '0',
      },
    ])
    const effectivePackageTotal = await runtime.query(
      `select count(*)::integer as row_count,
              coalesce(sum(cost_minor), 0)::bigint as cost_minor
         from public.profitability_effective_hygiene_package
        where org_id = 'harness-alpha'
          and object_id = 'V21-OBJECT'
          and recognition_key = 'PKG-1:2026-09'`,
    )
    assert.deepEqual(effectivePackageTotal.rows[0], {
      row_count: 1,
      cost_minor: '8500',
    })
    await runtime.query('savepoint immutable_package')
    await assert.rejects(
      runtime.query(
        `update public.object_hygiene_package_version
            set price_net_minor = 9999
          where org_id = 'harness-alpha' and object_id = 'V21-OBJECT'`,
      ),
      /permission denied/i,
    )
    await runtime.query('rollback to savepoint immutable_package')
    await runtime.query('savepoint deny_package_delete')
    await assert.rejects(
      runtime.query(
        `delete from public.object_hygiene_package_version
          where org_id = 'harness-alpha' and object_id = 'V21-OBJECT'`,
      ),
      /permission denied|immutable/i,
    )
    await runtime.query('rollback to savepoint deny_package_delete')
    await runtime.query('commit')

    await assert.rejects(
      admin.query(
        `update public.object_hygiene_package_version
            set cost_minor = cost_minor + 1
          where org_id = 'harness-alpha'
            and object_id = 'V21-OBJECT'
            and package_version_id = 'PKG-ACT'`,
      ),
      /hygiene package versions are append-only/i,
    )
  } finally {
    await runtime.query('rollback').catch(() => {})
    await runtime.end().catch(() => {})
    await admin.end().catch(() => {})
  }
}

async function runHarness() {
  if (!fs.existsSync(WRAPPER_PATH) || !fs.existsSync(MIGRATION_PATH)) {
    throw new Error('PROFITABILITY_V21_FILES_MISSING')
  }
  const launchOptions = {
    args: [foundation.RUN_ARGUMENT],
    env: process.env,
  }
  const launch = foundation.parseLaunchConfiguration(launchOptions)
  const foundationResult = await foundation.runHarness(launchOptions)
  assert.equal(foundationResult.ok, true)

  const executorUrl = connectionUrlForRole(
    launch.connectionString,
    foundation.MIGRATION_EXECUTOR_ROLE,
  )
  runRawMigrationRequiresGuard({ psqlPath: launch.psqlPath, connectionString: executorUrl })
  runWrapper({ psqlPath: launch.psqlPath, connectionString: executorUrl })

  const admin = new Client({ connectionString: launch.connectionString })
  await admin.connect()
  let firstFingerprint
  try {
    const markerRows = await admin.query(
      'select count(*)::integer as count from public.profitability_financial_model_enforcement',
    )
    assert.equal(markerRows.rows[0].count, 0, 'V2.1 migration seeded an enforcement marker.')
    firstFingerprint = await schemaFingerprint(admin)
  } finally {
    await admin.end()
  }

  const driftAdmin = new Client({ connectionString: launch.connectionString })
  await driftAdmin.connect()
  try {
    await driftAdmin.query(
      `alter index public.object_hygiene_package_lookup_idx
         rename to object_hygiene_package_lookup_idx_drift`,
    )
  } finally {
    await driftAdmin.end()
  }
  runWrapperRequiresFailure({
    psqlPath: launch.psqlPath,
    connectionString: executorUrl,
    marker: /PROFITABILITY_V21_PARTIAL_TARGET:18\/19/,
  })
  const repairAdmin = new Client({ connectionString: launch.connectionString })
  await repairAdmin.connect()
  try {
    await repairAdmin.query(
      `alter index public.object_hygiene_package_lookup_idx_drift
         rename to object_hygiene_package_lookup_idx`,
    )
  } finally {
    await repairAdmin.end()
  }

  runWrapper({ psqlPath: launch.psqlPath, connectionString: executorUrl })

  const replayAdmin = new Client({ connectionString: launch.connectionString })
  await replayAdmin.connect()
  try {
    assert.equal(await schemaFingerprint(replayAdmin), firstFingerprint)
  } finally {
    await replayAdmin.end()
  }

  await behaviorSmoke(launch.connectionString)
  return {
    ok: true,
    fingerprint: firstFingerprint,
    effects: EFFECTS,
    checks: [
      'foundation-v2-full-harness',
      'v21-first-apply',
      'raw-sql-entrypoint-guard',
      'partial-target-replay-rejected',
      'v21-idempotent-replay',
      'seedless-financial-model-enforcement',
      'actual-replaces-estimate',
      'plan-excluded-from-effective-actuals',
      'command-receipt-terminal-transition',
      'hygiene-actual-precedence-and-in-contract-zero-revenue',
      'financial-pair-dimension-mismatch-rejected',
      'hygiene-pair-dimension-mismatch-rejected',
      'concurrent-stable-key-pair-serialized',
      'runtime-delete-denied',
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
  BACKUP_REFERENCE,
  CONFIRMATION,
  EFFECTS,
  MIGRATION_PATH,
  WRAPPER_PATH,
  runHarness,
  schemaFingerprint,
}
