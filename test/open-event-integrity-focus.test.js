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
const template = fs.readFileSync(
  path.join(path.dirname(featurePath), 'template.html'),
  'utf8',
)
const styles = fs.readFileSync(
  path.join(path.dirname(featurePath), 'style.css'),
  'utf8',
)

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

test('pojedynczy nierozstrzygniety wpis z obecnego dnia jest ukrywany w diagnostyce', () => {
  assert.match(source, /filterVisibleUnresolvedLegacyGroups/)
  assert.match(source, /currentDayKey:\s*todayYmd\(\)/)
  assert.match(source, /dayKeyFromValue:\s*eventLocalDayKeyFromIso/)
})

test('eksport i fokus klawiatury respektują dokładnie wybraną grupę diagnostyczną', () => {
  assert.match(source, /const focusedGroup = eventOpenIntegrityFocusedGroup\(\)/)
  assert.match(source, /return normalizeEventsExportRows\(focusedGroup\.rows\)/)
  assert.match(source, /aria-label=".*Pokaż zdarzenia:/)
  assert.match(source, /data-event-open-back.*\?\.focus\(\)/)
})

test('kompaktowy panel renderuje tylko niepuste kategorie i otwiera wspólny modal', () => {
  assert.match(source, /eventOpenIntegrityCategories/)
  assert.match(source, /\.filter\(\(category\) => category\?\.groups\?\.length\)/)
  assert.match(source, /data-event-integrity-kind/)
  assert.match(source, /aria-haspopup="dialog"/)
  assert.match(source, /openEventIntegrityModal\(integrityKind, categoryButton\)/)
  assert.match(template, /id="evIntegrityModalOverlay"/)
  assert.match(template, /aria-modal="true"/)
  assert.match(template, /id="evIntegrityModalList"/)
})

test('modal problemu ma pełny kontrakt zamykania, fokusu i widoku tabeli', () => {
  assert.match(source, /event\.target\?\.id === 'evIntegrityModalOverlay'/)
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /event\.key !== 'Tab'/)
  assert.match(source, /closeEventIntegrityModal\(\{ restoreFocus: false \}\)/)
  assert.match(source, /focusEventIntegrityGroup\(group\)/)
  assert.match(source, /events-integrity-focus/)
  assert.match(styles, /#evIntegrityModalOverlay/)
  assert.match(styles, /max-height:calc\(100dvh - 16px\)/)
})

test('brak problemów ukrywa panel, a błąd pozostaje jednoliniowym stanem neutralnym', () => {
  assert.match(source, /if \(!categories\.length\)/)
  assert.match(source, /root\.hidden = true/)
  assert.match(source, /events-integrity-unavailable/)
  assert.match(source, /Kontrola problemów jest chwilowo niedostępna/)
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

test('formularz nie powtarza pełnej kontroli CLEAN wykonywanej przez serwis zapisu', () => {
  assert.doesNotMatch(source, /eventEditorFindOtherOpenStatus/)
  assert.doesNotMatch(source, /eventEditorOpenStatusMessage/)
  assert.match(source, /Promise\.allSettled\(postSaveRefreshes/)
  assert.match(source, /function eventApplyUpdatedRow\(/)
  assert.match(source, /savedEvent = await updateEvent\(/)
  assert.match(source, /savedEventVisibility = eventApplyUpdatedRow\(/)
})

test('filtry zdarzen maja osobny reset do wartosci domyslnych', () => {
  assert.match(template, /id="evClearFiltersBtn"/)
  assert.match(template, /Resetuj filtry/)
  assert.match(source, /function resetEventsFilters\(\)/)
  assert.match(source, /from:\s*firstDayOfCurrentMonthYmd\(\)/)
  assert.match(source, /to:\s*todayYmd\(\)/)
  assert.match(source, /appState\.eventsPage = 1/)
  assert.match(source, /evClearFiltersBtn.*resetEventsFilters/)
})

test('Events view uses the dashboard-aligned visual contract without dashboard selectors', () => {
  assert.match(template, /class="events-command-surface"/)
  assert.match(template, /id="evFiltersTitle"/)
  assert.match(template, /class="ph ph-funnel-simple"/)
  assert.match(template, /aria-label="Poprzednia strona"/)
  assert.match(template, /class="ph ph-caret-left"/)
  assert.match(template, /aria-label="Następna strona"/)
  assert.match(template, /class="ph ph-caret-right"/)
  assert.match(styles, /--events-ui-accent:#5b52eb/)
  assert.match(styles, /#evAddBtn\{[\s\S]*background:#278f65 !important/)
  assert.match(styles, /\.events-delete-button\{[\s\S]*background:#DC0000 !important;[\s\S]*color:#fff !important/)
  assert.match(styles, /\.events-table-toolbar\{[\s\S]*display:flex !important/)
  assert.match(styles, /@media \(max-width:340px\)[\s\S]*grid-template-columns:1fr !important/)
  assert.doesNotMatch(styles, /#view-dashboard/)
})
