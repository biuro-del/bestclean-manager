'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { PROFITABILITY_ACTIONS } = require('../profitability-entitlement-policy')
const { ISSUE_CODE, calculateObjectProfitability } = require('./domain')
const { ProfitabilityRepository, mapFinancialEntry } = require('./repository')

class ReadFixtureClient {
  constructor() {
    this.calls = []
  }

  async query(sql, params = []) {
    this.calls.push({ sql, params })
    if (/from public\.organization_member/.test(sql)) {
      return { rows: [{ org_id: 'ORG-1', role: 'OWNER', uid: 'UID-1' }] }
    }
    if (/from public\.organization_subscription/.test(sql)) {
      return { rows: [{ plan_code: 'PRO', status: 'ACTIVE' }] }
    }
    if (/from public\.profitability_permission/.test(sql)) return { rows: [] }
    if (/select object_id, client_id, timezone, default_currency/.test(sql)) {
      return {
        rows: [{
          client_id: 'CLIENT-1',
          default_currency: 'PLN',
          object_id: 'OBJ-1',
          timezone: 'Europe/Warsaw',
        }],
      }
    }
    return { rows: [] }
  }
}

class MutationFixtureClient extends ReadFixtureClient {
  constructor(role = 'OWNER', permissions = []) {
    super()
    this.role = role
    this.permissions = permissions
  }

  async query(sql, params = []) {
    this.calls.push({ sql, params })
    if (/from public\.organization_member/.test(sql)) {
      return { rows: [{ org_id: 'ORG-1', role: this.role, uid: 'UID-1' }] }
    }
    if (/from public\.organization_subscription/.test(sql)) {
      return { rows: [{ plan_code: 'PRO', status: 'ACTIVE' }] }
    }
    if (/from public\.profitability_permission/.test(sql)) {
      return {
        rows: this.permissions.map((permission_code) => ({ object_id: 'OBJ-1', permission_code })),
      }
    }
    if (/select object_id, client_id, name, timezone/.test(sql)) {
      return {
        rows: [{
          client_id: 'CLIENT-1',
          default_currency: 'PLN',
          name: 'Obiekt 1',
          object_id: 'OBJ-1',
          status: 'ACTIVE',
          timezone: 'Europe/Warsaw',
        }],
      }
    }
    if (/from public\.object_contract_version/.test(sql) && /for update/.test(sql)) return { rows: [] }
    if (/from public\.worker_cost_rate/.test(sql) && /for update/.test(sql)) return { rows: [] }
    if (/insert into public\.worker_cost_rate/.test(sql)) {
      return { rows: [{ hourly_cost_minor: params[4], rate_id: params[2] }] }
    }
    if (/insert into public\.object_contract_version/.test(sql)) {
      return { rows: [{ contract_version_id: params[2], effective_from: params[12] }] }
    }
    if (/insert into public\.object_financial_entry/.test(sql)) {
      return { rows: [{ amount_minor: params[8], entry_id: params[2] }] }
    }
    if (/select \* from public\.object_equipment/.test(sql)) return { rows: [] }
    if (/insert into public\.object_equipment/.test(sql)) {
      return { rows: [{ equipment_id: params[2], financing: params[6] }] }
    }
    if (/insert into public\.profitability_audit/.test(sql)) return { rows: [{ audit_id: 1 }] }
    return { rows: [] }
  }
}

class CalculationQualityFixtureClient extends ReadFixtureClient {
  constructor({ contract = null, unmappedLegacyAttendance = 0 } = {}) {
    super()
    this.contract = contract
    this.unmappedLegacyAttendance = unmappedLegacyAttendance
  }

  async query(sql, params = []) {
    if (/from public\.object_contract_version/.test(sql)) {
      this.calls.push({ sql, params })
      return { rows: this.contract ? [this.contract] : [] }
    }
    if (/select count\(\*\)::integer as unmapped_count/.test(sql)) {
      this.calls.push({ sql, params })
      return { rows: [{ unmapped_count: this.unmappedLegacyAttendance }] }
    }
    return super.query(sql, params)
  }
}

