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

test('serwis operacyjnych zdarzeń nadal chroni powiązanie obiektu i strefy', () => {
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
})

test('formularz dodaje jedno zdarzenie bez wyboru czasu pracy lub sprzątania', () => {
  assert.doesNotMatch(eventTemplate, /name="evEditRecordKind"/)
  assert.doesNotMatch(eventTemplate, /Czas pracy pracownika/)
  assert.doesNotMatch(eventTemplate, /Sprzątanie strefy/)
  assert.doesNotMatch(eventTemplate, /Rodzaj zdarzenia/)
  assert.match(eventTemplate, /Obiekt <span aria-hidden="true">\*<\/span>/)
  assert.match(eventTemplate, /id="evEditPomSearch"[^>]*aria-required="true"/)
  assert.match(eventTemplate, /Strefa <em>opcjonalnie<\/em>/)
  assert.match(eventTemplate, /aria-label="Lista obiektów"/)
  assert.doesNotMatch(eventTemplate, /Nie zmienia okresu pracy pracownika/)
  assert.doesNotMatch(eventFeature, /eventEditorSelectedRecordKind/)
  assert.doesNotMatch(eventFeature, /eventEditorSyncRecordKindUi/)
  assert.match(eventFeature, /if \(isCreateMode && !payload\.clientId\) \{\s+alert\('Wybierz obiekt\.'\)/s)
})

test('nowe zdarzenie tworzy jeden okres pracownika z opcjonalną strefą', () => {
  assert.match(eventFeature, /createWorkday,/)
  assert.doesNotMatch(eventFeature, /createEvent,/)
  assert.match(eventFeature, /const recordKind = isCreateMode\s+\? EVENT_RECORD_KINDS\.WORKDAY/s)
  assert.match(eventFeature, /const recordId = `WD-\$\{Date\.now\(\)\}/)
  assert.match(eventFeature, /savedEvent = await createWorkday\(appState\.session\.orgId, savedEventPayload\)/)
  assert.match(eventFeature, /Nowe zdarzenie musi mieć godzinę START/)
  assert.doesNotMatch(eventFeature, /eventEditorManualObjectValidationMessage/)
  assert.match(workdayService, /await assertNoOtherOpenWorkday\(orgId, \{ workerLogin, status, endAt \}\)/)
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

test('kolizje nowego zdarzenia są porównywane z okresami pracownika', () => {
  assert.doesNotMatch(eventFeature, /legacyEventCreationIsDisabled/)
  assert.doesNotMatch(eventFeature, /Reczne tworzenie sesji START\/STOP w starym edytorze jest wylaczone/)
  assert.match(eventFeature, /const rowRecordKind = eventRecordKind\(row\)/)
  assert.match(eventFeature, /const candidateRecordKind = appState\.eventEditorMode === 'add'\s+\? EVENT_RECORD_KINDS\.WORKDAY/s)
  assert.match(eventFeature, /if \(rowRecordKind !== candidateRecordKind\)/)
  assert.match(eventFeature, /events-row--workday/)
})
