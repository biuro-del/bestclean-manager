'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  MAX_RESPONSE_BYTES,
  WorkforceScheduleSmokeError,
  main,
  resolveSmokeOptions,
  runBootstrapSmoke,
} = require('../scripts/smoke-workforce-schedule-bootstrap')

const TOKEN = 'header.payload.signature'

function validPayload(overrides = {}) {
  return {
    ok: true,
    schedule: {
      settings: { timeZone: 'Europe/Warsaw', version: 1 },
      setupRequired: false,
      people: [{ personId: 'person-business-secret', displayName: 'PERSON BUSINESS SECRET' }],
      locations: [{ locationId: 'location-business-secret', name: 'LOCATION BUSINESS SECRET' }],
      shifts: [{ shiftId: 'shift-business-secret', title: 'SHIFT BUSINESS SECRET' }],
      publications: [],
      requests: [],
      templates: [],
      integration: { delivery: false, notifications: false, downstream: false },
      range: { from: '2026-09-07', to: '2026-09-13' },
      ...overrides,
    },
  }
}

function options(overrides = {}) {
  return {
    baseUrl: new URL('https://portal.example.test/'),
    firebaseIdToken: TOKEN,
    from: '2026-09-07',
    orgId: 'bestclean',
    timeoutMs: 1_000,
    to: '2026-09-13',
    ...overrides,
  }
}

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': 'req-smoke-123',
      ...init.headers,
    },
  })
}

function memoryStream() {
  let value = ''
  return {
    stream: { write(chunk) { value += String(chunk) } },
    value() { return value },
  }
}

test('smoke wykonuje tylko GET z bearerem, bez cookies i bez automatycznych redirectow', async () => {
  let captured
  const report = await runBootstrapSmoke(options(), async (url, request) => {
    captured = { url, request }
    return jsonResponse(validPayload())
  })

  assert.equal(captured.url.toString(), 'https://portal.example.test/api/portal/workforce-schedule/bootstrap?orgId=bestclean&from=2026-09-07&to=2026-09-13')
  assert.equal(captured.request.method, 'GET')
  assert.equal(captured.request.redirect, 'manual')
  assert.equal(captured.request.credentials, 'omit')
  assert.equal(captured.request.headers.Authorization, `Bearer ${TOKEN}`)
  assert.equal(Object.hasOwn(captured.request, 'body'), false)
  assert.equal(report.ok, true)
  assert.equal(report.status, 200)
})

test('base URL moze wskazywac bezposrednio prefiks /api', async () => {
  let requested
  await runBootstrapSmoke(options({ baseUrl: new URL('https://portal.example.test/backend/api/') }), async (url) => {
    requested = url
    return jsonResponse(validPayload())
  })
  assert.equal(requested.pathname, '/backend/api/portal/workforce-schedule/bootstrap')
})

test('HTTP jest zabronione poza jawnie dopuszczonym localhost', () => {
  const common = {
    WORKFORCE_SCHEDULE_SMOKE_FIREBASE_ID_TOKEN: TOKEN,
    WORKFORCE_SCHEDULE_SMOKE_FROM: '2026-09-07',
    WORKFORCE_SCHEDULE_SMOKE_ORG_ID: 'bestclean',
    WORKFORCE_SCHEDULE_SMOKE_TO: '2026-09-13',
  }
  assert.throws(
    () => resolveSmokeOptions([], { ...common, WORKFORCE_SCHEDULE_SMOKE_BASE_URL: 'http://portal.example.test' }),
    (error) => error instanceof WorkforceScheduleSmokeError && error.code === 'HTTPS_REQUIRED',
  )
  assert.throws(
    () => resolveSmokeOptions([], { ...common, WORKFORCE_SCHEDULE_SMOKE_BASE_URL: 'http://127.0.0.1:4173' }),
    (error) => error instanceof WorkforceScheduleSmokeError && error.code === 'HTTPS_REQUIRED',
  )
  const local = resolveSmokeOptions(['--allow-http-localhost'], {
    ...common,
    WORKFORCE_SCHEDULE_SMOKE_BASE_URL: 'http://127.0.0.1:4173',
  })
  assert.equal(local.baseUrl.origin, 'http://127.0.0.1:4173')
  assert.throws(
    () => resolveSmokeOptions(['--allow-http-localhost'], { ...common, WORKFORCE_SCHEDULE_SMOKE_BASE_URL: 'http://portal.example.test' }),
    (error) => error instanceof WorkforceScheduleSmokeError && error.code === 'HTTPS_REQUIRED',
  )
})

