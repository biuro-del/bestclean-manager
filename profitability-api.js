'use strict'

const {
  PROFITABILITY_ACTIONS,
  ProfitabilityAccessError,
  aggregateClientProfitability,
  calculateEntries,
  calculateObjectProfitability,
  createProfitabilityRepository,
  evaluateProfitabilityTarget,
  projectHygienePackageMutation,
  projectProfitabilityHistory,
  projectProfitabilityPayload,
  roundRatio,
  serializeBigInts,
} = require('./profitability')
const {
  PROFITABILITY_ACCESS_PROFILE_MODES,
  isProfitabilityAccessProfileOrganizationAllowed,
  resolveProfitabilityAccessProfileOrganizationMode,
  resolveProfitabilityAccessProfileRollout,
} = require('./profitability-access-profile-rollout')
const {
  PROFITABILITY_FINANCIAL_MODEL_MODES,
  resolveProfitabilityFinancialModelOrganizationMode,
  resolveProfitabilityFinancialModelRollout,
} = require('./profitability-financial-model-rollout')

const REQUIRED_DOMAIN_RELATIONS = Object.freeze([
  'public.service_object',
  'public.worker_cost_rate',
  'public.object_contract_version',
  'public.periodic_work',
  'public.periodic_work_zone',
  'public.object_equipment',
  'public.object_financial_entry',
  'public.financial_period',
  'public.profitability_snapshot',
  'public.profitability_audit',
])

const REQUIRED_LEGACY_ACCESS_RELATIONS = Object.freeze([
  'public.profitability_permission',
])

const REQUIRED_FINANCIAL_MODEL_V21_RELATIONS = Object.freeze([
  'public.profitability_command_receipt',
  'public.profitability_financial_model_enforcement',
  'public.object_hygiene_package_version',
  'public.profitability_effective_financial_entry',
  'public.profitability_effective_hygiene_package',
])

// Backward-compatible export for callers that still audit the complete legacy
// footprint. Runtime readiness is evaluated per access mode below.
const REQUIRED_RELATIONS = Object.freeze([
  ...REQUIRED_DOMAIN_RELATIONS,
  ...REQUIRED_LEGACY_ACCESS_RELATIONS,
])

const ISSUE_MESSAGES = Object.freeze({
  MISSING_RATE: 'Brak efektywnej stawki kosztu pracownika.',
  OPEN_START_STOP: 'Sesja START/STOP nie jest zamknięta.',
  OVERLAPPING_RATE: 'Dla pracownika obowiązuje więcej niż jedna stawka.',
  MISSING_CONTRACT_VALUE: 'Brak wartości kontraktu w tym okresie.',
  MISSING_VARIABLE_REVENUE: 'Brak rozliczonego przychodu zmiennego dla tego modelu kontraktu.',
  MISSING_PERIODIC_COST: 'Praca okresowa nie ma kosztu realizacji.',
  MISSING_PERIODIC_REVENUE: 'Praca okresowa nie ma przypisanego przychodu.',
  PERIODIC_LABOR_SESSION_MISSING: 'Nie można powiązać czasu pracy okresowej.',
  EQUIPMENT_CONFIGURATION: 'Sposób rozliczenia sprzętu jest niekompletny.',
  CONFLICTING_DUPLICATE: 'Wykryto sprzeczne wpisy źródłowe.',
  UNMAPPED_LEGACY_ATTENDANCE: 'Starsze zdarzenia obecności nie są jeszcze przypisane do obiektu.',
})

class ProfitabilityApiError extends Error {
  constructor(statusCode, code, message, details) {
    super(message)
    this.name = 'ProfitabilityApiError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

function text(value) {
  return String(value ?? '').trim()
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
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

function restrictCostControlHygienePackage(packageInput) {
  const source = isRecord(packageInput) ? packageInput : {}
  const billingMode = text(source.billingMode || 'IN_CONTRACT').toUpperCase()
  if (billingMode !== 'IN_CONTRACT') {
    throw new ProfitabilityApiError(
      403,
      'PROFITABILITY_HYGIENE_CONTRACT_TERMS_FORBIDDEN',
      'Ten profil moĹĽe zapisywaÄ‡ wyĹ‚Ä…cznie pakiety higieniczne ujÄ™te w kontrakcie.',
    )
  }
  const forbiddenFields = Object.entries(source)
    .filter(([key, value]) => hygieneFinancialField(key) && hasSubmittedValue(value))
    .map(([key]) => key)
  if (forbiddenFields.length) {
    throw new ProfitabilityApiError(
      403,
      'PROFITABILITY_HYGIENE_FINANCIAL_FIELDS_FORBIDDEN',
      'Ten profil nie moĹĽe ustalaÄ‡ ceny, marĹĽy ani przychodu pakietu higienicznego.',
      { fields: forbiddenFields.sort() },
    )
  }
  return Object.fromEntries([
    ...Object.entries(source).filter(([key]) => !hygieneFinancialField(key)),
    ['billingMode', 'IN_CONTRACT'],
  ])
}

function identifier(value, field, maxLength = 180) {
  const normalized = text(value)
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f]/.test(normalized)) {
    throw new ProfitabilityApiError(400, 'PROFITABILITY_VALIDATION_ERROR', `Niepoprawne pole: ${field}.`)
  }
  return normalized
}

function monthPeriod(value) {
  const normalized = text(value)
  const match = normalized.match(/^(\d{4})-(\d{2})$/)
  if (!match) {
    throw new ProfitabilityApiError(400, 'PROFITABILITY_INVALID_PERIOD', 'Okres musi mieć format RRRR-MM.')
  }
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) {
    throw new ProfitabilityApiError(400, 'PROFITABILITY_INVALID_PERIOD', 'Niepoprawny miesiąc okresu.')
  }
  const start = `${match[1]}-${match[2]}-01`
  const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
  return { key: normalized, start, end: next }
}

