'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const integrityModule = import('../web-app/apps/portal-web/src/services/openWorkdayIntegrity.js')

function workday(overrides = {}) {
  return {
    workdayId: 'WD-1',
    workerLogin: 'marta.cisak',
    startAt: '2026-07-23T07:00:00.000Z',
    endAt: null,
    status: 'RUNNING',
    ...overrides,
  }
}

test('otwarty Workday blokuje nowy dzień niezależnie od wielkości liter loginu', async () => {
  const { findOpenWorkdayForWorker } = await integrityModule
  assert.equal(
    findOpenWorkdayForWorker([workday()], { workerLogin: 'MARTA.CISAK' })?.workdayId,
    'WD-1',
  )
})

test('zamknięty lub wykluczony Workday nie blokuje edycji własnego rekordu', async () => {
  const { findOpenWorkdayForWorker } = await integrityModule
  assert.equal(
    findOpenWorkdayForWorker(
      [
        workday({ endAt: '2026-07-23T15:00:00.000Z', status: 'CLOSED' }),
        workday({ workdayId: 'WD-EDIT' }),
      ],
      { workerLogin: 'marta.cisak' },
      { excludeRecordIds: ['WD-EDIT'] },
    ),
    null,
  )
})

test('pusty status bez endAt pozostaje otwartym dniem', async () => {
  const { isOpenWorkday } = await integrityModule
  assert.equal(isOpenWorkday(workday({ status: '' })), true)
})
