'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const modelModule = import(
  '../web-app/apps/portal-web/src/features/workers/account/workdayTimeEditorModel.js'
)

test('intencja z workdayId wybiera tylko dokładny rekord z zagregowanego dnia', async () => {
  const { findPendingTimeEditorItem, timeEditorSourceRows } = await modelModule
  const rows = [{
    dayKey: '2026-07-06',
    sourceRows: [
      { workdayId: 'WD-CLOSED', status: 'CLOSED', endAt: '2026-07-06T15:43:18.000Z' },
      { workdayId: 'WD-OPEN', status: 'RUNNING', endAt: '' },
    ],
  }]

  const item = findPendingTimeEditorItem(rows, {
    dayKey: '2026-07-06',
    workdayId: 'WD-OPEN',
  })
  assert.equal(item, rows[0])
  assert.deepEqual(timeEditorSourceRows(item, 'WD-OPEN'), [
    { workdayId: 'WD-OPEN', status: 'RUNNING', endAt: '' },
  ])
})

test('brak dokładnego workdayId zatrzymuje edycję zamiast wybierać inny rekord dnia', async () => {
  const { findPendingTimeEditorItem } = await modelModule
  const rows = [{
    dayKey: '2026-07-06',
    sourceRows: [{ workdayId: 'WD-CLOSED', status: 'CLOSED' }],
  }]

  assert.equal(
    findPendingTimeEditorItem(rows, {
      dayKey: '2026-07-06',
      workdayId: 'WD-MISSING',
    }),
    null,
  )
})

test('zwykła edycja dnia bez workdayId zachowuje dotychczasowy zestaw źródeł', async () => {
  const { findPendingTimeEditorItem, timeEditorSourceRows } = await modelModule
  const rows = [{
    dayKey: '2026-07-06',
    sourceRows: [
      { workdayId: 'WD-1' },
      { workdayId: 'WD-2' },
    ],
  }]

  assert.equal(findPendingTimeEditorItem(rows, { dayKey: '2026-07-06' }), rows[0])
  assert.deepEqual(timeEditorSourceRows(rows[0]), rows[0].sourceRows)
})

test('edytor Workday zachowuje sekundy wymagane do dokladnej korekty STOP', async () => {
  const { preciseTimeInputValue } = await modelModule
  const localTimestamp = new Date(2026, 6, 6, 17, 44, 6).toISOString()

  assert.equal(preciseTimeInputValue(localTimestamp), '17:44:06')
})
