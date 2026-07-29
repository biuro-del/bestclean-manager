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
  '20260724_worker_identity_normalization_additive.sql',
)

const source = fs.readFileSync(migrationPath, 'utf8')

test('migracja nie zmienia źródłowego loginu ani worker_id i zachowuje stare guardy', () => {
  assert.match(source, /CONTROLLED ADDITIVE MIGRATION/)
  assert.doesNotMatch(source, /drop\s+index/i)
  assert.doesNotMatch(source, /drop\s+constraint/i)
  assert.doesNotMatch(source, /alter\s+column\s+login\b/i)
  assert.doesNotMatch(source, /alter\s+column\s+worker_id\b/i)
  assert.doesNotMatch(source, /set\s+login\s*=/i)
  assert.doesNotMatch(source, /set\s+worker_id\s*=/i)
  assert.match(source, /old_login_guard_preserved/)
  assert.match(source, /old_worker_id_guard_preserved/)
  assert.match(source, /worker_org_login_ci_uidx/)
  assert.match(source, /worker_org_worker_id_ci_uidx/)
})

test('migracja zatrzymuje się przed zapisem przy duplikatach normalizowanych', () => {
  assert.match(source, /WORKER_LOGIN_NORMALIZED_DUPLICATES_FOUND/)
  assert.match(source, /WORKER_ID_NORMALIZED_DUPLICATES_FOUND/)
  assert.match(source, /group by org_id, lower\(btrim\(login\)\)/i)
  assert.match(source, /group by org_id, lower\(btrim\(worker_id\)\)/i)
  assert.match(source, /pg_advisory_xact_lock/)
  assert.match(source, /lock table public\.worker in share row exclusive mode/i)
  assert.match(source, /set local lock_timeout = '5s'/i)
})

test('migracja utrzymuje jawne pola i dwa addytywne indeksy unikalne', () => {
  assert.match(
    source,
    /add column if not exists worker_id_normalized varchar\(128\)/i,
  )
  assert.match(
    source,
    /set login_normalized = lower\(btrim\(login\)\)/i,
  )
  assert.match(
    source,
    /set worker_id_normalized = nullif\(lower\(btrim\(worker_id\)\), ''\)/i,
  )
  assert.match(source, /before insert or update on public\.worker/i)
  assert.match(
    source,
    /new\.login_normalized := lower\(btrim\(new\.login\)\)/i,
  )
  assert.match(
    source,
    /new\.worker_id_normalized := nullif\(lower\(btrim\(new\.worker_id\)\), ''\)/i,
  )
  assert.match(
    source,
    /create unique index if not exists worker_org_login_normalized_uidx/i,
  )
  assert.match(
    source,
    /create unique index if not exists worker_org_worker_id_normalized_uidx/i,
  )
  assert.match(source, /WORKER_IDENTITY_NORMALIZATION_POSTFLIGHT_FAILED/)
})
