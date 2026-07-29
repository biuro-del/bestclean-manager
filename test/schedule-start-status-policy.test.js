'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const policyModule = import(
  '../web-app/apps/portal-web/src/services/scheduleStartStatusPolicy.js'
)

test('plan pozostaje w buforze dokładnie 10 minut po planowanym starcie', async () => {
  const { isScheduleStartOverdue } = await policyModule
  const plannedStartTs = Date.parse('2026-07-27T08:00:00+02:00')

  assert.equal(
    isScheduleStartOverdue({
      plannedStartTs,
      nowTs: plannedStartTs + 10 * 60 * 1000,
    }),
    false,
  )
})

test('brak startu po przekroczeniu 10 minut tworzy status alarmowy', async () => {
  const { isScheduleStartOverdue } = await policyModule
  const plannedStartTs = Date.parse('2026-07-27T08:00:00+02:00')

  assert.equal(
    isScheduleStartOverdue({
      plannedStartTs,
      nowTs: plannedStartTs + 10 * 60 * 1000 + 1,
    }),
    true,
  )
})

test('faktyczny start usuwa status alarmowy także po terminie', async () => {
  const { isScheduleStartOverdue } = await policyModule
  const plannedStartTs = Date.parse('2026-07-27T08:00:00+02:00')

  assert.equal(
    isScheduleStartOverdue({
      plannedStartTs,
      actualStartTs: plannedStartTs + 12 * 60 * 1000,
      nowTs: plannedStartTs + 20 * 60 * 1000,
    }),
    false,
  )
})

test('ukończone zlecenie nie wraca do alarmu braku startu', async () => {
  const { isScheduleStartOverdue } = await policyModule
  const plannedStartTs = Date.parse('2026-07-27T08:00:00+02:00')

  assert.equal(
    isScheduleStartOverdue({
      plannedStartTs,
      completed: true,
      nowTs: plannedStartTs + 60 * 60 * 1000,
    }),
    false,
  )
})

test('brak wiarygodnej godziny planu nie tworzy alarmu', async () => {
  const { isScheduleStartOverdue } = await policyModule

  assert.equal(isScheduleStartOverdue({ plannedStartTs: 0, nowTs: Date.now() }), false)
})
