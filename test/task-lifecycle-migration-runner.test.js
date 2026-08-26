'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const runnerPath = path.join(repoRoot, 'scripts', 'migrate-task-lifecycle.js')
const runner = fs.readFileSync(runnerPath, 'utf8')
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
)
const {
  EXPECTED_PROJECT_ID,
  PRODUCTION_CONFIRMATION,
  assertProductionConfirmation,
  inspectTaskLifecycleSchema,
  resolveMode,
} = require(runnerPath)

test('runner Task lifecycle jest domyślnie tylko audytem', () => {
  assert.equal(resolveMode([]), 'audit')
  assert.equal(resolveMode(['--audit']), 'audit')
  assert.equal(resolveMode(['--apply']), 'apply')
  assert.throws(
    () => resolveMode(['--audit', '--apply']),
    /MODE_CONFLICT/,
  )
})

test('zapis wymaga właściwego projektu i dokładnego identyfikatora produkcji', () => {
  assert.throws(
    () => assertProductionConfirmation({
      mode: 'apply',
      projectId: 'other-project',
      args: ['--apply', `--confirm-production=${PRODUCTION_CONFIRMATION}`],
    }),
    /PROJECT_MISMATCH/,
  )
  assert.throws(
    () => assertProductionConfirmation({
      mode: 'apply',
      projectId: EXPECTED_PROJECT_ID,
      args: ['--apply'],
    }),
    /PRODUCTION_CONFIRMATION_REQUIRED/,
  )
  assert.doesNotThrow(() => assertProductionConfirmation({
    mode: 'audit',
    projectId: 'other-project',
    args: ['--audit'],
  }))
})

test('runner wykonuje wyłącznie wersjonowaną migrację lifecycle i sprawdza jej wynik', () => {
  assert.equal(
    packageJson.scripts['migrate:task-lifecycle'],
    'node scripts/migrate-task-lifecycle.js',
  )
  assert.match(runner, /20260727_task_lifecycle_additive\.sql/)
  assert.match(runner, /TASK_LIFECYCLE_SCHEMA_NOT_READY/)
  assert.match(runner, /task_lifecycle_status_check/)
  assert.match(runner, /task_org_lifecycle_date_idx/)
  assert.match(runner, /tasksWithoutLifecycleStatus/)
  assert.match(runner, /PRODUCTION_CONFIRMATION_REQUIRED/)
})

test('audyt brakujacej tabeli jest wynikiem ready=false, a nie bledem regclass', async () => {
  const queries = []
  const client = {
    async query(sql) {
      queries.push(sql)
      if (queries.length === 1) {
        return { rows: [{ database_name: 'test', database_user: 'tester', schema_name: 'public' }] }
      }
      if (queries.length === 2) {
        return {
          rows: [{
            task: null,
            lifecycle_status: false,
            cancelled_at: false,
            archived_at: false,
            lifecycle_status_check: false,
            lifecycle_index: false,
          }],
        }
      }
      throw new Error('Unexpected query')
    },
  }

  const result = await inspectTaskLifecycleSchema(client)

  assert.equal(result.ready, false)
  assert.equal(result.schema.task, null)
  assert.equal(queries.length, 2)
  assert.match(queries[1], /to_regclass\('public\.task'\)/)
  assert.doesNotMatch(queries[1], /'public\.task'::regclass/)
})

test('audyt potwierdza gotowosc dopiero po kompletnym schemacie i backfillu', async () => {
  const responses = [
    { rows: [{ database_name: 'iclean-room-database', database_user: 'portal_app', schema_name: 'public' }] },
    {
      rows: [{
        task: 'task',
        lifecycle_status: true,
        cancelled_at: true,
        archived_at: true,
        lifecycle_status_check: true,
        lifecycle_index: true,
      }],
    },
    { rows: [{ tasks: 7, tasksWithoutLifecycleStatus: 0, lifecycleStatuses: ['ACTIVE'] }] },
  ]
  const client = {
    async query() {
      return responses.shift()
    },
  }

  const result = await inspectTaskLifecycleSchema(client)

  assert.equal(result.ready, true)
  assert.equal(result.counts.tasks, 7)
  assert.equal(result.counts.tasksWithoutLifecycleStatus, 0)
  assert.deepEqual(result.counts.lifecycleStatuses, ['ACTIVE'])
})
