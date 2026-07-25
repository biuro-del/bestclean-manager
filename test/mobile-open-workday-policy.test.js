'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  MOBILE_OPEN_WORKDAY_ERROR,
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
})

test('jeden dzisiejszy Workday jest aktywnym dniem', () => {
  const row = workday()
  assert.equal(resolveSingleOpenWorkday([row]), row)
})

test('stary otwarty Workday blokuje nowy skan bez automatycznego domkniecia', () => {
  assert.throws(
    () => resolveSingleOpenWorkday([workday({ is_today_warsaw: false })]),
    (error) => {
      assert.equal(error.statusCode, 409)
      assert.equal(error.publicCode, MOBILE_OPEN_WORKDAY_ERROR.OTHER_DAY)
      assert.deepEqual(error.publicDetails.workdayIds, ['WD-1'])
      return true
    },
  )
})

test('kilka otwartych Workday daje konflikt zamiast wyboru najnowszego', () => {
  assert.throws(
    () =>
      resolveSingleOpenWorkday([
        workday(),
        workday({ workday_id: 'WD-2', start_at: '2026-07-23T06:00:00.000Z' }),
      ]),
    (error) => {
      assert.equal(error.statusCode, 409)
      assert.equal(error.publicCode, MOBILE_OPEN_WORKDAY_ERROR.MULTIPLE_OPEN)
      assert.deepEqual(error.publicDetails.workdayIds, ['WD-1', 'WD-2'])
      return true
    },
  )
})

test('Workday bez potwierdzonej daty dzisiejszej jest konfliktem, a duplikat odczytu nie zawyza licznika', () => {
  const unresolved = workday({ is_today_warsaw: null, start_at: null })
  assert.deepEqual(uniqueOpenWorkdays([unresolved, { ...unresolved }]), [unresolved])
  assert.throws(
    () => resolveSingleOpenWorkday([unresolved]),
    (error) => error.publicCode === MOBILE_OPEN_WORKDAY_ERROR.OTHER_DAY,
  )
})
