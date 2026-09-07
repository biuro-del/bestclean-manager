'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  WORKFORCE_SCHEDULE_INTERNAL_EFFECTS,
  WorkforceScheduleError,
  classifyPublicationConflicts,
  grossShiftMinutes,
  intervalsOverlap,
  normalizeCommand,
  normalizeIanaTimeZone,
  normalizeInternalEffects,
  normalizePublication,
  normalizeShiftInput,
  normalizeWeekCopy,
  parseDateRange,
  resolveShiftInterval,
  stableHash,
  zonedDateTimeCandidates,
} = require('../workforce-schedule-policy')

const noEffects = () => ({ delivery: false, notifications: false, downstream: false })

test('jawna strefa IANA wylicza zwykłą i nocną zmianę, ale nie zamienia zera czasu na dobę', () => {
  const day = resolveShiftInterval({ date: '2026-08-24', startTime: '07:00', endTime: '15:00', timeZone: 'Europe/Warsaw' })
  assert.equal(day.startsAt, '2026-08-24T05:00:00.000Z')
  assert.equal(day.endsAt, '2026-08-24T13:00:00.000Z')

  const night = resolveShiftInterval({ date: '2026-08-24', startTime: '22:00', endTime: '06:00', timeZone: 'Europe/Warsaw' })
  assert.equal(night.startsAt, '2026-08-24T20:00:00.000Z')
  assert.equal(night.endsAt, '2026-08-25T04:00:00.000Z')

  assert.equal(grossShiftMinutes('07:00', '07:00'), 0)
  assert.equal(grossShiftMinutes('22:00', '06:00'), 8 * 60)
  assert.throws(
    () => resolveShiftInterval({ date: '2026-08-24', startTime: '07:00', endTime: '07:00', timeZone: 'Europe/Warsaw' }),
    (caught) => caught instanceof WorkforceScheduleError && caught.code === 'WORKFORCE_SCHEDULE_INVALID_INTERVAL',
  )
})

test('nieistniejąca i powtórzona minuta DST są wykrywane bez zgadywania', () => {
  assert.equal(zonedDateTimeCandidates('2026-03-29', '02:30', 'Europe/Warsaw').length, 0)
  assert.equal(zonedDateTimeCandidates('2026-10-25', '02:30', 'Europe/Warsaw').length, 2)
  assert.throws(
    () => resolveShiftInterval({ date: '2026-03-29', startTime: '02:30', endTime: '03:30', timeZone: 'Europe/Warsaw' }),
    (caught) => caught instanceof WorkforceScheduleError && caught.code === 'WORKFORCE_SCHEDULE_DST_GAP',
  )
  assert.throws(
    () => resolveShiftInterval({ date: '2026-10-25', startTime: '02:30', endTime: '04:00', timeZone: 'Europe/Warsaw' }),
    (caught) => caught instanceof WorkforceScheduleError && caught.code === 'WORKFORCE_SCHEDULE_DST_AMBIGUOUS',
  )
})

test('techniczny skrót czasu nie zastępuje regionalnej strefy IANA', () => {
  assert.equal(normalizeIanaTimeZone('Europe/Warsaw'), 'Europe/Warsaw')
  for (const invalid of ['UTC', 'CET', 'EST5EDT', 'Etc/UTC']) {
    assert.throws(() => normalizeIanaTimeZone(invalid), /regionalną/)
  }
})

test('walidacja zmiany odrzuca duplikaty osób i zbyt długą przerwę', () => {
  const base = {
    expectedVersion: 0,
    title: 'Zmiana',
    date: '2026-08-24',
    startTime: '07:00',
    endTime: '15:00',
    breakMinutes: 30,
    requiredHeadcount: 2,
    locationId: 'location-1',
    personIds: ['person-1', 'person-2'],
    instructions: [],
  }
  assert.equal(normalizeShiftInput(base, 'Europe/Warsaw').personIds.length, 2)
  assert.throws(() => normalizeShiftInput({ ...base, personIds: ['person-1', 'person-1'] }, 'Europe/Warsaw'), /duplikaty/)
  assert.throws(() => normalizeShiftInput({ ...base, breakMinutes: 480 }, 'Europe/Warsaw'), /Przerwa/)
})

