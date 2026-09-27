'use strict'

const { createHash, randomUUID } = require('node:crypto')

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
  roundRatio,
  serializeBigInts,
} = require('./domain')
const {
  createProfitabilityAccessProfileRepository,
} = require('./access-profile-repository')
const {
  OBJECT_SCOPES,
  WRITE_KINDS,
} = require('./access-profile-v2')

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
  const normalized = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new TypeError('PostgreSQL DATE must be selected as YYYY-MM-DD text')
  }
  return normalized
}

function nextCalendarDate(value) {
  const normalized = dateValue(value, 'date')
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  parsed.setUTCDate(parsed.getUTCDate() + 1)
  return parsed.toISOString().slice(0, 10)
}

function normalizeHygienePackage(packageInput = {}) {
  const billingMode = requiredText(
    packageInput.billingMode ?? 'IN_CONTRACT',
    'package.billingMode',
  ).toUpperCase()
  if (!['IN_CONTRACT', 'MONTHLY_EXTRA', 'AD_HOC'].includes(billingMode)) {
    throw new RangeError('Unsupported hygiene package billing mode')
  }
  const valueBasis = requiredText(
    packageInput.valueBasis ?? 'ESTIMATE',
    'package.valueBasis',
  ).toUpperCase()
  if (!['PLAN', 'ESTIMATE', 'ACTUAL'].includes(valueBasis)) {
    throw new RangeError('Unsupported hygiene package value basis')
  }
  const requestedMarginBps = optionalInteger(
    packageInput.marginBps,
    'package.marginBps',
    { min: -100000, max: 10000 },
  )
  let priceNetMinor = packageInput.priceNetMinor === null || packageInput.priceNetMinor === undefined || packageInput.priceNetMinor === ''
    ? null
    : minorUnits(nonNegativeDecimal(packageInput.priceNetMinor, 'package.priceNetMinor'))
  let costMinor = packageInput.costMinor === null || packageInput.costMinor === undefined || packageInput.costMinor === ''
    ? null
    : minorUnits(nonNegativeDecimal(packageInput.costMinor, 'package.costMinor'))
  const marginBps = requestedMarginBps ?? 2000
  if (priceNetMinor === null && costMinor === null) {
    throw new TypeError('package.priceNetMinor or package.costMinor is required')
  }
  if (priceNetMinor === null) {
    if (marginBps >= 10000) {
      throw new RangeError('package.marginBps must be below 10000 when deriving price')
    }
    priceNetMinor = roundRatio(costMinor * 10000n, BigInt(10000 - marginBps))
  }
  if (costMinor === null) {
    costMinor = roundRatio(priceNetMinor * BigInt(10000 - marginBps), 10000n)
  }

  const occurredOn = billingMode === 'AD_HOC'
    ? dateValue(packageInput.occurredOn ?? packageInput.effectiveFrom, 'package.occurredOn')
    : null
  const effectiveFrom = billingMode === 'AD_HOC'
    ? occurredOn
    : dateValue(packageInput.effectiveFrom, 'package.effectiveFrom')
  const effectiveTo = billingMode === 'AD_HOC' || !packageInput.effectiveTo
    ? null
    : dateValue(packageInput.effectiveTo, 'package.effectiveTo')
  if (effectiveTo && effectiveTo <= effectiveFrom) {
    throw new RangeError('package.effectiveTo must be after effectiveFrom')
  }

  const status = String(packageInput.status ?? 'POSTED').trim().toUpperCase()
  if (!['DRAFT', 'POSTED'].includes(status)) {
    throw new RangeError('New hygiene package version must be DRAFT or POSTED')
  }

  return {
    billingMode,
    costMinor: costMinor.toString(),
    currency: normalizeCurrency(packageInput.currency ?? 'PLN'),
    effectiveFrom,
    effectiveTo,
    occurredOn,
    packageId: requiredText(packageInput.packageId ?? randomUUID(), 'package.packageId'),
    packageName: requiredText(packageInput.packageName ?? packageInput.name, 'package.packageName'),
    packageVersionId: requiredText(
      packageInput.packageVersionId ?? randomUUID(),
      'package.packageVersionId',
    ),
    priceNetMinor: priceNetMinor.toString(),
    recognitionKey: requiredText(packageInput.recognitionKey, 'package.recognitionKey'),
    replacesPackageVersionId: String(packageInput.replacesPackageVersionId ?? '').trim() || null,
    status,
    valueBasis,
  }
}

