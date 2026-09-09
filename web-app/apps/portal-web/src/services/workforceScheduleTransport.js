const DEFAULT_API_BASE = '/api'
const WORKFORCE_SCHEDULE_PATH = '/portal/workforce-schedule'

const WRITE_COMMANDS = new Set([
  'ARCHIVE_SHIFT',
  'COPY_WEEK',
  'CREATE_RECURRING_SHIFTS',
  'SET_CONFIGURATION',
  'SYNC_CATALOGS',
  'UPSERT_SHIFT',
])

export const WORKFORCE_SCHEDULE_EFFECTS = Object.freeze({
  delivery: false,
  notifications: false,
  downstream: false,
})

function text(value) {
  return String(value ?? '').trim()
}

function transportError(message, options = {}) {
  return new WorkforceScheduleTransportError(message, options)
}

function requiredText(value, field, maxLength = 128) {
  const normalized = text(value)
  if (!normalized || normalized.length > maxLength) {
    throw transportError(`Brak prawidłowej wartości: ${field}.`, {
      code: 'WORKFORCE_SCHEDULE_CLIENT_VALIDATION',
      details: { field },
    })
  }
  return normalized
}

function requirePlainObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw transportError(`Pole ${field} musi być obiektem.`, {
      code: 'WORKFORCE_SCHEDULE_CLIENT_VALIDATION',
      details: { field },
    })
  }
  return value
}

function isoDate(value, field) {
  const normalized = text(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw transportError(`Niepoprawna data: ${field}.`, {
      code: 'WORKFORCE_SCHEDULE_CLIENT_VALIDATION',
      details: { field },
    })
  }

  const [year, month, day] = normalized.split('-').map(Number)
  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw transportError(`Niepoprawna data: ${field}.`, {
      code: 'WORKFORCE_SCHEDULE_CLIENT_VALIDATION',
      details: { field },
    })
  }
  return normalized
}

function normalizeRange(fromValue, toValue) {
  const from = isoDate(fromValue, 'from')
  const to = isoDate(toValue, 'to')
  if (from > to) {
    throw transportError('Początek zakresu Grafiku nie może wypadać po jego końcu.', {
      code: 'WORKFORCE_SCHEDULE_CLIENT_VALIDATION',
      details: { field: 'range' },
    })
  }
  return { from, to }
}

function secureClientId() {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  throw transportError('Brak bezpiecznego generatora identyfikatorów operacji.', {
    code: 'WORKFORCE_SCHEDULE_SECURE_ID_UNAVAILABLE',
  })
}

function responseBodyCandidate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  return body?.data && typeof body.data === 'object' && !Array.isArray(body.data)
    ? body.data
    : body
}

async function parseJsonResponse(response, fallbackMessage) {
  const raw = await response.text().catch(() => '')
  let body = null
  if (raw && !/^\s*</.test(raw)) {
    try {
      body = JSON.parse(raw)
    } catch {
      body = null
    }
  }

  const candidate = responseBodyCandidate(body)
  if (!response.ok) {
    throw transportError(
      text(candidate?.error?.message || candidate?.message) || fallbackMessage,
      {
        status: Number(response.status) || 0,
        code: text(candidate?.error?.code || candidate?.code) || 'WORKFORCE_SCHEDULE_REQUEST_FAILED',
        details: candidate?.error?.details ?? candidate?.details ?? null,
      },
    )
  }
  if (!candidate) {
    throw transportError('Serwer Grafiku zwrócił nieprawidłową odpowiedź.', {
      status: Number(response.status) || 0,
      code: 'WORKFORCE_SCHEDULE_INVALID_RESPONSE',
    })
  }
  return candidate
}

function bearerHeader(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return ''
  const entry = Object.entries(headers)
    .find(([name]) => text(name).toLowerCase() === 'authorization')
  return text(entry?.[1])
}

function requireFirebaseBearer(headers) {
  if (!/^Bearer\s+\S+$/i.test(bearerHeader(headers))) {
    throw transportError('Brak tokenu Firebase dla Grafiku.', {
      code: 'WORKFORCE_SCHEDULE_AUTH_REQUIRED',
    })
  }
}

function validateDisabledEffects(value, field = 'effects') {
  if (value === undefined || value === null) return
  requirePlainObject(value, field)
  const known = new Set(Object.keys(WORKFORCE_SCHEDULE_EFFECTS))
  for (const key of Object.keys(value)) {
    if (!known.has(key) || value[key] !== false) {
      throw transportError('Grafik nie może uruchamiać dostawy, powiadomień ani integracji downstream.', {
        code: 'WORKFORCE_SCHEDULE_EFFECTS_DISABLED',
        details: { field: `${field}.${key}` },
      })
    }
  }
}

function withoutReservedEffects(payload, field = 'payload') {
  const source = requirePlainObject(payload, field)
  if (!Object.hasOwn(source, 'effects')) return source
  validateDisabledEffects(source.effects, `${field}.effects`)
  const { effects: _ignored, ...cleanPayload } = source
  return cleanPayload
}

