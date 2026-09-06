'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  WORKFORCE_SCHEDULE_DB_AUTH_TYPES,
  resolveWorkforceScheduleDbAuthType,
} = require('../workforce-schedule-db-auth')

test('Grafik akceptuje wylacznie jawny PASSWORD', () => {
  assert.equal(resolveWorkforceScheduleDbAuthType('password'), WORKFORCE_SCHEDULE_DB_AUTH_TYPES.PASSWORD)
})

test('brak dedykowanego trybu auth Grafiku zatrzymuje konfiguracje', () => {
  assert.throws(
    () => resolveWorkforceScheduleDbAuthType(''),
    (error) => error?.statusCode === 503
      && error?.publicCode === 'WORKFORCE_SCHEDULE_DB_AUTH_TYPE_MISSING',
  )
})

test('nieznany tryb auth Grafiku jest fail-closed i nie trafia do bledu', () => {
  const sensitiveValue = 'PASSWORD database-secret=do-not-log'
  assert.throws(
    () => resolveWorkforceScheduleDbAuthType(sensitiveValue),
    (error) => {
      assert.equal(error?.statusCode, 503)
      assert.equal(error?.publicCode, 'WORKFORCE_SCHEDULE_DB_AUTH_TYPE_INVALID')
      assert.doesNotMatch(JSON.stringify(error), /database-secret|do-not-log/)
      return true
    },
  )
})

test('IAM jest fail-closed dopoki Grafik korzysta z natywnego loginu PostgreSQL', () => {
  assert.throws(
    () => resolveWorkforceScheduleDbAuthType('IAM'),
    (error) => error?.statusCode === 503
      && error?.publicCode === 'WORKFORCE_SCHEDULE_DB_AUTH_TYPE_INVALID',
  )
})
