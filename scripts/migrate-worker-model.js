'use strict'

const fs = require('node:fs')
const path = require('node:path')
const dotenv = require('dotenv')
const { Pool } = require('pg')
const {
  AuthTypes,
  Connector,
  IpAddressTypes,
} = require('@google-cloud/cloud-sql-connector')
const { GoogleAuth } = require('google-auth-library')
const workerRepository = require('../worker-repository')

const rootDir = path.resolve(__dirname, '..')
const envPath = path.join(rootDir, '.env.local')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}

function text(value) {
  return String(value ?? '').trim()
}

function isTrue(value) {
  return ['1', 'true', 'yes', 'tak'].includes(text(value).toLowerCase())
}

function shouldUseCloudSqlConnector() {
  const connector = text(process.env.DB_CONNECTOR).toLowerCase()
  return (
    connector === 'cloudsql' ||
    connector === 'cloud-sql' ||
    Boolean(text(process.env.CLOUD_SQL_CONNECTION_NAME || process.env.INSTANCE_CONNECTION_NAME))
  )
}

async function loadSecretManagerDatabaseConfig() {
  if (
    text(process.env.DATABASE_URL) ||
    (text(process.env.DB_NAME || process.env.PGDATABASE) &&
      text(process.env.DB_USER || process.env.PGUSER))
  ) {
    return
  }

  const projectId = text(
    process.env.DEV_SECRET_PROJECT_ID ||
      process.env.PLATFORM_FIREBASE_PROJECT_ID ||
      process.env.FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      '',
  )
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID_REQUIRED_FOR_SECRET_MANAGER')
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })
  const authClient = await auth.getClient()
  const headers = await authClient.getRequestHeaders()
  const authorization =
    typeof headers?.get === 'function'
      ? headers.get('authorization')
      : headers?.authorization || headers?.Authorization
  if (!authorization) {
    throw new Error('ADC_AUTHORIZATION_MISSING')
  }

  const accessSecret = async (secretName) => {
    const response = await fetch(
      `https://secretmanager.googleapis.com/v1/projects/${encodeURIComponent(
        projectId,
      )}/secrets/${encodeURIComponent(secretName)}/versions/latest:access`,
      { headers: { Authorization: authorization } },
    )
    if (!response.ok) {
      throw new Error(`SECRET_ACCESS_${secretName}_${response.status}`)
    }
    const payload = await response.json()
    const value = Buffer.from(
      String(payload?.payload?.data ?? ''),
      'base64',
    ).toString('utf8').trim()
    if (!value) throw new Error(`SECRET_EMPTY_${secretName}`)
    return value
  }

  const [dbUser, dbPass] = await Promise.all([
    accessSecret(text(process.env.DEV_DB_USER_SECRET) || 'PORTAL_DB_USER'),
    accessSecret(text(process.env.DEV_DB_PASS_SECRET) || 'PORTAL_DB_PASS'),
  ])
  if (!text(process.env.CLOUD_SQL_CONNECTION_NAME || process.env.INSTANCE_CONNECTION_NAME)) {
    throw new Error('CLOUD_SQL_CONNECTION_NAME_MISSING')
  }
  if (!text(process.env.DB_NAME || process.env.PGDATABASE)) throw new Error('DB_NAME_MISSING')
  process.env.DB_CONNECTOR ||= 'cloudsql'
  process.env.DB_USER = dbUser
  process.env.DB_PASS = dbPass
}

async function createPool() {
  const databaseUrl = text(process.env.DATABASE_URL)
  if (databaseUrl) {
    return {
      pool: new Pool({
        connectionString: databaseUrl,
        max: 1,
        ssl: isTrue(process.env.DB_SSL)
          ? {
              rejectUnauthorized:
                text(process.env.DB_SSL_REJECT_UNAUTHORIZED).toLowerCase() !== 'false',
            }
          : undefined,
      }),
      connector: null,
    }
  }

  const database = text(process.env.DB_NAME || process.env.PGDATABASE)
  const user = text(process.env.DB_USER || process.env.PGUSER)
  const password = String(process.env.DB_PASS || process.env.PGPASSWORD || '')
  if (!database || !user) {
    throw new Error('DB_CONFIG_MISSING')
  }

  if (shouldUseCloudSqlConnector()) {
    const instanceConnectionName = text(
      process.env.CLOUD_SQL_CONNECTION_NAME || process.env.INSTANCE_CONNECTION_NAME,
    )
    if (!instanceConnectionName) {
      throw new Error('CLOUD_SQL_CONNECTION_NAME_MISSING')
    }

    const connector = new Connector()
    const options = await connector.getOptions({
      instanceConnectionName,
      ipType:
        text(process.env.CLOUD_SQL_IP_TYPE).toUpperCase() === 'PRIVATE'
          ? IpAddressTypes.PRIVATE
          : IpAddressTypes.PUBLIC,
      authType: AuthTypes.PASSWORD,
    })
    return {
      pool: new Pool({
        ...options,
        database,
        user,
        password,
        max: 1,
      }),
      connector,
    }
  }

  const host = text(process.env.DB_HOST || process.env.PGHOST)
  if (!host) {
    throw new Error('DB_HOST_MISSING')
  }
  return {
    pool: new Pool({
      host,
      port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
      database,
      user,
      password,
      max: 1,
      ssl: isTrue(process.env.DB_SSL)
        ? {
            rejectUnauthorized:
              text(process.env.DB_SSL_REJECT_UNAUTHORIZED).toLowerCase() !== 'false',
          }
        : undefined,
    }),
    connector: null,
  }
}

