'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const test = require('node:test')

async function loadRetryPolicy() {
  const modulePath = path.join(
    __dirname,
    '..',
    'web-app',
    'apps',
    'portal-web',
    'src',
    'services',
    'scheduleOrderSaveRetry.js',
  )
  return import(pathToFileURL(modulePath).href)
}

test('POST zlecen ponawia tylko przejsciowe awarie, z ograniczonym backoffem', async () => {
  const { scheduleOrderSaveRetryDelay } = await loadRetryPolicy()

  assert.equal(scheduleOrderSaveRetryDelay({ code: 'SCHEDULE_ORDER_SQL_PARAMETER_MISMATCH', status: 503 }, 0), 0)
  assert.equal(scheduleOrderSaveRetryDelay({ code: 'TASK_LIFECYCLE_SCHEMA_MISSING', status: 503 }, 0), 0)
  assert.equal(scheduleOrderSaveRetryDelay({ code: 'INVALID_ORG_ID', status: 400 }, 0), 0)
  assert.equal(scheduleOrderSaveRetryDelay({ status: 500 }, 0), 0)
  assert.equal(scheduleOrderSaveRetryDelay({ status: 503 }, 0), 2_000)
  assert.equal(scheduleOrderSaveRetryDelay({ status: 503 }, 1), 6_000)
  assert.equal(scheduleOrderSaveRetryDelay({ status: 503 }, 2), 18_000)
  assert.equal(scheduleOrderSaveRetryDelay({ status: 503 }, 3), 0)
  assert.equal(scheduleOrderSaveRetryDelay({ code: 'SCHEDULE_CONFLICT_VALIDATION_UNAVAILABLE' }, 0), 2_000)
})
