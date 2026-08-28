'use strict'

const fs = require('node:fs')
const path = require('node:path')
const {
  createPool,
  loadSecretManagerDatabaseConfig,
} = require('./migrate-worker-model')

const rootDir = path.resolve(__dirname, '..')
const EXPECTED_PROJECT_ID = 'iclean-room'
const EXPECTED_DATABASE_NAME = 'iclean-room-database'
const PRODUCTION_CONFIRMATION =
  'CLZ-DB-20260827-CLEANING-COMPANY-RESUME-01'
const MIGRATION_FILES = [
  '20260822_cleaning_company_onboarding_v2_additive.sql',
  '20260827_cleaning_company_existing_google_enrollment_additive.sql',
]

function text(value) {
  return String(value ?? '').trim()
}

function isTrue(value) {
  return ['1', 'true', 'yes', 'tak'].includes(text(value).toLowerCase())
}

function argumentValue(prefix) {
  const argument = process.argv
    .slice(2)
    .find((value) => value.startsWith(`${prefix}=`))
  return argument ? argument.slice(prefix.length + 1) : ''
}

function featureGateStatus() {
  const onboardingEnabled = isTrue(
    process.env.CLEANING_COMPANY_ONBOARDING_ENABLED,
  )
  const autoConfirmationEnabled = isTrue(
    process.env.CLEANING_COMPANY_ONBOARDING_AUTO_CONFIRMATION_ENABLED,
  )
  return {
    onboardingEnabled,
    autoConfirmationEnabled,
    readyForRuntime: onboardingEnabled && autoConfirmationEnabled,
  }
}

function requiredColumns(rows) {
  return rows
    .filter((row) =>
      row.is_nullable === 'NO' &&
      row.column_default == null &&
      row.is_identity === 'NO',
    )
    .map((row) => row.column_name)
}

function hasColumns(columns, tableName, expected) {
  const actual = new Set(
    columns
      .filter((column) => column.table_name === tableName)
      .map((column) => column.column_name),
  )
  return expected.every((column) => actual.has(column))
}

function tableColumns(columns, tableName) {
  return columns.filter((column) => column.table_name === tableName)
}

function hasNonNullableColumns(columns, tableName, expected) {
  const actual = new Map(
    columns
      .filter((column) => column.table_name === tableName)
      .map((column) => [column.column_name, column]),
  )
  return expected.every((columnName) => actual.get(columnName)?.is_nullable === 'NO')
}

