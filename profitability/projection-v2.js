'use strict'

const FINANCE_PROFILE = Object.freeze({
  OWNER_FULL: 'OWNER_FULL',
  COST_CONTROL: 'COST_CONTROL',
})

const OPERATIONAL_STATUS = Object.freeze({
  OK: 'OK',
  BELOW_TARGET: 'BELOW_TARGET',
  CRITICAL: 'CRITICAL',
  NOT_CALCULABLE: 'NOT_CALCULABLE',
  NO_TARGET: 'NO_TARGET',
  INCOMPLETE: 'INCOMPLETE',
  UNKNOWN: 'UNKNOWN',
})

const ALLOWED_OPERATIONAL_STATUSES = new Set(Object.values(OPERATIONAL_STATUS))
const INTEGER_PATTERN = /^-?\d+$/

class ProfitabilityProjectionError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ProfitabilityProjectionError'
    this.code = code
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneValue(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value
  if (value instanceof Date) return new Date(value.getTime())
  if (seen.has(value)) return seen.get(value)

  if (Array.isArray(value)) {
    const copy = []
    seen.set(value, copy)
    for (const item of value) copy.push(cloneValue(item, seen))
    return copy
  }

  const copy = {}
  seen.set(value, copy)
  for (const [key, entry] of Object.entries(value)) copy[key] = cloneValue(entry, seen)
  return copy
}

function optionalScalar(value) {
  if (value === null) return null
  if (['string', 'number', 'boolean', 'bigint'].includes(typeof value)) return value
  return undefined
}

function optionalInteger(value) {
  if (value === null) return null
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value === 'string' && INTEGER_PATTERN.test(value.trim())) return value.trim()
  return undefined
}

function normalizedText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function setDefined(target, key, value) {
  if (value !== undefined) target[key] = value
  return target
}

function normalizeFinanceProfile(value) {
  const normalized = normalizedText(value)?.toUpperCase()
  if (!normalized) {
    throw new ProfitabilityProjectionError(
      'PROFITABILITY_FINANCE_PROFILE_REQUIRED',
      'Brak zaufanego profilu finansowego.',
    )
  }
  if (!Object.values(FINANCE_PROFILE).includes(normalized)) {
    throw new ProfitabilityProjectionError(
      'PROFITABILITY_FINANCE_PROFILE_FORBIDDEN',
      'Profil finansowy nie ma dostępu do danych rentowności.',
    )
  }
  return normalized
}

function projectWarning(value) {
  if (!isRecord(value)) return null
  const warning = {}
  setDefined(warning, 'code', normalizedText(value.code))
  setDefined(warning, 'objectId', normalizedText(value.objectId))
  return Object.keys(warning).length ? warning : null
}

function projectWarnings(values) {
  if (!Array.isArray(values)) return []
  return values.map(projectWarning).filter(Boolean)
}

function projectFreshness(value) {
  if (!isRecord(value)) return undefined
  const freshness = {}
  setDefined(freshness, 'status', normalizedText(value.status))
  setDefined(freshness, 'asOf', normalizedText(value.asOf))
  setDefined(freshness, 'calculatedAt', normalizedText(value.calculatedAt))
  setDefined(freshness, 'lastUpdatedAt', normalizedText(value.lastUpdatedAt))
  setDefined(freshness, 'stale', typeof value.stale === 'boolean' ? value.stale : undefined)
  setDefined(freshness, 'ageSeconds', optionalInteger(value.ageSeconds))
  setDefined(freshness, 'source', normalizedText(value.source))
  return Object.keys(freshness).length ? freshness : undefined
}

function projectIssue(value) {
  if (!isRecord(value)) return null
  const issue = {}
  setDefined(issue, 'code', normalizedText(value.code))
  setDefined(issue, 'objectId', normalizedText(value.objectId))
  return Object.keys(issue).length ? issue : null
}

function projectPlanDataQuality(value) {
  if (!isRecord(value)) return undefined
  const plan = {}
  setDefined(plan, 'complete', typeof value.complete === 'boolean' ? value.complete : undefined)
  if (Array.isArray(value.issues)) plan.issues = value.issues.map(projectIssue).filter(Boolean)
  return Object.keys(plan).length ? plan : undefined
}

