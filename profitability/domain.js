'use strict'

const ISO_4217_CODES = new Set(
  (
    'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAF XAG XAU XBA XBB XBC XBD XCD XCG XDR XOF XPD XPF XPT XSU XTS XUA XXX YER ZAR ZMW ZWL'
  ).split(' '),
)

const CALCULATION_STATUS = Object.freeze({
  ABOVE_TARGET: 'ABOVE_TARGET',
  BELOW_TARGET: 'BELOW_TARGET',
  CALCULATED: 'CALCULATED',
  INCOMPLETE: 'INCOMPLETE',
  NEGATIVE: 'NEGATIVE',
  NOT_CALCULABLE: 'NOT_CALCULABLE',
})

const ISSUE_CODE = Object.freeze({
  CONFLICTING_DUPLICATE: 'CONFLICTING_DUPLICATE',
  EQUIPMENT_CONFIGURATION: 'EQUIPMENT_CONFIGURATION',
  MISSING_CONTRACT_VALUE: 'MISSING_CONTRACT_VALUE',
  MISSING_PERIODIC_COST: 'MISSING_PERIODIC_COST',
  MISSING_PERIODIC_REVENUE: 'MISSING_PERIODIC_REVENUE',
  MISSING_RATE: 'MISSING_RATE',
  MISSING_VARIABLE_REVENUE: 'MISSING_VARIABLE_REVENUE',
  OPEN_START_STOP: 'OPEN_START_STOP',
  OVERLAPPING_RATE: 'OVERLAPPING_RATE',
  PERIODIC_LABOR_SESSION_MISSING: 'PERIODIC_LABOR_SESSION_MISSING',
  UNMAPPED_LEGACY_ATTENDANCE: 'UNMAPPED_LEGACY_ATTENDANCE',
})

function requiredText(value, fieldName) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new TypeError(`${fieldName} is required`)
  return normalized
}

function normalizeCurrency(value, fieldName = 'currency') {
  const normalized = requiredText(value, fieldName).toUpperCase()
  if (!ISO_4217_CODES.has(normalized)) {
    throw new RangeError(`${fieldName} must be a valid ISO 4217 code`)
  }
  return normalized
}

function minorUnits(value, fieldName = 'amountMinor') {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`${fieldName} must be a safe integer or decimal integer string`)
    }
    return BigInt(value)
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return BigInt(value.trim())
  throw new TypeError(`${fieldName} must contain integer minor units`)
}

function nonNegativeMinorUnits(value, fieldName = 'amountMinor') {
  const parsed = minorUnits(value, fieldName)
  if (parsed < 0n) throw new RangeError(`${fieldName} cannot be negative`)
  return parsed
}

function dateOnly(value, fieldName) {
  const normalized = requiredText(value, fieldName)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new TypeError(`${fieldName} must use YYYY-MM-DD`)
  }
  const [year, month, day] = normalized.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new RangeError(`${fieldName} is not a valid calendar date`)
  }
  return normalized
}

function normalizePeriod(period) {
  const start = dateOnly(period?.start, 'period.start')
  const end = dateOnly(period?.end, 'period.end')
  if (end <= start) throw new RangeError('period.end must be after period.start')
  return { start, end }
}

function monthKey(dateYmd) {
  return dateOnly(dateYmd, 'date').slice(0, 7)
}

function nextMonthStart(dateYmd) {
  const normalized = dateOnly(dateYmd, 'date')
  const [year, month] = normalized.split('-').map(Number)
  const next = new Date(Date.UTC(year, month, 1))
  return next.toISOString().slice(0, 10)
}

function monthStartsInPeriod(period) {
  const normalized = normalizePeriod(period)
  let cursor = `${normalized.start.slice(0, 7)}-01`
  const months = []
  while (cursor < normalized.end) {
    const following = nextMonthStart(cursor)
    if (following > normalized.start && cursor < normalized.end) months.push(cursor)
    cursor = following
  }
  return months
}

function rangesOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  const aEnd = firstEnd || '9999-12-31'
  const bEnd = secondEnd || '9999-12-31'
  return firstStart < bEnd && secondStart < aEnd
}

function assertScope(record, expected, fieldName = 'record') {
  const orgId = requiredText(record?.orgId, `${fieldName}.orgId`)
  const objectId = requiredText(record?.objectId, `${fieldName}.objectId`)
  if (orgId !== expected.orgId || objectId !== expected.objectId) {
    const error = new Error(`${fieldName} is outside the requested organization/object scope`)
    error.code = 'SCOPE_MISMATCH'
    throw error
  }
  return record
}

function roundRatio(numerator, denominator) {
  if (denominator === 0n) throw new RangeError('division by zero')
  const negative = (numerator < 0n) !== (denominator < 0n)
  const absoluteNumerator = numerator < 0n ? -numerator : numerator
  const absoluteDenominator = denominator < 0n ? -denominator : denominator
  const rounded = (absoluteNumerator + absoluteDenominator / 2n) / absoluteDenominator
  return negative ? -rounded : rounded
}

function compareDuplicatePayload(first, second, fields) {
  return fields.every((field) => {
    const firstValue = field.endsWith('Minor') ? minorUnits(first[field] ?? 0) : first[field] ?? null
    const secondValue = field.endsWith('Minor') ? minorUnits(second[field] ?? 0) : second[field] ?? null
    return firstValue === secondValue
  })
}

function dedupeById(rows, payloadFields, label) {
  const seen = new Map()
  const deduped = []
  for (const [index, row] of rows.entries()) {
    const id = requiredText(row?.id, `${label}[${index}].id`)
    const previous = seen.get(id)
    if (!previous) {
      seen.set(id, row)
      deduped.push(row)
      continue
    }
    if (!compareDuplicatePayload(previous, row, payloadFields)) {
      const error = new Error(`Conflicting duplicate ${label} id: ${id}`)
      error.code = ISSUE_CODE.CONFLICTING_DUPLICATE
      throw error
    }
  }
  return deduped
}

function activeOnDate(row, dateYmd, startField = 'effectiveFrom', endField = 'effectiveTo') {
  const start = dateOnly(row[startField], startField)
  const end = row[endField] ? dateOnly(row[endField], endField) : null
  return start <= dateYmd && (!end || dateYmd < end)
}

function validateRatePeriods(rates, scope, currency) {
  const normalized = rates.map((rate, index) => {
    assertScope(rate, scope, `workerRates[${index}]`)
    return {
      ...rate,
      currency: normalizeCurrency(rate.currency),
      effectiveFrom: dateOnly(rate.effectiveFrom, `workerRates[${index}].effectiveFrom`),
      effectiveTo: rate.effectiveTo
        ? dateOnly(rate.effectiveTo, `workerRates[${index}].effectiveTo`)
        : null,
      hourlyCostMinor: nonNegativeMinorUnits(
        rate.hourlyCostMinor,
        `workerRates[${index}].hourlyCostMinor`,
      ),
      workerLogin: requiredText(rate.workerLogin, `workerRates[${index}].workerLogin`),
    }
  })

  const overlapKeys = new Set()
  for (let firstIndex = 0; firstIndex < normalized.length; firstIndex += 1) {
    const first = normalized[firstIndex]
    if (first.currency !== currency) continue
    for (let secondIndex = firstIndex + 1; secondIndex < normalized.length; secondIndex += 1) {
      const second = normalized[secondIndex]
      if (second.currency !== currency || second.workerLogin !== first.workerLogin) continue
      if (
        rangesOverlap(
          first.effectiveFrom,
          first.effectiveTo,
          second.effectiveFrom,
          second.effectiveTo,
        )
      ) {
        overlapKeys.add(first.workerLogin)
      }
    }
  }
  return { rates: normalized, overlapKeys }
}

