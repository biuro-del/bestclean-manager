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
  '20260728_job_card_publication_additive.sql',
)

test('migracja Karty Zlecenia jest addytywna i chroni rewizje przed zmianą', () => {
  const source = fs.readFileSync(migrationPath, 'utf8')
  assert.match(source, /create table if not exists public\.job_card_draft/i)
  assert.match(source, /create table if not exists public\.job_card_revision/i)
  assert.match(source, /primary key \(org_id, source_order_id, revision\)/i)
  assert.match(source, /job_card_revision_output_hash_uidx/i)
  assert.match(source, /JOB_CARD_REVISION_IMMUTABLE/)
  assert.match(source, /before update on public\.job_card_revision/i)
  assert.match(source, /before delete on public\.job_card_revision/i)
  assert.match(source, /set local lock_timeout = '5s'/i)
  assert.match(source, /set local statement_timeout = '60s'/i)
  assert.match(source, /pg_advisory_xact_lock/i)
  assert.match(source, /Required table public\.organizations does not exist/i)
  assert.match(source, /Unsafe %\.% definition/i)
  assert.match(source, /Required Job Card constraint % is missing/i)
  assert.match(source, /points to another function/i)
  assert.match(source, /missing, invalid or has another definition/i)
  assert.doesNotMatch(source, /\bdrop table\b/i)
  assert.doesNotMatch(source, /\bdrop trigger\b/i)
  assert.doesNotMatch(source, /\btruncate\b/i)
})
