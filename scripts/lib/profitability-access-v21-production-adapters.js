'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const {
  DEFAULT_PSQL_PATH,
  createCloudSqlAdminApiAdapter,
  createCloudSqlAuthProxyAdapter,
  createCloudSqlPgAdapter,
  createGitStatusAdapter,
  createPsqlAdapter,
  inspectExistingFoundationPostflight,
  inspectFoundationState,
  lockRolePassword,
  normalizeRoleState,
  setRolePassword,
} = require('./profitability-foundation-production-adapters')

const PROJECT = 'iclean-room'
const INSTANCE = 'iclean-room-instance'
const REGION = 'europe-west3'
const DATABASE = 'iclean-room-database'
const CONNECTION_NAME = `${PROJECT}:${REGION}:${INSTANCE}`
const RUNTIME_REGION = 'europe-west4'
const RUNTIME_SERVICE = 'cleanzi-01'
const IAM_DATABASE_USER = 'biuro@bestclean.pl'
const REMOTE = 'cleanzi01'
const REMOTE_URL = 'https://github.com/biuro-del/Cleanzi-01.git'
const SOURCE_OWNER = 'firebaseowner_iclean-room-database_public'
const PROVISIONER = 'profitability_provisioner'
const EXECUTOR = 'profitability_migration_executor'
const MIGRATION_RUNNER = 'profitability_migration_runner'
const OWNER = 'profitability_owner'
const SESSION = 'profitability_session'
const RUNTIME = 'profitability_runtime'

const ACCESS_TABLES = Object.freeze([
  'profitability_access_enforcement',
  'organization_access_profile',
  'service_object_assignment',
  'profitability_target_history',
])
const FINANCIAL_TABLES = Object.freeze([
  'profitability_command_receipt',
  'profitability_financial_model_enforcement',
  'object_hygiene_package_version',
])
const FINANCIAL_VIEWS = Object.freeze([
  'profitability_effective_financial_entry',
  'profitability_effective_hygiene_package',
])

function text(value) {
  return String(value ?? '').trim()
}

function pinnedOption(value, expected, code) {
  const normalized = text(value)
  if (normalized && normalized !== expected) throw new Error(code)
  return expected
}

function identifier(value, code = 'UNSAFE_IDENTIFIER') {
  const normalized = text(value)
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(normalized)) throw new Error(code)
  return normalized
}

function quoteIdentifier(value) {
  return `"${identifier(value).replaceAll('"', '""')}"`
}

function secretString(value) {
  const normalized = Buffer.isBuffer(value) ? value.toString('base64url') : String(value ?? '')
  if (normalized.length < 24 || normalized.includes('\0')) throw new Error('EPHEMERAL_PASSWORD_POLICY_FAILED')
  return normalized
}

async function withReadOnlySnapshot(client, callback) {
  await client.query('begin transaction isolation level repeatable read read only')
  try {
    const result = await callback()
    await client.query('rollback')
    return result
  } catch (error) {
    try { await client.query('rollback') } catch {}
    throw error
  }
}

async function withTransaction(client, callback) {
  await client.query('begin')
  try {
    const result = await callback()
    await client.query('commit')
    return result
  } catch (error) {
    try { await client.query('rollback') } catch {}
    throw error
  }
}

function extractAccessPostflight(source) {
  const marker = '-- Idempotent postflight:'
  const markerOffset = source.indexOf(marker)
  if (markerOffset < 0 || source.indexOf(marker, markerOffset + marker.length) >= 0) {
    throw new Error('ACCESS_POSTFLIGHT_SOURCE_INVALID')
  }
  const start = source.indexOf('do $$', markerOffset)
  const end = source.indexOf('\n$$;', start)
  if (start < 0 || end < 0) throw new Error('ACCESS_POSTFLIGHT_SOURCE_INVALID')
  const block = source.slice(start, end + 4)
  if (block.includes('\0') || /(^|\r?\n)\s*\\/m.test(block)) {
    throw new Error('ACCESS_POSTFLIGHT_SOURCE_INVALID')
  }
  return block
}

