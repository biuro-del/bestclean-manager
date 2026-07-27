'use strict'

const { randomUUID } = require('node:crypto')

const {
  PROFITABILITY_ACTIONS,
  PROFITABILITY_CAPABILITY,
  assertProfitabilityAccess,
  hasProfitabilityCapability,
  normalizeProfitabilityRole,
} = require('../profitability-entitlement-policy')
const {
  aggregateClientProfitability,
  calculateObjectProfitability,
  createProfitabilitySnapshot,
  minorUnits,
  normalizeCurrency,
  normalizePeriod,
  serializeBigInts,
} = require('./domain')

function requiredText(value, fieldName) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new TypeError(`${fieldName} is required`)
  return normalized
}

function assertDatabaseClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new TypeError('A PostgreSQL client with query(sql, params) is required')
  }
  return client
}

function nullableDecimal(value) {
  return value === null || value === undefined ? null : String(value)
}

function dateValue(value, fieldName) {
  const normalized = requiredText(value, fieldName)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new TypeError(`${fieldName} must use YYYY-MM-DD`)
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new RangeError(`${fieldName} is not a valid calendar date`)
  }
  return normalized
}

function nonNegativeDecimal(value, fieldName) {
  const parsed = minorUnits(value, fieldName)
  if (parsed < 0n) throw new RangeError(`${fieldName} cannot be negative`)
  return parsed.toString()
}

function optionalNonNegativeDecimal(value, fieldName) {
  return value === null || value === undefined || value === ''
    ? null
    : nonNegativeDecimal(value, fieldName)
}

function optionalInteger(value, fieldName, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new RangeError(`${fieldName} must be an integer between ${min} and ${max}`)
  }
  return parsed
}

function auditJson(value) {
  return value === null || value === undefined
    ? null
    : JSON.stringify(serializeBigInts(value))
}

function monthWindow(period, months = 12) {
  const normalizedPeriod = normalizePeriod(period)
  const safeMonths = Math.max(1, Math.min(120, Math.floor(Number(months) || 12)))
  const start = new Date(`${normalizedPeriod.start}T00:00:00.000Z`)
  start.setUTCDate(1)
  start.setUTCMonth(start.getUTCMonth() - (safeMonths - 1))
  return {
    end: normalizedPeriod.end,
    months: safeMonths,
    start: start.toISOString().slice(0, 10),
  }
}

function databaseDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value ?? '').slice(0, 10)
}

function databaseTimestamp(value) {
  if (value instanceof Date) return value.toISOString()
  const normalized = String(value ?? '').trim()
  const parsed = new Date(normalized)
  return normalized && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : normalized
}

function mapFinancialEntry(row) {
  return {
    activeFrom: row.period_start,
    activeTo: row.period_end,
    amountMinor: row.amount_minor,
    category: row.category,
    currency: row.currency,
    date: row.occurred_on,
    id: row.entry_id,
    name: row.name,
    objectId: row.object_id,
    orgId: row.org_id,
    recurrence: row.recurrence,
    source: row.source,
  }
}

class ProfitabilityRepository {
  constructor(client) {
    this.client = assertDatabaseClient(client)
  }

  async resolveAccess({ orgId, objectId = '', uid }) {
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedUid = requiredText(uid, 'uid')
    const memberResult = await this.client.query(
      `select m.org_id, m.uid, m.role
         from public.organization_member m
        where m.org_id = $1
          and m.uid = $2
          and upper(coalesce(m.status, 'ACTIVE')) = 'ACTIVE'
        limit 1`,
      [normalizedOrgId, normalizedUid],
    )
    const member = memberResult.rows[0]
    if (!member) {
      const error = new Error('Organization membership not found')
      error.code = 'ORG_SCOPE_MISMATCH'
      error.statusCode = 404
      throw error
    }

    const [subscriptionResult, permissionResult] = await Promise.all([
      this.client.query(
        `select plan_code, status
           from public.organization_subscription
          where org_id = $1
          limit 1`,
        [normalizedOrgId],
      ),
      this.client.query(
        `select permission_code, object_id
           from public.profitability_permission
          where org_id = $1
            and uid = $2
            and revoked_at is null
            and (object_id is null or object_id = nullif($3, ''))`,
        [normalizedOrgId, normalizedUid, String(objectId ?? '').trim()],
      ),
    ])

    const permissionCodes = new Set(permissionResult.rows.map((row) => row.permission_code))
    const grant = {
      close: permissionCodes.has('profitability:close-period'),
      read: permissionCodes.has('profitability:view-internal'),
      edit: permissionCodes.has('profitability:edit'),
    }
    const subscription = subscriptionResult.rows[0] ?? {}
    return {
      grants: {
        [PROFITABILITY_CAPABILITY]: grant.read || grant.edit || grant.close ? grant : false,
      },
      principal: {
        activeOrgId: member.org_id,
        isFinanceAdmin:
          String(member.role ?? '').trim().toUpperCase() === 'ADMIN' && grant.edit === true,
        orgId: member.org_id,
        role: member.role,
        uid: member.uid,
      },
      subscription: {
        planCode: subscription.plan_code,
        status: subscription.status,
      },
    }
  }

  async assertAccess({ action, objectId = '', orgId, uid }) {
    const access = await this.resolveAccess({ orgId, objectId, uid })
    try {
      return assertProfitabilityAccess({
        action,
        actor: access.principal,
        grants: access.grants,
        requestOrgId: orgId,
        subscription: access.subscription,
      })
    } catch (error) {
      if (action === PROFITABILITY_ACTIONS.READ && this.hasTrustedCloseGrant(access)) {
        return {
          action,
          allowed: true,
          capability: PROFITABILITY_CAPABILITY,
          code: 'PROFITABILITY_CLOSE_GRANT_ALLOWED',
          orgId,
        }
      }
      throw error
    }
  }

  hasTrustedCloseGrant(access) {
    const grant = access?.grants?.[PROFITABILITY_CAPABILITY]
    return (
      grant?.close === true &&
      normalizeProfitabilityRole(access?.principal?.role) === 'ADMIN' &&
      hasProfitabilityCapability(access?.subscription?.planCode) &&
      String(access?.subscription?.status ?? '').trim().toUpperCase() === 'ACTIVE'
    )
  }

  async assertClosePeriodAccess({ objectId = '', orgId, uid }) {
    const access = await this.resolveAccess({ orgId, objectId, uid })
    try {
      return assertProfitabilityAccess({
        action: PROFITABILITY_ACTIONS.EDIT,
        actor: access.principal,
        grants: access.grants,
        requestOrgId: orgId,
        subscription: access.subscription,
      })
    } catch (error) {
      if (!this.hasTrustedCloseGrant(access)) throw error
      return {
        action: 'close',
        allowed: true,
        capability: PROFITABILITY_CAPABILITY,
        code: 'PROFITABILITY_CLOSE_GRANT_ALLOWED',
        orgId,
      }
    }
  }

  async verifyServiceObjectScope(input, clientIdArgument = '', objectIdArgument = '') {
    const values = input && typeof input === 'object'
      ? input
      : { orgId: input, clientId: clientIdArgument, objectId: objectIdArgument }
    const orgId = requiredText(values.orgId, 'orgId')
    const clientId = requiredText(values.clientId, 'clientId')
    const objectId = requiredText(values.objectId, 'objectId')
    const result = await this.client.query(
      `select object_id, client_id, name, timezone, default_currency, status
         from public.service_object
        where org_id = $1
          and client_id = $2
          and object_id = $3
          and archived_at is null
        limit 1`,
      [orgId, clientId, objectId],
    )
    if (!result.rows[0]) {
      const error = new Error('Service object not found in client/organization scope')
      error.code = 'OBJECT_SCOPE_MISMATCH'
      error.statusCode = 404
      throw error
    }
    return result.rows[0]
  }

