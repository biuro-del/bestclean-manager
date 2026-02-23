const SESSION_KEY = 'iclean_mobile_session_v1'
const LAST_ORG_KEY = 'iclean_mobile_last_org_v1'

function toText(value) {
  return String(value ?? '').trim()
}

export function readMobileSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw)
    if (!parsed || !parsed.token) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeMobileSession(session) {
  const payload = {
    token: toText(session?.token),
    uid: toText(session?.uid),
    email: toText(session?.email ?? session?.login),
    login: toText(session?.login),
    orgId: toText(session?.orgId),
    orgName: toText(session?.orgName),
    role: toText(session?.role || 'Pracownik'),
    workerLogin: toText(session?.workerLogin),
    workerName: toText(session?.workerName),
    source: toText(session?.source || 'firebase'),
  }

  localStorage.setItem(SESSION_KEY, JSON.stringify(payload))
  if (payload.orgId) {
    localStorage.setItem(LAST_ORG_KEY, payload.orgId)
  }
  return payload
}

export function clearMobileSession() {
  localStorage.removeItem(SESSION_KEY)
}

export function readPreferredOrgId() {
  return toText(localStorage.getItem(LAST_ORG_KEY))
}
