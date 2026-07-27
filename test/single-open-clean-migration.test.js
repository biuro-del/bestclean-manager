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
  '20260723_single_open_clean_event_guard.sql',
)

test('migracja blokuje wyscig i drugi otwarty CLEAN, ale nie aktualizuje danych', () => {
  const source = fs.readFileSync(migrationPath, 'utf8')

  assert.match(source, /REVIEW-ONLY/)
  assert.match(source, /LOCK TABLE public\.event IN SHARE ROW EXCLUSIVE MODE/)
  assert.match(source, /EVENT_CORRELATION_SCHEMA_INCOMPLETE/)
  assert.match(source, /planned_duration_minutes/)
  assert.match(source, /task_updated_at_snapshot/)
  assert.match(source, /pg_advisory_xact_lock/)
  assert.match(source, /OPEN_CLEAN_EVENT_EXISTS/)
  assert.match(source, /OPEN_EVENT_TYPE_REQUIRED/)
  assert.match(source, /OPEN_EVENT_WORKER_REQUIRED/)
  assert.match(source, /OPEN_CLEAN_WORKER_REQUIRES_RECONCILIATION/)
  assert.match(source, /LEGACY_OPEN_EVENT_TYPE_REQUIRES_CLASSIFICATION/)
  assert.match(source, /EXISTING_OPEN_CLEAN_CONFLICT_REQUIRES_RECONCILIATION/)
  assert.match(
    source,
    /upper\(btrim\(coalesce\(to_jsonb\(existing\) ->> 'event_type', ''\)\)\) = 'CLEAN'/,
  )
  assert.doesNotMatch(
    source,
    /coalesce\(\s*nullif\(btrim\(to_jsonb\(existing\) ->> 'event_type'\), ''\),\s*'CLEAN'\s*\)/,
  )
  assert.match(source, /BEFORE INSERT OR UPDATE ON public\.event/)
  assert.match(source, /event_open_clean_worker_lookup_idx/)
  assert.doesNotMatch(source, /\bUPDATE\s+public\.event\b/i)
  assert.doesNotMatch(source, /\bDELETE\s+FROM\s+public\.event\b/i)
})