  async insertAuditRow({
    action,
    actorUid,
    entityId,
    entityType,
    newValue = null,
    objectId,
    orgId,
    previousValue = null,
    reason = '',
    source = 'PORTAL',
  }) {
    const result = await this.client.query(
      `insert into public.profitability_audit
        (org_id, object_id, entity_type, entity_id, action, actor_uid, source,
         reason, previous_value, new_value)
       values ($1, $2, $3, $4, $5, $6, $7, nullif($8, ''), $9::jsonb, $10::jsonb)
       returning *`,
      [
        requiredText(orgId, 'orgId'),
        requiredText(objectId, 'objectId'),
        requiredText(entityType, 'entityType'),
        requiredText(entityId, 'entityId'),
        requiredText(action, 'action'),
        requiredText(actorUid, 'actorUid'),
        requiredText(source, 'source'),
        String(reason ?? '').trim(),
        auditJson(previousValue),
        auditJson(newValue),
      ],
    )
    return result.rows[0]
  }

  async withTransaction(work) {
    await this.client.query('begin')
    try {
      const result = await work()
      await this.client.query('commit')
      return result
    } catch (error) {
      await this.client.query('rollback').catch(() => {})
      throw error
    }
  }

  async listServiceObjectsForClient({ clientId, orgId, uid }) {
    const normalizedClientId = requiredText(clientId, 'clientId')
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const result = await this.client.query(
      `select object_id, client_id, name, timezone, status, default_currency,
              address, city, postal_code, created_at, updated_at
         from public.service_object
        where org_id = $1
          and client_id = $2
          and archived_at is null
        order by name, object_id`,
      [normalizedOrgId, normalizedClientId],
    )
    if (result.rows.length === 0) {
      await this.assertAccess({ action: PROFITABILITY_ACTIONS.READ, orgId: normalizedOrgId, uid })
      return []
    }

    const authorizedRows = []
    let firstAccessError = null
    for (const row of result.rows) {
      try {
        await this.assertAccess({
          action: PROFITABILITY_ACTIONS.READ,
          objectId: row.object_id,
          orgId: normalizedOrgId,
          uid,
        })
        authorizedRows.push(row)
      } catch (error) {
        if (error?.statusCode !== 403) throw error
        firstAccessError ??= error
      }
    }
    if (authorizedRows.length > 0) return authorizedRows
    throw firstAccessError
  }

  async listAudit({ clientId, limit = 100, objectId, orgId, periodId = '', uid }) {
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedClientId = requiredText(clientId, 'clientId')
    const normalizedObjectId = requiredText(objectId, 'objectId')
    await this.assertAccess({
      action: PROFITABILITY_ACTIONS.READ,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      uid,
    })
    await this.verifyServiceObjectScope({
      clientId: normalizedClientId,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
    })
    const safeLimit = Math.max(1, Math.min(500, Math.floor(Number(limit) || 100)))
    void periodId
    const result = await this.client.query(
      `select a.audit_id, a.entity_type, a.entity_id, a.action, a.actor_uid,
              a.source, a.reason, a.previous_value, a.new_value, a.created_at
         from public.profitability_audit a
        where a.org_id = $1
          and a.object_id = $2
        order by a.created_at desc, a.audit_id desc
        limit $3`,
      [normalizedOrgId, normalizedObjectId, safeLimit],
    )
    return result.rows
  }

  async listHistory(input) {
    return this.listAudit(input)
  }

  async getHistory(input) {
    return { history: await this.listAudit(input) }
  }

  async listProfitabilityTrend({ clientId, months = 12, objectId, orgId, period, uid }) {
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedClientId = requiredText(clientId, 'clientId')
    const normalizedObjectId = requiredText(objectId, 'objectId')
    const window = monthWindow(period, months)
    await this.assertAccess({
      action: PROFITABILITY_ACTIONS.READ,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      uid,
    })
    await this.verifyServiceObjectScope({
      clientId: normalizedClientId,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
    })

    const result = await this.client.query(
      `with ranked_snapshots as (
         select p.period_start, p.period_end,
                s.snapshot_id, s.calculation_status, s.currency,
                s.revenue_minor, s.total_cost_minor, s.margin_minor,
                s.profitability_bps, s.completeness_bps, s.calculated_at,
                row_number() over (
                  partition by s.org_id, s.object_id, s.period_id
                  order by s.calculated_at desc, s.created_at desc, s.snapshot_id desc
                ) as snapshot_rank
           from public.profitability_snapshot s
           join public.financial_period p
             on p.org_id = s.org_id
            and p.object_id = s.object_id
            and p.period_id = s.period_id
          where s.org_id = $1
            and s.object_id = $2
            and p.status <> 'ARCHIVED'
            and p.period_start >= $3::date
            and p.period_start < $4::date
       )
       select period_start, period_end, snapshot_id, calculation_status,
              currency, revenue_minor, total_cost_minor, margin_minor,
              profitability_bps, completeness_bps, calculated_at
         from ranked_snapshots
        where snapshot_rank = 1
        order by period_start, snapshot_id`,
      [normalizedOrgId, normalizedObjectId, window.start, window.end],
    )

    return {
      points: result.rows.map((row) => ({
        calculatedAt: databaseTimestamp(row.calculated_at),
        completenessBps: row.completeness_bps,
        currency: row.currency,
        marginMinor: row.margin_minor,
        objectId: normalizedObjectId,
        period: databaseDate(row.period_start).slice(0, 7),
        periodEnd: databaseDate(row.period_end),
        periodStart: databaseDate(row.period_start),
        profitabilityBps: row.profitability_bps,
        revenueMinor: row.revenue_minor,
        snapshotId: row.snapshot_id,
        status: row.calculation_status,
        totalCostMinor: row.total_cost_minor,
      })),
      source: 'PROFITABILITY_SNAPSHOT',
      window,
    }
  }

