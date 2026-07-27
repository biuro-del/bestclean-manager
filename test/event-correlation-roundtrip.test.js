'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')

async function importModule(relativePath) {
  const absolutePath = path.join(root, ...relativePath)
  return import(pathToFileURL(absolutePath).href)
}

test('niezmienione pole START zachowuje sekundy i milisekundy źródłowego Eventu', async () => {
  const { preserveUnchangedEventTimestamp } = await importModule([
    'web-app',
    'apps',
    'portal-web',
    'src',
    'features',
    'events',
    'eventTimePolicy.js',
  ])
  const original = '2026-07-24T05:04:23.456Z'

  assert.equal(
    preserveUnchangedEventTimestamp({
      inputValue: '2026-07-24T07:04',
      parsedInputTimestamp: '2026-07-24T05:04:00.000Z',
      originalTimestamp: original,
      formattedOriginalValue: '2026-07-24T07:04',
    }),
    original,
  )
  assert.equal(
    preserveUnchangedEventTimestamp({
      inputValue: '2026-07-24T07:05',
      parsedInputTimestamp: '2026-07-24T05:05:00.000Z',
      originalTimestamp: original,
      formattedOriginalValue: '2026-07-24T07:04',
    }),
    '2026-07-24T05:05:00.000Z',
  )
})

test('backup zachowuje jawny zestaw pól korelacji do przyszłego restore serwerowego', async () => {
  const { EVENT_CORRELATION_BACKUP_FIELDS } = await importModule([
    'web-app',
    'apps',
    'portal-web',
    'src',
    'services',
    'eventBackupPolicy.js',
  ])
  assert.deepEqual(EVENT_CORRELATION_BACKUP_FIELDS, [
    'taskId',
    'occurrenceDateYmd',
    'serviceBlockId',
    'allocationId',
    'workSlotKey',
    'eventType',
    'matchStatus',
    'matchMethod',
    'matchReason',
    'matchedAt',
    'planSnapshotVersion',
    'plannedStartAt',
    'plannedEndAt',
    'plannedDurationMinutes',
    'taskUpdatedAtSnapshot',
  ])
})

test('identyfikatory planu są porównywane z wielkością liter, a login pracownika bez niej', async () => {
  const { eventCorrelationIdentityChanged } = await importModule([
    'web-app',
    'apps',
    'portal-web',
    'src',
    'services',
    'eventCorrelationIdentityPolicy.js',
  ])
  const baseline = {
    workdayId: 'WD-AbC',
    zoneId: 'ZONE-XyZ',
    workerLogin: 'Worker@Example.com',
    startAt: '2026-07-24T05:04:23.456Z',
  }

  assert.equal(
    eventCorrelationIdentityChanged(baseline, {
      ...baseline,
      workerLogin: 'worker@example.com',
      startAt: '2026-07-24T07:04:23.456+02:00',
    }),
    false,
  )
  assert.equal(
    eventCorrelationIdentityChanged(baseline, { ...baseline, workdayId: 'wd-abc' }),
    true,
  )
  assert.equal(
    eventCorrelationIdentityChanged(baseline, { ...baseline, zoneId: 'zone-xyz' }),
    true,
  )
})

test('restore odrzuca niejawny typ otwartego Eventu i duplikat CLEAN pracownika', async () => {
  const { validateEventRestoreRows } = await importModule([
    'web-app',
    'apps',
    'portal-web',
    'src',
    'services',
    'eventBackupPolicy.js',
  ])

  const issues = validateEventRestoreRows([
    {
      eventId: 'EV-NOTE',
      eventType: 'NOTE',
      workerLogin: 'worker@example.com',
      status: 'RUNNING',
      endAt: null,
    },
    {
      eventId: 'EV-CLEAN-1',
      eventType: 'CLEAN',
      workerLogin: 'worker@example.com',
      status: 'RUNNING',
      endAt: null,
    },
    {
      eventId: 'EV-CLEAN-2',
      eventType: 'CLEAN',
      workerLogin: 'WORKER@example.com',
      status: 'RUNNING',
      endAt: null,
    },
  ])

  assert.equal(issues.length, 2)
  assert.match(issues[0], /eventType=CLEAN/)
  assert.match(issues[1], /ma już otwarty CLEAN/)
})

test('restore odrzuca brak oraz duplikat eventId przed wykonaniem pierwszej mutacji', async () => {
  const { validateEventRestoreRows } = await importModule([
    'web-app',
    'apps',
    'portal-web',
    'src',
    'services',
    'eventBackupPolicy.js',
  ])

  const issues = validateEventRestoreRows([
    { eventId: '', status: 'CLOSED' },
    { eventId: 'EV-1', status: 'CLOSED' },
    { eventId: 'EV-1', status: 'DONE' },
  ])

  assert.equal(issues.length, 2)
  assert.match(issues[0], /brak eventId/)
  assert.match(issues[1], /więcej niż raz/)
})

test('MATCHED bez długości planu jest poprawny, ale obca wersja snapshotu nie jest', async () => {
  const { validateEventRestoreRows } = await importModule([
    'web-app',
    'apps',
    'portal-web',
    'src',
    'services',
    'eventBackupPolicy.js',
  ])
  const matched = {
    eventId: 'EV-MATCHED',
    eventType: 'CLEAN',
    matchStatus: 'MATCHED',
    taskId: 'TASK-1',
    occurrenceDateYmd: '2026-07-24',
    serviceBlockId: 'BLOCK-1',
    allocationId: 'ALLOC-1',
    workSlotKey: 'SLOT-1',
    matchMethod: 'EXACT_WORKER_ZONE_DATE',
    matchReason: 'EXACT_CANDIDATE',
    matchedAt: '2026-07-24T05:04:24.000Z',
    planSnapshotVersion: 1,
    plannedDurationMinutes: null,
    taskUpdatedAtSnapshot: '2026-07-23T20:00:00.000Z',
    status: 'RUNNING',
    workerLogin: 'worker@example.com',
  }

  assert.deepEqual(validateEventRestoreRows([matched]), [])
  assert.match(
    validateEventRestoreRows([{ ...matched, planSnapshotVersion: 2 }])[0],
    /planSnapshotVersion=1/,
  )
  assert.match(
    validateEventRestoreRows([{ ...matched, matchMethod: '' }])[0],
    /matchMethod/,
  )
  assert.match(
    validateEventRestoreRows([{ ...matched, matchReason: '' }])[0],
    /matchReason/,
  )
})
