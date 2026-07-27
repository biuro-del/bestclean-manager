'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  REQUIRED_WORKER_INDEXES,
  REQUIRED_WORKER_SCHEMA,
  inspectWorkerSchema,
} = require('../worker-repository')

function createSchemaClient(indexNames) {
  let queryNumber = 0

  return {
    async query() {
      queryNumber += 1

      if (queryNumber === 1) {
        return {
          rows: Object.keys(REQUIRED_WORKER_SCHEMA).map((relationName) => ({
            relation_name: relationName,
            exists: true,
          })),
        }
      }

      if (queryNumber === 2) {
        return {
          rows: Object.entries(REQUIRED_WORKER_SCHEMA).flatMap(([tableName, columns]) =>
            Object.entries(columns).map(([columnName, length]) => ({
              table_name: tableName,
              column_name: columnName,
              character_maximum_length: length,
            })),
          ),
        }
      }

      if (queryNumber === 3) {
        return {
          rows: indexNames.map((indexname) => ({ indexname })),
        }
      }

      throw new Error(`UNEXPECTED_QUERY_${queryNumber}`)
    },
  }
}

test('gotowość Worker akceptuje aktualne indeksy pól znormalizowanych', async () => {
  const readiness = await inspectWorkerSchema(createSchemaClient(REQUIRED_WORKER_INDEXES))

  assert.deepEqual(readiness, {
    ready: true,
    missing: [],
  })
})

test('gotowość Worker nie wraca do wycofanych indeksów funkcyjnych', async () => {
  const readiness = await inspectWorkerSchema(
    createSchemaClient([
      'worker_org_login_ci_uidx',
      'worker_org_worker_id_ci_uidx',
    ]),
  )

  assert.equal(readiness.ready, false)
  assert.deepEqual(readiness.missing, [
    'index:public.worker_org_login_normalized_uidx',
    'index:public.worker_org_worker_id_normalized_uidx',
  ])
})
