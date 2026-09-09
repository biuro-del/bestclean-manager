'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { WorkforceScheduleError } = require('../workforce-schedule-policy')
const {
  WORKFORCE_SCHEDULE_RECURRENCE_MAX_COUNT,
  WORKFORCE_SCHEDULE_RECURRENCE_MAX_HORIZON_DAYS,
  WORKFORCE_SCHEDULE_RECURRENCE_MAX_INTERVAL,
  expandRecurrenceDates,
  normalizeRecurrenceRule,
} = require('../workforce-schedule-recurrence')

function countEnds(count) {
  return { type: 'COUNT', count }
}

function untilEnds(until) {
  return { type: 'UNTIL', until }
}

function assertRecurrenceError(action, code) {
  assert.throws(
    action,
    (caught) => caught instanceof WorkforceScheduleError && caught.code === code,
  )
}

test('normalizacja tworzy kanoniczną regułę i porządkuje dni ISO tygodnia', () => {
  const normalized = normalizeRecurrenceRule({
    frequency: ' weekly ',
    interval: 2,
    weekdays: [5, 1, 5, 3],
    ends: countEnds(6),
  }, '2026-09-09')

  assert.deepEqual(normalized, {
    frequency: 'WEEKLY',
    interval: 2,
    weekdays: [1, 3, 5],
    ends: { type: 'COUNT', count: 6 },
  })
})

test('DAILY respektuje interwał oraz granicę roku', () => {
  assert.deepEqual(expandRecurrenceDates('2026-12-30', {
    frequency: 'DAILY',
    interval: 2,
    ends: countEnds(4),
  }), ['2026-12-30', '2027-01-01', '2027-01-03', '2027-01-05'])
})

test('WEEKLY zaczyna od pierwszego zgodnego dnia i kotwiczy interwał w tygodniu daty startowej', () => {
  assert.deepEqual(expandRecurrenceDates('2026-09-09', {
    frequency: 'WEEKLY',
    interval: 2,
    weekdays: [5, 1],
    ends: countEnds(5),
  }), ['2026-09-11', '2026-09-21', '2026-09-25', '2026-10-05', '2026-10-09'])
})

test('UNTIL jest granicą włączną', () => {
  assert.deepEqual(expandRecurrenceDates('2026-09-07', {
    frequency: 'WEEKLY',
    interval: 1,
    weekdays: [1, 3, 5],
    ends: untilEnds('2026-09-11'),
  }), ['2026-09-07', '2026-09-09', '2026-09-11'])
})

test('MONTHLY DAY_OF_MONTH nie przelewa dnia 31 do krótszego miesiąca', () => {
  assert.deepEqual(expandRecurrenceDates('2026-01-30', {
    frequency: 'MONTHLY',
    interval: 1,
    pattern: { type: 'DAY_OF_MONTH', day: 31 },
    ends: countEnds(4),
  }), ['2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31'])
})

test('MONTHLY respektuje interwał miesięcy i nie wymusza daty startowej', () => {
  assert.deepEqual(expandRecurrenceDates('2026-01-20', {
    frequency: 'MONTHLY',
    interval: 2,
    pattern: { type: 'DAY_OF_MONTH', day: 5 },
    ends: countEnds(3),
  }), ['2026-03-05', '2026-05-05', '2026-07-05'])
})

test('MONTHLY LAST_DAY uwzględnia rok przestępny', () => {
  assert.deepEqual(expandRecurrenceDates('2027-12-31', {
    frequency: 'MONTHLY',
    interval: 1,
    pattern: { type: 'LAST_DAY' },
    ends: untilEnds('2028-03-31'),
  }), ['2027-12-31', '2028-01-31', '2028-02-29', '2028-03-31'])
})

test('MONTHLY NTH_WEEKDAY obsługuje pierwsze i ostatnie wystąpienie dnia tygodnia', () => {
  assert.deepEqual(expandRecurrenceDates('2026-01-20', {
    frequency: 'MONTHLY',
    interval: 1,
    pattern: { type: 'NTH_WEEKDAY', ordinal: 1, weekday: 1 },
    ends: countEnds(3),
  }), ['2026-02-02', '2026-03-02', '2026-04-06'])

  assert.deepEqual(expandRecurrenceDates('2026-01-01', {
    frequency: 'MONTHLY',
    interval: 1,
    pattern: { type: 'NTH_WEEKDAY', ordinal: -1, weekday: 5 },
    ends: countEnds(3),
  }), ['2026-01-30', '2026-02-27', '2026-03-27'])
})

