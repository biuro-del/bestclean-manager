'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const modelModule = import(
  '../web-app/apps/portal-web/src/features/reports/reportEventAccountingModel.js'
)

test('otwarty Event nie wnosi raw durationSec do sum raportu', async () => {
  const { reportClosedSessionDurationSec, reportHasClosedSession } = await modelModule
  const row = {
    eventId: 'EV-OPEN',
    startAt: '2026-07-23T17:42:00.000Z',
    endAt: null,
    status: 'CLOSED',
    durationSec: 208 * 3600 + 51 * 60,
  }

  assert.equal(reportHasClosedSession(row), false)
  assert.equal(reportClosedSessionDurationSec(row), 0)
})

test('raport liczy rzeczywista pare START-STOP zamiast zapisanej blednej sumy', async () => {
  const { reportClosedSessionDurationSec, reportHasClosedSession } = await modelModule
  const row = {
    eventId: 'EV-CLOSED',
    startAt: '2026-07-23T12:47:00.000Z',
    endAt: '2026-07-23T15:02:00.000Z',
    durationSec: 208 * 3600 + 51 * 60,
  }

  assert.equal(reportHasClosedSession(row), true)
  assert.equal(reportClosedSessionDurationSec(row), 2 * 3600 + 15 * 60)
})

test('raport odrzuca sesje dluzsza niz 24 godziny', async () => {
  const { reportClosedSessionDurationSec } = await modelModule
  assert.equal(reportClosedSessionDurationSec({
    startAt: '2026-07-23T08:00:00.000Z',
    endAt: '2026-07-24T08:00:01.000Z',
  }), 0)
})

test('wiersz legacy Workday nie jest traktowany jak zamknieta sesja Event', async () => {
  const { reportClosedSessionDurationSec, reportHasClosedSession } = await modelModule
  const workdayMarker = {
    eventId: 'WD-LEGACY',
    workdayId: 'WD-LEGACY',
    historySourceKind: 'workday',
    hasExplicitEventId: false,
    startAt: '2026-07-23T08:00:00.000Z',
    endAt: '2026-07-23T20:00:00.000Z',
    durationSec: 12 * 3600,
  }

  assert.equal(reportClosedSessionDurationSec(workdayMarker), 0)
  assert.equal(reportHasClosedSession(workdayMarker), false)
})