function stableJson(value) {
  if (typeof value === 'bigint') return JSON.stringify(value.toString())
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(',')}}`
}

function commandPayloadSha256(payload) {
  return createHash('sha256').update(stableJson(payload)).digest('hex')
}

function repositoryError(code, message, statusCode = 409, details) {
  const error = new Error(message)
  error.code = code
  error.statusCode = statusCode
  if (details !== undefined) error.details = details
  return error
}

function hygieneFinancialField(key) {
  const normalized = String(key ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase()
  return normalized === 'pricenetminor'
    || normalized === 'marginbps'
    || normalized.includes('revenue')
}

function hasSubmittedValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  return true
}

function restrictCostControlHygienePackage(packageInput = {}) {
  const billingMode = String(packageInput.billingMode ?? 'IN_CONTRACT').trim().toUpperCase()
  if (billingMode !== 'IN_CONTRACT') {
    throw repositoryError(
      'PROFITABILITY_HYGIENE_CONTRACT_TERMS_FORBIDDEN',
      'COST_CONTROL can save only IN_CONTRACT hygiene packages',
      403,
    )
  }
  const forbiddenFields = Object.entries(packageInput)
    .filter(([key, value]) => hygieneFinancialField(key) && hasSubmittedValue(value))
    .map(([key]) => key)
  if (forbiddenFields.length) {
    throw repositoryError(
      'PROFITABILITY_HYGIENE_FINANCIAL_FIELDS_FORBIDDEN',
      'COST_CONTROL cannot set hygiene price, margin or revenue fields',
      403,
      { fields: forbiddenFields.sort() },
    )
  }
  return Object.fromEntries([
    ...Object.entries(packageInput).filter(([key]) => !hygieneFinancialField(key)),
    ['billingMode', 'IN_CONTRACT'],
  ])
}

function nullableDatabaseDate(value) {
  return value === null || value === undefined ? null : databaseDate(value)
}

function databaseTimestamp(value) {
  if (value instanceof Date) return value.toISOString()
  const normalized = String(value ?? '').trim()
  const parsed = new Date(normalized)
  return normalized && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : normalized
}

function mapFinancialEntry(row) {
  return {
    activeFrom: nullableDatabaseDate(row.period_start),
    activeTo: nullableDatabaseDate(row.period_end),
    amountMinor: row.amount_minor,
    category: row.category,
    currency: row.currency,
    date: nullableDatabaseDate(row.occurred_on),
    id: row.entry_id,
    name: row.name,
    objectId: row.object_id,
    orgId: row.org_id,
    recurrence: row.recurrence,
    source: row.source,
    valueBasis: row.value_basis ?? 'ACTUAL',
    valueKey: row.value_key ?? null,
  }
}

class ProfitabilityRepository {
  constructor(client, options = {}) {
    this.client = assertDatabaseClient(client)
    this.accessProfileV2Enabled = options?.accessProfileV2?.enabled === true
    this.financialModelV21Enabled = options?.financialModelV21?.enabled === true
    this.accessProfileRepository = this.accessProfileV2Enabled
      ? (options.accessProfileV2.repository ?? createProfitabilityAccessProfileRepository(this.client))
      : null
    this.accessProfileSchema = null
  }

  async assertAccessProfileSchemaReady() {
    if (!this.accessProfileV2Enabled) return
    if (!this.accessProfileSchema) {
      this.accessProfileSchema = await this.accessProfileRepository.schemaReady()
    }
    if (!this.accessProfileSchema.ready) {
      const error = new Error('Profitability access profile v2 schema is not ready')
      error.code = 'PROFITABILITY_ACCESS_PROFILE_SCHEMA_NOT_READY'
      error.statusCode = 503
      error.details = { missing: this.accessProfileSchema.missing }
      throw error
    }
  }

  async resolveAccessProfileV2({ orgId, uid }) {
    if (!this.accessProfileV2Enabled) return null
    await this.assertAccessProfileSchemaReady()
    return this.accessProfileRepository.resolve({ orgId, uid })
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

  async assertAccess({ action, objectId = '', orgId, uid, writeKind = WRITE_KINDS.CONTRACT_TERMS }) {
    if (this.accessProfileV2Enabled) {
      await this.assertAccessProfileSchemaReady()
      if (action === PROFITABILITY_ACTIONS.READ) {
        return this.accessProfileRepository.assertRead({ objectId, orgId, uid })
      }
      return this.accessProfileRepository.assertWrite({ objectId, orgId, uid, writeKind })
    }

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
    if (this.accessProfileV2Enabled) {
      return this.assertAccess({
        action: PROFITABILITY_ACTIONS.EDIT,
        objectId,
        orgId,
        uid,
        writeKind: WRITE_KINDS.CONTRACT_TERMS,
      })
    }

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
    let accessProfile = null
    if (this.accessProfileV2Enabled) {
      await this.assertAccessProfileSchemaReady()
      accessProfile = await this.accessProfileRepository.assertRead({
        orgId: normalizedOrgId,
        uid,
      })
    }
    const result = accessProfile
      ? await this.client.query(
          `select object_id, client_id, name, timezone, status, default_currency,
                  address, city, postal_code, created_at, updated_at
             from public.service_object
            where org_id = $1
              and client_id = $2
              and archived_at is null
              and ($3::boolean is true or object_id = any($4::text[]))
              and not (object_id = any($5::text[]))
            order by name, object_id`,
          [
            normalizedOrgId,
            normalizedClientId,
            accessProfile.objectScope === OBJECT_SCOPES.ALL,
            accessProfile.assignedObjectIds,
            accessProfile.deniedObjectIds,
          ],
        )
      : await this.client.query(
          `select object_id, client_id, name, timezone, status, default_currency,
                  address, city, postal_code, created_at, updated_at
             from public.service_object
            where org_id = $1
              and client_id = $2
              and archived_at is null
            order by name, object_id`,
          [normalizedOrgId, normalizedClientId],
        )
    if (accessProfile) return result.rows
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

  async assertWritableFinancialRange({ endExclusive = null, objectId, orgId, start }) {
    if (!this.financialModelV21Enabled) return
    const normalizedStart = dateValue(start, 'financial range start')
    const normalizedEnd = endExclusive
      ? dateValue(endExclusive, 'financial range end')
      : null
    const result = await this.client.query(
      `select period_id, period_start::text as period_start, period_end::text as period_end
         from public.financial_period
        where org_id = $1
          and object_id = $2
          and status = 'CLOSED'
          and period_end > $3::date
          and ($4::date is null or period_start < $4::date)
        order by period_start, period_id
        for share`,
      [requiredText(orgId, 'orgId'), requiredText(objectId, 'objectId'), normalizedStart, normalizedEnd],
    )
    if (result.rows.length > 0) {
      throw repositoryError(
        'CLOSED_PERIOD_IMMUTABLE',
        'A closed financial period cannot be changed without an explicit correction workflow',
        409,
        { periodIds: result.rows.map((row) => row.period_id) },
      )
    }
  }

  async withFinancialModelV21Command({
    commandId,
    commandKind,
    objectId,
    orgId,
    payload,
    uid,
  }, work) {
    if (!this.financialModelV21Enabled) return this.withTransaction(work)

    const normalizedCommandId = requiredText(commandId, 'commandId')
    if (normalizedCommandId.length > 96) {
      throw new RangeError('commandId cannot exceed 96 characters')
    }
    const normalizedCommandKind = requiredText(commandKind, 'commandKind')
    if (normalizedCommandKind.length > 64) {
      throw new RangeError('commandKind cannot exceed 64 characters')
    }
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedObjectId = requiredText(objectId, 'objectId')
    const normalizedUid = requiredText(uid, 'uid')
    const requestSha256 = commandPayloadSha256(payload)

    await this.client.query('begin')
    let transactionFinished = false
    try {
      await this.client.query('set transaction isolation level repeatable read')
      await this.client.query(
        'select pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        [normalizedOrgId, normalizedObjectId],
      )
      const inserted = await this.client.query(
        `insert into public.profitability_command_receipt
          (org_id, command_id, object_id, command_kind, request_sha256,
           state, created_by_uid)
         values ($1, $2, $3, $4, $5, 'IN_PROGRESS', $6)
         on conflict (org_id, command_id) do nothing
         returning command_id`,
        [
          normalizedOrgId,
          normalizedCommandId,
          normalizedObjectId,
          normalizedCommandKind,
          requestSha256,
          normalizedUid,
        ],
      )

      if (inserted.rows.length === 0) {
        const existingResult = await this.client.query(
          `select object_id, command_kind, request_sha256, state,
                  result_reference, error_code
             from public.profitability_command_receipt
            where org_id = $1 and command_id = $2
            for update`,
          [normalizedOrgId, normalizedCommandId],
        )
        const existing = existingResult.rows[0]
        if (!existing) {
          throw repositoryError(
            'PROFITABILITY_COMMAND_RECEIPT_UNAVAILABLE',
            'Command receipt disappeared during idempotency check',
            503,
          )
        }
        if (
          existing.object_id !== normalizedObjectId ||
          existing.command_kind !== normalizedCommandKind ||
          existing.request_sha256 !== requestSha256
        ) {
          throw repositoryError(
            'PROFITABILITY_COMMAND_ID_REUSED',
            'commandId was already used with a different request',
          )
        }
        if (existing.state === 'SUCCEEDED') {
          await this.client.query('commit')
          transactionFinished = true
          return {
            idempotentReplay: true,
            resultReference: existing.result_reference,
          }
        }
        throw repositoryError(
          existing.state === 'FAILED'
            ? 'PROFITABILITY_COMMAND_PREVIOUSLY_FAILED'
            : 'PROFITABILITY_COMMAND_IN_PROGRESS',
          existing.state === 'FAILED'
            ? 'This command previously failed; retry with a new commandId'
            : 'This command is already in progress',
          409,
          existing.error_code ? { previousErrorCode: existing.error_code } : undefined,
        )
      }

      await this.client.query('savepoint profitability_v21_command_work')
      try {
        const result = await work()
        const resultReference = requiredText(
          result?.resultReference
            ?? result?.package_version_id
            ?? result?.contract_version_id
            ?? result?.rate_id
            ?? result?.equipment_id
            ?? result?.snapshotId
            ?? result?.snapshot_id
            ?? result?.period_id
            ?? result?.entry_id
            ?? result?.id,
          'command result reference',
        )
        await this.client.query(
          `update public.profitability_command_receipt
              set state = 'SUCCEEDED', result_reference = $3,
                  updated_at = now(), completed_at = now()
            where org_id = $1 and command_id = $2 and state = 'IN_PROGRESS'`,
          [normalizedOrgId, normalizedCommandId, resultReference],
        )
        await this.client.query('commit')
        transactionFinished = true
        return result
      } catch (error) {
        await this.client.query('rollback to savepoint profitability_v21_command_work')
        await this.client.query(
          `update public.profitability_command_receipt
              set state = 'FAILED', error_code = $3,
                  updated_at = now(), completed_at = now()
            where org_id = $1 and command_id = $2 and state = 'IN_PROGRESS'`,
          [
            normalizedOrgId,
            normalizedCommandId,
            String(error?.code ?? 'PROFITABILITY_COMMAND_FAILED').slice(0, 80),
          ],
        )
        await this.client.query('commit')
        transactionFinished = true
        throw error
      }
    } catch (error) {
      if (!transactionFinished) await this.client.query('rollback').catch(() => {})
      throw error
    }
  }

  async listServiceObjectsForOrganization({ orgId, uid }) {
    const normalizedOrgId = requiredText(orgId, 'orgId')
    let accessProfile = null
    if (this.accessProfileV2Enabled) {
      await this.assertAccessProfileSchemaReady()
      accessProfile = await this.accessProfileRepository.assertRead({
        orgId: normalizedOrgId,
        uid,
      })
    }

    const result = accessProfile
      ? await this.client.query(
          `select object_id, client_id, name, timezone, status, default_currency,
                  address, city, postal_code, created_at, updated_at
             from public.service_object
            where org_id = $1
              and archived_at is null
              and ($2::boolean is true or object_id = any($3::text[]))
              and not (object_id = any($4::text[]))
            order by client_id, name, object_id`,
          [
            normalizedOrgId,
            accessProfile.objectScope === OBJECT_SCOPES.ALL,
            accessProfile.assignedObjectIds,
            accessProfile.deniedObjectIds,
          ],
        )
      : await this.client.query(
          `select object_id, client_id, name, timezone, status, default_currency,
                  address, city, postal_code, created_at, updated_at
             from public.service_object
            where org_id = $1
              and archived_at is null
            order by client_id, name, object_id`,
          [normalizedOrgId],
        )

    if (accessProfile) return result.rows
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
         select p.period_start::text as period_start,
                p.period_end::text as period_end,
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
      hygieneResult,
      equipmentResult,
      periodicResult,
      eventResult,
      rateResult,
      legacyAttendanceResult,
      targetResult,
    ] = await Promise.all([
        this.client.query(
          `select contract_version_id, billing_model, monthly_value_minor,
                  hourly_rate_minor, service_rate_minor, currency,
                  effective_from::text as effective_from,
                  effective_to::text as effective_to,
                  target_profitability_bps
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
          this.financialModelV21Enabled
            ? `select entry_id, org_id, object_id, periodic_work_id, entry_group, category,
                      name, amount_minor, currency,
                      occurred_on::text as occurred_on,
                      period_start::text as period_start,
                      period_end::text as period_end,
                      recurrence, source, value_basis, value_key
                 from public.profitability_effective_financial_entry
                where org_id = $1
                  and object_id = $2
                  and (
                    (recurrence in ('ONE_TIME', 'ACTUAL_USAGE') and occurred_on >= $3::date and occurred_on < $4::date)
                    or
                    (recurrence = 'MONTHLY' and period_start < $4::date and (period_end is null or period_end > $3::date))
                  )
                order by occurred_on, entry_id`
            : `select entry_id, org_id, object_id, periodic_work_id, entry_group, category,
                      name, amount_minor, currency,
                      occurred_on::text as occurred_on,
                      period_start::text as period_start,
                      period_end::text as period_end,
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
        this.financialModelV21Enabled
          ? this.client.query(
              `select package_id, package_version_id, recognition_key, package_name,
                      billing_mode, value_basis, price_net_minor, cost_minor,
                      margin_bps, currency,
                      effective_from::text as effective_from,
                      effective_to::text as effective_to,
                      occurred_on::text as occurred_on,
                      recognized_revenue_minor
                 from public.profitability_effective_hygiene_package
                where org_id = $1
                  and object_id = $2
                  and (
                    (billing_mode = 'AD_HOC' and occurred_on >= $3::date and occurred_on < $4::date)
                    or
                    (billing_mode in ('IN_CONTRACT', 'MONTHLY_EXTRA')
                      and effective_from < $4::date
                      and (effective_to is null or effective_to > $3::date))
                  )
                order by coalesce(occurred_on, effective_from), package_id, package_version_id`,
              queryParams,
            )
          : Promise.resolve({ rows: [] }),
        this.client.query(
          `select equipment_id, org_id, object_id, financing, recognition_method,
                  purchase_value_minor, depreciation_months, monthly_installment_minor,
                  currency, started_on::text as started_on,
                  ended_on::text as ended_on
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
                  planned_on::text as planned_on,
                  executed_on::text as executed_on,
                  planned_minutes, actual_minutes
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
          `select e.event_id, e.org_id, $2::varchar as object_id,
                  e.worker_login, e.start_at,
                  e.end_at, e.duration_sec, null::varchar as periodic_work_id,
                  e.task_id, e.zone_id,
                  (e.start_at at time zone o.timezone)::date::text as work_date
             from public.event e
             join public.service_object o
               on o.org_id = e.org_id and o.object_id = $2
             join public.zone z
               on z.org_id = e.org_id
              and z.id = e.zone_id
              and z.client_id = o.client_id
            where e.org_id = $1
              and e.start_at >= ($3::date::timestamp at time zone o.timezone)
              and e.start_at < ($4::date::timestamp at time zone o.timezone)
              and e.start_at is not null
            order by e.start_at, e.event_id`,
          queryParams,
        ),
        this.client.query(
          `select r.rate_id, r.org_id, r.object_id, r.worker_login, r.hourly_cost_minor,
                  r.currency, r.effective_from::text as effective_from,
                  r.effective_to::text as effective_to
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
              and (z.id is null or z.client_id is null)
              and e.start_at >= ($3::date::timestamp at time zone o.timezone)
              and e.start_at < ($4::date::timestamp at time zone o.timezone)`,
          queryParams,
        ),
        this.accessProfileV2Enabled
          ? this.client.query(
              `select target_id, minimum_result_minor, minimum_margin_bps,
                      currency, target_policy,
                      effective_from::text as effective_from,
                      effective_to::text as effective_to
                 from public.profitability_target_history
                where org_id = $1
                  and object_id = $2
                  and revoked_at is null
                  and effective_from < $4::date
                  and (effective_to is null or effective_to > $3::date)
                order by effective_from desc, target_id desc
                limit 2`,
              queryParams,
            )
          : Promise.resolve({ rows: [] }),
      ])

    if (targetResult.rows.length > 1) {
      const error = new Error('More than one profitability target applies to this period')
      error.code = 'PROFITABILITY_TARGET_AMBIGUOUS'
      error.statusCode = 409
      throw error
    }
    const target = targetResult.rows[0] ?? null

    const hygieneEntryRows = hygieneResult.rows.flatMap((packageRow) => {
      const monthly = packageRow.billing_mode !== 'AD_HOC'
      const common = {
        org_id: normalizedOrgId,
        object_id: normalizedObjectId,
        periodic_work_id: null,
        category: 'HYGIENE_PACKAGE',
        name: packageRow.package_name,
        currency: packageRow.currency,
        occurred_on: monthly ? null : packageRow.occurred_on,
        period_start: monthly ? packageRow.effective_from : null,
        period_end: monthly ? packageRow.effective_to : null,
        recurrence: monthly ? 'MONTHLY' : 'ONE_TIME',
        source: 'HYGIENE_PACKAGE',
        value_basis: packageRow.value_basis,
        value_key: packageRow.recognition_key,
      }
      const rows = [{
        ...common,
        entry_id: `hygiene:${packageRow.package_version_id}:cost`,
        entry_group: 'MATERIAL',
        amount_minor: packageRow.cost_minor,
      }]
      if (minorUnits(packageRow.recognized_revenue_minor) > 0n) {
        rows.push({
          ...common,
          entry_id: `hygiene:${packageRow.package_version_id}:revenue`,
          entry_group: 'REVENUE',
          amount_minor: packageRow.recognized_revenue_minor,
        })
      }
      return rows
    })
    const financialEntryRows = [...entryResult.rows, ...hygieneEntryRows]
    const financialEntries = financialEntryRows.map(mapFinancialEntry)
    const periodicWorks = periodicResult.rows.map((work) => ({
      actualMinutes: work.actual_minutes,
      executedOn: nullableDatabaseDate(work.executed_on),
      id: work.periodic_work_id,
      laborSessionIds: eventResult.rows
        .filter((event) => event.periodic_work_id === work.periodic_work_id)
        .map((event) => event.event_id),
      objectId: work.object_id,
      orgId: work.org_id,
      name: work.name,
      plannedMinutes: work.planned_minutes,
      plannedOn: nullableDatabaseDate(work.planned_on),
      status: work.status,
      workType: work.work_type,
      directCostEntries: financialEntries.filter(
        (entry) =>
          entry.id &&
          financialEntryRows.find((row) => row.entry_id === entry.id)?.periodic_work_id === work.periodic_work_id &&
          financialEntryRows.find((row) => row.entry_id === entry.id)?.entry_group !== 'REVENUE',
      ),
      revenueEntries: financialEntries.filter(
        (entry) => {
          const row = financialEntryRows.find((candidate) => candidate.entry_id === entry.id)
          return row?.periodic_work_id === work.periodic_work_id && row.entry_group === 'REVENUE'
        },
      ),
    }))

    const contractRevenues = contractResult.rows
      .filter((contract) => contract.monthly_value_minor !== null)
      .map((contract) => ({
        activeFrom: databaseDate(contract.effective_from),
        activeTo: nullableDatabaseDate(contract.effective_to),
        amountMinor: contract.monthly_value_minor,
        category: 'CONTRACT',
        currency: contract.currency,
        id: contract.contract_version_id,
        objectId: normalizedObjectId,
        orgId: normalizedOrgId,
        recurrence: 'MONTHLY',
      }))

    const additionalRevenues = financialEntries.filter((entry) => {
      const row = financialEntryRows.find((candidate) => candidate.entry_id === entry.id)
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
      accessProfileVersion: this.accessProfileV2Enabled ? 'v2' : null,
      additionalRevenues,
      clientId: serviceObject.client_id,
      contractConfigured: contractResult.rows.length > 0,
      contractRevenues,
      currency: serviceObject.default_currency,
      financialModelVersion: this.financialModelV21Enabled ? 'v2.1' : 'foundation-v2',
      hygienePackages: hygieneResult.rows.map((packageRow) => ({
        billingMode: packageRow.billing_mode,
        costMinor: packageRow.cost_minor,
        currency: packageRow.currency,
        effectiveFrom: databaseDate(packageRow.effective_from),
        effectiveTo: nullableDatabaseDate(packageRow.effective_to),
        marginBps: packageRow.margin_bps,
        name: packageRow.package_name,
        occurredOn: nullableDatabaseDate(packageRow.occurred_on),
        packageId: packageRow.package_id,
        packageVersionId: packageRow.package_version_id,
        priceNetMinor: packageRow.price_net_minor,
        recognitionKey: packageRow.recognition_key,
        recognizedRevenueMinor: packageRow.recognized_revenue_minor,
        valueBasis: packageRow.value_basis,
      })),
      equipment: equipmentResult.rows.map((asset) => ({
        currency: asset.currency,
        depreciationMonths: asset.depreciation_months,
        endedOn: nullableDatabaseDate(asset.ended_on),
        financing: asset.financing,
        id: asset.equipment_id,
        monthlyInstallmentMinor: asset.monthly_installment_minor,
        objectId: asset.object_id,
        orgId: asset.org_id,
        purchaseValueMinor: asset.purchase_value_minor,
        recognitionMethod: asset.recognition_method,
        startedOn: databaseDate(asset.started_on),
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
        const row = financialEntryRows.find((candidate) => candidate.entry_id === entry.id)
        return !row?.periodic_work_id && row?.entry_group === 'MATERIAL'
      }),
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      otherCosts: financialEntries.filter((entry) => {
        const row = financialEntryRows.find((candidate) => candidate.entry_id === entry.id)
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
      targetCurrency: target?.currency ?? null,
      targetId: target?.target_id ?? null,
      targetMinimumMarginBps: target?.minimum_margin_bps ?? null,
      targetMinimumResultMinor: target?.minimum_result_minor ?? null,
      targetPolicy: target?.target_policy ?? null,
      targetProfitabilityBps:
        target?.minimum_margin_bps ?? contractResult.rows.at(-1)?.target_profitability_bps ?? null,
      timezone: serviceObject.timezone,
      variableRevenueConfigured:
        additionalRevenues.length > 0 ||
        periodicWorks.some((work) => work.revenueEntries.length > 0),
      variableRevenueRequired,
      workerRates: rateResult.rows.map((rate) => ({
        currency: rate.currency,
        effectiveFrom: databaseDate(rate.effective_from),
        effectiveTo: nullableDatabaseDate(rate.effective_to),
        hourlyCostMinor: rate.hourly_cost_minor,
        id: rate.rate_id,
        objectId: rate.object_id,
        orgId: rate.org_id,
        workerLogin: rate.worker_login,
      })),
    }
  }

  async createWorkerRateVersion({ clientId, commandId = '', objectId, orgId, rate = {}, reason = '', uid }) {
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedClientId = requiredText(clientId, 'clientId')
    const normalizedObjectId = requiredText(objectId, 'objectId')
    await this.assertAccess({
      action: PROFITABILITY_ACTIONS.EDIT,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      uid,
      writeKind: WRITE_KINDS.WORKER_RATE,
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

    const persist = async () => {
      await this.assertWritableFinancialRange({
        endExclusive: effectiveTo,
        objectId: normalizedObjectId,
        orgId: normalizedOrgId,
        start: effectiveFrom,
      })
      const versionsResult = await this.client.query(
        `select r.*,
                r.effective_from::text as effective_from_ymd,
                r.effective_to::text as effective_to_ymd
           from public.worker_cost_rate r
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
        (row) => databaseDate(row.effective_from_ymd) === effectiveFrom,
      )
      const covering = versions.find((row) => {
        const start = databaseDate(row.effective_from_ymd)
        const end = row.effective_to_ymd ? databaseDate(row.effective_to_ymd) : null
        return start < effectiveFrom && (!end || effectiveFrom < end)
      })
      const nextVersion = versions.find(
        (row) => databaseDate(row.effective_from_ymd) > effectiveFrom,
      )
      if (sameStart && !auditReason) {
        const error = new Error('Replacing a worker rate requires a correction reason')
        error.code = 'WORKER_RATE_CORRECTION_REASON_REQUIRED'
        throw error
      }
      if (!effectiveTo && sameStart?.effective_to_ymd) {
        effectiveTo = databaseDate(sameStart.effective_to_ymd)
      }
      if (nextVersion) {
        const nextStart = databaseDate(nextVersion.effective_from_ymd)
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
    }

    return this.withFinancialModelV21Command({
      commandId,
      commandKind: 'UPSERT_WORKER_RATE',
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      payload: {
        auditReason,
        currency,
        effectiveFrom,
        effectiveTo,
        hourlyCostMinor,
        rateSource,
        workerLogin,
      },
      uid,
    }, persist)
  }

  async createContractVersion({ clientId, commandId = '', contract = {}, objectId, orgId, reason = '', uid }) {
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedClientId = requiredText(clientId, 'clientId')
    const normalizedObjectId = requiredText(objectId, 'objectId')
    await this.assertAccess({
      action: PROFITABILITY_ACTIONS.EDIT,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      uid,
      writeKind: WRITE_KINDS.CONTRACT_TERMS,
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

    const persist = async () => {
      await this.assertWritableFinancialRange({
        endExclusive: effectiveTo,
        objectId: normalizedObjectId,
        orgId: normalizedOrgId,
        start: effectiveFrom,
      })
      const versionsResult = await this.client.query(
        `select v.*,
                v.effective_from::text as effective_from_ymd,
                v.effective_to::text as effective_to_ymd
           from public.object_contract_version v
          where org_id = $1 and object_id = $2 and archived_at is null
          order by effective_from
          for update`,
        [normalizedOrgId, normalizedObjectId],
      )
      const versions = versionsResult.rows
      const sameStart = versions.find(
        (row) => databaseDate(row.effective_from_ymd) === effectiveFrom,
      )
      const covering = versions.find((row) => {
        const start = databaseDate(row.effective_from_ymd)
        const end = row.effective_to_ymd ? databaseDate(row.effective_to_ymd) : null
        return start < effectiveFrom && (!end || effectiveFrom < end)
      })
      const nextVersion = versions.find(
        (row) => databaseDate(row.effective_from_ymd) > effectiveFrom,
      )
      if (sameStart && !auditReason) {
        const error = new Error('Replacing a contract version requires a correction reason')
        error.code = 'CONTRACT_CORRECTION_REASON_REQUIRED'
        throw error
      }
      if (!effectiveTo && sameStart?.effective_to_ymd) {
        effectiveTo = databaseDate(sameStart.effective_to_ymd)
      }
      if (nextVersion) {
        const nextStart = databaseDate(nextVersion.effective_from_ymd)
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
    }

    return this.withFinancialModelV21Command({
      commandId,
      commandKind: 'UPSERT_CONTRACT',
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      payload: {
        auditReason,
        billingModel,
        contractName: String(contract.contractName ?? contract.name ?? '').trim() || null,
        contractNumber: String(contract.contractNumber ?? '').trim() || null,
        contractSource,
        currency,
        effectiveFrom,
        effectiveTo,
        hourlyRateMinor,
        monthlyValueMinor,
        serviceRateMinor,
        targetProfitabilityBps,
        vatRateBps,
      },
      uid,
    }, persist)
  }

  async upsertContract(input) {
    return this.createContractVersion(input)
  }

  async createFinancialEntry({ clientId, commandId = '', entry = {}, objectId, orgId, reason = '', uid }) {
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedClientId = requiredText(clientId, 'clientId')
    const normalizedObjectId = requiredText(objectId, 'objectId')
    const entryGroup = requiredText(entry.entryGroup ?? entry.group, 'entry.entryGroup').toUpperCase()
    await this.assertAccess({
      action: PROFITABILITY_ACTIONS.EDIT,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      uid,
      writeKind: entryGroup === 'REVENUE'
        ? WRITE_KINDS.CONTRACT_TERMS
        : WRITE_KINDS.OPERATIONAL_COST,
    })
    await this.verifyServiceObjectScope({
      clientId: normalizedClientId,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
    })

    const entryId = requiredText(entry.entryId ?? randomUUID(), 'entry.entryId')
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
    const valueBasis = String(entry.valueBasis ?? 'ACTUAL').trim().toUpperCase()
    if (!['PLAN', 'ESTIMATE', 'ACTUAL'].includes(valueBasis)) {
      throw new RangeError('Unsupported financial entry value basis')
    }
    const valueKey = String(entry.valueKey ?? '').trim() || null
    if (this.financialModelV21Enabled && !valueKey) {
      throw new TypeError('entry.valueKey is required for financial model v2.1')
    }
    if (valueKey && valueKey.length > 96) {
      throw new RangeError('entry.valueKey cannot exceed 96 characters')
    }
    const auditReason = String(reason || entry.reason || '').trim()

    const persist = async () => {
      await this.assertWritableFinancialRange({
        endExclusive: recurrence === 'MONTHLY' ? periodEnd : nextCalendarDate(occurredOn),
        objectId: normalizedObjectId,
        orgId: normalizedOrgId,
        start: recurrence === 'MONTHLY' ? periodStart : occurredOn,
      })
      const inserted = await this.client.query(
        this.financialModelV21Enabled
          ? `insert into public.object_financial_entry
              (org_id, object_id, entry_id, periodic_work_id, equipment_id, entry_group,
               category, name, amount_minor, currency, occurred_on, period_start,
               period_end, recurrence, source, source_reference, description,
               document_reference, status, created_by_uid, value_basis, value_key)
             values
              ($1, $2, $3, $4, $5, $6, $7, $8, $9::bigint, $10, $11::date,
               $12::date, $13::date, $14, $15, $16, $17, $18, 'POSTED', $19,
               $20, $21)
             returning *`
          : `insert into public.object_financial_entry
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
          ...(this.financialModelV21Enabled ? [valueBasis, valueKey] : []),
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
    }

    if (!this.financialModelV21Enabled) return this.withTransaction(persist)
    return this.withFinancialModelV21Command({
      commandId,
      commandKind: entryGroup === 'REVENUE' ? 'CREATE_REVENUE' : 'CREATE_COST',
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      payload: {
        amountMinor,
        auditReason,
        category: requiredText(entry.category, 'entry.category'),
        currency,
        description: String(entry.description ?? '').trim() || null,
        documentReference: String(entry.documentReference ?? '').trim() || null,
        equipmentId: String(entry.equipmentId ?? '').trim() || null,
        entryGroup,
        name: requiredText(entry.name, 'entry.name'),
        occurredOn,
        periodEnd,
        periodStart,
        periodicWorkId: String(entry.periodicWorkId ?? '').trim() || null,
        recurrence,
        source: entrySource,
        sourceReference: String(entry.sourceReference ?? '').trim() || null,
        valueBasis,
        valueKey,
      },
      uid,
    }, persist)
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

  async saveHygienePackage({
    clientId,
    commandId,
    objectId,
    orgId,
    package: packageInput = {},
    reason = '',
    uid,
  }) {
    if (!this.financialModelV21Enabled) {
      throw repositoryError(
        'PROFITABILITY_FINANCIAL_MODEL_NOT_READY',
        'Hygiene packages require financial model v2.1',
        503,
      )
    }
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedClientId = requiredText(clientId, 'clientId')
    const normalizedObjectId = requiredText(objectId, 'objectId')
    const normalizedCommandId = requiredText(commandId, 'commandId')
    const deterministicSuffix = createHash('sha256')
      .update(`${normalizedOrgId}\u0000${normalizedObjectId}\u0000${normalizedCommandId}`)
      .digest('hex')
      .slice(0, 32)
    const requestedBillingMode = requiredText(
      packageInput.billingMode ?? 'IN_CONTRACT',
      'package.billingMode',
    ).toUpperCase()
    const accessDecision = await this.assertAccess({
      action: PROFITABILITY_ACTIONS.EDIT,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      uid,
      writeKind: requestedBillingMode === 'IN_CONTRACT'
        ? WRITE_KINDS.OPERATIONAL_COST
        : WRITE_KINDS.CONTRACT_TERMS,
    })
    const authorizedPackageInput = accessDecision?.financeProfile === 'COST_CONTROL'
      ? restrictCostControlHygienePackage(packageInput)
      : packageInput
    const normalized = normalizeHygienePackage({
      ...authorizedPackageInput,
      packageId: authorizedPackageInput.packageId ?? `hyg-${deterministicSuffix}`,
      packageVersionId: authorizedPackageInput.packageVersionId ?? `hygv-${deterministicSuffix}`,
    })
    await this.verifyServiceObjectScope({
      clientId: normalizedClientId,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
    })

    const auditReason = String(reason || packageInput.reason || '').trim()
    const persist = async () => {
      await this.assertWritableFinancialRange({
        endExclusive: normalized.billingMode === 'AD_HOC'
          ? nextCalendarDate(normalized.occurredOn)
          : normalized.effectiveTo,
        objectId: normalizedObjectId,
        orgId: normalizedOrgId,
        start: normalized.effectiveFrom,
      })
      const versionsResult = await this.client.query(
        `select package_version_id, version_no, status, package_id,
                value_basis, package_name, billing_mode, price_net_minor,
                cost_minor, currency, recognition_key,
                effective_from::text as effective_from,
                effective_to::text as effective_to,
                occurred_on::text as occurred_on
           from public.object_hygiene_package_version
          where org_id = $1 and object_id = $2 and package_id = $3
          order by version_no desc
          for update`,
        [normalizedOrgId, normalizedObjectId, normalized.packageId],
      )
      const versionsForBasis = versionsResult.rows.filter(
        (row) => row.value_basis === normalized.valueBasis,
      )
      const previous = normalized.replacesPackageVersionId
        ? versionsResult.rows.find(
            (row) => row.package_version_id === normalized.replacesPackageVersionId,
          )
        : null
      if (normalized.replacesPackageVersionId && !previous) {
        throw repositoryError(
          'PROFITABILITY_HYGIENE_VERSION_NOT_FOUND',
          'The hygiene package version selected for correction does not exist',
          404,
        )
      }
      if (previous && previous.value_basis !== normalized.valueBasis) {
        throw new RangeError('A correction must keep the same value basis')
      }
      if (previous) {
        const transitionStatus = previous.status === 'DRAFT' ? 'VOID' : 'ARCHIVED'
        await this.client.query(
          `update public.object_hygiene_package_version
              set status = $4,
                  updated_at = now(), updated_by_uid = $5,
                  archived_at = case when $4 = 'ARCHIVED' then now() else null end,
                  archived_by_uid = case when $4 = 'ARCHIVED' then $5 else null end
            where org_id = $1 and object_id = $2 and package_version_id = $3`,
          [
            normalizedOrgId,
            normalizedObjectId,
            previous.package_version_id,
            transitionStatus,
            uid,
          ],
        )
      }
      const versionNo = versionsForBasis.reduce(
        (maximum, row) => Math.max(maximum, Number(row.version_no) || 0),
        0,
      ) + 1
      const inserted = await this.client.query(
        `insert into public.object_hygiene_package_version
          (org_id, object_id, package_id, package_version_id, version_no,
           recognition_key, package_name, billing_mode, value_basis,
           price_net_minor, cost_minor, currency, effective_from, effective_to,
           occurred_on, status, created_by_uid)
         values
          ($1, $2, $3, $4, $5, $6, $7, $8, $9,
           $10::bigint, $11::bigint, $12, $13::date, $14::date,
           $15::date, $16, $17)
         returning *`,
        [
          normalizedOrgId,
          normalizedObjectId,
          normalized.packageId,
          normalized.packageVersionId,
          versionNo,
          normalized.recognitionKey,
          normalized.packageName,
          normalized.billingMode,
          normalized.valueBasis,
          normalized.priceNetMinor,
          normalized.costMinor,
          normalized.currency,
          normalized.effectiveFrom,
          normalized.effectiveTo,
          normalized.occurredOn,
          normalized.status,
          uid,
        ],
      )
      const row = inserted.rows[0]
      await this.insertAuditRow({
        action: previous ? 'CORRECT_HYGIENE_PACKAGE' : 'CREATE_HYGIENE_PACKAGE',
        actorUid: uid,
        entityId: normalized.packageVersionId,
        entityType: 'OBJECT_HYGIENE_PACKAGE_VERSION',
        newValue: row,
        objectId: normalizedObjectId,
        orgId: normalizedOrgId,
        previousValue: previous,
        reason: auditReason,
      })
      return row
    }

    return this.withFinancialModelV21Command({
      commandId: normalizedCommandId,
      commandKind: normalized.replacesPackageVersionId
        ? 'CORRECT_HYGIENE_PACKAGE'
        : 'CREATE_HYGIENE_PACKAGE',
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      payload: {
        ...normalized,
        packageVersionId: normalized.packageVersionId,
        reason: auditReason,
      },
      uid,
    }, persist)
  }

  async archiveHygienePackage({
    clientId,
    commandId,
    objectId,
    orgId,
    packageVersionId,
    reason = '',
    uid,
  }) {
    if (!this.financialModelV21Enabled) {
      throw repositoryError(
        'PROFITABILITY_FINANCIAL_MODEL_NOT_READY',
        'Hygiene packages require financial model v2.1',
        503,
      )
    }
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedClientId = requiredText(clientId, 'clientId')
    const normalizedObjectId = requiredText(objectId, 'objectId')
    const normalizedVersionId = requiredText(packageVersionId, 'packageVersionId')
    await this.verifyServiceObjectScope({
      clientId: normalizedClientId,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
    })
    const packageScopeResult = await this.client.query(
      `select billing_mode
         from public.object_hygiene_package_version
        where org_id = $1 and object_id = $2 and package_version_id = $3
        limit 1`,
      [normalizedOrgId, normalizedObjectId, normalizedVersionId],
    )
    if (!packageScopeResult.rows[0]) {
      throw repositoryError(
        'PROFITABILITY_HYGIENE_VERSION_NOT_FOUND',
        'The hygiene package version does not exist',
        404,
      )
    }
    await this.assertAccess({
      action: PROFITABILITY_ACTIONS.EDIT,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      uid,
      writeKind: packageScopeResult.rows[0].billing_mode === 'IN_CONTRACT'
        ? WRITE_KINDS.OPERATIONAL_COST
        : WRITE_KINDS.CONTRACT_TERMS,
    })
    const auditReason = requiredText(reason, 'reason')
    const persist = async () => {
      const currentResult = await this.client.query(
        `select *,
                effective_from::text as effective_from_ymd,
                effective_to::text as effective_to_ymd,
                occurred_on::text as occurred_on_ymd
           from public.object_hygiene_package_version
          where org_id = $1 and object_id = $2 and package_version_id = $3
          for update`,
        [normalizedOrgId, normalizedObjectId, normalizedVersionId],
      )
      const current = currentResult.rows[0]
      if (!current) {
        throw repositoryError(
          'PROFITABILITY_HYGIENE_VERSION_NOT_FOUND',
          'The hygiene package version does not exist',
          404,
        )
      }
      await this.assertWritableFinancialRange({
        endExclusive: current.billing_mode === 'AD_HOC'
          ? nextCalendarDate(databaseDate(current.occurred_on_ymd))
          : nullableDatabaseDate(current.effective_to_ymd),
        objectId: normalizedObjectId,
        orgId: normalizedOrgId,
        start: databaseDate(current.effective_from_ymd),
      })
      const status = current.status === 'DRAFT' ? 'VOID' : 'ARCHIVED'
      const updated = await this.client.query(
        `update public.object_hygiene_package_version
            set status = $4,
                updated_at = now(), updated_by_uid = $5,
                archived_at = case when $4 = 'ARCHIVED' then now() else null end,
                archived_by_uid = case when $4 = 'ARCHIVED' then $5 else null end
          where org_id = $1 and object_id = $2 and package_version_id = $3
          returning *`,
        [normalizedOrgId, normalizedObjectId, normalizedVersionId, status, uid],
      )
      const row = updated.rows[0]
      await this.insertAuditRow({
        action: 'ARCHIVE_HYGIENE_PACKAGE',
        actorUid: uid,
        entityId: normalizedVersionId,
        entityType: 'OBJECT_HYGIENE_PACKAGE_VERSION',
        newValue: row,
        objectId: normalizedObjectId,
        orgId: normalizedOrgId,
        previousValue: current,
        reason: auditReason,
      })
      return row
    }
    return this.withFinancialModelV21Command({
      commandId,
      commandKind: 'ARCHIVE_HYGIENE_PACKAGE',
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      payload: { packageVersionId: normalizedVersionId, reason: auditReason },
      uid,
    }, persist)
  }

  async createEquipment({ asset = {}, clientId, commandId = '', objectId, orgId, reason = '', uid }) {
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedClientId = requiredText(clientId, 'clientId')
    const normalizedObjectId = requiredText(objectId, 'objectId')
    await this.assertAccess({
      action: PROFITABILITY_ACTIONS.EDIT,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      uid,
      writeKind: WRITE_KINDS.OPERATIONAL_COST,
    })
    await this.verifyServiceObjectScope({
      clientId: normalizedClientId,
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
    })

    const requestedEquipmentId = String(asset.equipmentId ?? asset.assetId ?? '').trim() || null
    const equipmentId = requiredText(requestedEquipmentId ?? randomUUID(), 'asset.equipmentId')
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
    const assetName = requiredText(asset.name, 'asset.name')

    const persist = async () => {
      await this.assertWritableFinancialRange({
        endExclusive: endedOn,
        objectId: normalizedObjectId,
        orgId: normalizedOrgId,
        start: startedOn,
      })
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
          assetName,
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
          this.financialModelV21Enabled
            ? `insert into public.object_financial_entry
                (org_id, object_id, entry_id, equipment_id, entry_group, category, name,
                 amount_minor, currency, occurred_on, recurrence, source, status,
                 created_by_uid, value_basis, value_key)
               values ($1, $2, $3, $4, 'EQUIPMENT_SERVICE', 'SERVICE_REPAIR', $5,
                       $6::bigint, $7, $8::date, 'ONE_TIME', 'MANUAL', 'POSTED', $9,
                       'ACTUAL', $10)
               returning *`
            : `insert into public.object_financial_entry
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
            `Serwis: ${assetName}`,
            serviceCostMinor,
            currency,
            serviceDate,
            uid,
            ...(this.financialModelV21Enabled
              ? [`equipment-service:${equipmentId}:${serviceDate}`]
              : []),
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
    }

    return this.withFinancialModelV21Command({
      commandId,
      commandKind: 'UPSERT_EQUIPMENT',
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      payload: {
        assetName,
        auditReason,
        category: String(asset.category ?? '').trim() || null,
        currency,
        depreciationMonths,
        endedOn,
        financing,
        inventoryNumber: String(asset.inventoryNumber ?? '').trim() || null,
        monthlyInstallmentMinor,
        purchaseValueMinor,
        recognitionMethod,
        requestedEquipmentId,
        serviceCostMinor,
        startedOn,
      },
      uid,
    }, persist)
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
      writeKind: WRITE_KINDS.CONTRACT_TERMS,
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

  async closePeriod({ clientId, commandId = '', objectId, orgId, period, periodId = '', reason = '', uid }) {
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
    const auditReason = String(reason ?? '').trim()
    const persist = async () => {
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
        dataVersion: this.financialModelV21Enabled
          ? 'profitability-financial-model-v2.1'
          : 'profitability-v1',
        snapshotId: randomUUID(),
      })
      return this.saveSnapshot({
        auditReason,
        closePeriod: true,
        periodId: normalizedPeriodId,
        result,
        snapshot,
        transactionManaged: true,
        uid,
      })
    }

    return this.withFinancialModelV21Command({
      commandId,
      commandKind: 'CLOSE_FINANCIAL_PERIOD',
      objectId: normalizedObjectId,
      orgId: normalizedOrgId,
      payload: {
        auditReason,
        clientId: normalizedClientId,
        period: normalizedPeriod,
        periodId: normalizedPeriodId,
      },
      uid,
    }, persist)
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
      writeKind: WRITE_KINDS.CONTRACT_TERMS,
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

  async saveSnapshot({
    auditReason = '',
    closePeriod = false,
    periodId,
    result,
    snapshot,
    transactionManaged = false,
    uid,
  }) {
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
        writeKind: WRITE_KINDS.CONTRACT_TERMS,
      })
    }

    if (!transactionManaged) await this.client.query('begin')
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
        `select status,
                period_start::text as period_start,
                period_end::text as period_end,
                currency
           from public.financial_period
          where org_id = $1 and object_id = $2 and period_id = $3
          for update`,
        [orgId, objectId, periodId],
      )
      const currentPeriod = periodResult.rows[0]
      if (!currentPeriod) throw new Error('Financial period not found')
      if (
        databaseDate(currentPeriod.period_start) !== snapshotPeriod.start ||
        databaseDate(currentPeriod.period_end) !== snapshotPeriod.end ||
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
      if (!transactionManaged) await this.client.query('commit')
      return payload
    } catch (error) {
      if (!transactionManaged) await this.client.query('rollback').catch(() => {})
      throw error
    }
  }
}

function createProfitabilityRepository(client, options) {
  return new ProfitabilityRepository(client, options)
}

module.exports = {
  databaseDate,
  nullableDatabaseDate,
  ProfitabilityRepository,
  createProfitabilityRepository,
  mapFinancialEntry,
}
