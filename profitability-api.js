'use strict'

const {
  PROFITABILITY_ACTIONS,
  ProfitabilityAccessError,
  aggregateClientProfitability,
  calculateEntries,
  calculateObjectProfitability,
  createProfitabilityRepository,
  roundRatio,
  serializeBigInts,
} = require('./profitability')

const REQUIRED_RELATIONS = Object.freeze([
  'public.service_object',
  'public.worker_cost_rate',
  'public.object_contract_version',
  'public.periodic_work',
  'public.object_equipment',
  'public.object_financial_entry',
  'public.financial_period',
  'public.profitability_snapshot',
  'public.profitability_audit',
  'public.profitability_permission',
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
  return {
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
    })),
    laborComparison: result.laborComparison,
    laborCostBreakdown: result.laborCostBreakdown,
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
      notCalculableObjects: aggregate.notCalculableObjects,
      objectCount: aggregate.objectCount,
      periodicBreakdown: rows.flatMap((row) => row.periodicBreakdown.map((work) => ({
        ...work,
        objectId: row.objectId,
        objectName: row.name,
      }))),
      profitableObjects: aggregate.profitableObjects,
      unprofitableObjects: aggregate.unprofitableObjects,
    },
    objects: rows,
    trend: aggregateSnapshotTrend(objectTrends, serviceObjects.length, aggregate.currency),
    warnings: rows.flatMap((row) => row.issues.map((issue) => issueWarning(issue, row.name))),
  }
}

async function relationReady(client, relationExists) {
  for (const relation of REQUIRED_RELATIONS) {
    if (!(await relationExists(client, relation))) return false
  }
  return true
}

function mapError(error) {
  if (error instanceof ProfitabilityApiError || error instanceof ProfitabilityAccessError) return error
  if (['OBJECT_SCOPE_MISMATCH', 'OBJECT_NOT_FOUND'].includes(error?.code)) {
    return new ProfitabilityApiError(
      404,
      'PROFITABILITY_OBJECT_NOT_FOUND',
      'Nie znaleziono obiektu w profilu tego klienta.',
    )
  }
  if (Number.isInteger(Number(error?.statusCode)) && text(error?.code)) {
    return new ProfitabilityApiError(
      Number(error.statusCode),
      text(error.code),
      text(error.message) || 'Nie udało się wykonać operacji finansowej.',
      error.details,
    )
  }
  if (error?.code === '42P01') {
    return new ProfitabilityApiError(503, 'PROFITABILITY_SCHEMA_NOT_READY', 'Schemat modułu finansowego nie został jeszcze aktywowany.')
  }
  if (error?.code === '23P01' || error?.code === '23505') {
    return new ProfitabilityApiError(409, 'PROFITABILITY_PERIOD_CONFLICT', 'W tym zakresie istnieje już obowiązujący wpis.')
  }
  if (error?.code === 'INCOMPLETE_DATA') {
    return new ProfitabilityApiError(
      409,
      'PROFITABILITY_PERIOD_INCOMPLETE',
      'Nie można zamknąć okresu z niepełnymi danymi.',
      error.details,
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
      const clientId = identifier(requestUrl.searchParams.get('clientId'), 'clientId', 64)
      const period = monthPeriod(requestUrl.searchParams.get('period'))
      const rawObjectId = text(requestUrl.searchParams.get('objectId'))
      const objectId = rawObjectId ? identifier(rawObjectId, 'objectId', 64) : ''
      const uid = identifier(decodedToken?.uid, 'uid', 128)
      client = await connectDbClient()
      if (!(await relationReady(client, databaseRelationExists))) {
        throw new ProfitabilityApiError(503, 'PROFITABILITY_SCHEMA_NOT_READY', 'Schemat modułu finansowego nie został jeszcze aktywowany.')
      }
      const repository = createRepository(client)

      if (method === 'GET') {
        if (text(requestUrl.searchParams.get('view')).toLowerCase() === 'history') {
          const scopedObjectId = identifier(objectId, 'objectId', 64)
          const history = await repository.listAudit({
            clientId,
            limit: 200,
            objectId: scopedObjectId,
            orgId,
            periodId: period.key,
            uid,
          })
          sendJson(res, 200, { ok: true, data: { history: history.map((row) => ({
            action: row.action,
            actorId: row.actor_uid,
            reason: row.reason,
            changedAt: row.created_at,
            entityType: row.entity_type,
            entityId: row.entity_id,
          })) } })
          return
        }

        const payload = await buildSummary(repository, { orgId, clientId, objectId, period, uid })
        let canEdit = false
        try {
          await repository.assertAccess({ action: PROFITABILITY_ACTIONS.EDIT, objectId, orgId, uid })
          canEdit = true
        } catch {
          canEdit = false
        }
        sendJson(res, 200, { ok: true, data: serializeBigInts({
          ...payload,
          period: period.key,
          capability: { canRead: true, canEdit },
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
      let saved
      const repositoryScope = { orgId, clientId, objectId: scopedObjectId, uid }
      if (action === 'upsert-contract') {
        saved = await repository.createContractVersion({
          ...repositoryScope,
          contract: body.contract,
          reason: text(body?.contract?.reason || body?.reason),
        })
      } else if (action === 'create-cost') {
        saved = await repository.createCost({
          ...repositoryScope,
          cost: body.cost,
          reason: text(body?.cost?.reason || body?.reason),
        })
      } else if (action === 'create-revenue') {
        saved = await repository.createRevenue({
          ...repositoryScope,
          revenue: body.revenue,
          reason: text(body?.revenue?.reason || body?.reason),
        })
      } else if (action === 'upsert-worker-rate') {
        saved = await repository.createWorkerRateVersion({
          ...repositoryScope,
          rate: body.rate,
          reason: text(body?.rate?.reason || body?.reason),
        })
      } else if (action === 'upsert-asset') {
        saved = await repository.createEquipment({
          ...repositoryScope,
          asset: body.asset,
          reason: text(body?.asset?.reason || body?.reason),
        })
      } else if (action === 'close-period') {
        saved = await repository.closePeriod({
          ...repositoryScope,
          period,
          periodId: `${period.key}:${scopedObjectId}`,
          reason: text(body?.reason),
        })
      } else {
        throw new ProfitabilityApiError(400, 'PROFITABILITY_UNKNOWN_ACTION', 'Nieznana operacja finansowa.')
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
  REQUIRED_RELATIONS,
  buildSummary,
  createProfitabilityApi,
  mapError,
  monthPeriod,
}
