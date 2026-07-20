import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'
import { platformContextHeaders } from './platformDataConnectService'

export const STYLE_FALLBACK_ID = 'sneat-iclean'

const STYLE_REGISTRY = Object.freeze([
  {
    id: 'sneat-iclean',
    name: 'Sneat Cleanzi',
    description: 'Nowoczesny, jasny panel administracyjny inspirowany Sneat, dopasowany do Cleanzi.',
    order: 5,
    active: true,
  },
  {
    id: 'classic-blue',
    name: 'Classic Blue',
    description: 'Aktualny wyglad portalu: neutralny, znany i bezpieczny.',
    order: 10,
    active: true,
  },
  {
    id: 'fresh-b2b-green',
    name: 'Fresh B2B Green',
    description: 'Jasny, biznesowy wariant z zielonym akcentem i wyraznym kontrastem.',
    order: 20,
    active: true,
  },
  {
    id: 'compact-operator',
    name: 'Compact Operator',
    description: 'Bardziej gesty uklad dla pracy operacyjnej na duzych listach.',
    order: 30,
    active: true,
  },
])

const STYLE_ID_SET = new Set(STYLE_REGISTRY.map((item) => String(item?.id ?? '').trim()).filter(Boolean))

function asText(value) {
  return String(value ?? '').trim()
}

function asNullableText(value) {
  const text = asText(value)
  return text || null
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function isKnownStyleId(styleId) {
  return STYLE_ID_SET.has(asText(styleId))
}

function normalizeKnownStyleId(styleId, fallback = '') {
  const normalized = asText(styleId)
  return isKnownStyleId(normalized) ? normalized : asText(fallback)
}

function normalizeApiBase(value) {
  const raw = asText(value)
  if (!raw) return '/api'
  if (raw.startsWith('/')) {
    const withoutTrailing = raw.replace(/\/+$/, '')
    return withoutTrailing.endsWith('/api') ? withoutTrailing : `${withoutTrailing}/api`
  }
  const withoutTrailing = raw.replace(/\/+$/, '')
  return withoutTrailing.endsWith('/api') ? withoutTrailing : `${withoutTrailing}/api`
}

function getPortalApiBase() {
  return normalizeApiBase(import.meta.env.VITE_ADMIN_API_BASE || '/api')
}

async function styleAuthHeaders() {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Moduly stylow sa niedostepne.')
  }

  const firebase = ensureFirebase()
  const currentUser = firebase?.auth?.currentUser
  if (!currentUser) {
    throw new Error('Sesja wygasla. Zaloguj sie ponownie.')
  }

  const idToken = await currentUser.getIdToken()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
    ...platformContextHeaders(),
  }
}

async function parseStyleApiResponse(response) {
  const rawText = await response.text().catch(() => '')
  let payload = {}
  if (rawText) {
    try {
      payload = JSON.parse(rawText)
    } catch {
      payload = {}
    }
  }

  if (!response.ok) {
    const message = asText(payload?.error?.message || payload?.message || rawText)
    throw new Error(message || `Nie udalo sie obsluzyc ustawien wygladu (HTTP ${response.status}).`)
  }

  return payload?.data && typeof payload.data === 'object' ? payload.data : payload
}

async function requestStyleApi(method, options = {}) {
  const orgId = asText(options.orgId)
  if (!orgId) {
    throw new Error('Brak orgId dla ustawien wygladu.')
  }

  const headers = await styleAuthHeaders()
  const normalizedMethod = asText(method).toUpperCase() || 'GET'
  const search = new URLSearchParams({ orgId })
  if (options.includeUsers) {
    search.set('includeUsers', '1')
  }
  const requestOptions = { method: normalizedMethod, headers }
  if (normalizedMethod !== 'GET') {
    requestOptions.body = JSON.stringify({
      orgId,
      scope: asText(options.scope) || 'user',
      styleId: asText(options.styleId),
      uid: asText(options.uid),
      updatedBy: asNullableText(options.updatedBy),
    })
  }

  const response = await fetch(`${getPortalApiBase()}/portal/ui-style?${search.toString()}`, requestOptions)
  return parseStyleApiResponse(response)
}

function ensureStyleId(styleId) {
  const normalized = asText(styleId)
  if (!isKnownStyleId(normalized)) {
    throw new Error(`Nieznany styl: ${normalized || '-'}.`)
  }
  return normalized
}

export function listAvailableStyles() {
  return clone(
    [...STYLE_REGISTRY]
      .filter((item) => item?.active !== false)
      .sort((left, right) => Number(left?.order ?? 0) - Number(right?.order ?? 0)),
  )
}

