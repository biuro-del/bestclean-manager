'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  CLEANZI_ADMIN_TABLES,
  REQUIRED_SUBSCRIPTION_COLUMNS,
  calculateOperationPreview,
  executePlatformOperation,
  getOrganizationDetails,
  getPlatformDashboard,
  listBillingDocuments,
  listBillingTransactions,
  listOrganizations,
  listPlans,
  listSubscriptionHistory,
  previewPlatformOperation,
  requestFingerprint,
} = require('../backend/platform-admin-repository')
const { createBillingProvider } = require('../backend/billing/provider-registry')
const { assertPlatformPrincipal } = require('../../platform-repository')

function snapshot(overrides = {}) {
  return {
    organization: {
      orgId: 'org-1', name: 'Cleanzi Test', status: 'ACTIVE', onboardingStatus: 'COMPLETED',
      ownerUid: 'tenant-owner', ownerWorkerId: 'W001', deletedAt: null, createdAt: '2026-01-01T09:00:00.000Z',
    },
    subscription: {
      planCode: 'TRIAL', status: 'TRIALING', trialStartedAt: '2026-07-01T10:00:00.000Z',
      trialEndsAt: '2026-07-25T10:00:00.000Z', currentPeriodStartsAt: null,
      currentPeriodEndsAt: null, activatedAt: '2026-07-01T10:00:00.000Z', canceledAt: null,
      providerCode: null, providerSubscriptionId: null, createdAt: '2026-07-01T10:00:00.000Z',
      updatedAt: '2026-07-01T10:00:00.000Z', version: 3,
      ...overrides,
    },
  }
}

test('Trial można przedłużyć od późniejszej z dat: teraz lub obecny koniec', () => {
  const preview = calculateOperationPreview(
    snapshot(), 'EXTEND_TRIAL_DAYS', { days: 7 }, new Date('2026-07-21T10:00:00.000Z'),
  )
  assert.equal(preview.expectedVersion, 3)
  assert.equal(preview.after.subscription.trialEndsAt, '2026-08-01T10:00:00.000Z')
  assert.equal(preview.after.subscription.version, 4)
  assert.equal(preview.after.subscription.status, 'TRIALING')
})

test('zmiana na płatny plan wymaga poprawnego okresu i zachowuje dokładne czasy', () => {
  const preview = calculateOperationPreview(snapshot(), 'CHANGE_PLAN', {
    planCode: 'PRO',
    currentPeriodStartsAt: '2026-07-21T12:30:00.000Z',
    currentPeriodEndsAt: '2026-08-21T12:30:00.000Z',
  }, new Date('2026-07-21T12:00:00.000Z'))
  assert.equal(preview.after.subscription.planCode, 'PRO')
  assert.equal(preview.after.subscription.status, 'PENDING_PAYMENT')
  assert.equal(preview.after.subscription.activatedAt, null)
  assert.equal(preview.after.subscription.currentPeriodEndsAt, '2026-08-21T12:30:00.000Z')
})

test('ręczna aktywacja płatnego planu jest zablokowana na rzecz webhooka', () => {
  assert.throws(
    () => calculateOperationPreview(snapshot({ planCode: 'PRO', status: 'PENDING_PAYMENT' }), 'ACTIVATE_SUBSCRIPTION', {}),
    (error) => error.publicCode === 'PAID_ACTIVATION_WEBHOOK_REQUIRED',
  )
})

test('soft-delete, przywrócenie i zmiana Ownera korzystają ze wspólnego podglądu', () => {
  const deleted = calculateOperationPreview(snapshot(), 'SOFT_DELETE_ORGANIZATION', {}, new Date('2026-07-21T12:00:00.000Z'))
  assert.equal(deleted.after.organization.deletedAt, '2026-07-21T12:00:00.000Z')
  const restored = calculateOperationPreview({
    ...snapshot(), organization: { ...snapshot().organization, deletedAt: '2026-07-20T12:00:00.000Z' },
  }, 'RESTORE_ORGANIZATION', {}, new Date('2026-07-21T12:00:00.000Z'))
  assert.equal(restored.after.organization.deletedAt, null)
  const owner = calculateOperationPreview(snapshot(), 'TRANSFER_ORGANIZATION_OWNER', { newOwnerWorkerId: 'W002' })
  assert.equal(owner.after.organization.ownerWorkerId, 'W002')
})

