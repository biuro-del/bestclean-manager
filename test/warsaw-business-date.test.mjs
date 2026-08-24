import assert from 'node:assert/strict'
import test from 'node:test'

import {
  businessDateYmd,
  daysAgoYmd,
  todayYmd,
  ymdToWarsawIsoRangeEnd,
  ymdToWarsawIsoRangeStart,
} from '../web-app/apps/portal-web/src/app/shared/index.js'

test('dzień biznesowy jest wyznaczany w Europe/Warsaw niezależnie od strefy procesu', () => {
  assert.equal(businessDateYmd('2026-07-31T22:30:00.000Z'), '2026-08-01')
  assert.equal(todayYmd(new Date('2026-07-31T22:30:00.000Z')), '2026-08-01')
  assert.equal(daysAgoYmd(1, new Date('2026-08-01T00:30:00.000Z')), '2026-07-31')
})

test('zakres letniego dnia biznesowego używa północy Europe/Warsaw', () => {
  assert.equal(ymdToWarsawIsoRangeStart('2026-07-23'), '2026-07-22T22:00:00.000Z')
  assert.equal(ymdToWarsawIsoRangeEnd('2026-07-23'), '2026-07-23T21:59:59.999Z')
})

test('zakres uwzględnia skrócony i wydłużony dzień podczas zmiany DST', () => {
  assert.equal(ymdToWarsawIsoRangeStart('2026-03-29'), '2026-03-28T23:00:00.000Z')
  assert.equal(ymdToWarsawIsoRangeEnd('2026-03-29'), '2026-03-29T21:59:59.999Z')
  assert.equal(ymdToWarsawIsoRangeStart('2026-10-25'), '2026-10-24T22:00:00.000Z')
  assert.equal(ymdToWarsawIsoRangeEnd('2026-10-25'), '2026-10-25T22:59:59.999Z')
})

test('niepoprawna data kalendarzowa nie tworzy zakresu', () => {
  assert.equal(ymdToWarsawIsoRangeStart('2026-02-30'), '')
  assert.equal(ymdToWarsawIsoRangeEnd('2026-02-30'), '')
  assert.equal(ymdToWarsawIsoRangeStart('2026-07-23T00:00:00Z'), '')
})
