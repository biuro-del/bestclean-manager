'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const test = require('node:test')

async function loadIssaEstimator() {
  const modulePath = path.join(
    __dirname,
    '..',
    'web-app',
    'apps',
    'portal-web',
    'src',
    'features',
    'orders',
    'issa',
    'index.js',
  )
  return import(pathToFileURL(modulePath).href)
}

test('katalog udostępnia wyłącznie 24 wzrokowo zweryfikowane normy', async () => {
  const {
    ISSA_NORM_CATALOG_V1,
    listVerifiedIssaNorms,
    validateIssaNormCatalog,
  } = await loadIssaEstimator()

  assert.equal(ISSA_NORM_CATALOG_V1.status, 'PARTIAL_VERIFIED')
  assert.equal(listVerifiedIssaNorms().length, 24)
  assert.deepEqual(validateIssaNormCatalog(), {
    valid: true,
    verifiedCount: 24,
    issues: [],
  })
})

test('przelicznik wydajności odwzorowuje wzór ISSA ze strony 57', async () => {
  const { deriveIssaProductivityM2PerHour } = await loadIssaEstimator()

  assert.equal(deriveIssaProductivityM2PerHour(92.9, 7.2), 774.17)
  assert.equal(deriveIssaProductivityM2PerHour(0, 7.2), null)
})

test('norma powierzchniowa nie zwraca czasu bez powierzchni', async () => {
  const { estimateIssaDuration } = await loadIssaEstimator()

  const result = estimateIssaDuration({ normId: 'ISSA-050' })

  assert.equal(result.status, 'INPUT_REQUIRED')
  assert.equal(result.requiredField, 'areaM2')
  assert.match(result.message, /powierzchnię strefy w m²/)
  assert.match(result.sourceCitation, /zadanie #50/)
})

test('norma powierzchniowa skaluje czas proporcjonalnie do m²', async () => {
  const { estimateIssaDuration } = await loadIssaEstimator()

  const result = estimateIssaDuration({
    normId: 'ISSA-050',
    areaM2: 185.8,
  })

  assert.equal(result.status, 'ESTIMATED')
  assert.equal(result.baseMinutes, 18.8)
  assert.equal(result.adjustedMinutes, 18.8)
  assert.equal(result.suggestedRangeMinutes, null)
})

test('norma licznikowa wymaga liczby elementów i poprawnie ją skaluje', async () => {
  const { estimateIssaDuration } = await loadIssaEstimator()

  const missing = estimateIssaDuration({ normId: 'ISSA-060' })
  const calculated = estimateIssaDuration({
    normId: 'ISSA-060',
    itemCount: 48,
  })

  assert.equal(missing.status, 'INPUT_REQUIRED')
  assert.equal(missing.requiredField, 'itemCount')
  assert.equal(calculated.status, 'ESTIMATED')
  assert.equal(calculated.baseMinutes, 8)
})

test('korekta i przedział powstają tylko z jawnie podanych współczynników', async () => {
  const { estimateIssaDuration } = await loadIssaEstimator()

  const result = estimateIssaDuration({
    normId: 'ISSA-050',
    areaM2: 92.9,
    adjustmentFactor: 1.2,
    rangeMinFactor: 0.9,
    rangeMaxFactor: 1.2,
  })

  assert.equal(result.baseMinutes, 9.4)
  assert.equal(result.adjustedMinutes, 11.28)
  assert.deepEqual(result.suggestedRangeMinutes, {
    min: 8.46,
    max: 11.28,
    factors: { min: 0.9, max: 1.2 },
  })
})

test('cytowanie wskazuje autora, plik, stronę i numer czynności', async () => {
  const { formatIssaNormCitation } = await loadIssaEstimator()

  const citation = formatIssaNormCitation('ISSA-050')

  assert.match(citation, /Ben Walker/)
  assert.match(citation, /Normy_ISSA_do_druku_A4\.pdf/)
  assert.match(citation, /s\. 12 \(strona PDF 6\)/)
  assert.match(citation, /zadanie #50/)
})

test('kalkulator odrzuca nieznaną normę oraz niepoprawny przedział', async () => {
  const { estimateIssaDuration } = await loadIssaEstimator()

  assert.equal(estimateIssaDuration({ normId: 'ISSA-999' }).status, 'NORM_NOT_FOUND')
  assert.equal(
    estimateIssaDuration({
      normId: 'ISSA-050',
      areaM2: 92.9,
      rangeMinFactor: 1.2,
      rangeMaxFactor: 0.9,
    }).status,
    'INVALID_RANGE_FACTORS',
  )
})