test('kwoty finansowe pozostają liczbami całkowitymi i korekta może być ujemna', () => {
  const preview = calculateOperationPreview(snapshot(), 'RECORD_ADJUSTMENT', {
    amountMinor: '-12345', currency: 'pln', occurredAt: '2026-07-21T12:34:56.000Z',
  }, new Date('2026-07-21T12:00:00.000Z'))
  assert.equal(preview.after.transaction.amountMinor, '-12345')
  assert.equal(preview.after.transaction.currency, 'PLN')
  assert.equal(preview.after.transaction.occurredAt, '2026-07-21T12:34:56.000Z')
})

test('fingerprint idempotencji nie zależy od kolejności kluczy', () => {
  assert.equal(
    requestFingerprint({ orgId: 'org-1', payload: { amountMinor: '1000', currency: 'PLN' } }),
    requestFingerprint({ payload: { currency: 'PLN', amountMinor: '1000' }, orgId: 'org-1' }),
  )
})

test('adapter NONE ma wyłączone operacje zewnętrzne', () => {
  const provider = createBillingProvider({ BILLING_PROVIDER: 'NONE' })
  assert.equal(provider.providerCode, 'NONE')
  assert.deepEqual(provider.capabilities(), {
    charges: false, refunds: false, subscriptions: false, documents: false, webhooks: false,
  })
  assert.throws(() => createBillingProvider({ BILLING_PROVIDER: 'STRIPE' }), /BILLING_PROVIDER_NOT_CONFIGURED/)
})

function principalClient(adminOverrides = {}) {
  return {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase()
      if (normalized.includes('from unnest(')) {
        return { rows: [
          'public.platform_admin', 'public.platform_access_context', 'public.platform_admin_audit_log',
          'public.platform_email_mfa_challenge', 'public.platform_email_mfa_session',
        ].map((relation_name) => ({ relation_name, exists: true })) }
      }
      if (normalized.includes('from public.platform_admin p')) {
        return { rows: [{
          uid: 'platform-uid', email: 'platform@example.com', display_name: 'Platform Owner',
          role: 'PLATFORM_OWNER', active: true, has_tenant_membership: false, has_tenant_worker: false,
          ...adminOverrides,
        }] }
      }
      throw new Error(`UNEXPECTED_QUERY:${normalized}`)
    },
  }
}

function platformToken(overrides = {}) {
  return {
    uid: 'platform-uid', email: 'platform@example.com', email_verified: true,
    platformRole: 'PLATFORM_OWNER', auth_time: Math.floor(Date.now() / 1000),
    firebase: { sign_in_second_factor: 'totp' },
    ...overrides,
  }
}

test('panel otwiera tylko aktywny PLATFORM_OWNER z MFA i zweryfikowanym emailem', async () => {
  const principal = await assertPlatformPrincipal(principalClient(), platformToken())
  assert.equal(principal.role, 'PLATFORM_OWNER')
  assert.equal(principal.mfaVerified, true)
  await assert.rejects(
    assertPlatformPrincipal(principalClient(), platformToken({ platformRole: 'OWNER' })),
    (error) => error.publicCode === 'PLATFORM_CLAIM_REQUIRED',
  )
  await assert.rejects(
    assertPlatformPrincipal(principalClient(), platformToken({ firebase: {} })),
    (error) => error.publicCode === 'PLATFORM_MFA_REQUIRED',
  )
})

test('PLATFORM_OWNER powiązany z tenantem jest blokowany', async () => {
  await assert.rejects(
    assertPlatformPrincipal(principalClient({ has_tenant_worker: true }), platformToken()),
    (error) => error.publicCode === 'PLATFORM_TENANT_IDENTITY_CONFLICT',
  )
})

