'use strict'

const { Pool, types: pgTypes } = require('pg')
const { AuthTypes, Connector, IpAddressTypes } = require('@google-cloud/cloud-sql-connector')
const { resolvePgPassword } = require('./cloud-sql-pg-auth')

const PROFITABILITY_SESSION_ROLE = 'profitability_session'
const PROFITABILITY_RUNTIME_ROLE = 'profitability_runtime'
const POSTGRES_DATE_OID = 1082

function createProfitabilityPgTypes(types = pgTypes) {
  return Object.freeze({
    getTypeParser(oid, format) {
      // PostgreSQL DATE has no timezone. node-postgres otherwise converts it
      // to local midnight and a later toISOString() can silently move it to
      // the previous UTC day (notably Europe/Warsaw in CET/CEST).
      if (oid === POSTGRES_DATE_OID && (format === undefined || format === 'text')) {
        return (value) => value
      }
      return types.getTypeParser(oid, format)
    },
  })
}

function text(value) {
  return String(value ?? '').trim()
}

function enabled(value) {
  return ['1', 'true', 'yes', 'tak'].includes(text(value).toLowerCase())
}

function disabled(value) {
  return ['0', 'false', 'no', 'nie'].includes(text(value).toLowerCase())
}

function positiveNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function safeError(code, message, statusCode = 503) {
  const error = new Error(message)
  error.code = code
  error.statusCode = statusCode
  error.publicCode = code
  error.publicMessage = message
  return error
}

function isExactLoopbackHost(host) {
  const normalized = text(host).toLowerCase()
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost'
}

function readProfitabilityDbConfig(environment, cloudSqlConnectionName) {
  const env = environment ?? {}
  if (!enabled(env.PROFITABILITY_DB_ENABLED)) {
    throw safeError(
      'PROFITABILITY_DB_DISABLED',
      'Dedykowane polaczenie bazy rentownosci nie jest aktywne.',
      404,
    )
  }

  const connector = text(env.PROFITABILITY_DB_CONNECTOR).toLowerCase()
  if (!['cloudsql', 'direct'].includes(connector)) {
    throw safeError(
      'PROFITABILITY_DB_CONNECTOR_INVALID',
      'Tryb polaczenia bazy rentownosci jest nieprawidlowy.',
    )
  }

  const authTypeName = text(env.PROFITABILITY_DB_AUTH_TYPE).toUpperCase()
  if (authTypeName !== 'PASSWORD') {
    throw safeError(
      'PROFITABILITY_DB_AUTH_TYPE_INVALID',
      'Tryb uwierzytelniania bazy rentownosci jest nieprawidlowy.',
    )
  }

  const database = text(env.PROFITABILITY_DB_NAME)
  const user = text(env.PROFITABILITY_DB_USER)
  const password = String(env.PROFITABILITY_DB_PASS ?? '')
  const host = text(env.PROFITABILITY_DB_HOST)
  if (user !== PROFITABILITY_SESSION_ROLE) {
    throw safeError(
      'PROFITABILITY_DB_CREDENTIALS_NOT_READY',
      'Dedykowane konto bazy rentownosci nie jest poprawnie skonfigurowane.',
    )
  }
  if (!database || !password) {
    throw safeError(
      'PROFITABILITY_DB_CONFIG_MISSING',
      'Brakuje dedykowanej konfiguracji bazy rentownosci.',
    )
  }
  if (connector === 'cloudsql' && !text(cloudSqlConnectionName)) {
    throw safeError(
      'PROFITABILITY_DB_CONFIG_MISSING',
      'Brakuje nazwy instancji Cloud SQL dla rentownosci.',
    )
  }
  if (connector === 'direct' && !host) {
    throw safeError(
      'PROFITABILITY_DB_CONFIG_MISSING',
      'Brakuje hosta bazy rentownosci.',
    )
  }

  const ssl = enabled(env.PROFITABILITY_DB_SSL)
    ? { rejectUnauthorized: !disabled(env.PROFITABILITY_DB_SSL_REJECT_UNAUTHORIZED) }
    : undefined
  if (
    connector === 'direct' &&
    !isExactLoopbackHost(host) &&
    ssl?.rejectUnauthorized !== true
  ) {
    throw safeError(
      'PROFITABILITY_DB_SSL_REQUIRED',
      'Zdalne polaczenie bezposrednie bazy rentownosci wymaga SSL z weryfikacja certyfikatu.',
    )
  }

  return Object.freeze({
    authType: AuthTypes[authTypeName],
    connector,
    database,
    host,
    password,
    port: positiveNumber(env.PROFITABILITY_DB_PORT, 5432),
    ssl,
    user,
  })
}

function retryable(error) {
  const code = text(error?.code).toUpperCase()
  return new Set([
    'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE',
    '57P01', '57P02', '57P03', '08000', '08001', '08003', '08006', '08007', '08P01',
  ]).has(code)
}