function disabledEffects() {
  return { ...WORKFORCE_SCHEDULE_EFFECTS }
}

export class WorkforceScheduleTransportError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'WorkforceScheduleTransportError'
    this.status = Number(options.status) || 0
    this.code = text(options.code) || 'WORKFORCE_SCHEDULE_REQUEST_FAILED'
    this.details = options.details ?? null
  }
}

export function normalizeWorkforceScheduleApiBase(value) {
  const raw = text(value)
  if (!raw) return DEFAULT_API_BASE
  const normalized = raw.replace(/\/+$/, '')
  if (!normalized || normalized === '/') return DEFAULT_API_BASE
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`
}

export function createWorkforceScheduleIdempotencyKey(action, createId = secureClientId) {
  const operation = requiredText(action, 'action', 32)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'operation'
  const id = requiredText(createId(), 'operationId', 80)
  return `ws-${operation}-${id}`.slice(0, 128)
}

export function createWorkforceScheduleOperationRegistry(createKey = createWorkforceScheduleIdempotencyKey) {
  if (typeof createKey !== 'function') throw new TypeError('Operation registry requires createKey.')
  const keys = new Map()
  let tokenSequence = 0
  const signatureFor = (action, payload) => `${requiredText(action, 'action', 32)}:${JSON.stringify(payload ?? null)}`

  function currentEntry(operation) {
    const signature = text(operation?.signature)
    const entry = keys.get(signature)
    return entry?.token === operation?.token ? { entry, signature } : null
  }

  return {
    begin(action, payload) {
      const signature = signatureFor(action, payload)
      if (!keys.has(signature)) {
        keys.set(signature, {
          key: createKey(action),
          token: ++tokenSequence,
        })
      }
      const entry = keys.get(signature)
      return { signature, key: entry.key, token: entry.token }
    },
    complete(operation) {
      const current = currentEntry(operation)
      if (current) keys.delete(current.signature)
    },
    fail(operation, requestError) {
      const current = currentEntry(operation)
      if (!current) return
      const status = Number(requestError?.status) || 0
      const retryMayRepeatAnAcceptedWrite = requestError?.retryWithSameIdempotencyKey === true
        || requestError?.code === 'WORKFORCE_SCHEDULE_NETWORK_ERROR'
        || [408, 425, 429].includes(status)
        || status >= 500
      if (!retryMayRepeatAnAcceptedWrite) keys.delete(current.signature)
    },
    clear() {
      keys.clear()
    },
  }
}

export function createWorkforceScheduleTransport(options = {}) {
  const fetchImpl = options.fetchImpl
  const getAuthHeaders = options.getAuthHeaders
  const getActiveOrganizationId = options.getActiveOrganizationId
  const getApiBase = typeof options.getApiBase === 'function'
    ? options.getApiBase
    : () => options.apiBase
  const createId = typeof options.createId === 'function' ? options.createId : secureClientId

  if (
    typeof fetchImpl !== 'function' ||
    typeof getAuthHeaders !== 'function' ||
    typeof getActiveOrganizationId !== 'function'
  ) {
    throw new TypeError(
      'Workforce schedule transport requires fetchImpl, getAuthHeaders and getActiveOrganizationId.',
    )
  }

  const endpoint = (suffix) => (
    `${normalizeWorkforceScheduleApiBase(getApiBase())}${WORKFORCE_SCHEDULE_PATH}${suffix}`
  )
  const operationKey = (action, supplied) => (
    text(supplied) || createWorkforceScheduleIdempotencyKey(action, createId)
  )

  async function requireActiveOrganization(orgIdValue) {
    const orgId = requiredText(orgIdValue, 'orgId', 64)
    const activeOrgId = requiredText(
      await getActiveOrganizationId(),
      'activeOrgId',
      64,
    )
    if (orgId !== activeOrgId) {
      throw transportError('Żądanie Grafiku dotyczy nieaktywnej organizacji.', {
        code: 'WORKFORCE_SCHEDULE_ORG_CONTEXT_MISMATCH',
        details: { requestedOrgId: orgId },
      })
    }
    return orgId
  }

  async function request(orgIdValue, pathname, {
    method = 'GET',
    body = null,
    fallbackMessage,
    signal,
  } = {}) {
    const orgId = await requireActiveOrganization(orgIdValue)
    const normalizedMethod = text(method).toUpperCase() || 'GET'
    const authHeaders = await getAuthHeaders({ method: normalizedMethod, orgId })
    requireFirebaseBearer(authHeaders)
    const headers = {
      Accept: 'application/json',
      ...(normalizedMethod === 'GET' ? {} : { 'Content-Type': 'application/json' }),
      ...authHeaders,
    }

    let response
    try {
      response = await fetchImpl(endpoint(pathname), {
        method: normalizedMethod,
        headers,
        ...(signal ? { signal } : {}),
        ...(normalizedMethod === 'GET' ? {} : { body: JSON.stringify(body ?? {}) }),
      })
    } catch (cause) {
      const aborted = cause?.name === 'AbortError'
      throw transportError(
        aborted
          ? 'Przerwano nieaktualne pobieranie Grafiku.'
          : 'Nie udało się połączyć z serwerem Grafiku.',
        {
          code: aborted
            ? 'WORKFORCE_SCHEDULE_REQUEST_ABORTED'
            : 'WORKFORCE_SCHEDULE_NETWORK_ERROR',
        },
      )
    }
    return parseJsonResponse(response, fallbackMessage)
  }

  async function fetchBootstrap(orgIdValue, range = {}, requestOptions = {}) {
    const orgId = requiredText(orgIdValue, 'orgId', 64)
    const { from, to } = normalizeRange(range.from, range.to)
    const query = new URLSearchParams({ orgId, from, to })
    if (text(range.personId)) {
      query.set('personId', requiredText(range.personId, 'personId', 128))
    }
    const payload = await request(orgId, `/bootstrap?${query.toString()}`, {
      fallbackMessage: 'Nie udało się pobrać danych Grafiku.',
      signal: requestOptions.signal,
    })
    if (!payload.schedule || typeof payload.schedule !== 'object' || Array.isArray(payload.schedule)) {
      throw transportError('Serwer Grafiku nie zwrócił kompletnego zestawu danych.', {
        code: 'WORKFORCE_SCHEDULE_INVALID_RESPONSE',
      })
    }
    return payload.schedule
  }

  async function sendCommand(orgIdValue, typeValue, payload = {}, requestOptions = {}) {
    const orgId = requiredText(orgIdValue, 'orgId', 64)
    const type = requiredText(typeValue, 'type', 48).toUpperCase()
    if (!WRITE_COMMANDS.has(type)) {
      throw transportError('Nieobsługiwana komenda zapisu Grafiku.', {
        code: 'WORKFORCE_SCHEDULE_COMMAND_UNSUPPORTED',
        details: { type },
      })
    }
    validateDisabledEffects(requestOptions.effects)
    const cleanPayload = withoutReservedEffects(payload)
    return request(orgId, '/commands', {
      method: 'POST',
      body: {
        type,
        orgId,
        idempotencyKey: operationKey(type, requestOptions.idempotencyKey),
        effects: disabledEffects(),
        payload: cleanPayload,
      },
      fallbackMessage: 'Nie udało się zapisać zmiany w Grafiku.',
      signal: requestOptions.signal,
    })
  }

  async function publish(orgIdValue, publication = {}, requestOptions = {}) {
    const orgId = requiredText(orgIdValue, 'orgId', 64)
    requirePlainObject(publication, 'publication')
    validateDisabledEffects(publication.effects, 'publication.effects')
    validateDisabledEffects(requestOptions.effects)
    const { from, to } = normalizeRange(publication.from, publication.to)
    if (!Array.isArray(publication.expectedVersions) || !publication.expectedVersions.length) {
      throw transportError('Brak listy wersji zmian przeznaczonych do publikacji.', {
        code: 'WORKFORCE_SCHEDULE_CLIENT_VALIDATION',
        details: { field: 'expectedVersions' },
      })
    }
    return request(orgId, '/publications', {
      method: 'POST',
      body: {
        orgId,
        from,
        to,
        expectedVersions: publication.expectedVersions,
        warningFingerprint: text(publication.warningFingerprint),
        idempotencyKey: operationKey('publish', requestOptions.idempotencyKey),
        effects: disabledEffects(),
      },
      fallbackMessage: 'Nie udało się zatwierdzić Grafiku.',
      signal: requestOptions.signal,
    })
  }

  return {
    archiveShift: (orgId, payload, optionsValue) => (
      sendCommand(orgId, 'ARCHIVE_SHIFT', payload, optionsValue)
    ),
    copyWeek: (orgId, payload, optionsValue) => (
      sendCommand(orgId, 'COPY_WEEK', payload, optionsValue)
    ),
    createRecurringShifts: (orgId, payload, optionsValue) => (
      sendCommand(orgId, 'CREATE_RECURRING_SHIFTS', payload, optionsValue)
    ),
    fetchBootstrap,
    publish,
    sendCommand,
    setConfiguration: (orgId, payload, optionsValue) => (
      sendCommand(orgId, 'SET_CONFIGURATION', payload, optionsValue)
    ),
    syncCatalogs: (orgId, payload = {}, optionsValue) => (
      sendCommand(orgId, 'SYNC_CATALOGS', payload, optionsValue)
    ),
    upsertShift: (orgId, payload, optionsValue) => (
      sendCommand(orgId, 'UPSERT_SHIFT', payload, optionsValue)
    ),
  }
}
