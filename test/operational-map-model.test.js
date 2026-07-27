'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const modelModule = import(
  '../web-app/apps/portal-web/src/features/dashboard/operationalMapModel.js'
)

test('status pozostaje zaplanowany do konca 10-minutowego bufora', async () => {
  const { resolveOperationalMapStatus } = await modelModule
  const plannedStartTs = Date.parse('2026-07-27T08:00:00+02:00')

  assert.deepEqual(
    resolveOperationalMapStatus({
      plannedStartTs,
      nowTs: plannedStartTs + 10 * 60 * 1000,
    }),
    { status: 'planned', delayMinutes: 0 },
  )
})

test('status jest alarmowy po przekroczeniu 10 minut bez dokladnego wykonania', async () => {
  const { resolveOperationalMapStatus } = await modelModule
  const plannedStartTs = Date.parse('2026-07-27T08:00:00+02:00')

  assert.deepEqual(
    resolveOperationalMapStatus({
      plannedStartTs,
      nowTs: plannedStartTs + 12 * 60 * 1000,
    }),
    { status: 'late', delayMinutes: 12 },
  )
})

test('dokladne rozpoczecie i zakonczenie zmieniaja status planu', async () => {
  const { resolveOperationalMapStatus } = await modelModule
  const plannedStartTs = Date.parse('2026-07-27T08:00:00+02:00')

  assert.equal(
    resolveOperationalMapStatus({
      plannedStartTs,
      actualStartTs: plannedStartTs + 12 * 60 * 1000,
      nowTs: plannedStartTs + 20 * 60 * 1000,
      hasExactExecutionMatch: true,
    }).status,
    'active',
  )
  assert.equal(
    resolveOperationalMapStatus({
      plannedStartTs,
      actualStartTs: plannedStartTs + 12 * 60 * 1000,
      actualStopTs: plannedStartTs + 60 * 60 * 1000,
      nowTs: plannedStartTs + 90 * 60 * 1000,
      hasExactExecutionMatch: true,
    }).status,
    'finished',
  )
})

test('osoby sa grupowane przy obiekcie tylko po zapisanym clientId', async () => {
  const { groupOperationalMapLocations } = await modelModule
  const result = groupOperationalMapLocations([
    { workerKey: 'W001', clientId: 'C100', objectLabel: 'Best Clean' },
    { workerKey: 'W002', clientId: 'C100', objectLabel: 'Best Clean' },
    { workerKey: 'W003', clientId: '', objectLabel: 'Best Clean' },
    { workerKey: 'W004', clientId: 'C200', objectLabel: 'Inny obiekt' },
  ])

  assert.equal(result.groups.length, 1)
  assert.equal(result.groups[0].key, 'client:C100')
  assert.deepEqual(
    result.groups[0].locations.map((location) => location.workerKey),
    ['W001', 'W002'],
  )
  assert.deepEqual(
    result.standalone.map((location) => location.workerKey).sort(),
    ['W003', 'W004'],
  )
})

test('domyslny awatar respektuje jawna plec pracownika', async () => {
  const { resolveOperationalMapAvatarKind } = await modelModule

  assert.equal(
    resolveOperationalMapAvatarKind({ gender: 'female', workerName: 'Jan Kowalski' }),
    'female',
  )
  assert.equal(
    resolveOperationalMapAvatarKind({ plec: 'mężczyzna', workerName: 'Anna Nowak' }),
    'male',
  )
})

test('domyslny awatar rozpoznaje typowe polskie imie', async () => {
  const { resolveOperationalMapAvatarKind } = await modelModule

  assert.equal(resolveOperationalMapAvatarKind({ workerName: 'Marta Cisak' }), 'female')
  assert.equal(resolveOperationalMapAvatarKind({ workerName: 'Cisak Marta' }), 'female')
  assert.equal(resolveOperationalMapAvatarKind({ workerName: 'Rafał Dudek' }), 'male')
  assert.equal(resolveOperationalMapAvatarKind({ workerName: 'Kuba Nowak' }), 'male')
})

test('podsumowanie live obiektu liczy statusy i unikalne strefy', async () => {
  const { buildOperationalMapObjectLiveSummary } = await modelModule
  const summary = buildOperationalMapObjectLiveSummary([
    { workerKey: 'W001', workStatus: 'active', serviceBlockId: 'ZONE-1' },
    { workerKey: 'W002', workStatus: 'planned', serviceBlockId: 'ZONE-1' },
    { workerKey: 'W003', workStatus: 'finished', serviceBlockId: 'ZONE-2' },
    { workerKey: 'W004', workStatus: 'late', serviceBlockId: 'ZONE-3' },
  ])

  assert.deepEqual(summary.statusCounts, {
    active: 1,
    planned: 1,
    finished: 1,
    late: 1,
  })
  assert.equal(summary.zoneTotal, 3)
  assert.equal(summary.zoneDone, 1)
  assert.equal(summary.objectProgress, 33)
  assert.equal(summary.zoneSummary, '1/3 stref')
})

test('strefa nie jest zakonczona dopoki wszystkie przypisane osoby jej nie zakoncza', async () => {
  const { buildOperationalMapObjectLiveSummary } = await modelModule
  const summary = buildOperationalMapObjectLiveSummary([
    { workerKey: 'W001', workStatus: 'finished', serviceBlockId: 'ZONE-1' },
    { workerKey: 'W002', workStatus: 'active', serviceBlockId: 'ZONE-1' },
  ])

  assert.equal(summary.zoneTotal, 1)
  assert.equal(summary.zoneDone, 0)
  assert.equal(summary.objectProgress, 0)
})
