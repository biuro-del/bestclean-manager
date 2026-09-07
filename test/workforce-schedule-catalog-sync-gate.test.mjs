import assert from 'node:assert/strict'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const moduleUrl = pathToFileURL(path.resolve(
  'web-app/apps/portal-web/src/features/workforce-schedule/workforceScheduleCatalogSync.js',
)).href

async function createGate() {
  const { createWorkforceScheduleCatalogSyncGate } = await import(moduleUrl)
  return createWorkforceScheduleCatalogSyncGate()
}

function receipt(orgId = 'bestclean', overrides = {}) {
  return {
    version: 1,
    orgId,
    synchronizedAt: '2026-09-07T10:15:30.000Z',
    people: { active: 12, created: 2, updated: 3, deactivated: 1 },
    locations: { active: 7, created: 1, updated: 2, deactivated: 0 },
    effects: {
      delivery: false,
      notifications: false,
      downstream: false,
    },
    ...overrides,
  }
}

function syncResponse(orgId = 'bestclean', overrides = {}) {
  return {
    ok: true,
    orgId,
    idempotent: false,
    effects: {
      delivery: false,
      notifications: false,
      downstream: false,
    },
    people: [],
    locations: [],
    ...overrides,
  }
}

test('synchronizacja nie jest ukończona przed potwierdzeniem operacji', async () => {
  const gate = await createGate()
  let resolveSync
  const pending = gate.run('bestclean', () => new Promise((resolve) => {
    resolveSync = resolve
  }))

  await Promise.resolve()
  assert.equal(gate.isComplete('bestclean'), false)
  resolveSync(syncResponse())
  await pending
  assert.equal(gate.isComplete('bestclean'), true)
})

test('błąd pozostawia synchronizację gotową do bezpiecznego ponowienia', async () => {
  const gate = await createGate()
  let calls = 0
  await assert.rejects(
    gate.run('bestclean', async () => {
      calls += 1
      throw new Error('temporary failure')
    }),
    /temporary failure/,
  )
  assert.equal(gate.isComplete('bestclean'), false)

  await gate.run('bestclean', async () => {
    calls += 1
    return syncResponse('bestclean', { people: [{ personId: 'person-1' }] })
  })
  assert.equal(calls, 2)
  assert.equal(gate.isComplete('bestclean'), true)
})

test('tylko kanoniczna odpowiedź właściwej organizacji oznacza sukces', async () => {
  const invalidResponses = [
    undefined,
    {},
    { ok: false },
    syncResponse('other-org'),
    syncResponse('bestclean', { idempotent: 'false' }),
    syncResponse('bestclean', { effects: { delivery: false, notifications: false } }),
    syncResponse('bestclean', { people: null }),
    syncResponse('bestclean', { people: [{}] }),
    syncResponse('bestclean', { locations: null }),
    syncResponse('bestclean', { locations: [{}] }),
  ]

  for (const response of invalidResponses) {
    const gate = await createGate()
    await assert.rejects(
      gate.run('bestclean', async () => response),
      (error) => error?.code === 'WORKFORCE_SCHEDULE_CATALOG_SYNC_NOT_CONFIRMED',
    )
    assert.equal(gate.isComplete('bestclean'), false)
  }
})

test('równoległe odświeżenia współdzielą jedną synchronizację', async () => {
  const gate = await createGate()
  let calls = 0
  let resolveSync
  const operation = () => {
    calls += 1
    return new Promise((resolve) => {
      resolveSync = resolve
    })
  }
  const first = gate.run('bestclean', operation)
  const second = gate.run('bestclean', operation)

  await Promise.resolve()
  assert.equal(calls, 1)
  resolveSync(syncResponse())
  await Promise.all([first, second])
  assert.equal(calls, 1)
})

test('ukończenie jest izolowane per organizacja także dla sekwencji A-B-A', async () => {
  const gate = await createGate()
  let callsA = 0
  let callsB = 0

  await gate.run('org-a', async () => {
    callsA += 1
    return syncResponse('org-a')
  })
  await gate.run('org-b', async () => {
    callsB += 1
    return syncResponse('org-b')
  })
  await gate.run('org-a', async () => {
    callsA += 1
    return syncResponse('org-a')
  })

  assert.equal(callsA, 1)
  assert.equal(callsB, 1)
  assert.equal(gate.isComplete('org-a'), true)
  assert.equal(gate.isComplete('org-b'), true)
})

