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

test('ustawienia są normalizowane, a zapis wymaga dokładnego potwierdzenia organizacji i wersji', async () => {
  const {
    isConfirmedWorkforceScheduleSettings,
    normalizeWorkforceScheduleSettings,
  } = await modelModule
  const expected = {
    expectedVersion: 4,
    orgId: 'bestclean',
    timeZone: 'Europe/Warsaw',
    weeklyLimitMinutes: 2250,
  }
  const receipt = {
    orgId: 'bestclean',
    timeZone: 'Europe/Warsaw',
    version: 5,
    weeklyLimitMinutes: 2250,
  }

  assert.deepEqual(normalizeWorkforceScheduleSettings({
    ...receipt,
    version: '5',
    weeklyLimitMinutes: '2250',
  }), receipt)
  assert.equal(isConfirmedWorkforceScheduleSettings(receipt, expected), true)
  assert.equal(isConfirmedWorkforceScheduleSettings({ ...receipt, orgId: 'inna-firma' }, expected), false)
  assert.equal(isConfirmedWorkforceScheduleSettings({ ...receipt, version: 4 }, expected), false)
  assert.equal(isConfirmedWorkforceScheduleSettings({ ...receipt, weeklyLimitMinutes: 2400 }, expected), false)
  assert.equal(normalizeWorkforceScheduleSettings({ ...receipt, weeklyLimitMinutes: -1 }).weeklyLimitMinutes, 0)
  assert.equal(normalizeWorkforceScheduleSettings({ ...receipt, weeklyLimitMinutes: 10081 }).weeklyLimitMinutes, 0)
})

test('bootstrap zachowuje nieaktywne snapshoty historyczne, ale oznacza je jako niewybieralne', async () => {
  const { normalizeWorkforceScheduleBootstrap } = await modelModule
  const result = normalizeWorkforceScheduleBootstrap({
    catalogSync: {
      lastSyncedAt: '2026-09-07T10:15:30.000Z',
      people: { active: 1, inactive: 1 },
      locations: { active: 1, inactive: 1 },
    },
    people: [
      { personId: 'active-person', displayName: 'Aktywna Osoba', status: 'ACTIVE' },
      { personId: 'inactive-person', displayName: 'Była Osoba', status: 'INACTIVE' },
    ],
    locations: [
      { locationId: 'active-location', name: 'Aktywny obiekt', status: 'ACTIVE' },
      { locationId: 'inactive-location', name: 'Historyczny obiekt', status: 'INACTIVE' },
    ],
  })

  assert.equal(result.users[0].selectable, true)
  assert.equal(result.users[1].selectable, false)
  assert.equal(result.locations[0].selectable, true)
  assert.equal(result.locations[1].selectable, false)
  assert.deepEqual(result.catalogSync, {
    lastSyncedAt: '2026-09-07T10:15:30.000Z',
    source: 'bootstrap',
    people: { active: 1, inactive: 1 },
    locations: { active: 1, inactive: 1 },
  })
})

test('zapis blokuje nieaktywne lub brakujące referencje katalogowe i zwraca tylko allowlistę affected', async () => {
  const { assertWorkforceScheduleSelectableReferences } = await modelModule
  const catalog = {
    users: [
      { id: 'active-person', selectable: true },
      { id: 'inactive-person', selectable: false },
    ],
    locations: [
      { id: 'active-location', selectable: true },
      { id: 'inactive-location', selectable: false },
    ],
  }
  assert.equal(assertWorkforceScheduleSelectableReferences({
    assigneeIds: ['active-person'],
    date: '2026-09-07',
    locationId: 'active-location',
  }, catalog), true)

  assert.throws(
    () => assertWorkforceScheduleSelectableReferences({
      assigneeIds: ['inactive-person', 'missing-person'],
      date: '2026-09-07',
      id: 'shift-1',
      locationId: 'inactive-location',
    }, catalog),
    (error) => {
      assert.equal(error?.code, 'WORKFORCE_SCHEDULE_INACTIVE_CATALOG_SELECTION')
      assert.deepEqual(error.details.blocking, [
        { type: 'MISSING_LOCATION', affected: { shiftId: 'shift-1', date: '2026-09-07', locationId: 'inactive-location' } },
        { type: 'INACTIVE_PERSON', affected: { shiftId: 'shift-1', date: '2026-09-07', personId: 'inactive-person' } },
        { type: 'MISSING_PERSON', affected: { shiftId: 'shift-1', date: '2026-09-07', personId: 'missing-person' } },
      ])
      return true
    },
  )
})

