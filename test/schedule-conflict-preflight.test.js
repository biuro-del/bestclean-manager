'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

async function loadPreflightModule() {
  const modulePath = path.join(
    __dirname,
    '..',
    'web-app',
    'apps',
    'portal-web',
    'src',
    'services',
    'scheduleConflictPreflight.js',
  )
  return import(pathToFileURL(modulePath).href)
}

test('automatyczny zapis pelnego snapshotu nie blokuje sie na niepowiazanej historii', async () => {
  const { scheduleConflictPreflightCandidates } = await loadPreflightModule()
  const result = scheduleConflictPreflightCandidates({
    snapshot: [
      { id: 'historical-conflict-a' },
      { id: 'historical-conflict-b' },
    ],
  })

  assert.deepEqual(result, [])
})

test('reczny zapis sprawdza wylacznie jawnie zmienione zlecenie', async () => {
  const { scheduleConflictPreflightCandidates } = await loadPreflightModule()
  const changedOrder = { id: 'changed-order', dateYmd: '2026-08-12' }
  const result = scheduleConflictPreflightCandidates({
    retainLocalOrders: [changedOrder, changedOrder, { title: 'missing id' }],
  })

  assert.deepEqual(result, [changedOrder])
})