test('reset sesji izoluje stare i nowe żądanie tej samej organizacji', async () => {
  const gate = await createGate()
  let resolveOld
  let resolveNew
  let unexpectedCalls = 0
  const oldRequest = gate.run('bestclean', () => new Promise((resolve) => {
    resolveOld = resolve
  }))
  await Promise.resolve()
  gate.reset()
  const newRequest = gate.run('bestclean', () => new Promise((resolve) => {
    resolveNew = resolve
  }))
  await Promise.resolve()

  resolveOld(syncResponse())
  await oldRequest
  assert.equal(gate.isComplete('bestclean'), false)

  const joinedNewRequest = gate.run('bestclean', async () => {
    unexpectedCalls += 1
    return syncResponse()
  })
  await Promise.resolve()
  assert.equal(unexpectedCalls, 0)

  resolveNew(syncResponse())
  await Promise.all([newRequest, joinedNewRequest])

  assert.equal(gate.isComplete('bestclean'), true)
})

test('ręczne wymuszenie naprawdę omija ukończony gate, ale nadal współdzieli żądanie w toku', async () => {
  const gate = await createGate()
  let calls = 0
  await gate.run('bestclean', async () => {
    calls += 1
    return syncResponse()
  })

  let resolveForced
  const operation = () => {
    calls += 1
    return new Promise((resolve) => { resolveForced = resolve })
  }
  const firstForced = gate.run('bestclean', operation, { force: true })
  const joinedForced = gate.run('bestclean', operation, { force: true })
  await Promise.resolve()

  assert.equal(calls, 2)
  resolveForced(syncResponse('bestclean', { receipt: receipt() }))
  await Promise.all([firstForced, joinedForced])
  assert.equal(calls, 2)
  assert.equal(gate.isComplete('bestclean'), true)
})

test('nowy receipt jest walidowany dokładnie, a stara odpowiedź pozostaje przejściowo zgodna', async () => {
  const {
    isConfirmedWorkforceScheduleCatalogSyncResponse,
    isConfirmedWorkforceScheduleCatalogSyncReceipt,
  } = await import(moduleUrl)

  assert.equal(isConfirmedWorkforceScheduleCatalogSyncResponse('bestclean', syncResponse()), true)
  assert.equal(isConfirmedWorkforceScheduleCatalogSyncReceipt('bestclean', receipt()), true)
  assert.equal(isConfirmedWorkforceScheduleCatalogSyncResponse(
    'bestclean',
    syncResponse('bestclean', { receipt: receipt() }),
  ), true)

  const invalid = [
    receipt('other-org'),
    receipt('bestclean', { version: 2 }),
    receipt('bestclean', { synchronizedAt: 'wczoraj' }),
    receipt('bestclean', { people: { active: -1, created: 0, updated: 0, deactivated: 0 } }),
    receipt('bestclean', { locations: { active: 1, created: 0, updated: 0, deactivated: 0.5 } }),
    receipt('bestclean', { effects: { delivery: false, notifications: false, downstream: true } }),
    { ...receipt(), unexpected: true },
  ]
  invalid.forEach((candidate) => {
    assert.equal(isConfirmedWorkforceScheduleCatalogSyncReceipt('bestclean', candidate), false)
    assert.equal(isConfirmedWorkforceScheduleCatalogSyncResponse(
      'bestclean',
      syncResponse('bestclean', { receipt: candidate }),
    ), false)
  })
})

test('podsumowanie synchronizacji korzysta z serwerowego czasu i wyłącznie liczników receipt', async () => {
  const { summarizeWorkforceScheduleCatalogSync } = await import(moduleUrl)
  const summary = summarizeWorkforceScheduleCatalogSync(
    'bestclean',
    syncResponse('bestclean', {
      people: [{ personId: 'sekretny-pracownik' }],
      locations: [{ locationId: 'sekretny-obiekt' }],
      receipt: receipt(),
    }),
    { completedAt: '2020-01-01T00:00:00.000Z' },
  )

  assert.deepEqual(summary, {
    lastSyncedAt: '2026-09-07T10:15:30.000Z',
    source: 'receipt',
    people: { active: 12, created: 2, updated: 3, deactivated: 1 },
    locations: { active: 7, created: 1, updated: 2, deactivated: 0 },
  })
  assert.doesNotMatch(JSON.stringify(summary), /sekretny/)
})
