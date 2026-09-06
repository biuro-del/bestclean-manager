'use strict'

const crypto = require('node:crypto')
const {
  WORKFORCE_SCHEDULE_MAX_PUBLICATION_ITEMS,
  WorkforceScheduleError,
  classifyPublicationConflicts,
  identifier,
  normalizeCommand,
  normalizeIanaTimeZone,
  normalizePublication,
  normalizeShiftInput,
  parseDateRange,
  text,
} = require('./workforce-schedule-policy')
const { createWorkforceScheduleRepository } = require('./workforce-schedule-repository')

const WORKFORCE_SCHEDULE_BASE_PATH = '/api/portal/workforce-schedule'
const WORKFORCE_SCHEDULE_MAX_BODY_BYTES = 256 * 1024
const WORKFORCE_SCHEDULE_DB_ROLE = 'workforce_schedule_app'
const WORKFORCE_SCHEDULE_SESSION_ROLE = 'workforce_schedule_session'

function apiError(statusCode, code, message, details) {
  return new WorkforceScheduleError(statusCode, code, message, details)
}

function parsePath(pathnameValue) {
  const pathname = text(pathnameValue).replace(/\/+$/, '')
  if (pathname === `${WORKFORCE_SCHEDULE_BASE_PATH}/bootstrap`) return { resource: 'bootstrap' }
  if (pathname === `${WORKFORCE_SCHEDULE_BASE_PATH}/commands`) return { resource: 'commands' }
  if (pathname === `${WORKFORCE_SCHEDULE_BASE_PATH}/publications`) return { resource: 'publications' }
  return null
}

function publicError(error) {
  if (error instanceof WorkforceScheduleError) return error
  const statusCode = Number(error?.statusCode)
  const code = text(error?.publicCode)
  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600 && code) {
    return apiError(statusCode, code, text(error?.publicMessage) || 'Operacja Grafiku nie powiodła się.', error?.publicDetails ?? error?.details)
  }
  const databaseCode = text(error?.code)
  if (['42P01', '42703'].includes(databaseCode)) {
    return apiError(503, 'WORKFORCE_SCHEDULE_SCHEMA_NOT_READY', 'Schemat bazy Grafiku nie jest jeszcze aktywny.')
  }
  if (databaseCode === '23503') {
    return apiError(409, 'WORKFORCE_SCHEDULE_REFERENCE_CONFLICT', 'Powiązane dane Grafiku nie są już dostępne.')
  }
  if (databaseCode === '23505') {
    return apiError(409, 'WORKFORCE_SCHEDULE_CONFLICT', 'Taki wpis Grafiku już istnieje.')
  }
  if (databaseCode === '23514') {
    return apiError(409, 'WORKFORCE_SCHEDULE_CONSTRAINT_CONFLICT', 'Dane Grafiku naruszają jego reguły spójności.')
  }
  if (['40001', '40P01', '55P03', '57014'].includes(databaseCode)) {
    return apiError(409, 'WORKFORCE_SCHEDULE_RETRY_REQUIRED', 'Dane Grafiku zmieniły się równolegle. Odśwież widok i spróbuj ponownie.')
  }
  return apiError(500, 'WORKFORCE_SCHEDULE_FAILED', 'Nie udało się bezpiecznie obsłużyć Grafiku.')
}

function safeLogCode(value) {
  const normalized = text(value).toUpperCase()
  return /^[A-Z][A-Z0-9_]{0,127}$/.test(normalized)
    ? normalized
    : 'WORKFORCE_SCHEDULE_FAILED'
}

function safeLogRequestId(value) {
  const normalized = text(value)
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(normalized) ? normalized : ''
}

function ensureDependencies(dependencies) {
  const required = [
    'assertOrganizationEnabled',
    'authorize',
    'connectDbClient',
    'getRequestId',
    'logHandledError',
    'parseBearerToken',
    'readJsonBody',
    'sendApiError',
    'sendJson',
    'verifyFirebaseIdToken',
  ]
  const missing = required.filter((key) => typeof dependencies?.[key] !== 'function')
  if (missing.length) throw new TypeError(`Workforce schedule API dependencies are incomplete: ${missing.join(', ')}.`)
}

function integer(value, field, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw apiError(400, 'WORKFORCE_SCHEDULE_VALIDATION_ERROR', `Niepoprawne pole: ${field}.`, { field })
  }
  return parsed
}

