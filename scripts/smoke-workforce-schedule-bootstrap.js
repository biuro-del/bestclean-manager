'use strict'

const DEFAULT_TIMEOUT_MS = 20_000
const MAX_TIMEOUT_MS = 60_000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const COLLECTION_KEYS = Object.freeze([
  'people',
  'locations',
  'shifts',
  'publications',
  'requests',
  'templates',
])

class WorkforceScheduleSmokeError extends Error {
  constructor(code, { requestId = null, status = 0 } = {}) {
    super(code)
    this.name = 'WorkforceScheduleSmokeError'
    this.code = code
    this.requestId = requestId
    this.status = status
  }
}

function fail(code, metadata) {
  throw new WorkforceScheduleSmokeError(code, metadata)
}

function plainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function safeRequestId(value) {
  const normalized = String(value ?? '').trim()
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(normalized) ? normalized : null
}

function parseBoolean(value) {
  return String(value ?? '').trim().toLowerCase() === 'true'
}

function isoDate(value, field) {
  const normalized = String(value ?? '').trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized)
  if (!match) fail('INVALID_DATE')
  const candidate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12))
  if (candidate.toISOString().slice(0, 10) !== normalized) fail('INVALID_DATE')
  return normalized
}

function dateRange(fromValue, toValue) {
  const from = isoDate(fromValue, 'from')
  const to = isoDate(toValue, 'to')
  const days = Math.round((Date.parse(`${to}T12:00:00.000Z`) - Date.parse(`${from}T12:00:00.000Z`)) / 86_400_000) + 1
  if (days < 1 || days > 93) fail('INVALID_DATE_RANGE')
  return { from, to }
}

function localhostHostname(hostname) {
  const normalized = String(hostname ?? '').toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '[::1]' || normalized === '::1'
}

function normalizeBaseUrl(value, allowHttpLocalhost) {
  let url
  try {
    url = new URL(String(value ?? '').trim())
  } catch {
    fail('INVALID_BASE_URL')
  }
  if (url.username || url.password || url.search || url.hash) fail('UNSAFE_BASE_URL')
  if (url.protocol === 'http:') {
    if (!allowHttpLocalhost || !localhostHostname(url.hostname)) fail('HTTPS_REQUIRED')
  } else if (url.protocol !== 'https:') {
    fail('HTTPS_REQUIRED')
  }
  return url
}

function requiredIdentifier(value, maxLength) {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) {
    fail('INVALID_ARGUMENT')
  }
  return normalized
}

function idToken(value) {
  const normalized = String(value ?? '').trim()
  if (!normalized || normalized.length > 16_384 || !/^[A-Za-z0-9._~-]+$/.test(normalized)) {
    fail('INVALID_ID_TOKEN')
  }
  return normalized
}

function timeout(value) {
  const supplied = String(value ?? '').trim()
  if (!supplied) return DEFAULT_TIMEOUT_MS
  const parsed = Number(supplied)
  if (!Number.isSafeInteger(parsed) || parsed < 100 || parsed > MAX_TIMEOUT_MS) fail('INVALID_TIMEOUT')
  return parsed
}

function parseArguments(argv = []) {
  const values = {}
  const booleanFlags = new Set(['allow-http-localhost', 'help'])
  const valueFlags = new Set(['base-url', 'org-id', 'from', 'to', 'timeout-ms'])
  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index] ?? '')
    if (!argument.startsWith('--')) fail('UNKNOWN_ARGUMENT')
    const separator = argument.indexOf('=')
    const name = argument.slice(2, separator === -1 ? undefined : separator)
    if (booleanFlags.has(name)) {
      if (separator !== -1 || Object.hasOwn(values, name)) fail('INVALID_ARGUMENT')
      values[name] = true
      continue
    }
    if (!valueFlags.has(name) || Object.hasOwn(values, name)) fail('UNKNOWN_ARGUMENT')
    const supplied = separator === -1 ? argv[++index] : argument.slice(separator + 1)
    if (supplied === undefined || (separator === -1 && String(supplied).startsWith('--'))) fail('MISSING_ARGUMENT_VALUE')
    values[name] = String(supplied)
  }
  return values
}

