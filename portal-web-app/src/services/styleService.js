import { executeMutation, executeQuery, mutationRef, queryRef } from 'firebase/data-connect'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'

export const STYLE_FALLBACK_ID = 'sneat-iclean'

const STYLE_REGISTRY = Object.freeze([
  {
    id: 'sneat-iclean',
    name: 'Sneat iClean',
    description: 'Nowoczesny, jasny panel administracyjny inspirowany Sneat, dopasowany do iClean.',
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
const OPERATION_DEPLOY_HINT =
  'Brak wdrozonej operacji Data Connect dla modulu Style. Wykonaj deploy dataconnect.'

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

function ensureFirebaseOrThrow() {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase/Data Connect. Moduly stylow sa niedostepne.')
  }

  const firebase = ensureFirebase()
  if (!firebase?.dataConnect) {
    throw new Error('Nie udalo sie zainicjalizowac Data Connect.')
  }

  return firebase.dataConnect
}

function messageFromError(error) {
  if (error instanceof Error) {
    return String(error.message ?? '')
  }
  return String(error ?? '')
}

function extractNestedErrorMessage(rawMessage) {
  const message = asText(rawMessage)
  if (!message || !message.startsWith('{')) {
    return ''
  }

  try {
    const parsed = JSON.parse(message)
    return asText(parsed?.error?.message ?? parsed?.message)
  } catch {
    return ''
  }
}

function isOperationNotFoundMessage(rawMessage, operationName) {
  const message = messageFromError(rawMessage)
  const nested = extractNestedErrorMessage(message)
  const fullMessage = `${message} ${nested}`.toLowerCase()
  const operation = asText(operationName).toLowerCase()
  if (!operation) {
    return false
  }

  return (
    fullMessage.includes(`operation \"${operation}\" not found`) ||
    fullMessage.includes(`operation "${operation}" not found`) ||
    fullMessage.includes(`operation '${operation}' not found`) ||
    (fullMessage.includes('operation') && fullMessage.includes('not found') && fullMessage.includes(operation)) ||
    ((fullMessage.includes('"status":"not_found"') ||
      fullMessage.includes('"code":404') ||
      fullMessage.includes('"code":"404"')) &&
      fullMessage.includes(operation))
  )
}

function withOperationHint(error, operationName) {
  const message = messageFromError(error)
  if (isOperationNotFoundMessage(message, operationName)) {
    return new Error(`${OPERATION_DEPLOY_HINT} Brak operacji: ${operationName}.`)
  }

  return error instanceof Error ? error : new Error(message || OPERATION_DEPLOY_HINT)
}

function isOperationNotFoundError(error, operationName) {
  const message = messageFromError(error)
  return isOperationNotFoundMessage(message, operationName) || message.includes(`Brak operacji: ${operationName}.`)
}

async function runQueryOperation(operationName, variables = {}, options = {}) {
  const fallback = options.fallback
  try {
    const dataConnect = ensureFirebaseOrThrow()
    return await executeQuery(queryRef(dataConnect, operationName, variables))
  } catch (error) {
    const wrapped = withOperationHint(error, operationName)
    if (typeof fallback !== 'undefined' && isOperationNotFoundError(wrapped, operationName)) {
      return fallback
    }
    throw wrapped
  }
}

async function runMutationOperation(operationName, variables = {}) {
  try {
    const dataConnect = ensureFirebaseOrThrow()
    return await executeMutation(mutationRef(dataConnect, operationName, variables))
  } catch (error) {
    throw withOperationHint(error, operationName)
  }
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

async function fetchOrgDefaultStyle(orgId) {
  const normalizedOrgId = asText(orgId)
  if (!normalizedOrgId) {
    return null
  }

  const response = await runQueryOperation(
    'OrgUiStyleForOrg',
    { orgId: normalizedOrgId },
    { fallback: { data: { orgUiStyle: null } } },
  )
  return response?.data?.orgUiStyle ?? null
}

async function fetchMyStylePreference(orgId) {
  const normalizedOrgId = asText(orgId)
  if (!normalizedOrgId) {
    return null
  }

  const response = await runQueryOperation(
    'MyUiStylePreference',
    { orgId: normalizedOrgId },
    { fallback: { data: { userUiStylePreference: null } } },
  )
  return response?.data?.userUiStylePreference ?? null
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

  const [orgStyle, userStyle] = await Promise.all([fetchOrgDefaultStyle(normalizedOrgId), fetchMyStylePreference(normalizedOrgId)])

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
  await runMutationOperation('UpsertMyUiStylePreference', {
    orgId: normalizedOrgId,
    styleId: normalizedStyleId,
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

  await runMutationOperation('DeleteMyUiStylePreference', {
    orgId: normalizedOrgId,
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
  await runMutationOperation('UpsertOrgUiStyleForOrg', {
    orgId: normalizedOrgId,
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

  const [orgResponse, userResponse] = await Promise.all([
    runQueryOperation(
      'OrgUiStyleForOrg',
      { orgId: normalizedOrgId },
      { fallback: { data: { orgUiStyle: null } } },
    ),
    runQueryOperation(
      'UserUiStylePreferencesForOrg',
      { orgId: normalizedOrgId },
      { fallback: { data: { userUiStylePreferences: [] } } },
    ),
  ])

  const orgDefault = orgResponse?.data?.orgUiStyle ?? null
  const userPreferences = Array.isArray(userResponse?.data?.userUiStylePreferences)
    ? userResponse.data.userUiStylePreferences
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
  await runMutationOperation('UpsertOrgUiStyleForOrg', {
    orgId: normalizedOrgId,
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

  await runMutationOperation('DeleteOrgUiStyleForOrg', {
    orgId: normalizedOrgId,
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
  await runMutationOperation('UpsertUserUiStylePreferenceForOrg', {
    orgId: normalizedOrgId,
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

  await runMutationOperation('DeleteUserUiStylePreferenceForOrg', {
    orgId: normalizedOrgId,
    uid: normalizedUid,
  })

  return {
    orgId: normalizedOrgId,
    uid: normalizedUid,
    deleted: true,
  }
}