function issueWarning(issue, objectName) {
  const code = text(issue?.code) || 'INCOMPLETE_DATA'
  return {
    code,
    message: ISSUE_MESSAGES[code] || 'Dane finansowe wymagają uzupełnienia.',
    details: objectName ? `Obiekt: ${objectName}` : '',
    objectId: text(issue?.objectId),
    workerLogin: text(issue?.workerLogin),
  }
}

function sumBigInts(values) {
  return values.reduce((sum, value) => sum + BigInt(value ?? 0), 0n)
}

function sumNullableBigInts(values) {
  if (values.some((value) => value === null || value === undefined)) return null
  return sumBigInts(values)
}

function aggregateLaborComparison(rows) {
  const comparisons = rows.map((row) => row.laborComparison ?? {})
  return {
    actualCostMinor: sumNullableBigInts(comparisons.map((row) => row.actualCostMinor)),
    actualSeconds: sumNullableBigInts(comparisons.map((row) => row.actualSeconds)),
    costDeltaMinor: sumNullableBigInts(comparisons.map((row) => row.costDeltaMinor)),
    plannedCostMinor: sumNullableBigInts(comparisons.map((row) => row.plannedCostMinor)),
    plannedSeconds: sumNullableBigInts(comparisons.map((row) => row.plannedSeconds)),
    secondsDelta: sumNullableBigInts(comparisons.map((row) => row.secondsDelta)),
  }
}

function aggregateLaborCostBreakdown(rows) {
  const aggregate = { byTask: {}, byWorker: {}, byZone: {} }
  for (const row of rows) {
    for (const dimension of Object.keys(aggregate)) {
      for (const [key, amount] of Object.entries(row.laborCostBreakdown?.[dimension] ?? {})) {
        aggregate[dimension][key] = BigInt(aggregate[dimension][key] ?? 0) + BigInt(amount ?? 0)
      }
    }
  }
  return aggregate
}

function aggregateLaborTimeBreakdown(rows) {
  const byWorker = new Map()
  for (const row of rows) {
    for (const entry of row.laborTimeBreakdown ?? []) {
      const workerLogin = text(entry?.workerLogin)
      if (!workerLogin || entry?.durationSeconds === null || entry?.durationSeconds === undefined) continue
      byWorker.set(workerLogin, (byWorker.get(workerLogin) ?? 0n) + BigInt(entry.durationSeconds))
    }
  }
  return [...byWorker.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([workerLogin, durationSeconds]) => ({ durationSeconds, workerLogin }))
}

function laborTimeBreakdown(sessions = []) {
  const byWorker = new Map()
  for (const session of sessions) {
    const workerLogin = text(session?.workerLogin)
    if (!workerLogin || session?.durationSeconds === null || session?.durationSeconds === undefined) continue
    byWorker.set(
      workerLogin,
      (byWorker.get(workerLogin) ?? 0n) + BigInt(session.durationSeconds),
    )
  }
  return [...byWorker.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([workerLogin, durationSeconds]) => ({ durationSeconds, workerLogin }))
}

function aggregateSnapshotTrend(objectTrends, expectedObjectCount, expectedCurrency) {
  const grouped = new Map()
  let window = null
  for (const objectTrend of objectTrends) {
    window ??= objectTrend.window ?? null
    for (const point of objectTrend.points ?? []) {
      const period = text(point.period)
      if (!period) continue
      if (!grouped.has(period)) grouped.set(period, [])
      grouped.get(period).push(point)
    }
  }

  const points = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, rows]) => {
      const currencies = new Set(rows.map((row) => text(row.currency).toUpperCase()).filter(Boolean))
      const sameCurrency = currencies.size === 1 && currencies.has(expectedCurrency)
      const hasFullCoverage = rows.length === expectedObjectCount
      const completeSnapshots = rows.every((row) =>
        text(row.status).toUpperCase() !== 'INCOMPLETE' &&
        row.totalCostMinor !== null && row.totalCostMinor !== undefined &&
        row.marginMinor !== null && row.marginMinor !== undefined,
      )
      const complete = sameCurrency && hasFullCoverage && completeSnapshots
      const revenueMinor = sameCurrency ? sumNullableBigInts(rows.map((row) => row.revenueMinor)) : null
      const totalCostMinor = complete ? sumNullableBigInts(rows.map((row) => row.totalCostMinor)) : null
      const marginMinor = complete ? sumNullableBigInts(rows.map((row) => row.marginMinor)) : null
      const profitabilityBps =
        complete && revenueMinor !== null && revenueMinor !== 0n && marginMinor !== null
          ? roundRatio(marginMinor * 10000n, revenueMinor)
          : null
      const completenessBps = expectedObjectCount > 0
        ? roundRatio(
            sumBigInts(rows.map((row) => row.completenessBps)),
            BigInt(expectedObjectCount),
          )
        : 0n
      return {
        completenessBps,
        completenessPercent: Number(completenessBps) / 100,
        currency: sameCurrency ? expectedCurrency : null,
        expectedObjectCount,
        incomplete: !complete,
        marginMinor,
        objectCount: rows.length,
        period,
        profitabilityBps,
        revenueMinor,
        snapshotIds: rows.map((row) => row.snapshotId),
        status: !complete
          ? 'INCOMPLETE'
          : revenueMinor === 0n
            ? 'NOT_CALCULABLE'
            : marginMinor < 0n
              ? 'NEGATIVE'
              : 'CALCULATED',
        totalCostMinor,
      }
    })

  return {
    emptyReason: points.length
      ? null
      : 'Brak historycznych snapshotów rentowności w wybranym oknie 12 miesięcy.',
    points,
    source: 'PROFITABILITY_SNAPSHOT',
    status: points.length ? 'AVAILABLE' : 'EMPTY',
    window,
  }
}