export async function getEffectiveStyle(orgId, uid = '') {
  const normalizedOrgId = asText(orgId)
  if (!normalizedOrgId) {
    return {
      styleId: STYLE_FALLBACK_ID,
      source: 'fallback',
      orgStyleId: '',
      userStyleId: '',
      uid: asText(uid),
      orgId: '',
    }
  }

  const state = await requestStyleApi('GET', { orgId: normalizedOrgId })
  const orgStyle = state?.orgDefault ?? null
  const userStyle = state?.userPreference ?? null

  const orgStyleId = normalizeKnownStyleId(orgStyle?.defaultStyleId)
  const userStyleId = normalizeKnownStyleId(userStyle?.styleId)

  if (userStyleId) {
    return {
      styleId: userStyleId,
      source: 'user',
      orgStyleId,
      userStyleId,
      uid: asText(uid),
      orgId: normalizedOrgId,
    }
  }

  if (orgStyleId) {
    return {
      styleId: orgStyleId,
      source: 'org',
      orgStyleId,
      userStyleId: '',
      uid: asText(uid),
      orgId: normalizedOrgId,
    }
  }

  return {
    styleId: STYLE_FALLBACK_ID,
    source: 'fallback',
    orgStyleId: '',
    userStyleId: '',
    uid: asText(uid),
    orgId: normalizedOrgId,
  }
}

export async function setUserStyle(orgId, uid = '', styleId, updatedBy = '-') {
  const normalizedOrgId = asText(orgId)
  if (!normalizedOrgId) {
    throw new Error('Brak orgId dla zapisu stylu uzytkownika.')
  }

  const normalizedStyleId = ensureStyleId(styleId)
  await requestStyleApi('POST', {
    orgId: normalizedOrgId,
    scope: 'user',
    styleId: normalizedStyleId,
    uid: asText(uid),
    updatedBy: asNullableText(updatedBy) ?? '-',
  })

  return {
    orgId: normalizedOrgId,
    uid: asText(uid),
    styleId: normalizedStyleId,
  }
}

export async function clearUserStyle(orgId, uid = '') {
  const normalizedOrgId = asText(orgId)
  if (!normalizedOrgId) {
    throw new Error('Brak orgId dla czyszczenia stylu uzytkownika.')
  }

  await requestStyleApi('DELETE', {
    orgId: normalizedOrgId,
    scope: 'user',
    uid: asText(uid),
  })

  return {
    orgId: normalizedOrgId,
    uid: asText(uid),
    cleared: true,
  }
}

export async function setOrgDefaultStyle(orgId, styleId, updatedBy = '-') {
  const normalizedOrgId = asText(orgId)
  if (!normalizedOrgId) {
    throw new Error('Brak orgId dla zapisu domyslnego stylu organizacji.')
  }

  const normalizedStyleId = ensureStyleId(styleId)
  await requestStyleApi('POST', {
    orgId: normalizedOrgId,
    scope: 'organization',
    styleId: normalizedStyleId,
    updatedBy: asNullableText(updatedBy) ?? '-',
  })

  return {
    orgId: normalizedOrgId,
    styleId: normalizedStyleId,
  }
}

export async function getOrgAndUserStylesForBackup(orgId) {
  const normalizedOrgId = asText(orgId)
  if (!normalizedOrgId) {
    return {
      orgDefault: null,
      userPreferences: [],
    }
  }

  const state = await requestStyleApi('GET', { orgId: normalizedOrgId, includeUsers: true })
  const orgDefault = state?.orgDefault ?? null
  const userPreferences = Array.isArray(state?.userPreferences)
    ? state.userPreferences
    : []

  return {
    orgDefault,
    userPreferences,
  }
}

export async function upsertOrgStyleForBackup({ orgId, styleId, updatedBy = '-' }) {
  const normalizedOrgId = asText(orgId)
  if (!normalizedOrgId) {
    return null
  }

  const normalizedStyleId = ensureStyleId(styleId)
  await requestStyleApi('POST', {
    orgId: normalizedOrgId,
    scope: 'organization',
    styleId: normalizedStyleId,
    updatedBy: asNullableText(updatedBy) ?? '-',
  })

  return {
    orgId: normalizedOrgId,
    styleId: normalizedStyleId,
  }
}

export async function deleteOrgStyleForBackup({ orgId }) {
  const normalizedOrgId = asText(orgId)
  if (!normalizedOrgId) {
    return null
  }

  await requestStyleApi('DELETE', {
    orgId: normalizedOrgId,
    scope: 'organization',
  })

  return {
    orgId: normalizedOrgId,
    deleted: true,
  }
}

export async function upsertUserStyleForBackup({ orgId, uid, styleId, updatedBy = '-' }) {
  const normalizedOrgId = asText(orgId)
  const normalizedUid = asText(uid)
  if (!normalizedOrgId || !normalizedUid) {
    return null
  }

  const normalizedStyleId = ensureStyleId(styleId)
  await requestStyleApi('POST', {
    orgId: normalizedOrgId,
    scope: 'user',
    uid: normalizedUid,
    styleId: normalizedStyleId,
    updatedBy: asNullableText(updatedBy) ?? '-',
  })

  return {
    orgId: normalizedOrgId,
    uid: normalizedUid,
    styleId: normalizedStyleId,
  }
}

export async function deleteUserStyleForBackup({ orgId, uid }) {
  const normalizedOrgId = asText(orgId)
  const normalizedUid = asText(uid)
  if (!normalizedOrgId || !normalizedUid) {
    return null
  }

  await requestStyleApi('DELETE', {
    orgId: normalizedOrgId,
    scope: 'user',
    uid: normalizedUid,
  })

  return {
    orgId: normalizedOrgId,
    uid: normalizedUid,
    deleted: true,
  }
}
