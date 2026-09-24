const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const serverSource = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
const appHosting = fs.readFileSync(path.join(root, 'apphosting.yaml'), 'utf8')
const rootEnvExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8')
const webEnvExample = fs.readFileSync(path.join(root, 'web-app', '.env.example'), 'utf8')
const coreDocumentation = fs.readFileSync(path.join(root, 'docs', 'workforce-schedule-core.md'), 'utf8')

function functionBlock(name, nextName) {
  const start = serverSource.indexOf(`function ${name}`)
  assert.ok(start >= 0, `Missing function ${name}`)
  const end = serverSource.indexOf(`function ${nextName}`, start + 1)
  assert.ok(end > start, `Missing end of function ${name}`)
  return serverSource.slice(start, end)
}

function asyncFunctionBlock(name, nextName) {
  const start = serverSource.indexOf(`async function ${name}`)
  assert.ok(start >= 0, `Missing async function ${name}`)
  const nextSync = serverSource.indexOf(`function ${nextName}`, start + 1)
  const nextAsync = serverSource.indexOf(`async function ${nextName}`, start + 1)
  const candidates = [nextSync, nextAsync].filter((position) => position > start)
  assert.ok(candidates.length, `Missing end of async function ${name}`)
  return serverSource.slice(start, Math.min(...candidates))
}

function appHostingVariableBlock(name) {
  const marker = `  - variable: ${name}`
  const start = appHosting.indexOf(marker)
  assert.ok(start >= 0, `Missing App Hosting variable ${name}`)
  const end = appHosting.indexOf('\n  - variable:', start + marker.length)
  return appHosting.slice(start, end >= 0 ? end : appHosting.length)
}

test('Grafik uses only its dedicated PostgreSQL credentials', () => {
  assert.match(
    serverSource,
    /WORKFORCE_SCHEDULE_SESSION_ROLE: WORKFORCE_SCHEDULE_DB_SESSION_ROLE/,
  )
  const config = functionBlock('readWorkforceScheduleDbConfig', 'getWorkforceScheduleCloudSqlConnectorOptions')
  assert.match(config, /process\.env\.WORKFORCE_SCHEDULE_DB_USER/)
  assert.match(config, /process\.env\.WORKFORCE_SCHEDULE_DB_PASS/)
  assert.match(config, /user !== WORKFORCE_SCHEDULE_DB_SESSION_ROLE/)
  assert.doesNotMatch(config, /process\.env\.DB_USER|process\.env\.PGUSER|DATABASE_URL/)
  assert.doesNotMatch(config, /PORTAL_DB_USER|PORTAL_DB_PASS|portal_app/)
})

test('Grafik resolves only an explicit cloudsql or direct connector mode', () => {
  const resolver = functionBlock(
    'resolveWorkforceScheduleDbConnectorMode',
    'resolveWorkforceScheduleCloudSqlIpType',
  )
  const loadResolver = new Function(
    'normalizeText',
    'workforceScheduleDbError',
    `${resolver}\nreturn resolveWorkforceScheduleDbConnectorMode`,
  )
  const resolveMode = loadResolver(
    (value) => String(value ?? '').trim(),
    (code) => Object.assign(new Error(code), { publicCode: code, statusCode: 503 }),
  )

  assert.equal(resolveMode('cloudsql'), 'cloudsql')
  assert.equal(resolveMode('DIRECT'), 'direct')
  assert.throws(
    () => resolveMode(''),
    (error) => error?.publicCode === 'WORKFORCE_SCHEDULE_DB_CONNECTOR_MISSING',
  )
  assert.throws(
    () => resolveMode('postgres'),
    (error) => error?.publicCode === 'WORKFORCE_SCHEDULE_DB_CONNECTOR_INVALID',
  )
})

