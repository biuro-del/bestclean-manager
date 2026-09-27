'use strict'

const {
  EXPECTED: POSTMIGRATION_EXPECTED,
  validateEnvironmentSnapshot,
} = require('./profitability-bestclean-postmigration')

const EXPECTED = Object.freeze({
  ...POSTMIGRATION_EXPECTED,
  confirmation: 'APPLY_PROFITABILITY_BESTCLEAN_CATALOG_HYGIENE_ONLY_20260927',
  sourceOwner: 'firebaseowner_iclean-room-database_public',
  legacyIndividualClientId: 'cl-ind-1780401530009-twn58f',
  legacyUnassignedClientId: 'UNASSIGNED',
  malformedPamClientId: 'Pam Trans ',
  canonicalPamClientId: 'Pam Trans',
})

const SAFE_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:@/+\-]{0,255}$/
const SECRET_FLAG = /(?:password|passwd|secret|credential|access[-_]?token|id[-_]?token|database[-_]?url|uri)/i

class ProfitabilityCatalogHygieneError extends Error {
  constructor(code, metadata = {}) {
    super(code)
    this.name = 'ProfitabilityCatalogHygieneError'
    this.code = code
    this.persistentChange = metadata.persistentChange === true
  }
}

function fail(code, metadata) {
  throw new ProfitabilityCatalogHygieneError(code, metadata)
}

function text(value) {
  return String(value ?? '').trim()
}

