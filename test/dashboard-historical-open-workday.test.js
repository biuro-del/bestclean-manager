'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const modelModule = import(
  '../web-app/apps/portal-web/src/features/dashboard/historicalOpenWorkdayModel.js'
)

test('zamknięcie zwykłego zdarzenia QR nie ukrywa otwartego dnia pracy', async () => {
  const { rowHasWorkdayStop } = await modelModule

  assert.equal(
    rowHasWorkdayStop({
      historySourceKind: 'event',
      hasExplicitEventId: true,
      eventId: 'EV-1',
      workdayId: 'WD-1',
      endAt: '2026-07-06T15:44:06.016Z',
      closeMarkedAt: '2026-07-06T15:44:06.016Z',
      status: 'CLOSED',
      endReason: 'QR_SAME',
    }),
    false,
  )
})

test('jednoznaczny STOP dnia zamyka dzień także w rekordzie zdarzenia', async () => {
  const { rowHasWorkdayStop } = await modelModule

  assert.equal(
    rowHasWorkdayStop({
      historySourceKind: 'event',
      eventId: 'EV-2',
      workdayId: 'WD-1',
      endAt: '2026-07-06T18:00:00.000Z',
      status: 'CLOSED',
      endReason: 'STOP_END_DAY',
    }),
    true,
  )
})

test('zamknięty rekord dnia pracy jest rozpoznawany po endAt', async () => {
  const { rowHasWorkdayStop } = await modelModule

  assert.equal(
    rowHasWorkdayStop({
      historySourceKind: 'workday',
      eventId: 'WD-1',
      workdayId: 'WD-1',
      endAt: '2026-07-06T18:00:00.000Z',
      status: 'CLOSED',
    }),
    true,
  )
})

test('otwarty rekord dnia bez STOP pozostaje otwarty', async () => {
  const { isHistoricalOpenWorkday, rowHasWorkdayStop } = await modelModule

  const row = {
    historySourceKind: 'workday',
    eventId: 'WD-1',
    workdayId: 'WD-1',
    startAt: '2026-07-06T08:00:00.000Z',
    status: 'RUNNING',
  }
  assert.equal(rowHasWorkdayStop(row), false)
  assert.equal(isHistoricalOpenWorkday(row, '2026-07-24', '2026-07-06'), true)
})

test('otwarty dzień dzisiejszy nie trafia do zaległych braków STOP', async () => {
  const { isHistoricalOpenWorkday } = await modelModule

  assert.equal(
    isHistoricalOpenWorkday(
      {
        historySourceKind: 'workday',
        workdayId: 'WD-2',
        status: 'RUNNING',
      },
      '2026-07-24',
      '2026-07-24',
    ),
    false,
  )
})