function mapObjectResult(serviceObject, input, result) {
  const material = calculateEntries({
    entries: input.materialCosts,
    scope: { orgId: result.orgId, objectId: result.objectId },
    currency: result.currency,
    period: result.period,
    label: 'materialCosts',
  }).totalMinor
  const periodic = sumBigInts(result.periodicBreakdown.map((row) => row.directCostMinor))
  const direct = BigInt(result.costBreakdown.directMinor)
  const equipment = BigInt(result.costBreakdown.equipmentMinor)
  const otherDirect = direct - material - periodic
  const labor = result.costBreakdown.laborMinor
  const periodicMetadata = new Map(
    (input.periodicWorks ?? []).map((work) => [String(work.id), work]),
  )
  let target = null
  let operationalOutcome = {}
  if (input.accessProfileVersion === 'v2') {
    target = {
      currency: input.targetCurrency ?? result.currency,
      minimumMarginBps: input.targetMinimumMarginBps ?? input.targetProfitabilityBps ?? null,
      minimumResultMinor: input.targetMinimumResultMinor ?? null,
      policy: input.targetPolicy ?? 'ALL_DEFINED',
      targetId: input.targetId ?? null,
    }
    const evaluated = evaluateProfitabilityTarget({
      resultMinor: result.marginMinor,
      revenueMinor: result.revenueMinor,
      minimumMarginBps: target.minimumMarginBps,
      minimumResultMinor: target.minimumResultMinor,
    })
    operationalOutcome = result.complete
      ? {
          operationalStatus: evaluated.operationalStatus,
          improvementGapMinor: evaluated.improvementGapMinor,
          targetEvaluation: evaluated,
        }
      : {
          operationalStatus: 'INCOMPLETE',
          improvementGapMinor: null,
          targetEvaluation: { ...evaluated, evaluated: false, meetsTarget: null },
        }
  }
  const mapped = {
    clientId: serviceObject.client_id,
    objectId: result.objectId,
    name: serviceObject.name,
    timeZone: serviceObject.timezone,
    currency: result.currency,
    revenueMinor: result.revenueMinor,
    laborCostMinor: labor,
    materialCostMinor: material,
    equipmentCostMinor: equipment,
    periodicCostMinor: periodic,
    otherDirectCostMinor: otherDirect,
    otherCostMinor: equipment + periodic + otherDirect,
    totalCostMinor: result.totalCostMinor,
    knownCostMinor: result.knownCostMinor,
    marginMinor: result.marginMinor,
    profitabilityBps: result.profitabilityBps,
    completenessPercent: Number(result.completenessBps) / 100,
    incomplete: !result.complete,
    status: result.status,
    issues: result.issues,
    costEntries: [...(input.materialCosts ?? []), ...(input.otherCosts ?? [])].map((entry) => ({
      activeFrom: entry.activeFrom ?? null,
      activeTo: entry.activeTo ?? null,
      amountMinor: entry.amountMinor,
      category: entry.category,
      currency: entry.currency,
      date: entry.date ?? null,
      id: entry.id,
      name: entry.name || entry.category,
      recurrence: entry.recurrence,
      source: entry.source ?? null,
      valueBasis: entry.valueBasis ?? null,
      valueKey: entry.valueKey ?? null,
    })),
    hygienePackages: (input.hygienePackages ?? []).map((packageRow) => ({ ...packageRow })),
    laborComparison: result.laborComparison,
    laborCostBreakdown: result.laborCostBreakdown,
    laborTimeBreakdown: laborTimeBreakdown(input.laborSessions),
    planDataQuality: result.planDataQuality,
    periodicBreakdown: result.periodicBreakdown.map((row) => {
      const metadata = periodicMetadata.get(String(row.id)) ?? {}
      return {
        ...row,
        actualMinutes: metadata.actualMinutes ?? null,
        name: metadata.name || row.id,
        plannedMinutes: metadata.plannedMinutes ?? null,
        plannedAt: metadata.plannedOn ?? null,
        performedAt: metadata.executedOn ?? null,
        status: metadata.status ?? null,
        workType: metadata.workType ?? null,
      }
    }),
    costBreakdown: [
      { key: 'labor', label: 'Praca', amountMinor: labor },
      { key: 'materials', label: 'Materiały i środki', amountMinor: material },
      { key: 'equipment', label: 'Sprzęt i maszyny', amountMinor: equipment },
      { key: 'periodic', label: 'Prace okresowe', amountMinor: periodic },
      { key: 'other', label: 'Transport i pozostałe', amountMinor: otherDirect },
    ],
  }
  if (target) mapped.target = target
  return { ...mapped, ...operationalOutcome }
}