test('Grafik does not inherit connection topology, TLS or retry settings from the portal pool', () => {
  const ssl = functionBlock(
    'getWorkforceScheduleDbSslOptions',
    'resolveWorkforceScheduleDbConnectorMode',
  )
  const connectorMode = functionBlock(
    'resolveWorkforceScheduleDbConnectorMode',
    'resolveWorkforceScheduleCloudSqlIpType',
  )
  const ipType = functionBlock(
    'resolveWorkforceScheduleCloudSqlIpType',
    'readWorkforceScheduleDbConfig',
  )
  const config = functionBlock(
    'readWorkforceScheduleDbConfig',
    'getWorkforceScheduleCloudSqlConnectorOptions',
  )
  const connector = asyncFunctionBlock(
    'getWorkforceScheduleCloudSqlConnectorOptions',
    'createWorkforceScheduleDbPool',
  )
  const pool = asyncFunctionBlock('createWorkforceScheduleDbPool', 'getWorkforceScheduleDbPool')
  const connect = asyncFunctionBlock('connectWorkforceScheduleDbClient', 'getDbPool')
  const isolatedConnection = [ssl, connectorMode, ipType, config, connector, pool, connect].join('\n')

  assert.match(config, /process\.env\.WORKFORCE_SCHEDULE_DB_CONNECTOR/)
  assert.match(config, /process\.env\.WORKFORCE_SCHEDULE_DB_HOST/)
  assert.match(config, /process\.env\.WORKFORCE_SCHEDULE_DB_NAME/)
  assert.match(config, /WORKFORCE_SCHEDULE_DB_PORT/)
  assert.match(config, /process\.env\.WORKFORCE_SCHEDULE_DB_SSL/)
  assert.match(ssl, /process\.env\.WORKFORCE_SCHEDULE_DB_SSL_REJECT_UNAUTHORIZED/)
  assert.match(connector, /process\.env\.WORKFORCE_SCHEDULE_CLOUD_SQL_IP_TYPE/)
  assert.match(pool, /WORKFORCE_SCHEDULE_DB_CONNECT_TIMEOUT_MS[\s\S]*30000/)
  assert.match(connect, /WORKFORCE_SCHEDULE_DB_CONNECT_RETRY_ATTEMPTS[\s\S]*3/)
  assert.doesNotMatch(
    isolatedConnection,
    /process\.env\.(?:DB_CONNECTOR|DB_CONNECTION_MODE|DB_HOST|PGHOST|DB_NAME|PGDATABASE|DB_PORT|PGPORT|DB_SSL|PGSSLMODE|DB_SSL_REJECT_UNAUTHORIZED|DB_CONNECT_RETRY_ATTEMPTS|DB_CONNECT_TIMEOUT_MS|PGCONNECT_TIMEOUT_MS|CLOUD_SQL_IP_TYPE|DB_CLOUD_SQL_IP_TYPE)/,
  )
  assert.doesNotMatch(isolatedConnection, /\bgetDbConnectTimeoutMillis\(|\bgetCloudSqlIpType\(/)
  assert.match(connector, /instanceConnectionName: CLOUD_SQL_CONNECTION_NAME/)
  assert.match(connector, /new Connector\(\{ auth: createCloudSqlConnectorAuth\(\) \}\)/)
})

test('Grafik owns a separate lazy pool and Cloud SQL connector lifecycle', () => {
  assert.match(serverSource, /let workforceScheduleDbPool = null/)
  assert.match(serverSource, /let workforceScheduleCloudSqlConnector = null/)
  const pool = asyncFunctionBlock('createWorkforceScheduleDbPool', 'getWorkforceScheduleDbPool')
  const lazyPool = asyncFunctionBlock('getWorkforceScheduleDbPool', 'resetWorkforceScheduleDbConnectionCache')
  const reset = asyncFunctionBlock('resetWorkforceScheduleDbConnectionCache', 'verifyWorkforceScheduleDbSession')
  const errorHandler = functionBlock('registerWorkforceSchedulePoolErrorHandler', 'createWorkforceScheduleDbPool')
  assert.match(pool, /getWorkforceScheduleCloudSqlConnectorOptions\(config\.authType\)/)
  assert.match(pool, /application_name: 'cleanzi_workforce_schedule'/)
  assert.match(pool, /WORKFORCE_SCHEDULE_DB_POOL_MAX/)
  assert.match(pool, /registerWorkforceSchedulePoolErrorHandler\(new Pool/)
  assert.match(lazyPool, /if \(!isWorkforceScheduleEnabled\(\)\)/)
  assert.match(lazyPool, /workforceScheduleDbPoolPromise/)
  assert.match(reset, /currentPool\.end\(\)/)
  assert.match(reset, /currentConnector\.close\(\)/)
  assert.match(errorHandler, /normalizeText\(error\?\.code\)\.toUpperCase\(\)/)
  assert.match(errorHandler, /\^\[A-Z0-9\]\[A-Z0-9_\]\{0,31\}\$/)
  assert.match(errorHandler, /'UNKNOWN'/)
  assert.doesNotMatch(errorHandler, /error\?\.message|config\.(password|user)/)
})

test('Grafik rejects a wrong session role before handing out a pooled client', () => {
  const verify = asyncFunctionBlock('verifyWorkforceScheduleDbSession', 'connectWorkforceScheduleDbClient')
  const connect = asyncFunctionBlock('connectWorkforceScheduleDbClient', 'getDbPool')
  assert.match(verify, /session_user::text as session_user, current_user::text as current_user/)
  assert.match(verify, /WORKFORCE_SCHEDULE_DB_SESSION_ROLE/)
  assert.match(verify, /WORKFORCE_SCHEDULE_DB_SESSION_INVALID/)
  assert.match(connect, /verifyWorkforceScheduleDbSession\(client\)/)
  assert.match(connect, /client\?\.release\?\.\(true\)/)
  assert.match(connect, /resetWorkforceScheduleDbConnectionCache\(\)/)
})

test('Grafik resolves auth only from its required fail-closed variable', () => {
  const resolver = functionBlock('getWorkforceScheduleCloudSqlAuthType', 'getWorkforceScheduleDbNumber')
  const config = functionBlock('readWorkforceScheduleDbConfig', 'getWorkforceScheduleCloudSqlConnectorOptions')
  const connector = asyncFunctionBlock(
    'getWorkforceScheduleCloudSqlConnectorOptions',
    'createWorkforceScheduleDbPool',
  )
  assert.match(resolver, /process\.env\.WORKFORCE_SCHEDULE_DB_AUTH_TYPE/)
  assert.match(resolver, /resolveWorkforceScheduleDbAuthType/)
  assert.doesNotMatch(resolver, /process\.env\.(?:CLOUD_SQL_AUTH_TYPE|DB_AUTH_TYPE)|\bgetCloudSqlAuthType\(/)
  assert.match(config, /const authType = getWorkforceScheduleCloudSqlAuthType\(\)/)
  assert.doesNotMatch(config, /process\.env\.(?:CLOUD_SQL_AUTH_TYPE|DB_AUTH_TYPE)|\bgetCloudSqlAuthType\(/)
  assert.match(connector, /getWorkforceScheduleCloudSqlConnectorOptions\(authType\)/)
  assert.match(connector, /authType,/)
  assert.doesNotMatch(connector, /process\.env\.(?:CLOUD_SQL_AUTH_TYPE|DB_AUTH_TYPE)|\bgetCloudSqlAuthType\(/)
})

test('API wiring cannot fall back to the shared portal pool', () => {
  const start = serverSource.indexOf('const workforceScheduleApi = createWorkforceScheduleApi({')
  const end = serverSource.indexOf('const portalZoneApi', start)
  assert.ok(start >= 0 && end > start)
  const wiring = serverSource.slice(start, end)
  assert.match(wiring, /connectDbClient: connectWorkforceScheduleDbClient/)
  assert.match(wiring, /getRequestId: \(\) => getPlatformRequestContext\(\)\?\.requestId/)
  assert.match(wiring, /logHandledError: \(entry\) => console\.error\(JSON\.stringify\(entry\)\)/)
  assert.doesNotMatch(wiring, /\n\s*connectDbClient,/)
})

test('App Hosting enables the capability-gated frontend and isolated backend canary', () => {
  assert.match(appHostingVariableBlock('VITE_WORKFORCE_SCHEDULE_MODE'), /value: live[\s\S]*- BUILD/)
  assert.match(
    appHostingVariableBlock('WORKFORCE_SCHEDULE_ENABLED'),
    /value: "true"[\s\S]*- RUNTIME/,
  )
  assert.match(
    appHostingVariableBlock('WORKFORCE_SCHEDULE_DELIVERY_ENABLED'),
    /value: "true"[\s\S]*- RUNTIME/,
  )
  for (const name of [
    'WORKFORCE_SCHEDULE_NOTIFICATIONS_ENABLED',
    'WORKFORCE_SCHEDULE_DOWNSTREAM_ENABLED',
  ]) {
    assert.match(appHostingVariableBlock(name), /value: "false"[\s\S]*- RUNTIME/)
  }
  assert.match(
    appHostingVariableBlock('WORKFORCE_SCHEDULE_ROLLOUT_MODE'),
    /value: "CANARY"[\s\S]*- RUNTIME/,
  )
  const allowedOrganizationBlock = appHostingVariableBlock('WORKFORCE_SCHEDULE_ALLOWED_ORG_IDS')
  assert.match(allowedOrganizationBlock, /^    value: bestclean\r?$/m)
  assert.match(allowedOrganizationBlock, /availability:[\s\S]*- RUNTIME/)
  const deliveryAllowedOrganizationBlock = appHostingVariableBlock(
    'WORKFORCE_SCHEDULE_DELIVERY_ALLOWED_ORG_IDS',
  )
  assert.match(deliveryAllowedOrganizationBlock, /^    value: bestclean\r?$/m)
  assert.match(deliveryAllowedOrganizationBlock, /availability:[\s\S]*- RUNTIME/)
  assert.match(
    appHostingVariableBlock('WORKFORCE_SCHEDULE_DB_AUTH_TYPE'),
    /value: PASSWORD[\s\S]*- RUNTIME/,
  )
  for (const name of ['WORKFORCE_SCHEDULE_DB_USER', 'WORKFORCE_SCHEDULE_DB_PASS']) {
    const block = appHostingVariableBlock(name)
    assert.match(block, new RegExp(`secret: ${name}`))
    assert.match(block, /availability:[\s\S]*- RUNTIME/)
    assert.doesNotMatch(block, /\n\s+value:/)
    assert.doesNotMatch(block, /PORTAL_DB_(?:USER|PASS)/)
  }
  assert.match(appHostingVariableBlock('DB_USER'), /secret: PORTAL_DB_USER[\s\S]*- RUNTIME/)
  assert.match(appHostingVariableBlock('DB_PASS'), /secret: PORTAL_DB_PASS[\s\S]*- RUNTIME/)
})

test('env examples and runtime documentation require the dedicated PASSWORD auth mode', () => {
  assert.match(rootEnvExample, /^WORKFORCE_SCHEDULE_DB_AUTH_TYPE=PASSWORD$/m)
  assert.match(webEnvExample, /^# WORKFORCE_SCHEDULE_DB_AUTH_TYPE=PASSWORD$/m)
  assert.match(coreDocumentation, /`WORKFORCE_SCHEDULE_DB_AUTH_TYPE=PASSWORD`/)
  assert.match(coreDocumentation, /Nie dziedziczy\s+`CLOUD_SQL_AUTH_TYPE` ani `DB_AUTH_TYPE`/)
  for (const variable of [
    'WORKFORCE_SCHEDULE_DB_CONNECTOR',
    'WORKFORCE_SCHEDULE_CLOUD_SQL_IP_TYPE',
    'WORKFORCE_SCHEDULE_DB_NAME',
    'WORKFORCE_SCHEDULE_DB_HOST',
    'WORKFORCE_SCHEDULE_DB_PORT',
    'WORKFORCE_SCHEDULE_DB_SSL',
    'WORKFORCE_SCHEDULE_DB_SSL_REJECT_UNAUTHORIZED',
    'WORKFORCE_SCHEDULE_DB_CONNECT_TIMEOUT_MS',
    'WORKFORCE_SCHEDULE_DB_CONNECT_RETRY_ATTEMPTS',
  ]) {
    assert.match(rootEnvExample, new RegExp(`^#? ?${variable}=`, 'm'))
    assert.match(webEnvExample, new RegExp(`^# ${variable}=`, 'm'))
  }
})
