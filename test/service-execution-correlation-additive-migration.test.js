'use strict'

const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const assert = require('node:assert/strict')

const migrationPath = path.join(
  __dirname,
  '..',
  'dataconnect',
  'migrations',
  '20260724_service_execution_correlation_additive.sql',
)

const source = fs.readFileSync(migrationPath, 'utf8')

test('addytywna migracja korelacji nie klasyfikuje ani nie zmienia historii', () => {
  assert.match(source, /ADDITIVE-ONLY MIGRATION/)
  assert.doesNotMatch(source, /\bupdate\s+public\.event\b/i)
  assert.doesNotMatch(source, /\bdelete\s+from\s+public\.event\b/i)
  assert.doesNotMatch(source, /\binsert\s+into\s+public\.event\b/i)
  assert.doesNotMatch(source, /alter\s+column\s+match_status\s+set\s+default/i)
  assert.doesNotMatch(source, /alter\s+column\s+match_status\s+set\s+not\s+null/i)
  assert.doesNotMatch(source, /create\s+(?:or\s+replace\s+)?function/i)
  assert.doesNotMatch(source, /create\s+trigger/i)
  assert.doesNotMatch(source, /add\s+constraint[\s\S]*foreign\s+key/i)
})

test('wszystkie pola korelacji są dodawane jako nullable bez defaultu', () => {
  const requiredColumns = [
    ['task_id', 'varchar\\(180\\)'],
    ['occurrence_date_ymd', 'varchar\\(10\\)'],
    ['service_block_id', 'varchar\\(180\\)'],
    ['allocation_id', 'varchar\\(180\\)'],
    ['work_slot_key', 'varchar\\(255\\)'],
    ['event_type', 'varchar\\(32\\)'],
    ['match_status', 'varchar\\(16\\)'],
    ['match_method', 'varchar\\(64\\)'],
    ['match_reason', 'text'],
    ['matched_at', 'timestamptz'],
    ['plan_snapshot_version', 'integer'],
    ['planned_start_at', 'timestamptz'],
    ['planned_end_at', 'timestamptz'],
    ['planned_duration_minutes', 'integer'],
    ['task_updated_at_snapshot', 'timestamptz'],
  ]

  for (const [column, type] of requiredColumns) {
    assert.match(
      source,
      new RegExp(`add column if not exists ${column} ${type}`, 'i'),
      `brak bezpiecznej definicji ${column}`,
    )
  }
})

test('migracja ogranicza blokady i buduje tylko indeksy korelacji bez blokowania zapisów', () => {
  assert.match(source, /set local lock_timeout = '5s'/i)
  assert.match(source, /set local statement_timeout = '60s'/i)
  assert.match(source, /pg_advisory_xact_lock/i)
  assert.match(source, /set lock_timeout = '5s'/i)
  assert.match(source, /set statement_timeout = '30min'/i)

  const concurrentIndexes = source.match(/create index concurrently if not exists/gi) || []
  assert.equal(concurrentIndexes.length, 3)
  assert.doesNotMatch(source, /workday_org_updated_id_idx/i)
  assert.doesNotMatch(source, /event_org_updated_id_idx/i)
  assert.doesNotMatch(source, /event_orgId_taskId_idx/i)
  assert.match(source, /historical_rows_changed/)
})
