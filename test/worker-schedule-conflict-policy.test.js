'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const {
  WORKER_SCHEDULE_CONFLICT_CODE,
  assertNoWorkerScheduleLocationConflicts,
  findWorkerScheduleLocationConflicts,
  isScheduleOrderActive,
  normalizeScheduleOrderLifecycleStatus,
  orderOccursOnDay,
} = require('../worker-schedule-conflict-policy')

function order({
  id,
  clientId,
  clientName,
  dateYmd = '2026-07-27',
  startTime = '08:00',
  endTime = '09:00',
  workerId = 'W001',
  workerName = 'Dudek Rafał',
  scheduleMode = 'once',
  repeatEvery = 1,
  repeatUnit = 'day',
  repeatWeekdays = [],
  recurrenceSkippedDates = [],
  lifecycleStatus = 'ACTIVE',
} = {}) {
  const blockId = `block-${id}`
  const allocation = {
    workerId,
    name: workerName,
    serviceBlockId: blockId,
    allocationId: 'slot-1',
    workSlotKey: `slot:${blockId}:slot-1`,
    dateYmd,
    startTime,
    endTime,
  }
  return {
    id,
    clientId,
    clientName,
    dateYmd,
    endDateYmd: dateYmd,
    startTime,
    endTime,
    scheduleMode,
    repeatEvery,
    repeatUnit,
    repeatWeekdays,
    recurrenceSkippedDates,
    lifecycleStatus,
    workAllocations: [allocation],
    serviceBlocks: [
      {
        id: blockId,
        scheduleMode,
        weekdays: repeatWeekdays,
        dateYmd,
        startTime,
        endTime,
        workAllocations: [allocation],
      },
    ],
  }
}

test('wykrywa kolizję W001 między stałym Best Clean i jednorazowym zleceniem w innym obiekcie', () => {
  const regular = order({
    id: 'regular-best-clean',
    clientId: 'Best Clean',
    clientName: 'Best Clean',
    dateYmd: '2026-07-15',
    startTime: '08:30',
    endTime: '16:30',
    scheduleMode: 'repeat',
    repeatUnit: 'week',
    repeatWeekdays: [1, 2, 3, 4, 5],
  })
  const e2e = order({
    id: 'codex-e2e-20260727-w001-lk003-bc1234',
    clientId: 'LK003',
    clientName: 'AS Michał Herman [Activ Space]',
    startTime: '10:27',
    endTime: '11:37',
  })

  const conflicts = findWorkerScheduleLocationConflicts([regular, e2e], {
    nowYmd: '2026-07-27',
    horizonDays: 1,
  })

  assert.equal(conflicts.length, 1)
  assert.equal(conflicts[0].workerId, 'W001')
  assert.equal(conflicts[0].dateYmd, '2026-07-27')
  assert.equal(conflicts[0].left.locationLabel, 'Best Clean')
  assert.equal(conflicts[0].right.locationLabel, 'AS Michał Herman [Activ Space]')
  assert.throws(
    () => assertNoWorkerScheduleLocationConflicts([regular, e2e], {
      nowYmd: '2026-07-27',
      horizonDays: 1,
    }),
    (error) => {
      assert.equal(error.statusCode, 409)
      assert.equal(error.publicCode, WORKER_SCHEDULE_CONFLICT_CODE)
      assert.match(error.publicMessage, /Dudek Rafał/)
      assert.match(error.publicMessage, /Best Clean/)
      assert.match(error.publicMessage, /AS Michał Herman/)
      return true
    },
  )
})

test('sąsiadujące przedziały czasu nie są kolizją', () => {
  const first = order({
    id: 'first',
    clientId: 'A',
    clientName: 'Obiekt A',
    startTime: '08:00',
    endTime: '10:00',
  })
  const second = order({
    id: 'second',
    clientId: 'B',
    clientName: 'Obiekt B',
    startTime: '10:00',
    endTime: '12:00',
  })
  assert.deepEqual(
    findWorkerScheduleLocationConflicts([first, second], {
      nowYmd: '2026-07-27',
      horizonDays: 1,
    }),
    [],
  )
})

