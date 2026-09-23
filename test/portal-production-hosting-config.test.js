const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repositoryRoot = path.resolve(__dirname, '..')
const productionConfigPath = path.join(repositoryRoot, 'firebase.portal-production.json')

const expectedRewrites = [
  {
    source: '/authBootstrapMembership',
    run: { serviceId: 'authbootstrapmembership', region: 'europe-west3' },
  },
  {
    source: '/authProvisionWorker',
    function: { functionId: 'workerAdminApi', region: 'europe-central2' },
  },
  {
    source: '/authRollbackWorker',
    function: { functionId: 'workerAdminApi', region: 'europe-central2' },
  },
  {
    source: '/adminWorkerProfileUpdate',
    function: { functionId: 'workerAdminApi', region: 'europe-central2' },
  },
  {
    source: '/adminWorkerProfileDelete',
    function: { functionId: 'workerAdminApi', region: 'europe-central2' },
  },
  {
    source: '/adminWorkerPasswordReveal',
    function: { functionId: 'workerAdminApi', region: 'europe-central2' },
  },
  {
    source: '/adminWorkerPasswordSet',
    function: { functionId: 'workerAdminApi', region: 'europe-central2' },
  },
  {
    source: '/api/worker-admin/**',
    function: { functionId: 'workerAdminApi', region: 'europe-central2' },
  },
  {
    source: '/api/auth/provision-worker',
    function: { functionId: 'workerAdminApi', region: 'europe-central2' },
  },
  {
    source: '/api/auth/rollback-worker',
    function: { functionId: 'workerAdminApi', region: 'europe-central2' },
  },
  {
    source: '/api/admin/worker-profile/**',
    function: { functionId: 'workerAdminApi', region: 'europe-central2' },
  },
  {
    source: '/api/admin/worker-password/**',
    function: { functionId: 'workerAdminApi', region: 'europe-central2' },
  },
  {
    source: '/api/**',
    run: { serviceId: 'api', region: 'europe-central2' },
  },
  { source: '**', destination: '/index.html' },
]

test('dedicated production Hosting config preserves the verified live routing contract', () => {
  const config = JSON.parse(fs.readFileSync(productionConfigPath, 'utf8'))

  assert.deepEqual(Object.keys(config), ['hosting'])
  assert.equal(config.hosting.site, 'cleanzi-01')
  assert.equal(config.hosting.public, 'web-app/dist')
  assert.deepEqual(config.hosting.rewrites, expectedRewrites)
})

test('production Hosting config stays isolated from preview and backend deployment config', () => {
  const config = JSON.parse(fs.readFileSync(productionConfigPath, 'utf8'))

  assert.equal(config.functions, undefined)
  assert.equal(config.firestore, undefined)
  assert.equal(config.storage, undefined)
  assert.equal(config.dataconnect, undefined)
  assert.ok(config.hosting.ignore.includes('firebase.portal-production.json'))
})
