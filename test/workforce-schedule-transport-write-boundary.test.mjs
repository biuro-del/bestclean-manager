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

function response(body = { ok: true }) {
  return {
    ok: true,
    status: 200,
    async text() { return JSON.stringify(body) },
  }
}

async function fixture() {
  const calls = []
  let id = 0
  const { createWorkforceScheduleTransport } = await transportModule
  return {
    calls,
    transport: createWorkforceScheduleTransport({
      apiBase: 'https://portal.example.test/root',
      createId: () => `id-${++id}`,
      getActiveOrganizationId: async () => 'bestclean',
      getAuthHeaders: async () => ({ Authorization: 'Bearer firebase-token' }),
      fetchImpl: async (url, init) => {
        calls.push({ init, url })
        return response()
      },
    }),
  }
}

const effectsDisabled = {
  delivery: false,
  notifications: false,
  downstream: false,
}

test('jawne komendy zapisu trafiają tylko do commands i zawsze wyłączają efekty zewnętrzne', async () => {
  const f = await fixture()

  await f.transport.setConfiguration('bestclean', {
    expectedVersion: 0,
    timeZone: 'Europe/Warsaw',
    weeklyLimitMinutes: 2400,
  })
  await f.transport.syncCatalogs('bestclean')
  await f.transport.upsertShift('bestclean', { businessDate: '2026-09-07' })
  await f.transport.archiveShift('bestclean', { shiftId: 'shift-1', expectedVersion: 1 })
  await f.transport.copyWeek('bestclean', {
    sourceWeekStart: '2026-09-07',
    expectedVersions: [{ shiftId: 'shift-1', version: 1 }],
  })
  await f.transport.createRecurringShifts('bestclean', {
    shift: { date: '2026-09-07' },
    recurrence: { frequency: 'DAILY', interval: 1, ends: { type: 'COUNT', count: 2 } },
  })

  assert.equal(f.calls.length, 6)
  assert.deepEqual(
    f.calls.map(({ url }) => url),
    Array(6).fill('https://portal.example.test/root/api/portal/workforce-schedule/commands'),
  )
  assert.deepEqual(
    f.calls.map(({ init }) => JSON.parse(init.body).type),
    ['SET_CONFIGURATION', 'SYNC_CATALOGS', 'UPSERT_SHIFT', 'ARCHIVE_SHIFT', 'COPY_WEEK', 'CREATE_RECURRING_SHIFTS'],
  )
  for (const { init } of f.calls) {
    const body = JSON.parse(init.body)
    assert.equal(init.method, 'POST')
    assert.equal(body.orgId, 'bestclean')
    assert.deepEqual(body.effects, effectsDisabled)
  }
})

test('powtarzanie jest jednym commandem i zachowuje jeden klucz idempotencji', async () => {
  const f = await fixture()
  const payload = {
    shift: { date: '2026-09-07', title: 'Zmiana' },
    recurrence: { frequency: 'WEEKLY', interval: 1, weekdays: [1, 3], ends: { type: 'COUNT', count: 8 } },
  }

  await f.transport.createRecurringShifts('bestclean', payload, { idempotencyKey: 'recurrence-operation-1' })

  assert.equal(f.calls.length, 1)
  assert.deepEqual(JSON.parse(f.calls[0].init.body), {
    type: 'CREATE_RECURRING_SHIFTS',
    orgId: 'bestclean',
    idempotencyKey: 'recurrence-operation-1',
    effects: effectsDisabled,
    payload,
  })
})

test('COPY_WEEK wysyła jeden atomowy command z wersjami źródeł i bez efektów zewnętrznych', async () => {
  const f = await fixture()
  const payload = {
    sourceWeekStart: '2026-09-07',
    expectedVersions: [
      { shiftId: 'shift-1', version: 4 },
      { shiftId: 'shift-2', version: 7 },
    ],
  }

  await f.transport.copyWeek('bestclean', payload, { idempotencyKey: 'copy-week-operation-1' })

  assert.equal(f.calls.length, 1)
  assert.equal(
    f.calls[0].url,
    'https://portal.example.test/root/api/portal/workforce-schedule/commands',
  )
  assert.deepEqual(JSON.parse(f.calls[0].init.body), {
    type: 'COPY_WEEK',
    orgId: 'bestclean',
    idempotencyKey: 'copy-week-operation-1',
    effects: effectsDisabled,
    payload,
  })
})

test('transport odrzuca komendy spoza niezależnego Grafiku i ręczne rozszczepienie katalogów', async () => {
  const f = await fixture()
  for (const type of [
    'IMPORT_ORDERS',
    'SYNC_CALENDAR',
    'UPSERT_TASK',
    'SEND_NOTIFICATION',
    'SYNC_ROSTER',
    'UPSERT_LOCATION',
  ]) {
    await assert.rejects(
      f.transport.sendCommand('bestclean', type, {}),
      (error) => error.code === 'WORKFORCE_SCHEDULE_COMMAND_UNSUPPORTED',
    )
  }
  assert.equal(f.calls.length, 0)
})