class TrendFixtureClient extends MutationFixtureClient {
  async query(sql, params = []) {
    if (/with ranked_snapshots as/.test(sql)) {
      this.calls.push({ sql, params })
      return {
        rows: [{
          calculated_at: new Date('2026-07-31T20:00:00.000Z'),
          calculation_status: 'CALCULATED',
          completeness_bps: '10000',
          currency: 'PLN',
          margin_minor: '650000',
          period_end: '2026-08-01',
          period_start: '2026-07-01',
          profitability_bps: '2167',
          revenue_minor: '3000000',
          snapshot_id: 'SNAP-CORRECTION',
          total_cost_minor: '2350000',
        }],
      }
    }
    return super.query(sql, params)
  }
}

test('repozytorium buduje wejście kalkulacji tylko z zapytań orgId + objectId', async () => {
  const client = new ReadFixtureClient()
  const repository = new ProfitabilityRepository(client)
  const input = await repository.loadObjectCalculationInput({
    objectId: 'OBJ-1',
    orgId: 'ORG-1',
    period: { start: '2026-07-01', end: '2026-08-01' },
    uid: 'UID-1',
  })

  assert.equal(input.orgId, 'ORG-1')
  assert.equal(input.objectId, 'OBJ-1')
  assert.equal(input.clientId, 'CLIENT-1')
  const objectQueries = client.calls.filter((call) => /object_id = \$2/.test(call.sql))
  assert.ok(objectQueries.length >= 7)
  for (const call of objectQueries) {
    assert.deepEqual(call.params.slice(0, 2), ['ORG-1', 'OBJ-1'])
  }
  const attendanceQuery = client.calls.find((call) => /from public\.event e/.test(call.sql)
    && /select e\.event_id/.test(call.sql))
  assert.match(attendanceQuery.sql, /z\.client_id = o\.client_id/)
  assert.match(attendanceQuery.sql, /\$2::varchar as object_id/)
  assert.match(attendanceQuery.sql, /null::varchar as periodic_work_id/)
  assert.doesNotMatch(attendanceQuery.sql, /e\.object_id|z\.object_id/)
})

test('repozytorium sprawdza backendową politykę przed odczytem', async () => {
  const client = new ReadFixtureClient()
  const repository = new ProfitabilityRepository(client)
  const decision = await repository.assertAccess({
    action: PROFITABILITY_ACTIONS.READ,
    objectId: 'OBJ-1',
    orgId: 'ORG-1',
    uid: 'UID-1',
  })
  assert.equal(decision.allowed, true)
  assert.ok(client.calls.some((call) => /organization_subscription/.test(call.sql)))
})

test('trend 12 miesięcy czyta najnowszy snapshot lub korektę wyłącznie w zakresie organizacji i obiektu', async () => {
  const client = new TrendFixtureClient()
  const repository = new ProfitabilityRepository(client)
  const trend = await repository.listProfitabilityTrend({
    clientId: 'CLIENT-1',
    objectId: 'OBJ-1',
    orgId: 'ORG-1',
    period: { start: '2026-07-01', end: '2026-08-01' },
    uid: 'UID-1',
  })

  assert.deepEqual(trend.window, { start: '2025-08-01', end: '2026-08-01', months: 12 })
  assert.equal(trend.source, 'PROFITABILITY_SNAPSHOT')
  assert.equal(trend.points[0].period, '2026-07')
  assert.equal(trend.points[0].snapshotId, 'SNAP-CORRECTION')
  assert.equal(trend.points[0].calculatedAt, '2026-07-31T20:00:00.000Z')
  assert.equal(trend.points[0].revenueMinor, '3000000')
  const trendQuery = client.calls.find((call) => /with ranked_snapshots as/.test(call.sql))
  assert.deepEqual(trendQuery.params, ['ORG-1', 'OBJ-1', '2025-08-01', '2026-08-01'])
  assert.match(trendQuery.sql, /partition by s\.org_id, s\.object_id, s\.period_id/)
  assert.match(trendQuery.sql, /s\.org_id = \$1/)
  assert.match(trendQuery.sql, /s\.object_id = \$2/)
  assert.match(trendQuery.sql, /snapshot_rank = 1/)
})