test('przerwa jest walidowana względem rzeczywistego czasu także przy DST', () => {
  assert.throws(
    () => normalizeShiftInput({
      expectedVersion: 0,
      title: 'Zmiana po zmianie czasu',
      date: '2026-03-29',
      startTime: '01:00',
      endTime: '04:00',
      breakMinutes: 150,
      requiredHeadcount: 1,
      locationId: 'location-1',
      personIds: [],
    }, 'Europe/Warsaw'),
    (caught) => caught.code === 'WORKFORCE_SCHEDULE_INVALID_BREAK',
  )
})

test('styk przedziałów jest dozwolony, a nakładanie wykrywane', () => {
  const first = { startsAt: '2026-08-24T05:00:00Z', endsAt: '2026-08-24T13:00:00Z' }
  assert.equal(intervalsOverlap(first, { startsAt: '2026-08-24T13:00:00Z', endsAt: '2026-08-24T15:00:00Z' }), false)
  assert.equal(intervalsOverlap(first, { startsAt: '2026-08-24T12:59:00Z', endsAt: '2026-08-24T15:00:00Z' }), true)
})

test('zakres bootstrapu jest ograniczony do 93 dni', () => {
  assert.deepEqual(parseDateRange('2026-08-01', '2026-08-31'), { from: '2026-08-01', to: '2026-08-31', days: 31 })
  assert.throws(() => parseDateRange('2026-01-01', '2026-12-31'), /93/)
})

test('każda mutacja wymaga dokładnego kontraktu zerowych efektów', () => {
  assert.deepEqual(normalizeInternalEffects(noEffects()), WORKFORCE_SCHEDULE_INTERNAL_EFFECTS)
  assert.throws(
    () => normalizeInternalEffects(undefined),
    (caught) => caught.code === 'WORKFORCE_SCHEDULE_INTERNAL_EFFECTS_REQUIRED',
  )
  assert.throws(
    () => normalizeInternalEffects({ ...noEffects(), notifications: true }),
    (caught) => caught.code === 'WORKFORCE_SCHEDULE_EXTERNAL_EFFECTS_FORBIDDEN',
  )
  assert.throws(
    () => normalizeInternalEffects({ ...noEffects(), email: false }),
    (caught) => caught.code === 'WORKFORCE_SCHEDULE_INTERNAL_EFFECTS_REQUIRED',
  )
})

test('hash komendy jest kanoniczny oraz obejmuje kontrakt efektów', () => {
  assert.equal(stableHash({ b: 2, a: { d: 4, c: 3 } }), stableHash({ a: { c: 3, d: 4 }, b: 2 }))
  const first = normalizeCommand({ type: 'SYNC_CATALOGS', orgId: 'bestclean', idempotencyKey: 'one', effects: noEffects(), payload: { b: 2, a: 1 } })
  const second = normalizeCommand({ type: 'SYNC_CATALOGS', orgId: 'bestclean', idempotencyKey: 'two', effects: noEffects(), payload: { a: 1, b: 2 } })
  assert.equal(first.requestHash, second.requestHash)
})

test('publikacja wymaga dokładnych wersji i zerowych efektów', () => {
  const result = normalizePublication({
    orgId: 'bestclean',
    idempotencyKey: 'publish-1',
    effects: noEffects(),
    from: '2026-08-24',
    to: '2026-08-30',
    expectedVersions: [{ shiftId: 'b', version: 2 }, { shiftId: 'a', version: 1 }],
  })
  assert.deepEqual(result.expectedVersions, [{ shiftId: 'a', version: 1 }, { shiftId: 'b', version: 2 }])
  assert.deepEqual(result.effects, noEffects())
  assert.throws(
    () => normalizePublication({ ...result, expectedVersions: [{ shiftId: 'a', version: 1 }, { shiftId: 'a', version: 1 }] }),
    /duplikaty/,
  )
})