function aggregateOperationalOutcome(rows) {
  const applicable = rows.filter((row) => row.operationalStatus)
  if (!applicable.length) return {}
  const statuses = new Set(applicable.map((row) => row.operationalStatus))
  const operationalStatus = statuses.has('INCOMPLETE')
    ? 'INCOMPLETE'
    : statuses.has('NOT_CALCULABLE')
      ? 'NOT_CALCULABLE'
      : statuses.has('CRITICAL')
        ? 'CRITICAL'
        : statuses.has('BELOW_TARGET')
          ? 'BELOW_TARGET'
          : statuses.has('NO_TARGET')
            ? 'NO_TARGET'
            : 'OK'
  const gaps = applicable.map((row) => row.improvementGapMinor)
  const improvementGapMinor = gaps.some((gap) => gap === null || gap === undefined)
    ? null
    : gaps.reduce((sum, gap) => sum + BigInt(gap), 0n)
  return { operationalStatus, improvementGapMinor }
}

async function buildSummary(repository, { orgId, clientId, objectId = '', period, uid }) {
  const availableObjects = await repository.listServiceObjectsForClient({ orgId, clientId, uid })
  const serviceObjects = objectId
    ? availableObjects.filter((serviceObject) => serviceObject.object_id === objectId)
    : availableObjects
  if (objectId && serviceObjects.length === 0) {
    throw new ProfitabilityApiError(
      404,
      'PROFITABILITY_OBJECT_NOT_FOUND',
      'Nie znaleziono obiektu w profilu tego klienta.',
    )
  }
  const rows = []
  const calculations = []
  const objectTrends = []
  for (const serviceObject of serviceObjects) {
    const input = await repository.loadObjectCalculationInput({
      objectId: serviceObject.object_id,
      orgId,
      period,
      uid,
    })
    const result = calculateObjectProfitability(input)
    calculations.push(result)
    rows.push(mapObjectResult(serviceObject, input, result))
    const trend = await repository.listProfitabilityTrend({
      clientId,
      months: 12,
      objectId: serviceObject.object_id,
      orgId,
      period,
      uid,
    })
    objectTrends.push({
      ...trend,
      points: (trend.points ?? []).map((point) => ({
        ...point,
        objectName: serviceObject.name,
      })),
    })
  }

  if (!calculations.length) {
    return {
      currency: 'PLN',
      summary: {
        revenueMinor: '0',
        totalCostMinor: null,
        laborCostMinor: null,
        marginMinor: null,
        profitabilityBps: null,
        completenessPercent: 0,
        incomplete: true,
        objectCount: 0,
        profitableObjects: 0,
        unprofitableObjects: 0,
        notCalculableObjects: 0,
      },
      objects: [],
      trend: {
        emptyReason: 'Klient nie ma obiektów, dla których można odczytać historię rentowności.',
        points: [],
        source: 'PROFITABILITY_SNAPSHOT',
        status: 'EMPTY',
        window: null,
      },
      warnings: [{ code: 'NO_SERVICE_OBJECTS', message: 'Klient nie ma jeszcze obiektów rozliczeniowych.' }],
    }
  }

  const aggregate = aggregateClientProfitability(calculations)
  const category = (key) => sumBigInts(rows.map((row) => row[key]))
  const operationalOutcome = aggregateOperationalOutcome(rows)
  return {
    currency: aggregate.currency,
    summary: {
      currency: aggregate.currency,
      revenueMinor: aggregate.revenueMinor,
      totalCostMinor: aggregate.totalCostMinor,
      knownCostMinor: aggregate.knownCostMinor,
      laborCostMinor: rows.some((row) => row.laborCostMinor === null) ? null : category('laborCostMinor'),
      materialCostMinor: category('materialCostMinor'),
      equipmentCostMinor: category('equipmentCostMinor'),
      periodicCostMinor: category('periodicCostMinor'),
      otherDirectCostMinor: category('otherDirectCostMinor'),
      marginMinor: aggregate.marginMinor,
      profitabilityBps: aggregate.profitabilityBps,
      completenessPercent: Number(aggregate.completenessBps) / 100,
      incomplete: !aggregate.complete,
      laborIncomplete: rows.some((row) => row.laborCostMinor === null),
      costEntries: rows.flatMap((row) => row.costEntries.map((entry) => ({
        ...entry,
        objectId: row.objectId,
        objectName: row.name,
      }))),
      laborComparison: aggregateLaborComparison(rows),
      laborCostBreakdown: aggregateLaborCostBreakdown(rows),
      laborTimeBreakdown: aggregateLaborTimeBreakdown(rows),
      notCalculableObjects: aggregate.notCalculableObjects,
      objectCount: aggregate.objectCount,
      periodicBreakdown: rows.flatMap((row) => row.periodicBreakdown.map((work) => ({
        ...work,
        objectId: row.objectId,
        objectName: row.name,
      }))),
      profitableObjects: aggregate.profitableObjects,
      unprofitableObjects: aggregate.unprofitableObjects,
      ...operationalOutcome,
    },
    objects: rows,
    trend: aggregateSnapshotTrend(objectTrends, serviceObjects.length, aggregate.currency),
    warnings: rows.flatMap((row) => row.issues.map((issue) => issueWarning(issue, row.name))),
  }
}

