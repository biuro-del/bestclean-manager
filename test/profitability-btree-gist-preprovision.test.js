'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(
  path.join(
    __dirname,
    '..',
    'dataconnect',
    'admin',
    '20260925_profitability_btree_gist_preprovision.psql',
  ),
  'utf8',
)

test('btree_gist provisioning is exact, guarded and independently approved', () => {
  for (const required of [
    '\\set ON_ERROR_STOP on',
    'iclean-room-database',
    '1790402094445',
    'INSTALL_PROFITABILITY_BTREE_GIST_1_7_ONLY_20260926',
    "current_setting('server_version_num')::integer between 170000 and 179999",
    'cloudsqlsuperuser',
    "default_version = '1.7'",
    "extension_row.extversion = '1.7'",
    "namespace_row.nspname = 'public'",
    "create extension if not exists btree_gist\n  with schema public\n  version '1.7'",
    'pg_advisory_xact_lock',
  ]) {
    assert.ok(source.includes(required), `missing extension safety guard: ${required}`)
  }
})

test('btree_gist provisioning cannot mutate application roles, tables or data', () => {
  assert.doesNotMatch(source, /\b(?:create|alter|drop)\s+role\b/i)
  assert.doesNotMatch(source, /\b(?:create|alter|drop|truncate)\s+table\b/i)
  assert.doesNotMatch(source, /\b(?:insert\s+into|update|delete\s+from)\b/i)
  assert.doesNotMatch(source, /\bportal_app\b/i)
  assert.equal((source.match(/\bcreate\s+extension\b/gi) ?? []).length, 1)
})
