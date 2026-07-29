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
  '20260723_single_open_workday_guard.sql',
)

test('review-only migracja chroni invariant jednego otwartego Workday bez zmiany danych', () => {
  const source = fs.readFileSync(migrationPath, 'utf8')

  assert.match(source, /REVIEW-ONLY/)
  assert.match(source, /LOCK TABLE public\.workday IN SHARE ROW EXCLUSIVE MODE/)
  assert.match(source, /EXISTING_OPEN_WORKDAY_WORKER_REQUIRED/)
  assert.match(source, /EXISTING_OPEN_WORKDAY_CONFLICT_REQUIRES_RECONCILIATION/)
  assert.match(source, /OPEN_WORKDAY_WORKER_REQUIRED/)
  assert.match(source, /OPEN_WORKDAY_EXISTS/)
  assert.match(source, /pg_advisory_xact_lock/)
  assert.match(source, /lower\(btrim\(NEW\.worker_login\)\)/)
  assert.match(
    source,
    /upper\(btrim\(coalesce\(NEW\.status, 'RUNNING'\)\)\) = 'CLOSED'/,
  )
  assert.match(source, /existing\.workday_id <> NEW\.workday_id/)
  assert.match(source, /workday_open_worker_lookup_idx/)
  assert.match(source, /BEFORE INSERT OR UPDATE ON public\.workday/)
  assert.match(
    source,
    /IF NEW\.end_at IS NOT NULL[\s\S]*?OR upper\(btrim\(coalesce\(NEW\.status, 'RUNNING'\)\)\) = 'CLOSED' THEN[\s\S]*?RETURN NEW;/,
  )

  assert.doesNotMatch(source, /\bUPDATE\s+public\.workday\s+SET\b/i)
  assert.doesNotMatch(source, /\bDELETE\s+FROM\s+public\.workday\b/i)
  assert.doesNotMatch(source, /\bINSERT\s+INTO\s+public\.workday\b/i)
})