async function buildPortfolioSummary(repository, { orgId, clientId = '', objectId = '', period, uid }) {
  const availableObjects = clientId
    ? await repository.listServiceObjectsForClient({ orgId, clientId, uid })
    : await repository.listServiceObjectsForOrganization({ orgId, uid })
  const serviceObjects = objectId
    ? availableObjects.filter((serviceObject) => serviceObject.object_id === objectId)
    : availableObjects
  if (objectId && serviceObjects.length === 0) {
    throw new ProfitabilityApiError(
      404,
      'PROFITABILITY_OBJECT_NOT_FOUND',
      'Nie znaleziono obiektu w dostępnym portfelu.',
    )
  }

  const rows = []
  const calculations = []
  const objectTrends = []
  for (const serviceObject of serviceObjects) {
    const calculationClientId = serviceObject.client_id
    const input = await repository.loadObjectCalculationInput({
      objectId: serviceObject.object_id,
      orgId,
      period,
      uid,
    })
    const result = calculateObjectProfitability(input)
    calculations.push(result)
    rows.push(mapObjectResult(serviceObject, input, result))
    const trend = await repository.listProfitabilityTrend({
      clientId: calculationClientId,
      months: 12,
      objectId: serviceObject.object_id,
      orgId,
      period,
      uid,
    })
    objectTrends.push({
      ...trend,
      points: (trend.points ?? []).map((point) => ({
        ...point,
        objectName: serviceObject.name,
      })),
    })
  }

  if (!calculations.length) {
    return {
      currency: 'PLN',
      summary: {
        revenueMinor: '0',
        totalCostMinor: null,
        laborCostMinor: null,
        marginMinor: null,
        profitabilityBps: null,
        completenessPercent: 0,
        incomplete: true,
        objectCount: 0,
        profitableObjects: 0,
        unprofitableObjects: 0,
        notCalculableObjects: 0,
      },
      objects: [],
      trend: {
        emptyReason: 'Organizacja nie ma dostępnych obiektów z historią rentowności.',
        points: [],
        source: 'PROFITABILITY_SNAPSHOT',
        status: 'EMPTY',
        window: null,
      },
      warnings: [{ code: 'NO_SERVICE_OBJECTS', message: 'Brak dostępnych obiektów rozliczeniowych.' }],
    }
  }

  // The portfolio intentionally spans multiple clients. Reuse the thoroughly
  // tested object aggregation rules with one synthetic portfolio scope while
  // keeping the original client ids in every projected object row.
  const aggregate = aggregateClientProfitability(
    calculations.map((calculation) => ({
      ...calculation,
      clientId: '__organization_portfolio__',
    })),
  )
  const category = (key) => sumBigInts(rows.map((row) => row[key]))
  const operationalOutcome = aggregateOperationalOutcome(rows)
  return {
    currency: aggregate.currency,
    summary: {
      currency: aggregate.currency,
      revenueMinor: aggregate.revenueMinor,
      totalCostMinor: aggregate.totalCostMinor,
      knownCostMinor: aggregate.knownCostMinor,
      laborCostMinor: rows.some((row) => row.laborCostMinor === null) ? null : category('laborCostMinor'),
      materialCostMinor: category('materialCostMinor'),
      equipmentCostMinor: category('equipmentCostMinor'),
      periodicCostMinor: category('periodicCostMinor'),
      otherDirectCostMinor: category('otherDirectCostMinor'),
      marginMinor: aggregate.marginMinor,
      profitabilityBps: aggregate.profitabilityBps,
      completenessPercent: Number(aggregate.completenessBps) / 100,
      incomplete: !aggregate.complete,
      laborIncomplete: rows.some((row) => row.laborCostMinor === null),
      costEntries: rows.flatMap((row) => row.costEntries.map((entry) => ({
        ...entry,
        objectId: row.objectId,
        objectName: row.name,
      }))),
      laborComparison: aggregateLaborComparison(rows),
      laborCostBreakdown: aggregateLaborCostBreakdown(rows),
      laborTimeBreakdown: aggregateLaborTimeBreakdown(rows),
      notCalculableObjects: aggregate.notCalculableObjects,
      objectCount: aggregate.objectCount,
      periodicBreakdown: rows.flatMap((row) => row.periodicBreakdown.map((work) => ({
        ...work,
        objectId: row.objectId,
        objectName: row.name,
      }))),
      profitableObjects: aggregate.profitableObjects,
      unprofitableObjects: aggregate.unprofitableObjects,
      ...operationalOutcome,
    },
    objects: rows,
    trend: aggregateSnapshotTrend(objectTrends, serviceObjects.length, aggregate.currency),
    warnings: rows.flatMap((row) => row.issues.map((issue) => issueWarning(issue, row.name))),
  }
}

