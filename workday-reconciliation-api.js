'use strict'

const {
  WorkdayReconciliationError,
  identifier,
  warsawBusinessDateYmd,
} = require('./workday-reconciliation-policy')
const {
  createWorkdayReconciliationRepository,
} = require('./workday-reconciliation-repository')
const { createWorkTimeDaysRepository } = require('./work-time-days-repository')

const WORKDAY_RECONCILIATION_PATH = /^\/api\/portal\/workdays\/([^/]+)\/reconciliation\/?$/

function text(value) {
  return String(value ?? '').trim()
}

function parseWorkdayReconciliationPath(pathname) {
  const match = text(pathname).match(WORKDAY_RECONCILIATION_PATH)
  if (!match) return null
  try {
    return identifier(decodeURIComponent(match[1]), 'workdayId', 64)
  } catch {
    return ''
  }
}

function mapWorkdayReconciliationError(error) {
  if (error instanceof WorkdayReconciliationError) return error
  if (error?.publicCode && Number(error?.statusCode)) {
    return new WorkdayReconciliationError(
      Number(error.statusCode),
      text(error.publicCode),
      text(error.publicMessage || error.message) || 'Nie udalo sie uzgodnic dnia pracy.',
      error.details,
    )
  }
  if (error?.message === 'REQUEST_BODY_TOO_LARGE') {
    return new WorkdayReconciliationError(413, 'REQUEST_TOO_LARGE', 'Zadanie jest zbyt duze.')
  }
  if (error?.message === 'INVALID_JSON' || error?.code === 'INVALID_JSON') {
    return new WorkdayReconciliationError(400, 'INVALID_JSON', 'Niepoprawny JSON w zadaniu.')
  }
  if (['42P01', '42703'].includes(text(error?.code).toUpperCase())) {
    return new WorkdayReconciliationError(
      503,
      'WORKDAY_RECONCILIATION_SCHEMA_MISSING',
      'Schemat bezpiecznej korekty czasu pracy nie zostal jeszcze aktywowany.',
    )
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    return new WorkdayReconciliationError(
      400,
      'WORKDAY_RECONCILIATION_VALIDATION_ERROR',
      error.message,
    )
  }
  return new WorkdayReconciliationError(
    500,
    'WORKDAY_RECONCILIATION_ERROR',
    'Nie udalo sie uzgodnic dnia pracy.',
  )
}

function createWorkdayReconciliationApi(dependencies = {}) {
  const {
    authorize,
    connectDbClient,
    createDayRepository = createWorkTimeDaysRepository,
    createRepository = createWorkdayReconciliationRepository,
    parseBearerToken,
    readJsonBody,
    sendApiError,
    sendJson,
    verifyFirebaseIdToken,
  } = dependencies
  if (![authorize, connectDbClient, createDayRepository, createRepository, parseBearerToken, readJsonBody, sendApiError, sendJson, verifyFirebaseIdToken].every((entry) => typeof entry === 'function')) {
    throw new TypeError('Workday reconciliation API dependencies are incomplete.')
  }

  function matches(pathname) {
    return WORKDAY_RECONCILIATION_PATH.test(text(pathname))
  }

  async function handle(req, res, requestUrl) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    const method = text(req.method).toUpperCase()
    if (method !== 'GET') {
      sendApiError(res, 405, 'LEGACY_WORKDAY_WRITE_DISABLED', 'Ten endpoint jest tylko do odczytu. Korekty zapisuj przez /api/portal/work-time/days/:businessDate.')
      return
    }

    const workdayId = parseWorkdayReconciliationPath(requestUrl.pathname)
    if (!workdayId) {
      sendApiError(res, 400, 'WORKDAY_ID_INVALID', 'Brak poprawnego workdayId.')
      return
    }
    const token = parseBearerToken(req)
    if (!token) {
      sendApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
      return
    }

    let decodedToken
    try {
      decodedToken = await verifyFirebaseIdToken(token)
    } catch {
      sendApiError(res, 401, 'UNAUTHENTICATED', 'Sesja wygasla. Zaloguj sie ponownie.')
      return
    }

    let client = null
    try {
      const queryOrgId = text(requestUrl.searchParams.get('orgId'))
      const orgId = identifier(queryOrgId, 'orgId', 64)
      const uid = identifier(decodedToken?.uid, 'uid', 128)
      client = await connectDbClient()
      const repository = createRepository(client, { authorize })
      const legacy = await repository.read({ orgId, uid, workdayId })
      const workerLogin = text(legacy?.workday?.workerLogin || legacy?.workerLogin)
      const businessDateYmd = text(legacy?.businessDateYmd || legacy?.workday?.businessDateYmd) || warsawBusinessDateYmd(legacy?.workday?.startAt)
      if (!workerLogin || !businessDateYmd) {
        throw new WorkdayReconciliationError(409, 'LEGACY_WORKDAY_SCOPE_INVALID', 'Nie można ustalić pracownika lub daty biznesowej tego dnia.')
      }
      const dayRepository = createDayRepository(client, { authorize })
      const reconciliation = await dayRepository.read({ orgId, uid, workerLogin, businessDateYmd })
      reconciliation.legacyWorkdayId = workdayId
      sendJson(res, 200, { ok: true, reconciliation })
    } catch (error) {
      const mapped = mapWorkdayReconciliationError(error)
      sendApiError(res, mapped.statusCode, mapped.code, mapped.message, mapped.details)
    } finally {
      client?.release?.()
    }
  }

  return { handle, matches }
}

module.exports = {
  WORKDAY_RECONCILIATION_PATH,
  createWorkdayReconciliationApi,
  mapWorkdayReconciliationError,
  parseWorkdayReconciliationPath,
}
