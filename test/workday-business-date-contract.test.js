'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')

test('Data Connect udostępnia kanoniczną datę biznesową Workday', () => {
  const schema = fs.readFileSync(path.join(root, 'dataconnect', 'schema', 'schema.gql'), 'utf8')
  const queries = fs.readFileSync(
    path.join(root, 'dataconnect', 'connectors', 'example', 'queries.gql'),
    'utf8',
  )

  assert.match(schema, /businessDateYmd:\s*String\s+@col\(name:\s*"business_date_ymd",\s*dataType:\s*"varchar\(10\)"\)/)

  const workdaySelections = queries.match(/workdays(?:_on_worker|_on_organization)?\([^]*?\n\s*\}/g) ?? []
  assert.ok(workdaySelections.length > 0)
  for (const selection of workdaySelections) {
    assert.match(selection, /\bbusinessDateYmd\b/)
  }

  assert.match(queries, /query WorkdaysPageForOrgByBusinessDate\(/)
  assert.match(
    queries,
    /businessDateYmd:\s*\{\s*ge:\s*\$fromBusinessDateYmd,\s*le:\s*\$toBusinessDateYmd\s*\}/,
  )
})

test('mapper portalu grupuje rekord po businessDateYmd przed strefą przeglądarki', () => {
  const service = fs.readFileSync(
    path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'services', 'workdayService.js'),
    'utf8',
  )
  const mapStart = service.indexOf('function mapWorkday(')
  const mapEnd = service.indexOf('\nfunction isDisplayableMappedItem', mapStart)
  const mapper = service.slice(mapStart, mapEnd)

  assert.ok(mapStart >= 0 && mapEnd > mapStart)
  assert.match(
    mapper,
    /row\?\.workday\?\.businessDateYmd\s*\?\?\s*linkedWorkday\?\.businessDateYmd\s*\?\?\s*row\?\.businessDateYmd/,
  )
  assert.match(mapper, /dayKey:\s*businessDateYmd\s*\|\|\s*toLocalDayKey\(/)
})

test('mapy powiązanych Workday zachowują datę biznesową także w szybkich zapytaniach Event', () => {
  const service = fs.readFileSync(
    path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'services', 'workdayService.js'),
    'utf8',
  )
  const start = service.indexOf('function buildLookupMaps(')
  const end = service.indexOf('\nfunction extractQrCodesFromText', start)
  const lookupSource = service.slice(start, end)

  assert.ok(start >= 0 && end > start)
  assert.match(lookupSource, /businessDateYmd:\s*sanitizeTextValue\(row\?\.businessDateYmd\)/)
  assert.match(lookupSource, /const dayKey = businessDateYmd \|\| toLocalDayKey\(startAt \|\| endAt\)/)
})

test('szybka paginacja łączy zakres timestamp z kanonicznym zakresem businessDateYmd', () => {
  const service = fs.readFileSync(
    path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'services', 'workdayService.js'),
    'utf8',
  )
  const platformPolicy = fs.readFileSync(path.join(root, 'platform-policy.js'), 'utf8')
  const start = service.indexOf('async function fetchFastEventsPage(')
  const end = service.indexOf('\nasync function resolveWorkerLoginHint', start)
  const fastPageSource = service.slice(start, end)

  assert.ok(start >= 0 && end > start)
  assert.match(fastPageSource, /WorkdaysPageForOrgByBusinessDate/)
  assert.match(service, /VITE_ENABLE_WORKDAY_BUSINESS_DATE_PAGE/)
  assert.match(
    fastPageSource,
    /WORKDAYS_BUSINESS_DATE_PAGE_ENABLED\s*&&\s*!workdaysBusinessDatePageUnavailable/,
  )
  assert.match(fastPageSource, /fromBusinessDateYmd:\s*normalizeFilterDate\(filters\.fromIso\)/)
  assert.match(fastPageSource, /businessDateWorkdayRows/)
  assert.match(service, /return iso \? warsawBusinessDateKey\(iso\) : ''/)
  assert.match(platformPolicy, /'WorkdaysPageForOrgByBusinessDate'/)
})