function sessionWorkDate(session, index) {
  if (session.workDate) return dateOnly(session.workDate, `laborSessions[${index}].workDate`)
  const timestamp = requiredText(session.startAt, `laborSessions[${index}].startAt`)
  const match = timestamp.match(/^(\d{4}-\d{2}-\d{2})T/)
  if (!match) throw new TypeError(`laborSessions[${index}].startAt must be an ISO timestamp`)
  return dateOnly(match[1], `laborSessions[${index}].startAt`)
}

function calculateLaborCost({ orgId, objectId, currency, sessions = [], rates = [] }) {
  const scope = {
    orgId: requiredText(orgId, 'orgId'),
    objectId: requiredText(objectId, 'objectId'),
  }
  const normalizedCurrency = normalizeCurrency(currency)
  const uniqueSessions = dedupeById(
    sessions,
    ['workerLogin', 'startAt', 'endAt', 'durationSeconds'],
    'laborSessions',
  )
  const rateValidation = validateRatePeriods(rates, scope, normalizedCurrency)
  const issues = []
  const sessionCosts = new Map()
  let knownCostMinor = 0n
  let actualSeconds = 0n
  let passedChecks = 0
  let totalChecks = 0
  const byWorker = new Map()
  const byZone = new Map()
  const byTask = new Map()

  function addBreakdown(target, key, amount) {
    if (!key) return
    target.set(key, (target.get(key) ?? 0n) + amount)
  }

  for (const workerLogin of rateValidation.overlapKeys) {
    issues.push({ code: ISSUE_CODE.OVERLAPPING_RATE, workerLogin })
  }

  for (const [index, session] of uniqueSessions.entries()) {
    assertScope(session, scope, `laborSessions[${index}]`)
    const sessionId = requiredText(session.id, `laborSessions[${index}].id`)
    const workerLogin = requiredText(session.workerLogin, `laborSessions[${index}].workerLogin`)
    totalChecks += 2

    if (!session.endAt) {
      issues.push({ code: ISSUE_CODE.OPEN_START_STOP, sessionId, workerLogin })
      sessionCosts.set(sessionId, null)
      continue
    }
    passedChecks += 1

    const startAt = new Date(requiredText(session.startAt, `laborSessions[${index}].startAt`))
    const endAt = new Date(requiredText(session.endAt, `laborSessions[${index}].endAt`))
    if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(endAt.getTime()) || endAt <= startAt) {
      throw new RangeError(`laborSessions[${index}] has an invalid START/STOP interval`)
    }
    const durationSeconds = session.durationSeconds == null
      ? BigInt(Math.round((endAt.getTime() - startAt.getTime()) / 1000))
      : nonNegativeMinorUnits(session.durationSeconds, `laborSessions[${index}].durationSeconds`)
    actualSeconds += durationSeconds

    const workDate = sessionWorkDate(session, index)
    const matchingRates = rateValidation.rates.filter(
      (rate) =>
        rate.currency === normalizedCurrency &&
        rate.workerLogin === workerLogin &&
        activeOnDate(rate, workDate),
    )
    if (matchingRates.length !== 1) {
      issues.push({
        code: matchingRates.length > 1 ? ISSUE_CODE.OVERLAPPING_RATE : ISSUE_CODE.MISSING_RATE,
        sessionId,
        workerLogin,
        workDate,
      })
      sessionCosts.set(sessionId, null)
      continue
    }

    passedChecks += 1
    const costMinor = roundRatio(matchingRates[0].hourlyCostMinor * durationSeconds, 3600n)
    knownCostMinor += costMinor
    sessionCosts.set(sessionId, costMinor)
    addBreakdown(byWorker, workerLogin, costMinor)
    addBreakdown(byZone, String(session.zoneId ?? '').trim(), costMinor)
    addBreakdown(byTask, String(session.taskId ?? '').trim(), costMinor)
  }

  return {
    actualCostMinor: issues.length ? null : knownCostMinor,
    actualSeconds,
    breakdown: {
      byTask: Object.fromEntries(byTask),
      byWorker: Object.fromEntries(byWorker),
      byZone: Object.fromEntries(byZone),
    },
    complete: issues.length === 0,
    issues,
    knownCostMinor,
    passedChecks,
    sessionCosts,
    totalChecks,
  }
}

