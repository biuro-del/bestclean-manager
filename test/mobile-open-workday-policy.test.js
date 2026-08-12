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

test('dwa historyczne otwarte Workday nie blokuja START i pozostaja niezmienione', () => {
  const historical = [
    workday({ workday_id: 'WD-OLD-1', is_today_warsaw: false }),
    workday({ workday_id: 'WD-OLD-2', is_today_warsaw: 'f' }),
  ]
  const before = JSON.parse(JSON.stringify(historical))

  assert.equal(resolveSingleOpenWorkday(historical), null)
  assert.deepEqual(historical, before)
})

test('historyczny i jeden dzisiejszy Workday zwraca dzisiejszy', () => {
  const current = workday({ workday_id: 'WD-TODAY' })
  assert.equal(
    resolveSingleOpenWorkday([
      workday({ workday_id: 'WD-OLD', is_today_warsaw: false }),
      current,
    ]),
    current,
  )
})

test('dwa dzisiejsze Workday daja konflikt zamiast wyboru najnowszego', () => {
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

test('biezacy Workday i rekord start_at null nadal blokuja utworzenie drugiego dnia', () => {
  const unresolved = workday({ is_today_warsaw: null, start_at: null })
  assert.deepEqual(uniqueOpenWorkdays([unresolved, { ...unresolved }]), [unresolved])
  assert.throws(
    () => resolveSingleOpenWorkday([workday({ workday_id: 'WD-TODAY' }), unresolved]),
    (error) => {
      assert.equal(error.statusCode, 409)
      assert.equal(error.publicCode, MOBILE_OPEN_WORKDAY_ERROR.OTHER_DAY)
      assert.deepEqual(error.publicDetails.workdayIds, ['WD-TODAY', 'WD-1'])
      return true
    },
  )
})