function createProfitabilityDbConnectionManager(options = {}) {
  const environment = options.environment ?? process.env
  const PoolClass = options.PoolClass ?? Pool
  const ConnectorClass = options.ConnectorClass ?? Connector
  const logger = options.logger ?? console
  const cloudSqlConnectionName = text(options.cloudSqlConnectionName)
  let pool = null
  let poolPromise = null
  let connector = null
  let connectorOptionsPromise = null

  function registerPoolErrorHandler(candidate) {
    candidate.on('error', (error) => {
      const rawCode = text(error?.code).toUpperCase()
      const code = /^[A-Z0-9][A-Z0-9_]{0,31}$/.test(rawCode) ? rawCode : 'UNKNOWN'
      logger.error('[profitability-db] idle client error', code)
    })
    return candidate
  }

  async function getConnectorOptions(config) {
    if (!connectorOptionsPromise) {
      connector = connector ?? new ConnectorClass({
        auth: typeof options.createConnectorAuth === 'function'
          ? options.createConnectorAuth()
          : undefined,
      })
      const ipTypeName = text(environment.PROFITABILITY_CLOUD_SQL_IP_TYPE || 'PUBLIC').toUpperCase()
      const ipType = IpAddressTypes[ipTypeName]
      if (!ipType) {
        throw safeError(
          'PROFITABILITY_CLOUD_SQL_IP_TYPE_INVALID',
          'Typ adresu Cloud SQL dla rentownosci jest nieprawidlowy.',
        )
      }
      connectorOptionsPromise = connector.getOptions({
        instanceConnectionName: cloudSqlConnectionName,
        ipType,
        authType: config.authType,
      }).then((value) => ({
        ...value,
        stream: typeof options.wrapCloudSqlStream === 'function'
          ? options.wrapCloudSqlStream(value?.stream)
          : value?.stream,
      })).catch((error) => {
        connectorOptionsPromise = null
        throw error
      })
    }
    return connectorOptionsPromise
  }

  async function createPool() {
    const config = readProfitabilityDbConfig(environment, cloudSqlConnectionName)
    const common = {
      application_name: 'cleanzi_profitability',
      database: config.database,
      user: config.user,
      password: resolvePgPassword({ useIamDatabaseAuth: false, password: config.password }),
      // The login has NOINHERIT and no table ACL. Every connection enters only
      // the reviewed runtime role before application SQL can execute.
      options: `-c role=${PROFITABILITY_RUNTIME_ROLE}`,
      types: createProfitabilityPgTypes(),
      max: positiveNumber(environment.PROFITABILITY_DB_POOL_MAX, 3),
      idleTimeoutMillis: positiveNumber(environment.PROFITABILITY_DB_IDLE_TIMEOUT_MS, 30000),
      connectionTimeoutMillis: positiveNumber(environment.PROFITABILITY_DB_CONNECT_TIMEOUT_MS, 30000),
    }
    if (config.connector === 'cloudsql') {
      return registerPoolErrorHandler(new PoolClass({
        ...(await getConnectorOptions(config)),
        ...common,
      }))
    }
    return registerPoolErrorHandler(new PoolClass({
      ...common,
      host: config.host,
      port: config.port,
      ssl: config.ssl,
    }))
  }

  async function getPool() {
    if (pool) return pool
    if (!poolPromise) {
      poolPromise = createPool().then((created) => {
        pool = created
        return created
      }).catch((error) => {
        poolPromise = null
        throw error
      })
    }
    return poolPromise
  }

  async function reset() {
    const pending = poolPromise
    let currentPool = pool
    const currentConnector = connector
    pool = null
    poolPromise = null
    connector = null
    connectorOptionsPromise = null
    if (!currentPool && pending) {
      try { currentPool = await pending } catch { currentPool = null }
    }
    try { await currentPool?.end?.() } catch {}
    try { await currentConnector?.close?.() } catch {}
  }

  async function connect() {
    const attempts = Math.max(
      1,
      positiveNumber(environment.PROFITABILITY_DB_CONNECT_RETRY_ATTEMPTS, 3),
    )
    let lastError = null
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let client = null
      try {
        client = await (await getPool()).connect()
        const result = await client.query(
          'select session_user::text as session_user, current_user::text as current_user',
        )
        const state = result.rows?.[0] ?? {}
        if (
          state.session_user !== PROFITABILITY_SESSION_ROLE ||
          state.current_user !== PROFITABILITY_RUNTIME_ROLE
        ) {
          throw safeError(
            'PROFITABILITY_DB_SESSION_INVALID',
            'Polaczenie rentownosci nie uzywa dedykowanych rol bazy.',
          )
        }
        return client
      } catch (error) {
        lastError = error
        client?.release?.(true)
        if (attempt >= attempts || !retryable(error)) throw error
        await reset()
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt))
      }
    }
    throw lastError ?? safeError(
      'PROFITABILITY_DB_CONNECTION_FAILED',
      'Nie udalo sie polaczyc z baza rentownosci.',
    )
  }

  return Object.freeze({ connect, reset })
}

module.exports = {
  POSTGRES_DATE_OID,
  PROFITABILITY_RUNTIME_ROLE,
  PROFITABILITY_SESSION_ROLE,
  createProfitabilityPgTypes,
  createProfitabilityDbConnectionManager,
  readProfitabilityDbConfig,
}
