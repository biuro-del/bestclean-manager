'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const backend = fs.readFileSync(path.join(repoRoot, 'index.js'), 'utf8')
const migration = fs.readFileSync(
  path.join(repoRoot, 'dataconnect', 'migrations', '20260727_task_lifecycle_additive.sql'),
  'utf8',
)
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))

test('POST schedule-orders ma zgodny kontrakt zapisu po migracji lifecycle', () => {
  assert.match(backend, /PORTAL_SCHEDULE_ORDERS_PATH\s*=\s*['"]\/api\/portal\/schedule-orders['"]/)
  assert.match(backend, /async function handlePortalScheduleOrdersRequest/)
  assert.match(backend, /await assertPortalScheduleOrderSchemaReady\(client\)/)
  assert.doesNotMatch(backend, /create table if not exists public\.task/i)
  assert.match(backend, /TASK_LIFECYCLE_SCHEMA_MISSING/)
  assert.match(backend, /SCHEDULE_ORDER_SQL_PARAMETER_MISMATCH/)
  assert.match(backend, /PORTAL_SCHEDULE_ORDERS_FAILED/)
  assert.match(backend, /const rows = rawOrders\.map\(\(order\) => portalScheduleOrderDbRow/)
  assert.match(backend, /await upsertPortalScheduleOrderTask\(client, row\)/)
  assert.match(backend, /lifecycle_status:\s*lifecycleStatus/)

  assert.match(migration, /add column if not exists lifecycle_status varchar\(20\)/i)
  assert.match(migration, /set lifecycle_status = 'ACTIVE'/i)
  assert.match(migration, /alter column lifecycle_status set not null/i)
  assert.match(migration, /task_lifecycle_status_check/i)
  assert.equal(
    packageJson.scripts['migrate:task-lifecycle'],
    'node scripts/migrate-task-lifecycle.js',
  )
})