function resolveSmokeOptions(argv = process.argv.slice(2), env = process.env) {
  const args = parseArguments(argv)
  if (args.help) return { help: true }
  const allowHttpLocalhost = args['allow-http-localhost'] === true
    || parseBoolean(env.WORKFORCE_SCHEDULE_SMOKE_ALLOW_HTTP_LOCALHOST)
  const baseUrl = normalizeBaseUrl(
    args['base-url'] || env.WORKFORCE_SCHEDULE_SMOKE_BASE_URL,
    allowHttpLocalhost,
  )
  const range = dateRange(
    args.from || env.WORKFORCE_SCHEDULE_SMOKE_FROM,
    args.to || env.WORKFORCE_SCHEDULE_SMOKE_TO,
  )
  return {
    allowHttpLocalhost,
    baseUrl,
    firebaseIdToken: idToken(env.WORKFORCE_SCHEDULE_SMOKE_FIREBASE_ID_TOKEN),
    from: range.from,
    orgId: requiredIdentifier(args['org-id'] || env.WORKFORCE_SCHEDULE_SMOKE_ORG_ID, 64),
    timeoutMs: timeout(args['timeout-ms'] || env.WORKFORCE_SCHEDULE_SMOKE_TIMEOUT_MS),
    to: range.to,
  }
}

function buildBootstrapUrl(baseUrl, { from, orgId, to }) {
  const url = new URL(baseUrl.toString())
  const prefix = url.pathname.replace(/\/+$/, '')
  url.pathname = `${prefix.endsWith('/api') ? prefix : `${prefix}/api`}/portal/workforce-schedule/bootstrap`
    .replace(/\/{2,}/g, '/')
  url.search = ''
  url.searchParams.set('orgId', orgId)
  url.searchParams.set('from', from)
  url.searchParams.set('to', to)
  return url
}

async function readResponseText(response, maximumBytes = MAX_RESPONSE_BYTES) {
  const metadata = {
    requestId: safeRequestId(response.headers?.get?.('x-request-id')),
    status: Number(response.status) || 0,
  }
  const contentLength = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) fail('RESPONSE_TOO_LARGE', metadata)
  if (!response.body?.getReader) {
    const fallback = await response.text()
    if (Buffer.byteLength(fallback, 'utf8') > maximumBytes) fail('RESPONSE_TOO_LARGE', metadata)
    return fallback
  }
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximumBytes) {
        try {
          await reader.cancel()
        } catch {
          // The size guard already decided the outcome; cancellation is best effort.
        }
        fail('RESPONSE_TOO_LARGE', metadata)
      }
      chunks.push(Buffer.from(value))
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, size).toString('utf8')
}

function objectFields(value) {
  return plainObject(value) ? Object.keys(value).sort() : []
}

function itemFields(rows) {
  return [...new Set(rows.flatMap((row) => Object.keys(row)))].sort()
}

function validateBootstrapPayload(payload, expectedRange) {
  if (!plainObject(payload) || payload.ok !== true || !plainObject(payload.schedule)) fail('UNEXPECTED_RESPONSE_CONTRACT')
  const schedule = payload.schedule
  if (typeof schedule.setupRequired !== 'boolean') fail('UNEXPECTED_RESPONSE_CONTRACT')
  if (schedule.settings !== null && !plainObject(schedule.settings)) fail('UNEXPECTED_RESPONSE_CONTRACT')
  if (schedule.setupRequired !== (schedule.settings === null)) fail('UNEXPECTED_RESPONSE_CONTRACT')
  for (const key of COLLECTION_KEYS) {
    if (!Array.isArray(schedule[key]) || schedule[key].some((row) => !plainObject(row))) {
      fail('UNEXPECTED_RESPONSE_CONTRACT')
    }
  }
  if (!plainObject(schedule.integration)
      || schedule.integration.delivery !== false
      || schedule.integration.notifications !== false
      || schedule.integration.downstream !== false) {
    fail('UNEXPECTED_RESPONSE_CONTRACT')
  }
  if (!plainObject(schedule.range)
      || schedule.range.from !== expectedRange.from
      || schedule.range.to !== expectedRange.to) {
    fail('UNEXPECTED_RESPONSE_CONTRACT')
  }
  return schedule
}

