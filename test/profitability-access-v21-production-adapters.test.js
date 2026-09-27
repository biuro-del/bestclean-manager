'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const {
  createProfitabilityAccessV21ProductionDependencies,
  extractAccessPostflight,
  grantAccessSourceReferences,
  inspectAccessSourceReferences,
  inspectAccessProfileState,
  inspectFinancialModelState,
  inspectRuntimeGates,
  loadPostflights,
} = require('../scripts/lib/profitability-access-v21-production-adapters')

const SOURCE_OWNER = 'firebaseowner_iclean-room-database_public'

function revision(env = {}) {
  return {
    containers: [{
      env: Object.entries(env).map(([name, value]) => ({ name, value })),
    }],
  }
}

function sourceReferenceClient({ wrongOwner = false, partial = false } = {}) {
  const calls = []
  let granted = false
  const client = {
    calls,
    async query(sql, values) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim()
      calls.push({ sql: normalized, values })
      if (normalized === 'begin' || normalized === 'commit' || normalized === 'rollback') {
        return { rows: [] }
      }
      if (normalized.includes('pg_advisory_xact_lock')) return { rows: [{}] }
      if (normalized.includes('owner_role.rolname as owner_name')) {
        return {
          rows: [
            { table_name: 'organizations', owner_name: SOURCE_OWNER },
            {
              table_name: 'organization_member',
              owner_name: wrongOwner ? 'unexpected_owner' : SOURCE_OWNER,
            },
            { table_name: 'service_object', owner_name: 'profitability_owner' },
          ],
        }
      }
      if (normalized.startsWith('select has_column_privilege')) {
        return {
          rows: [{
            organizations_org_id: true,
            member_org_id: granted || partial,
            member_uid: granted,
            object_org_id: true,
            object_id: true,
          }],
        }
      }
      if (normalized.includes("relation_row.relname = 'organization_member'")) {
        return {
          rows: granted
            ? [
              {
                column_name: 'org_id',
                privilege_type: 'REFERENCES',
                is_grantable: false,
                grantor_name: SOURCE_OWNER,
              },
              {
                column_name: 'uid',
                privilege_type: 'REFERENCES',
                is_grantable: false,
                grantor_name: SOURCE_OWNER,
              },
            ]
            : [],
        }
      }
      if (normalized.includes('cardinality(relation_row.relacl)')) return { rows: [] }
      if (normalized.startsWith('select current_user = session_user')) {
        return { rows: [{ direct_session: true, may_set_owner: true }] }
      }
      if (normalized.startsWith('set local role')) return { rows: [] }
      if (normalized.startsWith('grant references (org_id, uid)')) {
        granted = true
        return { rows: [] }
      }
      throw new Error(`unexpected query: ${normalized}`)
    },
  }
  return client
}

test('runtime gate audit includes DB, Access V2, V2.1 and both organization allowlists', () => {
  const disabled = inspectRuntimeGates([revision({
    PROFITABILITY_DB_ENABLED: 'false',
    PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: '0',
    PROFITABILITY_FINANCIAL_MODEL_V21_ENABLED: 'nie',
    PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS: '',
    PROFITABILITY_FINANCIAL_MODEL_V21_ALLOWED_ORG_IDS: '',
  })])
  assert.deepEqual(disabled, {
    allDisabled: true,
    dbEnabled: false,
    accessEnabled: false,
    financialEnabled: false,
    allowlistCount: 0,
  })

  const enabled = inspectRuntimeGates([
    revision({ PROFITABILITY_DB_ENABLED: 'false' }),
    revision({
      PROFITABILITY_ACCESS_PROFILE_V2_ENABLED: 'true',
      PROFITABILITY_FINANCIAL_MODEL_V21_ALLOWED_ORG_IDS: 'bestclean, second-org',
    }),
  ])
  assert.equal(enabled.allDisabled, false)
  assert.equal(enabled.accessEnabled, true)
  assert.equal(enabled.allowlistCount, 2)
})

test('source reference repair is transactional and grants only organization_member(org_id, uid)', async () => {
  const client = sourceReferenceClient()
  assert.equal((await inspectAccessSourceReferences(client)).status, 'repairable')
  const result = await grantAccessSourceReferences(client, { mutate: true })
  assert.equal(result.status, 'exact')
  const mutating = client.calls.filter(({ sql }) => (
    sql.startsWith('grant ') || sql.startsWith('alter ') || sql.startsWith('revoke ')
  ))
  assert.equal(mutating.length, 1)
  assert.match(mutating[0].sql, /^grant references \(org_id, uid\) on table public\.organization_member/)
  assert.equal(client.calls.some(({ sql }) => sql === 'commit'), true)
  assert.equal(client.calls.some(({ sql }) => sql.startsWith(`set local role "${SOURCE_OWNER}"`)), true)
})

