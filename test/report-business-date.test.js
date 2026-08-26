'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const modelModule = import(
  '../web-app/apps/portal-web/src/features/reports/reportBusinessDateModel.js'
)

test('raport wyznacza legacy business day w Europe/Warsaw', async () => {
  const { reportBusinessDateYmd } = await modelModule

  assert.equal(
    reportBusinessDateYmd({
      dayKey: '2026-03-28',
      startAt: '2026-03-28T23:30:00.000Z',
    }),
    '2026-03-29',
  )
  assert.equal(
    reportBusinessDateYmd({ startAt: '2026-10-24T22:30:00.000Z' }),
    '2026-10-25',
  )
})

test('skorygowana businessDateYmd ma pierwszenstwo przed czasem i starym dayKey', async () => {
  const { reportBusinessDateYmd } = await modelModule

  assert.equal(
    reportBusinessDateYmd({
      businessDateYmd: '2026-07-22',
      dayKey: '2026-07-23',
      startAt: '2026-07-23T12:47:00.000Z',
    }),
    '2026-07-22',
  )
  assert.equal(
    reportBusinessDateYmd({
      business_date_ymd: '2026-07-24',
      startAt: '2026-07-23T12:47:00.000Z',
    }),
    '2026-07-24',
  )
})