function extractTaggedDoBlock(source, tag, code) {
  const opening = `do ${tag}`
  const closing = `${tag};`
  const start = source.indexOf(opening)
  const end = source.indexOf(closing, start + opening.length)
  if (start < 0 || end < 0
      || source.indexOf(opening, start + opening.length) >= 0
      || source.indexOf(closing, end + closing.length) >= 0) {
    throw new Error(code)
  }
  const block = source.slice(start, end + closing.length)
  if (block.includes('\0') || /(^|\r?\n)\s*\\/m.test(block)) throw new Error(code)
  return block
}

function loadPostflights(rootDir) {
  const accessSource = fs.readFileSync(path.join(
    rootDir,
    'dataconnect',
    'migrations',
    '20260925_profitability_access_profile_v2_additive.sql',
  ), 'utf8')
  const financialSource = fs.readFileSync(path.join(
    rootDir,
    'dataconnect',
    'migrations',
    '20260926_profitability_financial_model_v21_additive.sql',
  ), 'utf8')
  return Object.freeze({
    access: extractAccessPostflight(accessSource),
    financial: extractTaggedDoBlock(
      financialSource,
      '$profitability_v21_postflight$',
      'FINANCIAL_V21_POSTFLIGHT_SOURCE_INVALID',
    ),
  })
}

function runtimeEnvironmentMap(revision) {
  const containers = revision?.containers || revision?.template?.containers || []
  const result = new Map()
  for (const container of containers) {
    for (const variable of container?.env || []) {
      const name = text(variable?.name)
      if (!name) continue
      result.set(name, Object.hasOwn(variable, 'value')
        ? { kind: 'value', value: String(variable.value ?? '') }
        : { kind: 'valueSource' })
    }
  }
  return result
}

function booleanGate(variable, name) {
  if (variable?.kind === 'valueSource') throw new Error(`${name}_SECRET_SOURCE_FORBIDDEN`)
  const value = text(variable?.value).toLowerCase()
  if (!value || ['0', 'false', 'no', 'nie'].includes(value)) return false
  if (['1', 'true', 'yes', 'tak'].includes(value)) return true
  throw new Error(`${name}_INVALID`)
}

function inspectRuntimeGates(revisions) {
  if (!Array.isArray(revisions) || revisions.length === 0) {
    throw new Error('CLOUD_RUN_ACTIVE_REVISION_REQUIRED')
  }
  const allowlist = new Set()
  let dbEnabled = false
  let accessEnabled = false
  let financialEnabled = false
  for (const revision of revisions) {
    const environment = runtimeEnvironmentMap(revision)
    dbEnabled ||= booleanGate(environment.get('PROFITABILITY_DB_ENABLED'), 'PROFITABILITY_DB_ENABLED')
    accessEnabled ||= booleanGate(
      environment.get('PROFITABILITY_ACCESS_PROFILE_V2_ENABLED'),
      'PROFITABILITY_ACCESS_PROFILE_V2_ENABLED',
    )
    financialEnabled ||= booleanGate(
      environment.get('PROFITABILITY_FINANCIAL_MODEL_V21_ENABLED'),
      'PROFITABILITY_FINANCIAL_MODEL_V21_ENABLED',
    )
    for (const name of [
      'PROFITABILITY_ACCESS_PROFILE_V2_ALLOWED_ORG_IDS',
      'PROFITABILITY_FINANCIAL_MODEL_V21_ALLOWED_ORG_IDS',
    ]) {
      const variable = environment.get(name)
      if (variable?.kind === 'valueSource') throw new Error(`${name}_SECRET_SOURCE_FORBIDDEN`)
      for (const orgId of String(variable?.value || '').split(',').map(text).filter(Boolean)) {
        allowlist.add(orgId.toLowerCase())
      }
    }
  }
  return Object.freeze({
    allDisabled: !dbEnabled && !accessEnabled && !financialEnabled,
    dbEnabled,
    accessEnabled,
    financialEnabled,
    allowlistCount: allowlist.size,
  })
}