function financialClient() {
  const calls = []
  let storedTransaction = null
  let inserts = 0
  let historyInserts = 0
  const row = {
    org_id: 'org-1', name: 'Cleanzi Test', organization_status: 'ACTIVE', onboarding_status: 'COMPLETED',
    owner_uid: 'tenant-owner', owner_worker_id: 'W001', deleted_at: null,
    organization_created_at: new Date('2026-01-01T09:00:00.000Z'), plan_code: 'TRIAL',
    subscription_status: 'TRIALING', trial_started_at: new Date('2026-07-01T10:00:00.000Z'),
    trial_ends_at: new Date('2026-07-25T10:00:00.000Z'), current_period_starts_at: null,
    current_period_ends_at: null, activated_at: new Date('2026-07-01T10:00:00.000Z'),
    canceled_at: null, provider_code: null, provider_subscription_id: null,
    subscription_created_at: new Date('2026-07-01T10:00:00.000Z'),
    subscription_updated_at: new Date('2026-07-01T10:00:00.000Z'), subscription_version: 3,
  }
  return {
    calls,
    get inserts() { return inserts },
    get historyInserts() { return historyInserts },
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase()
      calls.push(normalized)
      if (normalized.startsWith('begin') || normalized.startsWith('commit') || normalized.startsWith('rollback')) return { rows: [] }
      if (normalized.includes('from unnest(')) return { rows: CLEANZI_ADMIN_TABLES.map((relation_name) => ({ relation_name, exists: true })) }
      if (normalized.includes("table_name = 'organization_subscription'") && normalized.includes('column_name = any')) {
        return { rows: REQUIRED_SUBSCRIPTION_COLUMNS.map((column_name) => ({ column_name })) }
      }
      if (normalized.includes('select org_id from public.organizations')) return { rows: [{ org_id: 'org-1' }] }
      if (normalized.includes('select org_id from public.organization_subscription')) return { rows: [{ org_id: 'org-1' }] }
      if (normalized.includes('from public.organizations o') && normalized.includes('left join public.organization_subscription')) return { rows: [row] }
      if (normalized.includes("where source = 'manual' and idempotency_key")) return { rows: storedTransaction ? [storedTransaction] : [] }
      if (normalized.includes('select plan_code from public.platform_plan')) return { rows: [{ plan_code: params[0] }] }
      if (normalized.startsWith('insert into public.organization_subscription (')) {
        return { rows: [{
          org_id: params[0], plan_code: params[1], status: params[2], trial_started_at: params[3],
          trial_ends_at: params[4], current_period_starts_at: params[5], current_period_ends_at: params[6],
          activated_at: params[7], canceled_at: params[8], provider_code: params[9],
          provider_subscription_id: params[10], created_at: new Date('2026-07-01T10:00:00.000Z'),
          updated_at: new Date('2026-07-21T12:00:00.000Z'), version: params[11],
        }] }
      }
      if (normalized.startsWith('insert into public.organization_subscription_history')) {
        historyInserts += 1
        return { rows: [] }
      }
      if (normalized.startsWith('insert into public.billing_transaction (')) {
        inserts += 1
        storedTransaction = {
          transaction_id: params[0], transaction_type: params[2], status: 'CONFIRMED',
          amount_minor: params[3], currency: params[4], source: 'MANUAL', reason: params[5],
          request_fingerprint: params[7], related_transaction_id: params[8] || null,
          occurred_at: new Date(params[9]), confirmed_at: new Date('2026-07-21T12:35:00.000Z'),
          created_at: new Date('2026-07-21T12:35:00.000Z'), updated_at: new Date('2026-07-21T12:35:00.000Z'),
        }
        return { rows: [storedTransaction] }
      }
      if (normalized.startsWith('insert into public.billing_transaction_event')) return { rows: [] }
      throw new Error(`UNEXPECTED_QUERY:${normalized}`)
    },
  }
}

test('ponowienie płatności z tym samym kluczem nie tworzy drugiej transakcji', async () => {
  const client = financialClient()
  const input = {
    orgId: 'org-1', operation: 'RECORD_PAYMENT', reason: 'Płatność potwierdzona poza systemem',
    payload: {
      amountMinor: '12500', currency: 'PLN', occurredAt: '2026-07-21T12:34:56.000Z',
      idempotencyKey: 'manual-payment-20260721-001',
    },
    expectedVersion: 3, principal: { uid: 'platform-uid' }, requestId: 'request-1',
    appendSucceeded: async () => {},
  }
  const first = await executePlatformOperation(client, input)
  const second = await executePlatformOperation(client, { ...input, requestId: 'request-2' })
  assert.equal(first.replayed, false)
  assert.equal(second.replayed, true)
  assert.equal(client.inserts, 1)
  assert.equal(first.transaction.transactionId, second.transaction.transactionId)
})