function entryAppliesInPeriod(entry, period) {
  const recurrence = String(entry.recurrence ?? 'ONE_TIME').trim().toUpperCase()
  if (recurrence === 'MONTHLY') {
    const activeFrom = dateOnly(entry.activeFrom ?? entry.date, 'entry.activeFrom')
    const activeTo = entry.activeTo ? dateOnly(entry.activeTo, 'entry.activeTo') : null
    return monthStartsInPeriod(period).filter((monthStart) => {
      const following = nextMonthStart(monthStart)
      return activeFrom < following && (!activeTo || monthStart < activeTo)
    }).length
  }
  if (!['ONE_TIME', 'ACTUAL_USAGE'].includes(recurrence)) {
    throw new RangeError(`Unsupported recurrence: ${recurrence}`)
  }
  const occurredOn = dateOnly(entry.date, 'entry.date')
  return occurredOn >= period.start && occurredOn < period.end ? 1 : 0
}

function calculateEntries({ entries = [], scope, currency, period, label = 'entries' }) {
  const normalizedPeriod = normalizePeriod(period)
  const uniqueEntries = dedupeById(
    entries,
    ['amountMinor', 'currency', 'recurrence', 'date', 'activeFrom', 'activeTo'],
    label,
  )
  let totalMinor = 0n
  const lines = []
  for (const [index, entry] of uniqueEntries.entries()) {
    assertScope(entry, scope, `${label}[${index}]`)
    const entryCurrency = normalizeCurrency(entry.currency)
    if (entryCurrency !== currency) {
      throw new RangeError(`${label}[${index}] currency differs from calculation currency`)
    }
    const occurrences = entryAppliesInPeriod(entry, normalizedPeriod)
    const amountMinor = nonNegativeMinorUnits(entry.amountMinor, `${label}[${index}].amountMinor`)
    const recognizedMinor = amountMinor * BigInt(occurrences)
    totalMinor += recognizedMinor
    lines.push({
      id: requiredText(entry.id, `${label}[${index}].id`),
      category: String(entry.category ?? '').trim() || 'OTHER',
      occurrences,
      recognizedMinor,
    })
  }
  return { lines, totalMinor }
}

function monthDistance(startMonth, currentMonth) {
  const [startYear, startNumber] = monthKey(startMonth).split('-').map(Number)
  const [currentYear, currentNumber] = monthKey(currentMonth).split('-').map(Number)
  return (currentYear - startYear) * 12 + currentNumber - startNumber
}

