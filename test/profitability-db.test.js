'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  POSTGRES_DATE_OID,
  PROFITABILITY_RUNTIME_ROLE,
  PROFITABILITY_SESSION_ROLE,
  createProfitabilityDbConnectionManager,
  createProfitabilityPgTypes,
  readProfitabilityDbConfig,
} = require('../profitability-db')

function environment(overrides = {}) {
  return {
    PROFITABILITY_DB_ENABLED: 'true',
    PROFITABILITY_DB_CONNECTOR: 'direct',
    PROFITABILITY_DB_AUTH_TYPE: 'PASSWORD',
    PROFITABILITY_DB_NAME: 'iclean-room-database',
    PROFITABILITY_DB_USER: PROFITABILITY_SESSION_ROLE,
    PROFITABILITY_DB_PASS: 'test-only-password',
    PROFITABILITY_DB_HOST: '127.0.0.1',
    ...overrides,
  }
}

test('profitability database configuration is explicit and never falls back to portal credentials', () => {
  assert.throws(
    () => readProfitabilityDbConfig({}, 'project:region:instance'),
    (error) => error.code === 'PROFITABILITY_DB_DISABLED' && error.statusCode === 404,
  )
  assert.throws(
    () => readProfitabilityDbConfig(environment({
      PROFITABILITY_DB_USER: '',
      DB_USER: PROFITABILITY_SESSION_ROLE,
    }), ''),
    (error) => error.publicCode === 'PROFITABILITY_DB_CREDENTIALS_NOT_READY',
  )
  assert.throws(
    () => readProfitabilityDbConfig(environment({ PROFITABILITY_DB_AUTH_TYPE: 'IAM' }), ''),
    (error) => error.publicCode === 'PROFITABILITY_DB_AUTH_TYPE_INVALID',
  )
})

test('exact loopback direct hosts may connect without SSL', () => {
  for (const host of ['127.0.0.1', '::1', 'localhost']) {
    const config = readProfitabilityDbConfig(environment({
      PROFITABILITY_DB_HOST: host,
    }), '')
    assert.equal(config.host, host)
    assert.equal(config.ssl, undefined)
  }
})

test('exact loopback direct hosts may disable certificate verification', () => {
  for (const host of ['127.0.0.1', '::1', 'localhost']) {
    const config = readProfitabilityDbConfig(environment({
      PROFITABILITY_DB_HOST: host,
      PROFITABILITY_DB_SSL: 'true',
      PROFITABILITY_DB_SSL_REJECT_UNAUTHORIZED: 'false',
    }), '')
    assert.deepEqual(config.ssl, { rejectUnauthorized: false })
  }
})

test('remote direct hosts require SSL with certificate verification', () => {
  const config = readProfitabilityDbConfig(environment({
    PROFITABILITY_DB_HOST: 'profitability-db.internal.example',
    PROFITABILITY_DB_SSL: 'true',
    PROFITABILITY_DB_SSL_REJECT_UNAUTHORIZED: 'true',
  }), '')
  assert.deepEqual(config.ssl, { rejectUnauthorized: true })

  for (const overrides of [
    { PROFITABILITY_DB_HOST: 'profitability-db.internal.example' },
    {
      PROFITABILITY_DB_HOST: 'profitability-db.internal.example',
      PROFITABILITY_DB_SSL: 'false',
      PROFITABILITY_DB_SSL_REJECT_UNAUTHORIZED: 'true',
    },
    {
      PROFITABILITY_DB_HOST: 'profitability-db.internal.example',
      PROFITABILITY_DB_SSL: 'true',
      PROFITABILITY_DB_SSL_REJECT_UNAUTHORIZED: 'false',
    },
  ]) {
    assert.throws(
      () => readProfitabilityDbConfig(environment(overrides), ''),
      (error) => error.publicCode === 'PROFITABILITY_DB_SSL_REQUIRED',
    )
  }
})

test('loopback lookalikes and URL-shaped direct hosts do not bypass TLS', () => {
  for (const host of [
    'localhost.example.com',
    'localhost.',
    '127.0.0.1.example.com',
    '127.0.0.1:5432',
    '[::1]',
    'postgres://localhost',
    '0.0.0.0',
  ]) {
    assert.throws(
      () => readProfitabilityDbConfig(environment({ PROFITABILITY_DB_HOST: host }), ''),
      (error) => error.publicCode === 'PROFITABILITY_DB_SSL_REQUIRED',
      host,
    )
  }
})

test('dedicated pool enters only the reviewed runtime role before queries', async () => {
  let poolOptions
  const client = {
    async query(sql) {
      assert.match(sql, /session_user::text/)
      return {
        rows: [{
          session_user: PROFITABILITY_SESSION_ROLE,
          current_user: PROFITABILITY_RUNTIME_ROLE,
        }],
      }
    },
    release() {},
  }
  class FakePool {
    constructor(options) {
      poolOptions = options
    }
    on(name, handler) {
      assert.equal(name, 'error')
      assert.equal(typeof handler, 'function')
    }
    async connect() { return client }
  }
  const manager = createProfitabilityDbConnectionManager({
    environment: environment(),
    PoolClass: FakePool,
  })

  assert.equal(await manager.connect(), client)
  assert.equal(poolOptions.user, PROFITABILITY_SESSION_ROLE)
  assert.equal(poolOptions.options, `-c role=${PROFITABILITY_RUNTIME_ROLE}`)
  assert.equal(poolOptions.application_name, 'cleanzi_profitability')
  assert.equal(
    poolOptions.types.getTypeParser(POSTGRES_DATE_OID, 'text')('2026-09-14'),
    '2026-09-14',
  )
})

test('profitability DATE parser preserves the database calendar day in CET and CEST', () => {
  const fallbackParser = () => 'fallback'
  const types = createProfitabilityPgTypes({
    getTypeParser(oid, format) {
      assert.equal(oid, 25)
      assert.equal(format, 'text')
      return fallbackParser
    },
  })

  const dateParser = types.getTypeParser(POSTGRES_DATE_OID, 'text')
  assert.equal(dateParser('2026-03-29'), '2026-03-29')
  assert.equal(dateParser('2026-09-14'), '2026-09-14')
  assert.equal(dateParser('2026-10-25'), '2026-10-25')
  assert.equal(types.getTypeParser(25, 'text'), fallbackParser)
})

test('unexpected session or current role fails closed and destroys the pooled client', async () => {
  const releases = []
  class FakePool {
    on() {}
    async connect() {
      return {
        async query() {
          return { rows: [{ session_user: 'portal_app', current_user: 'portal_app' }] }
        },
        release(destroy) { releases.push(destroy) },
      }
    }
  }
  const manager = createProfitabilityDbConnectionManager({
    environment: environment({ PROFITABILITY_DB_CONNECT_RETRY_ATTEMPTS: '1' }),
    PoolClass: FakePool,
  })

  await assert.rejects(
    manager.connect(),
    (error) => error.publicCode === 'PROFITABILITY_DB_SESSION_INVALID',
  )
  assert.deepEqual(releases, [true])
})
