'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const featurePath = path.join(
  __dirname,
  '..',
  'web-app',
  'apps',
  'portal-web',
  'src',
  'features',
  'events',
  'index.js',
)

const source = fs.readFileSync(featurePath, 'utf8')

test('Pokaż korzysta z rekordów grupy diagnostycznej zamiast filtra RUNNING', () => {
  assert.match(source, /eventsOpenIntegrityFocus/)
  assert.match(source, /renderOpenIntegrityFocusPage/)
  assert.match(source, /const rows = Array\.isArray\(group\.rows\) \? group\.rows : \[\]/)
  assert.doesNotMatch(source, /evStatus:\s*'RUNNING'/)
})

test('lokalny widok konfliktów ma paginację i bezpieczny powrót do listy', () => {
  assert.match(source, /rows\.slice\(startIndex, startIndex \+ pageSize\)/)
  assert.match(source, /data-event-open-back/)
  assert.match(source, /Wróć do wszystkich zdarzeń/)
  assert.match(source, /eventsOpenIntegrityFocus\?\.previousPage \?\? appState\.eventsPage/)
  assert.match(source, /if \(event\.key !== 'Enter'\) return\s*clearOpenEventIntegrityFocus\(\)\s*appState\.eventsPage = 1/)
  assert.match(source, /focused open status refresh failed/)
})

test('diagnostyka odróżnia jawny konflikt, osierocony CLEAN, nierozstrzygnięty legacy i historyczny orphan', () => {
  assert.match(source, /eventsOpenCleanOrphanGroups/)
  assert.match(source, /groupOrphanOpenCleanEvents/)
  assert.match(source, /eventsUnresolvedLegacyGroups/)
  assert.match(source, /groupUnresolvedLegacyOpenEvents/)
  assert.match(source, /data-event-open-kind/)
  assert.match(source, /Nierozstrzygnięte otwarte wpisy bez typu zdarzenia/)
  assert.match(source, /Historyczne wpisy bez typu zdarzenia wymagają klasyfikacji/)
})

test('eksport i fokus klawiatury respektują dokładnie wybraną grupę diagnostyczną', () => {
  assert.match(source, /const focusedGroup = eventOpenIntegrityFocusedGroup\(\)/)
  assert.match(source, /return normalizeEventsExportRows\(focusedGroup\.rows\)/)
  assert.match(source, /aria-label=".*Pokaż wpisy:/)
  assert.match(source, /data-event-open-back.*\?\.focus\(\)/)
})

test('nieudane odświeżenie usuwa stare klasyfikacje przed pokazaniem błędu', () => {
  assert.match(
    source,
    /eventsOpenIntegrityGroups = \[\]\s*eventsOpenCleanOrphanGroups = \[\]\s*eventsUnresolvedLegacyGroups = \[\]\s*eventsLegacyOpenGroups = \[\]/,
  )
})

test('odświeżenie przypina zapytanie do jednej organizacji i odrzuca spóźnioną odpowiedź starej sesji', () => {
  assert.match(source, /readAllOpenCleanEvents\(orgId,/)
  assert.match(source, /getWorkdays\(normalizedOrgId,/)
  assert.match(source, /eventsOpenIntegrityRefreshGeneration/)
  assert.match(source, /String\(appState\.session\?\.orgId \?\? ''\)\.trim\(\) !== requestOrgId/)
  assert.match(source, /source: 'events-integrity'/)
})
