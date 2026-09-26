const COST_CONTROL_PROFILE = 'COST_CONTROL'
const INTEGER_PATTERN = /^-?\d+$/

const MATERIAL_CATEGORIES = new Set([
  'CHEMICALS',
  'CLEANING_PRODUCTS',
  'CONSUMABLES',
  'HYGIENE',
  'MATERIALS',
])

const EQUIPMENT_CATEGORIES = new Set(['ASSETS', 'EQUIPMENT', 'MACHINES'])
const PERIODIC_CATEGORIES = new Set(['PERIODIC'])

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cleanText(value) {
  return String(value ?? '').trim()
}

function integerOrNull(value) {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value)
  const normalized = cleanText(value)
  if (!INTEGER_PATTERN.test(normalized)) return null
  try {
    return BigInt(normalized)
  } catch {
    return null
  }
}

function integerString(value) {
  const integer = integerOrNull(value)
  return integer === null ? undefined : integer.toString()
}

function safeCategories(value) {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return []
    const category = cleanText(entry.category).toUpperCase()
    const amountMinor = integerString(entry.amountMinor)
    return category && amountMinor !== undefined ? [{ category, amountMinor }] : []
  })
}

function safeCostEntries(value) {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return []
    const amountMinor = integerString(entry.amountMinor)
    const category = cleanText(entry.category).toUpperCase()
    if (amountMinor === undefined || !category) return []
    return [{
      name: cleanText(entry.name),
      category,
      amountMinor,
      currency: cleanText(entry.currency).toUpperCase(),
      date: cleanText(entry.date),
      activeFrom: cleanText(entry.activeFrom),
      activeTo: cleanText(entry.activeTo),
      recurrence: cleanText(entry.recurrence).toUpperCase(),
      valueBasis: cleanText(entry.valueBasis).toUpperCase(),
      valueKey: cleanText(entry.valueKey),
    }]
  })
}

function safeHygienePackages(value) {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return []
    const costMinor = integerString(entry.costMinor)
    if (costMinor === undefined) return []
    return [{
      packageId: cleanText(entry.packageId),
      packageVersionId: cleanText(entry.packageVersionId),
      name: cleanText(entry.name),
      billingMode: cleanText(entry.billingMode).toUpperCase(),
      costMinor,
      currency: cleanText(entry.currency).toUpperCase(),
      effectiveFrom: cleanText(entry.effectiveFrom),
      effectiveTo: cleanText(entry.effectiveTo),
      occurredOn: cleanText(entry.occurredOn),
      recognitionKey: cleanText(entry.recognitionKey),
      valueBasis: cleanText(entry.valueBasis).toUpperCase(),
    }]
  })
}

function safeLaborWorkers(value) {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return []
    const workerLogin = cleanText(entry.workerLogin)
    const durationSeconds = integerString(entry.durationSeconds)
    return workerLogin && durationSeconds !== undefined
      ? [{ workerLogin, durationSeconds }]
      : []
  })
}

function sumCategories(categories, predicate = () => true) {
  return categories.reduce((sum, entry) => (
    predicate(entry.category) ? sum + BigInt(entry.amountMinor) : sum
  ), 0n)
}

function safeWarning(value) {
  if (!isRecord(value)) return null
  const warning = {}
  const code = cleanText(value.code)
  const objectId = cleanText(value.objectId)
  if (code) warning.code = code
  if (objectId) warning.objectId = objectId
  return Object.keys(warning).length ? warning : null
}

function safeWarnings(value) {
  return Array.isArray(value) ? value.map(safeWarning).filter(Boolean) : []
}

function safeFreshness(value) {
  if (!isRecord(value)) return undefined
  const freshness = {}
  for (const key of ['status', 'asOf', 'calculatedAt', 'lastUpdatedAt', 'source']) {
    const field = cleanText(value[key])
    if (field) freshness[key] = field
  }
  if (typeof value.stale === 'boolean') freshness.stale = value.stale
  const ageSeconds = integerString(value.ageSeconds)
  if (ageSeconds !== undefined) freshness.ageSeconds = ageSeconds
  return Object.keys(freshness).length ? freshness : undefined
}

function safeDataQuality(value) {
  const source = isRecord(value) ? value : {}
  const result = {}
  const completenessPercent = Number(source.completenessPercent)
  if (Number.isFinite(completenessPercent)) result.completenessPercent = completenessPercent
  if (typeof source.incomplete === 'boolean') result.incomplete = source.incomplete
  if (typeof source.laborIncomplete === 'boolean') result.laborIncomplete = source.laborIncomplete
  if (Number.isSafeInteger(source.warningCount)) result.warningCount = source.warningCount
  if (isRecord(source.plan)) {
    result.plan = {}
    if (typeof source.plan.complete === 'boolean') result.plan.complete = source.plan.complete
    const issues = safeWarnings(source.plan.issues)
    if (issues.length) result.plan.issues = issues
  }
  const freshness = safeFreshness(source.freshness)
  if (freshness) result.freshness = freshness
  return result
}

