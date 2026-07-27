'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const migrationPath = path.join(
  __dirname,
  '..',
  'dataconnect',
  'migrations',
  '20260724_worker_legacy_guard_retirement.sql',
)

const source = fs.readFileSync(migrationPath, 'utf8')

test('retirement nie zmienia rekordow ani kolumn Worker', () => {
  assert.match(source, /CONTROLLED COMPATIBILITY MIGRATION/)
  assert.doesNotMatch(source, /\bupdate\s+public\.worker\b/i)
  assert.doesNotMatch(source, /\bdelete\s+from\s+public\.worker\b/i)
  assert.doesNotMatch(source, /\binsert\s+into\s+public\.worker\b/i)
  assert.doesNotMatch(source, /alter\s+table/i)
  assert.doesNotMatch(source, /drop\s+trigger/i)
  assert.doesNotMatch(source, /drop\s+function/i)
})

test('retirement jest fail-closed i najpierw weryfikuje komplet zamiennikow', () => {
  assert.match(source, /^begin;/m)
  assert.match(source, /^commit;/m)
  assert.match(source, /set local lock_timeout = '5s'/i)
  assert.match(source, /set local statement_timeout = '60s'/i)
  assert.match(source, /pg_advisory_xact_lock/i)
  assert.match(source, /WORKER_REPLACEMENT_GUARD_INVALID/)
  assert.match(source, /WORKER_REPLACEMENT_GUARD_INCOMPATIBLE/)
  assert.match(source, /WORKER_NORMALIZATION_TRIGGER_INCOMPATIBLE/)
  assert.match(source, /WORKER_NORMALIZATION_MISMATCHES_FOUND/)
  assert.match(source, /WORKER_LEGACY_GUARD_RETIREMENT_POSTFLIGHT_FAILED/)
})

test('retirement usuwa tylko dwa redundantne indeksy wskazane przez sql diff', () => {
  const droppedIndexes = source.match(/drop index if exists/gi) || []

  assert.equal(droppedIndexes.length, 2)
  assert.match(
    source,
    /drop index if exists public\.worker_org_login_ci_uidx/i,
  )
  assert.match(
    source,
    /drop index if exists public\.worker_org_worker_id_ci_uidx/i,
  )
  assert.doesNotMatch(
    source,
    /drop index if exists public\.worker_org_login_normalized_uidx/i,
  )
  assert.doesNotMatch(
    source,
    /drop index if exists public\.worker_org_worker_id_normalized_uidx/i,
  )
})