function calculateEquipmentCostForPeriod({ equipment = [], scope, currency, period }) {
  const normalizedPeriod = normalizePeriod(period)
  const uniqueEquipment = dedupeById(
    equipment,
    [
      'financing',
      'recognitionMethod',
      'purchaseValueMinor',
      'depreciationMonths',
      'monthlyInstallmentMinor',
      'currency',
    ],
    'equipment',
  )
  const issues = []
  const lines = []
  let knownCostMinor = 0n
  let passedChecks = 0
  let totalChecks = 0

  for (const [index, asset] of uniqueEquipment.entries()) {
    assertScope(asset, scope, `equipment[${index}]`)
    totalChecks += 1
    const id = requiredText(asset.id, `equipment[${index}].id`)
    const assetCurrency = normalizeCurrency(asset.currency)
    const financing = String(asset.financing ?? '').trim().toUpperCase()
    const recognitionMethod = String(asset.recognitionMethod ?? '').trim().toUpperCase()
    const startedOn = dateOnly(asset.startedOn, `equipment[${index}].startedOn`)
    const endedOn = asset.endedOn ? dateOnly(asset.endedOn, `equipment[${index}].endedOn`) : null
    let recognizedMinor = 0n
    let valid = true

    if (financing === 'PURCHASE' && recognitionMethod === 'IMMEDIATE') {
      const purchaseValue = nonNegativeMinorUnits(
        asset.purchaseValueMinor,
        `equipment[${index}].purchaseValueMinor`,
      )
      if (startedOn >= normalizedPeriod.start && startedOn < normalizedPeriod.end) {
        recognizedMinor = purchaseValue
      }
    } else if (financing === 'PURCHASE' && recognitionMethod === 'DEPRECIATION') {
      const purchaseValue = nonNegativeMinorUnits(
        asset.purchaseValueMinor,
        `equipment[${index}].purchaseValueMinor`,
      )
      const months = Number(asset.depreciationMonths)
      if (!Number.isInteger(months) || months <= 0) {
        valid = false
      } else {
        const base = purchaseValue / BigInt(months)
        const remainder = purchaseValue % BigInt(months)
        for (const monthStart of monthStartsInPeriod(normalizedPeriod)) {
          const offset = monthDistance(startedOn, monthStart)
          if (offset < 0 || offset >= months || (endedOn && monthStart >= endedOn)) continue
          recognizedMinor += base + (BigInt(offset) < remainder ? 1n : 0n)
        }
      }
    } else if (
      ['LEASE', 'RENTAL'].includes(financing) &&
      recognitionMethod === 'INSTALLMENT'
    ) {
      const installment = nonNegativeMinorUnits(
        asset.monthlyInstallmentMinor,
        `equipment[${index}].monthlyInstallmentMinor`,
      )
      for (const monthStart of monthStartsInPeriod(normalizedPeriod)) {
        const following = nextMonthStart(monthStart)
        if (startedOn < following && (!endedOn || monthStart < endedOn)) recognizedMinor += installment
      }
    } else {
      valid = false
    }

    if (assetCurrency !== currency) {
      throw new RangeError(`equipment[${index}] currency differs from calculation currency`)
    }
    if (!valid) {
      issues.push({ code: ISSUE_CODE.EQUIPMENT_CONFIGURATION, equipmentId: id })
      lines.push({ id, recognizedMinor: null })
      continue
    }
    passedChecks += 1
    knownCostMinor += recognizedMinor
    lines.push({ id, recognizedMinor })
  }

  return {
    complete: issues.length === 0,
    issues,
    knownCostMinor,
    lines,
    passedChecks,
    totalChecks,
  }
}

function mergeEntryGroups(groups) {
  return groups.flatMap((group) => group ?? [])
}