test('konflikty strukturalne mają lokalny opis i nigdy nie renderują dowolnego JSON z details', async () => {
  const { workforceScheduleStructuralConflictsFromError } = await modelModule
  const conflicts = workforceScheduleStructuralConflictsFromError({
    code: 'WORKFORCE_SCHEDULE_PUBLICATION_BLOCKED',
    details: {
      blocking: [{
        type: 'INACTIVE_PERSON',
        affected: { personId: 'person-1', shiftId: 'shift-1', date: '2026-09-07', secret: 'nie pokazuj' },
        details: { databaseRow: 'ściśle tajne' },
        message: 'niezaufany komunikat serwera',
      }],
    },
  })

  assert.deepEqual(conflicts, [{
    id: 'INACTIVE_PERSON-0',
    type: 'INACTIVE_PERSON',
    label: 'Nieaktywny pracownik',
    message: 'Zmiana odwołuje się do pracownika, którego nie można już przypisywać.',
    affected: { personId: 'person-1', shiftId: 'shift-1', date: '2026-09-07' },
  }])
  assert.doesNotMatch(JSON.stringify(conflicts), /tajne|niezaufany|secret/)
})

test('kontekst konfliktu odrzuca datę spoza kontraktu YYYY-MM-DD', async () => {
  const { workforceScheduleStructuralConflictsFromError } = await modelModule
  const conflicts = workforceScheduleStructuralConflictsFromError({
    code: 'WORKFORCE_SCHEDULE_PUBLICATION_BLOCKED',
    details: {
      blocking: [{
        type: 'OVERLAP',
        affected: { shiftId: 'shift-1', date: 'dane spoza kontraktu' },
      }],
    },
  })

  assert.deepEqual(conflicts[0].affected, { shiftId: 'shift-1' })
})

test('konflikt ręcznej synchronizacji pokazuje wyłącznie dozwolone pola affected', async () => {
  const { workforceScheduleCatalogConflictsFromError } = await modelModule
  const result = workforceScheduleCatalogConflictsFromError({
    code: 'WORKFORCE_SCHEDULE_OBJECT_IN_USE',
    details: {
      affected: [{
        locationId: 'location-1',
        shiftId: 'shift-1',
        date: '2026-09-08',
        sourceObjectId: 'ukryte-id-źródła',
        displayName: 'ukryta nazwa',
      }],
      hasMore: true,
      debug: { sql: 'nie pokazuj' },
    },
  })

  assert.deepEqual(result, {
    conflicts: [{
      id: 'MISSING_LOCATION-0',
      type: 'MISSING_LOCATION',
      label: 'Niedostępny obiekt',
      message: 'Obiekt zapisany w zmianie nie jest dostępny do planowania.',
      affected: { locationId: 'location-1', shiftId: 'shift-1', date: '2026-09-08' },
    }],
    hasMore: true,
  })
  assert.doesNotMatch(JSON.stringify(result), /ukry|debug|sql|sourceObjectId|displayName/)
})

test('konflikt publikacji mapuje stary kształt backendu wyłącznie na bezpieczną allowlistę ID', async () => {
  const { workforceScheduleStructuralConflictsFromError } = await modelModule
  const conflicts = workforceScheduleStructuralConflictsFromError({
    code: 'WORKFORCE_SCHEDULE_PUBLICATION_BLOCKED',
    details: {
      blocking: [{
        type: 'MISSING_LOCATION',
        shiftId: 'shift-legacy',
        personId: 'person-legacy',
        details: {
          locationId: 'location-legacy',
          otherShiftId: 'shift-secret',
          displayName: 'Dane osobowe',
        },
      }],
    },
  })

  assert.deepEqual(conflicts[0].affected, {
    personId: 'person-legacy',
    locationId: 'location-legacy',
    shiftId: 'shift-legacy',
  })
  assert.doesNotMatch(JSON.stringify(conflicts), /shift-secret|Dane osobowe|displayName|otherShiftId/)
})

