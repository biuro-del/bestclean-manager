'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const test = require('node:test')

const stateModule = import(
  pathToFileURL(
    path.join(
      __dirname,
      '..',
      'web-app',
      'apps',
      'portal-web',
      'src',
      'features',
      'workers',
      'worker-management',
      'state',
      'workerDirectoryState.js',
    ),
  ).href,
)

test('adapter utrzymuje zgodność workerProfileRows i workers', async () => {
  const { createWorkerDirectoryState } = await stateModule
  const appState = { workerProfileRows: [], workers: [], workersLoaded: false }
  const selectedKeys = new Set(['old@example.com'])
  const changes = []
  const directory = createWorkerDirectoryState({
    appState,
    selectedKeys,
    normalizeRow: (worker) => ({ ...worker, normalized: true }),
    onRowsChanged: (options) => changes.push(options),
  })

  directory.replace([{ login: 'old@example.com', name: 'Old' }])
  directory.upsert('old@example.com', { login: 'new@example.com', name: 'New' })
  directory.remove({ login: 'new@example.com' })

  assert.deepEqual(appState.workerProfileRows, [])
  assert.deepEqual(appState.workers, [])
  assert.equal(appState.workersLoaded, true)
  assert.equal(selectedKeys.size, 0)
  assert.deepEqual(changes, [{ resetPage: true }, { resetPage: false }, { resetPage: false }])
})