  async getSummary({ clientId, objectId = '', orgId, period, uid }) {
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedClientId = requiredText(clientId, 'clientId')
    const normalizedPeriod = normalizePeriod(period)
    if (objectId) {
      await this.assertAccess({
        action: PROFITABILITY_ACTIONS.READ,
        objectId,
        orgId: normalizedOrgId,
        uid,
      })
    }
    const objects = objectId
      ? [await this.verifyServiceObjectScope({
          clientId: normalizedClientId,
          objectId,
          orgId: normalizedOrgId,
        })]
      : await this.listServiceObjectsForClient({
          clientId: normalizedClientId,
          orgId: normalizedOrgId,
          uid,
        })
    const results = []
    for (const serviceObject of objects) {
      const calculationInput = await this.loadObjectCalculationInput({
        objectId: serviceObject.object_id,
        orgId: normalizedOrgId,
        period: normalizedPeriod,
        uid,
      })
      results.push(calculateObjectProfitability(calculationInput))
    }

    if (results.length === 0) {
      return {
        clientId: normalizedClientId,
        objects: [],
        orgId: normalizedOrgId,
        period: normalizedPeriod.start.slice(0, 7),
        periodRange: normalizedPeriod,
        status: 'EMPTY',
        summary: null,
        warnings: [],
      }
    }

    const summary = results.length === 1 ? results[0] : aggregateClientProfitability(results)
    const objectSummaries = results.map((result, index) => {
      const metadata = objects[index] ?? {}
      const breakdown = result.costBreakdown ?? {}
      return {
        ...result,
        completenessPercent: Number(result.completenessBps) / 100,
        costBreakdown: [
          { amountMinor: breakdown.laborMinor, key: 'labor', label: 'Praca' },
          { amountMinor: breakdown.materialsMinor, key: 'materials', label: 'Materiały i środki' },
          { amountMinor: breakdown.equipmentMinor, key: 'equipment', label: 'Sprzęt i maszyny' },
          { amountMinor: breakdown.periodicDirectMinor, key: 'periodic', label: 'Prace okresowe' },
          { amountMinor: breakdown.otherMinor, key: 'other', label: 'Transport i pozostałe' },
        ],
        equipmentCostMinor: breakdown.equipmentMinor,
        incomplete: !result.complete,
        laborCostMinor: breakdown.laborMinor,
        laborIncomplete: breakdown.laborMinor === null,
        materialCostMinor: breakdown.materialsMinor,
        name: metadata.name || result.objectId,
        otherCostMinor: breakdown.otherMinor,
        periodicCostMinor: breakdown.periodicDirectMinor,
        timeZone: metadata.timezone || null,
      }
    })
    function sumBreakdown(field) {
      const values = results.map((result) => result.costBreakdown?.[field])
      if (values.some((value) => value === null || value === undefined)) return null
      return values.reduce((total, value) => total + minorUnits(value), 0n)
    }
    const summaryPayload = {
      ...summary,
      completenessPercent: Number(summary.completenessBps) / 100,
      equipmentCostMinor: sumBreakdown('equipmentMinor'),
      incomplete: !summary.complete,
      laborCostMinor: sumBreakdown('laborMinor'),
      laborIncomplete: results.some((result) => result.costBreakdown?.laborMinor === null),
      materialCostMinor: sumBreakdown('materialsMinor'),
      otherCostMinor: sumBreakdown('otherMinor'),
      periodicCostMinor: sumBreakdown('periodicDirectMinor'),
    }
    return serializeBigInts({
      clientId: normalizedClientId,
      currency: summary.currency,
      objects: objectSummaries,
      orgId: normalizedOrgId,
      period: normalizedPeriod.start.slice(0, 7),
      periodRange: normalizedPeriod,
      status: summary.status,
      summary: summaryPayload,
      warnings: summary.issues,
    })
  }