test('redirect jest blokowany i jego Location nie trafia do raportu', async () => {
  const secretLocation = 'https://other.example.test/business-secret'
  await assert.rejects(
    () => runBootstrapSmoke(options(), async () => new Response(null, {
      status: 302,
      headers: { location: secretLocation, 'x-request-id': 'req-redirect' },
    })),
    (error) => {
      assert.equal(error.code, 'REDIRECT_BLOCKED')
      assert.equal(error.status, 302)
      assert.equal(error.requestId, 'req-redirect')
      assert.doesNotMatch(JSON.stringify(error), /business-secret/)
      return true
    },
  )
})

test('raport zawiera tylko status, request ID, liczności i ksztalt bez danych biznesowych i tokenu', async () => {
  const report = await runBootstrapSmoke(options(), async () => jsonResponse(validPayload()))
  assert.deepEqual(report.counts, {
    people: 1,
    locations: 1,
    shifts: 1,
    publications: 0,
    requests: 0,
    templates: 0,
  })
  assert.equal(report.requestId, 'req-smoke-123')
  assert.deepEqual(report.shape.collectionItemFields.people, ['displayName', 'personId'])
  assert.deepEqual(report.shape.collectionItemFields.locations, ['locationId', 'name'])
  assert.deepEqual(report.shape.collectionItemFields.shifts, ['shiftId', 'title'])
  const serialized = JSON.stringify(report)
  assert.doesNotMatch(serialized, /PERSON BUSINESS SECRET|LOCATION BUSINESS SECRET|SHIFT BUSINESS SECRET/)
  assert.doesNotMatch(serialized, new RegExp(TOKEN.replaceAll('.', '\\.')))
  assert.doesNotMatch(serialized, /bestclean|2026-09-07|2026-09-13/)
})

test('nieoczekiwany kontrakt konczy smoke błędem', async () => {
  for (const payload of [
    { ok: true, schedule: { people: [] } },
    validPayload({ shifts: ['not-an-object'] }),
    validPayload({ integration: { delivery: true, notifications: false, downstream: false } }),
    validPayload({ range: { from: '2026-09-08', to: '2026-09-13' } }),
  ]) {
    await assert.rejects(
      () => runBootstrapSmoke(options(), async () => jsonResponse(payload)),
      (error) => error.code === 'UNEXPECTED_RESPONSE_CONTRACT',
    )
  }
})

test('limit odpowiedzi blokuje nadmiar danych bez wypisywania body', async () => {
  const response = new Response('x', {
    status: 200,
    headers: {
      'content-length': String(MAX_RESPONSE_BYTES + 1),
      'content-type': 'application/json',
      'x-request-id': 'req-too-large',
    },
  })
  await assert.rejects(
    () => runBootstrapSmoke(options(), async () => response),
    (error) => {
      assert.equal(error.code, 'RESPONSE_TOO_LARGE')
      assert.equal(error.status, 200)
      assert.equal(error.requestId, 'req-too-large')
      return true
    },
  )
})

test('timeout przerywa request i zwraca bezpieczny kod bez szczegolow sieci', async () => {
  await assert.rejects(
    () => runBootstrapSmoke(options({ timeoutMs: 10 }), async (_url, request) => new Promise((_resolve, reject) => {
      request.signal.addEventListener('abort', () => {
        const error = new Error('TOKEN_OR_NETWORK_DETAIL_MUST_NOT_LEAK')
        error.name = 'AbortError'
        reject(error)
      }, { once: true })
    })),
    (error) => {
      assert.equal(error.code, 'REQUEST_TIMEOUT')
      assert.doesNotMatch(JSON.stringify(error), /TOKEN_OR_NETWORK_DETAIL/)
      return true
    },
  )
})

