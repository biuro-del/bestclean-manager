'use strict'

const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const migration = readFileSync(
  path.join(__dirname, '../dataconnect/migrations/20260926_mobile_scan_offline_outbox_additive.sql'),
  'utf8',
)
const server = readFileSync(path.join(__dirname, '../index.js'), 'utf8')

test('offline scan ma osobna addytywna migracje i runtime nie tworzy tabel', () => {
  assert.match(migration, /begin;/i)
  assert.match(migration, /pg_advisory_xact_lock/i)
  assert.match(migration, /request_fingerprint varchar\(64\)/i)
  assert.match(migration, /occurred_at timestamptz/i)
  assert.match(migration, /received_at timestamptz/i)
  assert.match(migration, /offline boolean not null default false/i)
  assert.match(migration, /MOBILE_SCAN_COMMAND_POSTFLIGHT_FAILED/)
  assert.doesNotMatch(server, /create table if not exists public\.mobile_scan_command/i)
  assert.doesNotMatch(server, /create table if not exists public\.worker_runtime_state/i)
})