function projectDataQuality(value, warningCount = 0) {
  const source = isRecord(value) ? value : {}
  const quality = {}
  setDefined(quality, 'completenessPercent', optionalScalar(source.completenessPercent))
  setDefined(quality, 'incomplete', typeof source.incomplete === 'boolean' ? source.incomplete : undefined)
  setDefined(quality, 'laborIncomplete', typeof source.laborIncomplete === 'boolean' ? source.laborIncomplete : undefined)
  setDefined(quality, 'plan', projectPlanDataQuality(source.planDataQuality))
  setDefined(quality, 'warningCount', Number.isSafeInteger(warningCount) ? warningCount : undefined)
  setDefined(quality, 'freshness', projectFreshness(source.freshness))
  return quality
}

function projectLabor(value) {
  const source = isRecord(value) ? value : {}
  const comparison = isRecord(source.laborComparison) ? source.laborComparison : {}
  const labor = {}
  setDefined(labor, 'actualSeconds', optionalInteger(comparison.actualSeconds))
  setDefined(labor, 'plannedSeconds', optionalInteger(comparison.plannedSeconds))
  setDefined(labor, 'secondsDelta', optionalInteger(comparison.secondsDelta))
  let workerRows = []
  if (Array.isArray(source.laborTimeBreakdown)) {
    workerRows = source.laborTimeBreakdown.map((row) => {
      const projected = {}
      setDefined(projected, 'workerLogin', normalizedText(row?.workerLogin))
      setDefined(projected, 'durationSeconds', optionalInteger(row?.durationSeconds))
      return projected
    }).filter((row) => row.workerLogin && row.durationSeconds !== undefined)
    labor.byWorker = workerRows
  }
  const legacyWorkerCosts = isRecord(source.laborCostBreakdown?.byWorker)
    ? Object.keys(source.laborCostBreakdown.byWorker).filter((workerLogin) => normalizedText(workerLogin))
    : []
  const workerCount = workerRows.length || legacyWorkerCosts.length
  // Exact worker durations combined with an exact object labor total reveal an
  // individual hourly rate for a small team. Keep the operational hours, but
  // withhold the monetary aggregate until the cohort has at least 3 workers.
  if (workerCount < 3) {
    labor.costVisibility = 'WITHHELD_SMALL_COHORT'
  } else {
    setDefined(labor, 'totalLaborCostMinor', optionalInteger(source.laborCostMinor))
  }
  return labor
}

function integerOrNull(value, field) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new ProfitabilityProjectionError(
        'PROFITABILITY_TARGET_INVALID',
        `Pole ${field} musi być bezpieczną liczbą całkowitą.`,
      )
    }
    return BigInt(value)
  }
  if (typeof value === 'string' && INTEGER_PATTERN.test(value.trim())) return BigInt(value.trim())
  throw new ProfitabilityProjectionError(
    'PROFITABILITY_TARGET_INVALID',
    `Pole ${field} musi być liczbą całkowitą.`,
  )
}

function addCategory(categoryMap, key, amount) {
  const normalizedKey = normalizedText(key)?.toUpperCase()
  const normalizedAmount = integerOrNull(amount, `operationalCosts.${normalizedKey || 'UNKNOWN'}`)
  if (!normalizedKey || normalizedAmount === null) return
  categoryMap.set(normalizedKey, (categoryMap.get(normalizedKey) ?? 0n) + normalizedAmount)
}

function projectOperationalCosts(value) {
  const source = isRecord(value) ? value : {}
  const categories = new Map()

  if (Array.isArray(source.costEntries)) {
    for (const entry of source.costEntries) {
      if (!isRecord(entry)) continue
      addCategory(categories, entry.category || 'OTHER', entry.amountMinor)
    }
  }

  if (categories.size === 0) {
    addCategory(categories, 'MATERIALS', source.materialCostMinor)
    addCategory(categories, 'OTHER', source.otherDirectCostMinor)
  }
  addCategory(categories, 'EQUIPMENT', source.equipmentCostMinor)
  addCategory(categories, 'PERIODIC', source.periodicCostMinor)

  const rows = [...categories.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, amountMinor]) => ({ category, amountMinor }))
  const totalOperationalCostMinor = rows.reduce((sum, row) => sum + row.amountMinor, 0n)
  return { categories: rows, totalOperationalCostMinor }
}

function projectCostControlHygienePackage(value) {
  if (!isRecord(value)) return null
  const projected = {}
  setDefined(projected, 'packageId', normalizedText(value.packageId))
  setDefined(projected, 'packageVersionId', normalizedText(value.packageVersionId))
  setDefined(projected, 'name', normalizedText(value.name))
  setDefined(projected, 'billingMode', normalizedText(value.billingMode))
  setDefined(projected, 'costMinor', optionalInteger(value.costMinor))
  setDefined(projected, 'currency', normalizedText(value.currency))
  setDefined(projected, 'effectiveFrom', normalizedText(value.effectiveFrom))
  setDefined(projected, 'effectiveTo', normalizedText(value.effectiveTo))
  setDefined(projected, 'occurredOn', normalizedText(value.occurredOn))
  setDefined(projected, 'recognitionKey', normalizedText(value.recognitionKey))
  setDefined(projected, 'valueBasis', normalizedText(value.valueBasis))
  return Object.keys(projected).length ? projected : null
}

