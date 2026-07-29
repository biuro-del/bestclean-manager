'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const test = require('node:test')

async function loadLifecycleModule() {
  const modulePath = path.join(
    __dirname,
    '..',
    'web-app',
    'apps',
    'portal-web',
    'src',
    'services',
    'scheduleOrderLifecycle.js',
  )
  return import(pathToFileURL(modulePath).href)
}

test('frontend i backend uznaja te same statusy planu za nieaktywne', async () => {
  const frontend = await loadLifecycleModule()
  const backend = require('../worker-schedule-conflict-policy')
  const samples = [
    { lifecycleStatus: 'ACTIVE' },
    { lifecycleStatus: 'CANCELLED' },
    { lifecycleStatus: 'CANCELED' },
    { lifecycleStatus: 'ARCHIVED' },
    { canceledAt: '2026-07-27T10:00:00Z' },
    { archivedAt: '2026-07-27T10:00:00Z' },
    { lifecycleStatus: 'UNKNOWN' },
  ]

  for (const sample of samples) {
    assert.equal(
      frontend.isScheduleOrderActive(sample),
      backend.isScheduleOrderActive(sample),
      JSON.stringify(sample),
    )
  }
})

test('filtr frontendu zachowuje tylko aktywne zlecenia', async () => {
  const { filterActiveScheduleOrders } = await loadLifecycleModule()
  const result = filterActiveScheduleOrders([
    { id: 'active', lifecycleStatus: 'ACTIVE' },
    { id: 'cancelled', lifecycleStatus: 'CANCELLED' },
    { id: 'archived', lifecycleStatus: 'ARCHIVED' },
  ])

  assert.deepEqual(result.map((order) => order.id), ['active'])
})