async function inspectAccessSourceReferences(client) {
  const ownerRows = await client.query(
    `select relation_row.relname as table_name,
            owner_role.rolname as owner_name
       from pg_class relation_row
       join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
       join pg_roles owner_role on owner_role.oid = relation_row.relowner
      where namespace_row.nspname = 'public'
        and relation_row.relname = any($1::text[])
      order by relation_row.relname`,
    [['organizations', 'organization_member', 'service_object']],
  )
  const ownerByTable = new Map(ownerRows.rows.map((row) => [row.table_name, row.owner_name]))
  const ownersExact = ownerByTable.get('organizations') === SOURCE_OWNER
    && ownerByTable.get('organization_member') === SOURCE_OWNER
    && ownerByTable.get('service_object') === OWNER

  const privilegeResult = await client.query(
    `select
       has_column_privilege($1, 'public.organizations', 'org_id', 'REFERENCES') as organizations_org_id,
       has_column_privilege($1, 'public.organization_member', 'org_id', 'REFERENCES') as member_org_id,
       has_column_privilege($1, 'public.organization_member', 'uid', 'REFERENCES') as member_uid,
       has_column_privilege($1, 'public.service_object', 'org_id', 'REFERENCES') as object_org_id,
       has_column_privilege($1, 'public.service_object', 'object_id', 'REFERENCES') as object_id`,
    [OWNER],
  )
  const privileges = privilegeResult.rows[0] || {}
  const explicitMemberAcl = await client.query(
    `select attribute_row.attname as column_name,
            privilege_row.privilege_type,
            privilege_row.is_grantable,
            grantor_role.rolname as grantor_name
       from pg_attribute attribute_row
       join pg_class relation_row on relation_row.oid = attribute_row.attrelid
       join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
       cross join lateral aclexplode(attribute_row.attacl) privilege_row
       join pg_roles grantee_role on grantee_role.oid = privilege_row.grantee
       join pg_roles grantor_role on grantor_role.oid = privilege_row.grantor
      where namespace_row.nspname = 'public'
        and relation_row.relname = 'organization_member'
        and grantee_role.rolname = $1
      order by attribute_row.attname, privilege_row.privilege_type`,
    [OWNER],
  )
  const tableAcl = await client.query(
    `select relation_row.relname, privilege_row.privilege_type
       from pg_class relation_row
       join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
       cross join lateral aclexplode(
         case when cardinality(relation_row.relacl) > 0
              then relation_row.relacl else null::aclitem[] end
       ) privilege_row
       join pg_roles grantee_role on grantee_role.oid = privilege_row.grantee
      where namespace_row.nspname = 'public'
        and relation_row.relname = any($1::text[])
        and grantee_role.rolname = $2`,
    [['organizations', 'organization_member'], OWNER],
  )
  const explicitKey = explicitMemberAcl.rows.map((row) => [
    row.column_name,
    row.privilege_type,
    Boolean(row.is_grantable),
    row.grantor_name,
  ].join('|')).sort()
  const expectedKey = [
    `org_id|REFERENCES|false|${SOURCE_OWNER}`,
    `uid|REFERENCES|false|${SOURCE_OWNER}`,
  ].sort()
  const stableBase = ownersExact
    && privileges.organizations_org_id === true
    && privileges.object_org_id === true
    && privileges.object_id === true
    && tableAcl.rows.length === 0
  const exact = stableBase
    && privileges.member_org_id === true
    && privileges.member_uid === true
    && explicitKey.join('\n') === expectedKey.join('\n')
  const repairable = stableBase
    && privileges.member_org_id !== true
    && privileges.member_uid !== true
    && explicitMemberAcl.rows.length === 0
  return Object.freeze({
    status: exact ? 'exact' : repairable ? 'repairable' : 'partial',
    ownersExact,
    tableAclCount: tableAcl.rows.length,
    memberColumnAclCount: explicitMemberAcl.rows.length,
  })
}

