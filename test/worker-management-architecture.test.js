'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const featureRoot = path.join(
  repoRoot,
  'web-app',
  'apps',
  'portal-web',
  'src',
  'features',
  'workers',
  'worker-management',
)

function read(relativePath) {
  return fs.readFileSync(path.join(featureRoot, relativePath), 'utf8')
}

test('zarządzanie pracownikami ma osobne warstwy i stabilną fasadę', () => {
  const facade = read('index.js')
  ;[
    'domain/workerCrudModel.js',
    'application/workerCrudController.js',
    'infrastructure/workerGateway.js',
    'state/workerDirectoryState.js',
    'ui/workerFormView.js',
  ].forEach((relativePath) => assert.equal(fs.existsSync(path.join(featureRoot, relativePath)), true))

  assert.match(facade, /createWorkerCrudController/)
  assert.match(facade, /createWorkerGateway/)
  assert.match(facade, /createWorkerDirectoryState/)
  assert.match(facade, /createWorkerFormView/)
})

test('domena i kontroler CRUD nie zależą od DOM, appState ani workerService', () => {
  const domain = read('domain/workerCrudModel.js')
  const controller = read('application/workerCrudController.js')

  ;[domain, controller].forEach((source) => {
    assert.doesNotMatch(source, /\bdocument\b/)
    assert.doesNotMatch(source, /\bwindow\b/)
    assert.doesNotMatch(source, /\bappState\b/)
    assert.doesNotMatch(source, /workerService/)
  })
})

test('stary widok korzysta z fasady i nie wykonuje bezpośrednio operacji CRUD', () => {
  const legacyView = fs.readFileSync(
    path.join(
      repoRoot,
      'web-app',
      'apps',
      'portal-web',
      'src',
      'features',
      'workers',
      'worker_list_profile',
      'index.js',
    ),
    'utf8',
  )

  assert.match(legacyView, /from '\.\.\/worker-management\/index\.js'/)
  assert.match(legacyView, /workerCrudController\.save/)
  assert.match(legacyView, /workerCrudController\.remove/)
  assert.doesNotMatch(legacyView, /await createWorkerUser\(/)
  assert.doesNotMatch(legacyView, /await updateWorker\(/)
  assert.doesNotMatch(legacyView, /await deleteWorker\(/)
  assert.doesNotMatch(legacyView, /await setWorkerPassword\(/)
})
