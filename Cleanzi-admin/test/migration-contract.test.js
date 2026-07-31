'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const { applyMigrations, checksum, migrationFiles } = require('../scripts/migrate')

const migrationPath = path.resolve(__dirname, '..', 'migrations', migrationFiles[0])
const sql = fs.readFileSync(migrationPath, 'utf8')

function filesBelow(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name)
    return entry.isDirectory() ? filesBelow(fullPath) : [fullPath]
  })
}

test('wszystkie pliki tekstowe modułu są poprawnym UTF-8', () => {
  const decoder = new TextDecoder('utf-8', { fatal: true })
  for (const filePath of filesBelow(path.resolve(__dirname, '..'))) {
    if (!/\.(?:js|md|sql|css|example)$/i.test(filePath)) continue
    assert.doesNotThrow(() => decoder.decode(fs.readFileSync(filePath)), filePath)
  }
})

test('migracja finansowa jest idempotentna i nie używa float do kwot', () => {
  assert.match(sql, /create table if not exists public\.platform_plan/i)
  assert.match(sql, /add column if not exists current_period_ends_at timestamptz/i)
  assert.match(sql, /amount_minor bigint/i)
  assert.doesNotMatch(sql, /amount_minor\s+(real|float|double precision|numeric)/i)
  assert.match(sql, /unique \(source, idempotency_key\)/i)
  assert.match(sql, /create trigger organization_subscription_history_append_only/i)
  assert.match(sql, /create trigger billing_transaction_event_append_only/i)
  assert.match(sql, /source in \('MANUAL', 'SYSTEM', 'PROVIDER'\)/i)
})

test('checksum migracji jest stabilny', () => {
  assert.equal(checksum(sql), checksum(Buffer.from(sql, 'utf8')))
  assert.match(checksum(sql), /^[a-f0-9]{64}$/)
})

test('runner zapisuje migrację raz i drugie uruchomienie jest no-op', async () => {
  const ledger = new Map()
  let migrationExecutions = 0
  const calls = []
  const client = {
    async query(statement, params = []) {
      const normalized = String(statement).replace(/\s+/g, ' ').trim().toLowerCase()
      calls.push(normalized)
      if (normalized.startsWith('select checksum from public.platform_schema_migration')) {
        const current = ledger.get(params[0])
        return { rows: current ? [{ checksum: current }] : [] }
      }
      if (normalized.startsWith('insert into public.platform_schema_migration')) {
        ledger.set(params[0], params[1])
        return { rows: [] }
      }
      if (String(statement) === sql) migrationExecutions += 1
      return { rows: [] }
    },
  }
  await applyMigrations(client)
  await applyMigrations(client)
  assert.equal(migrationExecutions, 1)
  assert.equal(ledger.size, migrationFiles.length)
  assert.equal(calls.filter((entry) => entry === 'commit').length, 2)
})

test('runner wykonuje rollback po błędzie migracji', async () => {
  const calls = []
  const client = {
    async query(statement) {
      const normalized = String(statement).replace(/\s+/g, ' ').trim().toLowerCase()
      calls.push(normalized)
      if (normalized.startsWith('select checksum from public.platform_schema_migration')) return { rows: [] }
      if (String(statement) === sql) throw new Error('MIGRATION_FAILED')
      return { rows: [] }
    },
  }
  await assert.rejects(applyMigrations(client), /MIGRATION_FAILED/)
  assert.ok(calls.includes('rollback'))
  assert.ok(!calls.includes('commit'))
})
