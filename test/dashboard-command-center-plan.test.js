'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const modelModule = import(
  '../web-app/apps/portal-web/src/features/dashboard/commandCenterPlanModel.js'
)

test('plan dnia koreluje postep wyłącznie po zapisanych identyfikatorach', async () => {
  const { buildCommandCenterPlanModel } = await modelModule
  const model = buildCommandCenterPlanModel({
    plannedOrders: [
      { taskId: 'TASK-1', title: 'Obiekt A' },
      { taskId: 'TASK-2', title: 'Obiekt B' },
      { taskId: 'TASK-3', title: 'Obiekt C' },
    ],
    activeOperations: [
      { taskId: 'TASK-2', planned: true },
      { title: 'Obiekt C', planned: true },
    ],
    completedOperations: [
      { taskId: 'TASK-1', planned: true, completionConfirmed: true },
    ],
  })

  assert.equal(model.completedCount, 1)
  assert.equal(model.activeCount, 1)
  assert.equal(model.waitingCount, 1)
  assert.equal(model.progressPercent, 33)
})

test('anulowane pozycje nie obniżają procentu wykonania', async () => {
  const { buildCommandCenterPlanModel } = await modelModule
  const model = buildCommandCenterPlanModel({
    plannedOrders: [
      { taskId: 'TASK-1' },
      { taskId: 'TASK-2', status: 'CANCELLED' },
    ],
    completedOperations: [
      { taskId: 'TASK-1', planned: true, completionConfirmed: true },
    ],
  })

  assert.equal(model.totalCount, 2)
  assert.equal(model.cancelledCount, 1)
  assert.equal(model.progressPercent, 100)
})

test('najbliższe 60 minut pokazuje tylko nierozpoczęty plan w oknie czasu', async () => {
  const { buildCommandCenterPlanModel } = await modelModule
  const nowTs = new Date('2026-07-28T13:00:00+02:00').getTime()
  const model = buildCommandCenterPlanModel({
    nowTs,
    plannedOrders: [
      { taskId: 'ACTIVE', startTs: nowTs + 10 * 60 * 1000 },
      { taskId: 'SOON', startTs: nowTs + 45 * 60 * 1000 },
      { taskId: 'LATER', startTs: nowTs + 90 * 60 * 1000 },
      { taskId: 'DONE', startTs: nowTs + 30 * 60 * 1000 },
    ],
    activeOperations: [{ taskId: 'ACTIVE', planned: true }],
    completedOperations: [
      { taskId: 'DONE', planned: true, completionConfirmed: true },
    ],
  })

  assert.deepEqual(model.upcoming.map((item) => item.taskId), ['SOON'])
})