test('próba włączenia delivery, notifications lub downstream jest blokowana przed fetch', async () => {
  for (const effect of Object.keys(effectsDisabled)) {
    const command = await fixture()
    await assert.rejects(
      command.transport.upsertShift(
        'bestclean',
        { businessDate: '2026-09-07' },
        { effects: { [effect]: true } },
      ),
      (error) => error.code === 'WORKFORCE_SCHEDULE_EFFECTS_DISABLED',
    )
    assert.equal(command.calls.length, 0)

    const publication = await fixture()
    await assert.rejects(
      publication.transport.publish('bestclean', {
        from: '2026-09-07',
        to: '2026-09-13',
        expectedVersions: [{ shiftId: 'shift-1', version: 1 }],
        effects: { [effect]: true },
      }),
      (error) => error.code === 'WORKFORCE_SCHEDULE_EFFECTS_DISABLED',
    )
    assert.equal(publication.calls.length, 0)
  }
})

test('publikacja jest wyłącznie wewnętrznym zatwierdzeniem z wyłączonymi efektami', async () => {
  const f = await fixture()
  await f.transport.publish('bestclean', {
    from: '2026-09-07',
    to: '2026-09-13',
    expectedVersions: [{ shiftId: 'shift-1', version: 2 }],
    warningFingerprint: 'fingerprint',
  })

  assert.equal(
    f.calls[0].url,
    'https://portal.example.test/root/api/portal/workforce-schedule/publications',
  )
  const body = JSON.parse(f.calls[0].init.body)
  assert.deepEqual(body.effects, effectsDisabled)
  assert.equal(body.idempotencyKey, 'ws-publish-id-1')
  assert.deepEqual(body.expectedVersions, [{ shiftId: 'shift-1', version: 2 }])
})

test('żaden dostępny transport nie wywołuje endpointów zleceń, kalendarza ani zadań', async () => {
  const f = await fixture()
  await f.transport.fetchBootstrap('bestclean', { from: '2026-09-07', to: '2026-09-13' })
    .catch(() => {})
  await f.transport.syncCatalogs('bestclean')
  await f.transport.publish('bestclean', {
    from: '2026-09-07',
    to: '2026-09-13',
    expectedVersions: [{ shiftId: 'shift-1', version: 1 }],
  })

  for (const { url } of f.calls) {
    assert.match(url, /\/portal\/workforce-schedule\//)
    assert.doesNotMatch(url, /\/(orders?|calendar|tasks?)(?:\/|\?|$)/i)
  }
})

test('rejestr operacji zachowuje klucz po niejednoznacznym błędzie sieci i zwalnia go po sukcesie', async () => {
  const { createWorkforceScheduleOperationRegistry } = await transportModule
  let sequence = 0
  const registry = createWorkforceScheduleOperationRegistry((action) => `${action}-${++sequence}`)
  const payload = { orgId: 'bestclean', shiftId: 'shift-1', version: 2 }

  const first = registry.begin('upsert-shift', payload)
  registry.fail(first, { code: 'WORKFORCE_SCHEDULE_NETWORK_ERROR' })
  const retry = registry.begin('upsert-shift', payload)
  assert.equal(retry.key, first.key)
  assert.equal(retry.token, first.token)

  registry.complete(retry)
  const afterSuccess = registry.begin('upsert-shift', payload)
  assert.notEqual(afterSuccess.key, first.key)

  registry.fail(afterSuccess, { code: 'WORKFORCE_SCHEDULE_CLIENT_VALIDATION', status: 400 })
  const afterDeterministicFailure = registry.begin('upsert-shift', payload)
  assert.notEqual(afterDeterministicFailure.key, afterSuccess.key)

  registry.fail(afterDeterministicFailure, {
    code: 'WORKFORCE_SCHEDULE_INVALID_COPY_RESPONSE',
    retryWithSameIdempotencyKey: true,
  })
  const afterUnverifiedReceipt = registry.begin('upsert-shift', payload)
  assert.equal(afterUnverifiedReceipt.key, afterDeterministicFailure.key)
  assert.equal(afterUnverifiedReceipt.token, afterDeterministicFailure.token)
})

test('stare zakończenie po clear nie usuwa nowszego klucza tej samej operacji', async () => {
  const { createWorkforceScheduleOperationRegistry } = await transportModule
  let sequence = 0
  const registry = createWorkforceScheduleOperationRegistry((action) => `${action}-${++sequence}`)
  const payload = { orgId: 'bestclean', shiftId: 'shift-1', version: 2 }

  const oldOperation = registry.begin('upsert-shift', payload)
  registry.clear()
  const newOperation = registry.begin('upsert-shift', payload)
  assert.notEqual(newOperation.token, oldOperation.token)

  registry.complete(oldOperation)
  assert.equal(registry.begin('upsert-shift', payload).key, newOperation.key)

  registry.fail(oldOperation, { code: 'WORKFORCE_SCHEDULE_CLIENT_VALIDATION', status: 400 })
  assert.equal(registry.begin('upsert-shift', payload).key, newOperation.key)
})