function successReport(response, payload, expectedRange) {
  const schedule = validateBootstrapPayload(payload, expectedRange)
  return {
    ok: true,
    status: Number(response.status),
    requestId: safeRequestId(response.headers?.get?.('x-request-id')),
    counts: Object.fromEntries(COLLECTION_KEYS.map((key) => [key, schedule[key].length])),
    shape: {
      rootFields: objectFields(payload),
      scheduleFields: objectFields(schedule),
      settingsFields: objectFields(schedule.settings),
      integrationFields: objectFields(schedule.integration),
      rangeFields: objectFields(schedule.range),
      collectionItemFields: Object.fromEntries(COLLECTION_KEYS.map((key) => [key, itemFields(schedule[key])])),
    },
  }
}

async function runBootstrapSmoke(options, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') fail('FETCH_UNAVAILABLE')
  const requestUrl = buildBootstrapUrl(options.baseUrl, options)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs)
  let response
  try {
    response = await fetchImpl(requestUrl, {
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${options.firebaseIdToken}`,
        'Cache-Control': 'no-store',
      },
      method: 'GET',
      redirect: 'manual',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    })
    const requestId = safeRequestId(response.headers?.get?.('x-request-id'))
    const status = Number(response.status) || 0
    if (status >= 300 && status < 400) fail('REDIRECT_BLOCKED', { requestId, status })
    if (status !== 200) fail('UNEXPECTED_HTTP_STATUS', { requestId, status })
    const contentType = String(response.headers?.get?.('content-type') ?? '').toLowerCase()
    if (!contentType.includes('application/json')) fail('UNEXPECTED_CONTENT_TYPE', { requestId, status })
    const body = await readResponseText(response)
    let payload
    try {
      payload = JSON.parse(body)
    } catch {
      fail('INVALID_JSON_RESPONSE', { requestId, status })
    }
    return successReport(response, payload, { from: options.from, to: options.to })
  } catch (error) {
    if (error instanceof WorkforceScheduleSmokeError) throw error
    if (controller.signal.aborted) fail('REQUEST_TIMEOUT')
    fail('NETWORK_ERROR')
  } finally {
    clearTimeout(timer)
  }
}

function failureReport(error) {
  const failure = error instanceof WorkforceScheduleSmokeError
    ? error
    : new WorkforceScheduleSmokeError('SMOKE_FAILED')
  return {
    ok: false,
    status: Number.isInteger(failure.status) ? failure.status : 0,
    requestId: safeRequestId(failure.requestId),
    error: failure.code,
  }
}

function usage() {
  return [
    'Authenticated read-only smoke for GET /api/portal/workforce-schedule/bootstrap.',
    '',
    'Required environment variables:',
    '  WORKFORCE_SCHEDULE_SMOKE_BASE_URL',
    '  WORKFORCE_SCHEDULE_SMOKE_ORG_ID',
    '  WORKFORCE_SCHEDULE_SMOKE_FROM',
    '  WORKFORCE_SCHEDULE_SMOKE_TO',
    '  WORKFORCE_SCHEDULE_SMOKE_FIREBASE_ID_TOKEN',
    '',
    'Equivalent non-secret arguments: --base-url, --org-id, --from, --to.',
    'Optional: --timeout-ms (100-60000). HTTP localhost additionally requires --allow-http-localhost.',
    'The Firebase ID token is accepted only through the environment variable and is never printed.',
  ].join('\n')
}

async function main({
  argv = process.argv.slice(2),
  env = process.env,
  fetchImpl = globalThis.fetch,
  stderr = process.stderr,
  stdout = process.stdout,
} = {}) {
  try {
    const options = resolveSmokeOptions(argv, env)
    if (options.help) {
      stdout.write(`${usage()}\n`)
      return 0
    }
    const report = await runBootstrapSmoke(options, fetchImpl)
    stdout.write(`${JSON.stringify(report)}\n`)
    return 0
  } catch (error) {
    stderr.write(`${JSON.stringify(failureReport(error))}\n`)
    return 1
  }
}

if (require.main === module) {
  main().then((exitCode) => {
    process.exitCode = exitCode
  })
}

module.exports = {
  MAX_RESPONSE_BYTES,
  WorkforceScheduleSmokeError,
  buildBootstrapUrl,
  failureReport,
  main,
  resolveSmokeOptions,
  runBootstrapSmoke,
  safeRequestId,
  successReport,
  validateBootstrapPayload,
}