function calculateObjectProfitability(input) {
  const scope = {
    orgId: requiredText(input?.orgId, 'orgId'),
    objectId: requiredText(input?.objectId, 'objectId'),
  }
  const clientId = requiredText(input?.clientId, 'clientId')
  const currency = normalizeCurrency(input?.currency ?? 'PLN')
  const period = normalizePeriod(input?.period)
  const periodicWorks = Array.isArray(input?.periodicWorks) ? input.periodicWorks : []

  const contractEntries = input?.contractRevenues ?? []
  const revenueEntries = mergeEntryGroups([
    contractEntries,
    input?.additionalRevenues,
    ...periodicWorks.map((work) => work.revenueEntries),
  ])
  const costEntries = mergeEntryGroups([
    input?.materialCosts,
    input?.otherCosts,
    ...periodicWorks.map((work) => work.directCostEntries),
  ])

  const revenues = calculateEntries({
    entries: revenueEntries,
    scope,
    currency,
    period,
    label: 'revenueEntries',
  })
  const directCosts = calculateEntries({
    entries: costEntries,
    scope,
    currency,
    period,
    label: 'costEntries',
  })
  const materialCosts = calculateEntries({
    entries: input?.materialCosts ?? [],
    scope,
    currency,
    period,
    label: 'materialCosts',
  })
  const otherCosts = calculateEntries({
    entries: input?.otherCosts ?? [],
    scope,
    currency,
    period,
    label: 'otherCosts',
  })
  const periodicDirectCosts = calculateEntries({
    entries: periodicWorks.flatMap((work) => work.directCostEntries ?? []),
    scope,
    currency,
    period,
    label: 'periodicDirectCosts',
  })
  const labor = calculateLaborCost({
    ...scope,
    currency,
    sessions: input?.laborSessions ?? [],
    rates: input?.workerRates ?? [],
  })
  const plannedLabor = Array.isArray(input?.plannedLaborSessions)
    ? calculateLaborCost({
        ...scope,
        currency,
        sessions: input.plannedLaborSessions,
        rates: input?.workerRates ?? [],
      })
    : null
  const equipment = calculateEquipmentCostForPeriod({
    equipment: input?.equipment ?? [],
    scope,
    currency,
    period,
  })

  const sourceDataIssues = Array.isArray(input?.sourceDataIssues) ? input.sourceDataIssues : []
  const issues = [...labor.issues, ...equipment.issues, ...sourceDataIssues]
  let passedChecks = labor.passedChecks + equipment.passedChecks
  let totalChecks = labor.totalChecks + equipment.totalChecks + sourceDataIssues.length

  totalChecks += 1
  if (!(input?.contractConfigured ?? contractEntries.length > 0)) {
    issues.push({ code: ISSUE_CODE.MISSING_CONTRACT_VALUE, objectId: scope.objectId })
  } else {
    passedChecks += 1
  }
  if (input?.variableRevenueRequired === true) {
    totalChecks += 1
    if (input?.variableRevenueConfigured === true) {
      passedChecks += 1
    } else {
      issues.push({ code: ISSUE_CODE.MISSING_VARIABLE_REVENUE, objectId: scope.objectId })
    }
  }

  const periodicBreakdown = []
  for (const [index, work] of periodicWorks.entries()) {
    assertScope(work, scope, `periodicWorks[${index}]`)
    const periodicWorkId = requiredText(work.id, `periodicWorks[${index}].id`)
    totalChecks += 2
    if ((work.revenueEntries ?? []).length === 0) {
      issues.push({ code: ISSUE_CODE.MISSING_PERIODIC_REVENUE, periodicWorkId })
    } else {
      passedChecks += 1
    }
    if ((work.directCostEntries ?? []).length === 0 && (work.laborSessionIds ?? []).length === 0) {
      issues.push({ code: ISSUE_CODE.MISSING_PERIODIC_COST, periodicWorkId })
    } else {
      passedChecks += 1
    }

    const periodicRevenue = calculateEntries({
      entries: work.revenueEntries ?? [],
      scope,
      currency,
      period,
      label: `periodicWorks[${index}].revenueEntries`,
    })
    const periodicDirectCosts = calculateEntries({
      entries: work.directCostEntries ?? [],
      scope,
      currency,
      period,
      label: `periodicWorks[${index}].directCostEntries`,
    })
    let allocatedLaborMinor = 0n
    let laborComplete = true
    for (const sessionId of new Set(work.laborSessionIds ?? [])) {
      if (!labor.sessionCosts.has(sessionId)) {
        issues.push({
          code: ISSUE_CODE.PERIODIC_LABOR_SESSION_MISSING,
          periodicWorkId,
          sessionId,
        })
        laborComplete = false
        continue
      }
      const cost = labor.sessionCosts.get(sessionId)
      if (cost === null) laborComplete = false
      else allocatedLaborMinor += cost
    }
    const periodicTotalCostMinor = laborComplete
      ? periodicDirectCosts.totalMinor + allocatedLaborMinor
      : null
    const periodicMarginMinor = laborComplete
      ? periodicRevenue.totalMinor - periodicTotalCostMinor
      : null
    periodicBreakdown.push({
      id: periodicWorkId,
      allocatedLaborMinor: laborComplete ? allocatedLaborMinor : null,
      directCostMinor: periodicDirectCosts.totalMinor,
      marginMinor: periodicMarginMinor,
      profitabilityBps:
        laborComplete && periodicRevenue.totalMinor !== 0n
          ? roundRatio(periodicMarginMinor * 10000n, periodicRevenue.totalMinor)
          : null,
      revenueMinor: periodicRevenue.totalMinor,
      totalCostMinor: periodicTotalCostMinor,
    })
  }

  const knownRevenueMinor = revenues.totalMinor
  const knownCostMinor = labor.knownCostMinor + directCosts.totalMinor + equipment.knownCostMinor
  const complete = issues.length === 0
  const totalCostMinor = complete ? knownCostMinor : null
  const marginMinor = complete ? knownRevenueMinor - knownCostMinor : null
  const profitabilityBps =
    complete && knownRevenueMinor !== 0n
      ? roundRatio(marginMinor * 10000n, knownRevenueMinor)
      : null
  const targetProfitabilityBps = input?.targetProfitabilityBps == null
    ? null
    : minorUnits(input.targetProfitabilityBps, 'targetProfitabilityBps')

  let status = CALCULATION_STATUS.CALCULATED
  if (!complete) status = CALCULATION_STATUS.INCOMPLETE
  else if (knownRevenueMinor === 0n) status = CALCULATION_STATUS.NOT_CALCULABLE
  else if (marginMinor < 0n) status = CALCULATION_STATUS.NEGATIVE
  else if (targetProfitabilityBps !== null && profitabilityBps >= targetProfitabilityBps) {
    status = CALCULATION_STATUS.ABOVE_TARGET
  } else if (targetProfitabilityBps !== null) {
    status = CALCULATION_STATUS.BELOW_TARGET
  }

  return {
    clientId,
    complete,
    completenessBps: totalChecks === 0 ? 10000n : roundRatio(BigInt(passedChecks) * 10000n, BigInt(totalChecks)),
    costBreakdown: {
      directMinor: directCosts.totalMinor,
      equipmentMinor: equipment.knownCostMinor,
      laborMinor: labor.complete ? labor.actualCostMinor : null,
      materialsMinor: materialCosts.totalMinor,
      otherMinor: otherCosts.totalMinor,
      periodicDirectMinor: periodicDirectCosts.totalMinor,
    },
    currency,
    issues,
    knownCostMinor,
    laborComparison: {
      actualCostMinor: labor.actualCostMinor,
      actualSeconds: labor.actualSeconds,
      costDeltaMinor:
        plannedLabor?.actualCostMinor != null && labor.actualCostMinor != null
          ? labor.actualCostMinor - plannedLabor.actualCostMinor
          : null,
      plannedCostMinor: plannedLabor?.actualCostMinor ?? null,
      plannedSeconds: plannedLabor?.actualSeconds ?? null,
      secondsDelta:
        plannedLabor ? labor.actualSeconds - plannedLabor.actualSeconds : null,
    },
    laborCostBreakdown: labor.breakdown,
    planDataQuality: plannedLabor
      ? { complete: plannedLabor.complete, issues: plannedLabor.issues }
      : null,
    marginMinor,
    objectId: scope.objectId,
    orgId: scope.orgId,
    period,
    periodicBreakdown,
    profitabilityBps,
    revenueMinor: knownRevenueMinor,
    status,
    totalCostMinor,
  }
}

