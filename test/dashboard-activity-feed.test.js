'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const modelModule = import(
  '../web-app/apps/portal-web/src/features/dashboard/activityFeedModel.js'
)

test('aktualności dzielą pełny wpis na osobne START i STOP i sortują od najnowszego', async () => {
  const { buildDashboardActivityFeedItems } = await modelModule
  const items = buildDashboardActivityFeedItems(
    [
      {
        eventId: 'EV-1',
        workerName: 'Anna Kowalska',
        clientName: 'Biuro Horizon',
        activityTypeLabel: 'QR START + STOP',
        startAt: '2026-08-30T06:00:00+02:00',
        endAt: '2026-08-30T10:15:00+02:00',
      },
    ],
    { dayKey: '2026-08-30' },
  )

  assert.deepEqual(items.map((item) => item.phase), ['stop', 'start'])
  assert.deepEqual(items.map((item) => item.actionLabel), [
    'Zarejestrowano QR STOP',
    'Zarejestrowano QR START',
  ])
  assert.deepEqual(items.map((item) => item.statusLabel), ['OK', 'W TOKU'])
})

test('aktualności filtrują ścisły dzień w strefie Europe/Warsaw', async () => {
  const { buildDashboardActivityFeedItems, dashboardActivityFeedDayForTimestamp } = await modelModule
  const boundaryTimestamp = '2026-08-29T22:30:00.000Z'

  assert.equal(dashboardActivityFeedDayForTimestamp(boundaryTimestamp), '2026-08-30')

  const items = buildDashboardActivityFeedItems(
    [
      {
        eventId: 'EV-MIDNIGHT',
        workerName: 'Jan Nowak',
        activityTypeLabel: 'QR START',
        startAt: boundaryTimestamp,
      },
      {
        eventId: 'EV-OLD',
        workerName: 'Jan Nowak',
        activityTypeLabel: 'QR START',
        startAt: '2026-08-29T20:00:00.000Z',
      },
    ],
    { dayKey: '2026-08-30' },
  )

  assert.deepEqual(items.map((item) => item.key), [
    `ev-midnight:start:${new Date(boundaryTimestamp).getTime()}`,
  ])
})

test('event i workday reprezentujące tę samą fazę nie dublują wpisu', async () => {
  const { buildDashboardActivityFeedItems } = await modelModule
  const rows = [
    {
      eventId: 'EVENT-20',
      workdayId: 'WORKDAY-20',
      workerName: 'Sabina Dudek',
      clientName: 'Best Clean',
      activityTypeLabel: 'QR START',
      startAt: '2026-08-30T08:00:00+02:00',
    },
    {
      id: 'WORKDAY-20',
      workdayId: 'WORKDAY-20',
      workerName: 'Sabina Dudek',
      clientName: 'Best Clean',
      activityTypeLabel: 'QR START',
      startAt: '2026-08-30T08:00:00+02:00',
    },
  ]

  const items = buildDashboardActivityFeedItems(rows, { dayKey: '2026-08-30' })

  assert.equal(items.length, 1)
  assert.equal(items[0].actorLabel, 'Sabina Dudek')
})

test('QR STOP bez odrębnego początku tworzy tylko wpis końcowy', async () => {
  const { buildDashboardActivityFeedItems } = await modelModule
  const items = buildDashboardActivityFeedItems(
    [
      {
        eventId: 'STOP-1',
        workerName: 'Marek Zieliński',
        activityTypeLabel: 'QR STOP',
        startAt: '2026-08-30T12:00:00+02:00',
        endAt: '2026-08-30T12:00:00+02:00',
      },
    ],
    { dayKey: '2026-08-30' },
  )

  assert.equal(items.length, 1)
  assert.equal(items[0].phase, 'stop')
  assert.equal(items[0].actionLabel, 'Zarejestrowano QR STOP')
})

test('filtry rozdzielają pracowników, zlecenia, pojazdy i system', async () => {
  const { buildDashboardActivityFeedItems, filterDashboardActivityFeedItems } = await modelModule
  const items = buildDashboardActivityFeedItems(
    [
      { eventId: 'E1', workerName: 'A', activityTypeLabel: 'QR START', startAt: '2026-08-30T08:00:00+02:00' },
      { eventId: 'E2', workerName: 'B', activityTypeLabel: 'CLEAN', startAt: '2026-08-30T08:10:00+02:00' },
      { eventId: 'E3', vehicleId: 'V1', vehicleName: 'Ford Transit', activityTypeLabel: 'Pojazd', startAt: '2026-08-30T08:20:00+02:00' },
      { eventId: 'E4', workerName: 'C', activityTypeLabel: 'QR START', status: 'REVIEW', startAt: '2026-08-30T08:30:00+02:00' },
    ],
    { dayKey: '2026-08-30' },
  )

  assert.equal(filterDashboardActivityFeedItems(items, 'all').length, 4)
  assert.deepEqual(filterDashboardActivityFeedItems(items, 'workers').map((item) => item.key), [items[3].key])
  assert.equal(filterDashboardActivityFeedItems(items, 'orders').length, 1)
  assert.equal(filterDashboardActivityFeedItems(items, 'vehicles').length, 1)
  assert.equal(filterDashboardActivityFeedItems(items, 'system').length, 1)
  assert.deepEqual(filterDashboardActivityFeedItems(items, 'unknown'), [])
})