test('walidacja odrzuca niepoprawne daty, interwały, dni i pola niezgodne z typem', () => {
  const validEnds = countEnds(1)
  const cases = [
    () => normalizeRecurrenceRule({ frequency: 'DAILY', interval: 1, ends: validEnds }, '2026-02-30'),
    () => normalizeRecurrenceRule({ frequency: 'DAILY', interval: 0, ends: validEnds }, '2026-01-01'),
    () => normalizeRecurrenceRule({ frequency: 'DAILY', interval: 31, ends: validEnds }, '2026-01-01'),
    () => normalizeRecurrenceRule({ frequency: 'WEEKLY', interval: 1, weekdays: [], ends: validEnds }, '2026-01-01'),
    () => normalizeRecurrenceRule({ frequency: 'WEEKLY', interval: 1, weekdays: [0], ends: validEnds }, '2026-01-01'),
    () => normalizeRecurrenceRule({ frequency: 'MONTHLY', interval: 1, pattern: { type: 'DAY_OF_MONTH', day: 32 }, ends: validEnds }, '2026-01-01'),
    () => normalizeRecurrenceRule({ frequency: 'MONTHLY', interval: 1, pattern: { type: 'NTH_WEEKDAY', ordinal: 0, weekday: 1 }, ends: validEnds }, '2026-01-01'),
    () => normalizeRecurrenceRule({ frequency: 'MONTHLY', interval: 1, pattern: { type: 'NTH_WEEKDAY', ordinal: 1, weekday: 8 }, ends: validEnds }, '2026-01-01'),
    () => normalizeRecurrenceRule({ frequency: 'DAILY', interval: 1, weekdays: [1], ends: validEnds }, '2026-01-01'),
    () => normalizeRecurrenceRule({ frequency: 'DAILY', interval: 1, ends: { type: 'COUNT', count: 1, until: '2026-01-02' } }, '2026-01-01'),
    () => normalizeRecurrenceRule({ frequency: 'DAILY', interval: 1, ends: validEnds, unsupported: true }, '2026-01-01'),
  ]

  for (const action of cases) assertRecurrenceError(action, 'WORKFORCE_SCHEDULE_INVALID_RECURRENCE')
})

test('walidacja pilnuje limitu liczby wystąpień', () => {
  assert.equal(WORKFORCE_SCHEDULE_RECURRENCE_MAX_COUNT, 366)
  assert.equal(WORKFORCE_SCHEDULE_RECURRENCE_MAX_INTERVAL, 30)
  assert.deepEqual(normalizeRecurrenceRule({
    frequency: 'DAILY',
    interval: WORKFORCE_SCHEDULE_RECURRENCE_MAX_INTERVAL,
    ends: countEnds(WORKFORCE_SCHEDULE_RECURRENCE_MAX_COUNT),
  }, '2026-01-01'), {
    frequency: 'DAILY',
    interval: 30,
    ends: { type: 'COUNT', count: 366 },
  })
  assertRecurrenceError(() => normalizeRecurrenceRule({
    frequency: 'DAILY',
    interval: 1,
    ends: countEnds(WORKFORCE_SCHEDULE_RECURRENCE_MAX_COUNT + 1),
  }, '2026-01-01'), 'WORKFORCE_SCHEDULE_INVALID_RECURRENCE')
})

test('UNTIL i COUNT nie mogą przekroczyć horyzontu 3660 dni', () => {
  assert.equal(WORKFORCE_SCHEDULE_RECURRENCE_MAX_HORIZON_DAYS, 3660)
  assert.deepEqual(normalizeRecurrenceRule({
    frequency: 'DAILY',
    interval: 1,
    ends: untilEnds('2036-01-09'),
  }, '2026-01-01').ends, { type: 'UNTIL', until: '2036-01-09' })
  assertRecurrenceError(() => normalizeRecurrenceRule({
    frequency: 'DAILY',
    interval: 1,
    ends: untilEnds('2036-01-10'),
  }, '2026-01-01'), 'RECURRENCE_LIMIT')

  assertRecurrenceError(() => expandRecurrenceDates('2026-01-01', {
    frequency: 'MONTHLY',
    interval: 30,
    pattern: { type: 'LAST_DAY' },
    ends: countEnds(20),
  }), 'RECURRENCE_LIMIT')

  assertRecurrenceError(() => expandRecurrenceDates('9999-12-31', {
    frequency: 'DAILY',
    interval: 1,
    ends: countEnds(2),
  }), 'RECURRENCE_LIMIT')

  assertRecurrenceError(() => expandRecurrenceDates('2026-01-01', {
    frequency: 'DAILY',
    interval: 1,
    ends: untilEnds('2027-01-02'),
  }), 'RECURRENCE_LIMIT')
})

test('wynik jest deterministyczny, unikalny i posortowany', () => {
  const rule = {
    frequency: 'WEEKLY',
    interval: 1,
    weekdays: [7, 1, 7, 3],
    ends: countEnds(10),
  }
  const first = expandRecurrenceDates('2026-09-09', rule)
  const second = expandRecurrenceDates('2026-09-09', rule)

  assert.deepEqual(first, second)
  assert.deepEqual(first, [...new Set(first)].sort())
})
