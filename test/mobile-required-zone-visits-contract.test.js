'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')
const indexSource = read('index.js')

function functionSource(name, nextName) {
  const start = indexSource.indexOf(`async function ${name}`)
  assert.notEqual(start, -1, `Nie znaleziono funkcji ${name}`)
  const end = indexSource.indexOf(`async function ${nextName}`, start + 1)
  assert.notEqual(end, -1, `Nie znaleziono granicy ${nextName}`)
  return indexSource.slice(start, end)
}

test('migracja jest addytywna, domyslnie nie wymaga wizyty i zamraza checkliste per obiekt Workday', () => {
  const migration = read('dataconnect', 'migrations', '20260903_mobile_required_zone_visits_additive.sql')
  assert.match(migration, /^begin;/m)
  assert.match(migration, /^commit;/m)
  assert.match(migration, /add column if not exists required_visit boolean not null default false/i)
  assert.match(migration, /create table if not exists public\.mobile_object_visit\s*\(/i)
  assert.match(migration, /create table if not exists public\.mobile_object_visit_requirement\s*\(/i)
  assert.match(migration, /unique index if not exists mobile_object_visit_workday_client_uidx/i)
  assert.match(migration, /on public\.mobile_object_visit \(org_id, workday_id, client_id\)/i)
  assert.doesNotMatch(migration, /\bdrop table\b|\btruncate\b/i)
})

test('przygotowane definicje Data Connect pozostaja addytywne i nie zmieniaja starych mutacji Zone', () => {
  const mutations = read('dataconnect', 'connectors', 'example', 'mutations.gql')
  const oldInsert = mutations.slice(
    mutations.indexOf('mutation InsertZoneForOrg('),
    mutations.indexOf('mutation UpdateZoneForOrg('),
  )
  const oldUpdate = mutations.slice(
    mutations.indexOf('mutation UpdateZoneForOrg('),
    mutations.indexOf('mutation InsertZoneWithRequiredVisitForOrg('),
  )
  assert.doesNotMatch(oldInsert, /requiredVisit/)
  assert.doesNotMatch(oldUpdate, /requiredVisit/)
  assert.match(mutations, /mutation InsertZoneWithRequiredVisitForOrg\([\s\S]*?\$requiredVisit: Boolean!/)
  assert.match(mutations, /mutation UpdateZoneWithRequiredVisitForOrg\([\s\S]*?requiredVisit: \$requiredVisit/)
})

test('snapshot ujawnia postep, a tryb ENFORCE sprawdza liste przed mutacja STOP', () => {
  const snapshot = functionSource('buildMobileSnapshotFromDb', 'closeMobileEvent')
  const scan = functionSource('processMobileWorkflowScan', 'handleMobileWorkflowRequest')
  const stopStart = scan.indexOf("} else if (zone.kind === 'STOP')")
  const cleanStart = scan.indexOf('} else {', stopStart)
  const stopBranch = scan.slice(stopStart, cleanStart)

  assert.match(snapshot, /readMobileRequiredZoneVisitState\(/)
  assert.match(snapshot, /requiredZoneVisits,/)
  assert.match(stopBranch, /assertMobileRequiredZoneVisitsComplete\(/)
  assert.ok(
    stopBranch.indexOf('assertMobileRequiredZoneVisitsComplete') < stopBranch.indexOf('closeMobileOpenCycles'),
    'Gate wymaganych stref musi wyprzedzac zamykanie Eventow.',
  )
  assert.match(scan, /recordMobileRequiredZoneVisit\([\s\S]*?clientActionId/)
  assert.match(scan, /assertMobileRequiredZoneObjectTransitionAllowed\(/)
  assert.match(indexSource, /visited_at = coalesce\(visited_at, \$4\)/)
  assert.match(indexSource, /publicCode = 'REQUIRED_OBJECT_ZONES_INCOMPLETE'/)
  assert.match(indexSource, /Wróć do:/)
})

test('tryb produkcyjny kandydata pozostaje OFF, a portal oznacza tylko strefy inne niz START i STOP', () => {
  const appHosting = read('apphosting.yaml')
  const portalSource = read('web-app', 'apps', 'portal-web', 'src', 'features', 'objects', 'zones', 'index.js')
  const portalTemplate = read('web-app', 'apps', 'portal-web', 'src', 'features', 'objects', 'zones', 'template.html')
  const platformPolicy = read('platform-policy.js')
  const zoneService = read('web-app', 'apps', 'portal-web', 'src', 'services', 'zoneService.js')

  assert.match(appHosting, /variable: MOBILE_REQUIRED_ZONE_VISITS_MODE\s+value: "OFF"/)
  assert.match(portalTemplate, /id="znEditRequiredVisit"/)
  assert.match(portalSource, /!normalized\.startsWith\('START'\) && !normalized\.startsWith\('STOP'\)/)
  assert.match(portalSource, /zones-required-visit-pill/)
  assert.match(platformPolicy, /'InsertZoneWithRequiredVisitForOrg'/)
  assert.match(platformPolicy, /'UpdateZoneWithRequiredVisitForOrg'/)
  assert.match(indexSource, /const PORTAL_ZONES_PATH = '\/api\/portal\/zones'/)
  assert.match(indexSource, /createPortalZoneApi\(/)
  assert.match(zoneService, /writeZoneThroughPortalApi\('PATCH'/)
  assert.doesNotMatch(zoneService, /insertZoneWithRequiredVisitForOrg|updateZoneWithRequiredVisitForOrg/)
})