test('source reference repair refuses partial ACL and wrong ownership before GRANT', async () => {
  for (const configuration of [{ partial: true }, { wrongOwner: true }]) {
    const client = sourceReferenceClient(configuration)
    await assert.rejects(
      grantAccessSourceReferences(client, { mutate: true }),
      /ACCESS_SOURCE_REFERENCE_STATE_REQUIRES_REVIEW/,
    )
    assert.equal(client.calls.some(({ sql }) => sql.startsWith('grant references')), false)
    assert.equal(client.calls.some(({ sql }) => sql === 'rollback'), true)
  }
})

test('source reference repair is mutation opt-in only', async () => {
  const client = sourceReferenceClient()
  await assert.rejects(
    grantAccessSourceReferences(client),
    /ACCESS_SOURCE_REFERENCE_GRANT_OPT_IN_REQUIRED/,
  )
  assert.equal(client.calls.length, 0)
})

test('independent postflights are extracted from the pinned Access and V2.1 migrations', () => {
  const rootDir = path.resolve(__dirname, '..')
  const postflights = loadPostflights(rootDir)
  assert.match(postflights.access, /^do \$\$/)
  assert.match(postflights.access, /profitability_access_enforcement/)
  assert.match(postflights.financial, /^do \$profitability_v21_postflight\$/)
  assert.match(postflights.financial, /profitability_financial_model_enforcement/)
  assert.throws(
    () => extractAccessPostflight('-- no exact postflight here'),
    /ACCESS_POSTFLIGHT_SOURCE_INVALID/,
  )
})

test('IAM-only full relation shapes require executor verification instead of being mislabeled partial', async () => {
  const queries = []
  const client = {
    async query(sql, values = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim()
      queries.push(normalized)
      if (normalized.startsWith('begin transaction') || normalized === 'rollback') {
        return { rows: [] }
      }
      if (normalized.includes('relation_row.relkind::text')) {
        return {
          rows: (values[0] || []).map((relname) => ({ relname, relkind: 'r' })),
        }
      }
      if (normalized.includes("attrelid = to_regclass('public.object_financial_entry')")) {
        return { rows: [{ attname: 'value_basis' }, { attname: 'value_key' }] }
      }
      throw new Error(`unexpected query: ${normalized}`)
    },
  }

  assert.deepEqual(
    await inspectAccessProfileState(client, 'do $$ begin end $$;', { allowUnverified: true }),
    { status: 'verification_required', seedRowCount: null },
  )
  assert.deepEqual(
    await inspectFinancialModelState(
      client,
      'do $test$ begin end $test$;',
      { allowUnverified: true },
    ),
    { status: 'verification_required', seedRowCount: null },
  )
  assert.equal(queries.some((sql) => sql.startsWith('set local role')), false)
  assert.equal(queries.some((sql) => sql.startsWith('do ')), false)
})

test('production facade pins users.update and the two guarded psql entrypoints', async () => {
  const cloudCalls = []
  const psqlCalls = []
  const proxyCalls = []
  const dependencies = createProfitabilityAccessV21ProductionDependencies({
    rootDir: path.resolve(__dirname, '..'),
    cloudApi: {
      async updateBuiltinUserPassword(options) {
        cloudCalls.push(['update', options])
        return { status: 'updated' }
      },
      async settleBuiltinUserPasswordUpdate(options) {
        cloudCalls.push(['settle', options])
        return { terminal: true, succeeded: true, operationName: options.operationName }
      },
    },
    gitAdapter: {},
    pgAdapter: { async close() {} },
    proxyAdapter: {
      async prepare() {
        proxyCalls.push('prepare')
        return { host: '127.0.0.1', port: 6543 }
      },
      async close() { proxyCalls.push('close') },
    },
    psqlAdapter: {
      async runFile(options) { psqlCalls.push(options); return { code: 0 } },
    },
  })
  const password = Buffer.alloc(48, 7)

  await dependencies.cloudSqlAdmin.activateProvisioner({ password, mutate: true })
  await dependencies.cloudSqlAdmin.settleProvisionerActivation({ operationName: 'operation-1' })
  assert.equal(cloudCalls[0][1].name, 'profitability_provisioner')
  assert.equal(cloudCalls[0][1].mutate, true)
  assert.equal(cloudCalls[0][1].password, password.toString('base64url'))
  assert.deepEqual(cloudCalls[1], ['settle', { operationName: 'operation-1' }])

  await dependencies.psqlRunner.prepare()
  await dependencies.psqlRunner.runAccessProfile({
    password,
    options: { backupId: '1790505049269' },
  })
  await dependencies.psqlRunner.runFinancialModel({
    password,
    options: { backupId: '1790505049269' },
  })
  assert.equal(psqlCalls.length, 2)
  assert.equal(psqlCalls.every((call) => call.host === '127.0.0.1'), true)
  assert.equal(psqlCalls.every((call) => call.port === 6543), true)
  assert.equal(psqlCalls.every((call) => call.user === 'profitability_migration_executor'), true)
  assert.equal(psqlCalls.every((call) => call.mutate === true), true)
  assert.equal(psqlCalls[0].file.endsWith('20260925_profitability_access_profile_v2_apply.psql'), true)
  assert.equal(psqlCalls[1].file.endsWith('20260926_profitability_financial_model_v21_apply.psql'), true)
  assert.equal(
    psqlCalls[0].variables.profitability_access_confirmation,
    'APPLY_PROFITABILITY_ACCESS_PROFILE_V2_ONLY_20260925',
  )
  assert.equal(
    psqlCalls[1].variables.profitability_v21_confirmation,
    'APPLY_PROFITABILITY_FINANCIAL_MODEL_V21_ONLY_20260926',
  )
  assert.equal(Object.keys(psqlCalls[0].variables).some((key) => /pass|secret|token/i.test(key)), false)
  assert.equal(Object.keys(psqlCalls[1].variables).some((key) => /pass|secret|token/i.test(key)), false)
  await dependencies.close()
  assert.deepEqual(proxyCalls, ['prepare', 'close'])
})