  async loadObjectCalculationInput({ objectId, orgId, period, uid }) {
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedObjectId = requiredText(objectId, 'objectId')
    const normalizedPeriod = normalizePeriod(period)
    await this.assertAccess({
      action: PROFITABILITY_ACTIONS.READ,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      uid,
    })

    const objectResult = await this.client.query(
      `select object_id, client_id, timezone, default_currency
         from public.service_object
        where org_id = $1
          and object_id = $2
          and archived_at is null
        limit 1`,
      [normalizedOrgId, normalizedObjectId],
    )
    const serviceObject = objectResult.rows[0]
    if (!serviceObject) {
      const error = new Error('Service object not found in organization scope')
      error.code = 'OBJECT_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    const queryParams = [
      normalizedOrgId,
      normalizedObjectId,
      normalizedPeriod.start,
      normalizedPeriod.end,
    ]
    const [
      contractResult,
      entryResult,
      equipmentResult,
      periodicResult,
      eventResult,
      rateResult,
      legacyAttendanceResult,
    ] = await Promise.all([
        this.client.query(
          `select contract_version_id, billing_model, monthly_value_minor,
                  hourly_rate_minor, service_rate_minor, currency, effective_from,
                  effective_to, target_profitability_bps
             from public.object_contract_version
            where org_id = $1
              and object_id = $2
              and archived_at is null
              and effective_from < $4::date
              and (effective_to is null or effective_to > $3::date)
            order by effective_from`,
          queryParams,
        ),
        this.client.query(
          `select entry_id, org_id, object_id, periodic_work_id, entry_group, category,
                  name, amount_minor, currency, occurred_on, period_start, period_end,
                  recurrence, source
             from public.object_financial_entry
            where org_id = $1
              and object_id = $2
              and archived_at is null
              and status = 'POSTED'
              and (
                (recurrence in ('ONE_TIME', 'ACTUAL_USAGE') and occurred_on >= $3::date and occurred_on < $4::date)
                or
                (recurrence = 'MONTHLY' and period_start < $4::date and (period_end is null or period_end > $3::date))
              )
            order by occurred_on, entry_id`,
          queryParams,
        ),
        this.client.query(
          `select equipment_id, org_id, object_id, financing, recognition_method,
                  purchase_value_minor, depreciation_months, monthly_installment_minor,
                  currency, started_on, ended_on
             from public.object_equipment
            where org_id = $1
              and object_id = $2
              and archived_at is null
              and started_on < $4::date
              and (ended_on is null or ended_on > $3::date)
            order by started_on, equipment_id`,
          queryParams,
        ),
        this.client.query(
          `select periodic_work_id, org_id, object_id, name, status, work_type,
                  planned_on, executed_on, planned_minutes, actual_minutes
             from public.periodic_work
            where org_id = $1
              and object_id = $2
              and archived_at is null
              and coalesce(executed_on, planned_on) >= $3::date
              and coalesce(executed_on, planned_on) < $4::date
            order by coalesce(executed_on, planned_on), periodic_work_id`,
          queryParams,
        ),
        this.client.query(
          `select e.event_id, e.org_id, coalesce(e.object_id, z.object_id) as object_id,
                  e.worker_login, e.start_at,
                  e.end_at, e.duration_sec, e.periodic_work_id, e.task_id, e.zone_id,
                  (e.start_at at time zone o.timezone)::date::text as work_date
             from public.event e
             join public.service_object o
               on o.org_id = e.org_id and o.object_id = $2
             left join public.zone z
               on z.org_id = e.org_id and z.id = e.zone_id
            where e.org_id = $1
              and (e.object_id = $2 or (e.object_id is null and z.object_id = $2))
              and e.start_at >= ($3::date::timestamp at time zone o.timezone)
              and e.start_at < ($4::date::timestamp at time zone o.timezone)
              and e.start_at is not null
            order by e.start_at, e.event_id`,
          queryParams,
        ),
        this.client.query(
          `select r.rate_id, r.org_id, r.object_id, r.worker_login, r.hourly_cost_minor,
                  r.currency, r.effective_from, r.effective_to
             from public.worker_cost_rate r
            where r.org_id = $1
              and r.object_id = $2
              and r.archived_at is null
              and r.effective_from < $4::date
              and (r.effective_to is null or r.effective_to > $3::date)
            order by r.worker_login, r.effective_from`,
          queryParams,
        ),
        this.client.query(
          `select count(*)::integer as unmapped_count
             from public.event e
             left join public.zone z
               on z.org_id = e.org_id and z.id = e.zone_id
             join public.service_object o
               on o.org_id = e.org_id and o.object_id = $2
            where e.org_id = $1
              and e.object_id is null
              and z.object_id is null
              and (z.client_id = o.client_id or z.id is null)
              and e.start_at >= ($3::date::timestamp at time zone o.timezone)
              and e.start_at < ($4::date::timestamp at time zone o.timezone)`,
          queryParams,
        ),
      ])

    const financialEntries = entryResult.rows.map(mapFinancialEntry)
    const periodicWorks = periodicResult.rows.map((work) => ({
      actualMinutes: work.actual_minutes,
      executedOn: work.executed_on,
      id: work.periodic_work_id,
      laborSessionIds: eventResult.rows
        .filter((event) => event.periodic_work_id === work.periodic_work_id)
        .map((event) => event.event_id),
      objectId: work.object_id,
      orgId: work.org_id,
      name: work.name,
      plannedMinutes: work.planned_minutes,
      plannedOn: work.planned_on,
      status: work.status,
      workType: work.work_type,
      directCostEntries: financialEntries.filter(
        (entry) =>
          entry.id &&
          entryResult.rows.find((row) => row.entry_id === entry.id)?.periodic_work_id === work.periodic_work_id &&
          entryResult.rows.find((row) => row.entry_id === entry.id)?.entry_group !== 'REVENUE',
      ),
      revenueEntries: financialEntries.filter(
        (entry) => {
          const row = entryResult.rows.find((candidate) => candidate.entry_id === entry.id)
          return row?.periodic_work_id === work.periodic_work_id && row.entry_group === 'REVENUE'
        },
      ),
    }))

    const contractRevenues = contractResult.rows
      .filter((contract) => contract.monthly_value_minor !== null)
      .map((contract) => ({
        activeFrom: contract.effective_from,
        activeTo: contract.effective_to,
        amountMinor: contract.monthly_value_minor,
        category: 'CONTRACT',
        currency: contract.currency,
        id: contract.contract_version_id,
        objectId: normalizedObjectId,
        orgId: normalizedOrgId,
        recurrence: 'MONTHLY',
      }))

    const additionalRevenues = financialEntries.filter((entry) => {
      const row = entryResult.rows.find((candidate) => candidate.entry_id === entry.id)
      return !row?.periodic_work_id && row?.entry_group === 'REVENUE'
    })
    const variableRevenueRequired = contractResult.rows.some((contract) =>
      ['HOURLY', 'PER_SERVICE', 'MIXED'].includes(
        String(contract.billing_model ?? '').trim().toUpperCase(),
      ),
    )
    const unmappedLegacyAttendance = Number(
      legacyAttendanceResult.rows[0]?.unmapped_count ?? 0,
    )

    return {
      additionalRevenues,
      clientId: serviceObject.client_id,
      contractConfigured: contractResult.rows.length > 0,
      contractRevenues,
      currency: serviceObject.default_currency,
      equipment: equipmentResult.rows.map((asset) => ({
        currency: asset.currency,
        depreciationMonths: asset.depreciation_months,
        endedOn: asset.ended_on,
        financing: asset.financing,
        id: asset.equipment_id,
        monthlyInstallmentMinor: asset.monthly_installment_minor,
        objectId: asset.object_id,
        orgId: asset.org_id,
        purchaseValueMinor: asset.purchase_value_minor,
        recognitionMethod: asset.recognition_method,
        startedOn: asset.started_on,
      })),
      laborSessions: eventResult.rows.map((event) => ({
        durationSeconds: event.duration_sec,
        endAt: event.end_at,
        id: event.event_id,
        objectId: event.object_id,
        orgId: event.org_id,
        startAt: event.start_at,
        taskId: event.task_id,
        workDate: event.work_date,
        workerLogin: event.worker_login,
        zoneId: event.zone_id,
      })),
      materialCosts: financialEntries.filter((entry) => {
        const row = entryResult.rows.find((candidate) => candidate.entry_id === entry.id)
        return !row?.periodic_work_id && row?.entry_group === 'MATERIAL'
      }),
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      otherCosts: financialEntries.filter((entry) => {
        const row = entryResult.rows.find((candidate) => candidate.entry_id === entry.id)
        return !row?.periodic_work_id && !['MATERIAL', 'REVENUE'].includes(row?.entry_group)
      }),
      period: normalizedPeriod,
      periodicWorks,
      sourceDataIssues: unmappedLegacyAttendance > 0
        ? [{
            code: 'UNMAPPED_LEGACY_ATTENDANCE',
            count: unmappedLegacyAttendance,
            objectId: normalizedObjectId,
          }]
        : [],
      targetProfitabilityBps: contractResult.rows.at(-1)?.target_profitability_bps ?? null,
      timezone: serviceObject.timezone,
      variableRevenueConfigured:
        additionalRevenues.length > 0 ||
        periodicWorks.some((work) => work.revenueEntries.length > 0),
      variableRevenueRequired,
      workerRates: rateResult.rows.map((rate) => ({
        currency: rate.currency,
        effectiveFrom: rate.effective_from,
        effectiveTo: rate.effective_to,
        hourlyCostMinor: rate.hourly_cost_minor,
        id: rate.rate_id,
        objectId: rate.object_id,
        orgId: rate.org_id,
        workerLogin: rate.worker_login,
      })),
    }
  }

  async createWorkerRateVersion({ clientId, objectId, orgId, rate = {}, reason = '', uid }) {
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedClientId = requiredText(clientId, 'clientId')
    const normalizedObjectId = requiredText(objectId, 'objectId')
    await this.assertAccess({
      action: PROFITABILITY_ACTIONS.EDIT,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      uid,
    })
    await this.verifyServiceObjectScope({
      clientId: normalizedClientId,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
    })

    const workerLogin = requiredText(rate.workerLogin ?? rate.login, 'rate.workerLogin')
    const effectiveFrom = dateValue(rate.effectiveFrom, 'rate.effectiveFrom')
    let effectiveTo = rate.effectiveTo
      ? dateValue(rate.effectiveTo, 'rate.effectiveTo')
      : null
    if (effectiveTo && effectiveTo <= effectiveFrom) {
      throw new RangeError('rate.effectiveTo must be after effectiveFrom')
    }
    const hourlyCostMinor = nonNegativeDecimal(
      rate.hourlyCostMinor ?? rate.amountMinor,
      'rate.hourlyCostMinor',
    )
    const currency = normalizeCurrency(rate.currency ?? 'PLN')
    const rateSource = String(rate.source ?? 'MANUAL').trim().toUpperCase()
    if (!['MANUAL', 'IMPORT', 'INTEGRATION', 'CORRECTION'].includes(rateSource)) {
      throw new RangeError('Unsupported worker rate source')
    }
    const auditReason = String(reason || rate.reason || '').trim()
    const rateId = requiredText(rate.rateId ?? randomUUID(), 'rate.rateId')

    return this.withTransaction(async () => {
      const versionsResult = await this.client.query(
        `select *
           from public.worker_cost_rate
          where org_id = $1
            and object_id = $2
            and lower(worker_login) = lower($3)
            and archived_at is null
          order by effective_from
          for update`,
        [normalizedOrgId, normalizedObjectId, workerLogin],
      )
      const versions = versionsResult.rows
      const sameStart = versions.find(
        (row) => String(row.effective_from).slice(0, 10) === effectiveFrom,
      )
      const covering = versions.find((row) => {
        const start = String(row.effective_from).slice(0, 10)
        const end = row.effective_to ? String(row.effective_to).slice(0, 10) : null
        return start < effectiveFrom && (!end || effectiveFrom < end)
      })
      const nextVersion = versions.find(
        (row) => String(row.effective_from).slice(0, 10) > effectiveFrom,
      )
      if (sameStart && !auditReason) {
        const error = new Error('Replacing a worker rate requires a correction reason')
        error.code = 'WORKER_RATE_CORRECTION_REASON_REQUIRED'
        throw error
      }
      if (!effectiveTo && sameStart?.effective_to) {
        effectiveTo = String(sameStart.effective_to).slice(0, 10)
      }
      if (nextVersion) {
        const nextStart = String(nextVersion.effective_from).slice(0, 10)
        if (effectiveTo && effectiveTo > nextStart) {
          throw new RangeError('Worker rate period overlaps a later version')
        }
        if (!effectiveTo) effectiveTo = nextStart
      }
      if (sameStart) {
        await this.client.query(
          `update public.worker_cost_rate
              set archived_at = now(), archived_by_uid = $4
            where org_id = $1 and object_id = $2 and rate_id = $3`,
          [normalizedOrgId, normalizedObjectId, sameStart.rate_id, uid],
        )
      } else if (covering) {
        await this.client.query(
          `update public.worker_cost_rate
              set effective_to = $4::date
            where org_id = $1 and object_id = $2 and rate_id = $3`,
          [normalizedOrgId, normalizedObjectId, covering.rate_id, effectiveFrom],
        )
      }

      const inserted = await this.client.query(
        `insert into public.worker_cost_rate
          (org_id, object_id, rate_id, worker_login, hourly_cost_minor, currency,
           effective_from, effective_to, source, change_reason, created_by_uid)
         values
          ($1, $2, $3, $4, $5::bigint, $6, $7::date, $8::date, $9,
           nullif($10, ''), $11)
         returning *`,
        [
          normalizedOrgId,
          normalizedObjectId,
          rateId,
          workerLogin,
          hourlyCostMinor,
          currency,
          effectiveFrom,
          effectiveTo,
          rateSource,
          auditReason,
          uid,
        ],
      )
      const row = inserted.rows[0]
      await this.insertAuditRow({
        action: sameStart ? 'CORRECT_WORKER_RATE' : 'CREATE_WORKER_RATE',
        actorUid: uid,
        entityId: rateId,
        entityType: 'WORKER_COST_RATE',
        newValue: row,
        objectId: normalizedObjectId,
        orgId: normalizedOrgId,
        previousValue: sameStart ?? covering ?? null,
        reason: auditReason,
      })
      return row
    })
  }