test('main przy HTTP 500 nie odczytuje ani nie wypisuje treści odpowiedzi', async () => {
  const stdout = memoryStream()
  const stderr = memoryStream()
  let bodyRead = false
  const response = {
    status: 500,
    headers: new Headers({ 'content-type': 'application/json', 'x-request-id': 'req-500' }),
    async text() {
      bodyRead = true
      return `SERVER BUSINESS SECRET ${TOKEN}`
    },
  }
  const exitCode = await main({
    argv: [
      '--base-url', 'https://portal.example.test',
      '--org-id', 'bestclean',
      '--from', '2026-09-07',
      '--to', '2026-09-13',
    ],
    env: { WORKFORCE_SCHEDULE_SMOKE_FIREBASE_ID_TOKEN: TOKEN },
    fetchImpl: async () => response,
    stderr: stderr.stream,
    stdout: stdout.stream,
  })
  assert.equal(exitCode, 1)
  assert.equal(bodyRead, false)
  assert.equal(stdout.value(), '')
  assert.deepEqual(JSON.parse(stderr.value()), {
    ok: false,
    status: 500,
    requestId: 'req-500',
    error: 'UNEXPECTED_HTTP_STATUS',
  })
  assert.doesNotMatch(stderr.value(), /SERVER BUSINESS SECRET|header\.payload\.signature|bestclean/)
})

test('nieprawidłowy token kończy się przed wykonaniem sieci i nie trafia do raportu', async () => {
  const stdout = memoryStream()
  const stderr = memoryStream()
  let requested = false
  const secret = 'token with forbidden whitespace SECRET'
  const exitCode = await main({
    argv: [],
    env: {
      WORKFORCE_SCHEDULE_SMOKE_BASE_URL: 'https://portal.example.test',
      WORKFORCE_SCHEDULE_SMOKE_FIREBASE_ID_TOKEN: secret,
      WORKFORCE_SCHEDULE_SMOKE_FROM: '2026-09-07',
      WORKFORCE_SCHEDULE_SMOKE_ORG_ID: 'bestclean',
      WORKFORCE_SCHEDULE_SMOKE_TO: '2026-09-13',
    },
    fetchImpl: async () => { requested = true },
    stderr: stderr.stream,
    stdout: stdout.stream,
  })
  assert.equal(exitCode, 1)
  assert.equal(requested, false)
  assert.doesNotMatch(stderr.value(), /token with forbidden|SECRET/)
  assert.equal(JSON.parse(stderr.value()).error, 'INVALID_ID_TOKEN')
})

test('token nie moze zostac przekazany jako argument procesu', () => {
  assert.throws(
    () => resolveSmokeOptions([
      '--base-url', 'https://portal.example.test',
      '--org-id', 'bestclean',
      '--from', '2026-09-07',
      '--to', '2026-09-13',
      '--id-token', TOKEN,
    ], {}),
    (error) => error instanceof WorkforceScheduleSmokeError && error.code === 'UNKNOWN_ARGUMENT',
  )
})

test('runbook pobiera token ukrytym promptem i zawsze usuwa go z procesu', () => {
  const runbook = fs.readFileSync(
    path.join(__dirname, '..', 'docs', 'workforce-schedule-production-activation.md'),
    'utf8',
  )
  assert.match(runbook, /Read-Host[^\n]+-AsSecureString/)
  assert.match(runbook, /ZeroFreeBSTR\(\$tokenPointer\)/)
  assert.match(runbook, /Remove-Item Env:WORKFORCE_SCHEDULE_SMOKE_FIREBASE_ID_TOKEN/)
  assert.doesNotMatch(runbook, /WORKFORCE_SCHEDULE_SMOKE_FIREBASE_ID_TOKEN\s*=\s*['"]</)
  assert.doesNotMatch(runbook, /--id-token\s+['"]?</)
})

test('package script uruchamia wyłącznie lokalny smoke Node', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
  assert.equal(
    packageJson.scripts['smoke:workforce-schedule:bootstrap'],
    'node scripts/smoke-workforce-schedule-bootstrap.js',
  )
})