test('mapowanie wpisu finansowego zachowuje integer minor units jako decimal string', () => {
  const mapped = mapFinancialEntry({
    amount_minor: '900719925474099312345',
    category: 'CHEMISTRY',
    currency: 'PLN',
    entry_id: 'ENTRY-1',
    name: 'Koszt testowy',
    object_id: 'OBJ-1',
    occurred_on: '2026-07-10',
    org_id: 'ORG-1',
    period_end: null,
    period_start: null,
    recurrence: 'ONE_TIME',
    source: 'MANUAL',
  })
  assert.equal(mapped.amountMinor, '900719925474099312345')
  assert.equal(mapped.orgId, 'ORG-1')
  assert.equal(mapped.objectId, 'OBJ-1')
  assert.equal(mapped.name, 'Koszt testowy')
  assert.equal(mapped.source, 'MANUAL')
})

test('korekta zamkniętego wyniku wymaga powodu audytowego przed zapisem', async () => {
  const client = new ReadFixtureClient()
  const repository = new ProfitabilityRepository(client)
  await assert.rejects(
    repository.saveSnapshot({
      auditReason: '',
      periodId: '2026-07',
      result: { objectId: 'OBJ-1', orgId: 'ORG-1' },
      snapshot: { correctionOfSnapshotId: 'SNAP-OLD', snapshotId: 'SNAP-NEW' },
      uid: 'UID-1',
    }),
    (error) => error.code === 'CORRECTION_REASON_REQUIRED',
  )
  assert.equal(client.calls.length, 0)
})

test('grant profitability:edit z bazy oznacza zaufanego administratora finansowego', async () => {
  const client = new MutationFixtureClient('ADMIN', ['profitability:edit'])
  const repository = new ProfitabilityRepository(client)
  const access = await repository.resolveAccess({ orgId: 'ORG-1', objectId: 'OBJ-1', uid: 'UID-1' })
  assert.equal(access.principal.isFinanceAdmin, true)
  const decision = await repository.assertAccess({
    action: PROFITABILITY_ACTIONS.EDIT,
    objectId: 'OBJ-1',
    orgId: 'ORG-1',
    uid: 'UID-1',
  })
  assert.equal(decision.allowed, true)
})

test('grant zamknięcia okresu nie daje administratorowi pełnych praw edycji', async () => {
  const client = new MutationFixtureClient('ADMIN', ['profitability:close-period'])
  const repository = new ProfitabilityRepository(client)
  const access = await repository.resolveAccess({ orgId: 'ORG-1', objectId: 'OBJ-1', uid: 'UID-1' })
  assert.equal(access.principal.isFinanceAdmin, false)
  await assert.rejects(
    repository.assertAccess({
      action: PROFITABILITY_ACTIONS.EDIT,
      objectId: 'OBJ-1',
      orgId: 'ORG-1',
      uid: 'UID-1',
    }),
    (error) => error.statusCode === 403,
  )
  const closeDecision = await repository.assertClosePeriodAccess({
    objectId: 'OBJ-1',
    orgId: 'ORG-1',
    uid: 'UID-1',
  })
  assert.equal(closeDecision.allowed, true)
  assert.equal(closeDecision.action, 'close')
})

test('koordynator z grantem obiektowym widzi przyznany obiekt klienta', async () => {
  const client = new MutationFixtureClient('COORDINATOR', ['profitability:view-internal'])
  const repository = new ProfitabilityRepository(client)
  const objects = await repository.listServiceObjectsForClient({
    clientId: 'CLIENT-1',
    orgId: 'ORG-1',
    uid: 'UID-1',
  })
  assert.deepEqual(objects.map((object) => object.object_id), ['OBJ-1'])
  const permissionCall = client.calls.find((call) => /from public\.profitability_permission/.test(call.sql))
  assert.equal(permissionCall.params[2], 'OBJ-1')
})