function normalizeCostControlRow(value, fallbackCurrency = '') {
  const source = isRecord(value) ? value : {}
  const labor = isRecord(source.labor) ? source.labor : {}
  const operationalCosts = isRecord(source.operationalCosts) ? source.operationalCosts : {}
  const categories = safeCategories(operationalCosts.categories)
  const laborCost = integerOrNull(labor.totalLaborCostMinor)
  const operationalCost = integerOrNull(operationalCosts.totalOperationalCostMinor)
  const materialCost = sumCategories(categories, (category) => MATERIAL_CATEGORIES.has(category))
  const equipmentCost = sumCategories(categories, (category) => EQUIPMENT_CATEGORIES.has(category))
  const periodicCost = sumCategories(categories, (category) => PERIODIC_CATEGORIES.has(category))
  const otherCost = sumCategories(categories, (category) => !MATERIAL_CATEGORIES.has(category))
  const dataQuality = safeDataQuality(source.dataQuality)
  const normalizedLabor = {
    actualSeconds: integerString(labor.actualSeconds),
    plannedSeconds: integerString(labor.plannedSeconds),
    secondsDelta: integerString(labor.secondsDelta),
    totalLaborCostMinor: integerString(labor.totalLaborCostMinor),
    byWorker: safeLaborWorkers(labor.byWorker),
  }
  if (cleanText(labor.costVisibility) === 'WITHHELD_SMALL_COHORT') {
    normalizedLabor.costVisibility = 'WITHHELD_SMALL_COHORT'
  }
  const normalizedOperationalCosts = {
    categories,
    totalOperationalCostMinor: integerString(operationalCosts.totalOperationalCostMinor),
  }
  const result = {
    currency: cleanText(source.currency || fallbackCurrency).toUpperCase(),
    labor: normalizedLabor,
    operationalCosts: normalizedOperationalCosts,
    dataQuality,
    operationalStatus: cleanText(source.operationalStatus).toUpperCase(),
    improvementGapMinor: integerString(source.improvementGapMinor),
    laborCostMinor: laborCost === null ? undefined : laborCost.toString(),
    materialCostMinor: materialCost.toString(),
    equipmentCostMinor: equipmentCost.toString(),
    periodicCostMinor: periodicCost.toString(),
    otherCostMinor: otherCost.toString(),
    totalCostMinor: laborCost === null || operationalCost === null
      ? undefined
      : (laborCost + operationalCost).toString(),
    completenessPercent: dataQuality.completenessPercent,
    incomplete: dataQuality.incomplete,
    laborIncomplete: dataQuality.laborIncomplete,
    status: cleanText(source.operationalStatus).toUpperCase(),
    laborComparison: {
      actualSeconds: normalizedLabor.actualSeconds,
      plannedSeconds: normalizedLabor.plannedSeconds,
      secondsDelta: normalizedLabor.secondsDelta,
      actualCostMinor: laborCost === null ? undefined : laborCost.toString(),
    },
    costBreakdown: [
      ...(laborCost === null ? [] : [{ category: 'LABOR', amountMinor: laborCost.toString() }]),
      ...categories,
    ],
    costEntries: safeCostEntries(source.costEntries),
    hygienePackages: safeHygienePackages(source.hygienePackages),
  }

  const objectCount = integerString(source.objectCount)
  if (objectCount !== undefined) result.objectCount = objectCount

  const objectId = cleanText(source.objectId)
  const name = cleanText(source.name)
  const timeZone = cleanText(source.timeZone)
  if (objectId) result.objectId = objectId
  if (name) result.name = name
  if (timeZone) result.timeZone = timeZone
  const freshness = safeFreshness(source.freshness)
  if (freshness) result.freshness = freshness
  const warnings = safeWarnings(source.warnings)
  if (warnings.length) result.warnings = warnings
  return result
}

export function normalizeProfitabilityViewPayload(payload = {}) {
  if (!isRecord(payload)) return {}
  const capability = isRecord(payload.capability) ? payload.capability : {}
  const requestedProfile = cleanText(capability.financeProfile || payload.financeProfile).toUpperCase()
  if (requestedProfile === 'OWNER_FULL') return payload
  // Fail closed for a missing or future/unknown finance profile. Treating it as
  // the restricted projection prevents an accidental full-payload render.
  const currency = cleanText(payload.currency || payload.summary?.currency).toUpperCase()
  const summary = normalizeCostControlRow(payload.summary, currency)
  const normalized = {
    financeProfile: COST_CONTROL_PROFILE,
    capability: { ...capability, financeProfile: COST_CONTROL_PROFILE },
    currency,
    period: cleanText(payload.period),
    summary,
    objects: Array.isArray(payload.objects)
      ? payload.objects.map((row) => normalizeCostControlRow(row, currency)).filter((row) => row.objectId)
      : [],
    warnings: safeWarnings(payload.warnings),
  }
  const freshness = safeFreshness(payload.freshness)
  if (freshness) normalized.freshness = freshness
  return normalized
}

export { COST_CONTROL_PROFILE }