async function grantAccessSourceReferences(client, options = {}) {
  if (options.mutate !== true) throw new Error('ACCESS_SOURCE_REFERENCE_GRANT_OPT_IN_REQUIRED')
  return withTransaction(client, async () => {
    await client.query(
      `select pg_advisory_xact_lock(
         hashtextextended('cleanzi:profitability-access-profile:v2:source-references', 0)
       )`,
    )
    const before = await inspectAccessSourceReferences(client)
    if (before.status === 'exact') return before
    if (before.status !== 'repairable') {
      throw new Error('ACCESS_SOURCE_REFERENCE_STATE_REQUIRES_REVIEW')
    }
    const identity = await client.query(
      `select current_user = session_user as direct_session,
              pg_has_role(session_user, $1, 'SET') as may_set_owner`,
      [SOURCE_OWNER],
    )
    if (identity.rows[0]?.direct_session !== true
        || identity.rows[0]?.may_set_owner !== true) {
      throw new Error('ACCESS_SOURCE_REFERENCE_OWNER_HANDOFF_FORBIDDEN')
    }
    await client.query(`set local role "${SOURCE_OWNER.replaceAll('"', '""')}"`)
    await client.query(
      `grant references (org_id, uid)
         on table public.organization_member
         to profitability_owner`,
    )
    const after = await inspectAccessSourceReferences(client)
    if (after.status !== 'exact') {
      throw new Error('ACCESS_SOURCE_REFERENCE_POSTFLIGHT_FAILED')
    }
    return after
  })
}

async function relationPresence(client, names, kinds) {
  const result = await client.query(
    `select relation_row.relname, relation_row.relkind
       from pg_class relation_row
       join pg_namespace namespace_row on namespace_row.oid = relation_row.relnamespace
      where namespace_row.nspname = 'public'
        and relation_row.relname = any($1::text[])
        and relation_row.relkind::text = any($2::text[])
      order by relation_row.relname`,
    [names, kinds],
  )
  return result.rows
}

async function countRows(client, tables) {
  let count = 0
  for (const table of tables) {
    const result = await client.query(
      `select count(*)::bigint as row_count from public.${quoteIdentifier(table)}`,
    )
    count += Number(result.rows[0]?.row_count || 0)
  }
  return count
}

async function assumeOwner(client, executorSession) {
  if (executorSession) {
    await client.query('set local role profitability_migration_runner')
  }
  await client.query('set local role profitability_owner')
}

async function inspectAccessProfileState(
  client,
  postflight,
  { executorSession = false, allowUnverified = false } = {},
) {
  return withReadOnlySnapshot(client, async () => {
    const relations = await relationPresence(client, ACCESS_TABLES, ['r', 'p'])
    if (relations.length === 0) return Object.freeze({ status: 'absent', seedRowCount: 0 })
    if (relations.length !== ACCESS_TABLES.length) {
      return Object.freeze({ status: 'partial', seedRowCount: null })
    }
    if (allowUnverified && !executorSession) {
      return Object.freeze({ status: 'verification_required', seedRowCount: null })
    }
    try {
      await assumeOwner(client, executorSession)
      await client.query(postflight)
      return Object.freeze({
        status: 'exact',
        seedRowCount: await countRows(client, ACCESS_TABLES),
      })
    } catch {
      return Object.freeze({ status: 'partial', seedRowCount: null })
    }
  })
}

async function inspectFinancialModelState(
  client,
  postflight,
  { executorSession = false, allowUnverified = false } = {},
) {
  return withReadOnlySnapshot(client, async () => {
    const [tables, views, columns] = await Promise.all([
      relationPresence(client, FINANCIAL_TABLES, ['r', 'p']),
      relationPresence(client, FINANCIAL_VIEWS, ['v']),
      client.query(
        `select attname
           from pg_attribute
          where attrelid = to_regclass('public.object_financial_entry')
            and attname = any($1::text[])
            and attnum > 0
            and not attisdropped`,
        [['value_basis', 'value_key']],
      ),
    ])
    const present = tables.length + views.length + columns.rows.length
    if (present === 0) return Object.freeze({ status: 'absent', seedRowCount: 0 })
    if (tables.length !== FINANCIAL_TABLES.length
        || views.length !== FINANCIAL_VIEWS.length
        || columns.rows.length !== 2) {
      return Object.freeze({ status: 'partial', seedRowCount: null })
    }
    if (allowUnverified && !executorSession) {
      return Object.freeze({ status: 'verification_required', seedRowCount: null })
    }
    try {
      await assumeOwner(client, executorSession)
      await client.query(postflight)
      return Object.freeze({
        status: 'exact',
        seedRowCount: await countRows(client, FINANCIAL_TABLES),
      })
    } catch {
      return Object.freeze({ status: 'partial', seedRowCount: null })
    }
  })
}