test('COPY_WEEK ma staly siedmiodniowy zakres i dokladny snapshot wersji', () => {
  const result = normalizeWeekCopy({
    sourceWeekStart: '2026-03-23',
    expectedVersions: [{ shiftId: 'shift-b', version: 4 }, { shiftId: 'shift-a', version: 2 }],
  })

  assert.deepEqual(result, {
    from: '2026-03-23',
    to: '2026-03-29',
    targetFrom: '2026-03-30',
    targetTo: '2026-04-05',
    expectedVersions: [{ shiftId: 'shift-a', version: 2 }, { shiftId: 'shift-b', version: 4 }],
  })
  assert.throws(
    () => normalizeWeekCopy({ sourceWeekStart: '2026-03-24', expectedVersions: [{ shiftId: 'shift-a', version: 2 }] }),
    (caught) => caught.code === 'WORKFORCE_SCHEDULE_INVALID_COPY_WEEK',
  )
  assert.throws(
    () => normalizeWeekCopy({ sourceWeekStart: '2026-03-23', targetWeekStart: '2026-04-06', expectedVersions: [{ shiftId: 'shift-a', version: 2 }] }),
    (caught) => caught.code === 'WORKFORCE_SCHEDULE_INVALID_COPY_WEEK'
      && caught.details?.fields?.includes('targetWeekStart'),
  )
  assert.throws(
    () => normalizeWeekCopy({
      sourceWeekStart: '2026-03-23',
      expectedVersions: [{ shiftId: 'shift-a', version: 2 }, { shiftId: 'shift-a', version: 2 }],
    }),
    (caught) => caught.code === 'WORKFORCE_SCHEDULE_INVALID_VERSIONS',
  )
})

test('hash logicznie tej samej komendy COPY_WEEK nie zalezy od kolejnosci wersji', () => {
  const first = normalizeCommand({
    type: 'COPY_WEEK',
    orgId: 'bestclean',
    idempotencyKey: 'copy-1',
    effects: noEffects(),
    payload: {
      sourceWeekStart: '2026-03-23',
      expectedVersions: [{ shiftId: 'shift-b', version: 4 }, { shiftId: 'shift-a', version: 2 }],
    },
  })
  const second = normalizeCommand({
    type: 'COPY_WEEK',
    orgId: 'bestclean',
    idempotencyKey: 'copy-1',
    effects: noEffects(),
    payload: {
      expectedVersions: [{ shiftId: 'shift-a', version: 2 }, { shiftId: 'shift-b', version: 4 }],
      sourceWeekStart: '2026-03-23',
    },
  })

  assert.equal(first.requestHash, second.requestHash)
})

test('konflikty blokujące są oddzielone od ostrzeżeń z fingerprintem', () => {
  const conflicts = classifyPublicationConflicts([
    { type: 'UNDERSTAFFED', shiftId: 'shift-2', details: { assigned: 1, required: 2 } },
    { type: 'OVERLAP', shiftId: 'shift-1', personId: 'person-1', details: { otherShiftId: 'shift-2' } },
  ])
  assert.equal(conflicts.blocking.length, 1)
  assert.equal(conflicts.warnings.length, 1)
  assert.deepEqual(
    {
      code: conflicts.warnings[0].code,
      label: conflicts.warnings[0].label,
      message: conflicts.warnings[0].message,
    },
    {
      code: 'UNDERSTAFFED',
      label: 'Niepełna obsada',
      message: 'Przypisano 1 z wymaganych 2 osób.',
    },
  )
  assert.match(conflicts.warningFingerprint, /^[a-f0-9]{64}$/)
})
