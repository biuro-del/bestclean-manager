'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const {
  appHostingFlagIsFalse,
  assertApplyGate,
  readDatabaseConnectionContext,
  safeErrorText,
} = require('../scripts/backfill-worker-firebase-phone')

const root = path.join(__dirname, '..')

function withArguments(args, callback) {
  const previous = process.argv
  process.argv = ['node', 'script', ...args]
  try {
    return callback()
  } finally {
    process.argv = previous
  }
}

function validContext(overrides = {}) {
  return {
    projectId: 'iclean-room',
    databaseName: 'iclean-room-database',
    databaseConnection: {
      mode: 'CLOUD_SQL_CONNECTOR',
      connectionName: 'iclean-room:europe-west3:iclean-room-instance',
    },
    phoneTriggerReady: true,
    providerState: { state: 'DISABLED' },
    plan: {
      planHash: 'abc123',
      conflicts: 0,
      plannedUpdates: 2,
    },
    ...overrides,
  }
}

function validArguments(overrides = {}) {
  const values = {
    'confirm-project': 'iclean-room',
    'confirm-database': 'iclean-room-database',
    'confirm-instance': 'iclean-room:europe-west3:iclean-room-instance',
    'confirm-plan': 'abc123',
    'confirm-production': 'CLZ-WORKER-PHONE-IDENTITY-BACKFILL-20260914-01',
    'max-updates': '2',
    ...overrides,
  }
  return Object.entries(values).map(([key, value]) => `--${key}=${value}`)
}

test('apply wymaga kompletu potwierdzen i wylaczonego providera', () => {
  const previousFlag = process.env.WORKER_FIREBASE_PHONE_IDENTITY_ENABLED
  process.env.WORKER_FIREBASE_PHONE_IDENTITY_ENABLED = 'false'
  try {
    assert.equal(appHostingFlagIsFalse(), true)
    assert.equal(withArguments(validArguments(), () => assertApplyGate(validContext())), 2)
    assert.throws(
      () => withArguments(validArguments({ 'confirm-plan': 'stary-plan' }), () => assertApplyGate(validContext())),
      /CONFIRM_PLAN_MISMATCH/,
    )
    assert.throws(
      () => withArguments(validArguments(), () => assertApplyGate(validContext({ providerState: { state: 'ENABLED' } }))),
      /PHONE_PROVIDER_MUST_BE_DISABLED/,
    )
    assert.throws(
      () => withArguments(validArguments(), () => assertApplyGate(validContext({ plan: { planHash: 'abc123', conflicts: 1 } }))),
      /PHONE_BACKFILL_CONFLICTS_PRESENT/,
    )
  } finally {
    if (previousFlag === undefined) delete process.env.WORKER_FIREBASE_PHONE_IDENTITY_ENABLED
    else process.env.WORKER_FIREBASE_PHONE_IDENTITY_ENABLED = previousFlag
  }
})

test('apply dopuszcza tylko dokladna produkcyjna instancje Cloud SQL', () => {
  assert.throws(
    () => withArguments(validArguments(), () => assertApplyGate(validContext({
      databaseConnection: { mode: 'DATABASE_URL', connectionName: '' },
    }))),
    /PRODUCTION_CLOUD_SQL_CONNECTOR_REQUIRED/,
  )
  assert.throws(
    () => withArguments(validArguments(), () => assertApplyGate(validContext({
      databaseConnection: {
        mode: 'CLOUD_SQL_CONNECTOR',
        connectionName: 'iclean-room:europe-west3:test-copy',
      },
    }))),
    /CONFIRMED_INSTANCE_REQUIRED/,
  )
  assert.throws(
    () => withArguments(validArguments({ 'confirm-instance': 'wrong-instance' }), () => (
      assertApplyGate(validContext())
    )),
    /CONFIRM_INSTANCE_MISMATCH/,
  )

  assert.deepEqual(readDatabaseConnectionContext({ DATABASE_URL: 'postgres://example' }), {
    connectionName: '',
    mode: 'DATABASE_URL',
  })
})

test('log bledu maskuje telefon i email', () => {
  const value = safeErrorText('Błąd dla +48664322028 oraz rafal@example.com')
  assert.doesNotMatch(value, /664322028/)
  assert.doesNotMatch(value, /rafal@example\.com/)
  assert.match(value, /\[PHONE\]/)
  assert.match(value, /\[EMAIL\]/)
})

test('skrypt jest audit-first i nie zawiera operacji zmieniajacych inne dane konta', () => {
  const script = fs.readFileSync(
    path.join(root, 'scripts', 'backfill-worker-firebase-phone.js'),
    'utf8',
  )
  const service = fs.readFileSync(
    path.join(root, 'worker-firebase-phone-backfill.js'),
    'utf8',
  )
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

  assert.match(script, /const apply = hasFlag\('apply'\)/)
  assert.match(script, /if \(!apply\) \{[\s\S]*mode: 'audit'/)
  assert.match(script, /lock table public\.worker, public\.organization_member in share mode/)
  assert.match(script, /active_uid_membership_count/)
  assert.match(script, /completedUpdates = applyResult\.completedUpdates/)
  assert.doesNotMatch(script, /\.createUser\(|\.deleteUser\(|\.importUsers\(|revokeRefreshTokens/)
  assert.match(service, /auth\.updateUser\(entry\.authUid, \{ phoneNumber: entry\.phone \}\)/)
  assert.equal(
    packageJson.scripts['worker-phone-identity:audit'],
    'node scripts/backfill-worker-firebase-phone.js --audit',
  )
})
