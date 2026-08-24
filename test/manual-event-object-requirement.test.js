'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const eventFeature = fs.readFileSync(
  path.join(
    root,
    'web-app',
    'apps',
    'portal-web',
    'src',
    'features',
    'events',
    'index.js',
  ),
  'utf8',
)
const workdayService = fs.readFileSync(
  path.join(
    root,
    'web-app',
    'apps',
    'portal-web',
    'src',
    'services',
    'workdayService.js',
  ),
  'utf8',
)
const eventTemplate = fs.readFileSync(
  path.join(
    root,
    'web-app',
    'apps',
    'portal-web',
    'src',
    'features',
    'events',
    'template.html',
  ),
  'utf8',
)

test('ręczne dodanie zdarzenia wymaga obiektu i należącej do niego strefy', () => {
  assert.match(eventFeature, /function eventEditorManualObjectValidationMessage\(payload = \{\}\)/)
  assert.match(eventFeature, /if \(!payload\.clientId\)/)
  assert.match(eventFeature, /if \(!payload\.zoneId\)/)
  assert.match(eventFeature, /zoneClientId !== String\(payload\.clientId\)\.trim\(\)/)
  assert.match(eventFeature, /if \(isCreateMode\) \{\s+const objectValidationMessage/s)

  assert.match(workdayService, /Ręczne zdarzenie wymaga wskazania obiektu\./)
  assert.match(
    workdayService,
    /Ręczne zdarzenie wymaga wskazania strefy należącej do obiektu\./,
  )
  assert.match(workdayService, /function assertManualEventZoneBelongsToClient\(/)
  assert.match(
    workdayService,
    /const \[, integritySnapshot\] = await Promise\.all\(\[\s+assertManualEventZoneBelongsToClient\(orgId, manualClientId, manualZoneId\),/s,
  )
  assert.match(workdayService, /mutationPayload\.workerLogin = workerLogin/)
  assert.match(
    eventFeature,
    /eventPayload\.workerLogin = String\(\s+targetWorker\.login \?\? targetWorker\.workerLogin \?\? targetWorker\.id \?\? payload\.workerLogin,/s,
  )
})

test('formularz komunikuje obowiązkowy obiekt zamiast nieprecyzyjnego klienta', () => {
  assert.match(eventTemplate, /Obiekt <span aria-hidden="true">\*<\/span>/)
  assert.match(eventTemplate, /Strefa obiektu <span aria-hidden="true">\*<\/span>/)
  assert.match(eventTemplate, /aria-label="Lista obiektów"/)
})

test('zakładka zdarzeń respektuje wspólną blokadę edycji własnego czasu', () => {
  assert.match(eventFeature, /isOwnWorkdayEditBlocked/)
  assert.match(eventFeature, /OWN_WORKDAY_EDIT_DENIED_MESSAGE/)
  assert.match(eventFeature, /targetWorker,\s+\}\)/)
})

test('formularz pozwala wybrac lokalizacje pochodzaca ze strefy', () => {
  assert.match(eventTemplate, /id="evEditLocationSearch"/)
  assert.match(eventTemplate, /id="evEditLocation"/)
  assert.match(eventTemplate, /aria-label="Lista lokalizacji stref"/)
  assert.match(eventFeature, /function eventEditorReadableZoneLocation\(/)
  assert.match(eventFeature, /locationOptionsByClient/)
  assert.match(eventFeature, /baseZoneOptions\.filter\(\(option\) => normalizeSearchText\(option\?\.location\) === locationKey\)/)
  assert.match(eventFeature, /function refreshEventZoneOptionsForLocation\(/)
  assert.match(eventFeature, /location:\s*location \|\| null/)
  assert.match(eventFeature, /lokalizacja:\s*location \|\| null/)
})

test('ręczne dodawanie START STOP jest dostępne i nie koliduje z obejmującym Workday', () => {
  assert.doesNotMatch(eventFeature, /legacyEventCreationIsDisabled/)
  assert.doesNotMatch(eventFeature, /Reczne tworzenie sesji START\/STOP w starym edytorze jest wylaczone/)
  assert.match(eventFeature, /eventRecordKind\(row\) === EVENT_RECORD_KINDS\.WORKDAY/)
  assert.match(eventFeature, /events-row--workday/)
  assert.doesNotMatch(eventFeature, /Okres pracy/)
})
