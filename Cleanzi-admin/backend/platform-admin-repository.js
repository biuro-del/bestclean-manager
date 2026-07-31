'use strict'

const crypto = require('node:crypto')
const {
  CANONICAL_PLAN_CODES,
  PAID_PLAN_CODES,
  assertCanonicalPlanCode,
  normalizePlanCode,
} = require('../../plan-policy')

const CLEANZI_ADMIN_TABLES = [
  'public.platform_plan',
  'public.organization_profile',
  'public.billing_provider_event',
  'public.organization_subscription_history',
  'public.organization_billing_account',
  'public.billing_transaction',
  'public.billing_transaction_event',
  'public.billing_document',
]

const REQUIRED_SUBSCRIPTION_COLUMNS = [
  'trial_started_at',
  'current_period_starts_at',
  'current_period_ends_at',
  'activated_at',
  'canceled_at',
  'created_at',
  'updated_at',
  'version',
]

const PLAN_CODES = new Set(CANONICAL_PLAN_CODES)
const SUBSCRIPTION_OPERATIONS = new Set([
  'EXTEND_TRIAL_DAYS',
  'SET_TRIAL_END',
  'CHANGE_PLAN',
  'ACTIVATE_SUBSCRIPTION',
  'SUSPEND_SUBSCRIPTION',
  'CANCEL_SUBSCRIPTION',
  'EXPIRE_SUBSCRIPTION',
  'RESTART_SUBSCRIPTION',
  'ADJUST_BILLING_PERIOD',
])
const FINANCIAL_OPERATIONS = new Set(['RECORD_PAYMENT', 'RECORD_REFUND', 'RECORD_ADJUSTMENT'])
const ORGANIZATION_OPERATIONS = new Set([
  'UPDATE_ORGANIZATION',
  'SOFT_DELETE_ORGANIZATION',
  'RESTORE_ORGANIZATION',
  'TRANSFER_ORGANIZATION_OWNER',
])
const ALLOWED_OPERATIONS = new Set([
  ...SUBSCRIPTION_OPERATIONS,
  ...FINANCIAL_OPERATIONS,
  ...ORGANIZATION_OPERATIONS,
])

const ORGANIZATION_STATUSES = new Set(['ACTIVE', 'SUSPENDED', 'EXPIRED'])
const SUBSCRIPTION_STATUSES = new Set(['TRIALING', 'PENDING_PAYMENT', 'ACTIVE', 'SUSPENDED', 'PAST_DUE', 'CANCELED', 'EXPIRED'])

function text(value) {
  return String(value ?? '').trim()
}

function upper(value) {
  return text(value).toUpperCase()
}

function publicError(statusCode, publicCode, publicMessage, details = undefined) {
  const error = new Error(publicCode)
  error.statusCode = statusCode
  error.publicCode = publicCode
  error.publicMessage = publicMessage
  if (details !== undefined) error.details = details
  return error
}

function iso(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function parseRequiredDate(value, fieldName) {
  const parsed = value ? new Date(value) : null
  if (!parsed || !Number.isFinite(parsed.getTime())) {
    throw publicError(400, 'INVALID_DATE', `Pole ${fieldName} musi zawierać poprawną datę i godzinę.`)
  }
  return parsed
}

function normalizeReason(value) {
  const reason = text(value).slice(0, 1000)
  if (reason.length < 3) {
    throw publicError(400, 'PLATFORM_REASON_REQUIRED', 'Podaj powód operacji (minimum 3 znaki).')
  }
  return reason
}

function normalizeOperation(value) {
  const operation = upper(value)
  if (!ALLOWED_OPERATIONS.has(operation)) {
    throw publicError(400, 'INVALID_PLATFORM_OPERATION', 'Nieobsługiwana operacja administracyjna.')
  }
  return operation
}

function normalizeCurrency(value) {
  const currency = upper(value)
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw publicError(400, 'INVALID_CURRENCY', 'Waluta musi być trzyznakowym kodem ISO, np. PLN.')
  }
  return currency
}

function normalizeMinorAmount(value, { allowNegative = false } = {}) {
  const raw = text(value)
  if (!/^-?\d{1,18}$/.test(raw)) {
    throw publicError(400, 'INVALID_AMOUNT', 'Kwota musi być liczbą całkowitą w najmniejszych jednostkach waluty.')
  }
  const amount = BigInt(raw)
  if ((!allowNegative && amount <= 0n) || (allowNegative && amount === 0n)) {
    throw publicError(400, 'INVALID_AMOUNT', 'Kwota musi być różna od zera i mieć poprawny znak.')
  }
  return amount
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
  }
  return value
}

function requestFingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')
}

function subscriptionState(row) {
  if (!row || !text(row.plan_code)) return null
  return {
    planCode: upper(row.plan_code),
    status: upper(row.subscription_status ?? row.status),
    trialStartedAt: iso(row.trial_started_at),
    trialEndsAt: iso(row.trial_ends_at),
    currentPeriodStartsAt: iso(row.current_period_starts_at),
    currentPeriodEndsAt: iso(row.current_period_ends_at),
    activatedAt: iso(row.activated_at),
    canceledAt: iso(row.canceled_at),
    providerCode: text(row.provider_code) || null,
    providerSubscriptionId: text(row.provider_subscription_id) || null,
    createdAt: iso(row.subscription_created_at ?? row.created_at),
    updatedAt: iso(row.subscription_updated_at ?? row.updated_at),
    version: Number(row.subscription_version ?? row.version ?? 0),
  }
}

function organizationState(row) {
  return {
    orgId: text(row.org_id),
    name: text(row.name),
    status: upper(row.organization_status ?? row.status),
    onboardingStatus: upper(row.onboarding_status),
    ownerUid: text(row.owner_uid) || null,
    ownerWorkerId: text(row.owner_worker_id) || null,
    deletedAt: iso(row.deleted_at),
    createdAt: iso(row.organization_created_at ?? row.created_at),
  }
}

async function inspectCleanziAdminSchema(client) {
  const relations = await client.query(
    `select relation_name, to_regclass(relation_name) is not null as exists
       from unnest($1::text[]) relations(relation_name)`,
    [CLEANZI_ADMIN_TABLES],
  )
  const columns = await client.query(
    `select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'organization_subscription'
        and column_name = any($1::text[])`,
    [REQUIRED_SUBSCRIPTION_COLUMNS],
  )
  const existingColumns = new Set(columns.rows.map((row) => text(row.column_name)))
  const missing = [
    ...relations.rows.filter((row) => row.exists !== true).map((row) => text(row.relation_name)),
    ...REQUIRED_SUBSCRIPTION_COLUMNS
      .filter((column) => !existingColumns.has(column))
      .map((column) => `public.organization_subscription.${column}`),
  ]
  return { ready: missing.length === 0, missing }
}

async function assertCleanziAdminSchemaReady(client) {
  const readiness = await inspectCleanziAdminSchema(client)
  if (!readiness.ready) {
    throw publicError(
      503,
      'CLEANZI_ADMIN_SCHEMA_NOT_READY',
      'Rozszerzenie rozliczeń platformy nie jest jeszcze gotowe. Uruchom zatwierdzoną migrację lokalnie lub na wskazanym środowisku.',
      readiness,
    )
  }
  return readiness
}

function pagination(filters = {}, defaultPageSize = 25) {
  const page = Math.max(1, Math.trunc(Number(filters.page) || 1))
  const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(filters.pageSize) || defaultPageSize)))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