  async createContractVersion({ clientId, contract = {}, objectId, orgId, reason = '', uid }) {
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedClientId = requiredText(clientId, 'clientId')
    const normalizedObjectId = requiredText(objectId, 'objectId')
    await this.assertAccess({
      action: PROFITABILITY_ACTIONS.EDIT,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      uid,
    })
    await this.verifyServiceObjectScope({
      clientId: normalizedClientId,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
    })

    const effectiveFrom = dateValue(
      contract.effectiveFrom ?? contract.validFrom,
      'contract.effectiveFrom',
    )
    let effectiveTo = contract.effectiveTo ?? contract.validTo
    effectiveTo = effectiveTo ? dateValue(effectiveTo, 'contract.effectiveTo') : null
    if (effectiveTo && effectiveTo <= effectiveFrom) {
      throw new RangeError('contract.effectiveTo must be after effectiveFrom')
    }
    const billingModel = requiredText(contract.billingModel, 'contract.billingModel').toUpperCase()
    if (!['MONTHLY_FIXED', 'HOURLY', 'PER_SERVICE', 'MIXED'].includes(billingModel)) {
      throw new RangeError('Unsupported contract billing model')
    }
    const monthlyValueMinor = optionalNonNegativeDecimal(
      contract.monthlyValueMinor ?? contract.revenueMinor,
      'contract.monthlyValueMinor',
    )
    const hourlyRateMinor = optionalNonNegativeDecimal(contract.hourlyRateMinor, 'contract.hourlyRateMinor')
    const serviceRateMinor = optionalNonNegativeDecimal(contract.serviceRateMinor, 'contract.serviceRateMinor')
    if (monthlyValueMinor === null && hourlyRateMinor === null && serviceRateMinor === null) {
      throw new TypeError('Contract requires at least one revenue rate')
    }
    const currency = normalizeCurrency(contract.currency ?? 'PLN')
    const vatRateBps = optionalInteger(contract.vatRateBps, 'contract.vatRateBps', { min: 0, max: 10000 })
    const targetProfitabilityBps = optionalInteger(
      contract.targetProfitabilityBps ?? contract.targetMarginBps,
      'contract.targetProfitabilityBps',
      { min: -100000, max: 10000 },
    )
    const contractVersionId = requiredText(
      contract.contractVersionId ?? randomUUID(),
      'contract.contractVersionId',
    )
    const contractSource = String(contract.source ?? 'MANUAL').trim().toUpperCase()
    if (!['MANUAL', 'IMPORT', 'INTEGRATION', 'CORRECTION'].includes(contractSource)) {
      throw new RangeError('Unsupported contract source')
    }
    const auditReason = String(reason || contract.reason || '').trim()

    return this.withTransaction(async () => {
      const versionsResult = await this.client.query(
        `select *
           from public.object_contract_version
          where org_id = $1 and object_id = $2 and archived_at is null
          order by effective_from
          for update`,
        [normalizedOrgId, normalizedObjectId],
      )
      const versions = versionsResult.rows
      const sameStart = versions.find((row) => String(row.effective_from).slice(0, 10) === effectiveFrom)
      const covering = versions.find((row) => {
        const start = String(row.effective_from).slice(0, 10)
        const end = row.effective_to ? String(row.effective_to).slice(0, 10) : null
        return start < effectiveFrom && (!end || effectiveFrom < end)
      })
      const nextVersion = versions.find(
        (row) => String(row.effective_from).slice(0, 10) > effectiveFrom,
      )
      if (sameStart && !auditReason) {
        const error = new Error('Replacing a contract version requires a correction reason')
        error.code = 'CONTRACT_CORRECTION_REASON_REQUIRED'
        throw error
      }
      if (!effectiveTo && sameStart?.effective_to) {
        effectiveTo = String(sameStart.effective_to).slice(0, 10)
      }
      if (nextVersion) {
        const nextStart = String(nextVersion.effective_from).slice(0, 10)
        if (effectiveTo && effectiveTo > nextStart) {
          throw new RangeError('Contract period overlaps a later version')
        }
        if (!effectiveTo) effectiveTo = nextStart
      }
      if (sameStart) {
        await this.client.query(
          `update public.object_contract_version
              set archived_at = now(), archived_by_uid = $4
            where org_id = $1 and object_id = $2 and contract_version_id = $3`,
          [normalizedOrgId, normalizedObjectId, sameStart.contract_version_id, uid],
        )
      } else if (covering) {
        await this.client.query(
          `update public.object_contract_version
              set effective_to = $4::date
            where org_id = $1 and object_id = $2 and contract_version_id = $3`,
          [normalizedOrgId, normalizedObjectId, covering.contract_version_id, effectiveFrom],
        )
      }

      const inserted = await this.client.query(
        `insert into public.object_contract_version
          (org_id, object_id, contract_version_id, contract_number, contract_name,
           billing_model, monthly_value_minor, hourly_rate_minor, service_rate_minor,
           currency, vat_rate_bps, target_profitability_bps, effective_from,
           effective_to, source, change_reason, created_by_uid)
         values
          ($1, $2, $3, $4, $5, $6, $7::bigint, $8::bigint, $9::bigint,
           $10, $11, $12, $13::date, $14::date, $15, nullif($16, ''), $17)
         returning *`,
        [
          normalizedOrgId,
          normalizedObjectId,
          contractVersionId,
          String(contract.contractNumber ?? '').trim() || null,
          String(contract.contractName ?? contract.name ?? '').trim() || null,
          billingModel,
          monthlyValueMinor,
          hourlyRateMinor,
          serviceRateMinor,
          currency,
          vatRateBps,
          targetProfitabilityBps,
          effectiveFrom,
          effectiveTo,
          contractSource,
          auditReason,
          uid,
        ],
      )
      const row = inserted.rows[0]
      await this.insertAuditRow({
        action: sameStart ? 'CORRECT_CONTRACT_VERSION' : 'CREATE_CONTRACT_VERSION',
        actorUid: uid,
        entityId: contractVersionId,
        entityType: 'OBJECT_CONTRACT_VERSION',
        newValue: row,
        objectId: normalizedObjectId,
        orgId: normalizedOrgId,
        previousValue: sameStart ?? covering ?? null,
        reason: auditReason,
      })
      return row
    })
  }