test('zmiana planu zapisuje subskrypcję, historię i audyt w jednej transakcji', async () => {
  const client = financialClient()
  let succeededAudits = 0
  const result = await executePlatformOperation(client, {
    orgId: 'org-1', operation: 'CHANGE_PLAN', reason: 'Akceptowana ręczna zmiana pakietu',
    payload: {
      planCode: 'PLUS', currentPeriodStartsAt: '2026-07-21T12:00:00.000Z',
      currentPeriodEndsAt: '2026-08-21T12:00:00.000Z',
    },
    expectedVersion: 3, principal: { uid: 'platform-uid' }, requestId: 'request-plan-1',
    appendSucceeded: async () => { succeededAudits += 1 },
  })
  assert.equal(result.subscription.planCode, 'PLUS')
  assert.equal(result.subscription.status, 'PENDING_PAYMENT')
  assert.equal(result.subscription.version, 4)
  assert.equal(client.historyInserts, 1)
  assert.equal(succeededAudits, 1)
  assert.ok(client.calls.includes('commit'))
})

test('błąd audytu SUCCEEDED wycofuje transakcję biznesową', async () => {
  const client = financialClient()
  await assert.rejects(executePlatformOperation(client, {
    orgId: 'org-1', operation: 'RECORD_PAYMENT', reason: 'Test atomowego audytu',
    payload: {
      amountMinor: '100', currency: 'PLN', occurredAt: '2026-07-21T12:34:56.000Z',
      idempotencyKey: 'manual-payment-rollback-001',
    },
    expectedVersion: 3, principal: { uid: 'platform-uid' }, requestId: 'request-fail',
    appendSucceeded: async () => { throw new Error('AUDIT_WRITE_FAILED') },
  }), /AUDIT_WRITE_FAILED/)
  assert.ok(client.calls.some((query) => query === 'rollback'))
  assert.ok(!client.calls.some((query) => query === 'commit'))
})

test('lista przekazuje filtry, sortowanie i paginację do parametryzowanego SQL', async () => {
  let listQuery = null
  let listParams = null
  const client = {
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase()
      if (normalized.includes('from unnest(')) return { rows: CLEANZI_ADMIN_TABLES.map((relation_name) => ({ relation_name, exists: true })) }
      if (normalized.includes("table_name = 'organization_subscription'") && normalized.includes('column_name = any')) {
        return { rows: REQUIRED_SUBSCRIPTION_COLUMNS.map((column_name) => ({ column_name })) }
      }
      listQuery = normalized
      listParams = params
      return { rows: [{
        org_id: 'org-2', name: 'Organizacja 2', organization_status: 'ACTIVE', onboarding_status: 'COMPLETED',
        owner_uid: 'owner-2', owner_worker_id: 'W002', owner_name: 'Jan Kowalski', owner_email: 'jan@example.com',
        deleted_at: null, organization_created_at: new Date('2026-02-03T04:05:06.000Z'),
        plan_code: 'PRO', subscription_status: 'ACTIVE', current_period_ends_at: new Date('2026-08-01T00:00:00.000Z'),
        ends_at: new Date('2026-08-01T00:00:00.000Z'), days_remaining: 11,
        last_payment_at: new Date('2026-07-20T10:11:12.000Z'), total_count: 3,
      }] }
    },
  }
  const result = await listOrganizations(client, {
    search: 'Kowalski', status: 'ACTIVE', onboardingStatus: 'COMPLETED', planCode: 'PRO',
    subscriptionStatus: 'ACTIVE', deletion: 'active', endingWithinDays: 7,
    sortBy: 'createdAt', sortDirection: 'DESC', page: 2, pageSize: 1,
  })
  assert.match(listQuery, /order by o\.created_at desc/)
  assert.deepEqual(listParams, ['Kowalski', 'ACTIVE', 'COMPLETED', 'PRO', 'ACTIVE', 'active', 7, 1, 1])
  assert.equal(result.page, 2)
  assert.equal(result.totalPages, 3)
  assert.equal(result.items[0].createdAt, '2026-02-03T04:05:06.000Z')
  assert.equal(result.items[0].lastPaymentAt, '2026-07-20T10:11:12.000Z')
})

