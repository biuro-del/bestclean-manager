export const OWN_WORKDAY_EDIT_DENIED_MESSAGE = 'Brak dostępu do edycji własnego czasu pracy.'

const RAFAL_WORKER_ID = 'w001'

function normalizeIdentity(value) {
  return String(value ?? '').trim().toLocaleLowerCase('pl-PL')
}

function workerAuthUid(worker = {}) {
  return normalizeIdentity(worker.authUid ?? worker.auth_uid)
}

function normalizeWorkerId(value) {
  const normalized = normalizeIdentity(value)
  return /^w\d+$/.test(normalized) ? normalized : ''
}

function workerId(worker = {}) {
  const explicitId = normalizeWorkerId(worker.workerId ?? worker.worker_id ?? worker.workerid)
  if (explicitId) return explicitId
  return normalizeWorkerId(worker.id)
}

function workerLogin(worker = {}) {
  return normalizeIdentity(worker.login ?? worker.workerLogin)
}

function workerEmail(worker = {}) {
  return normalizeIdentity(worker.email ?? worker.loginEmail)
}

function workerName(worker = {}) {
  return normalizeIdentity(
    worker.workerName ?? worker.workername ?? worker.worker_name ?? worker.fullName ?? worker.displayName ?? worker.name,
  )
}

function sessionLogin(session = {}) {
  return normalizeIdentity(session.login ?? session.email)
}

function uniqueWorkers(workers = []) {
  return [...new Set((Array.isArray(workers) ? workers : []).filter(Boolean))]
}

export function resolveSessionWorker(session = {}, workers = []) {
  const rows = uniqueWorkers(workers)
  const sessionWorkerId = normalizeWorkerId(session.workerId ?? session.worker_id ?? session.workerid)
  if (sessionWorkerId) {
    const byWorkerId = rows.find((worker) => workerId(worker) === sessionWorkerId)
    if (byWorkerId) return byWorkerId
  }

  const uid = normalizeIdentity(session.uid)
  if (uid) {
    const byAuthUid = rows.find((worker) => workerAuthUid(worker) === uid)
    if (byAuthUid) return byAuthUid
  }

  const login = sessionLogin(session)
  if (login) {
    const byLogin = rows.filter((worker) => {
      return workerLogin(worker) === login || workerEmail(worker) === login
    })
    if (byLogin.length === 1) return byLogin[0]
  }

  const name = normalizeIdentity(session.name)
  if (!name) return null
  const byName = rows.filter((worker) => workerName(worker) === name)
  return byName.length === 1 ? byName[0] : null
}

function isRafalWorker(worker = {}) {
  return workerId(worker) === RAFAL_WORKER_ID
}

export function isRafalDudekSession({ session = {}, workers = [] } = {}) {
  const sessionWorkerId = normalizeWorkerId(session.workerId ?? session.worker_id ?? session.workerid)
  if (sessionWorkerId) return sessionWorkerId === RAFAL_WORKER_ID

  const actor = resolveSessionWorker(session, workers)
  return Boolean(actor && isRafalWorker(actor))
}

function sameWorker(actor = {}, target = {}) {
  const actorId = workerId(actor)
  const targetId = workerId(target)
  return Boolean(actorId && targetId && actorId === targetId)
}

export function isOwnWorkdayEditBlocked({ session = {}, workers = [], targetWorker = null } = {}) {
  if (!targetWorker) return false

  const rows = uniqueWorkers([...workers, targetWorker])
  const actor = resolveSessionWorker(session, rows)
  if (!actor) return false
  if (isRafalWorker(actor)) return false

  return sameWorker(actor, targetWorker)
}