function aggregateClientProfitability(results) {
  if (!Array.isArray(results) || results.length === 0) {
    throw new TypeError('results must contain at least one object calculation')
  }
  const first = results[0]
  const orgId = requiredText(first.orgId, 'results[0].orgId')
  const clientId = requiredText(first.clientId, 'results[0].clientId')
  const currency = normalizeCurrency(first.currency)
  const period = normalizePeriod(first.period)
  const objectIds = new Set()
  let revenueMinor = 0n
  let knownCostMinor = 0n
  let completenessTotal = 0n
  let profitableObjects = 0
  let unprofitableObjects = 0
  let notCalculableObjects = 0
  const issues = []

  for (const [index, result] of results.entries()) {
    if (
      result.orgId !== orgId ||
      result.clientId !== clientId ||
      normalizeCurrency(result.currency) !== currency ||
      result.period.start !== period.start ||
      result.period.end !== period.end
    ) {
      throw new Error(`results[${index}] cannot be aggregated with the requested client scope`)
    }
    if (objectIds.has(result.objectId)) throw new Error(`Duplicate object result: ${result.objectId}`)
    objectIds.add(result.objectId)
    revenueMinor += minorUnits(result.revenueMinor)
    knownCostMinor += minorUnits(result.knownCostMinor)
    completenessTotal += minorUnits(result.completenessBps)
    if (result.complete && result.marginMinor > 0n) profitableObjects += 1
    else if (result.complete && result.marginMinor <= 0n && result.revenueMinor !== 0n) unprofitableObjects += 1
    else notCalculableObjects += 1
    issues.push(...result.issues.map((issue) => ({ ...issue, objectId: result.objectId })))
  }

  const complete = results.every((result) => result.complete)
  const totalCostMinor = complete ? knownCostMinor : null
  const marginMinor = complete ? revenueMinor - knownCostMinor : null
  const profitabilityBps =
    complete && revenueMinor !== 0n ? roundRatio(marginMinor * 10000n, revenueMinor) : null

  return {
    clientId,
    complete,
    completenessBps: roundRatio(completenessTotal, BigInt(results.length)),
    currency,
    issues,
    knownCostMinor,
    marginMinor,
    notCalculableObjects,
    objectCount: results.length,
    orgId,
    period,
    profitabilityBps,
    profitableObjects,
    revenueMinor,
    status: !complete
      ? CALCULATION_STATUS.INCOMPLETE
      : revenueMinor === 0n
        ? CALCULATION_STATUS.NOT_CALCULABLE
        : marginMinor < 0n
          ? CALCULATION_STATUS.NEGATIVE
          : CALCULATION_STATUS.CALCULATED,
    totalCostMinor,
    unprofitableObjects,
  }
}