function parseArguments(argv = []) {
  const result = { mode: 'audit' }
  const booleanFlags = new Set(['apply', 'help'])
  const valueFlags = new Set([
    'project', 'instance', 'region', 'database', 'backup-id', 'org',
    'expected-head', 'confirmation',
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const raw = String(argv[index] || '')
    if (!raw.startsWith('--')) fail('UNKNOWN_ARGUMENT')
    const separator = raw.indexOf('=')
    const name = raw.slice(2, separator === -1 ? undefined : separator)
    if (!name || SECRET_FLAG.test(name)) fail('SECRET_ARGUMENT_FORBIDDEN')
    if (booleanFlags.has(name)) {
      if (separator !== -1 || Object.hasOwn(result, name)) fail('INVALID_ARGUMENT')
      result[name] = true
      if (name === 'apply') result.mode = 'apply'
      continue
    }
    if (!valueFlags.has(name) || Object.hasOwn(result, name)) fail('UNKNOWN_ARGUMENT')
    const value = separator === -1 ? argv[++index] : raw.slice(separator + 1)
    if (value === undefined || String(value).startsWith('--')) fail('MISSING_ARGUMENT_VALUE')
    const normalized = text(value)
    if (!SAFE_VALUE.test(normalized) || /:\/\//.test(normalized)) fail('INVALID_ARGUMENT_VALUE')
    result[name] = normalized
  }
  return result
}

function resolveOptions(argv = []) {
  const values = parseArguments(argv)
  if (values.help) return { mode: 'audit', help: true }
  const options = {
    mode: values.mode,
    project: values.project || EXPECTED.project,
    instance: values.instance || EXPECTED.instance,
    region: values.region || EXPECTED.region,
    database: values.database || EXPECTED.database,
    backupId: values['backup-id'] || EXPECTED.backupId,
    orgId: values.org || EXPECTED.orgId,
    expectedHead: values['expected-head'] || '',
    confirmation: values.confirmation || '',
  }
  if (options.mode === 'apply') {
    if (!/^[0-9a-f]{40}$/.test(options.expectedHead)) fail('EXPECTED_HEAD_INVALID')
    if (options.confirmation !== EXPECTED.confirmation) fail('CONFIRMATION_MISMATCH')
  }
  return options
}

function assertEnvironment(snapshot, options, applying) {
  try {
    validateEnvironmentSnapshot(snapshot, options, { applying })
  } catch (error) {
    fail(text(error?.code || error?.message) || 'ENVIRONMENT_NOT_EXACT')
  }
  return snapshot
}

function indexRows(rows) {
  const byId = new Map()
  for (const row of rows || []) {
    const id = String(row.client_id ?? '')
    if (!id || byId.has(id)) fail('CATALOG_TARGET_ROWS_NOT_EXACT')
    byId.set(id, row)
  }
  return byId
}

function exactRefCount(row, key, expected, code) {
  if (Number(row?.[key]) !== expected) fail(code)
}

function validateState(rows) {
  const byId = indexRows(rows)
  const legacyIndividual = byId.get(EXPECTED.legacyIndividualClientId)
  const unassigned = byId.get(EXPECTED.legacyUnassignedClientId)
  const malformedPam = byId.get(EXPECTED.malformedPamClientId)
  const canonicalPam = byId.get(EXPECTED.canonicalPamClientId)
  if (!legacyIndividual || !unassigned || Boolean(malformedPam) === Boolean(canonicalPam)) {
    fail('CATALOG_TARGET_ROWS_NOT_EXACT')
  }
  if (legacyIndividual.name !== null || legacyIndividual.client_type !== null) {
    fail('LEGACY_INDIVIDUAL_SHAPE_MISMATCH')
  }
  exactRefCount(legacyIndividual, 'zone_refs', 0, 'LEGACY_INDIVIDUAL_ZONE_REFERENCES_PRESENT')
  exactRefCount(legacyIndividual, 'task_refs', 0, 'LEGACY_INDIVIDUAL_TASK_REFERENCES_PRESENT')
  if (unassigned.name !== null || unassigned.client_type !== 'CYKLICZNY') {
    fail('UNASSIGNED_SHAPE_MISMATCH')
  }
  if (!Number.isInteger(Number(unassigned.zone_refs)) || Number(unassigned.zone_refs) < 1) {
    fail('UNASSIGNED_ZONE_REFERENCES_MISSING')
  }
  exactRefCount(unassigned, 'task_refs', 0, 'UNASSIGNED_TASK_REFERENCES_PRESENT')

  const pam = malformedPam || canonicalPam
  if (pam.client_type !== 'CYKLICZNY') fail('PAM_CLIENT_TYPE_MISMATCH')
  exactRefCount(pam, 'zone_refs', 0, 'PAM_ZONE_REFERENCES_PRESENT')
  exactRefCount(pam, 'task_refs', 0, 'PAM_TASK_REFERENCES_PRESENT')

  const before = Boolean(malformedPam
    && malformedPam.name === EXPECTED.malformedPamClientId
    && malformedPam.status === 'Aktywny'
    && legacyIndividual.status === 'Aktywny'
    && unassigned.status === 'Aktywny')
  const after = Boolean(canonicalPam
    && canonicalPam.name === EXPECTED.canonicalPamClientId
    && canonicalPam.status === 'Aktywny'
    && legacyIndividual.status === 'Nieaktywny'
    && unassigned.status === 'Nieaktywny')
  if (before === after) fail('CATALOG_HYGIENE_STATE_NOT_EXACT')
  return Object.freeze({
    phase: before ? 'before' : 'after',
    unassignedZoneRefs: Number(unassigned.zone_refs),
  })
}

async function readState(client, { lock = false } = {}) {
  if (!client?.query) fail('SOURCE_CLIENT_REQUIRED')
  const ids = [
    EXPECTED.legacyIndividualClientId,
    EXPECTED.legacyUnassignedClientId,
    EXPECTED.malformedPamClientId,
    EXPECTED.canonicalPamClientId,
  ]
  const result = await client.query(
    `/* profitability-bestclean-catalog-hygiene:state */
     select c.client_id, c.name, c.status, c.client_type,
            (select count(*)::integer
               from public.zone z
              where z.org_id = c.org_id and z.client_id = c.client_id) as zone_refs,
            (select count(*)::integer
               from public.task t
              where t.org_id = c.org_id and t.client_id = c.client_id) as task_refs
       from public.client c
      where c.org_id = $1 and c.client_id = any($2::text[])
      order by c.client_id${lock ? '\n      for update of c' : ''}`,
    [EXPECTED.orgId, ids],
  )
  return validateState(result.rows || [])
}

async function assertSourceOwner(client) {
  const result = await client.query(
    `select current_user as current_user,
            session_user as session_user,
            pg_get_userbyid(c.relowner) as client_owner
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'client' and c.relkind = 'r'`,
  )
  const row = result.rows?.[0]
  if (row?.current_user !== EXPECTED.sourceOwner || row?.client_owner !== EXPECTED.sourceOwner) {
    fail('SOURCE_OWNER_IDENTITY_MISMATCH')
  }
}

async function assertNoOtherInvalidActiveClients(client) {
  const result = await client.query(
    `select count(*)::integer as invalid_count
       from public.client
      where org_id = $1
        and upper(btrim(coalesce(status, ''))) in ('AKTYWNY', 'ACTIVE')
        and (
          client_id <> btrim(client_id)
          or nullif(btrim(coalesce(name, '')), '') is null
          or name <> btrim(name)
        )`,
    [EXPECTED.orgId],
  )
  if (Number(result.rows?.[0]?.invalid_count) !== 0) fail('ACTIVE_CLIENT_CATALOG_STILL_INVALID')
}

async function applyMutations(client) {
  const pam = await client.query(
    `update public.client
        set client_id = $3, name = $3, updated_at = clock_timestamp()
      where org_id = $1 and client_id = $2 and name = $2
        and status = 'Aktywny' and client_type = 'CYKLICZNY'
        and not exists (
          select 1 from public.client existing
           where existing.org_id = $1 and existing.client_id = $3
        )`,
    [EXPECTED.orgId, EXPECTED.malformedPamClientId, EXPECTED.canonicalPamClientId],
  )
  if (pam.rowCount !== 1) fail('PAM_UPDATE_NOT_EXACT')
  const legacy = await client.query(
    `update public.client
        set status = 'Nieaktywny', updated_at = clock_timestamp()
      where org_id = $1 and client_id = $2 and name is null
        and client_type is null and status = 'Aktywny'`,
    [EXPECTED.orgId, EXPECTED.legacyIndividualClientId],
  )
  if (legacy.rowCount !== 1) fail('LEGACY_INDIVIDUAL_UPDATE_NOT_EXACT')
  const unassigned = await client.query(
    `update public.client
        set status = 'Nieaktywny', updated_at = clock_timestamp()
      where org_id = $1 and client_id = $2 and name is null
        and client_type = 'CYKLICZNY' and status = 'Aktywny'`,
    [EXPECTED.orgId, EXPECTED.legacyUnassignedClientId],
  )
  if (unassigned.rowCount !== 1) fail('UNASSIGNED_UPDATE_NOT_EXACT')
}

async function inspectEnvironment(options, deps, applying) {
  if (!deps?.environment?.inspect) fail('ENVIRONMENT_INSPECTOR_REQUIRED')
  const snapshot = await deps.environment.inspect(options)
  return assertEnvironment(snapshot, options, applying)
}

async function closeAll(client, deps) {
  try { await client?.end?.() } finally { await deps?.close?.() }
}

async function runAudit(options, deps) {
  await inspectEnvironment(options, deps, false)
  let client
  try {
    client = await deps.connections.openSourceReader()
    await client.query('begin isolation level repeatable read read only')
    await assertSourceOwner(client)
    const state = await readState(client)
    await client.query('rollback')
    return {
      ok: true,
      mode: 'audit',
      phase: state.phase,
      readyToApply: state.phase === 'before',
      exact: state.phase === 'after',
      unassignedZoneRefs: state.unassignedZoneRefs,
    }
  } catch (error) {
    try { await client?.query?.('rollback') } catch {}
    throw error
  } finally {
    await closeAll(client, deps)
  }
}

async function runApply(options, deps) {
  await inspectEnvironment(options, deps, true)
  let client
  let committed = false
  try {
    client = await deps.connections.openSourceReader()
    await client.query('begin isolation level serializable')
    await client.query("set local lock_timeout = '5s'")
    await client.query("set local statement_timeout = '30s'")
    await client.query("set local idle_in_transaction_session_timeout = '30s'")
    await assertSourceOwner(client)
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
      'cleanzi:profitability:catalog-hygiene:bestclean:20260927',
    ])
    const before = await readState(client, { lock: true })
    if (before.phase === 'before') await applyMutations(client)
    const after = await readState(client, { lock: true })
    if (after.phase !== 'after') fail('CATALOG_HYGIENE_POSTFLIGHT_FAILED')
    if (after.unassignedZoneRefs !== before.unassignedZoneRefs) {
      fail('UNASSIGNED_REFERENCES_CHANGED_DURING_APPLY')
    }
    await assertNoOtherInvalidActiveClients(client)
    await client.query('commit')
    committed = true
    return {
      ok: true,
      mode: 'apply',
      changed: before.phase === 'before',
      exact: true,
      unassignedZoneRefs: after.unassignedZoneRefs,
    }
  } catch (error) {
    if (!committed) {
      try { await client?.query?.('rollback') } catch {}
    }
    if (error instanceof ProfitabilityCatalogHygieneError) throw error
    fail(text(error?.code) || 'CATALOG_HYGIENE_APPLY_FAILED', { persistentChange: committed })
  } finally {
    await closeAll(client, deps)
  }
}

function safeFailureReport(error) {
  const candidate = text(error?.code || error?.message)
  return {
    ok: false,
    error: /^[A-Z0-9_]{3,160}$/.test(candidate) ? candidate : 'CATALOG_HYGIENE_FAILED',
    persistentChange: error?.persistentChange === true,
  }
}

module.exports = {
  EXPECTED,
  ProfitabilityCatalogHygieneError,
  assertNoOtherInvalidActiveClients,
  parseArguments,
  readState,
  resolveOptions,
  runApply,
  runAudit,
  safeFailureReport,
  validateState,
}
