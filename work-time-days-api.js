'use strict'

const { WorkTimeDayError, warsawBusinessDateYmd } = require('./work-time-days-policy')
const { createWorkTimeDaysRepository } = require('./work-time-days-repository')

const WORK_TIME_DAYS_LIST_PATH = /^\/api\/portal\/work-time\/days\/?$/
const WORK_TIME_DAY_PATH = /^\/api\/portal\/work-time\/days\/(\d{4}-\d{2}-\d{2})\/?$/

function text(value) {
  return String(value ?? '').trim()
}

function mapError(error) {
  if (error instanceof WorkTimeDayError) return error
  if (error?.publicCode && Number(error?.statusCode)) {
    return new WorkTimeDayError(Number(error.statusCode), text(error.publicCode), text(error.publicMessage || error.message), error.details)
  }
  if (error?.message === 'REQUEST_BODY_TOO_LARGE') return new WorkTimeDayError(413, 'REQUEST_TOO_LARGE', 'Zadanie jest zbyt duże.')
  if (error?.message === 'INVALID_JSON' || error?.code === 'INVALID_JSON') return new WorkTimeDayError(400, 'INVALID_JSON', 'Niepoprawny JSON w zadaniu.')
  if (['42P01', '42703'].includes(text(error?.code).toUpperCase())) {
    return new WorkTimeDayError(503, 'WORK_TIME_SCHEMA_MISSING', 'Schemat czasu pracy nie został jeszcze aktywowany.')
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    return new WorkTimeDayError(400, 'WORK_TIME_VALIDATION_ERROR', error.message)
  }
  return new WorkTimeDayError(500, 'WORK_TIME_DAY_ERROR', 'Nie udało się pobrać lub zapisać czasu pracy.')
}

function createWorkTimeDaysApi(dependencies = {}) {
  const {
    authorize,
    connectDbClient,
    createRepository = createWorkTimeDaysRepository,
    parseBearerToken,
    readJsonBody,
    sendApiError,
    sendJson,
    verifyFirebaseIdToken,
  } = dependencies
  if (![authorize, connectDbClient, createRepository, parseBearerToken, readJsonBody, sendApiError, sendJson, verifyFirebaseIdToken].every((entry) => typeof entry === 'function')) {
    throw new TypeError('Work time days API dependencies are incomplete.')
  }

  function matches(pathname) {
    const path = text(pathname)
    return WORK_TIME_DAYS_LIST_PATH.test(path) || WORK_TIME_DAY_PATH.test(path)
  }

  async function handle(req, res, requestUrl) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    const method = text(req.method).toUpperCase()
    const detailMatch = text(requestUrl.pathname).match(WORK_TIME_DAY_PATH)
    const isList = WORK_TIME_DAYS_LIST_PATH.test(text(requestUrl.pathname))
    if ((isList && method !== 'GET') || (!isList && !['GET', 'POST'].includes(method))) {
      sendApiError(res, 405, 'METHOD_NOT_ALLOWED', isList ? 'Dozwolona metoda to GET.' : 'Dozwolone metody to GET i POST.')
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
      sendApiError(res, 401, 'UNAUTHENTICATED', 'Sesja wygasła. Zaloguj się ponownie.')
      return
    }

    let client = null
    try {
      const body = method === 'POST' ? await readJsonBody(req) : {}
      const queryOrgId = text(requestUrl.searchParams.get('orgId'))
      const bodyOrgId = text(body?.orgId)
      if (queryOrgId && bodyOrgId && queryOrgId !== bodyOrgId) {
        throw new WorkTimeDayError(403, 'WORK_TIME_SCOPE_MISMATCH', 'Organizacja w adresie nie zgadza się z treścią zadania.')
      }
      const orgId = queryOrgId || bodyOrgId
      const uid = text(decodedToken?.uid)
      if (!orgId || !uid) throw new WorkTimeDayError(400, 'WORK_TIME_SCOPE_INVALID', 'Brak organizacji lub użytkownika.')
      client = await connectDbClient()
      const repository = createRepository(client, { authorize })
      if (isList) {
        const today = warsawBusinessDateYmd(new Date())
        const result = await repository.list({
          orgId,
          uid,
          workerLogin: text(requestUrl.searchParams.get('workerLogin')),
          fromYmd: text(requestUrl.searchParams.get('fromYmd')) || today,
          toYmd: text(requestUrl.searchParams.get('toYmd')) || today,
          page: Number(requestUrl.searchParams.get('page') || 1),
          pageSize: Number(requestUrl.searchParams.get('pageSize') || 50),
        })
        sendJson(res, 200, { ok: true, ...result })
        return
      }
      const businessDateYmd = detailMatch?.[1]
      const queryWorker = text(requestUrl.searchParams.get('workerLogin'))
      const bodyWorker = text(body?.workerLogin)
      if (queryWorker && bodyWorker && queryWorker.toLowerCase() !== bodyWorker.toLowerCase()) {
        throw new WorkTimeDayError(403, 'WORK_TIME_WORKER_MISMATCH', 'Pracownik w adresie nie zgadza się z treścią zadania.')
      }
      const workerLogin = queryWorker || bodyWorker
      if (!workerLogin) throw new WorkTimeDayError(400, 'WORKER_LOGIN_REQUIRED', 'Brak workerLogin.')
      const day = method === 'GET'
        ? await repository.read({ orgId, uid, workerLogin, businessDateYmd })
        : await repository.reconcile({ orgId, uid, workerLogin, businessDateYmd, value: body })
      sendJson(res, 200, { ok: true, day })
    } catch (error) {
      const mapped = mapError(error)
      sendApiError(res, mapped.statusCode, mapped.code, mapped.message, mapped.details)
    } finally {
      client?.release?.()
    }
  }

  return { handle, matches }
}

module.exports = {
  WORK_TIME_DAYS_LIST_PATH,
  WORK_TIME_DAY_PATH,
  createWorkTimeDaysApi,
  mapError,
}
