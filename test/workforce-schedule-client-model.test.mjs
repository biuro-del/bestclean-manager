import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modelUrl = pathToFileURL(path.join(
  projectRoot,
  'web-app',
  'apps',
  'portal-web',
  'src',
  'features',
  'workforce-schedule',
  'workforceScheduleClientModel.js',
)).href
const scheduleModelUrl = pathToFileURL(path.join(
  projectRoot,
  'web-app',
  'apps',
  'portal-web',
  'src',
  'features',
  'workforce-schedule',
  'scheduleModel.js',
)).href

const modelModule = import(modelUrl)
const scheduleModelModule = import(scheduleModelUrl)

test('bootstrap mapuje backend na widok bez danych demonstracyjnych', async () => {
  const { normalizeWorkforceScheduleBootstrap } = await modelModule
  const result = normalizeWorkforceScheduleBootstrap({
    setupRequired: false,
    settings: { timeZone: 'Europe/Warsaw' },
    people: [{ personId: 'person-1', displayName: 'Anna Nowak', initials: 'AN', status: 'ACTIVE' }],
    locations: [{ locationId: 'location-1', name: 'Biuro', color: '#112233', softColor: '#ddeeff' }],
    shifts: [{ shiftId: 'shift-1', personIds: ['person-1'], instructions: ['Klucze'], revision: 3, publishedRevision: 2 }],
    requests: [],
  })

  assert.equal(result.users[0].id, 'person-1')
  assert.equal(result.users[0].displayName, 'Anna Nowak')
  assert.equal(result.users[0].firstName, 'Anna')
  assert.deepEqual(result.shifts[0].assigneeIds, ['person-1'])
  assert.deepEqual(result.shifts[0].tasks, ['Klucze'])
  assert.deepEqual(result.templates, [])
})

test('payload zapisu zachowuje wersję i mapuje assigneeIds na personIds', async () => {
  const { buildWorkforceScheduleShiftPayload } = await modelModule
  assert.deepEqual(buildWorkforceScheduleShiftPayload({
    id: 'shift-1',
    version: 7,
    title: 'Zmiana poranna',
    date: '2026-09-07',
    startTime: '07:00',
    endTime: '15:00',
    breakMinutes: 30,
    requiredHeadcount: 2,
    locationId: 'location-1',
    notes: 'Odprawa',
    assigneeIds: ['person-1', 'person-2'],
    instructions: ['Klucze w recepcji'],
  }), {
    shiftId: 'shift-1',
    expectedVersion: 7,
    title: 'Zmiana poranna',
    date: '2026-09-07',
    startTime: '07:00',
    endTime: '15:00',
    breakMinutes: 30,
    requiredHeadcount: 2,
    locationId: 'location-1',
    notes: 'Odprawa',
    personIds: ['person-1', 'person-2'],
    instructions: ['Klucze w recepcji'],
  })
})

test('nowa zmiana nie wysyła tymczasowego identyfikatora UI do bazy', async () => {
  const { buildWorkforceScheduleShiftPayload } = await modelModule
  const payload = buildWorkforceScheduleShiftPayload({
    id: 'sh-tymczasowy',
    version: 0,
    title: 'Nowa zmiana',
    date: '2026-09-07',
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    requiredHeadcount: 1,
    locationId: 'location-1',
    assigneeIds: [],
  })

  assert.equal(Object.hasOwn(payload, 'shiftId'), false)
  assert.equal(payload.expectedVersion, 0)
})

test('zapis odrzuca zerowy czas START=STOP, ale dopuszcza zmianę nocną', async () => {
  const { buildWorkforceScheduleShiftPayload } = await modelModule
  const base = {
    title: 'Zmiana nocna',
    date: '2026-09-07',
    breakMinutes: 0,
    requiredHeadcount: 1,
    locationId: 'location-1',
    assigneeIds: [],
  }

  assert.throws(
    () => buildWorkforceScheduleShiftPayload({ ...base, startTime: '07:00', endTime: '07:00' }),
    (error) => error?.code === 'WORKFORCE_SCHEDULE_ZERO_DURATION',
  )
  assert.deepEqual(
    buildWorkforceScheduleShiftPayload({ ...base, startTime: '22:00', endTime: '06:00' }),
    {
      expectedVersion: 0,
      title: 'Zmiana nocna',
      date: '2026-09-07',
      startTime: '22:00',
      endTime: '06:00',
      breakMinutes: 0,
      requiredHeadcount: 1,
      locationId: 'location-1',
      notes: '',
      personIds: [],
      instructions: [],
    },
  )
})

