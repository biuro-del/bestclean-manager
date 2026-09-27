'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const harness = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'test-profitability-catalog-provisioning-pg17.js'),
  'utf8',
)

test('catalog provisioning PG17 harness is local-only and exercises defaults', () => {
  for (const marker of [
    "production: false",
    "deploy: false",
    "notifications: false",
    "downstream: false",
    'accessHarness.runHarness()',
    'assertSourceSchema(source)',
    'assertTargetSchema(target)',
    'defaultSchemaCheck(target)',
    "mode: 'apply'",
    "mode: 'verify'",
    "mode: 'activate'",
    'catalogVerification: verifiedCatalog.catalogVerification',
    'expectedWorkerId: \'W001\'',
  ]) assert.ok(harness.includes(marker), `Missing harness marker: ${marker}`)
  assert.doesNotMatch(harness, /process\.env\.DATABASE_URL/)
  assert.doesNotMatch(harness, /\bgcloud\b|\bfirebase\b/i)
})

test('PowerShell runner uses a guarded random loopback PostgreSQL 17 cluster', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'test-profitability-catalog-provisioning-pg17.ps1'),
    'utf8',
  )
  for (const marker of [
    "C:\\Program Files\\PostgreSQL\\17\\bin\\initdb.exe",
    "C:\\Program Files\\PostgreSQL\\17\\bin\\pg_ctl.exe",
    "'127.0.0.1'",
    'TcpListener',
    '$candidate -eq 5432',
    '$SmokeSucceeded -and $ServerStopped',
    'ReparsePoint',
    'EPHEMERAL_DATA_PRESERVED_FOR_DIAGNOSIS',
  ]) assert.ok(source.includes(marker), `Missing PowerShell safety marker: ${marker}`)
  assert.doesNotMatch(source, /\bgcloud\b|\bfirebase\b/i)
  assert.doesNotMatch(source, /\$env:DATABASE_URL/)
})