test('dwa zakresy na tym samym obiekcie nie tworzą fałszywej kolizji lokalizacji', () => {
  const first = order({
    id: 'same-site-a',
    clientId: 'LK001',
    clientName: 'Ten sam obiekt',
    startTime: '08:00',
    endTime: '11:00',
  })
  const second = order({
    id: 'same-site-b',
    clientId: 'LK001',
    clientName: 'Ten sam obiekt',
    startTime: '09:00',
    endTime: '10:00',
  })
  assert.deepEqual(
    findWorkerScheduleLocationConflicts([first, second], {
      nowYmd: '2026-07-27',
      horizonDays: 1,
    }),
    [],
  )
})

test('cykl tygodniowy jest sprawdzany również przeciw odległemu zleceniu jednorazowemu', () => {
  const recurring = order({
    id: 'weekly',
    clientId: 'A',
    clientName: 'Obiekt A',
    dateYmd: '2026-07-27',
    startTime: '08:00',
    endTime: '12:00',
    scheduleMode: 'repeat',
    repeatUnit: 'week',
    repeatWeekdays: [1],
  })
  const future = order({
    id: 'future-once',
    clientId: 'B',
    clientName: 'Obiekt B',
    dateYmd: '2028-07-31',
    startTime: '09:00',
    endTime: '10:00',
  })

  assert.equal(orderOccursOnDay(recurring, '2028-07-31'), true)
  assert.equal(
    findWorkerScheduleLocationConflicts([recurring, future], {
      nowYmd: '2026-07-27',
      horizonDays: 10,
    }).length,
    1,
  )
})

test('pominięty dzień cyklu nie blokuje jednorazowego zlecenia', () => {
  const recurring = order({
    id: 'weekly-skipped',
    clientId: 'A',
    clientName: 'Obiekt A',
    dateYmd: '2026-07-27',
    startTime: '08:00',
    endTime: '12:00',
    scheduleMode: 'repeat',
    repeatUnit: 'week',
    repeatWeekdays: [1],
    recurrenceSkippedDates: ['2026-08-03'],
  })
  const replacement = order({
    id: 'replacement',
    clientId: 'B',
    clientName: 'Obiekt B',
    dateYmd: '2026-08-03',
    startTime: '09:00',
    endTime: '10:00',
  })

  assert.equal(orderOccursOnDay(recurring, '2026-08-03'), false)
  assert.deepEqual(
    findWorkerScheduleLocationConflicts([recurring, replacement], {
      nowYmd: '2026-07-27',
      horizonDays: 10,
    }),
    [],
  )
})

test('backend zapisuje harmonogram dopiero po blokadzie organizacji i walidacji konfliktów', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
  const lockIndex = source.indexOf("pg_advisory_xact_lock(hashtext($1), hashtext('portal_schedule_orders'))")
  const validationIndex = source.indexOf('assertNoWorkerScheduleLocationConflicts(', lockIndex)
  const upsertIndex = source.indexOf('await upsertPortalScheduleOrderTask(client, row)', validationIndex)

  assert.ok(lockIndex > 0)
  assert.ok(validationIndex > lockIndex)
  assert.ok(upsertIndex > validationIndex)
})

test('frontend nie może zapisać zleceń przez Data Connect z pominięciem walidacji backendu', () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'web-app',
      'apps',
      'portal-web',
      'src',
      'services',
      'scheduleTaskDataConnectService.js',
    ),
    'utf8',
  )
  const functionStart = source.indexOf('export async function upsertScheduleTasks(')
  const functionEnd = source.indexOf('export async function deleteScheduleTasks(', functionStart)
  const upsertBody = source.slice(functionStart, functionEnd)

  assert.match(upsertBody, /return upsertScheduleTasksViaBackend\(normalizedOrgId, sourceOrders\)/)
  assert.doesNotMatch(upsertBody, /upsertScheduleTasksViaDataConnect/)
})

