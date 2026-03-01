import { waitForFirebaseAuthReady } from '../firebase/firebaseClient'

const DEFAULT_SCHEDULE_API_BASE = 'https://iclean-room.web.app/api'

function toText(value) {
  return String(value ?? '').trim()
}

function normalizeApiBase(value) {
  const raw = toText(value)
  if (!raw) return DEFAULT_SCHEDULE_API_BASE
  const withoutTrailing = raw.replace(/\/+$/, '')
  if (withoutTrailing.endsWith('/api')) return withoutTrailing
  return `${withoutTrailing}/api`
}

function pickApiBase() {
  return normalizeApiBase(import.meta.env.VITE_SCHEDULE_API_BASE || import.meta.env.VITE_PUBLIC_API_BASE)
}

function parseErrorMessage(error, fallback) {
  const direct =
    toText(error?.error?.message) ||
    toText(error?.message) ||
    toText(error?.statusText) ||
    toText(fallback)

  if (!direct) return toText(fallback)
  if (!direct.startsWith('{')) return direct

  try {
    const parsed = JSON.parse(direct)
    return (
      toText(parsed?.error?.message) ||
      toText(parsed?.message) ||
      toText(parsed?.error?.details?.[0]?.message) ||
      direct
    )
  } catch {
    return direct
  }
}

export async function fetchMobileSchedule(session) {
  const user = await waitForFirebaseAuthReady()
  if (!user) {
    const error = new Error('Sesja wygasla. Zaloguj sie ponownie.')
    error.code = 'UNAUTHENTICATED'
    throw error
  }

  const idToken = await user.getIdToken(true)
  const apiBase = pickApiBase()
  const response = await fetch(`${apiBase}/schedule/mobile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      idToken,
      worker: {
        workerId: toText(session?.workerId),
        login: toText(session?.workerLogin || session?.login),
        email: toText(session?.email),
        name: toText(session?.workerName),
      },
    }),
  })

  let body = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  if (!response.ok || body?.ok === false) {
    const err = new Error(
      parseErrorMessage(body || { message: response.statusText }, 'Nie udalo sie pobrac grafiku.'),
    )
    if (response.status === 401 || response.status === 403) {
      err.code = 'UNAUTHENTICATED'
    }
    throw err
  }

  return body?.data || {}
}
