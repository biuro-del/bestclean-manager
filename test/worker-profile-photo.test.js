'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const backend = fs.readFileSync(path.join(repoRoot, 'index.js'), 'utf8')
const migration = fs.readFileSync(
  path.join(repoRoot, 'dataconnect', 'migrations', '20260728_worker_photo_url_additive.sql'),
  'utf8',
)
const schema = fs.readFileSync(path.join(repoRoot, 'dataconnect', 'schema', 'schema.gql'), 'utf8')
const storageRules = fs.readFileSync(path.join(repoRoot, 'storage.rules'), 'utf8')
const dashboard = fs.readFileSync(
  path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'features', 'dashboard', 'index.js'),
  'utf8',
)
const workerService = fs.readFileSync(
  path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'services', 'workerService.js'),
  'utf8',
)
const accountTemplate = fs.readFileSync(
  path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'features', 'workers', 'account', 'template.html'),
  'utf8',
)
const profileTemplate = fs.readFileSync(
  path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'features', 'workers', 'worker_list_profile', 'template.html'),
  'utf8',
)

test('zdjęcie pracownika ma addytywną kolumnę i pole w schemacie', () => {
  assert.match(migration, /add column if not exists photo_url text/i)
  assert.match(migration, /set local lock_timeout = '5s'/i)
  assert.match(migration, /set local statement_timeout = '60s'/i)
  assert.match(migration, /pg_advisory_xact_lock/i)
  assert.match(migration, /Required table public\.worker does not exist/i)
  assert.match(migration, /Expected nullable text without a default/i)
  assert.doesNotMatch(migration, /\bdrop\b|\btruncate\b|^\s*update\s|^\s*delete\s/im)
  assert.match(schema, /photoUrl: String @col\(name: "photo_url"\)/)
})

test('upload odbywa się po stronie backendu i odrzuca nieobsługiwane formaty oraz zbyt duże pliki', () => {
  assert.match(backend, /image\\\/\(\?:png\|jpe\?g\|webp\)/)
  assert.match(backend, /MAX_WORKER_PROFILE_PHOTO_BYTES/)
  assert.match(backend, /uploadWorkerProfilePhoto/)
  assert.match(backend, /source: 'portal-worker-profile'/)
  assert.match(backend, /workerProfilePhotoObjectFromUrl/)
  assert.match(backend, /deleteWorkerProfilePhotoObject/)
})

test('pliki profilu nie są zapisywalne bezpośrednio przez klienta', () => {
  assert.match(storageRules, /match \/orgs\/\{orgId\}\/worker-profiles/)
  assert.match(storageRules, /allow create, update, delete: if false/)
})

test('oba ekrany profilu pozwalają wybrać zdjęcie, a pulpit je wykorzystuje', () => {
  assert.match(accountTemplate, /id="waPhotoInput"/)
  assert.match(accountTemplate, /id="waSelectPhotoBtn"/)
  assert.match(profileTemplate, /id="wkEditPhoto"/)
  assert.match(profileTemplate, /id="wkRemovePhotoBtn"/)
  assert.match(dashboard, /dashboardActiveWorkerMapPhotoUrl/)
  assert.match(dashboard, /location\?\.photoUrl/)
})

test('lista pracownikow pobiera photo_url bez poszerzania produkcyjnego wdrozenia Data Connect', () => {
  assert.match(backend, /ADMIN_WORKERS_PATH = '\/api\/admin\/workers'/)
  assert.match(backend, /listWorkersDirect/)
  assert.match(backend, /w\.photo_url/)
  assert.match(workerService, /workersList: '\/api\/admin\/workers'/)
  assert.match(workerService, /const response = await workersList\(orgId\)/)
  assert.doesNotMatch(workerService, /workersForOrg\(\{ orgId \}/)
})