function firstDefined(source, ...keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined) return source[key]
  }
  return undefined
}

function projectHygienePackageMutation(value, financeProfile) {
  const normalizedProfile = normalizeFinanceProfile(financeProfile)
  const source = isRecord(value) ? value : {}
  const projected = {}

  setDefined(projected, 'idempotentReplay', typeof source.idempotentReplay === 'boolean'
    ? source.idempotentReplay
    : undefined)
  setDefined(projected, 'resultReference', normalizedText(
    firstDefined(source, 'resultReference', 'result_reference'),
  ))
  setDefined(projected, 'packageId', normalizedText(
    firstDefined(source, 'packageId', 'package_id'),
  ))
  setDefined(projected, 'packageVersionId', normalizedText(
    firstDefined(source, 'packageVersionId', 'package_version_id'),
  ))
  setDefined(projected, 'versionNo', optionalInteger(
    firstDefined(source, 'versionNo', 'version_no'),
  ))
  setDefined(projected, 'packageName', normalizedText(
    firstDefined(source, 'packageName', 'package_name'),
  ))
  setDefined(projected, 'billingMode', normalizedText(
    firstDefined(source, 'billingMode', 'billing_mode'),
  ))
  setDefined(projected, 'valueBasis', normalizedText(
    firstDefined(source, 'valueBasis', 'value_basis'),
  ))
  setDefined(projected, 'costMinor', optionalInteger(
    firstDefined(source, 'costMinor', 'cost_minor'),
  ))
  setDefined(projected, 'currency', normalizedText(source.currency))
  setDefined(projected, 'effectiveFrom', normalizedText(
    firstDefined(source, 'effectiveFrom', 'effective_from'),
  ))
  setDefined(projected, 'effectiveTo', normalizedText(
    firstDefined(source, 'effectiveTo', 'effective_to'),
  ))
  setDefined(projected, 'occurredOn', normalizedText(
    firstDefined(source, 'occurredOn', 'occurred_on'),
  ))
  setDefined(projected, 'recognitionKey', normalizedText(
    firstDefined(source, 'recognitionKey', 'recognition_key'),
  ))
  setDefined(projected, 'status', normalizedText(source.status))

  if (normalizedProfile === FINANCE_PROFILE.OWNER_FULL) {
    setDefined(projected, 'priceNetMinor', optionalInteger(
      firstDefined(source, 'priceNetMinor', 'price_net_minor'),
    ))
  }

  return projected
}

function projectCostControlEntry(value) {
  if (!isRecord(value)) return null
  const projected = {}
  setDefined(projected, 'name', normalizedText(value.name))
  setDefined(projected, 'category', normalizedText(value.category))
  setDefined(projected, 'amountMinor', optionalInteger(value.amountMinor))
  setDefined(projected, 'currency', normalizedText(value.currency))
  setDefined(projected, 'date', normalizedText(value.date))
  setDefined(projected, 'activeFrom', normalizedText(value.activeFrom))
  setDefined(projected, 'activeTo', normalizedText(value.activeTo))
  setDefined(projected, 'recurrence', normalizedText(value.recurrence))
  setDefined(projected, 'valueBasis', normalizedText(value.valueBasis))
  setDefined(projected, 'valueKey', normalizedText(value.valueKey))
  return Object.keys(projected).length ? projected : null
}

function normalizedOperationalStatus(value) {
  const normalized = normalizedText(value)?.toUpperCase()
  return normalized && ALLOWED_OPERATIONAL_STATUSES.has(normalized) ? normalized : undefined
}

function projectOperationalOutcome(primary, fallback) {
  const preferred = isRecord(primary) ? primary : {}
  const secondary = isRecord(fallback) ? fallback : {}
  const outcome = {}
  setDefined(
    outcome,
    'operationalStatus',
    normalizedOperationalStatus(preferred.operationalStatus ?? secondary.operationalStatus),
  )
  setDefined(
    outcome,
    'improvementGapMinor',
    optionalInteger(preferred.improvementGapMinor ?? secondary.improvementGapMinor),
  )
  return outcome
}

