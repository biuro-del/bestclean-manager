import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const transportUrl = pathToFileURL(path.join(
  projectRoot,
  'web-app',
  'apps',
  'portal-web',
  'src',
  'services',
  'workforceScheduleTransport.js',
)).href

const transportModule = import(transportUrl)

function response(status, body, raw = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return raw || JSON.stringify(body) },
  }
}

async function fixture(options = {}) {
  const calls = []
  const responses = [...(options.responses || [response(200, { ok: true })])]
  const { createWorkforceScheduleTransport } = await transportModule
  return {
    calls,
    transport: createWorkforceScheduleTransport({
      apiBase: options.apiBase || '/api',
      createId: () => 'test-id',
      async getActiveOrganizationId() {
        calls.push(['context'])
        return options.activeOrgId ?? 'bestclean'
      },
      async getAuthHeaders(input) {
        calls.push(['auth', input])
        return options.authHeaders ?? {
          Authorization: 'Bearer firebase-token',
          'X-Platform-Context-Id': 'context-id',
        }
      },
      async fetchImpl(url, init) {
        calls.push(['fetch', url, init])
        return responses.shift() || response(500, {})
      },
    }),
  }
}

test('bootstrap używa tylko namespace Grafiku, bearer i aktywnej organizacji', async () => {
  const f = await fixture({
    apiBase: '/backend/',
    responses: [response(200, {
      schedule: { people: [{ personId: 'W001' }], locations: [{ locationId: 'BC001' }], shifts: [] },
    })],
  })

  const schedule = await f.transport.fetchBootstrap('bestclean', {
    from: '2026-09-07',
    to: '2026-09-13',
  })

  assert.equal(schedule.people[0].personId, 'W001')
  const [, authInput] = f.calls.find(([kind]) => kind === 'auth')
  assert.deepEqual(authInput, { method: 'GET', orgId: 'bestclean' })
  const [, url, init] = f.calls.find(([kind]) => kind === 'fetch')
  assert.equal(
    url,
    '/backend/api/portal/workforce-schedule/bootstrap?orgId=bestclean&from=2026-09-07&to=2026-09-13',
  )
  assert.equal(init.method, 'GET')
  assert.equal(init.headers.Authorization, 'Bearer firebase-token')
  assert.equal(init.headers['X-Platform-Context-Id'], 'context-id')
  assert.equal(Object.hasOwn(init, 'body'), false)
})

test('nieaktywna organizacja jest zatrzymywana przed tokenem i fetch', async () => {
  const f = await fixture({ activeOrgId: 'another-org' })

  await assert.rejects(
    f.transport.fetchBootstrap('bestclean', { from: '2026-09-07', to: '2026-09-13' }),
    (error) => error.code === 'WORKFORCE_SCHEDULE_ORG_CONTEXT_MISMATCH',
  )
  assert.equal(f.calls.some(([kind]) => kind === 'auth'), false)
  assert.equal(f.calls.some(([kind]) => kind === 'fetch'), false)
})

test('brak Firebase bearer jest zatrzymywany przed fetch', async () => {
  const f = await fixture({ authHeaders: { 'X-Platform-Context-Id': 'context-id' } })

  await assert.rejects(
    f.transport.fetchBootstrap('bestclean', { from: '2026-09-07', to: '2026-09-13' }),
    (error) => error.code === 'WORKFORCE_SCHEDULE_AUTH_REQUIRED',
  )
  assert.equal(f.calls.some(([kind]) => kind === 'fetch'), false)
})

test('niepoprawna data oraz HTML zamiast JSON nie stają się danymi Grafiku', async () => {
  const invalidDate = await fixture()
  await assert.rejects(
    invalidDate.transport.fetchBootstrap('bestclean', { from: '2026-09-31', to: '2026-10-01' }),
    (error) => error.code === 'WORKFORCE_SCHEDULE_CLIENT_VALIDATION',
  )
  assert.equal(invalidDate.calls.some(([kind]) => kind === 'fetch'), false)

  const html = await fixture({
    responses: [response(200, null, '<!doctype html><title>proxy</title>')],
  })
  await assert.rejects(
    html.transport.fetchBootstrap('bestclean', { from: '2026-09-07', to: '2026-09-13' }),
    (error) => error.code === 'WORKFORCE_SCHEDULE_INVALID_RESPONSE',
  )
})