  async upsertContract(input) {
    return this.createContractVersion(input)
  }

  async createFinancialEntry({ clientId, entry = {}, objectId, orgId, reason = '', uid }) {
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedClientId = requiredText(clientId, 'clientId')
    const normalizedObjectId = requiredText(objectId, 'objectId')
    await this.assertAccess({
      action: PROFITABILITY_ACTIONS.EDIT,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      uid,
    })
    await this.verifyServiceObjectScope({
      clientId: normalizedClientId,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
    })

    const entryId = requiredText(entry.entryId ?? randomUUID(), 'entry.entryId')
    const entryGroup = requiredText(entry.entryGroup ?? entry.group, 'entry.entryGroup').toUpperCase()
    const allowedGroups = new Set([
      'REVENUE', 'MATERIAL', 'EQUIPMENT_SERVICE', 'PERIODIC_DIRECT',
      'TRANSPORT', 'COORDINATION', 'SUBCONTRACTOR', 'DELIVERY', 'TRAINING',
      'OTHER_DIRECT', 'SHARED_ALLOCATION',
    ])
    if (!allowedGroups.has(entryGroup)) throw new RangeError('Unsupported financial entry group')
    const recurrence = requiredText(entry.recurrence ?? 'ONE_TIME', 'entry.recurrence').toUpperCase()
    if (!['ONE_TIME', 'MONTHLY', 'ACTUAL_USAGE'].includes(recurrence)) {
      throw new RangeError('Unsupported financial entry recurrence')
    }
    const occurredOnRaw = entry.occurredOn ?? entry.costDate ?? entry.date
    const occurredOn = occurredOnRaw ? dateValue(occurredOnRaw, 'entry.occurredOn') : null
    const periodStart = recurrence === 'MONTHLY'
      ? dateValue(entry.periodStart ?? occurredOnRaw, 'entry.periodStart')
      : entry.periodStart
        ? dateValue(entry.periodStart, 'entry.periodStart')
        : null
    const periodEnd = entry.periodEnd ? dateValue(entry.periodEnd, 'entry.periodEnd') : null
    if (recurrence !== 'MONTHLY' && !occurredOn) {
      throw new TypeError('One-time and usage entries require occurredOn')
    }
    if (periodEnd && (!periodStart || periodEnd <= periodStart)) {
      throw new RangeError('entry.periodEnd must be after periodStart')
    }
    const amountMinor = nonNegativeDecimal(entry.amountMinor, 'entry.amountMinor')
    const currency = normalizeCurrency(entry.currency ?? 'PLN')
    const entrySource = String(entry.source ?? 'MANUAL').trim().toUpperCase()
    if (!['MANUAL', 'WAREHOUSE', 'IMPORT', 'INTEGRATION', 'CORRECTION'].includes(entrySource)) {
      throw new RangeError('Unsupported financial entry source')
    }
    const auditReason = String(reason || entry.reason || '').trim()

    return this.withTransaction(async () => {
      const inserted = await this.client.query(
        `insert into public.object_financial_entry
          (org_id, object_id, entry_id, periodic_work_id, equipment_id, entry_group,
           category, name, amount_minor, currency, occurred_on, period_start,
           period_end, recurrence, source, source_reference, description,
           document_reference, status, created_by_uid)
         values
          ($1, $2, $3, $4, $5, $6, $7, $8, $9::bigint, $10, $11::date,
           $12::date, $13::date, $14, $15, $16, $17, $18, 'POSTED', $19)
         returning *`,
        [
          normalizedOrgId,
          normalizedObjectId,
          entryId,
          String(entry.periodicWorkId ?? '').trim() || null,
          String(entry.equipmentId ?? '').trim() || null,
          entryGroup,
          requiredText(entry.category, 'entry.category'),
          requiredText(entry.name, 'entry.name'),
          amountMinor,
          currency,
          occurredOn,
          periodStart,
          periodEnd,
          recurrence,
          entrySource,
          String(entry.sourceReference ?? '').trim() || null,
          String(entry.description ?? '').trim() || null,
          String(entry.documentReference ?? '').trim() || null,
          uid,
        ],
      )
      const row = inserted.rows[0]
      await this.insertAuditRow({
        action: 'CREATE_FINANCIAL_ENTRY',
        actorUid: uid,
        entityId: entryId,
        entityType: 'OBJECT_FINANCIAL_ENTRY',
        newValue: row,
        objectId: normalizedObjectId,
        orgId: normalizedOrgId,
        reason: auditReason,
        source: ['IMPORT', 'INTEGRATION', 'CORRECTION'].includes(
          entrySource,
        )
          ? entrySource
          : 'PORTAL',
      })
      return row
    })
  }

  async createCost({ cost = {}, ...scope }) {
    const category = requiredText(cost.category, 'cost.category').toUpperCase()
    const groupByCategory = {
      COORDINATION: 'COORDINATION',
      DELIVERIES: 'DELIVERY',
      MATERIALS: 'MATERIAL',
      OBJECT_TRAINING: 'TRAINING',
      OTHER_DIRECT: 'OTHER_DIRECT',
      SHARED_COST: 'SHARED_ALLOCATION',
      SUBCONTRACTORS: 'SUBCONTRACTOR',
      TRANSPORT: 'TRANSPORT',
    }
    return this.createFinancialEntry({
      ...scope,
      entry: {
        ...cost,
        entryGroup: groupByCategory[category] ?? 'OTHER_DIRECT',
      },
      reason: cost.reason ?? scope.reason,
    })
  }

  async createRevenue({ revenue = {}, ...scope }) {
    return this.createFinancialEntry({
      ...scope,
      entry: {
        ...revenue,
        category: String(revenue.category ?? 'ADDITIONAL_SERVICE').trim(),
        entryGroup: 'REVENUE',
        name: String(revenue.name ?? 'Przychód dodatkowy').trim(),
      },
      reason: revenue.reason ?? scope.reason,
    })
  }