function legacyReadClient() {
  return {
    calls: [],
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase()
      this.calls.push(normalized)
      if (normalized.includes('from unnest(')) {
        return { rows: CLEANZI_ADMIN_TABLES.map((relation_name) => ({ relation_name, exists: false })) }
      }
      if (normalized.includes("table_name = 'organization_subscription'") && normalized.includes('column_name = any')) {
        return { rows: REQUIRED_SUBSCRIPTION_COLUMNS.filter((name) => !['current_period_starts_at', 'version'].includes(name)).map((column_name) => ({ column_name })) }
      }
      if (normalized.includes('count(*)::integer as organizations_total')) {
        return { rows: [{ organizations_total: 4, organizations_deleted: 0, organizations_active: 2, organizations_suspended: 1, organizations_expired: 1 }] }
      }
      if (normalized.includes('as trials_active') && normalized.includes('without_subscription')) {
        return { rows: [{ trials_active: 2, trials_3: 0, trials_7: 1, trials_14: 2, trials_30: 2, start_active: 0, pro_active: 1, trial_total: 3, without_subscription: 1, past_due: 0, canceled: 0, expired: 0 }] }
      }
      if (normalized.includes('where o.org_id = $1::text limit 1')) {
        return { rows: [{
          org_id: 'org-legacy', name: 'Starsza organizacja', organization_status: 'ACTIVE', onboarding_status: 'COMPLETED',
          owner_uid: 'owner-1', owner_worker_id: 'W001', owner_name: 'Anna Nowak', owner_email: 'anna@example.com',
          deleted_at: null, organization_created_at: new Date('2026-07-01T10:00:00.000Z'),
          plan_code: 'TRIAL', subscription_status: 'TRIALING', trial_started_at: new Date('2026-07-01T10:00:00.000Z'),
          trial_ends_at: new Date('2026-07-30T10:00:00.000Z'), current_period_starts_at: null,
          current_period_ends_at: null, activated_at: new Date('2026-07-01T10:00:00.000Z'), canceled_at: null,
          provider_code: null, provider_subscription_id: null, subscription_created_at: new Date('2026-07-01T10:00:00.000Z'),
          subscription_updated_at: new Date('2026-07-20T10:00:00.000Z'), subscription_version: 0,
        }] }
      }
      throw new Error(`UNEXPECTED_QUERY:${normalized}`)
    },
  }
}

test('odczyty Panelu admina działają na starszym schemacie bez odpowiedzi 503', async () => {
  const dashboard = await getPlatformDashboard(legacyReadClient())
  assert.equal(dashboard.schemaReady, false)
  assert.equal(dashboard.organizations.total, 4)
  assert.equal(dashboard.subscriptions.withoutSubscription, 1)
  assert.deepEqual(dashboard.confirmedPayments, [])

  const plans = await listPlans(legacyReadClient())
  assert.deepEqual(plans.map((plan) => plan.planCode), ['TRIAL', 'GO_PLUS', 'PLUS', 'PRO'])

  const details = await getOrganizationDetails(legacyReadClient(), 'org-legacy')
  assert.equal(details.organization.name, 'Starsza organizacja')
  assert.equal(details.subscription.version, 0)
  assert.equal(details.capabilities.billing, false)

  for (const read of [listSubscriptionHistory, listBillingTransactions, listBillingDocuments]) {
    const page = await read(legacyReadClient(), 'org-legacy', { page: 2, pageSize: 10 })
    assert.equal(page.total, 0)
    assert.equal(page.page, 2)
    assert.equal(page.capabilities.billing, false)
  }
})

test('podgląd operacji jest eksportowany dla endpointu platformowego', () => {
  assert.equal(typeof previewPlatformOperation, 'function')
})