test('lokalne obcięcie konfliktów synchronizacji zawsze ustawia hasMore', async () => {
  const { workforceScheduleCatalogConflictsFromError } = await modelModule
  const affected = Array.from({ length: 21 }, (_, index) => ({
    locationId: `location-${index + 1}`,
    shiftId: `shift-${index + 1}`,
  }))
  const result = workforceScheduleCatalogConflictsFromError({
    code: 'WORKFORCE_SCHEDULE_OBJECT_IN_USE',
    details: { affected, hasMore: false },
  })

  assert.equal(result.conflicts.length, 20)
  assert.equal(result.hasMore, true)
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

test('COPY_WEEK buduje wersjonowany snapshot tylko z pełnych, nieusuniętych zmian tygodnia', async () => {
  const { buildWorkforceScheduleWeekCopyPayload } = await modelModule
  const payload = buildWorkforceScheduleWeekCopyPayload([
    { id: 'shift-b', shiftId: 'shift-b', date: '2026-09-08', revision: 2, version: 7 },
    { id: 'shift-deleted', shiftId: 'shift-deleted', date: '2026-09-09', pendingDeletion: true, revision: 4, version: 9 },
    { id: 'shift-outside', shiftId: 'shift-outside', date: '2026-09-14', revision: 1, version: 3 },
    { id: 'shift-a', shiftId: 'shift-a', date: '2026-09-07', revision: 5, version: 11 },
  ], '2026-09-07')

  assert.deepEqual(payload, {
    sourceWeekStart: '2026-09-07',
    expectedVersions: [
      { shiftId: 'shift-a', version: 11 },
      { shiftId: 'shift-b', version: 7 },
    ],
  })
  assert.doesNotMatch(JSON.stringify(payload), /shift-deleted|shift-outside/)
})

test('COPY_WEEK blokuje niepotwierdzone źródło i niepoprawny początek tygodnia', async () => {
  const { buildWorkforceScheduleWeekCopyPayload } = await modelModule
  const confirmed = [{ id: 'shift-1', shiftId: 'shift-1', date: '2026-09-07', revision: 1, version: 2 }]

  assert.throws(
    () => buildWorkforceScheduleWeekCopyPayload([
      ...confirmed,
      { id: 'local-only', date: '2026-09-08', revision: 1, version: 0 },
    ], '2026-09-07'),
    { code: 'WORKFORCE_SCHEDULE_COPY_SOURCE_NOT_CONFIRMED' },
  )
  assert.throws(
    () => buildWorkforceScheduleWeekCopyPayload(confirmed, '2026-09-08'),
    { code: 'WORKFORCE_SCHEDULE_INVALID_COPY_WEEK' },
  )
})

test('COPY_WEEK akceptuje wyłącznie pełny receipt tej organizacji, zakresu i wszystkich kopii', async () => {
  const { normalizeWorkforceScheduleWeekCopyReceipt } = await modelModule
  const sourceShifts = [
    { id: 'shift-a', shiftId: 'shift-a', date: '2026-09-07', revision: 3, version: 5 },
    { id: 'shift-b', shiftId: 'shift-b', date: '2026-09-10', revision: 2, version: 8 },
  ]
  const expected = { orgId: 'bestclean', sourceShifts, sourceWeekStart: '2026-09-07' }
  const receipt = {
    orgId: 'bestclean',
    sourceFrom: '2026-09-07',
    sourceTo: '2026-09-13',
    targetFrom: '2026-09-14',
    targetTo: '2026-09-20',
    createdCount: 2,
    created: [
      { sourceShiftId: 'shift-a', shiftId: 'copy-a', date: '2026-09-14', revision: 1, version: 1 },
      { sourceShiftId: 'shift-b', shiftId: 'copy-b', date: '2026-09-17', revision: 1, version: 1 },
    ],
  }

  assert.deepEqual(normalizeWorkforceScheduleWeekCopyReceipt(receipt, expected), receipt)
  for (const invalid of [
    { ...receipt, orgId: 'other-org' },
    { ...receipt, targetFrom: '2026-09-15' },
    { ...receipt, createdCount: 1 },
    { ...receipt, created: receipt.created.slice(0, 1), createdCount: 1 },
    { ...receipt, created: [{ ...receipt.created[0], date: '2026-09-15' }, receipt.created[1]] },
    { ...receipt, created: [{ ...receipt.created[0], version: 2 }, receipt.created[1]] },
    { ...receipt, created: [receipt.created[0], { ...receipt.created[1], sourceShiftId: 'shift-a' }] },
    { ...receipt, unexpected: true },
  ]) {
    assert.equal(normalizeWorkforceScheduleWeekCopyReceipt(invalid, expected), null)
  }
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

test('published archive does not return to the pending changes count', async () => {
  const { dirtyShifts, isShiftDirty } = await scheduleModelModule
  const archived = {
    id: 'shift-archived',
    shiftId: 'shift-archived',
    status: 'ARCHIVED',
    pendingDeletion: true,
    revision: 3,
    publishedRevision: 3,
  }
  const pendingDeletion = {
    ...archived,
    id: 'shift-pending-deletion',
    shiftId: 'shift-pending-deletion',
    status: 'CHANGED_AFTER_PUBLISH',
    revision: 4,
  }

  assert.equal(isShiftDirty(archived), false)
  assert.equal(isShiftDirty(pendingDeletion), true)
  assert.deepEqual(dirtyShifts([archived, pendingDeletion]), [pendingDeletion])
})