test('anulowane zlecenie nie blokuje aktywnego planu w innym obiekcie', () => {
  const active = order({
    id: 'active-best-clean',
    clientId: 'BEST-CLEAN',
    clientName: 'Best Clean',
    startTime: '08:00',
    endTime: '12:00',
  })
  const cancelled = order({
    id: 'cancelled-e2e',
    clientId: 'LK003',
    clientName: 'AS Michal Herman',
    startTime: '09:00',
    endTime: '10:00',
    lifecycleStatus: 'CANCELLED',
  })

  assert.equal(isScheduleOrderActive(active), true)
  assert.equal(isScheduleOrderActive(cancelled), false)
  assert.deepEqual(
    findWorkerScheduleLocationConflicts([active, cancelled], {
      nowYmd: '2026-07-27',
      horizonDays: 1,
    }),
    [],
  )
})

test('archiwalne zlecenie jest nieaktywne, a alias CANCELED jest normalizowany', () => {
  assert.equal(normalizeScheduleOrderLifecycleStatus('canceled'), 'CANCELLED')
  assert.equal(isScheduleOrderActive({ id: 'archived', lifecycleStatus: 'ARCHIVED' }), false)
  assert.equal(isScheduleOrderActive({ id: 'legacy-cancelled', canceledAt: '2026-07-27T10:00:00Z' }), false)
  assert.equal(isScheduleOrderActive({ id: 'unknown', lifecycleStatus: 'UNKNOWN' }), true)
})

test('zmiana statusu zlecenia jest wykonywana po dokladnym ID w transakcji', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
  const patchIndex = source.lastIndexOf("if (method === 'PATCH')")
  const transactionIndex = source.indexOf("await client.query('begin')", patchIndex)
  const lockIndex = source.indexOf("pg_advisory_xact_lock(hashtext($1), hashtext('portal_schedule_orders'))", transactionIndex)
  const exactIdsIndex = source.indexOf('id_task = any($2::varchar[])', lockIndex)
  const validationIndex = source.indexOf('assertNoWorkerScheduleLocationConflicts(savedOrders)', exactIdsIndex)
  const commitIndex = source.indexOf("await client.query('commit')", validationIndex)

  assert.ok(patchIndex > 0)
  assert.ok(transactionIndex > patchIndex)
  assert.ok(lockIndex > transactionIndex)
  assert.ok(exactIdsIndex > lockIndex)
  assert.ok(validationIndex > exactIdsIndex)
  assert.ok(commitIndex > validationIndex)
})

test('migracja cyklu zycia Task jest addytywna i ogranicza do trzech statusow', () => {
  const migration = fs.readFileSync(
    path.join(__dirname, '..', 'dataconnect', 'migrations', '20260727_task_lifecycle_additive.sql'),
    'utf8',
  )

  assert.match(migration, /\bbegin;/i)
  assert.match(migration, /add column if not exists lifecycle_status varchar\(20\)/i)
  assert.match(migration, /set lifecycle_status = 'ACTIVE'/i)
  assert.match(migration, /check \(lifecycle_status in \('ACTIVE', 'CANCELLED', 'ARCHIVED'\)\)/i)
  assert.match(migration, /\bcommit;/i)
  assert.doesNotMatch(migration, /\bdrop\s+(table|column)\b/i)
})

test('kalendarz udostepnia anulowanie bez twardego usuwania rekordu', () => {
  const calendarSource = fs.readFileSync(
    path.join(__dirname, '..', 'web-app', 'apps', 'portal-web', 'src', 'features', 'calendar', 'index.js'),
    'utf8',
  )
  const serviceSource = fs.readFileSync(
    path.join(__dirname, '..', 'web-app', 'apps', 'portal-web', 'src', 'services', 'scheduleTaskDataConnectService.js'),
    'utf8',
  )

  assert.match(calendarSource, /data-calendar-task-context-action="cancel-order"/)
  assert.match(calendarSource, /ordersSetTimelineOrderLifecycleStatus\(/)
  assert.match(calendarSource, /'CANCELLED'/)
  assert.match(serviceSource, /method:\s*'PATCH'/)
  assert.match(serviceSource, /updatedOrderIds/)
})