async function listOrganizationsLegacy(client, filters = {}) {
  const { page, pageSize, offset } = pagination(filters)
  const search = text(filters.search).slice(0, 160)
  const status = upper(filters.status).slice(0, 30)
  const planCode = upper(filters.planCode).slice(0, 30)
  const deletion = text(filters.deletion).toLowerCase()
  const result = await client.query(
    `select o.org_id, o.name, o.status, o.onboarding_status, o.owner_uid, o.owner_worker_id,
            o.deleted_at, o.created_at, coalesce(s.plan_code, '') as plan_code,
            coalesce(s.status, '') as subscription_status, s.trial_ends_at,
            nullif(to_jsonb(s)->>'current_period_ends_at', '')::timestamptz as current_period_ends_at,
            count(*) over()::integer as total_count
       from public.organizations o
       left join public.organization_subscription s on s.org_id = o.org_id
      where ($1::text = '' or o.name ilike '%' || $1::text || '%' or o.org_id ilike '%' || $1::text || '%')
        and ($2::text = '' or upper(coalesce(o.status, '')) = $2::text)
        and ($3::text = '' or upper(coalesce(s.plan_code, '')) = $3::text)
        and ($4::text not in ('active', 'deleted')
             or ($4::text = 'active' and o.deleted_at is null)
             or ($4::text = 'deleted' and o.deleted_at is not null))
      order by o.deleted_at nulls first, lower(o.name), o.org_id
      limit $5::integer offset $6::integer`,
    [search, status, planCode, deletion, pageSize, offset],
  )
  const total = Number(result.rows[0]?.total_count || 0)
  return {
    items: result.rows.map((row) => ({
      ...organizationState(row),
      owner: { uid: text(row.owner_uid), workerId: text(row.owner_worker_id), name: '', email: '' },
      planCode: upper(row.plan_code),
      subscriptionStatus: upper(row.subscription_status),
      trialEndsAt: iso(row.trial_ends_at),
      currentPeriodEndsAt: iso(row.current_period_ends_at),
      endsAt: iso(upper(row.plan_code) === 'TRIAL' ? row.trial_ends_at : row.current_period_ends_at),
      daysRemaining: null,
      lastPaymentAt: null,
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    capabilities: { billing: false, sort: false },
  }
}

async function listOrganizations(client, filters = {}) {
  const readiness = await inspectCleanziAdminSchema(client)
  if (!readiness.ready) return listOrganizationsLegacy(client, filters)

  const { page, pageSize, offset } = pagination(filters)
  const search = text(filters.search).slice(0, 160)
  const status = upper(filters.status).slice(0, 30)
  const onboardingStatus = upper(filters.onboardingStatus).slice(0, 30)
  const planCode = upper(filters.planCode).slice(0, 30)
  const subscriptionStatus = upper(filters.subscriptionStatus).slice(0, 30)
  const deletion = text(filters.deletion).toLowerCase()
  const endingWithinDays = [3, 7, 14, 30].includes(Number(filters.endingWithinDays))
    ? Number(filters.endingWithinDays)
    : 0
  const sortColumns = {
    name: 'lower(o.name), o.org_id',
    createdAt: 'o.created_at',
    owner: "lower(coalesce(owner_worker.full_name, owner_worker.email, owner_worker.login_email, ''))",
    status: "upper(coalesce(o.status, ''))",
    onboardingStatus: "upper(coalesce(o.onboarding_status, ''))",
    planCode: "upper(coalesce(s.plan_code, ''))",
    subscriptionStatus: "upper(coalesce(s.status, ''))",
    endsAt: "(case when upper(coalesce(s.plan_code, '')) = 'TRIAL' then s.trial_ends_at else s.current_period_ends_at end)",
    lastPaymentAt: 'last_payment.occurred_at',
  }
  const sortBy = text(filters.sortBy)
  const orderBy = sortColumns[sortBy] || sortColumns.name
  const direction = upper(filters.sortDirection) === 'DESC' ? 'desc' : 'asc'

  const result = await client.query(
    `select o.org_id, o.name, o.status as organization_status, o.onboarding_status,
            o.owner_uid, o.owner_worker_id, o.deleted_at, o.created_at as organization_created_at,
            owner_worker.full_name as owner_name,
            coalesce(owner_worker.email, owner_worker.login_email, '') as owner_email,
            coalesce(s.plan_code, '') as plan_code,
            coalesce(s.status, '') as subscription_status,
            s.trial_started_at, s.trial_ends_at,
            s.current_period_starts_at, s.current_period_ends_at,
            case when upper(coalesce(s.plan_code, '')) = 'TRIAL'
                 then s.trial_ends_at else s.current_period_ends_at end as ends_at,
            case
              when (case when upper(coalesce(s.plan_code, '')) = 'TRIAL'
                         then s.trial_ends_at else s.current_period_ends_at end) is null then null
              else ceil(extract(epoch from (
                (case when upper(coalesce(s.plan_code, '')) = 'TRIAL'
                      then s.trial_ends_at else s.current_period_ends_at end) - now()
              )) / 86400.0)::integer
            end as days_remaining,
            last_payment.occurred_at as last_payment_at,
            count(*) over()::integer as total_count
       from public.organizations o
       left join public.organization_subscription s on s.org_id = o.org_id
       left join lateral (
         select w.full_name, w.email, w.login_email
           from public.worker w
          where w.org_id = o.org_id
            and (w.worker_id = o.owner_worker_id or w.auth_uid = o.owner_uid)
          order by case when w.worker_id = o.owner_worker_id then 0 else 1 end
          limit 1
       ) owner_worker on true
       left join lateral (
         select t.occurred_at
           from public.billing_transaction t
          where t.org_id = o.org_id
            and t.transaction_type = 'PAYMENT'
            and t.status = 'CONFIRMED'
          order by t.occurred_at desc, t.transaction_id desc
          limit 1
       ) last_payment on true
      where ($1::text = ''
             or o.name ilike '%' || $1::text || '%'
             or o.org_id ilike '%' || $1::text || '%'
             or coalesce(owner_worker.full_name, '') ilike '%' || $1::text || '%'
             or coalesce(owner_worker.email, '') ilike '%' || $1::text || '%')
        and ($2::text = '' or upper(coalesce(o.status, '')) = $2::text)
        and ($3::text = '' or upper(coalesce(o.onboarding_status, '')) = $3::text)
        and ($4::text = '' or upper(coalesce(s.plan_code, '')) = $4::text)
        and ($5::text = '' or upper(coalesce(s.status, '')) = $5::text)
        and ($6::text not in ('active', 'deleted')
             or ($6::text = 'active' and o.deleted_at is null)
             or ($6::text = 'deleted' and o.deleted_at is not null))
        and ($7::integer = 0 or (
          upper(coalesce(s.plan_code, '')) = 'TRIAL'
          and upper(coalesce(s.status, '')) = 'TRIALING'
          and s.trial_ends_at > now()
          and s.trial_ends_at <= now() + ($7::integer * interval '1 day')
        ))
      order by ${orderBy} ${direction} nulls last, o.org_id ${direction}
      limit $8::integer offset $9::integer`,
    [search, status, onboardingStatus, planCode, subscriptionStatus, deletion, endingWithinDays, pageSize, offset],
  )
  const total = Number(result.rows[0]?.total_count || 0)
  return {
    items: result.rows.map((row) => ({
      ...organizationState(row),
      owner: {
        uid: text(row.owner_uid),
        workerId: text(row.owner_worker_id),
        name: text(row.owner_name),
        email: text(row.owner_email),
      },
      planCode: upper(row.plan_code),
      subscriptionStatus: upper(row.subscription_status),
      trialStartedAt: iso(row.trial_started_at),
      trialEndsAt: iso(row.trial_ends_at),
      currentPeriodStartsAt: iso(row.current_period_starts_at),
      currentPeriodEndsAt: iso(row.current_period_ends_at),
      endsAt: iso(row.ends_at),
      daysRemaining: row.days_remaining === null ? null : Number(row.days_remaining),
      lastPaymentAt: iso(row.last_payment_at),
    })),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    sortBy: sortColumns[sortBy] ? sortBy : 'name',
    sortDirection: direction.toUpperCase(),
    capabilities: { billing: true, sort: true },
  }
}

async function getPlatformDashboard(client) {
  const readiness = await inspectCleanziAdminSchema(client)
  const metrics = await client.query(
    `select
       count(*)::integer as organizations_total,
       count(*) filter (where deleted_at is not null)::integer as organizations_deleted,
       count(*) filter (where deleted_at is null and upper(coalesce(status, '')) = 'ACTIVE')::integer as organizations_active,
       count(*) filter (where deleted_at is null and upper(coalesce(status, '')) = 'SUSPENDED')::integer as organizations_suspended,
       count(*) filter (where deleted_at is null and upper(coalesce(status, '')) = 'EXPIRED')::integer as organizations_expired
     from public.organizations`,
  )
  const subscriptions = await client.query(
    `select
       count(*) filter (
         where o.deleted_at is null and upper(coalesce(s.plan_code, '')) = 'TRIAL'
           and upper(coalesce(s.status, '')) = 'TRIALING' and s.trial_ends_at > now()
       )::integer as trials_active,
       count(*) filter (where o.deleted_at is null and upper(coalesce(s.plan_code, '')) = 'TRIAL'
         and upper(coalesce(s.status, '')) = 'TRIALING' and s.trial_ends_at > now()
         and s.trial_ends_at <= now() + interval '3 days')::integer as trials_3,
       count(*) filter (where o.deleted_at is null and upper(coalesce(s.plan_code, '')) = 'TRIAL'
         and upper(coalesce(s.status, '')) = 'TRIALING' and s.trial_ends_at > now()
         and s.trial_ends_at <= now() + interval '7 days')::integer as trials_7,
       count(*) filter (where o.deleted_at is null and upper(coalesce(s.plan_code, '')) = 'TRIAL'
         and upper(coalesce(s.status, '')) = 'TRIALING' and s.trial_ends_at > now()
         and s.trial_ends_at <= now() + interval '14 days')::integer as trials_14,
       count(*) filter (where o.deleted_at is null and upper(coalesce(s.plan_code, '')) = 'TRIAL'
         and upper(coalesce(s.status, '')) = 'TRIALING' and s.trial_ends_at > now()
         and s.trial_ends_at <= now() + interval '30 days')::integer as trials_30,
       count(*) filter (where o.deleted_at is null and upper(coalesce(s.plan_code, '')) = 'START'
         and upper(coalesce(s.status, '')) = 'ACTIVE')::integer as start_active,
       count(*) filter (where o.deleted_at is null and upper(coalesce(s.plan_code, '')) = 'PRO'
         and upper(coalesce(s.status, '')) = 'ACTIVE')::integer as pro_active,
       count(*) filter (where o.deleted_at is null and upper(coalesce(s.plan_code, '')) = 'TRIAL')::integer as trial_total,
       count(*) filter (where o.deleted_at is null and s.org_id is null)::integer as without_subscription,
       count(*) filter (where o.deleted_at is null and upper(coalesce(s.status, '')) = 'PAST_DUE')::integer as past_due,
       count(*) filter (where o.deleted_at is null and upper(coalesce(s.status, '')) = 'CANCELED')::integer as canceled,
       count(*) filter (where o.deleted_at is null and upper(coalesce(s.status, '')) = 'EXPIRED')::integer as expired
     from public.organizations o
     left join public.organization_subscription s on s.org_id = o.org_id`,
  )
  if (!readiness.ready) {
    return {
      generatedAt: new Date().toISOString(),
      schemaReady: false,
      schemaMissing: readiness.missing,
      capabilities: { billing: false },
      organizations: {
        total: Number(metrics.rows[0]?.organizations_total || 0),
        active: Number(metrics.rows[0]?.organizations_active || 0),
        suspended: Number(metrics.rows[0]?.organizations_suspended || 0),
        expired: Number(metrics.rows[0]?.organizations_expired || 0),
        deleted: Number(metrics.rows[0]?.organizations_deleted || 0),
      },
      trials: {
        active: Number(subscriptions.rows[0]?.trials_active || 0),
        endingWithinDays: {
          3: Number(subscriptions.rows[0]?.trials_3 || 0),
          7: Number(subscriptions.rows[0]?.trials_7 || 0),
          14: Number(subscriptions.rows[0]?.trials_14 || 0),
          30: Number(subscriptions.rows[0]?.trials_30 || 0),
        },
      },
      plans: {
        TRIAL: Number(subscriptions.rows[0]?.trial_total || 0),
        START: Number(subscriptions.rows[0]?.start_active || 0),
        PRO: Number(subscriptions.rows[0]?.pro_active || 0),
      },
      subscriptions: {
        withoutSubscription: Number(subscriptions.rows[0]?.without_subscription || 0),
        pastDue: Number(subscriptions.rows[0]?.past_due || 0),
        canceled: Number(subscriptions.rows[0]?.canceled || 0),
        expired: Number(subscriptions.rows[0]?.expired || 0),
      },
      confirmedPayments: [],
      mrr: { available: false, reason: 'BILLING_SCHEMA_NOT_READY', totals: [] },
    }
  }
  const paymentTotals = await client.query(
    `select currency, sum(amount_minor)::text as amount_minor
       from public.billing_transaction
      where transaction_type = 'PAYMENT' and status = 'CONFIRMED'
      group by currency order by currency`,
  )
  const recurring = await client.query(
    `select s.org_id, p.plan_code, p.price_amount_minor::text as price_amount_minor,
            p.currency, p.billing_interval_unit, p.billing_interval_count
       from public.organization_subscription s
       join public.organizations o on o.org_id = s.org_id and o.deleted_at is null
       left join public.platform_plan p on p.plan_code = s.plan_code
      where upper(coalesce(s.plan_code, '')) in ('GO_PLUS', 'PLUS', 'PRO', 'START', 'ENTERPRISE')
        and upper(coalesce(s.status, '')) = 'ACTIVE'`,
  )
  const incomplete = recurring.rows.some((row) => (
    row.price_amount_minor === null ||
    !/^[A-Z]{3}$/.test(text(row.currency)) ||
    upper(row.billing_interval_unit) !== 'MONTH' ||
    Number(row.billing_interval_count) !== 1
  ))
  const mrrTotals = new Map()
  if (!incomplete) {
    for (const row of recurring.rows) {
      const currency = upper(row.currency)
      mrrTotals.set(currency, (mrrTotals.get(currency) || 0n) + BigInt(row.price_amount_minor))
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    schemaReady: true,
    schemaMissing: [],
    capabilities: { billing: true },
    organizations: {
      total: Number(metrics.rows[0]?.organizations_total || 0),
      active: Number(metrics.rows[0]?.organizations_active || 0),
      suspended: Number(metrics.rows[0]?.organizations_suspended || 0),
      expired: Number(metrics.rows[0]?.organizations_expired || 0),
      deleted: Number(metrics.rows[0]?.organizations_deleted || 0),
    },
    trials: {
      active: Number(subscriptions.rows[0]?.trials_active || 0),
      endingWithinDays: {
        3: Number(subscriptions.rows[0]?.trials_3 || 0),
        7: Number(subscriptions.rows[0]?.trials_7 || 0),
        14: Number(subscriptions.rows[0]?.trials_14 || 0),
        30: Number(subscriptions.rows[0]?.trials_30 || 0),
      },
    },
    plans: {
      TRIAL: Number(subscriptions.rows[0]?.trial_total || 0),
      START: Number(subscriptions.rows[0]?.start_active || 0),
      PRO: Number(subscriptions.rows[0]?.pro_active || 0),
    },
    subscriptions: {
      withoutSubscription: Number(subscriptions.rows[0]?.without_subscription || 0),
      pastDue: Number(subscriptions.rows[0]?.past_due || 0),
      canceled: Number(subscriptions.rows[0]?.canceled || 0),
      expired: Number(subscriptions.rows[0]?.expired || 0),
    },
    confirmedPayments: paymentTotals.rows.map((row) => ({
      currency: upper(row.currency), amountMinor: text(row.amount_minor),
    })),
    mrr: incomplete
      ? { available: false, reason: 'PRICE_CATALOG_INCOMPLETE', totals: [] }
      : {
          available: true,
          reason: '',
          totals: [...mrrTotals.entries()].map(([currency, amount]) => ({ currency, amountMinor: amount.toString() })),
        },
  }
}

async function listPlans(client) {
  const readiness = await inspectCleanziAdminSchema(client)
  if (!readiness.ready) {
    return [
      { planCode: 'TRIAL', displayName: 'Trial', active: true, priceAmountMinor: null, currency: null, billingIntervalUnit: null, billingIntervalCount: null, createdAt: null, updatedAt: null },
      { planCode: 'GO_PLUS', displayName: 'GO+', active: true, priceAmountMinor: null, currency: null, billingIntervalUnit: null, billingIntervalCount: null, createdAt: null, updatedAt: null },
      { planCode: 'PLUS', displayName: 'PLUS', active: true, priceAmountMinor: null, currency: null, billingIntervalUnit: null, billingIntervalCount: null, createdAt: null, updatedAt: null },
      { planCode: 'PRO', displayName: 'PRO', active: true, priceAmountMinor: null, currency: null, billingIntervalUnit: null, billingIntervalCount: null, createdAt: null, updatedAt: null },
    ]
  }
  const result = await client.query(
    `select plan_code, display_name, active, price_amount_minor::text as price_amount_minor,
            currency, billing_interval_unit, billing_interval_count, created_at, updated_at
       from public.platform_plan order by case plan_code when 'TRIAL' then 0 when 'GO_PLUS' then 1 when 'PLUS' then 2 when 'PRO' then 3 else 4 end`,
  )
  return result.rows.map((row) => ({
    planCode: upper(row.plan_code),
    displayName: text(row.display_name),
    active: row.active === true,
    priceAmountMinor: row.price_amount_minor === null ? null : text(row.price_amount_minor),
    currency: upper(row.currency) || null,
    billingIntervalUnit: upper(row.billing_interval_unit) || null,
    billingIntervalCount: row.billing_interval_count === null ? null : Number(row.billing_interval_count),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }))
}

async function getOrganizationDetails(client, orgId) {
  const readiness = await inspectCleanziAdminSchema(client)
  if (!readiness.ready) return getOrganizationDetailsLegacy(client, orgId, readiness)
  const result = await client.query(
    `select o.org_id, o.name, o.status as organization_status, o.onboarding_status,
            o.owner_uid, o.owner_worker_id, o.deleted_at, o.created_at as organization_created_at,
            owner_worker.full_name as owner_name,
            coalesce(owner_worker.email, owner_worker.login_email, '') as owner_email,
            s.plan_code, s.status as subscription_status, s.trial_started_at, s.trial_ends_at,
            s.current_period_starts_at, s.current_period_ends_at, s.activated_at, s.canceled_at,
            s.provider_code, s.provider_subscription_id,
            s.created_at as subscription_created_at, s.updated_at as subscription_updated_at,
            s.version as subscription_version
       from public.organizations o
       left join public.organization_subscription s on s.org_id = o.org_id
       left join lateral (
         select w.full_name, w.email, w.login_email
           from public.worker w
          where w.org_id = o.org_id and (w.worker_id = o.owner_worker_id or w.auth_uid = o.owner_uid)
          order by case when w.worker_id = o.owner_worker_id then 0 else 1 end limit 1
       ) owner_worker on true
      where o.org_id = $1::text limit 1`,
    [text(orgId)],
  )
  const row = result.rows[0]
  if (!row) throw publicError(404, 'ORGANIZATION_NOT_FOUND', 'Nie znaleziono organizacji.')
  return {
    organization: {
      ...organizationState(row),
      owner: {
        uid: text(row.owner_uid), workerId: text(row.owner_worker_id),
        name: text(row.owner_name), email: text(row.owner_email),
      },
    },
    subscription: subscriptionState(row),
  }
}

async function getOrganizationDetailsLegacy(client, orgId, readiness) {
  const result = await client.query(
    `select o.org_id, o.name, o.status as organization_status, o.onboarding_status,
            o.owner_uid, o.owner_worker_id, o.deleted_at, o.created_at as organization_created_at,
            owner_worker.full_name as owner_name,
            coalesce(owner_worker.email, owner_worker.login_email, '') as owner_email,
            s.plan_code, s.status as subscription_status, s.trial_started_at, s.trial_ends_at,
            coalesce(
              nullif(to_jsonb(s)->>'current_period_starts_at', '')::timestamptz,
              nullif(to_jsonb(s)->>'current_period_started_at', '')::timestamptz
            ) as current_period_starts_at,
            nullif(to_jsonb(s)->>'current_period_ends_at', '')::timestamptz as current_period_ends_at,
            s.activated_at, s.canceled_at,
            coalesce(nullif(to_jsonb(s)->>'provider_code', ''), nullif(to_jsonb(s)->>'provider', '')) as provider_code,
            nullif(to_jsonb(s)->>'provider_subscription_id', '') as provider_subscription_id,
            s.created_at as subscription_created_at, s.updated_at as subscription_updated_at,
            coalesce(nullif(to_jsonb(s)->>'version', ''), '0')::integer as subscription_version
       from public.organizations o
       left join public.organization_subscription s on s.org_id = o.org_id
       left join lateral (
         select w.full_name, w.email, w.login_email
           from public.worker w
          where w.org_id = o.org_id and (w.worker_id = o.owner_worker_id or w.auth_uid = o.owner_uid)
          order by case when w.worker_id = o.owner_worker_id then 0 else 1 end limit 1
       ) owner_worker on true
      where o.org_id = $1::text limit 1`,
    [text(orgId)],
  )
  const row = result.rows[0]
  if (!row) throw publicError(404, 'ORGANIZATION_NOT_FOUND', 'Nie znaleziono organizacji.')
  return {
    organization: {
      ...organizationState(row),
      owner: {
        uid: text(row.owner_uid), workerId: text(row.owner_worker_id),
        name: text(row.owner_name), email: text(row.owner_email),
      },
    },
    subscription: subscriptionState(row),
    schemaReady: false,
    schemaMissing: readiness?.missing || [],
    capabilities: { billing: false, mutations: false },
  }
}

function emptyLegacyPage(filters = {}, readiness = null, defaultPageSize = 30) {
  const { page, pageSize } = pagination(filters, defaultPageSize)
  return {
    items: [],
    page,
    pageSize,
    total: 0,
    totalPages: 1,
    schemaReady: false,
    schemaMissing: readiness?.missing || [],
    capabilities: { billing: false },
  }
}

async function listSubscriptionHistory(client, orgId, filters = {}) {
  const readiness = await inspectCleanziAdminSchema(client)
  if (!readiness.ready) return emptyLegacyPage(filters, readiness)
  const { page, pageSize, offset } = pagination(filters, 30)
  const result = await client.query(
    `select history_id, request_id, operation, source, reason, admin_uid,
            before_state, after_state, created_at, count(*) over()::integer as total_count
       from public.organization_subscription_history
      where org_id = $1::text
      order by created_at desc, history_id desc
      limit $2::integer offset $3::integer`,
    [text(orgId), pageSize, offset],
  )
  const total = Number(result.rows[0]?.total_count || 0)
  return {
    items: result.rows.map((row) => ({
      historyId: text(row.history_id), requestId: text(row.request_id), operation: upper(row.operation),
      source: upper(row.source), reason: text(row.reason), adminUid: text(row.admin_uid),
      before: row.before_state || null, after: row.after_state || null, createdAt: iso(row.created_at),
    })),
    page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

async function listBillingTransactions(client, orgId, filters = {}) {
  const readiness = await inspectCleanziAdminSchema(client)
  if (!readiness.ready) return emptyLegacyPage(filters, readiness)
  const { page, pageSize, offset } = pagination(filters, 30)
  const result = await client.query(
    `select transaction_id, transaction_type, status, amount_minor::text as amount_minor,
            currency, source, reason, related_transaction_id, document_id, provider_code,
            provider_payment_id, provider_refund_id, occurred_at, confirmed_at, created_at, updated_at,
            count(*) over()::integer as total_count
       from public.billing_transaction
      where org_id = $1::text
      order by occurred_at desc, transaction_id desc
      limit $2::integer offset $3::integer`,
    [text(orgId), pageSize, offset],
  )
  const total = Number(result.rows[0]?.total_count || 0)
  return {
    items: result.rows.map((row) => ({
      transactionId: text(row.transaction_id), type: upper(row.transaction_type), status: upper(row.status),
      amountMinor: text(row.amount_minor), currency: upper(row.currency), source: upper(row.source),
      reason: text(row.reason), relatedTransactionId: text(row.related_transaction_id) || null,
      documentId: text(row.document_id) || null, providerCode: text(row.provider_code) || null,
      providerPaymentId: text(row.provider_payment_id) || null,
      providerRefundId: text(row.provider_refund_id) || null,
      occurredAt: iso(row.occurred_at), confirmedAt: iso(row.confirmed_at),
      createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    })),
    page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

async function listBillingDocuments(client, orgId, filters = {}) {
  const readiness = await inspectCleanziAdminSchema(client)
  if (!readiness.ready) return emptyLegacyPage(filters, readiness)
  const { page, pageSize, offset } = pagination(filters, 30)
  const result = await client.query(
    `select document_id, document_type, document_number, status, amount_minor::text as amount_minor,
            currency, source, reason, provider_code, provider_document_id, issued_at, due_at, paid_at,
            created_at, updated_at, count(*) over()::integer as total_count
       from public.billing_document
      where org_id = $1::text
      order by coalesce(issued_at, created_at) desc, document_id desc
      limit $2::integer offset $3::integer`,
    [text(orgId), pageSize, offset],
  )
  const total = Number(result.rows[0]?.total_count || 0)
  return {
    items: result.rows.map((row) => ({
      documentId: text(row.document_id), type: upper(row.document_type), number: text(row.document_number),
      status: upper(row.status), amountMinor: text(row.amount_minor), currency: upper(row.currency),
      source: upper(row.source), reason: text(row.reason), providerCode: text(row.provider_code) || null,
      providerDocumentId: text(row.provider_document_id) || null,
      issuedAt: iso(row.issued_at), dueAt: iso(row.due_at), paidAt: iso(row.paid_at),
      createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    })),
    page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function requireSubscription(snapshot) {
  if (!snapshot.subscription) {
    throw publicError(409, 'SUBSCRIPTION_MISSING', 'Organizacja nie ma bieżącej subskrypcji. Najpierw ustaw plan.')
  }
  return snapshot.subscription
}

function calculateOperationPreview(snapshot, operationValue, payloadValue = {}, nowValue = new Date()) {
  const operation = normalizeOperation(operationValue)
  const payload = payloadValue && typeof payloadValue === 'object' && !Array.isArray(payloadValue) ? payloadValue : {}
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue)
  if (!Number.isFinite(now.getTime())) throw publicError(500, 'INVALID_SERVER_TIME', 'Nie można ustalić czasu operacji.')
  const before = clone(snapshot)
  const after = clone(snapshot)

  if (ORGANIZATION_OPERATIONS.has(operation)) {
    if (operation === 'UPDATE_ORGANIZATION') {
      const name = text(payload.name).slice(0, 120)
      const status = upper(payload.status)
      const onboardingStatus = upper(payload.onboardingStatus).slice(0, 30)
      if (name) after.organization.name = name
      if (status) {
        if (!ORGANIZATION_STATUSES.has(status)) throw publicError(400, 'INVALID_ORGANIZATION_STATUS', 'Niepoprawny status organizacji.')
        after.organization.status = status
      }
      if (onboardingStatus) after.organization.onboardingStatus = onboardingStatus
    } else if (operation === 'SOFT_DELETE_ORGANIZATION') {
      after.organization.deletedAt = after.organization.deletedAt || now.toISOString()
    } else if (operation === 'RESTORE_ORGANIZATION') {
      after.organization.deletedAt = null
    } else if (operation === 'TRANSFER_ORGANIZATION_OWNER') {
      const workerId = text(payload.newOwnerWorkerId).slice(0, 128)
      if (!workerId) throw publicError(400, 'OWNER_WORKER_REQUIRED', 'Podaj Worker ID nowego Ownera.')
      after.organization.ownerWorkerId = workerId
      after.organization.ownerUid = null
    }
    return { operation, before, after, expectedVersion: snapshot.subscription?.version ?? 0 }
  }

  if (FINANCIAL_OPERATIONS.has(operation)) {
    const currency = normalizeCurrency(payload.currency)
    const allowNegative = operation === 'RECORD_ADJUSTMENT'
    let amount = normalizeMinorAmount(payload.amountMinor, { allowNegative })
    if (operation === 'RECORD_REFUND') amount = -amount
    const occurredAt = payload.occurredAt ? parseRequiredDate(payload.occurredAt, 'occurredAt') : now
    const type = operation.replace('RECORD_', '')
    return {
      operation,
      before: null,
      after: {
        transaction: {
          type,
          status: 'CONFIRMED',
          amountMinor: amount.toString(),
          currency,
          occurredAt: occurredAt.toISOString(),
          relatedTransactionId: text(payload.relatedTransactionId) || null,
        },
      },
      expectedVersion: snapshot.subscription?.version ?? 0,
    }
  }

  const current = requireSubscription(snapshot)
  const next = after.subscription
  if (operation === 'EXTEND_TRIAL_DAYS') {
    if (current.planCode !== 'TRIAL') throw publicError(409, 'TRIAL_PLAN_REQUIRED', 'Przedłużenie Trial wymaga planu TRIAL.')
    const days = Math.trunc(Number(payload.days))
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw publicError(400, 'INVALID_TRIAL_DAYS', 'Liczba dni musi mieścić się w zakresie 1–3650.')
    }
    const currentEnd = current.trialEndsAt ? new Date(current.trialEndsAt) : null
    const base = currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now
    next.trialStartedAt ||= now.toISOString()
    next.trialEndsAt = new Date(base.getTime() + days * 86400000).toISOString()
    next.status = 'TRIALING'
    next.activatedAt ||= now.toISOString()
    next.canceledAt = null
  } else if (operation === 'SET_TRIAL_END') {
    if (current.planCode !== 'TRIAL') throw publicError(409, 'TRIAL_PLAN_REQUIRED', 'Zmiana daty Trial wymaga planu TRIAL.')
    const trialEndsAt = parseRequiredDate(payload.trialEndsAt, 'trialEndsAt')
    if (trialEndsAt.getTime() <= now.getTime()) {
      throw publicError(400, 'TRIAL_END_IN_PAST', 'Koniec Trial musi przypadać w przyszłości. Do wygaszenia użyj osobnej operacji.')
    }
    next.trialStartedAt ||= now.toISOString()
    next.trialEndsAt = trialEndsAt.toISOString()
    next.status = 'TRIALING'
    next.activatedAt ||= now.toISOString()
    next.canceledAt = null
  } else if (operation === 'CHANGE_PLAN') {
    const planCode = assertCanonicalPlanCode(payload.planCode)
    if (!PLAN_CODES.has(planCode)) throw publicError(400, 'INVALID_PLAN', 'Dozwolone plany to TRIAL, START i PRO.')
    next.planCode = planCode
    next.canceledAt = null
    next.activatedAt = now.toISOString()
    if (planCode === 'TRIAL') {
      const trialEndsAt = payload.trialEndsAt
        ? parseRequiredDate(payload.trialEndsAt, 'trialEndsAt')
        : current.trialEndsAt ? new Date(current.trialEndsAt) : null
      if (!trialEndsAt || trialEndsAt.getTime() <= now.getTime()) {
        throw publicError(400, 'TRIAL_END_REQUIRED', 'Zmiana na TRIAL wymaga przyszłej daty końca Trial.')
      }
      next.status = 'TRIALING'
      next.trialStartedAt = current.trialStartedAt || now.toISOString()
      next.trialEndsAt = trialEndsAt.toISOString()
      next.currentPeriodStartsAt = null
      next.currentPeriodEndsAt = null
    } else {
      const startsAt = payload.currentPeriodStartsAt
        ? parseRequiredDate(payload.currentPeriodStartsAt, 'currentPeriodStartsAt')
        : current.currentPeriodStartsAt ? new Date(current.currentPeriodStartsAt) : now
      const endsAt = payload.currentPeriodEndsAt
        ? parseRequiredDate(payload.currentPeriodEndsAt, 'currentPeriodEndsAt')
        : current.currentPeriodEndsAt ? new Date(current.currentPeriodEndsAt) : null
      if (!endsAt || endsAt.getTime() <= startsAt.getTime() || endsAt.getTime() <= now.getTime()) {
        throw publicError(400, 'BILLING_PERIOD_REQUIRED', 'Plan płatny wymaga poprawnego początku i końca okresu.')
      }
      next.status = 'PENDING_PAYMENT'
      next.activatedAt = null
      next.currentPeriodStartsAt = startsAt.toISOString()
      next.currentPeriodEndsAt = endsAt.toISOString()
    }
  } else if (operation === 'ADJUST_BILLING_PERIOD') {
    if (!PAID_PLAN_CODES.includes(normalizePlanCode(current.planCode))) {
      throw publicError(409, 'PAID_PLAN_REQUIRED', 'Okres rozliczeniowy dotyczy planu START lub PRO.')
    }
    const startsAt = parseRequiredDate(payload.currentPeriodStartsAt, 'currentPeriodStartsAt')
    const endsAt = parseRequiredDate(payload.currentPeriodEndsAt, 'currentPeriodEndsAt')
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw publicError(400, 'INVALID_BILLING_PERIOD', 'Koniec okresu musi przypadać po jego początku.')
    }
    next.currentPeriodStartsAt = startsAt.toISOString()
    next.currentPeriodEndsAt = endsAt.toISOString()
  } else {
    if (
      (operation === 'ACTIVATE_SUBSCRIPTION' || operation === 'RESTART_SUBSCRIPTION') &&
      PAID_PLAN_CODES.includes(normalizePlanCode(current.planCode))
    ) {
      throw publicError(
        409,
        'PAID_ACTIVATION_WEBHOOK_REQUIRED',
        'Płatny plan może aktywować wyłącznie zweryfikowany webhook operatora płatności.',
      )
    }
    const targetByOperation = {
      ACTIVATE_SUBSCRIPTION: current.planCode === 'TRIAL' ? 'TRIALING' : 'ACTIVE',
      SUSPEND_SUBSCRIPTION: 'SUSPENDED',
      CANCEL_SUBSCRIPTION: 'CANCELED',
      EXPIRE_SUBSCRIPTION: 'EXPIRED',
      RESTART_SUBSCRIPTION: current.planCode === 'TRIAL' ? 'TRIALING' : 'ACTIVE',
    }
    const target = targetByOperation[operation]
    if (!SUBSCRIPTION_STATUSES.has(target)) throw publicError(400, 'INVALID_SUBSCRIPTION_STATUS', 'Niepoprawny status subskrypcji.')
    if (target === 'TRIALING') {
      const end = current.trialEndsAt ? new Date(current.trialEndsAt) : null
      if (!end || end.getTime() <= now.getTime()) {
        throw publicError(409, 'TRIAL_EXTENSION_REQUIRED', 'Przed aktywacją przedłuż datę Trial.')
      }
      next.trialStartedAt ||= now.toISOString()
    }
    if (target === 'ACTIVE') {
      const end = current.currentPeriodEndsAt ? new Date(current.currentPeriodEndsAt) : null
      if (!end || end.getTime() <= now.getTime()) {
        throw publicError(409, 'BILLING_PERIOD_REQUIRED', 'Przed aktywacją ustaw przyszły koniec okresu rozliczeniowego.')
      }
    }
    next.status = target
    if (target === 'CANCELED') next.canceledAt = now.toISOString()
    if (target === 'ACTIVE' || target === 'TRIALING') {
      next.activatedAt = now.toISOString()
      next.canceledAt = null
    }
  }

  next.version = Number(current.version || 0) + 1
  next.updatedAt = now.toISOString()
  return { operation, before, after, expectedVersion: Number(current.version || 0) }
}

async function loadOperationSnapshot(client, orgId, { lock = false } = {}) {
  if (lock) {
    await client.query('select org_id from public.organizations where org_id = $1::text for update', [text(orgId)])
    await client.query(
      'select org_id from public.organization_subscription where org_id = $1::text for update',
      [text(orgId)],
    )
  }
  const details = await client.query(
    `select o.org_id, o.name, o.status as organization_status, o.onboarding_status,
            o.owner_uid, o.owner_worker_id, o.deleted_at, o.created_at as organization_created_at,
            s.plan_code, s.status as subscription_status, s.trial_started_at, s.trial_ends_at,
            s.current_period_starts_at, s.current_period_ends_at, s.activated_at, s.canceled_at,
            s.provider_code, s.provider_subscription_id,
            s.created_at as subscription_created_at, s.updated_at as subscription_updated_at,
            s.version as subscription_version
       from public.organizations o
       left join public.organization_subscription s on s.org_id = o.org_id
      where o.org_id = $1::text`,
    [text(orgId)],
  )
  const row = details.rows[0]
  if (!row) throw publicError(404, 'ORGANIZATION_NOT_FOUND', 'Nie znaleziono organizacji.')
  return { organization: organizationState(row), subscription: subscriptionState(row) }
}

async function previewPlatformOperation(client, { orgId, operation, reason, payload }) {
  await assertCleanziAdminSchemaReady(client)
  normalizeReason(reason)
  const snapshot = await loadOperationSnapshot(client, orgId)
  const preview = calculateOperationPreview(snapshot, operation, payload, new Date())
  if (preview.operation === 'CHANGE_PLAN') {
    const plan = await client.query(
      `select plan_code from public.platform_plan where plan_code = $1::text and active is true`,
      [preview.after.subscription.planCode],
    )
    if (!plan.rows[0]) throw publicError(409, 'PLAN_NOT_AVAILABLE', 'Wybrany plan nie jest aktywny w katalogu.')
  }
  return preview
}

async function persistSubscription(client, orgId, subscription) {
  const result = await client.query(
    `insert into public.organization_subscription (
       org_id, plan_code, status, trial_started_at, trial_ends_at,
       current_period_starts_at, current_period_ends_at, activated_at, canceled_at,
       provider_code, provider_subscription_id, created_at, updated_at, version
     ) values (
       $1::text, $2::text, $3::text, $4::timestamptz, $5::timestamptz,
       $6::timestamptz, $7::timestamptz, $8::timestamptz, $9::timestamptz,
       nullif($10::text, ''), nullif($11::text, ''), now(), now(), $12::integer
     )
     on conflict (org_id) do update set
       plan_code = excluded.plan_code,
       status = excluded.status,
       trial_started_at = excluded.trial_started_at,
       trial_ends_at = excluded.trial_ends_at,
       current_period_starts_at = excluded.current_period_starts_at,
       current_period_ends_at = excluded.current_period_ends_at,
       activated_at = excluded.activated_at,
       canceled_at = excluded.canceled_at,
       provider_code = excluded.provider_code,
       provider_subscription_id = excluded.provider_subscription_id,
       updated_at = now(),
       version = excluded.version
     returning *`,
    [
      text(orgId), subscription.planCode, subscription.status,
      subscription.trialStartedAt, subscription.trialEndsAt,
      subscription.currentPeriodStartsAt, subscription.currentPeriodEndsAt,
      subscription.activatedAt, subscription.canceledAt,
      subscription.providerCode, subscription.providerSubscriptionId,
      Number(subscription.version || 1),
    ],
  )
  return subscriptionState(result.rows[0])
}

async function insertSubscriptionHistory(client, { orgId, requestId, operation, reason, adminUid, before, after }) {
  await client.query(
    `insert into public.organization_subscription_history (
       history_id, org_id, request_id, operation, source, reason, admin_uid,
       before_state, after_state, created_at
     ) values ($1::text, $2::text, $3::text, $4::text, 'MANUAL', $5::text,
       nullif($6::text, ''), $7::jsonb, $8::jsonb, now())`,
    [crypto.randomUUID(), text(orgId), text(requestId), operation, reason, text(adminUid),
      JSON.stringify(before), JSON.stringify(after)],
  )
}

async function transferOrganizationOwner(client, orgId, newOwnerWorkerId) {
  const workerId = text(newOwnerWorkerId).slice(0, 128)
  const organizationResult = await client.query(
    `select org_id, owner_worker_id
       from public.organizations
      where org_id = $1::text
      for update`,
    [text(orgId)],
  )
  const organization = organizationResult.rows[0]
  if (!organization) throw publicError(404, 'ORGANIZATION_NOT_FOUND', 'Nie znaleziono organizacji.')
  const workerResult = await client.query(
    `select worker_id, auth_uid
       from public.worker
      where org_id = $1::text and worker_id = $2::text and active is true
      limit 1
      for update`,
    [text(orgId), workerId],
  )
  const newOwner = workerResult.rows[0]
  if (!newOwner || !text(newOwner.auth_uid)) {
    throw publicError(400, 'OWNER_ACCOUNT_REQUIRED', 'Nowy Owner musi być aktywnym pracownikiem z kontem Firebase Auth.')
  }
  const oldOwnerWorkerId = text(organization.owner_worker_id)
  if (oldOwnerWorkerId && oldOwnerWorkerId !== workerId) {
    await client.query(
      `update public.worker set role = 'ADMIN', updated_at = now()
        where org_id = $1::text and worker_id = $2::text`,
      [text(orgId), oldOwnerWorkerId],
    )
    await client.query(
      `update public.organization_member set role = 'ADMIN'
        where org_id = $1::text and worker_id = $2::text`,
      [text(orgId), oldOwnerWorkerId],
    )
  }
  await client.query(
    `update public.worker set role = 'OWNER', updated_at = now()
      where org_id = $1::text and worker_id = $2::text`,
    [text(orgId), workerId],
  )
  await client.query(
    `update public.organization_member set role = 'OWNER', status = 'ACTIVE'
      where org_id = $1::text and uid = $2::text`,
    [text(orgId), text(newOwner.auth_uid)],
  )
  const result = await client.query(
    `update public.organizations
        set owner_uid = $2::text, owner_worker_id = $3::text
      where org_id = $1::text
      returning org_id, name, status as organization_status, onboarding_status,
                owner_uid, owner_worker_id, deleted_at, created_at as organization_created_at`,
    [text(orgId), text(newOwner.auth_uid), workerId],
  )
  return organizationState(result.rows[0])
}

function normalizeIdempotencyKey(value) {
  const key = text(value)
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(key)) {
    throw publicError(400, 'INVALID_IDEMPOTENCY_KEY', 'Operacja finansowa wymaga poprawnego klucza idempotencji.')
  }
  return key
}

async function persistFinancialOperation(client, { orgId, operation, payload, reason, requestId }) {
  const idempotencyKey = normalizeIdempotencyKey(payload.idempotencyKey)
  const preview = calculateOperationPreview(
    await loadOperationSnapshot(client, orgId, { lock: true }),
    operation,
    payload,
    new Date(),
  )
  const transaction = preview.after.transaction
  const fingerprint = requestFingerprint({ orgId: text(orgId), operation, reason, transaction })
  const existing = await client.query(
    `select transaction_id, transaction_type, status, amount_minor::text as amount_minor,
            currency, source, reason, request_fingerprint, related_transaction_id,
            occurred_at, confirmed_at, created_at, updated_at
       from public.billing_transaction
      where source = 'MANUAL' and idempotency_key = $1::text
      for update`,
    [idempotencyKey],
  )
  const replayResult = (row) => {
    if (text(row.request_fingerprint) !== fingerprint) {
      throw publicError(409, 'IDEMPOTENCY_KEY_REUSED', 'Ten klucz idempotencji został użyty z innymi danymi.')
    }
    return {
      replayed: true,
      transaction: {
        transactionId: text(row.transaction_id), type: upper(row.transaction_type), status: upper(row.status),
        amountMinor: text(row.amount_minor), currency: upper(row.currency), source: upper(row.source),
        reason: text(row.reason), relatedTransactionId: text(row.related_transaction_id) || null,
        occurredAt: iso(row.occurred_at), confirmedAt: iso(row.confirmed_at),
        createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
      },
    }
  }
  if (existing.rows[0]) return replayResult(existing.rows[0])

  let relatedTransactionId = null
  if (operation === 'RECORD_REFUND') {
    relatedTransactionId = text(payload.relatedTransactionId)
    if (!relatedTransactionId) {
      throw publicError(400, 'PAYMENT_REFERENCE_REQUIRED', 'Zwrot wymaga wskazania płatności źródłowej.')
    }
    const payment = await client.query(
      `select transaction_id, amount_minor, currency
         from public.billing_transaction
        where transaction_id = $1::text and org_id = $2::text
          and transaction_type = 'PAYMENT' and status = 'CONFIRMED'
        for update`,
      [relatedTransactionId, text(orgId)],
    )
    if (!payment.rows[0]) throw publicError(404, 'PAYMENT_NOT_FOUND', 'Nie znaleziono potwierdzonej płatności do zwrotu.')
    if (upper(payment.rows[0].currency) !== transaction.currency) {
      throw publicError(409, 'REFUND_CURRENCY_MISMATCH', 'Waluta zwrotu musi odpowiadać walucie płatności.')
    }
    const refunded = await client.query(
      `select coalesce(sum(-amount_minor), 0)::text as refunded_minor
         from public.billing_transaction
        where related_transaction_id = $1::text
          and transaction_type = 'REFUND' and status = 'CONFIRMED'`,
      [relatedTransactionId],
    )
    const requested = -BigInt(transaction.amountMinor)
    if (BigInt(refunded.rows[0]?.refunded_minor || '0') + requested > BigInt(payment.rows[0].amount_minor)) {
      throw publicError(409, 'REFUND_EXCEEDS_PAYMENT', 'Łączna wartość zwrotów nie może przekroczyć płatności.')
    }
  }

  const transactionId = crypto.randomUUID()
  const result = await client.query(
    `insert into public.billing_transaction (
       transaction_id, org_id, transaction_type, status, amount_minor, currency,
       source, reason, idempotency_key, request_fingerprint, related_transaction_id,
       occurred_at, confirmed_at, created_at, updated_at
     ) values (
       $1::text, $2::text, $3::text, 'CONFIRMED', $4::bigint, $5::text,
       'MANUAL', $6::text, $7::text, $8::text, nullif($9::text, ''),
       $10::timestamptz, now(), now(), now()
     ) on conflict (source, idempotency_key) do nothing
     returning transaction_id, transaction_type, status, amount_minor::text as amount_minor,
       currency, source, reason, related_transaction_id, occurred_at, confirmed_at, created_at, updated_at`,
    [transactionId, text(orgId), transaction.type, transaction.amountMinor, transaction.currency,
      reason, idempotencyKey, fingerprint, relatedTransactionId, transaction.occurredAt],
  )
  if (!result.rows[0]) {
    const concurrent = await client.query(
      `select transaction_id, transaction_type, status, amount_minor::text as amount_minor,
              currency, source, reason, request_fingerprint, related_transaction_id,
              occurred_at, confirmed_at, created_at, updated_at
         from public.billing_transaction
        where source = 'MANUAL' and idempotency_key = $1::text
        for update`,
      [idempotencyKey],
    )
    if (!concurrent.rows[0]) {
      throw publicError(409, 'IDEMPOTENCY_CONFLICT', 'Nie udało się odczytać równoległego zapisu finansowego.')
    }
    return replayResult(concurrent.rows[0])
  }
  await client.query(
    `insert into public.billing_transaction_event (
       event_id, transaction_id, request_id, event_type, source, payload, created_at
     ) values ($1::text, $2::text, $3::text, 'CONFIRMED', 'MANUAL', $4::jsonb, now())`,
    [crypto.randomUUID(), transactionId, text(requestId), JSON.stringify({ reason })],
  )
  const row = result.rows[0]
  return {
    replayed: false,
    transaction: {
      transactionId: text(row.transaction_id), type: upper(row.transaction_type), status: upper(row.status),
      amountMinor: text(row.amount_minor), currency: upper(row.currency), source: upper(row.source),
      reason: text(row.reason), relatedTransactionId: text(row.related_transaction_id) || null,
      occurredAt: iso(row.occurred_at), confirmedAt: iso(row.confirmed_at),
      createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    },
  }
}

async function executePlatformOperation(client, {
  orgId,
  operation: operationValue,
  reason: reasonValue,
  payload: payloadValue,
  expectedVersion,
  principal,
  requestId,
  appendSucceeded,
}) {
  await assertCleanziAdminSchemaReady(client)
  const operation = normalizeOperation(operationValue)
  const reason = normalizeReason(reasonValue)
  const payload = payloadValue && typeof payloadValue === 'object' && !Array.isArray(payloadValue) ? payloadValue : {}
  await client.query('begin')
  try {
    let result
    if (FINANCIAL_OPERATIONS.has(operation)) {
      result = await persistFinancialOperation(client, { orgId, operation, payload, reason, requestId })
    } else {
      const snapshot = await loadOperationSnapshot(client, orgId, { lock: true })
      const version = Number(snapshot.subscription?.version || 0)
      if (!Number.isInteger(Number(expectedVersion)) || Number(expectedVersion) !== version) {
        throw publicError(409, 'STALE_PLATFORM_PREVIEW', 'Dane zmieniły się od czasu podglądu. Odśwież podgląd operacji.')
      }
      const preview = calculateOperationPreview(snapshot, operation, payload, new Date())
      if (operation === 'CHANGE_PLAN') {
        const plan = await client.query(
          `select plan_code from public.platform_plan where plan_code = $1::text and active is true`,
          [preview.after.subscription.planCode],
        )
        if (!plan.rows[0]) throw publicError(409, 'PLAN_NOT_AVAILABLE', 'Wybrany plan nie jest aktywny w katalogu.')
      }
      if (ORGANIZATION_OPERATIONS.has(operation)) {
        let organization
        if (operation === 'TRANSFER_ORGANIZATION_OWNER') {
          organization = await transferOrganizationOwner(client, orgId, payload.newOwnerWorkerId)
        } else if (operation === 'SOFT_DELETE_ORGANIZATION' || operation === 'RESTORE_ORGANIZATION') {
          const updated = await client.query(
            `update public.organizations
                set deleted_at = case when $2::boolean then coalesce(deleted_at, now()) else null end
              where org_id = $1::text
              returning org_id, name, status as organization_status, onboarding_status,
                        owner_uid, owner_worker_id, deleted_at, created_at as organization_created_at`,
            [text(orgId), operation === 'SOFT_DELETE_ORGANIZATION'],
          )
          organization = organizationState(updated.rows[0])
        } else {
          const nextOrganization = preview.after.organization
          const updated = await client.query(
            `update public.organizations
                set name = $2::text, status = $3::text, onboarding_status = nullif($4::text, '')
              where org_id = $1::text
              returning org_id, name, status as organization_status, onboarding_status,
                        owner_uid, owner_worker_id, deleted_at, created_at as organization_created_at`,
            [text(orgId), nextOrganization.name, nextOrganization.status, nextOrganization.onboardingStatus],
          )
          organization = organizationState(updated.rows[0])
        }
        result = { operation, organization }
      } else {
        const subscription = await persistSubscription(client, orgId, preview.after.subscription)
        await insertSubscriptionHistory(client, {
          orgId, requestId, operation, reason, adminUid: principal?.uid,
          before: preview.before.subscription, after: subscription,
        })
        result = { operation, subscription }
      }
    }
    if (typeof appendSucceeded === 'function') await appendSucceeded(result)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }
}

module.exports = {
  ALLOWED_OPERATIONS,
  CLEANZI_ADMIN_TABLES,
  FINANCIAL_OPERATIONS,
  PLAN_CODES,
  REQUIRED_SUBSCRIPTION_COLUMNS,
  SUBSCRIPTION_OPERATIONS,
  assertCleanziAdminSchemaReady,
  calculateOperationPreview,
  executePlatformOperation,
  getOrganizationDetails,
  getPlatformDashboard,
  inspectCleanziAdminSchema,
  listBillingDocuments,
  listBillingTransactions,
  listOrganizations,
  listPlans,
  listSubscriptionHistory,
  normalizeMinorAmount,
  normalizeOperation,
  previewPlatformOperation,
  requestFingerprint,
}
