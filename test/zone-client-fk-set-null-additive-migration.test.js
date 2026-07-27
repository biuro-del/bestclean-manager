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
  '20260724_zone_client_fk_set_null_additive.sql',
)

const source = fs.readFileSync(migrationPath, 'utf8')

test('migracja FK Zone nie zmienia danych, nullability ani indeksow Worker', () => {
  assert.match(source, /CONTROLLED ADDITIVE MIGRATION/)
  assert.doesNotMatch(source, /\bupdate\s+public\./i)
  assert.doesNotMatch(source, /\bdelete\s+from\s+public\./i)
  assert.doesNotMatch(source, /\binsert\s+into\s+public\./i)
  assert.doesNotMatch(source, /alter\s+column/i)
  assert.doesNotMatch(source, /drop\s+index/i)
  assert.match(source, /old_login_guard_preserved/)
  assert.match(source, /old_worker_id_guard_preserved/)
  assert.match(source, /new_login_guard_preserved/)
  assert.match(source, /new_worker_id_guard_preserved/)
})

test('migracja jest transakcyjna, ograniczona czasowo i fail-closed', () => {
  assert.match(source, /^begin;/m)
  assert.match(source, /^commit;/m)
  assert.match(source, /set local lock_timeout = '5s'/i)
  assert.match(source, /set local statement_timeout = '60s'/i)
  assert.match(source, /pg_advisory_xact_lock/i)
  assert.match(source, /ZONE_CLIENT_REQUIRED_TABLE_MISSING/)
  assert.match(source, /ZONE_CLIENT_COLUMN_SHAPE_UNSAFE/)
  assert.match(source, /ZONE_CLIENT_ORPHANS_FOUND/)
  assert.match(source, /ZONE_CLIENT_FK_SHAPE_UNSAFE/)
  assert.match(source, /ZONE_CLIENT_FK_POSTFLIGHT_FAILED/)
})

test('migracja zmienia tylko oczekiwany FK na definicje wymagana przez Data Connect', () => {
  const droppedConstraints =
    source.match(/drop constraint zone_org_id_client_id_fkey/gi) || []

  assert.equal(droppedConstraints.length, 1)
  assert.match(
    source,
    /foreign key \(org_id, client_id\)[\s\S]*references public\.client \(org_id, client_id\)[\s\S]*on delete set null[\s\S]*not valid/i,
  )
  assert.match(
    source,
    /validate constraint zone_org_id_client_id_fkey/i,
  )
  assert.match(source, /constraint_delete_action not in \('c', 'n'\)/i)
  assert.match(source, /constraint_delete_action is distinct from 'n'/i)
  assert.match(source, /constraint_definition not like '%ON DELETE SET NULL'/i)
})