async function relationsReady(client, relationExists, relations) {
  for (const relation of relations) {
    if (!(await relationExists(client, relation))) return false
  }
  return true
}

function mapError(error) {
  if (error instanceof ProfitabilityApiError) return error
  if (error instanceof ProfitabilityAccessError) {
    return new ProfitabilityApiError(error.statusCode, error.code, error.message)
  }
  if (['OBJECT_SCOPE_MISMATCH', 'OBJECT_NOT_FOUND'].includes(error?.code)) {
    return new ProfitabilityApiError(
      404,
      'PROFITABILITY_OBJECT_NOT_FOUND',
      'Nie znaleziono obiektu w profilu tego klienta.',
    )
  }
  if (error?.code === 'PROFITABILITY_ACCESS_PROFILE_SCHEMA_NOT_READY') {
    return new ProfitabilityApiError(
      503,
      error.code,
      'Bezpieczny profil dostępu do rentowności nie jest jeszcze gotowy.',
      error.details,
    )
  }
  if (Number.isInteger(Number(error?.statusCode)) && text(error?.code)) {
    return new ProfitabilityApiError(
      Number(error.statusCode),
      text(error.code),
      text(error.message) || 'Nie udało się wykonać operacji finansowej.',
    )
  }
  if (error?.code === '42P01') {
    return new ProfitabilityApiError(503, 'PROFITABILITY_SCHEMA_NOT_READY', 'Schemat modułu finansowego nie został jeszcze aktywowany.')
  }
  if (error?.code === '23P01' || error?.code === '23505') {
    return new ProfitabilityApiError(409, 'PROFITABILITY_PERIOD_CONFLICT', 'W tym zakresie istnieje już obowiązujący wpis.')
  }
  if (error?.code === 'INCOMPLETE_DATA') {
    const issueCodes = (Array.isArray(error.details) ? error.details : [])
      .map((entry) => text(entry?.code))
      .filter(Boolean)
    return new ProfitabilityApiError(
      409,
      'PROFITABILITY_PERIOD_INCOMPLETE',
      'Nie można zamknąć okresu z niepełnymi danymi.',
      issueCodes.length ? { issueCodes: [...new Set(issueCodes)] } : undefined,
    )
  }
  if (error?.code === '23514') {
    return new ProfitabilityApiError(
      400,
      'PROFITABILITY_VALIDATION_ERROR',
      'Dane finansowe nie spełniają wymagań wybranego sposobu rozliczenia.',
    )
  }
  if (error?.code === '23503') {
    return new ProfitabilityApiError(
      400,
      'PROFITABILITY_REFERENCE_NOT_FOUND',
      'Wskazany pracownik, obiekt, strefa lub rekord źródłowy nie istnieje w tym zakresie.',
    )
  }
  if (error?.code === '23502' || error?.code === '22001') {
    return new ProfitabilityApiError(
      400,
      'PROFITABILITY_VALIDATION_ERROR',
      'Brakuje wymaganej wartości albo przekracza ona dozwoloną długość.',
    )
  }
  if ([
    'CLOSED_PERIOD_IMMUTABLE',
    'CONTRACT_CORRECTION_REASON_REQUIRED',
    'FINANCIAL_PERIOD_SCOPE_MISMATCH',
    'WORKER_RATE_CORRECTION_REASON_REQUIRED',
  ].includes(error?.code)) {
    return new ProfitabilityApiError(409, error.code, error.message, error.details)
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    return new ProfitabilityApiError(400, 'PROFITABILITY_VALIDATION_ERROR', error.message)
  }
  return new ProfitabilityApiError(500, 'PROFITABILITY_API_ERROR', 'Nie udało się wykonać operacji finansowej.')
}