test('przyszły grant podsumowania klienta nie otwiera wewnętrznych kosztów i historii', async () => {
  const client = new MutationFixtureClient('COORDINATOR', ['profitability:view-client-summary'])
  const repository = new ProfitabilityRepository(client)
  await assert.rejects(
    repository.listServiceObjectsForClient({
      clientId: 'CLIENT-1',
      orgId: 'ORG-1',
      uid: 'UID-1',
    }),
    (error) => error.statusCode === 403,
  )
})

test('starsza obecność bez mapowania do obiektu blokuje kompletny wynik zamiast zaniżać koszt pracy', async () => {
  const client = new CalculationQualityFixtureClient({
    contract: {
      billing_model: 'MONTHLY_FIXED',
      contract_version_id: 'CONTRACT-1',
      currency: 'PLN',
      effective_from: '2026-07-01',
      effective_to: null,
      monthly_value_minor: '3000000',
      target_profitability_bps: null,
    },
    unmappedLegacyAttendance: 2,
  })
  const repository = new ProfitabilityRepository(client)
  const input = await repository.loadObjectCalculationInput({
    objectId: 'OBJ-1',
    orgId: 'ORG-1',
    period: { start: '2026-07-01', end: '2026-08-01' },
    uid: 'UID-1',
  })
  const result = calculateObjectProfitability(input)
  assert.equal(result.complete, false)
  assert.ok(result.issues.some((issue) =>
    issue.code === ISSUE_CODE.UNMAPPED_LEGACY_ATTENDANCE && issue.count === 2,
  ))
  const qualityQuery = client.calls.find((call) => /unmapped_count/.test(call.sql))
  assert.match(qualityQuery.sql, /left join public\.zone/)
  assert.match(qualityQuery.sql, /z\.id is null/)
})

test('kontrakt godzinowy bez jawnego przychodu zmiennego jest niekompletny, a nie zerowy', async () => {
  const client = new CalculationQualityFixtureClient({
    contract: {
      billing_model: 'HOURLY',
      contract_version_id: 'CONTRACT-1',
      currency: 'PLN',
      effective_from: '2026-07-01',
      effective_to: null,
      hourly_rate_minor: '5000',
      monthly_value_minor: null,
      service_rate_minor: null,
      target_profitability_bps: null,
    },
  })
  const repository = new ProfitabilityRepository(client)
  const input = await repository.loadObjectCalculationInput({
    objectId: 'OBJ-1',
    orgId: 'ORG-1',
    period: { start: '2026-07-01', end: '2026-08-01' },
    uid: 'UID-1',
  })
  const result = calculateObjectProfitability(input)
  assert.equal(result.complete, false)
  assert.ok(result.issues.some((issue) => issue.code === ISSUE_CODE.MISSING_VARIABLE_REVENUE))
})

test('utworzenie wersji kontraktu jest jedną transakcją z wpisem audytu', async () => {
  const client = new MutationFixtureClient()
  const repository = new ProfitabilityRepository(client)
  const row = await repository.createContractVersion({
    clientId: 'CLIENT-1',
    contract: {
      billingModel: 'MONTHLY_FIXED',
      contractName: 'Kontrakt 1',
      currency: 'PLN',
      effectiveFrom: '2026-07-01',
      monthlyValueMinor: '3000000',
    },
    objectId: 'OBJ-1',
    orgId: 'ORG-1',
    uid: 'UID-1',
  })
  assert.ok(row.contract_version_id)
  assert.ok(client.calls.some((call) => call.sql === 'begin'))
  assert.ok(client.calls.some((call) => /insert into public\.profitability_audit/.test(call.sql)))
  assert.ok(client.calls.some((call) => call.sql === 'commit'))
})

