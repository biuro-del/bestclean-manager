const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(
  path.resolve(
    __dirname,
    '..',
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

test('edycja dnia wyznacza date biznesowa z ISO lub widocznej daty zamiast pokazywac blokade', () => {
  const dayKeyBlock = source.slice(
    source.indexOf('function eventReconciliationDayKey'),
    source.indexOf('async function openEventWorkdayReconciliation'),
  )
  const openBlock = source.slice(
    source.indexOf('async function openEventWorkdayReconciliation'),
    source.indexOf('function eventMirrorWorkdayId'),
  )

  assert.match(dayKeyBlock, /businessDateYmd/)
  assert.match(dayKeyBlock, /workStatusYmdFromTimestamp\(new Date\(timestampValue\)\.getTime\(\)\)/)
  assert.match(dayKeyBlock, /visibleDate\.match/)
  assert.match(dayKeyBlock, /return `\$\{visibleDateMatch\[3\]\}-\$\{visibleDateMatch\[2\]\}-\$\{visibleDateMatch\[1\]\}`/)
  assert.match(openBlock, /const dayKey = eventReconciliationDayKey\(row\)/)
  assert.doesNotMatch(openBlock, /workStatusYmdFromTimestamp\(row\?\.startAt/)
})

test('kolumna Edytowal i edytor rozwiazuja login na nazwe pracownika', () => {
  const resolverBlock = source.slice(
    source.indexOf('function eventEditedByDisplayName'),
    source.indexOf('function eventWorkerAvatarHtml'),
  )
  const renderBlock = source.slice(
    source.indexOf('function renderEventsRows'),
    source.indexOf('function normalizeEventStatus'),
  )
  const editorBlock = source.slice(
    source.indexOf('async function openEventEditor'),
    source.indexOf('async function openCreateEventEditor'),
  )

  assert.match(resolverBlock, /eventWorkerRecordForRow/)
  assert.match(resolverBlock, /eventWorkerDisplayName\(matchedWorker\)/)
  assert.match(resolverBlock, /sessionMatches/)
  assert.match(renderBlock, /const editedByLabel = eventEditedByDisplayName\(row\)/)
  assert.match(editorBlock, /editedBy\.textContent = eventEditedByDisplayName\(item\)/)
  assert.match(source, /getValue: \(row\) => eventEditedByDisplayName\(row\)/)
})

test('akcja edycji otwiera lokalny formularz i nie przekierowuje do czasu pracownika', () => {
  const openBlock = source.slice(
    source.indexOf('async function openEventEditor'),
    source.indexOf('async function openCreateEventEditor'),
  )
  const saveBlock = source.slice(
    source.indexOf('async function saveEventEditor'),
    source.indexOf('function closeEventDeleteConfirmation'),
  )

  assert.match(openBlock, /overlay\.dataset\.mode = 'edit'/)
  assert.match(openBlock, /title\.textContent = 'Edytuj zdarzenie'/)
  assert.match(openBlock, /eventEditorLoadCorrectionContext\(item\)/)
  assert.doesNotMatch(openBlock, /openEventWorkdayReconciliation\(item\)/)
  assert.match(saveBlock, /saveWorkTimeDay\(/)
  assert.match(saveBlock, /reason: 'Korekta z panelu Zdarzenia'/)
})

test('wartosci spoza aktualnych opcji zachowuja czytelna nazwe bez technicznego dopisku', () => {
  const ensureOptionBlock = source.slice(
    source.indexOf('function eventEditorEnsureOption'),
    source.indexOf('function eventEditorResetSearchInputs'),
  )

  assert.match(ensureOptionBlock, /String\(fallbackLabel \|\| normalizedValue\)\.trim\(\)/)
  assert.doesNotMatch(ensureOptionBlock, /spoza listy/)
})