function projectCostControlObject(value) {
  if (!isRecord(value)) return null
  const warnings = projectWarnings(value.warnings ?? value.issues)
  const projected = {}
  setDefined(projected, 'clientId', normalizedText(value.clientId))
  setDefined(projected, 'objectId', normalizedText(value.objectId))
  setDefined(projected, 'name', normalizedText(value.name))
  setDefined(projected, 'timeZone', normalizedText(value.timeZone))
  setDefined(projected, 'currency', normalizedText(value.currency))
  projected.labor = projectLabor(value)
  projected.operationalCosts = projectOperationalCosts(value)
  if (Array.isArray(value.costEntries)) {
    projected.costEntries = value.costEntries.map(projectCostControlEntry).filter(Boolean)
  }
  if (Array.isArray(value.hygienePackages)) {
    projected.hygienePackages = value.hygienePackages
      .map(projectCostControlHygienePackage)
      .filter(Boolean)
  }
  projected.dataQuality = projectDataQuality(value, warnings.length)
  setDefined(projected, 'freshness', projectFreshness(value.freshness))
  Object.assign(projected, projectOperationalOutcome(value))
  if (warnings.length) projected.warnings = warnings
  return projected
}

function projectCostControlTrend(value) {
  const source = isRecord(value) ? value : {}
  const points = Array.isArray(source.points) ? source.points : []
  const trend = {
    points: points.map((point) => {
      const projected = {}
      setDefined(projected, 'period', normalizedText(point?.period))
      setDefined(projected, 'totalCostMinor', optionalInteger(point?.totalCostMinor))
      setDefined(projected, 'completenessBps', optionalInteger(point?.completenessBps))
      setDefined(projected, 'incomplete', typeof point?.incomplete === 'boolean' ? point.incomplete : undefined)
      return projected
    }),
  }
  setDefined(trend, 'emptyReason', normalizedText(source.emptyReason))
  setDefined(trend, 'source', normalizedText(source.source))
  setDefined(trend, 'status', normalizedText(source.status))
  if (isRecord(source.window)) {
    trend.window = {
      start: normalizedText(source.window.start),
      end: normalizedText(source.window.end),
      months: optionalInteger(source.window.months),
    }
  }
  return trend
}

function projectCostControl(payload) {
  const source = isRecord(payload) ? payload : {}
  const summarySource = isRecord(source.summary) ? source.summary : {}
  const warnings = projectWarnings(source.warnings)
  const summary = {}
  setDefined(summary, 'currency', normalizedText(summarySource.currency ?? source.currency))
  setDefined(summary, 'objectCount', optionalInteger(summarySource.objectCount))
  summary.labor = projectLabor(summarySource)
  summary.operationalCosts = projectOperationalCosts(summarySource)
  summary.dataQuality = projectDataQuality(summarySource, warnings.length)
  setDefined(summary, 'freshness', projectFreshness(summarySource.freshness ?? source.freshness))
  Object.assign(summary, projectOperationalOutcome(summarySource, source))

  const projected = {
    financeProfile: FINANCE_PROFILE.COST_CONTROL,
    summary,
    objects: Array.isArray(source.objects)
      ? source.objects.map(projectCostControlObject).filter(Boolean)
      : [],
    trend: projectCostControlTrend(source.trend),
    warnings,
  }
  setDefined(projected, 'currency', normalizedText(source.currency ?? summarySource.currency))
  setDefined(projected, 'period', normalizedText(source.period))
  setDefined(projected, 'freshness', projectFreshness(source.freshness))
  return projected
}

function projectProfitabilityPayload(payload, financeProfile) {
  const normalizedProfile = normalizeFinanceProfile(financeProfile)
  if (normalizedProfile === FINANCE_PROFILE.OWNER_FULL) return cloneValue(payload)
  return projectCostControl(payload)
}