test('utworzenie wersji pełnego kosztu godziny jest transakcją z historią', async () => {
  const client = new MutationFixtureClient()
  const repository = new ProfitabilityRepository(client)
  const row = await repository.createWorkerRateVersion({
    clientId: 'CLIENT-1',
    objectId: 'OBJ-1',
    orgId: 'ORG-1',
    rate: {
      currency: 'PLN',
      effectiveFrom: '2026-07-01',
      hourlyCostMinor: '6500',
      workerLogin: 'worker@example.com',
    },
    uid: 'UID-1',
  })
  assert.equal(row.hourly_cost_minor, '6500')
  assert.ok(client.calls.some((call) => /insert into public\.profitability_audit/.test(call.sql)))
  assert.ok(client.calls.some((call) => call.sql === 'commit'))
})

test('utworzenie kosztu zapisuje bigint jako decimal string i audyt w tej samej transakcji', async () => {
  const client = new MutationFixtureClient()
  const repository = new ProfitabilityRepository(client)
  const row = await repository.createCost({
    clientId: 'CLIENT-1',
    cost: {
      amountMinor: '900719925474099312345',
      category: 'MATERIALS',
      costDate: '2026-07-15',
      currency: 'PLN',
      name: 'Chemia',
      recurrence: 'ONE_TIME',
      source: 'MANUAL',
    },
    objectId: 'OBJ-1',
    orgId: 'ORG-1',
    uid: 'UID-1',
  })
  assert.equal(row.amount_minor, '900719925474099312345')
  const entryCall = client.calls.find((call) => /insert into public\.object_financial_entry/.test(call.sql))
  assert.equal(entryCall.params[5], 'MATERIAL')
  assert.ok(client.calls.some((call) => /insert into public\.profitability_audit/.test(call.sql)))
  assert.ok(client.calls.some((call) => call.sql === 'commit'))
})

test('jawny przychód zmienny zapisuje się jako REVENUE przez tę samą ścieżkę audytową', async () => {
  const client = new MutationFixtureClient()
  const repository = new ProfitabilityRepository(client)
  await repository.createRevenue({
    clientId: 'CLIENT-1',
    objectId: 'OBJ-1',
    orgId: 'ORG-1',
    revenue: {
      amountMinor: '125000',
      category: 'HOURLY_SETTLEMENT',
      currency: 'PLN',
      name: 'Rozliczenie godzinowe',
      occurredOn: '2026-07-31',
      recurrence: 'ONE_TIME',
    },
    uid: 'UID-1',
  })
  const entryCall = client.calls.find((call) => /insert into public\.object_financial_entry/.test(call.sql))
  assert.equal(entryCall.params[5], 'REVENUE')
  assert.ok(client.calls.some((call) => /insert into public\.profitability_audit/.test(call.sql)))
})

test('utworzenie sprzętu zapisuje wyłącznie wybrany sposób rozliczenia i audyt', async () => {
  const client = new MutationFixtureClient()
  const repository = new ProfitabilityRepository(client)
  const row = await repository.createEquipment({
    asset: {
      category: 'Maszyna',
      currency: 'PLN',
      financing: 'PURCHASE',
      name: 'Szorowarka',
      purchaseAmountMinor: '1200000',
      settlementMethod: 'AMORTIZATION',
      amortizationMonths: '12',
      usageStart: '2026-07-01',
    },
    clientId: 'CLIENT-1',
    objectId: 'OBJ-1',
    orgId: 'ORG-1',
    uid: 'UID-1',
  })
  assert.equal(row.financing, 'PURCHASE')
  const equipmentCall = client.calls.find((call) => /insert into public\.object_equipment/.test(call.sql))
  assert.equal(equipmentCall.params[7], 'DEPRECIATION')
  assert.equal(equipmentCall.params[10], null)
  assert.ok(client.calls.some((call) => /insert into public\.profitability_audit/.test(call.sql)))
  assert.ok(client.calls.some((call) => call.sql === 'commit'))
})