function compareExpectedVersions(expected, actual) {
  const expectedMap = new Map(expected.map((row) => [row.shiftId, row.version]))
  const actualMap = new Map(actual.map((row) => [row.shiftId, row.version]))
  const missing = actual.filter((row) => !expectedMap.has(row.shiftId)).map((row) => row.shiftId)
  const extra = expected.filter((row) => !actualMap.has(row.shiftId)).map((row) => row.shiftId)
  const stale = actual
    .filter((row) => expectedMap.has(row.shiftId) && expectedMap.get(row.shiftId) !== row.version)
    .map((row) => ({ shiftId: row.shiftId, expectedVersion: expectedMap.get(row.shiftId), currentVersion: row.version }))
  return { valid: !missing.length && !extra.length && !stale.length, missing, extra, stale }
}

function createWorkforceScheduleApi(dependencies = {}) {
  ensureDependencies(dependencies)
  const {
    assertOrganizationEnabled,
    authorize,
    connectDbClient,
    getRequestId,
    logHandledError,
    parseBearerToken,
    readJsonBody,
    sendApiError,
    sendJson,
    verifyFirebaseIdToken,
    createRepository = createWorkforceScheduleRepository,
    createId = () => crypto.randomUUID(),
  } = dependencies

  if (typeof createRepository !== 'function' || typeof createId !== 'function') {
    throw new TypeError('Workforce schedule API factories are incomplete.')
  }

  async function logHandledServerError(mapped, operation) {
    const status = Number(mapped?.statusCode)
    if (!Number.isInteger(status) || status < 500 || status > 599) return

    let requestId = ''
    try {
      requestId = safeLogRequestId(getRequestId())
    } catch {
      requestId = ''
    }

    const entry = Object.freeze({
      code: safeLogCode(mapped?.code),
      status,
      requestId,
      operation,
    })
    try {
      await logHandledError(entry)
    } catch {
      // Logging is best effort and must never replace the safe API response.
    }
  }

  function matches(pathname) {
    const normalized = text(pathname).replace(/\/+$/, '')
    return normalized === WORKFORCE_SCHEDULE_BASE_PATH || normalized.startsWith(`${WORKFORCE_SCHEDULE_BASE_PATH}/`)
  }

  async function authenticate(req) {
    const token = parseBearerToken(req)
    if (!token) throw apiError(401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
    let decoded
    try {
      decoded = await verifyFirebaseIdToken(token)
    } catch {
      throw apiError(401, 'UNAUTHENTICATED', 'Sesja wygasła. Zaloguj się ponownie.')
    }
    let uid
    try {
      uid = identifier(decoded?.uid || decoded?.sub, 'uid', 128)
    } catch {
      throw apiError(401, 'UNAUTHENTICATED', 'Token Firebase nie zawiera prawidłowej tożsamości.')
    }
    return { decoded, uid }
  }

  async function activateScheduleRole(client) {
    try {
      await client.query(`set local role ${WORKFORCE_SCHEDULE_DB_ROLE}`)
    } catch (caught) {
      throw apiError(
        503,
        'WORKFORCE_SCHEDULE_DB_ROLE_NOT_READY',
        'Izolowana rola bazy Grafiku nie jest jeszcze gotowa.',
        { missing: ['runtime:SET_ROLE'], databaseCode: text(caught?.code) || undefined },
      )
    }
  }

  async function beginScheduleTransaction(client, repository, orgId, actorUid) {
    await activateScheduleRole(client)
    await repository.setTenantContext(orgId)
    await repository.setActorContext(actorUid)
    const readiness = await repository.schemaReady()
    if (!readiness?.ready) {
      throw apiError(503, 'WORKFORCE_SCHEDULE_SCHEMA_NOT_READY', 'Schemat bazy Grafiku nie jest jeszcze aktywny.', { missing: readiness?.missing || [] })
    }
  }

  async function configureTransactionTimeouts(client) {
    await client.query("set local lock_timeout = '5s'")
    await client.query("set local statement_timeout = '15s'")
    await client.query("set local idle_in_transaction_session_timeout = '20s'")
  }

  async function verifySessionRoleRestored(client) {
    const result = await client.query(
      'select session_user::text as session_user, current_user::text as current_user',
    )
    const state = result.rows?.[0]
    if (state?.session_user !== WORKFORCE_SCHEDULE_SESSION_ROLE
        || state?.current_user !== WORKFORCE_SCHEDULE_SESSION_ROLE) {
      throw apiError(
        503,
        'WORKFORCE_SCHEDULE_DB_ROLE_NOT_RESTORED',
        'Połączenie bazy Grafiku nie wróciło do bezpiecznej roli sesji.',
      )
    }
  }

  async function finishScheduleTransaction(client, transaction, statement) {
    try {
      await client.query(statement)
      transaction.open = false
      await verifySessionRoleRestored(client)
    } catch (caught) {
      transaction.destroy = true
      throw caught
    }
  }

  async function rollbackScheduleTransaction(client, transaction) {
    if (!transaction.open) return
    try {
      await client.query('rollback')
      transaction.open = false
      await verifySessionRoleRestored(client)
    } catch {
      transaction.destroy = true
    }
  }

  async function readBody(req) {
    try {
      return await readJsonBody(req, WORKFORCE_SCHEDULE_MAX_BODY_BYTES)
    } catch (error) {
      if (error?.message === 'REQUEST_BODY_TOO_LARGE') {
        throw apiError(413, 'WORKFORCE_SCHEDULE_REQUEST_TOO_LARGE', 'Żądanie Grafiku jest zbyt duże.')
      }
      throw apiError(400, 'WORKFORCE_SCHEDULE_INVALID_JSON', 'Niepoprawne dane JSON Grafiku.')
    }
  }

  async function handleBootstrap(req, res, requestUrl, identity) {
    const orgId = identifier(requestUrl.searchParams.get('orgId'), 'orgId', 64)
    const range = parseDateRange(requestUrl.searchParams.get('from'), requestUrl.searchParams.get('to'))
    await assertOrganizationEnabled(orgId)
    let client
    const transaction = { open: false, destroy: false }
    try {
      client = await connectDbClient()
      const repository = createRepository(client)
      await client.query('begin isolation level repeatable read read only')
      transaction.open = true
      await configureTransactionTimeouts(client)
      const access = await authorize(client, { orgId, uid: identity.uid, action: 'READ' })
      await beginScheduleTransaction(client, repository, orgId, identity.uid)
      const schedule = await repository.bootstrap({
        orgId,
        from: range.from,
        to: range.to,
        personId: access?.scope === 'OWN' ? text(access.personId) : '',
      })
      await finishScheduleTransaction(client, transaction, 'commit')
      sendJson(res, 200, { ok: true, schedule })
    } catch (caught) {
      await rollbackScheduleTransaction(client, transaction)
      throw caught
    } finally {
      client?.release?.(transaction.destroy)
    }
  }

  async function dispatchCommand(repository, command, identity) {
    const payload = command.payload
    if (command.type === 'SET_CONFIGURATION') {
      const timeZone = normalizeIanaTimeZone(payload.timeZone)
      const expectedVersion = integer(payload.expectedVersion, 'expectedVersion', { min: 0 })
      const weeklyLimitMinutes = integer(payload.weeklyLimitMinutes ?? 2400, 'weeklyLimitMinutes', { min: 1, max: 10080 })
      const before = await repository.readSettings(command.orgId)
      const settings = await repository.saveSettings({ orgId: command.orgId, timeZone, weeklyLimitMinutes, expectedVersion, actorUid: identity.uid })
      return { entityType: 'SETTINGS', entityId: command.orgId, action: before ? 'UPDATED' : 'CREATED', before, response: { settings } }
    }
    if (command.type === 'SYNC_CATALOGS') {
      const settings = await repository.readSettings(command.orgId)
      if (!settings?.timeZone) {
        throw apiError(409, 'WORKFORCE_SCHEDULE_TIME_ZONE_REQUIRED', 'Najpierw ustaw jawną strefę czasową Grafiku.')
      }
      const catalogs = await repository.syncCatalogs({
        orgId: command.orgId,
        actorUid: identity.uid,
        createPersonId: () => `wsp_${createId()}`,
        createLocationId: () => `wsl_${createId()}`,
      })
      return {
        entityType: 'CATALOGS',
        entityId: command.orgId,
        action: 'SYNCED',
        response: { ...catalogs, orgId: command.orgId },
      }
    }
    if (command.type === 'UPSERT_SHIFT') {
      const settings = await repository.readSettings(command.orgId)
      if (!settings?.timeZone) {
        throw apiError(409, 'WORKFORCE_SCHEDULE_TIME_ZONE_REQUIRED', 'Najpierw ustaw jawną strefę czasową Grafiku.')
      }
      const shift = normalizeShiftInput(payload, settings.timeZone)
      const result = await repository.saveShift({ orgId: command.orgId, shift, actorUid: identity.uid, createShiftId: () => `wss_${createId()}` })
      return { entityType: 'SHIFT', entityId: result.shift.shiftId, action: result.before ? 'UPDATED' : 'CREATED', before: result.before, response: { shift: result.shift } }
    }
    if (command.type === 'ARCHIVE_SHIFT') {
      const shiftId = identifier(payload.shiftId, 'shiftId', 96)
      const expectedVersion = integer(payload.expectedVersion, 'expectedVersion', { min: 1 })
      const result = await repository.archiveShift({ orgId: command.orgId, shiftId, expectedVersion, actorUid: identity.uid })
      return { entityType: 'SHIFT', entityId: shiftId, action: 'ARCHIVE_REQUESTED', before: result.before, response: { shift: result.shift } }
    }
    throw apiError(400, 'WORKFORCE_SCHEDULE_COMMAND_UNSUPPORTED', 'Nieobsługiwany typ komendy Grafiku.')
  }

  function commandAccessAction(type) {
    if (['SET_CONFIGURATION', 'SYNC_CATALOGS'].includes(type)) return 'CONFIGURE'
    return 'EDIT'
  }

  async function handleCommand(req, res, identity) {
    const command = normalizeCommand(await readBody(req))
    await assertOrganizationEnabled(command.orgId)
    let client
    const transaction = { open: false, destroy: false }
    try {
      client = await connectDbClient()
      const repository = createRepository(client)
      await client.query('begin')
      transaction.open = true
      await configureTransactionTimeouts(client)
      await authorize(client, { orgId: command.orgId, uid: identity.uid, action: commandAccessAction(command.type) })
      await beginScheduleTransaction(client, repository, command.orgId, identity.uid)
      await repository.lockOrganization(command.orgId)
      const claim = await repository.claimCommand({
        orgId: command.orgId,
        actorUid: identity.uid,
        idempotencyKey: command.idempotencyKey,
        commandType: command.type,
        requestHash: command.requestHash,
        effects: command.effects,
      })
      if (claim.replay) {
        await finishScheduleTransaction(client, transaction, 'commit')
        const response = command.type === 'SYNC_CATALOGS'
          ? { ...claim.response, orgId: command.orgId, idempotent: true }
          : { ...claim.response, idempotent: true }
        sendJson(res, 200, response)
        return
      }
      const result = await dispatchCommand(repository, command, identity)
      const response = { ok: true, idempotent: false, effects: command.effects, ...result.response }
      await repository.appendAudit({
        orgId: command.orgId,
        auditId: `wsa_${createId()}`,
        entityType: result.entityType,
        entityId: result.entityId,
        action: result.action,
        actorUid: identity.uid,
        idempotencyKey: command.idempotencyKey,
        before: result.before || null,
        after: response,
      })
      await repository.completeCommand({ orgId: command.orgId, actorUid: identity.uid, idempotencyKey: command.idempotencyKey, response })
      await finishScheduleTransaction(client, transaction, 'commit')
      sendJson(res, 200, response)
    } catch (caught) {
      await rollbackScheduleTransaction(client, transaction)
      throw caught
    } finally {
      client?.release?.(transaction.destroy)
    }
  }

  async function handlePublication(req, res, identity) {
    const publication = normalizePublication(await readBody(req))
    await assertOrganizationEnabled(publication.orgId)
    let client
    const transaction = { open: false, destroy: false }
    try {
      client = await connectDbClient()
      const repository = createRepository(client)
      await client.query('begin')
      transaction.open = true
      await configureTransactionTimeouts(client)
      await authorize(client, { orgId: publication.orgId, uid: identity.uid, action: 'PUBLISH' })
      await beginScheduleTransaction(client, repository, publication.orgId, identity.uid)
      await repository.lockOrganization(publication.orgId)
      const claim = await repository.claimCommand({
        orgId: publication.orgId,
        actorUid: identity.uid,
        idempotencyKey: publication.idempotencyKey,
        commandType: 'PUBLISH_INTERNAL',
        requestHash: publication.requestHash,
        effects: publication.effects,
      })
      if (claim.replay) {
        await finishScheduleTransaction(client, transaction, 'commit')
        sendJson(res, 200, { ...claim.response, idempotent: true })
        return
      }
      const settings = await repository.readSettings(publication.orgId)
      if (!settings?.timeZone) throw apiError(409, 'WORKFORCE_SCHEDULE_TIME_ZONE_REQUIRED', 'Najpierw ustaw jawną strefę czasową Grafiku.')
      const shifts = await repository.lockPublicationScope(publication)
      if (!shifts.length) throw apiError(409, 'WORKFORCE_SCHEDULE_NOTHING_TO_PUBLISH', 'W tym okresie nie ma zmian oczekujących na publikację.')
      if (shifts.length > WORKFORCE_SCHEDULE_MAX_PUBLICATION_ITEMS) {
        throw apiError(
          409,
          'WORKFORCE_SCHEDULE_PUBLICATION_SCOPE_TOO_LARGE',
          'Zakres zawiera zbyt wiele zmian do jednej bezpiecznej publikacji. Wybierz krótszy okres.',
          { count: shifts.length, limit: WORKFORCE_SCHEDULE_MAX_PUBLICATION_ITEMS },
        )
      }
      const versions = compareExpectedVersions(publication.expectedVersions, shifts)
      if (!versions.valid) {
        throw apiError(409, 'WORKFORCE_SCHEDULE_STALE_VERSION', 'Lista wersji nie odpowiada aktualnym zmianom do publikacji.', versions)
      }
      await repository.lockPublicationDependencies({
        orgId: publication.orgId,
        candidateShiftIds: shifts.map((shift) => shift.shiftId),
        from: publication.from,
        to: publication.to,
      })
      const conflicts = classifyPublicationConflicts(await repository.listPublicationConflicts({
        orgId: publication.orgId,
        candidateShiftIds: shifts.map((shift) => shift.shiftId),
        from: publication.from,
        to: publication.to,
      }))
      if (conflicts.blocking.length) {
        throw apiError(409, 'WORKFORCE_SCHEDULE_PUBLICATION_BLOCKED', 'Grafik zawiera konflikty blokujące publikację.', conflicts)
      }
      if (conflicts.warnings.length && publication.warningFingerprint !== conflicts.warningFingerprint) {
        throw apiError(409, 'WORKFORCE_SCHEDULE_WARNINGS_CONFIRMATION_REQUIRED', 'Sprawdź ostrzeżenia i potwierdź ich aktualny zestaw.', conflicts)
      }
      const result = await repository.publish({
        orgId: publication.orgId,
        publicationId: `wspub_${createId()}`,
        from: publication.from,
        to: publication.to,
        timeZone: settings.timeZone,
        effects: publication.effects,
        warningFingerprint: conflicts.warningFingerprint,
        warnings: conflicts.warnings,
        actorUid: identity.uid,
        idempotencyKey: publication.idempotencyKey,
        shifts,
      })
      const response = { ok: true, idempotent: false, effects: publication.effects, publication: result }
      await repository.appendAudit({
        orgId: publication.orgId,
        auditId: `wsa_${createId()}`,
        entityType: 'PUBLICATION',
        entityId: result.publicationId,
        action: 'PUBLISHED_INTERNAL',
        actorUid: identity.uid,
        idempotencyKey: publication.idempotencyKey,
        after: response,
      })
      await repository.completeCommand({ orgId: publication.orgId, actorUid: identity.uid, idempotencyKey: publication.idempotencyKey, response })
      await finishScheduleTransaction(client, transaction, 'commit')
      sendJson(res, 200, response)
    } catch (caught) {
      await rollbackScheduleTransaction(client, transaction)
      throw caught
    } finally {
      client?.release?.(transaction.destroy)
    }
  }

  async function handle(req, res, requestUrl) {
    const match = parsePath(requestUrl?.pathname)
    if (!match) {
      sendApiError(res, 404, 'WORKFORCE_SCHEDULE_ROUTE_NOT_FOUND', 'Nie znaleziono endpointu Grafiku.')
      return
    }
    if (req?.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    try {
      const method = text(req?.method).toUpperCase()
      const expectedMethod = match.resource === 'bootstrap' ? 'GET' : 'POST'
      if (method !== expectedMethod) {
        throw apiError(405, 'METHOD_NOT_ALLOWED', `Dozwolona metoda to ${expectedMethod}.`)
      }
      const identity = await authenticate(req)
      if (match.resource === 'bootstrap') return await handleBootstrap(req, res, requestUrl, identity)
      if (match.resource === 'commands') return await handleCommand(req, res, identity)
      return await handlePublication(req, res, identity)
    } catch (caught) {
      const mapped = publicError(caught)
      await logHandledServerError(mapped, match.resource)
      sendApiError(res, mapped.statusCode, mapped.code, mapped.message, mapped.details)
    }
  }

  return { handle, matches }
}

module.exports = {
  WORKFORCE_SCHEDULE_BASE_PATH,
  WORKFORCE_SCHEDULE_DB_ROLE,
  WORKFORCE_SCHEDULE_SESSION_ROLE,
  compareExpectedVersions,
  createWorkforceScheduleApi,
  parseWorkforceSchedulePath: parsePath,
  publicWorkforceScheduleError: publicError,
}
