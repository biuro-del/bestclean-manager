'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  MOBILE_OPEN_CYCLE_ERROR,
  assertNoUnresolvedOpenEvents,
  resolveSingleOpenCycle,
  uniqueOpenCycles,
} = require('../mobile-open-cycle-policy')

function cycle(overrides = {}) {
  return {
    event_id: 'EV-1',
    workday_id: 'WD-1',
    zone_id: 'BC0001',
    ...overrides,
  }
}

test('brak otwartego CLEAN daje pusty stan', () => {
  assert.equal(resolveSingleOpenCycle([], 'WD-1'), null)
})

test('jeden CLEAN z aktywnego dnia jest prawidlowym stanem', () => {
  const row = cycle()
  assert.equal(resolveSingleOpenCycle([row], 'WD-1'), row)
})

test('kilka otwartych CLEAN daje 409 bez wyboru najnowszego rekordu', () => {
  assert.throws(
    () =>
      resolveSingleOpenCycle(
        [cycle(), cycle({ event_id: 'EV-2', zone_id: 'BC0002' })],
        'WD-1',
      ),
    (error) => {
      assert.equal(error.statusCode, 409)
      assert.equal(error.publicCode, MOBILE_OPEN_CYCLE_ERROR.MULTIPLE_OPEN)
      assert.deepEqual(error.publicDetails.eventIds, ['EV-1', 'EV-2'])
      return true
    },
  )
})

test('otwarty CLEAN z innego dnia nie jest uznawany za dzisiejszy START ani STOP', () => {
  assert.throws(
    () => resolveSingleOpenCycle([cycle({ workday_id: 'WD-OLD' })], 'WD-TODAY'),
    (error) => {
      assert.equal(error.statusCode, 409)
      assert.equal(error.publicCode, MOBILE_OPEN_CYCLE_ERROR.OTHER_WORKDAY)
      return true
    },
  )
})

test('powielony odczyt tego samego eventId nie tworzy falszywego konfliktu', () => {
  const first = cycle()
  const duplicate = cycle({ zone_id: 'BC0099' })
  assert.deepEqual(uniqueOpenCycles([first, duplicate]), [first])
  assert.equal(resolveSingleOpenCycle([first, duplicate], 'WD-1'), first)
})

test('nierozstrzygniety otwarty wpis bez event_type blokuje CLEAN bez zgadywania', () => {
  assert.throws(
    () => assertNoUnresolvedOpenEvents([cycle({ event_type: null })]),
    (error) => {
      assert.equal(error.statusCode, 409)
      assert.equal(error.publicCode, MOBILE_OPEN_CYCLE_ERROR.UNRESOLVED_LEGACY)
      assert.deepEqual(error.publicDetails.eventIds, ['EV-1'])
      return true
    },
  )
  assert.doesNotThrow(() => assertNoUnresolvedOpenEvents([]))
})