async function auditWorkerSchema(client) {
  const columns = await client.query(
    `select column_name,
            data_type,
            udt_name,
            is_nullable,
            character_maximum_length,
            is_generated,
            generation_expression
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'worker'
        and column_name = any($1::text[])
      order by ordinal_position`,
    [['login', 'worker_id', 'login_normalized', 'email_normalized']],
  )
  const indexes = await client.query(
    `select tablename, indexname, indexdef
       from pg_indexes
      where schemaname = 'public'
        and (
          (tablename = 'worker' and indexname = any($1::text[]))
          or tablename = 'worker_id_reservation'
        )
      order by tablename, indexname`,
    [[
      'worker_org_login_ci_uidx',
      'worker_org_worker_id_ci_uidx',
      'worker_auth_uid_idx',
      'worker_org_worker_id_idx',
    ]],
  )
  const relations = await client.query(
    `select current_database() as database_name,
            current_schema() as schema_name,
            to_regclass('public.worker')::text as worker_relation,
            to_regclass('public.worker_id_reservation')::text as reservation_relation`,
  )
  const ownerRoleConsistency = await client.query(
    `select
       count(*) filter (where nullif(o.owner_worker_id, '') is not null) as organizations_with_owner_worker_id,
       count(*) filter (
         where nullif(o.owner_worker_id, '') is not null
           and (w.worker_id is null or upper(coalesce(w.role, '')) <> 'OWNER')
       ) as worker_role_mismatches,
       count(*) filter (
         where nullif(o.owner_worker_id, '') is not null
           and (m.worker_id is null or upper(coalesce(m.role, '')) <> 'OWNER')
       ) as membership_role_mismatches
     from public.organizations o
     left join public.worker w
       on w.org_id = o.org_id
      and w.worker_id = o.owner_worker_id
     left join public.organization_member m
       on m.org_id = o.org_id
      and m.worker_id = o.owner_worker_id`,
  )

  console.log(JSON.stringify({
    mode: 'audit',
    relations: relations.rows[0],
    ownerRoleConsistency: ownerRoleConsistency.rows[0],
    workerColumns: columns.rows,
    indexes: indexes.rows,
  }, null, 2))
}

async function main() {
  await loadSecretManagerDatabaseConfig()
  const auditOnly = process.argv.includes('--audit')
  const migrationFiles = [
    '20260716_worker_id_reservations_and_remove_credentials.sql',
    '20260717_worker_roles_and_types.sql',
    '20260717_platform_owner.sql',
    '20260717_platform_email_mfa.sql',
  ]
  const migrationSql = migrationFiles
    .map((fileName) => fs.readFileSync(path.join(rootDir, 'dataconnect', 'migrations', fileName), 'utf8'))
    .join('\n')
  const { pool, connector } = await createPool()
  let client = null

  try {
    client = await pool.connect()
    if (auditOnly) {
      await auditWorkerSchema(client)
      return
    }

    await client.query('begin')
    await client.query(migrationSql)
    await client.query('commit')

    const readiness = await workerRepository.inspectWorkerSchema(client)
    if (!readiness.ready) {
      const error = new Error('WORKER_SCHEMA_NOT_READY')
      error.details = readiness
      throw error
    }
    console.log('Worker model migration completed. Schema is ready.')
  } catch (error) {
    if (client) {
      try {
        await client.query('rollback')
      } catch {
        // Ignore rollback failure.
      }
    }
    if (error?.details) {
      console.error(error.message, error.details)
    }
    throw error
  } finally {
    if (client) client.release()
    await pool.end()
    if (connector) connector.close()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      'Worker/platform model migration failed:',
      text(error?.code || error?.message || error),
      text(error?.detail),
    )
    process.exitCode = 1
  })
}

module.exports = {
  createPool,
  loadSecretManagerDatabaseConfig,
}
