'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  REQUIRED_WORKER_INDEXES,
  REQUIRED_WORKER_SCHEMA,
  assertWorkerSchemaReady,
  clearWorkerSchemaReadyCache,
  deleteWorkerAccessRows,
  insertWorkerAndMembership,
  reserveWorkerId,
} = require('../worker-repository')

test('worker schema readiness is shared and cached after a successful inspection', async () => {
  clearWorkerSchemaReadyCache()
  const calls = []
  const client = {
    async query(sql, params = []) {
      calls.push(sql)
      if (sql.includes("to_regclass('public.' || relation_name)")) {
        return {
          rows: params[0].map((relationName) => ({ relation_name: relationName, exists: true })),
        }
      }
      if (sql.includes('from information_schema.columns')) {
        return {
          rows: Object.entries(REQUIRED_WORKER_SCHEMA).flatMap(([tableName, columns]) =>
            Object.entries(columns).map(([columnName, minimumLength]) => ({
              table_name: tableName,
              column_name: columnName,
              character_maximum_length: minimumLength,
            })),
          ),
        }
      }
      if (sql.includes('from pg_indexes')) {
        return { rows: REQUIRED_WORKER_INDEXES.map((indexname) => ({ indexname })) }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }

  const [first, second] = await Promise.all([
    assertWorkerSchemaReady(client),
    assertWorkerSchemaReady(client),
  ])
  const third = await assertWorkerSchemaReady(client)

  assert.equal(first.ready, true)
  assert.equal(second.ready, true)
  assert.equal(third.ready, true)
  assert.equal(calls.length, 3)
  clearWorkerSchemaReadyCache()
})

test('worker insert keeps login and worker type in the correct SQL parameters', async () => {
  const calls = []
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params })
      return { rowCount: 1, rows: sql.includes('returning *') ? [{ login: params[1] }] : [] }
    },
  }

  await insertWorkerAndMembership(client, {
    orgId: 'org123',
    login: 'u_org123_1',
    workerId: 'worker_org123_1',
    displayName: 'Jan Kowalski',
    email: 'jan.kowalski@gmail.com',
    role: 'WORKER',
    active: true,
    phone: '123',
    workerType: 'Pracownik',
    authUid: 'firebase-uid',
    createdByUid: 'admin-uid',
  })

  const workerInsert = calls.find((call) => call.sql.includes('insert into public.worker ('))
  assert.ok(workerInsert)
  assert.deepEqual(workerInsert.params, [
    'org123',
    'u_org123_1',
    'worker_org123_1',
    'Jan Kowalski',
    'jan.kowalski@gmail.com',
    'WORKER',
    true,
    '123',
    undefined,
    'Pracownik',
    'firebase-uid',
    'admin-uid',
  ])
})

test('worker ID reservations advance and are never reused', async () => {
  const reservations = [{ worker_number: 3, worker_id: 'worker_org123_3' }]
  const client = {
    async query(sql, params = []) {
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 }
      if (sql.includes('from public.worker_id_reservation')) {
        return { rows: [...reservations], rowCount: reservations.length }
      }
      if (sql.includes('select worker_id from public.worker')) {
        return { rows: [], rowCount: 0 }
      }
      if (sql.includes('insert into public.worker_id_reservation')) {
        reservations.push({
          worker_number: params[1],
          worker_id: params[2],
        })
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    },
  }

  const first = await reserveWorkerId(client, 'org123', null, 'admin')
  const second = await reserveWorkerId(client, 'org123', null, 'admin')
  assert.deepEqual(first, { workerId: 'worker_org123_4', workerNumber: 4 })
  assert.deepEqual(second, { workerId: 'worker_org123_5', workerNumber: 5 })
})

test('concurrent reservations receive different sequential IDs', async () => {
  const reservations = []
  let lock = Promise.resolve()

  const createClient = () => {
    let releaseLock = null
    return {
      async query(sql, params = []) {
        if (sql.includes('pg_advisory_xact_lock')) {
          const previous = lock
          lock = new Promise((resolve) => {
            releaseLock = resolve
          })
          await previous
          return { rows: [], rowCount: 1 }
        }
        if (sql.includes('from public.worker_id_reservation')) {
          return { rows: [...reservations], rowCount: reservations.length }
        }
        if (sql.includes('select worker_id from public.worker')) {
          return { rows: [], rowCount: 0 }
        }
        if (sql.includes('insert into public.worker_id_reservation')) {
          reservations.push({
            worker_number: params[1],
            worker_id: params[2],
          })
          releaseLock?.()
          return { rows: [], rowCount: 1 }
        }
        throw new Error(`Unexpected SQL: ${sql}`)
      },
    }
  }

  const [first, second] = await Promise.all([
    reserveWorkerId(createClient(), 'org123', null, 'admin-1'),
    reserveWorkerId(createClient(), 'org123', null, 'admin-2'),
  ])

  assert.deepEqual(
    [first.workerNumber, second.workerNumber].sort((left, right) => left - right),
    [1, 2],
  )
})

test('delete skips missing historical tables', async () => {
  const executed = []
  const client = {
    async query(sql, params = []) {
      executed.push(sql)
      if (sql.includes('to_regclass(relation_name)')) {
        return {
          rows: params[0].map((relationName) => ({
            relation_name: relationName,
            exists: false,
          })),
          rowCount: params[0].length,
        }
      }
      return { rows: [], rowCount: 1 }
    },
  }

  const deleted = await deleteWorkerAccessRows(
    client,
    'org123',
    'jan',
    'worker_org123_1',
    'firebase-uid',
  )

  assert.equal(deleted.worker, 1)
  assert.equal(deleted.organization_member, 1)
  assert.equal(deleted.checklist_log, 0)
  assert.equal(executed.some((sql) => sql.includes('delete from public.checklist_log')), false)
})