test('duplikat jest nowym szkicem bez identyfikatora i wersji rekordu źródłowego', async () => {
  const { duplicateShift, getShiftMinutes, shiftsOverlap } = await scheduleModelModule
  const source = {
    id: 'shift-source',
    shiftId: 'shift-source',
    title: 'Zmiana',
    date: '2026-09-07',
    startTime: '22:00',
    endTime: '06:00',
    revision: 7,
    publishedRevision: 6,
    publishedDate: '2026-09-07',
    version: 11,
    pendingDeletion: true,
  }
  const duplicate = duplicateShift(source, 'sh-local-copy')

  assert.equal(duplicate.id, 'sh-local-copy')
  assert.equal(duplicate.shiftId, '')
  assert.equal(duplicate.version, 0)
  assert.equal(duplicate.revision, 1)
  assert.equal(duplicate.publishedRevision, null)
  assert.equal(duplicate.pendingDeletion, false)
  assert.equal(getShiftMinutes(duplicate), 8 * 60)
  assert.equal(shiftsOverlap(
    { ...duplicate, id: 'zero', startTime: '07:00', endTime: '07:00' },
    { ...duplicate, id: 'day', startTime: '07:00', endTime: '08:00' },
  ), false)
})

test('kanoniczna odpowiedź zapisu zachowuje identyfikator i wersje serwera', async () => {
  const { isConfirmedWorkforceScheduleShift, normalizeWorkforceScheduleShift } = await modelModule
  const shift = normalizeWorkforceScheduleShift({
    shiftId: 'wss-server-1',
    revision: 4,
    version: 9,
    personIds: ['person-1'],
    instructions: ['Otwórz recepcję'],
  })

  assert.equal(isConfirmedWorkforceScheduleShift(shift), true)
  assert.equal(shift.id, 'wss-server-1')
  assert.equal(shift.shiftId, 'wss-server-1')
  assert.equal(shift.revision, 4)
  assert.equal(shift.version, 9)
  assert.deepEqual(shift.assigneeIds, ['person-1'])
  assert.deepEqual(shift.tasks, ['Otwórz recepcję'])
  assert.equal(isConfirmedWorkforceScheduleShift({ id: 'sh-local', revision: 1, version: 0 }), false)
})

test('potwierdzenie publikacji scala wersje serwera i usuwa potwierdzone archiwum', async () => {
  const { applyWorkforceSchedulePublication } = await modelModule
  const result = applyWorkforceSchedulePublication([
    { id: 'shift-1', shiftId: 'shift-1', revision: 2, version: 4, publishedRevision: 1 },
    { id: 'shift-2', shiftId: 'shift-2', revision: 3, version: 5, publishedRevision: 2, pendingDeletion: true },
  ], {
    publicationId: 'publication-1',
    published: [
      { shiftId: 'shift-1', revision: 2, version: 5, archived: false },
      { shiftId: 'shift-2', revision: 3, version: 6, archived: true },
    ],
  })

  assert.deepEqual(result, [{
    id: 'shift-1',
    shiftId: 'shift-1',
    revision: 2,
    version: 5,
    publishedRevision: 2,
    pendingDeletion: false,
  }])
  assert.throws(
    () => applyWorkforceSchedulePublication([{ id: 'shift-1' }], { publicationId: 'publication-1', published: [] }),
    (error) => error?.code === 'WORKFORCE_SCHEDULE_INVALID_PUBLICATION_RESPONSE',
  )
})

test('ostrzeżenia publikacji są czytelne po polsku i nigdy nie zwracają [object Object]', async () => {
  const { formatWorkforceScheduleWarning } = await modelModule
  const warnings = [
    { type: 'UNDERSTAFFED', shiftId: 'shift-1', details: { assigned: 1, required: 2 } },
    { type: 'WEEKLY_LIMIT', personId: 'person-1', details: { weekStart: '2026-09-07', minutes: 2700, limitMinutes: 2400 } },
    { unexpected: { nested: true } },
    { message: { nested: true } },
  ].map(formatWorkforceScheduleWarning)

  assert.match(warnings[0], /niepełna obsada \(1 z 2\)/)
  assert.match(warnings[1], /przekroczony limit tygodniowy/)
  warnings.forEach((warning) => assert.doesNotMatch(warning, /\[object Object\]/))
})

test('publikacja uwzględnia zmianę przeniesioną poza zakres po publishedDate', async () => {
  const { workforceSchedulePublicationCandidates } = await modelModule
  const result = workforceSchedulePublicationCandidates([
    { id: 'moved-out', date: '2026-10-02', publishedDate: '2026-09-10', revision: 2, publishedRevision: 1 },
    { id: 'moved-in', date: '2026-09-11', publishedDate: '2026-10-03', revision: 4, publishedRevision: 3 },
    { id: 'clean', date: '2026-09-12', publishedDate: '2026-09-12', revision: 2, publishedRevision: 2 },
    { id: 'outside', date: '2026-10-04', publishedDate: '2026-10-04', revision: 2, publishedRevision: 1 },
  ], { from: '2026-09-07', to: '2026-09-13' })

  assert.deepEqual(result.map((shift) => shift.id), ['moved-out', 'moved-in'])
})