function createProfitabilityAccessV21ProductionDependencies(options = {}) {
  const environment = options.environment || process.env
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, '..', '..'))
  const postflights = loadPostflights(rootDir)
  const foundationMigrationFile = path.join(
    rootDir,
    'dataconnect',
    'migrations',
    '20260925_profitability_foundation_v2_additive.sql',
  )
  const projectId = text(options.projectId || environment.PROFITABILITY_PRODUCTION_PROJECT) || PROJECT
  const instanceId = text(options.instanceId || environment.PROFITABILITY_PRODUCTION_INSTANCE) || INSTANCE
  const instanceRegion = text(options.instanceRegion || environment.PROFITABILITY_PRODUCTION_INSTANCE_REGION) || REGION
  const database = text(options.database || environment.PROFITABILITY_PRODUCTION_DATABASE) || DATABASE
  // These identities are production trust anchors. Ambient environment is not
  // allowed to redirect the audit to another service, principal or remote.
  const runtimeRegion = pinnedOption(options.runtimeRegion, RUNTIME_REGION, 'RUNTIME_REGION_MISMATCH')
  const runtimeService = pinnedOption(options.runtimeService, RUNTIME_SERVICE, 'RUNTIME_SERVICE_MISMATCH')
  const iamDatabaseUser = pinnedOption(options.iamDatabaseUser, IAM_DATABASE_USER, 'IAM_DATABASE_USER_MISMATCH')
  const remote = pinnedOption(options.remote, REMOTE, 'GIT_REMOTE_MISMATCH')
  const remoteUrl = pinnedOption(options.remoteUrl, REMOTE_URL, 'GIT_REMOTE_URL_MISMATCH')
  const connectionName = `${projectId}:${instanceRegion}:${instanceId}`
  const cloudApi = options.cloudApi || createCloudSqlAdminApiAdapter({
    projectId,
    instanceId,
    auth: options.auth,
    request: options.request,
    sleep: options.sleep,
    now: options.now,
    signal: options.signal,
    requestTimeoutMs: options.cloudRequestTimeoutMs,
  })
  const pgAdapter = options.pgAdapter || createCloudSqlPgAdapter({
    instanceConnectionName: connectionName,
    ipType: options.ipType || environment.PROFITABILITY_CLOUD_SQL_IP_TYPE || 'PUBLIC',
    ConnectorClass: options.ConnectorClass,
    ClientClass: options.ClientClass,
    connector: options.connector,
    signal: options.signal,
    connectTimeoutMs: options.pgConnectTimeoutMs,
    queryTimeoutMs: options.pgQueryTimeoutMs,
  })
  const gitAdapter = options.gitAdapter || createGitStatusAdapter({ run: options.gitRun })
  const psqlAdapter = options.psqlAdapter || createPsqlAdapter({
    psqlPath: options.psqlPath || DEFAULT_PSQL_PATH,
    spawn: options.spawn,
    signal: options.signal,
    timeoutMs: options.psqlTimeoutMs,
  })
  const proxy = options.cloudSqlProxyAdapter || options.proxyAdapter
    || createCloudSqlAuthProxyAdapter({
      proxyPath: options.cloudSqlProxyPath || environment.PROFITABILITY_CLOUD_SQL_PROXY_PATH,
      environment,
      signal: options.signal,
      spawn: options.proxySpawn,
      statFile: options.proxyStatFile,
      sha256File: options.proxySha256File,
      runVersion: options.proxyRunVersion,
      reservePorts: options.proxyReservePorts,
      requestHealth: options.proxyRequestHealth,
      wait: options.proxyWait,
      now: options.proxyNow,
      platform: options.platform,
      arch: options.arch,
      startupTimeoutMs: options.proxyStartupTimeoutMs,
      stopTimeoutMs: options.proxyStopTimeoutMs,
      healthPollMs: options.proxyHealthPollMs,
    })

  async function withIamClient(callback, { containment = false } = {}) {
    const client = await pgAdapter.connectIamAdmin({
      database,
      user: iamDatabaseUser,
      applicationName: 'cleanzi-profitability-access-v21-audit',
      containment,
    })
    try {
      return await callback(client)
    } finally {
      await client.end()
    }
  }

  async function activeRuntimeGates() {
    const service = await cloudApi.inspectCloudRunService({
      region: runtimeRegion,
      service: runtimeService,
    })
    const active = (service?.trafficStatuses || [])
      .filter((entry) => Number(entry?.percent || 0) > 0)
    const trafficTotal = active.reduce((sum, entry) => sum + Number(entry?.percent || 0), 0)
    const revisionNames = [...new Set(active.map((entry) => text(entry?.revision)).filter(Boolean))]
    if (trafficTotal !== 100 || revisionNames.length === 0) {
      throw new Error('CLOUD_RUN_TRAFFIC_STATE_UNVERIFIABLE')
    }
    const revisions = await Promise.all(revisionNames.map((revision) => (
      cloudApi.inspectCloudRunRevision({
        region: runtimeRegion,
        service: runtimeService,
        revision,
      })
    )))
    return inspectRuntimeGates(revisions)
  }

  async function inspectDatabase({ executorPassword } = {}) {
    const base = await withIamClient(async (client) => {
      const foundationState = await inspectFoundationState(client)
      const normalizedRoles = normalizeRoleState(foundationState, {
        bootstrapGrantor: 'cloudsqladmin',
        databaseOwner: 'cloudsqlsuperuser',
        schemaOwner: SOURCE_OWNER,
      })
      const [foundationPostflight, accessSourceReferences,
        accessProfile, financialModel] = await Promise.all([
        inspectExistingFoundationPostflight(client, {
          migrationFile: foundationMigrationFile,
          allowUnverified: true,
        }),
        inspectAccessSourceReferences(client),
        inspectAccessProfileState(client, postflights.access, { allowUnverified: true }),
        inspectFinancialModelState(client, postflights.financial, { allowUnverified: true }),
      ])
      const server = foundationState.server || {}
      return {
        database: server.database_name,
        iamDatabaseUser,
        pgMajor: Math.floor(Number(server.server_version_num || 0) / 10000),
        primary: server.in_recovery === false,
        readWrite: server.transaction_read_only === 'off'
          && server.default_transaction_read_only === 'off',
        foundationExact: foundationPostflight.status === 'exact',
        foundationStatus: foundationPostflight.status,
        roleGraphExact: normalizedRoles.exact === true,
        accessSourceReferences,
        accessProfile,
        financialModel,
      }
    })
    if (executorPassword === undefined) return Object.freeze(base)
    const [foundationPostflight, accessProfile, financialModel] = await Promise.all([
      inspectAsExecutor(
        executorPassword,
        (client) => inspectExistingFoundationPostflight(client, {
          migrationFile: foundationMigrationFile,
          executorSession: true,
        }),
      ),
      inspectAsExecutor(
        executorPassword,
        (client, mode) => inspectAccessProfileState(client, postflights.access, mode),
      ),
      inspectAsExecutor(
        executorPassword,
        (client, mode) => inspectFinancialModelState(client, postflights.financial, mode),
      ),
    ])
    return Object.freeze({
      ...base,
      foundationExact: foundationPostflight.status === 'exact',
      foundationStatus: foundationPostflight.status,
      accessProfile,
      financialModel,
    })
  }

  async function inspectAsExecutor(password, inspector, { containment = false } = {}) {
    const client = await pgAdapter.connectBuiltin({
      database,
      user: EXECUTOR,
      password: secretString(password),
      applicationName: 'cleanzi-profitability-access-v21-postflight',
      containment,
    })
    try {
      return await inspector(client, { executorSession: true })
    } finally {
      await client.end()
    }
  }

  const sourceControl = Object.freeze({
    async inspect() {
      const state = await gitAdapter.inspect(rootDir)
      if (typeof gitAdapter.inspectRemoteUrl !== 'function') {
        throw new Error('GIT_REMOTE_URL_INSPECTION_REQUIRED')
      }
      const [remoteHead, inspectedRemoteUrl] = await Promise.all([
        gitAdapter.inspectRemoteHead(rootDir, {
          remote,
          branch: state.branch,
        }),
        gitAdapter.inspectRemoteUrl(rootDir, { remote }),
      ])
      if (text(inspectedRemoteUrl) !== remoteUrl) throw new Error('GIT_REMOTE_URL_MISMATCH')
      return Object.freeze({
        ...state,
        remote,
        remoteUrl: inspectedRemoteUrl,
        remoteHead,
        remoteContainsHead: remoteHead === state.head.toLowerCase(),
      })
    },
  })

  const cloudSqlAdmin = Object.freeze({
    async inspect(runOptions = {}) {
      const [instance, backup, gates] = await Promise.all([
        cloudApi.inspectInstance(),
        cloudApi.inspectBackupRun(runOptions.backupId),
        activeRuntimeGates(),
      ])
      return Object.freeze({
        project: projectId,
        instance: instanceId,
        region: instance?.region || instanceRegion,
        runtimeRegion,
        runtimeService,
        state: instance?.state || 'UNKNOWN',
        backup: { id: String(backup?.id ?? ''), status: backup?.status || 'UNKNOWN' },
        gates,
      })
    },
    activateProvisioner: ({ password, mutate }) => cloudApi.updateBuiltinUserPassword({
      name: PROVISIONER,
      password: secretString(password),
      mutate,
    }),
    settleProvisionerActivation: ({ operationName }) => (
      cloudApi.settleBuiltinUserPasswordUpdate({ operationName })
    ),
  })

  const databaseAdmin = Object.freeze({
    audit: inspectDatabase,
    inspectAccessSourceReferences: () => withIamClient(inspectAccessSourceReferences),
    grantAccessSourceReferences: ({ mutate }) => withIamClient(
      (client) => grantAccessSourceReferences(client, { mutate }),
    ),
    async openProvisioner({ password, containment = false }) {
      const client = await pgAdapter.connectBuiltin({
        database,
        user: PROVISIONER,
        password: secretString(password),
        applicationName: 'cleanzi-profitability-access-v21-provisioner',
        containment,
      })
      return Object.freeze({
        activateExecutor: ({ password: nextPassword, mutate }) => setRolePassword(client, {
          role: EXECUTOR,
          password: secretString(nextPassword),
          mutate,
        }),
        lockExecutor: ({ mutate }) => lockRolePassword(client, { role: EXECUTOR, mutate }),
        lockSelf: ({ mutate }) => lockRolePassword(client, { role: PROVISIONER, mutate }),
        close: () => client.end(),
      })
    },
    async verifyPasswordAccepted({ role, password, containment = false }) {
      let client = null
      try {
        client = await pgAdapter.connectBuiltin({
          database,
          user: identifier(role),
          password: secretString(password),
          applicationName: 'cleanzi-profitability-access-v21-credential-probe',
          containment,
        })
        return true
      } catch {
        return false
      } finally {
        try { await client?.end?.() } catch {}
      }
    },
    async verifyPasswordRejected({ role, password, containment = false }) {
      let client = null
      try {
        client = await pgAdapter.connectBuiltin({
          database,
          user: identifier(role),
          password: secretString(password),
          applicationName: 'cleanzi-profitability-access-v21-lock-probe',
          containment,
        })
        return false
      } catch (error) {
        if (text(error?.code).toUpperCase() === '28P01') return true
        throw new Error('CREDENTIAL_REJECTION_UNVERIFIABLE')
      } finally {
        try { await client?.end?.() } catch {}
      }
    },
    inspectAccessProfile: ({ executorPassword } = {}) => (
      executorPassword !== undefined
        ? inspectAsExecutor(
          executorPassword,
          (client, mode) => inspectAccessProfileState(client, postflights.access, mode),
        )
        : withIamClient((client) => inspectAccessProfileState(
          client,
          postflights.access,
          { allowUnverified: true },
        ))
    ),
    inspectFinancialModel: ({ executorPassword } = {}) => (
      executorPassword !== undefined
        ? inspectAsExecutor(
          executorPassword,
          (client, mode) => inspectFinancialModelState(client, postflights.financial, mode),
        )
        : withIamClient((client) => inspectFinancialModelState(
          client,
          postflights.financial,
          { allowUnverified: true },
        ))
    ),
  })

  let proxyEndpoint = null
  let proxyPreparePromise = null
  let proxyClosePromise = null
  const endpoint = () => {
    if (!proxyEndpoint) throw new Error('CLOUD_SQL_PROXY_NOT_READY')
    return proxyEndpoint
  }
  const psqlRunner = Object.freeze({
    async prepare() {
      if (!proxyPreparePromise) {
        proxyPreparePromise = Promise.resolve(proxy.prepare()).then((candidate) => {
          const host = text(candidate?.host)
          const port = Number(candidate?.port)
          if (host !== '127.0.0.1' || !Number.isInteger(port) || port < 1 || port > 65535) {
            throw new Error('CLOUD_SQL_PROXY_ENDPOINT_INVALID')
          }
          proxyEndpoint = Object.freeze({ host, port })
          return proxyEndpoint
        })
      }
      return proxyPreparePromise
    },
    runAccessProfile({ password, options: runOptions }) {
      return psqlAdapter.runFile({
        ...endpoint(),
        database,
        user: EXECUTOR,
        password: secretString(password),
        file: path.join(rootDir, 'dataconnect', 'admin', '20260925_profitability_access_profile_v2_apply.psql'),
        variables: {
          profitability_access_expected_database: database,
          profitability_access_expected_provisioner: PROVISIONER,
          profitability_access_expected_bootstrap_grantor: 'cloudsqladmin',
          profitability_access_expected_executor: EXECUTOR,
          profitability_access_expected_migration_runner: MIGRATION_RUNNER,
          profitability_access_owner_role: OWNER,
          profitability_access_session_role: SESSION,
          profitability_access_runtime_role: RUNTIME,
          profitability_access_backup_reference: runOptions.backupId,
          profitability_access_confirmation: 'APPLY_PROFITABILITY_ACCESS_PROFILE_V2_ONLY_20260925',
        },
        mutate: true,
      })
    },
    runFinancialModel({ password, options: runOptions }) {
      return psqlAdapter.runFile({
        ...endpoint(),
        database,
        user: EXECUTOR,
        password: secretString(password),
        file: path.join(rootDir, 'dataconnect', 'admin', '20260926_profitability_financial_model_v21_apply.psql'),
        variables: {
          profitability_v21_expected_database: database,
          profitability_v21_expected_executor: EXECUTOR,
          profitability_v21_expected_migration_runner: MIGRATION_RUNNER,
          profitability_v21_owner_role: OWNER,
          profitability_v21_runtime_role: RUNTIME,
          profitability_v21_backup_reference: runOptions.backupId,
          profitability_v21_confirmation: 'APPLY_PROFITABILITY_FINANCIAL_MODEL_V21_ONLY_20260926',
        },
        mutate: true,
      })
    },
    async close() {
      if (!proxyClosePromise) {
        proxyClosePromise = Promise.resolve(proxy.close()).finally(() => {
          proxyEndpoint = null
        })
      }
      return proxyClosePromise
    },
  })

  let closePromise = null
  async function close() {
    if (!closePromise) {
      closePromise = Promise.allSettled([psqlRunner.close(), pgAdapter.close()]).then((results) => {
        if (results.some((result) => result.status === 'rejected')) {
          throw new Error('PRODUCTION_DEPENDENCY_CLOSE_FAILED')
        }
      })
    }
    return closePromise
  }

  return Object.freeze({
    sourceControl,
    cloudSqlAdmin,
    databaseAdmin,
    psqlRunner,
    close,
    randomSecret: options.randomSecret || (() => crypto.randomBytes(48)),
    now: options.now || Date.now,
  })
}

module.exports = {
  ACCESS_TABLES,
  FINANCIAL_TABLES,
  FINANCIAL_VIEWS,
  createProfitabilityAccessV21ProductionDependencies,
  extractAccessPostflight,
  extractTaggedDoBlock,
  grantAccessSourceReferences,
  inspectAccessProfileState,
  inspectAccessSourceReferences,
  inspectFinancialModelState,
  inspectRuntimeGates,
  loadPostflights,
}