function createProfitabilityApi(dependencies = {}) {
  const {
    connectDbClient,
    createRepository = createProfitabilityRepository,
    databaseRelationExists,
    parseBearerToken,
    readJsonBody,
    sendApiError,
    sendJson,
    verifyFirebaseIdToken,
  } = dependencies
  const accessProfileRollout = resolveProfitabilityAccessProfileRollout(
    dependencies.environment ?? process.env,
  )
  const financialModelRollout = resolveProfitabilityFinancialModelRollout(
    dependencies.environment ?? process.env,
  )
  if (![connectDbClient, createRepository, databaseRelationExists, parseBearerToken, readJsonBody, sendApiError, sendJson, verifyFirebaseIdToken].every((fn) => typeof fn === 'function')) {
    throw new TypeError('Profitability API dependencies are incomplete.')
  }

  async function handle(req, res, requestUrl) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    const method = text(req.method).toUpperCase()
    if (!['GET', 'POST'].includes(method)) {
      sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolone metody to GET i POST.')
      return
    }

    const token = parseBearerToken(req)
    if (!token) {
      sendApiError(res, 401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
      return
    }

    let decodedToken
    try {
      decodedToken = await verifyFirebaseIdToken(token)
    } catch {
      sendApiError(res, 401, 'UNAUTHENTICATED', 'Sesja wygasła. Zaloguj się ponownie.')
      return
    }

    let client
    try {
      const orgId = identifier(requestUrl.searchParams.get('orgId'), 'orgId', 64)
      if (!isProfitabilityAccessProfileOrganizationAllowed(accessProfileRollout, orgId)) {
        throw new ProfitabilityApiError(
          404,
          'PROFITABILITY_NOT_ENABLED',
          'Moduł rentowności nie jest dostępny dla tej organizacji.',
        )
      }
      const requestedView = text(requestUrl.searchParams.get('view')).toLowerCase()
      const portfolioRequest = method === 'GET' && requestedView === 'portfolio'
      const rawClientId = text(requestUrl.searchParams.get('clientId'))
      const clientId = rawClientId
        ? identifier(rawClientId, 'clientId', 64)
        : portfolioRequest
          ? ''
          : identifier(rawClientId, 'clientId', 64)
      const period = monthPeriod(requestUrl.searchParams.get('period'))
      const rawObjectId = text(requestUrl.searchParams.get('objectId'))
      const objectId = rawObjectId ? identifier(rawObjectId, 'objectId', 64) : ''
      const uid = identifier(decodedToken?.uid, 'uid', 128)
      client = await connectDbClient()
      if (!(await relationsReady(client, databaseRelationExists, REQUIRED_DOMAIN_RELATIONS))) {
        throw new ProfitabilityApiError(503, 'PROFITABILITY_SCHEMA_NOT_READY', 'Schemat modułu finansowego nie został jeszcze aktywowany.')
      }
      const accessProfileMode = await resolveProfitabilityAccessProfileOrganizationMode({
        client,
        organizationId: orgId,
        policy: accessProfileRollout,
        relationExists: databaseRelationExists,
      })
      if (accessProfileMode.mode === PROFITABILITY_ACCESS_PROFILE_MODES.BLOCKED) {
        throw new ProfitabilityApiError(
          503,
          'PROFITABILITY_ACCESS_PROFILE_NOT_READY',
          'Bezpieczny profil dostępu do rentowności nie jest jeszcze gotowy.',
        )
      }
      const accessProfileV2Enabled = accessProfileMode.mode === PROFITABILITY_ACCESS_PROFILE_MODES.V2
      if (
        !accessProfileV2Enabled &&
        !(await relationsReady(client, databaseRelationExists, REQUIRED_LEGACY_ACCESS_RELATIONS))
      ) {
        throw new ProfitabilityApiError(
          503,
          'PROFITABILITY_SCHEMA_NOT_READY',
          'Schemat modułu finansowego nie został jeszcze aktywowany.',
        )
      }
      const financialModelMode = await resolveProfitabilityFinancialModelOrganizationMode({
        client,
        organizationId: orgId,
        policy: financialModelRollout,
        relationExists: databaseRelationExists,
      })
      if (financialModelMode.mode === PROFITABILITY_FINANCIAL_MODEL_MODES.BLOCKED) {
        throw new ProfitabilityApiError(
          503,
          'PROFITABILITY_FINANCIAL_MODEL_NOT_READY',
          'Bezpieczny model danych rentowności nie jest jeszcze gotowy.',
        )
      }
      const financialModelV21Enabled =
        financialModelMode.mode === PROFITABILITY_FINANCIAL_MODEL_MODES.V21
      if (
        financialModelV21Enabled &&
        !(await relationsReady(
          client,
          databaseRelationExists,
          REQUIRED_FINANCIAL_MODEL_V21_RELATIONS,
        ))
      ) {
        throw new ProfitabilityApiError(
          503,
          'PROFITABILITY_FINANCIAL_MODEL_NOT_READY',
          'Schemat modelu finansowego V2.1 nie jest kompletny.',
        )
      }
      const repository = createRepository(client, {
        accessProfileV2: { enabled: accessProfileV2Enabled },
        financialModelV21: { enabled: financialModelV21Enabled },
      })

      if (method === 'GET') {
        if (requestedView === 'history') {
          const scopedObjectId = identifier(objectId, 'objectId', 64)
          const history = await repository.listAudit({
            clientId,
            limit: 200,
            objectId: scopedObjectId,
            orgId,
            periodId: period.key,
            uid,
          })
          const projectedHistory = accessProfileV2Enabled
            ? projectProfitabilityHistory(
                history,
                (await repository.resolveAccessProfileV2({ orgId, uid })).financeProfile,
                { objectId: scopedObjectId },
              )
            : history.map((row) => ({
                action: row.action,
                actorId: row.actor_uid,
                reason: row.reason,
                changedAt: row.created_at,
                entityType: row.entity_type,
                entityId: row.entity_id,
              }))
          sendJson(res, 200, { ok: true, data: { history: projectedHistory } })
          return
        }

        const payload = portfolioRequest
          ? await buildPortfolioSummary(repository, { orgId, clientId, objectId, period, uid })
          : await buildSummary(repository, { orgId, clientId, objectId, period, uid })
        let responsePayload = payload
        let capability
        if (accessProfileV2Enabled) {
          const accessProfile = await repository.resolveAccessProfileV2({ orgId, uid })
          responsePayload = projectProfitabilityPayload(payload, accessProfile.financeProfile)
          capability = {
            accessVersion: 'v2',
            canRead: true,
            canEdit: accessProfile.capabilities.editContractTerms === true
              && accessProfile.capabilities.editProfitabilityTargets === true
              && accessProfile.capabilities.editWorkerRates === true,
            canEditOperationalCosts: accessProfile.capabilities.editOperationalCosts === true,
            financeProfile: accessProfile.financeProfile,
            financialModelVersion: financialModelV21Enabled ? 'v2.1' : 'foundation-v2',
            objectScope: accessProfile.objectScope,
          }
        } else {
          let canEdit = false
          try {
            await repository.assertAccess({ action: PROFITABILITY_ACTIONS.EDIT, objectId, orgId, uid })
            canEdit = true
          } catch {
            canEdit = false
          }
          capability = {
            canRead: true,
            canEdit,
            financialModelVersion: financialModelV21Enabled ? 'v2.1' : 'foundation-v2',
          }
        }
        sendJson(res, 200, { ok: true, data: serializeBigInts({
          ...responsePayload,
          period: period.key,
          capability,
        }) })
        return
      }

      const body = await readJsonBody(req)
      for (const field of ['orgId', 'clientId', 'objectId', 'period']) {
        const bodyValue = text(body?.[field])
        const queryValue = field === 'orgId' ? orgId : field === 'clientId' ? clientId : field === 'objectId' ? objectId : period.key
        if (bodyValue && bodyValue !== queryValue) {
          throw new ProfitabilityApiError(403, 'PROFITABILITY_SCOPE_MISMATCH', 'Zakres żądania nie zgadza się z adresem API.')
        }
      }
      const scopedObjectId = identifier(objectId || body?.objectId, 'objectId', 64)
      const action = text(body?.action).toLowerCase()
      const commandId = text(body?.commandId)
      let saved
      const repositoryScope = { orgId, clientId, objectId: scopedObjectId, uid }
      const mutationAccessProfile = accessProfileV2Enabled
        ? await repository.resolveAccessProfileV2({ orgId, uid })
        : null
      if (action === 'upsert-contract') {
        saved = await repository.createContractVersion({
          ...repositoryScope,
          commandId,
          contract: body.contract,
          reason: text(body?.contract?.reason || body?.reason),
        })
      } else if (action === 'create-cost') {
        saved = await repository.createCost({
          ...repositoryScope,
          commandId,
          cost: body.cost,
          reason: text(body?.cost?.reason || body?.reason),
        })
      } else if (action === 'create-revenue') {
        saved = await repository.createRevenue({
          ...repositoryScope,
          commandId,
          revenue: body.revenue,
          reason: text(body?.revenue?.reason || body?.reason),
        })
      } else if (action === 'upsert-worker-rate') {
        saved = await repository.createWorkerRateVersion({
          ...repositoryScope,
          commandId,
          rate: body.rate,
          reason: text(body?.rate?.reason || body?.reason),
        })
      } else if (action === 'upsert-asset') {
        saved = await repository.createEquipment({
          ...repositoryScope,
          commandId,
          asset: body.asset,
          reason: text(body?.asset?.reason || body?.reason),
        })
      } else if (action === 'save-hygiene-package') {
        const packageInput = mutationAccessProfile?.financeProfile === 'COST_CONTROL'
          ? restrictCostControlHygienePackage(body.package)
          : body.package
        saved = await repository.saveHygienePackage({
          ...repositoryScope,
          commandId,
          package: packageInput,
          reason: text(body?.package?.reason || body?.reason),
        })
      } else if (action === 'archive-hygiene-package') {
        saved = await repository.archiveHygienePackage({
          ...repositoryScope,
          commandId,
          packageVersionId: text(body?.packageVersionId),
          reason: text(body?.reason),
        })
      } else if (action === 'close-period') {
        saved = await repository.closePeriod({
          ...repositoryScope,
          commandId,
          period,
          periodId: `${period.key}:${scopedObjectId}`,
          reason: text(body?.reason),
        })
      } else {
        throw new ProfitabilityApiError(400, 'PROFITABILITY_UNKNOWN_ACTION', 'Nieznana operacja finansowa.')
      }
      if (action === 'save-hygiene-package' || action === 'archive-hygiene-package') {
        saved = projectHygienePackageMutation(
          saved,
          mutationAccessProfile?.financeProfile ?? 'OWNER_FULL',
        )
      }
      sendJson(res, 200, { ok: true, data: serializeBigInts({ saved }) })
    } catch (error) {
      const mapped = mapError(error)
      sendApiError(res, Number(mapped.statusCode) || 500, mapped.code, mapped.message, mapped.details)
    } finally {
      client?.release?.()
    }
  }

  return { handle }
}

module.exports = {
  aggregateSnapshotTrend,
  ProfitabilityApiError,
  REQUIRED_DOMAIN_RELATIONS,
  REQUIRED_FINANCIAL_MODEL_V21_RELATIONS,
  REQUIRED_LEGACY_ACCESS_RELATIONS,
  REQUIRED_RELATIONS,
  buildPortfolioSummary,
  buildSummary,
  createProfitabilityApi,
  mapError,
  monthPeriod,
  restrictCostControlHygienePackage,
}