  async createEquipment({ asset = {}, clientId, objectId, orgId, reason = '', uid }) {
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedClientId = requiredText(clientId, 'clientId')
    const normalizedObjectId = requiredText(objectId, 'objectId')
    await this.assertAccess({
      action: PROFITABILITY_ACTIONS.EDIT,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      uid,
    })
    await this.verifyServiceObjectScope({
      clientId: normalizedClientId,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
    })

    const equipmentId = requiredText(asset.equipmentId ?? asset.assetId ?? randomUUID(), 'asset.equipmentId')
    const financing = requiredText(asset.financing, 'asset.financing').toUpperCase()
    if (!['PURCHASE', 'LEASE', 'RENTAL'].includes(financing)) {
      throw new RangeError('Unsupported equipment financing')
    }
    const recognitionAliases = {
      AMORTIZATION: 'DEPRECIATION',
      MONTHLY_PAYMENT: 'INSTALLMENT',
      ONE_TIME: 'IMMEDIATE',
    }
    const recognitionMethod = recognitionAliases[String(asset.settlementMethod ?? '').toUpperCase()]
      ?? requiredText(asset.recognitionMethod, 'asset.recognitionMethod').toUpperCase()
    const purchaseValueMinor = optionalNonNegativeDecimal(
      asset.purchaseValueMinor ?? asset.purchaseAmountMinor,
      'asset.purchaseValueMinor',
    )
    const monthlyInstallmentMinor = optionalNonNegativeDecimal(
      asset.monthlyInstallmentMinor ?? asset.monthlyPaymentMinor,
      'asset.monthlyInstallmentMinor',
    )
    const depreciationMonths = optionalInteger(
      asset.depreciationMonths ?? asset.amortizationMonths,
      'asset.depreciationMonths',
      { min: 1 },
    )
    const purchaseImmediate =
      financing === 'PURCHASE' &&
      recognitionMethod === 'IMMEDIATE' &&
      purchaseValueMinor !== null &&
      depreciationMonths === null &&
      monthlyInstallmentMinor === null
    const purchaseDepreciated =
      financing === 'PURCHASE' &&
      recognitionMethod === 'DEPRECIATION' &&
      purchaseValueMinor !== null &&
      depreciationMonths !== null &&
      monthlyInstallmentMinor === null
    const installment =
      ['LEASE', 'RENTAL'].includes(financing) &&
      recognitionMethod === 'INSTALLMENT' &&
      purchaseValueMinor === null &&
      depreciationMonths === null &&
      monthlyInstallmentMinor !== null
    if (!purchaseImmediate && !purchaseDepreciated && !installment) {
      throw new TypeError('Equipment financing and recognition values are inconsistent')
    }
    const currency = normalizeCurrency(asset.currency ?? 'PLN')
    const startedOn = dateValue(asset.startedOn ?? asset.usageStart, 'asset.startedOn')
    const endedOnRaw = asset.endedOn ?? asset.costEnd
    const endedOn = endedOnRaw ? dateValue(endedOnRaw, 'asset.endedOn') : null
    if (endedOn && endedOn <= startedOn) throw new RangeError('asset.endedOn must be after startedOn')
    const auditReason = String(reason || asset.reason || '').trim()
    const serviceCostMinor = optionalNonNegativeDecimal(asset.serviceCostMinor, 'asset.serviceCostMinor')

    return this.withTransaction(async () => {
      const previousResult = await this.client.query(
        `select * from public.object_equipment
          where org_id = $1 and object_id = $2 and equipment_id = $3
          for update`,
        [normalizedOrgId, normalizedObjectId, equipmentId],
      )
      const previous = previousResult.rows[0] ?? null
      const saved = await this.client.query(
        `insert into public.object_equipment
          (org_id, object_id, equipment_id, name, category, inventory_number,
           financing, recognition_method, purchase_value_minor, depreciation_months,
           monthly_installment_minor, currency, started_on, ended_on, created_by_uid,
           updated_by_uid)
         values
          ($1, $2, $3, $4, $5, $6, $7, $8, $9::bigint, $10, $11::bigint,
           $12, $13::date, $14::date, $15, $15)
         on conflict (org_id, object_id, equipment_id) do update set
           name = excluded.name,
           category = excluded.category,
           inventory_number = excluded.inventory_number,
           financing = excluded.financing,
           recognition_method = excluded.recognition_method,
           purchase_value_minor = excluded.purchase_value_minor,
           depreciation_months = excluded.depreciation_months,
           monthly_installment_minor = excluded.monthly_installment_minor,
           currency = excluded.currency,
           started_on = excluded.started_on,
           ended_on = excluded.ended_on,
           updated_at = now(),
           updated_by_uid = excluded.updated_by_uid,
           archived_at = null,
           archived_by_uid = null
         returning *`,
        [
          normalizedOrgId,
          normalizedObjectId,
          equipmentId,
          requiredText(asset.name, 'asset.name'),
          String(asset.category ?? '').trim() || null,
          String(asset.inventoryNumber ?? '').trim() || null,
          financing,
          recognitionMethod,
          purchaseValueMinor,
          depreciationMonths,
          monthlyInstallmentMinor,
          currency,
          startedOn,
          endedOn,
          uid,
        ],
      )
      const row = saved.rows[0]
      await this.insertAuditRow({
        action: previous ? 'UPDATE_EQUIPMENT' : 'CREATE_EQUIPMENT',
        actorUid: uid,
        entityId: equipmentId,
        entityType: 'OBJECT_EQUIPMENT',
        newValue: row,
        objectId: normalizedObjectId,
        orgId: normalizedOrgId,
        previousValue: previous,
        reason: auditReason,
      })
      if (!previous && serviceCostMinor !== null && BigInt(serviceCostMinor) > 0n) {
        const serviceEntryId = randomUUID()
        const serviceDate = startedOn
        const serviceEntry = await this.client.query(
          `insert into public.object_financial_entry
            (org_id, object_id, entry_id, equipment_id, entry_group, category, name,
             amount_minor, currency, occurred_on, recurrence, source, status,
             created_by_uid)
           values ($1, $2, $3, $4, 'EQUIPMENT_SERVICE', 'SERVICE_REPAIR', $5,
                   $6::bigint, $7, $8::date, 'ONE_TIME', 'MANUAL', 'POSTED', $9)
           returning *`,
          [
            normalizedOrgId,
            normalizedObjectId,
            serviceEntryId,
            equipmentId,
            `Serwis: ${requiredText(asset.name, 'asset.name')}`,
            serviceCostMinor,
            currency,
            serviceDate,
            uid,
          ],
        )
        await this.insertAuditRow({
          action: 'CREATE_EQUIPMENT_SERVICE_COST',
          actorUid: uid,
          entityId: serviceEntryId,
          entityType: 'OBJECT_FINANCIAL_ENTRY',
          newValue: serviceEntry.rows[0],
          objectId: normalizedObjectId,
          orgId: normalizedOrgId,
          reason: auditReason,
        })
      }
      return row
    })
  }

  async upsertAsset(input) {
    return this.createEquipment(input)
  }

  async createOpenPeriod({ currency, objectId, orgId, period, periodId, uid }) {
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedObjectId = requiredText(objectId, 'objectId')
    const normalizedPeriodId = requiredText(periodId, 'periodId')
    const normalizedPeriod = normalizePeriod(period)
    const normalizedCurrency = normalizeCurrency(currency)
    await this.assertAccess({
      action: PROFITABILITY_ACTIONS.EDIT,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      uid,
    })
    const result = await this.client.query(
      `insert into public.financial_period
        (org_id, object_id, period_id, period_start, period_end, currency, status, created_by_uid)
       values ($1, $2, $3, $4::date, $5::date, $6, 'OPEN', $7)
       on conflict (org_id, object_id, period_id) do nothing
       returning *`,
      [
        normalizedOrgId,
        normalizedObjectId,
        normalizedPeriodId,
        normalizedPeriod.start,
        normalizedPeriod.end,
        normalizedCurrency,
        uid,
      ],
    )
    return result.rows[0] ?? null
  }

