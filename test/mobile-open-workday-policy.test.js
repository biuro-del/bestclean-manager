'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  MOBILE_OPEN_WORKDAY_ERROR,
  resolveOpenWorkdayState,
  resolveSingleOpenWorkday,
  uniqueOpenWorkdays,
} = require('../mobile-open-workday-policy')

function workday(overrides = {}) {
  return {
    workday_id: 'WD-1',
    start_at: '2026-07-23T05:00:00.000Z',
    is_today_warsaw: true,
    ...overrides,
  }
}

test('brak otwartego Workday daje pusty stan', () => {
  assert.equal(resolveSingleOpenWorkday([]), null)
  assert.deepEqual(resolveOpenWorkdayState([]), {
    activeWorkday: null,
    staleWorkdays: [],
  })
})

test('jeden dzisiejszy Workday jest aktywnym dniem', () => {
  const row = workday()
  assert.equal(resolveSingleOpenWorkday([row]), row)
  assert.deepEqual(resolveOpenWorkdayState([row]), {
    activeWorkday: row,
    staleWorkdays: [],
  })
})

test('stary otwarty Workday nie blokuje nowego dnia i jest zwracany osobno', () => {
  const stale = workday({ is_today_warsaw: false })
  assert.equal(resolveSingleOpenWorkday([stale]), null)
  assert.deepEqual(resolveOpenWorkdayState([stale]), {
    activeWorkday: null,
    staleWorkdays: [stale],
  })
})

test('dzisiejszy i stare otwarte Workday sa rozdzielone bez zmiany starych rekordow', () => {
  const today = workday()
  const stale = workday({
    workday_id: 'WD-OLD',
    start_at: '2026-07-22T05:00:00.000Z',
    is_today_warsaw: false,
  })
  assert.deepEqual(resolveOpenWorkdayState([stale, today]), {
    activeWorkday: today,
    staleWorkdays: [stale],
  })
})

test('kilka starych otwartych Workday nie blokuje dzisiejszego dnia', () => {
  const staleOne = workday({ is_today_warsaw: false })
  const staleTwo = workday({
    workday_id: 'WD-2',
    start_at: '2026-07-21T05:00:00.000Z',
    is_today_warsaw: 'f',
  })
  assert.deepEqual(resolveOpenWorkdayState([staleOne, staleTwo]), {
    activeWorkday: null,
    staleWorkdays: [staleOne, staleTwo],
  })
})

test('kilka dzisiejszych Workday daje konflikt zamiast wyboru najnowszego', () => {
  assert.throws(
    () =>
      resolveOpenWorkdayState([
        workday(),
        workday({ workday_id: 'WD-2', start_at: '2026-07-23T06:00:00.000Z' }),
        workday({
          workday_id: 'WD-OLD',
          start_at: '2026-07-22T06:00:00.000Z',
          is_today_warsaw: false,
        }),
      ]),
    (error) => {
      assert.equal(error.statusCode, 409)
      assert.equal(error.publicCode, MOBILE_OPEN_WORKDAY_ERROR.MULTIPLE_OPEN)
      assert.deepEqual(error.publicDetails.workdayIds, ['WD-1', 'WD-2'])
      return true
    },
  )
})

test('Workday bez start_at jest konfliktem integralnosci, a duplikat odczytu nie zawyza licznika', () => {
  const unresolved = workday({ start_at: null })
  assert.deepEqual(uniqueOpenWorkdays([unresolved, { ...unresolved }]), [unresolved])
  assert.throws(
    () => resolveOpenWorkdayState([unresolved, { ...unresolved }]),
    (error) => {
      assert.equal(error.statusCode, 409)
      assert.equal(error.publicCode, MOBILE_OPEN_WORKDAY_ERROR.INTEGRITY)
      assert.deepEqual(error.publicDetails.integrityIssues, [
        { workdayId: 'WD-1', reason: 'MISSING_START_AT' },
      ])
      return true
    },
  )
})

test('nieklasyfikowalna flaga daty jest konfliktem integralnosci', () => {
  const unresolved = workday({ is_today_warsaw: null })
  assert.throws(
    () => resolveSingleOpenWorkday([unresolved]),
    (error) => {
      assert.equal(error.statusCode, 409)
      assert.equal(error.publicCode, MOBILE_OPEN_WORKDAY_ERROR.INTEGRITY)
      assert.deepEqual(error.publicDetails.integrityIssues, [
        { workdayId: 'WD-1', reason: 'UNKNOWN_TODAY_FLAG' },
      ])
      return true
    },
  )
})

test('Workday z przyszla data biznesowa jest konfliktem, a nie poprzednim dniem', () => {
  const future = workday({
    business_day_relation: 'FUTURE',
    is_today_warsaw: false,
  })
  assert.throws(
    () => resolveOpenWorkdayState([future]),
    (error) => {
      assert.equal(error.statusCode, 409)
      assert.equal(error.publicCode, MOBILE_OPEN_WORKDAY_ERROR.INTEGRITY)
      assert.deepEqual(error.publicDetails.integrityIssues, [
        { workdayId: 'WD-1', reason: 'FUTURE_START_AT' },
      ])
      return true
    },
  )
})
