'use strict'

const {
  MOBILE_WORKFORCE_SCHEDULE_TIME_ZONE,
  WORKFORCE_SCHEDULE_DB_ROLE,
  WORKFORCE_SCHEDULE_SESSION_ROLE,
  createMobileWorkforceScheduleRepository,
} = require('./mobile-workforce-schedule-repository')

const MOBILE_WORKFORCE_SCHEDULE_PATH = '/api/mobile/workforce-schedule'
const MOBILE_WORKFORCE_SCHEDULE_CONTRACT_VERSION = 'workforce-schedule-mobile-v1'
const MOBILE_WORKFORCE_SCHEDULE_MAX_DAYS = 31
const ALLOWED_QUERY_PARAMETERS = new Set(['from', 'to'])
const READINESS_SUCCESS_TTL_MS = 30_000
const READINESS_FAILURE_TTL_MS = 5_000

function text(value) {
  return String(value ?? '').trim()
}

function apiError(statusCode, code, message, details) {
  const error = new Error(code)
  error.statusCode = statusCode
  error.publicCode = code
  error.publicMessage = message
  if (details !== undefined) error.publicDetails = details
  return error
}

function normalizeReadiness(value) {
  return Object.freeze({
    ready: value?.ready === true,
    missing: Object.freeze(Array.isArray(value?.missing)
      ? value.missing.map(text).filter(Boolean)
      : []),
  })
}

function createReadinessCache(readinessNow) {
  const entries = new Map()
  const timestamp = () => {
    const value = Number(readinessNow())
    if (!Number.isFinite(value)) throw new TypeError('Mobile workforce schedule readiness clock is invalid.')
    return value
  }
  return async function cachedReadiness(key, loader) {
    const current = timestamp()
    const cached = entries.get(key)
    if (cached?.pending) return cached.pending
    if (cached && current < cached.expiresAt) {
      if (cached.error) throw cached.error
      return cached.value
    }

    const pending = (async () => {
      try {
        const value = normalizeReadiness(await loader())
        entries.set(key, {
          value,
          expiresAt: timestamp() + (value.ready ? READINESS_SUCCESS_TTL_MS : READINESS_FAILURE_TTL_MS),
        })
        return value
      } catch (error) {
        entries.set(key, { error, expiresAt: timestamp() + READINESS_FAILURE_TTL_MS })
        throw error
      }
    })()
    entries.set(key, { pending, expiresAt: 0 })
    return pending
  }
}

function identifier(value, field, maxLength = 128) {
  const normalized = text(value)
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw apiError(403, 'MOBILE_WORKFORCE_SCHEDULE_SCOPE_INVALID', `Nieprawidłowy zakres sesji: ${field}.`)
  }
  return normalized
}

function parseDate(value, field) {
  const normalized = text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw apiError(400, 'MOBILE_WORKFORCE_SCHEDULE_DATE_INVALID', `Nieprawidłowa data: ${field}.`, { field })
  }
  const timestamp = Date.parse(`${normalized}T00:00:00.000Z`)
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== normalized) {
    throw apiError(400, 'MOBILE_WORKFORCE_SCHEDULE_DATE_INVALID', `Nieprawidłowa data: ${field}.`, { field })
  }
  return { value: normalized, timestamp }
}

function parseRange(searchParams) {
  for (const key of searchParams.keys()) {
    if (!ALLOWED_QUERY_PARAMETERS.has(text(key).toLowerCase())) {
      throw apiError(
        400,
        'MOBILE_WORKFORCE_SCHEDULE_QUERY_INVALID',
        'Endpoint Grafiku nie przyjmuje identyfikatorów organizacji ani pracownika.',
        { field: text(key) },
      )
    }
  }
  if (searchParams.getAll('from').length !== 1 || searchParams.getAll('to').length !== 1) {
    throw apiError(400, 'MOBILE_WORKFORCE_SCHEDULE_RANGE_REQUIRED', 'Podaj jeden zakres dat od from do to.')
  }
  const from = parseDate(searchParams.get('from'), 'from')
  const to = parseDate(searchParams.get('to'), 'to')
  const inclusiveDays = Math.floor((to.timestamp - from.timestamp) / 86400000) + 1
  if (inclusiveDays < 1) {
    throw apiError(400, 'MOBILE_WORKFORCE_SCHEDULE_RANGE_INVALID', 'Data from nie może być późniejsza niż to.')
  }
  if (inclusiveDays > MOBILE_WORKFORCE_SCHEDULE_MAX_DAYS) {
    throw apiError(
      400,
      'MOBILE_WORKFORCE_SCHEDULE_RANGE_TOO_LARGE',
      `Zakres Grafiku może obejmować maksymalnie ${MOBILE_WORKFORCE_SCHEDULE_MAX_DAYS} dni.`,
    )
  }
  return { from: from.value, to: to.value }
}