function auditJson(value) {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function isOperationalAuditRow(row) {
  if (!isRecord(row)) return false
  const entityType = normalizedText(row.entity_type ?? row.entityType)?.toUpperCase()
  if (entityType === 'OBJECT_EQUIPMENT') return true
  if (entityType !== 'OBJECT_FINANCIAL_ENTRY') return false
  const nextValue = auditJson(row.new_value ?? row.newValue)
  const previousValue = auditJson(row.previous_value ?? row.previousValue)
  const entryGroup = normalizedText(nextValue.entry_group ?? previousValue.entry_group)?.toUpperCase()
  return Boolean(entryGroup) && entryGroup !== 'REVENUE'
}

function projectProfitabilityHistory(rows, financeProfile, { objectId = '' } = {}) {
  const normalizedProfile = normalizeFinanceProfile(financeProfile)
  const source = Array.isArray(rows) ? rows : []
  if (normalizedProfile === FINANCE_PROFILE.OWNER_FULL) {
    return source.map((row) => ({
      action: row.action,
      actorId: row.actor_uid,
      reason: row.reason,
      changedAt: row.created_at,
      entityType: row.entity_type,
      entityId: row.entity_id,
    }))
  }

  return source.filter(isOperationalAuditRow).map((row) => ({
    action: normalizedText(row.action),
    changedAt: row.created_at,
    objectId: normalizedText(objectId),
    recordType: normalizedText(row.entity_type)?.toUpperCase() === 'OBJECT_EQUIPMENT'
      ? 'EQUIPMENT'
      : 'OPERATIONAL_COST',
  }))
}

function ceilRatio(numerator, denominator) {
  if (denominator <= 0n) throw new RangeError('denominator must be positive')
  if (numerator >= 0n) return (numerator + denominator - 1n) / denominator
  return numerator / denominator
}

function nonNegativeGap(required, actual) {
  const gap = required - actual
  return gap > 0n ? gap : 0n
}

function evaluateProfitabilityTarget(input = {}) {
  if (!isRecord(input)) {
    throw new ProfitabilityProjectionError(
      'PROFITABILITY_TARGET_INVALID',
      'Parametry celu rentowności są niepoprawne.',
    )
  }

  const resultMinor = integerOrNull(input.resultMinor ?? input.marginMinor, 'resultMinor')
  const revenueMinor = integerOrNull(input.revenueMinor, 'revenueMinor')
  const targetAmountMinor = integerOrNull(
    input.targetAmountMinor ?? input.minimumResultMinor,
    'targetAmountMinor',
  )
  const targetMarginBps = integerOrNull(
    input.targetMarginBps ?? input.minimumMarginBps,
    'targetMarginBps',
  )

  const amountTargetConfigured = targetAmountMinor !== null
  const marginTargetConfigured = targetMarginBps !== null
  if (!amountTargetConfigured && !marginTargetConfigured) {
    return {
      evaluated: false,
      meetsTarget: null,
      amountTargetMet: null,
      marginTargetMet: null,
      improvementGapMinor: null,
      operationalStatus: OPERATIONAL_STATUS.NO_TARGET,
    }
  }

  if (resultMinor === null) {
    return {
      evaluated: false,
      meetsTarget: null,
      amountTargetMet: null,
      marginTargetMet: null,
      improvementGapMinor: null,
      operationalStatus: OPERATIONAL_STATUS.NOT_CALCULABLE,
    }
  }

  const amountGap = amountTargetConfigured
    ? nonNegativeGap(targetAmountMinor, resultMinor)
    : null
  const amountTargetMet = amountTargetConfigured ? amountGap === 0n : null

  if (marginTargetConfigured && (revenueMinor === null || revenueMinor <= 0n)) {
    return {
      evaluated: false,
      meetsTarget: null,
      amountTargetMet,
      marginTargetMet: null,
      improvementGapMinor: null,
      operationalStatus: OPERATIONAL_STATUS.NOT_CALCULABLE,
    }
  }

  const marginRequiredResultMinor = marginTargetConfigured
    ? ceilRatio(revenueMinor * targetMarginBps, 10000n)
    : null
  const marginGap = marginTargetConfigured
    ? nonNegativeGap(marginRequiredResultMinor, resultMinor)
    : null
  const marginTargetMet = marginTargetConfigured ? marginGap === 0n : null
  const calculatedGaps = [amountGap, marginGap].filter((value) => value !== null)
  const improvementGapMinor = calculatedGaps.reduce(
    (maximum, gap) => gap > maximum ? gap : maximum,
    0n,
  )
  const meetsTarget = (amountTargetMet ?? true) && (marginTargetMet ?? true)

  return {
    evaluated: true,
    meetsTarget,
    amountTargetMet,
    marginTargetMet,
    improvementGapMinor,
    operationalStatus: meetsTarget
      ? OPERATIONAL_STATUS.OK
      : resultMinor < 0n
        ? OPERATIONAL_STATUS.CRITICAL
        : OPERATIONAL_STATUS.BELOW_TARGET,
  }
}

module.exports = {
  FINANCE_PROFILE,
  OPERATIONAL_STATUS,
  ProfitabilityProjectionError,
  evaluateProfitabilityTarget,
  projectHygienePackageMutation,
  projectProfitabilityHistory,
  projectProfitabilityPayload,
}