function serializeBigInts(value) {
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(serializeBigInts)
  if (value && typeof value === 'object') {
    if (value instanceof Map) {
      return Object.fromEntries([...value.entries()].map(([key, item]) => [key, serializeBigInts(item)]))
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeBigInts(item)]))
  }
  return value
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value)) deepFreeze(nested)
  return value
}

function createProfitabilitySnapshot(result, metadata = {}) {
  const snapshotId = requiredText(metadata.snapshotId, 'snapshotId')
  const calculatedAt = requiredText(metadata.calculatedAt, 'calculatedAt')
  const parsedAt = new Date(calculatedAt)
  if (!Number.isFinite(parsedAt.getTime())) throw new TypeError('calculatedAt must be an ISO timestamp')
  return deepFreeze({
    calculatedAt: parsedAt.toISOString(),
    calculation: serializeBigInts(result),
    correctionOfSnapshotId: metadata.correctionOfSnapshotId ?? null,
    dataVersion: String(metadata.dataVersion ?? '1'),
    snapshotId,
  })
}

module.exports = {
  CALCULATION_STATUS,
  ISO_4217_CODES,
  ISSUE_CODE,
  aggregateClientProfitability,
  assertScope,
  calculateEntries,
  calculateEquipmentCostForPeriod,
  calculateLaborCost,
  calculateObjectProfitability,
  createProfitabilitySnapshot,
  minorUnits,
  normalizeCurrency,
  normalizePeriod,
  roundRatio,
  serializeBigInts,
}