  async closePeriod({ clientId, objectId, orgId, period, periodId = '', reason = '', uid }) {
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedClientId = requiredText(clientId, 'clientId')
    const normalizedObjectId = requiredText(objectId, 'objectId')
    const normalizedPeriod = normalizePeriod(period)
    const normalizedPeriodId = String(periodId ?? '').trim() || normalizedPeriod.start.slice(0, 7)
    await this.assertClosePeriodAccess({
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      uid,
    })
    await this.verifyServiceObjectScope({
      clientId: normalizedClientId,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
    })
    const input = await this.loadObjectCalculationInput({
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      period: normalizedPeriod,
      uid,
    })
    const result = calculateObjectProfitability(input)
    if (!result.complete) {
      const error = new Error('Financial period cannot be closed while required data is incomplete')
      error.code = 'INCOMPLETE_DATA'
      error.details = serializeBigInts(result.issues)
      throw error
    }
    const snapshot = createProfitabilitySnapshot(result, {
      calculatedAt: new Date().toISOString(),
      dataVersion: 'profitability-v1',
      snapshotId: randomUUID(),
    })
    return this.saveSnapshot({
      auditReason: String(reason ?? '').trim(),
      closePeriod: true,
      periodId: normalizedPeriodId,
      result,
      snapshot,
      uid,
    })
  }

  async appendAudit({
    action,
    actorUid,
    entityId,
    entityType,
    newValue = null,
    objectId,
    orgId,
    previousValue = null,
    reason = '',
    source = 'PORTAL',
  }) {
    await this.assertAccess({
      action: PROFITABILITY_ACTIONS.EDIT,
      objectId,
      orgId,
      uid: actorUid,
    })
    const result = await this.client.query(
      `insert into public.profitability_audit
        (org_id, object_id, entity_type, entity_id, action, actor_uid, source,
         reason, previous_value, new_value)
       values ($1, $2, $3, $4, $5, $6, $7, nullif($8, ''), $9::jsonb, $10::jsonb)
       returning *`,
      [
        requiredText(orgId, 'orgId'),
        requiredText(objectId, 'objectId'),
        requiredText(entityType, 'entityType'),
        requiredText(entityId, 'entityId'),
        requiredText(action, 'action'),
        requiredText(actorUid, 'actorUid'),
        requiredText(source, 'source'),
        String(reason ?? '').trim(),
        previousValue == null ? null : JSON.stringify(serializeBigInts(previousValue)),
        newValue == null ? null : JSON.stringify(serializeBigInts(newValue)),
      ],
    )
    return result.rows[0]
  }

  async saveSnapshot({ auditReason = '', closePeriod = false, periodId, result, snapshot, uid }) {
    const orgId = requiredText(result?.orgId, 'result.orgId')
    const objectId = requiredText(result?.objectId, 'result.objectId')
    if (snapshot?.correctionOfSnapshotId && !String(auditReason ?? '').trim()) {
      const error = new Error('A correction snapshot requires an audit reason')
      error.code = 'CORRECTION_REASON_REQUIRED'
      throw error
    }
    if (closePeriod) {
      await this.assertClosePeriodAccess({ objectId, orgId, uid })
    } else {
      await this.assertAccess({
        action: PROFITABILITY_ACTIONS.EDIT,
        objectId,
        orgId,
        uid,
      })
    }

    await this.client.query('begin')
    try {
      const snapshotPeriod = normalizePeriod(result.period)
      await this.client.query(
        `insert into public.financial_period
          (org_id, object_id, period_id, period_start, period_end, currency, status,
           created_by_uid)
         values ($1, $2, $3, $4::date, $5::date, $6, 'OPEN', $7)
         on conflict (org_id, object_id, period_id) do nothing`,
        [
          orgId,
          objectId,
          periodId,
          snapshotPeriod.start,
          snapshotPeriod.end,
          result.currency,
          uid,
        ],
      )
      const periodResult = await this.client.query(
        `select status, period_start, period_end, currency
           from public.financial_period
          where org_id = $1 and object_id = $2 and period_id = $3
          for update`,
        [orgId, objectId, periodId],
      )
      const currentPeriod = periodResult.rows[0]
      if (!currentPeriod) throw new Error('Financial period not found')
      if (
        String(currentPeriod.period_start).slice(0, 10) !== snapshotPeriod.start ||
        String(currentPeriod.period_end).slice(0, 10) !== snapshotPeriod.end ||
        String(currentPeriod.currency).toUpperCase() !== String(result.currency).toUpperCase()
      ) {
        const error = new Error('Financial period id already exists with a different range or currency')
        error.code = 'FINANCIAL_PERIOD_SCOPE_MISMATCH'
        throw error
      }
      if (currentPeriod.status === 'CLOSED' && !snapshot.correctionOfSnapshotId) {
        const error = new Error('Closed period requires a correction snapshot')
        error.code = 'CLOSED_PERIOD_IMMUTABLE'
        throw error
      }

      const payload = serializeBigInts(snapshot)
      await this.client.query(
        `insert into public.profitability_snapshot
          (org_id, object_id, snapshot_id, period_id, correction_of_snapshot_id,
           calculation_status, currency, revenue_minor, total_cost_minor, margin_minor,
           profitability_bps, completeness_bps, payload, data_version, calculated_at,
           created_by_uid)
         values
          ($1, $2, $3, $4, $5, $6, $7, $8::bigint, $9::bigint, $10::bigint,
           $11::bigint, $12::integer, $13::jsonb, $14, $15::timestamptz, $16)`,
        [
          orgId,
          objectId,
          snapshot.snapshotId,
          periodId,
          snapshot.correctionOfSnapshotId,
          result.status,
          result.currency,
          nullableDecimal(result.revenueMinor),
          nullableDecimal(result.totalCostMinor),
          nullableDecimal(result.marginMinor),
          nullableDecimal(result.profitabilityBps),
          nullableDecimal(result.completenessBps),
          JSON.stringify(payload),
          snapshot.dataVersion,
          snapshot.calculatedAt,
          uid,
        ],
      )

      if (closePeriod) {
        await this.client.query(
          `update public.financial_period
              set status = 'CLOSED', closed_at = now(), closed_by_uid = $4, updated_at = now()
            where org_id = $1 and object_id = $2 and period_id = $3`,
          [orgId, objectId, periodId, uid],
        )
      }
      await this.client.query(
        `insert into public.profitability_audit
          (org_id, object_id, entity_type, entity_id, action, actor_uid, source,
           reason, previous_value, new_value)
         values ($1, $2, 'PROFITABILITY_SNAPSHOT', $3, $4, $5, 'BACKEND_CALCULATION',
                 nullif($6, ''), null, $7::jsonb)`,
        [
          orgId,
          objectId,
          snapshot.snapshotId,
          closePeriod ? 'CALCULATED_AND_CLOSED' : 'CALCULATED',
          uid,
          String(auditReason ?? '').trim(),
          JSON.stringify(payload),
        ],
      )
      await this.client.query('commit')
      return payload
    } catch (error) {
      await this.client.query('rollback').catch(() => {})
      throw error
    }
  }
}

function createProfitabilityRepository(client) {
  return new ProfitabilityRepository(client)
}

module.exports = {
  ProfitabilityRepository,
  createProfitabilityRepository,
  mapFinancialEntry,
}