function normalizeSchemaDefinition(value) {
  return text(value)
    .replace(/::(?:[a-z_]+(?:\s+[a-z_]+)*)/gi, '')
    .replace(/["'()\s]/g, '')
    .toUpperCase()
}

function normalizedRelationName(value) {
  return text(value).replaceAll('"', '').split('.').at(-1)
}

function enrollmentIndexIsExpected(index, columnName) {
  return index?.is_unique === true &&
    index?.is_valid === true &&
    index?.is_ready === true &&
    text(index?.columns_csv) === columnName &&
    normalizeSchemaDefinition(index?.predicate) === 'STATUS=ACTIVE'
}

function enrollmentStatusConstraintIsExpected(constraint) {
  const definition = normalizeSchemaDefinition(constraint?.definition)
  return [
    'CHECKSTATUSINACTIVE,CONSUMED,EXPIRED',
    'CHECKSTATUS=ANYARRAY[ACTIVE,CONSUMED,EXPIRED]',
    'CHECKSTATUS=ANYARRAY[ACTIVE,CONSUMED,EXPIRED][]',
  ].includes(definition)
}

function enrollmentConstraintIsExpected(constraint, {
  name,
  type,
  fragments = [],
  columns = '',
  foreignTable = '',
  foreignColumns = '',
}) {
  if (
    constraint?.constraint_name !== name ||
    constraint?.constraint_type !== type ||
    constraint?.is_validated !== true
  ) {
    return false
  }
  if (columns && text(constraint.columns_csv) !== columns) return false
  if (foreignTable && normalizedRelationName(constraint.foreign_table) !== foreignTable) return false
  if (foreignColumns && text(constraint.foreign_columns_csv) !== foreignColumns) return false
  const definition = normalizeSchemaDefinition(constraint.definition)
  return fragments.every((fragment) => definition.includes(normalizeSchemaDefinition(fragment)))
}

async function inspectSchema(client) {
  const [targetResult, relationsResult, columnsResult, indexesResult, constraintsResult,
    triggersResult, subscriptionRequirementsResult] = await Promise.all([
    client.query(
      `select current_database() as database_name,
              current_user as database_user,
              current_schema() as schema_name`,
    ),
    client.query(
      `select
         to_regclass('public.organizations')::text as organizations,
         to_regclass('public.organization_member')::text as organization_member,
         to_regclass('public.worker')::text as worker,
         to_regclass('public.organization_company_profile')::text as organization_company_profile,
         to_regclass('public.organization_subscription')::text as organization_subscription,
         to_regclass('public.subscription_event')::text as subscription_event,
         to_regclass('public.user_consent')::text as user_consent,
         to_regclass('public.cleaning_company_onboarding_command')::text as onboarding_command,
         to_regclass('public.cleaning_company_onboarding_consent_audit')::text as onboarding_consent_audit,
         to_regclass('public.cleaning_company_trial_redemption')::text as trial_redemption,
         to_regclass('public.cleaning_company_onboarding_enrollment')::text as onboarding_enrollment`,
    ),
    client.query(
      `select table_name, column_name, data_type, udt_name, is_nullable,
              character_maximum_length, column_default, is_identity
         from information_schema.columns
        where table_schema = 'public'
          and table_name = any($1::text[])
        order by table_name, ordinal_position`,
      [[
        'organizations',
        'organization_member',
        'worker',
        'organization_company_profile',
        'organization_subscription',
        'subscription_event',
        'user_consent',
        'cleaning_company_onboarding_command',
        'cleaning_company_onboarding_consent_audit',
        'cleaning_company_trial_redemption',
        'cleaning_company_onboarding_enrollment',
      ]],
    ),
    client.query(
      `select i.relname as index_name,
              x.indisunique as is_unique,
              x.indisvalid as is_valid,
              x.indisready as is_ready,
              coalesce((
                select string_agg(a.attname, ',' order by keys.ordinality)
                  from unnest(x.indkey) with ordinality as keys(attnum, ordinality)
                  join pg_attribute a on a.attrelid = x.indrelid and a.attnum = keys.attnum
              ), '') as columns_csv,
              coalesce(pg_get_expr(x.indpred, x.indrelid), '') as predicate,
              pg_get_indexdef(i.oid) as definition
         from pg_class i
         join pg_namespace n on n.oid = i.relnamespace
         join pg_index x on x.indexrelid = i.oid
         where n.nspname = 'public'
           and i.relname = any($1::text[])
         order by i.relname`,
      [[
        'organization_company_profile_nip_cleaning_provider_uidx',
        'user_consent_onboarding_command_type_uidx',
        'cleaning_company_trial_redemption_email_uidx',
        'cleaning_company_onboarding_enrollment_active_uidx',
        'cleaning_company_onboarding_enrollment_active_email_uidx',
      ]],
    ),
    client.query(
      `select c.conname as constraint_name,
              c.contype as constraint_type,
              c.convalidated as is_validated,
              coalesce((
                select string_agg(a.attname, ',' order by keys.ordinality)
                  from unnest(c.conkey) with ordinality as keys(attnum, ordinality)
                  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = keys.attnum
              ), '') as columns_csv,
              case when c.contype = 'f' then c.confrelid::regclass::text else '' end as foreign_table,
              coalesce((
                select string_agg(a.attname, ',' order by keys.ordinality)
                  from unnest(c.confkey) with ordinality as keys(attnum, ordinality)
                  join pg_attribute a on a.attrelid = c.confrelid and a.attnum = keys.attnum
              ), '') as foreign_columns_csv,
              pg_get_constraintdef(c.oid) as definition
         from pg_constraint c
         join pg_class r on r.oid = c.conrelid
         join pg_namespace n on n.oid = r.relnamespace
        where n.nspname = 'public'
          and r.relname = 'cleaning_company_onboarding_enrollment'
          and c.conname = any($1::text[])
        order by c.conname`,
      [[
        'cleaning_company_onboarding_enrollment_command_fk',
        'cleaning_company_onboarding_enrollment_pkey',
        'cleaning_company_onboarding_enrollment_provider_check',
        'cleaning_company_onboarding_enrollment_status_check',
        'cleaning_company_onboarding_enrollment_expiry_check',
        'cleaning_company_onboarding_enrollment_lifecycle_check',
      ]],
    ),
    client.query(
      `select c.relname as table_name,
              t.tgname as trigger_name,
              t.tgenabled as enabled,
              t.tgfoid::regprocedure::text as function_name
         from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and not t.tgisinternal
          and c.relname = any($1::text[])
        order by c.relname, t.tgname`,
      [[
        'cleaning_company_onboarding_command',
        'cleaning_company_onboarding_consent_audit',
        'cleaning_company_trial_redemption',
      ]],
    ),
    client.query(
      `select column_name, data_type, udt_name, is_nullable,
              character_maximum_length, column_default, is_identity
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'organization_subscription'
        order by ordinal_position`,
    ),
  ])

  const relations = relationsResult.rows[0]
  const columns = columnsResult.rows
  const indexes = indexesResult.rows
  const constraints = constraintsResult.rows
  const triggers = triggersResult.rows
  const subscriptionRequirements = subscriptionRequirementsResult.rows
  const requiredRelations = [
    'organizations',
    'organization_member',
    'worker',
    'organization_company_profile',
    'organization_subscription',
    'subscription_event',
    'user_consent',
    'onboarding_command',
    'onboarding_consent_audit',
    'trial_redemption',
    'onboarding_enrollment',
  ]
  const requiredColumnsByTable = {
    organizations: ['organization_kind'],
    organization_company_profile: [
      'org_id',
      'legal_name',
      'tax_id_type',
      'tax_id_normalized',
      'declared_employee_count',
      'declared_employee_count_source',
      'declared_employee_count_recorded_at',
    ],
    organization_subscription: [
      'billing_owner_uid',
      'billing_owner_worker_id',
      'currency_code',
      'trial_started_at',
      'trial_ends_at',
      'current_period_started_at',
      'current_period_ends_at',
      'cancel_at_period_end',
    ],
    user_consent: ['document_id', 'onboarding_command_id'],
    cleaning_company_onboarding_command: [
      'command_id',
      'actor_uid',
      'org_id',
      'payload_hash',
      'trial_started_at',
      'trial_ends_at',
    ],
    cleaning_company_onboarding_consent_audit: [
      'audit_id',
      'command_id',
      'consent_id',
      'org_id',
      'uid',
      'consent_type',
      'accepted',
    ],
    cleaning_company_trial_redemption: [
      'redemption_id',
      'command_id',
      'uid',
      'email_normalized',
      'org_id',
    ],
    cleaning_company_onboarding_enrollment: [
      'enrollment_id',
      'actor_uid',
      'email_normalized',
      'provider_id',
      'status',
      'expires_at',
      'onboarding_command_id',
      'activated_at',
    ],
  }
  const expectedImmutableTriggers = [
    ['cleaning_company_onboarding_command', 'cleaning_company_onboarding_command_immutable'],
    ['cleaning_company_onboarding_consent_audit', 'cleaning_company_onboarding_consent_audit_immutable'],
    ['cleaning_company_trial_redemption', 'cleaning_company_trial_redemption_immutable'],
  ]
  const expectedIndexes = [
    { name: 'organization_company_profile_nip_cleaning_provider_uidx' },
    { name: 'user_consent_onboarding_command_type_uidx' },
    { name: 'cleaning_company_trial_redemption_email_uidx' },
    {
      name: 'cleaning_company_onboarding_enrollment_active_uidx',
      enrollmentColumn: 'actor_uid',
    },
    {
      name: 'cleaning_company_onboarding_enrollment_active_email_uidx',
      enrollmentColumn: 'email_normalized',
    },
  ]
  const columnsReady = Object.entries(requiredColumnsByTable).every(
    ([tableName, expected]) => hasColumns(columns, tableName, expected),
  ) && hasNonNullableColumns(columns, 'cleaning_company_onboarding_enrollment', [
    'enrollment_id',
    'actor_uid',
    'email_normalized',
    'provider_id',
    'status',
    'expires_at',
    'created_at',
    'activated_at',
  ])
  const indexesReady = expectedIndexes.every(({ name, enrollmentColumn = '' }) => {
    const index = indexes.find((candidate) => candidate.index_name === name)
    if (enrollmentColumn) return enrollmentIndexIsExpected(index, enrollmentColumn)
    return index?.is_unique === true && index?.is_valid === true && index?.is_ready === true
  })
  const expectedEnrollmentConstraints = [
    {
      name: 'cleaning_company_onboarding_enrollment_pkey',
      type: 'p',
      columns: 'enrollment_id',
    },
    {
      name: 'cleaning_company_onboarding_enrollment_command_fk',
      type: 'f',
      columns: 'onboarding_command_id',
      foreignTable: 'cleaning_company_onboarding_command',
      foreignColumns: 'command_id',
      fragments: ['FOREIGN KEY (onboarding_command_id)'],
    },
    {
      name: 'cleaning_company_onboarding_enrollment_provider_check',
      type: 'c',
      fragments: ["provider_id = 'google.com'"],
    },
    {
      name: 'cleaning_company_onboarding_enrollment_status_check',
      type: 'c',
      definitionMatches: enrollmentStatusConstraintIsExpected,
    },
    {
      name: 'cleaning_company_onboarding_enrollment_expiry_check',
      type: 'c',
      fragments: ['expires_at > activated_at'],
    },
    {
      name: 'cleaning_company_onboarding_enrollment_lifecycle_check',
      type: 'c',
      fragments: [
        "status = 'ACTIVE'",
        "status = 'CONSUMED'",
        "status = 'EXPIRED'",
        'onboarding_command_id is not null',
      ],
    },
  ]
  const constraintsReady = expectedEnrollmentConstraints.every((expected) => {
    const constraint = constraints.find(
      (candidate) => candidate.constraint_name === expected.name,
    )
    return enrollmentConstraintIsExpected(constraint, expected) &&
      (!expected.definitionMatches || expected.definitionMatches(constraint))
  })
  const triggersReady = expectedImmutableTriggers.every(
    ([tableName, triggerName]) => triggers.some((trigger) =>
      trigger.table_name === tableName &&
      trigger.trigger_name === triggerName &&
      trigger.enabled !== 'D' &&
      trigger.function_name === 'reject_cleaning_company_onboarding_mutation()',
    ),
  )

  let counts = {
    companyProfiles: null,
    duplicateValidNips: null,
    onboardingCommands: null,
    onboardingConsentAudits: null,
    trialRedemptions: null,
    onboardingEnrollments: null,
  }
  if (relations.organization_company_profile) {
    const countsResult = await client.query(
      `select
         (select count(*)::integer from public.organization_company_profile) as "companyProfiles",
         (
           select count(*)::integer
             from (
               select tax_id_normalized
                 from public.organization_company_profile
                where upper(coalesce(tax_id_type, '')) = 'NIP'
                  and tax_id_normalized ~ '^[0-9]{10}$'
                group by tax_id_normalized
               having count(*) > 1
             ) duplicates
         ) as "duplicateValidNips"`,
    )
    counts = countsResult.rows[0]
  }
  if (relations.onboarding_command) {
    const result = await client.query(
      'select count(*)::integer as count from public.cleaning_company_onboarding_command',
    )
    counts.onboardingCommands = result.rows[0].count
  }
  if (relations.onboarding_consent_audit) {
    const result = await client.query(
      'select count(*)::integer as count from public.cleaning_company_onboarding_consent_audit',
    )
    counts.onboardingConsentAudits = result.rows[0].count
  }
  if (relations.trial_redemption) {
    const result = await client.query(
      'select count(*)::integer as count from public.cleaning_company_trial_redemption',
    )
    counts.trialRedemptions = result.rows[0].count
  }
  if (relations.onboarding_enrollment) {
    const result = await client.query(
      'select count(*)::integer as count from public.cleaning_company_onboarding_enrollment',
    )
    counts.onboardingEnrollments = result.rows[0].count
  }

  return {
    target: targetResult.rows[0],
    relations,
    requiredColumnsByTable,
    columns,
    indexes,
    constraints,
    triggers,
    counts,
    subscriptionInsertRequirements: {
      allColumns: subscriptionRequirements,
      notNullWithoutDefault: requiredColumns(subscriptionRequirements),
      canonicalCurrentPeriodColumn: 'current_period_started_at',
      legacyCurrentPeriodColumnPresent: subscriptionRequirements.some(
        (column) => column.column_name === 'current_period_starts_at',
      ),
    },
    insertRequirements: Object.fromEntries([
      'organizations',
      'organization_member',
      'worker',
      'organization_company_profile',
      'organization_subscription',
      'subscription_event',
      'user_consent',
      'cleaning_company_onboarding_command',
      'cleaning_company_onboarding_consent_audit',
      'cleaning_company_trial_redemption',
      'cleaning_company_onboarding_enrollment',
    ].map((tableName) => {
      const table = tableColumns(columns, tableName)
      return [tableName, {
        allColumns: table,
        notNullWithoutDefault: requiredColumns(table),
      }]
    })),
    ready: requiredRelations.every((name) => Boolean(relations[name])) &&
      columnsReady &&
      indexesReady &&
      constraintsReady &&
      triggersReady,
  }
}

function assertProductionConfirmation(audit, projectId) {
  if (audit) return

  const confirmation = argumentValue('--confirm-production')
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`PROJECT_MISMATCH:${projectId || '<missing>'}`)
  }
  if (confirmation !== PRODUCTION_CONFIRMATION) {
    throw new Error(
      `PRODUCTION_CONFIRMATION_REQUIRED:--confirm-production=${PRODUCTION_CONFIRMATION}`,
    )
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  const explicitAudit = process.argv.includes('--audit')
  if (apply && explicitAudit) {
    throw new Error('MODE_CONFLICT:choose --audit or --apply')
  }
  const audit = !apply

  await loadSecretManagerDatabaseConfig()
  const projectId = text(
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    EXPECTED_PROJECT_ID,
  )
  assertProductionConfirmation(audit, projectId)

  const { pool, connector } = await createPool()
  let client = null
  try {
    client = await pool.connect()
    const before = await inspectSchema(client)
    console.log(JSON.stringify({
      mode: audit ? 'audit' : 'apply',
      featureGate: featureGateStatus(),
      before,
    }, null, 2))

    if (audit) return
    if (before.target.database_name !== EXPECTED_DATABASE_NAME) {
      throw new Error(
        `DATABASE_MISMATCH:${before.target.database_name || '<missing>'}`,
      )
    }

    for (const fileName of MIGRATION_FILES) {
      const sql = fs.readFileSync(
        path.join(rootDir, 'dataconnect', 'migrations', fileName),
        'utf8',
      )
      await client.query(sql)
      console.log(`Applied ${fileName}`)
    }

    const after = await inspectSchema(client)
    if (!after.ready) {
      const error = new Error('CLEANING_COMPANY_ONBOARDING_SCHEMA_NOT_READY')
      error.details = after
      throw error
    }
    console.log(JSON.stringify({
      mode: 'postflight',
      featureGate: featureGateStatus(),
      after,
    }, null, 2))
  } finally {
    if (client) client.release()
    await pool.end()
    if (connector) connector.close()
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      'Cleaning-company onboarding migration failed:',
      text(error?.code || error?.message || error),
    )
    if (error?.details) {
      console.error(JSON.stringify(error.details, null, 2))
    }
    process.exitCode = 1
  })
}

module.exports = {
  EXPECTED_DATABASE_NAME,
  EXPECTED_PROJECT_ID,
  MIGRATION_FILES,
  PRODUCTION_CONFIRMATION,
  featureGateStatus,
  enrollmentStatusConstraintIsExpected,
  inspectSchema,
  requiredColumns,
  tableColumns,
}