function mapPublicError(error) {
  const statusCode = Number(error?.statusCode)
  const code = text(error?.publicCode)
  if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600 && code) {
    return apiError(
      statusCode,
      code,
      text(error?.publicMessage) || 'Nie udało się pobrać Grafiku.',
      statusCode === 503 ? undefined : (error?.publicDetails ?? error?.details),
    )
  }
  if (['42P01', '42703'].includes(text(error?.code))) {
    return apiError(503, 'WORKFORCE_SCHEDULE_SCHEMA_NOT_READY', 'Schemat bazy Grafiku nie jest jeszcze aktywny.')
  }
  if (['40001', '40P01', '55P03', '57014'].includes(text(error?.code))) {
    return apiError(409, 'MOBILE_WORKFORCE_SCHEDULE_RETRY_REQUIRED', 'Grafik zmienił się równolegle. Spróbuj ponownie.')
  }
  return apiError(500, 'MOBILE_WORKFORCE_SCHEDULE_FAILED', 'Nie udało się bezpiecznie pobrać Grafiku.')
}

function createMobileWorkforceScheduleApi(dependencies = {}) {
  const {
    authorize,
    connectDbClient,
    parseBearerToken,
    resolveSession,
    sendMobileApiError,
    sendMobileJson,
    verifyFirebaseIdToken,
    createRepository = createMobileWorkforceScheduleRepository,
    getRequestId = () => '',
    isDeliveryEnabled = () => false,
    logHandledError = () => {},
    readinessNow = () => Date.now(),
  } = dependencies
  const required = [
    authorize,
    connectDbClient,
    parseBearerToken,
    resolveSession,
    sendMobileApiError,
    sendMobileJson,
    verifyFirebaseIdToken,
    createRepository,
    getRequestId,
    isDeliveryEnabled,
    logHandledError,
    readinessNow,
  ]
  if (!required.every((dependency) => typeof dependency === 'function')) {
    throw new TypeError('Mobile workforce schedule API dependencies are incomplete.')
  }
  const cachedReadiness = createReadinessCache(readinessNow)

  function matches(pathnameValue) {
    return text(pathnameValue).replace(/\/+$/, '') === MOBILE_WORKFORCE_SCHEDULE_PATH
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
    return {
      decoded,
      uid: identifier(decoded?.uid || decoded?.sub, 'uid'),
    }
  }

  async function verifySessionRoleRestored(client) {
    const result = await client.query('select session_user::text as session_user, current_user::text as current_user')
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

  async function verifyActiveScheduleRole(client) {
    const result = await client.query('select session_user::text as session_user, current_user::text as current_user')
    const state = result.rows?.[0]
    if (state?.session_user !== WORKFORCE_SCHEDULE_SESSION_ROLE
        || state?.current_user !== WORKFORCE_SCHEDULE_DB_ROLE) {
      throw apiError(
        503,
        'WORKFORCE_SCHEDULE_DB_ROLE_NOT_READY',
        'Połączenie bazy Grafiku nie ma bezpiecznej roli roboczej.',
      )
    }
  }

  async function finishTransaction(client, transaction, statement) {
    try {
      await client.query(statement)
      transaction.open = false
      await verifySessionRoleRestored(client)
    } catch (error) {
      transaction.destroy = true
      throw error
    }
  }

  async function rollbackTransaction(client, transaction) {
    if (!client || !transaction.open) return
    try {
      await client.query('rollback')
      transaction.open = false
      await verifySessionRoleRestored(client)
    } catch {
      transaction.destroy = true
    }
  }

  async function logServerError(error, sourceError = error) {
    if (Number(error?.statusCode) < 500) return
    try {
      const entry = {
        code: /^[A-Z][A-Z0-9_]{0,127}$/.test(text(error?.publicCode))
          ? text(error.publicCode)
          : 'MOBILE_WORKFORCE_SCHEDULE_FAILED',
        status: Number(error.statusCode),
        requestId: text(getRequestId()).slice(0, 128),
        operation: 'mobile-workforce-schedule',
      }
      const schemaMissing = sourceError?.publicDetails?.missing ?? sourceError?.details?.missing
      if (entry.code === 'WORKFORCE_SCHEDULE_SCHEMA_NOT_READY' && Array.isArray(schemaMissing)) {
        entry.schemaMissing = schemaMissing.map(text).filter(Boolean).slice(0, 128)
      }
      await logHandledError(entry)
    } catch {
      // Logging is best effort and must not change the public response.
    }
  }

  async function handle(req, res, requestUrl) {
    if (!matches(requestUrl?.pathname)) {
      sendMobileApiError(res, 404, 'MOBILE_WORKFORCE_SCHEDULE_NOT_FOUND', 'Nie znaleziono endpointu Grafiku.')
      return
    }
    if (text(req?.method).toUpperCase() === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      })
      res.end()
      return
    }

    let client
    const transaction = { open: false, destroy: false }
    try {
      if (text(req?.method).toUpperCase() !== 'GET') {
        throw apiError(405, 'METHOD_NOT_ALLOWED', 'Dozwolona metoda to GET.')
      }
      if (!Boolean(await isDeliveryEnabled())) {
        throw apiError(
          404,
          'MOBILE_WORKFORCE_SCHEDULE_DELIVERY_DISABLED',
          'Grafik aplikacji nie jest aktywny w tym środowisku.',
        )
      }
      const identity = await authenticate(req)
      const range = parseRange(requestUrl.searchParams)
      const resolved = await resolveSession(identity.decoded, identity.uid)
      const orgId = identifier(resolved?.orgId, 'orgId', 64)
      const resolvedWorkerId = identifier(resolved?.workerId, 'workerId')
      if (!Boolean(await isDeliveryEnabled(orgId))) {
        throw apiError(
          404,
          'MOBILE_WORKFORCE_SCHEDULE_DELIVERY_DISABLED',
          'Grafik aplikacji nie jest aktywny dla tej organizacji.',
        )
      }

      client = await connectDbClient()
      const repository = createRepository(client)
      await client.query('begin isolation level repeatable read read only')
      transaction.open = true
      await client.query("set local lock_timeout = '5s'")
      await client.query("set local statement_timeout = '15s'")
      await client.query("set local idle_in_transaction_session_timeout = '20s'")
      const access = await authorize(client, {
        orgId,
        uid: identity.uid,
        workerId: resolvedWorkerId,
      })
      if (access?.scope !== 'OWN') {
        throw apiError(403, 'MOBILE_WORKFORCE_SCHEDULE_SCOPE_INVALID', 'Grafik aplikacji wymaga zakresu własnego pracownika.')
      }
      const workerId = identifier(access?.workerId, 'workerId')
      try {
        await client.query(`set local role ${WORKFORCE_SCHEDULE_DB_ROLE}`)
      } catch (error) {
        throw apiError(
          503,
          'WORKFORCE_SCHEDULE_DB_ROLE_NOT_READY',
          'Izolowana rola bazy Grafiku nie jest jeszcze gotowa.',
          { databaseCode: text(error?.code) || undefined },
        )
      }
      await verifyActiveScheduleRole(client)
      await repository.setTenantContext(orgId)
      await repository.setActorContext(identity.uid)
      const coreReadiness = await cachedReadiness('core', () => repository.schemaReady())
      if (!coreReadiness?.ready) {
        throw apiError(
          503,
          'WORKFORCE_SCHEDULE_SCHEMA_NOT_READY',
          'Schemat bazy Grafiku nie jest jeszcze aktywny.',
          { missing: coreReadiness?.missing || [] },
        )
      }
      const deliveryReadiness = await cachedReadiness('delivery', () => repository.deliverySchemaReady())
      if (!deliveryReadiness?.ready) {
        throw apiError(
          503,
          'WORKFORCE_SCHEDULE_SCHEMA_NOT_READY',
          'Schemat dostarczania Grafiku do aplikacji nie jest jeszcze aktywny.',
          { missing: deliveryReadiness?.missing || [] },
        )
      }
      const timeZone = await repository.resolveScheduleTimeZone(orgId)
      if (timeZone !== MOBILE_WORKFORCE_SCHEDULE_TIME_ZONE) {
        throw apiError(
          503,
          'MOBILE_WORKFORCE_SCHEDULE_TIME_ZONE_NOT_READY',
          'Strefa czasowa Grafiku nie jest gotowa.',
        )
      }
      const ownPerson = await repository.resolveOwnPerson({ orgId, uid: identity.uid, workerId })
      const shifts = await repository.listOwnDeliveredShifts({
        orgId,
        personId: ownPerson.personId,
        from: range.from,
        to: range.to,
      })
      await finishTransaction(client, transaction, 'commit')
      res.setHeader?.('Cache-Control', 'private, no-store')
      res.setHeader?.('Vary', 'Authorization')
      sendMobileJson(res, 200, {
        ok: true,
        contractVersion: MOBILE_WORKFORCE_SCHEDULE_CONTRACT_VERSION,
        timeZone: MOBILE_WORKFORCE_SCHEDULE_TIME_ZONE,
        from: range.from,
        to: range.to,
        shifts,
      })
    } catch (error) {
      await rollbackTransaction(client, transaction)
      const mapped = mapPublicError(error)
      await logServerError(mapped, error)
      sendMobileApiError(res, mapped.statusCode, mapped.publicCode, mapped.publicMessage, mapped.publicDetails)
    } finally {
      client?.release?.(transaction.destroy)
    }
  }

  return { handle, matches }
}

module.exports = {
  MOBILE_WORKFORCE_SCHEDULE_CONTRACT_VERSION,
  MOBILE_WORKFORCE_SCHEDULE_MAX_DAYS,
  MOBILE_WORKFORCE_SCHEDULE_PATH,
  createMobileWorkforceScheduleApi,
  mapMobileWorkforceScheduleError: mapPublicError,
  parseMobileWorkforceScheduleRange: parseRange,
}
