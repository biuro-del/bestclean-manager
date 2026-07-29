import { ISSA_NORM_CATALOG_V1 } from './catalog.v1.js'

const VERIFIED_STATUS = 'VERIFIED_VISUALLY'

function finitePositive(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor
}

function sourceCitation(norm) {
  const source = ISSA_NORM_CATALOG_V1.source
  return `${source.author}, „${source.title}”, ${source.fileName}, s. ${norm.source.printedPage} (strona PDF ${norm.source.pdfPage}), zadanie #${norm.taskNumber}.`
}

export function listVerifiedIssaNorms() {
  return ISSA_NORM_CATALOG_V1.norms.filter((norm) => norm.verificationStatus === VERIFIED_STATUS)
}

export function findVerifiedIssaNorm(normId) {
  const normalized = String(normId || '').trim().toUpperCase()
  return listVerifiedIssaNorms().find((norm) => norm.id === normalized) || null
}

export function deriveIssaProductivityM2PerHour(referenceAreaM2, referenceMinutes) {
  const area = finitePositive(referenceAreaM2)
  const minutes = finitePositive(referenceMinutes)
  if (!area || !minutes) {
    return null
  }
  return round((60 / minutes) * area, 2)
}

export function formatIssaNormCitation(normId) {
  const norm = findVerifiedIssaNorm(normId)
  return norm ? sourceCitation(norm) : ''
}

export function validateIssaNormCatalog() {
  const issues = []
  const seen = new Set()

  listVerifiedIssaNorms().forEach((norm) => {
    if (seen.has(norm.id)) {
      issues.push({ code: 'DUPLICATE_ID', normId: norm.id })
    }
    seen.add(norm.id)

    if (!finitePositive(norm.referenceMinutes) || !finitePositive(norm.basis?.quantity)) {
      issues.push({ code: 'INVALID_REFERENCE', normId: norm.id })
    }

    if (norm.basis?.type === 'AREA' && norm.productivity?.unit === 'M2_PER_HOUR') {
      const derived = deriveIssaProductivityM2PerHour(norm.basis.quantity, norm.referenceMinutes)
      const difference = Math.abs(derived - Number(norm.productivity.value))
      const relativeDifference = difference / Number(norm.productivity.value)
      // Tabela źródłowa prezentuje czas i wydajność po zaokrągleniu.
      // Kontrola toleruje wyłącznie małą różnicę wynikającą z tego zaokrąglenia.
      if (relativeDifference > 0.005) {
        issues.push({
          code: 'PRODUCTIVITY_MISMATCH',
          normId: norm.id,
          declared: norm.productivity.value,
          derived,
          relativeDifference: round(relativeDifference, 4),
        })
      }
    }
  })

  return {
    valid: issues.length === 0,
    verifiedCount: listVerifiedIssaNorms().length,
    issues,
  }
}

export function estimateIssaDuration(input = {}) {
  const norm = findVerifiedIssaNorm(input.normId)
  if (!norm) {
    return {
      status: 'NORM_NOT_FOUND',
      normId: String(input.normId || '').trim(),
      sourceCitation: '',
    }
  }

  const requiredField = norm.basis.type === 'AREA' ? 'areaM2' : 'itemCount'
  const measuredValue = finitePositive(input[requiredField])
  if (!measuredValue) {
    return {
      status: 'INPUT_REQUIRED',
      normId: norm.id,
      requiredField,
      message: norm.basis.type === 'AREA'
        ? 'Podaj powierzchnię strefy w m². Bez niej nie można obliczyć czasu z tej normy.'
        : `Podaj liczbę jednostek (${norm.basis.unit}). Bez niej nie można obliczyć czasu z tej normy.`,
      sourceCitation: sourceCitation(norm),
    }
  }

  const adjustmentFactor = input.adjustmentFactor === undefined
    ? 1
    : finitePositive(input.adjustmentFactor)
  if (!adjustmentFactor) {
    return {
      status: 'INVALID_ADJUSTMENT_FACTOR',
      normId: norm.id,
      sourceCitation: sourceCitation(norm),
    }
  }

  const baseMinutes = (measuredValue / norm.basis.quantity) * norm.referenceMinutes
  const adjustedMinutes = baseMinutes * adjustmentFactor
  const rangeMinFactor = input.rangeMinFactor === undefined ? null : finitePositive(input.rangeMinFactor)
  const rangeMaxFactor = input.rangeMaxFactor === undefined ? null : finitePositive(input.rangeMaxFactor)
  const hasRange = rangeMinFactor !== null || rangeMaxFactor !== null

  if (hasRange && (!rangeMinFactor || !rangeMaxFactor || rangeMinFactor > rangeMaxFactor)) {
    return {
      status: 'INVALID_RANGE_FACTORS',
      normId: norm.id,
      sourceCitation: sourceCitation(norm),
    }
  }

  return {
    status: 'ESTIMATED',
    normId: norm.id,
    taskNumber: norm.taskNumber,
    description: norm.description,
    input: {
      field: requiredField,
      value: measuredValue,
      unit: norm.basis.unit,
    },
    reference: {
      quantity: norm.basis.quantity,
      unit: norm.basis.unit,
      minutes: norm.referenceMinutes,
    },
    baseMinutes: round(baseMinutes, 2),
    adjustmentFactor,
    adjustedMinutes: round(adjustedMinutes, 2),
    suggestedRangeMinutes: hasRange
      ? {
          min: round(baseMinutes * rangeMinFactor, 2),
          max: round(baseMinutes * rangeMaxFactor, 2),
          factors: { min: rangeMinFactor, max: rangeMaxFactor },
        }
      : null,
    sourceCitation: sourceCitation(norm),
    caveat: 'To norma bazowa ISSA. Warunki obiektu mogą wpływać na wynik; korektę lub przedział wolno zastosować wyłącznie po jawnym podaniu współczynników.',
  }
}
