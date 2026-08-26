'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  MOBILE_OPEN_CYCLE_ERROR,
  assertNoUnresolvedOpenEvents,
  resolveOpenCycleState,
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
  assert.deepEqual(resolveOpenCycleState([], 'WD-1'), {
    activeCycle: null,
    staleCycles: [],
  })
})

test('jeden CLEAN z aktywnego dnia jest prawidlowym stanem', () => {
  const row = cycle()
  assert.equal(resolveSingleOpenCycle([row], 'WD-1'), row)
  assert.deepEqual(resolveOpenCycleState([row], 'WD-1'), {
    activeCycle: row,
    staleCycles: [],
  })
})

test('kilka otwartych CLEAN w aktywnym Workday daje 409 bez wyboru najnowszego rekordu', () => {
  assert.throws(
    () =>
      resolveOpenCycleState(
        [
          cycle(),
          cycle({ event_id: 'EV-2', zone_id: 'BC0002' }),
          cycle({ event_id: 'EV-OLD', workday_id: 'WD-OLD' }),
        ],
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

test('otwarty CLEAN z innego Workday nie blokuje i jest zwracany do naprawy', () => {
  const stale = cycle({ workday_id: 'WD-OLD' })
  assert.equal(resolveSingleOpenCycle([stale], 'WD-TODAY'), null)
  assert.deepEqual(resolveOpenCycleState([stale], 'WD-TODAY'), {
    activeCycle: null,
    staleCycles: [stale],
  })
})

test('aktywny CLEAN i stare CLEAN sa rozdzielane wedlug activeWorkdayId', () => {
  const active = cycle()
  const staleOne = cycle({ event_id: 'EV-OLD-1', workday_id: 'WD-OLD-1' })
  const staleTwo = cycle({ event_id: 'EV-OLD-2', workday_id: 'WD-OLD-2' })
  assert.deepEqual(resolveOpenCycleState([staleOne, active, staleTwo], 'WD-1'), {
    activeCycle: active,
    staleCycles: [staleOne, staleTwo],
  })
})

test('bez aktywnego Workday poprawnie powiazane CLEAN sa tylko starymi wpisami do naprawy', () => {
  const stale = cycle({ workday_id: 'WD-OLD' })
  assert.deepEqual(resolveOpenCycleState([stale]), {
    activeCycle: null,
    staleCycles: [stale],
  })
})

test('otwarty CLEAN bez workdayId daje konflikt integralnosci', () => {
  const unresolved = cycle({ workday_id: null })
  assert.throws(
    () => resolveOpenCycleState([unresolved], 'WD-1'),
    (error) => {
      assert.equal(error.statusCode, 409)
      assert.equal(error.publicCode, MOBILE_OPEN_CYCLE_ERROR.INTEGRITY)
      assert.deepEqual(error.publicDetails.integrityIssues, [
        { eventId: 'EV-1', reason: 'MISSING_WORKDAY_ID' },
      ])
      return true
    },
  )
})

test('powielony odczyt tego samego eventId nie tworzy falszywego konfliktu', () => {
  const first = cycle()
  const duplicate = cycle({ zone_id: 'BC0099' })
  assert.deepEqual(uniqueOpenCycles([first, duplicate]), [first])
  assert.equal(resolveSingleOpenCycle([first, duplicate], 'WD-1'), first)
  assert.deepEqual(resolveOpenCycleState([first, duplicate], 'WD-1'), {
    activeCycle: first,
    staleCycles: [],
  })
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