test('production facade ignores ambient trust-anchor overrides and verifies the exact git remote URL', async () => {
  const runtimeCalls = []
  const dependencies = createProfitabilityAccessV21ProductionDependencies({
    rootDir: path.resolve(__dirname, '..'),
    environment: {
      PROFITABILITY_RUNTIME_REGION: 'attacker-region',
      PROFITABILITY_RUNTIME_SERVICE: 'attacker-service',
      PROFITABILITY_IAM_DATABASE_USER: 'attacker@example.com',
      PROFITABILITY_GIT_REMOTE: 'origin',
    },
    gitAdapter: {
      async inspect() {
        return { branch: 'codex/test', head: 'a'.repeat(40), clean: true, status: '' }
      },
      async inspectRemoteHead() { return 'a'.repeat(40) },
      async inspectRemoteUrl(_cwd, options) {
        assert.deepEqual(options, { remote: 'cleanzi01' })
        return 'https://github.com/biuro-del/Cleanzi-01.git'
      },
    },
    cloudApi: {
      async inspectInstance() { return { region: 'europe-west3', state: 'RUNNABLE' } },
      async inspectBackupRun(id) { return { id, status: 'SUCCESSFUL' } },
      async inspectCloudRunService(options) {
        runtimeCalls.push(['service', options])
        return { trafficStatuses: [{ revision: 'cleanzi-01-r1', percent: 100 }] }
      },
      async inspectCloudRunRevision(options) {
        runtimeCalls.push(['revision', options])
        return revision()
      },
    },
    pgAdapter: { async close() {} },
    proxyAdapter: { async close() {} },
    psqlAdapter: {},
  })

  const source = await dependencies.sourceControl.inspect()
  const cloud = await dependencies.cloudSqlAdmin.inspect({ backupId: 'backup-1' })
  assert.equal(source.remote, 'cleanzi01')
  assert.equal(source.remoteUrl, 'https://github.com/biuro-del/Cleanzi-01.git')
  assert.equal(cloud.runtimeRegion, 'europe-west4')
  assert.equal(cloud.runtimeService, 'cleanzi-01')
  assert.deepEqual(runtimeCalls, [
    ['service', { region: 'europe-west4', service: 'cleanzi-01' }],
    ['revision', {
      region: 'europe-west4', service: 'cleanzi-01', revision: 'cleanzi-01-r1',
    }],
  ])
})

test('production facade rejects explicit trust-anchor drift before any inspection', () => {
  const rootDir = path.resolve(__dirname, '..')
  for (const [option, value, code] of [
    ['runtimeRegion', 'us-central1', 'RUNTIME_REGION_MISMATCH'],
    ['runtimeService', 'other-service', 'RUNTIME_SERVICE_MISMATCH'],
    ['iamDatabaseUser', 'other@example.com', 'IAM_DATABASE_USER_MISMATCH'],
    ['remote', 'origin', 'GIT_REMOTE_MISMATCH'],
    ['remoteUrl', 'https://github.com/example/other.git', 'GIT_REMOTE_URL_MISMATCH'],
  ]) {
    assert.throws(
      () => createProfitabilityAccessV21ProductionDependencies({ rootDir, [option]: value }),
      new RegExp(code),
    )
  }
})
