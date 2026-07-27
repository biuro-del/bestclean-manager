'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const integrityModule = import('../web-app/apps/portal-web/src/services/openEventIntegrity.js')

function openEvent(overrides = {}) {
  return {
    eventId: 'EV-1',
    workdayId: 'WD-1',
    historySourceKind: 'event',
    hasExplicitEventId: true,
    workerLogin: 'marta.cisak',
    workerName: 'Marta Cisak',
    zoneId: 'BC0001',
    eventType: 'CLEAN',
    status: 'RUNNING',
    startAt: '2026-07-23T07:00:00.000Z',
    endAt: null,
    ...overrides,
  }
}

test('grupuje rozne otwarte CLEAN tej samej osoby jako jeden konflikt', async () => {
  const { groupOpenCleanEventConflicts } = await integrityModule
  const groups = groupOpenCleanEventConflicts([
    openEvent(),
    openEvent({ eventId: 'EV-2', workdayId: 'WD-2', zoneId: 'BC0002' }),
  ])

  assert.equal(groups.length, 1)
  assert.equal(groups[0].count, 2)
  assert.deepEqual(groups[0].recordIds, ['EV-1', 'EV-2'])
})

test('nie liczy zamknietych CLEAN ani lustrzanego rekordu workday', async () => {
  const { groupOpenCleanEventConflicts } = await integrityModule
  const groups = groupOpenCleanEventConflicts([
    openEvent(),
    openEvent({
      eventId: 'EV-CLOSED',
      status: 'CLOSED',
      endAt: '2026-07-23T08:00:00.000Z',
    }),
    openEvent({
      eventId: 'WD-MIRROR',
      historySourceKind: 'workday',
      hasExplicitEventId: false,
    }),
  ])

  assert.deepEqual(groups, [])
})

test('rekord bez endAt pozostaje otwarty mimo niestandardowego statusu lub closeMarkedAt', async () => {
  const { isOpenCleanEvent } = await integrityModule

  assert.equal(
    isOpenCleanEvent(openEvent({ status: ' paused ', closeMarkedAt: '2026-07-23T08:00:00.000Z' })),
    true,
  )
  assert.equal(
    isOpenCleanEvent(openEvent({ status: ' CLOSED ', endAt: null })),
    false,
  )
})

test('pusty eventType z jednoznacznie zamkniętym Workday trafia do przeglądu i nie blokuje CLEAN', async () => {
  const {
    findBlockingOpenEventForWorker,
    groupLegacyOpenEventCandidates,
    isLegacyOpenEventCandidate,
    isOpenCleanEvent,
  } = await integrityModule
  const legacy = openEvent({
    eventType: null,
    linkedWorkdayFound: true,
    linkedWorkdayMatchesWorker: true,
    linkedWorkdayStatus: 'CLOSED',
    linkedWorkdayEndAt: '2026-07-23T08:00:00.000Z',
  })

  assert.equal(isOpenCleanEvent(legacy), false)
  assert.equal(isLegacyOpenEventCandidate(legacy), true)
  assert.equal(groupLegacyOpenEventCandidates([legacy])[0]?.count, 1)
  assert.equal(findBlockingOpenEventForWorker([legacy], { workerLogin: 'marta.cisak' }), null)
})

test('pusty eventType bez zamknietego, jednoznacznego Workday blokuje nowy CLEAN', async () => {
  const {
    findBlockingOpenEventForWorker,
    groupLegacyOpenEventCandidates,
    groupUnresolvedLegacyOpenEvents,
    isUnresolvedLegacyOpenEvent,
  } = await integrityModule
  const unresolved = openEvent({
    eventType: null,
    linkedWorkdayFound: false,
    linkedWorkdayStatus: '',
    linkedWorkdayEndAt: null,
  })

  assert.equal(isUnresolvedLegacyOpenEvent(unresolved), true)
  assert.deepEqual(groupLegacyOpenEventCandidates([unresolved]), [])
  assert.equal(groupUnresolvedLegacyOpenEvents([unresolved])[0]?.count, 1)
  assert.equal(
    findBlockingOpenEventForWorker([unresolved], { workerLogin: 'MARTA.CISAK' })?.eventId,
    'EV-1',
  )
})

test('zamkniety Workday innej osoby nie zwalnia nierozstrzygnietego Eventu', async () => {
  const { isUnresolvedLegacyOpenEvent } = await integrityModule
  const wrongWorkerLink = openEvent({
    eventType: null,
    linkedWorkdayFound: true,
    linkedWorkdayMatchesWorker: false,
    linkedWorkdayStatus: 'CLOSED',
    linkedWorkdayEndAt: '2026-07-23T08:00:00.000Z',
  })

  assert.equal(isUnresolvedLegacyOpenEvent(wrongWorkerLink), true)
})

test('ten sam eventId nie jest liczony dwa razy', async () => {
  const { groupOpenCleanEventConflicts } = await integrityModule
  const groups = groupOpenCleanEventConflicts([
    openEvent(),
    openEvent({ zoneId: 'BC0099' }),
  ])

  assert.deepEqual(groups, [])
})

test('pojedynczy jawny CLEAN bez aktywnego powiazanego Workday jest widoczny jako orphan', async () => {
  const { groupOrphanOpenCleanEvents, isOrphanOpenCleanEvent } = await integrityModule
  const orphan = openEvent({
    linkedWorkdayFound: false,
    linkedWorkdayMatchesWorker: false,
  })

  assert.equal(isOrphanOpenCleanEvent(orphan), true)
  assert.equal(groupOrphanOpenCleanEvents([orphan])[0]?.count, 1)
})

test('pojedynczy jawny CLEAN z aktywnym Workday nie jest alarmem, a duplikat trafia do konfliktu', async () => {
  const { groupOpenCleanEventConflicts, groupOrphanOpenCleanEvents } = await integrityModule
  const active = openEvent({
    linkedWorkdayFound: true,
    linkedWorkdayMatchesWorker: true,
    linkedWorkdayStatus: 'RUNNING',
    linkedWorkdayEndAt: null,
  })
  const duplicate = openEvent({
    eventId: 'EV-2',
    workdayId: 'WD-2',
    linkedWorkdayFound: false,
    linkedWorkdayMatchesWorker: false,
  })

  assert.deepEqual(groupOrphanOpenCleanEvents([active]), [])
  assert.deepEqual(groupOrphanOpenCleanEvents([active, duplicate]), [])
  assert.equal(groupOpenCleanEventConflicts([active, duplicate])[0]?.count, 2)
})

test('wyszukiwanie otwartego CLEAN respektuje stabilny login i wykluczenie edytowanego rekordu', async () => {
  const { findOpenCleanEventForWorker } = await integrityModule
  const rows = [
    openEvent(),
    openEvent({ eventId: 'EV-OTHER', workerLogin: 'inna.osoba' }),
  ]

  assert.equal(
    findOpenCleanEventForWorker(rows, { workerLogin: 'MARTA.CISAK' })?.eventId,
    'EV-1',
  )
  assert.equal(
    findOpenCleanEventForWorker(rows, { workerLogin: 'marta.cisak' }, { excludeRecordIds: ['EV-1'] }),
    null,
  )
})
