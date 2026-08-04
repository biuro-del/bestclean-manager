'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { resolveScheduleOrderRequiredPeople } = require('../schedule-order-staffing-policy')

test('BUFOR zachowuje jawną liczbę wymaganych miejsc mimo pustej obsady', () => {
  assert.equal(resolveScheduleOrderRequiredPeople({ requiredPeople: 3 }, []), 3)
  assert.equal(resolveScheduleOrderRequiredPeople({ requiredWorkers: 2 }, []), 2)
})

test('liczba przypisanych osób nie może przewyższać zapisanej liczby wymaganej', () => {
  assert.equal(
    resolveScheduleOrderRequiredPeople({ requiredPeople: 1 }, ['W001', 'W002']),
    2,
  )
})

test('duplikaty identyfikatora pracownika nie zawyżają wymaganej obsady', () => {
  assert.equal(
    resolveScheduleOrderRequiredPeople({ requiredPeople: 1 }, ['W001', 'w001', ' W001 ']),
    1,
  )
})
