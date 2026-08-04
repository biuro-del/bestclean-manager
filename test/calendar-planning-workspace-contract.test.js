'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const calendarSource = fs.readFileSync(
  path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'features', 'calendar', 'index.js'),
  'utf8',
)
const stateSource = fs.readFileSync(
  path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'app', 'state', 'index.js'),
  'utf8',
)
const templateSource = fs.readFileSync(
  path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'features', 'calendar', 'template.html'),
  'utf8',
)
const planningCssSource = fs.readFileSync(
  path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'features', 'calendar', 'planningWorkspace.css'),
  'utf8',
)

function extractNamedFunction(source, name) {
  const start = source.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `Missing function ${name}`)
  const paramsStart = source.indexOf('(', start)
  let paramsDepth = 0
  let paramsEnd = -1
  for (let index = paramsStart; index < source.length; index += 1) {
    if (source[index] === '(') paramsDepth += 1
    if (source[index] !== ')') continue
    paramsDepth -= 1
    if (paramsDepth === 0) {
      paramsEnd = index
      break
    }
  }
  assert.notEqual(paramsEnd, -1, `Unclosed params for ${name}`)
  const bodyStart = source.indexOf('{', paramsEnd)
  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] !== '}') continue
    depth -= 1
    if (depth === 0) return source.slice(start, index + 1)
  }
  throw new Error(`Unclosed function ${name}`)
}

function loadStrictPlanningCorrelation() {
  const functionsSource = [
    'calendarPlanningStableAnchorValues',
    'calendarPlanningHasStrictCorrelation',
  ]
    .map((name) => extractNamedFunction(calendarSource, name))
    .join('\n')

  return new Function(
    `${functionsSource}\nreturn calendarPlanningHasStrictCorrelation`,
  )()
}

test('kalendarz otwiera domyslnie tygodniowy obszar planowania', () => {
  assert.match(stateSource, /calendarViewMode:\s*['"]week['"]/)

  const prototypeHtml = extractNamedFunction(calendarSource, 'calendarTimelinePrototypeHtml')
  assert.match(prototypeHtml, /if\s*\(range\.mode\s*===\s*['"]week['"]\)/)
  assert.match(prototypeHtml, /return\s+calendarPlanningWorkspaceHtml\(range\)/)
})

test('tygodniowy obszar zawiera bufor, macierz obsady i panel live', () => {
  const workspaceHtml = extractNamedFunction(calendarSource, 'calendarPlanningWorkspaceHtml')
  const matrixHtml = extractNamedFunction(calendarSource, 'calendarPlanningMatrixHtml')
  const liveHtml = extractNamedFunction(calendarSource, 'calendarPlanningLiveHtml')

  assert.match(workspaceHtml, /calendar-planning-buffer/)
  assert.match(workspaceHtml, /calendarPlanningMatrixHtml\(days, model\)/)
  assert.match(workspaceHtml, /calendarPlanningLiveHtml\(resources\)/)
  assert.match(matrixHtml, /calendar-planning-matrix/)
  assert.match(liveHtml, /calendar-planning-live/)
})

test('panel live koreluje plan z wykonaniem tylko przez stabilne identyfikatory', () => {
  const hasStrictCorrelation = loadStrictPlanningCorrelation()

  const sameHumanTextOnly = {
    clientName: 'Best Clean',
    workerName: 'Rafal Dudek',
    dateYmd: '2026-07-31',
    startTime: '08:00',
    endTime: '16:00',
  }
  assert.equal(
    hasStrictCorrelation(sameHumanTextOnly, { ...sameHumanTextOnly }),
    false,
    'nazwy, pracownik i czas nie moga samodzielnie potwierdzic korelacji',
  )

  assert.equal(
    hasStrictCorrelation(
      { ...sameHumanTextOnly, taskId: 'TASK-1' },
      { ...sameHumanTextOnly, taskId: 'TASK-1' },
    ),
    false,
    'taskId bez bloku usługi nie rozstrzyga cyklicznego wystąpienia',
  )
  assert.equal(
    hasStrictCorrelation(
      { ...sameHumanTextOnly, taskId: 'TASK-A' },
      { ...sameHumanTextOnly, taskId: 'TASK-B' },
    ),
    false,
  )
  assert.equal(
    hasStrictCorrelation(
      { ...sameHumanTextOnly, taskId: 'TASK-1', serviceBlockId: 'BLOCK-1' },
      { ...sameHumanTextOnly, taskId: 'TASK-1', serviceBlockId: 'BLOCK-1' },
    ),
    true,
  )
  assert.equal(
    hasStrictCorrelation(
      { ...sameHumanTextOnly, taskId: 'TASK-1', workSlotKey: 'slot:BLOCK-1:ALLOC-1' },
      { ...sameHumanTextOnly, taskId: 'TASK-1', workSlotKey: 'slot:BLOCK-1:ALLOC-1' },
    ),
    true,
  )
  assert.equal(
    hasStrictCorrelation(
      { ...sameHumanTextOnly, taskId: 'TASK-1', serviceBlockId: 'BLOCK-1', allocationId: 'ALLOC-1' },
      { ...sameHumanTextOnly, taskId: 'TASK-1', serviceBlockId: 'BLOCK-1', allocationId: 'ALLOC-2' },
    ),
    false,
    'sprzeczne allocationId musza zablokowac korelacje mimo zgodnego zadania i bloku',
  )
  assert.equal(
    hasStrictCorrelation(
      { ...sameHumanTextOnly, taskId: 'TASK-1', serviceBlockId: 'BLOCK-1', allocationId: 'ALLOC-1' },
      { ...sameHumanTextOnly, taskId: 'TASK-2', serviceBlockId: 'BLOCK-1', allocationId: 'ALLOC-1' },
    ),
    false,
    'sprzeczne taskId musza zablokowac korelacje mimo zgodnego bloku i alokacji',
  )
  assert.equal(
    hasStrictCorrelation(
      { ...sameHumanTextOnly, taskId: 'TASK-1', serviceBlockId: 'BLOCK-1', workSlotKey: 'slot:BLOCK-1:ALLOC-1' },
      { ...sameHumanTextOnly, taskId: 'TASK-1', serviceBlockId: 'BLOCK-1', workSlotKey: 'slot:BLOCK-1:ALLOC-2' },
    ),
    false,
    'sprzeczne workSlotKey musza zablokowac korelacje',
  )
  assert.equal(
    hasStrictCorrelation(
      { ...sameHumanTextOnly, taskId: 'TASK-1', serviceBlockId: 'BLOCK-1' },
      { ...sameHumanTextOnly, dateYmd: '2026-08-07', taskId: 'TASK-1', serviceBlockId: 'BLOCK-1' },
    ),
    false,
    'ta sama seria w innym dniu nie jest tym samym wystąpieniem',
  )
})

test('przeciaganie w tygodniu zachowuje dzien komorki planera', () => {
  const dropTarget = extractNamedFunction(calendarSource, 'calendarTimelineDropTargetFromEvent')
  const movedOrder = extractNamedFunction(calendarSource, 'calendarTimelineBuildMovedOrder')
  const freeWindow = extractNamedFunction(calendarSource, 'calendarTimelineNearestFreeBufferWindow')

  assert.match(dropTarget, /data-calendar-planning-day-index/)
  assert.match(movedOrder, /calendarTimelineRangeForView\(appState\.calendarViewMode/)
  assert.match(freeWindow, /calendarTimelineRangeForView\(appState\.calendarViewMode/)
  assert.doesNotMatch(movedOrder, /Array\.from\(\{ length: 3 \}/)
  assert.doesNotMatch(freeWindow, /Array\.from\(\{ length: 3 \}/)
})

test('panel live ma osobne zrodlo dzisiejszych zdarzen przy planowaniu przyszlego tygodnia', () => {
  const sourceRowsForDays = extractNamedFunction(calendarSource, 'calendarTimelineSourceRowsForDays')
  const ensureWorkerState = extractNamedFunction(calendarSource, 'calendarEnsureTimelineWorkerState')

  assert.match(stateSource, /calendarTimelineTodaySourceRows:\s*\[\]/)
  assert.match(sourceRowsForDays, /calendarTimelineTodaySourceRows/)
  assert.match(ensureWorkerState, /currentEventsResponse/)
  assert.match(ensureWorkerState, /currentWorkdaysResponse/)
})

test('klasyczne widoki nie dokladaja osobnych paskow uslug do dnia pracy', () => {
  const prototypeHtml = extractNamedFunction(calendarSource, 'calendarTimelinePrototypeHtml')
  const buildModel = extractNamedFunction(calendarSource, 'calendarTimelineBuildModel')

  assert.match(prototypeHtml, /calendarTimelineBuildModel\(days, hours\)/)
  assert.doesNotMatch(prototypeHtml, /calendarTimelineBuildModel\(days, hours, \{ includeServiceEvents: true \}\)/)
  assert.match(buildModel, /options\?\.includeServiceEvents === true/)
})

test('macierz tygodnia zachowuje wolnych pracownikow jako cele przypisania', () => {
  const matrixHtml = extractNamedFunction(calendarSource, 'calendarPlanningMatrixHtml')

  assert.match(matrixHtml, /filter\(\(\{ resource \}\) => resource\?\.type === ['"]worker['"]\)/)
  assert.doesNotMatch(matrixHtml, /filter\([^\n]*(?:started|hasPlan)/)
})

test('panel live pokazuje najpierw 30 najświeższych operacji i pozwala rozwinąć wszystkie', () => {
  const liveHtml = extractNamedFunction(calendarSource, 'calendarPlanningLiveHtml')
  const freshnessTimestamp = extractNamedFunction(calendarSource, 'calendarPlanningLiveFreshnessTimestamp')

  assert.doesNotMatch(liveHtml, /slice\(0,\s*10\)/)
  assert.match(liveHtml, /operations\.map/)
  assert.match(calendarSource, /const CALENDAR_PLANNING_LIVE_INITIAL_LIMIT = 30/)
  assert.match(liveHtml, /index >= CALENDAR_PLANNING_LIVE_INITIAL_LIMIT/)
  assert.match(liveHtml, /operations\.length - CALENDAR_PLANNING_LIVE_INITIAL_LIMIT/)
  assert.match(liveHtml, /hiddenCount \? `<button class="calendar-planning-live__more"/)
  assert.match(liveHtml, /Pokaż wszystkie \(\$\{operations\.length\}\)/)
  assert.match(freshnessTimestamp, /actualEndTimestamp \|\| actualStartTimestamp \|\| plannedStartTimestamp/)
  assert.match(freshnessTimestamp, /calendarTimelineOrderPlannedBounds\(planned\)\?\.startTs \|\| 0/)
  assert.match(liveHtml, /\.sort\(\(left, right\) => right\.freshnessTimestamp - left\.freshnessTimestamp \|\| left\.workerName\.localeCompare/)
  assert.doesNotMatch(liveHtml, /left\.priority - right\.priority/)
})

test('pusty bufor rozroznia brak planu od pelnej obsady', () => {
  const workspaceHtml = extractNamedFunction(calendarSource, 'calendarPlanningWorkspaceHtml')
  const assistBinding = calendarSource.slice(calendarSource.indexOf("binding.add(document.getElementById('calendarPlanningAssistBtn')"))

  assert.match(workspaceHtml, /const hasPlannedWork = plannedWorkerItems\.length > 0 \|\| bufferItems\.length > 0/)
  assert.match(workspaceHtml, /Wszystkie zaplanowane zlecenia w tym tygodniu mają obsadę/)
  assert.match(workspaceHtml, /Brak zleceń wymagających obsady w tym tygodniu/)
  assert.match(assistBinding, /Brak zaplanowanych zleceń w tym tygodniu/)
  assert.doesNotMatch(workspaceHtml, /\$\{bufferItems\.length\}\s+\$\{calendarTimelineCountLabel\(bufferItems\.length\)\}/)
})

test('panel live sygnalizuje niepelne zrodla danych', () => {
  const ensureWorkerState = extractNamedFunction(calendarSource, 'calendarEnsureTimelineWorkerState')
  const liveHtml = extractNamedFunction(calendarSource, 'calendarPlanningLiveHtml')

  assert.match(stateSource, /calendarTimelineWorkerStateIncomplete:\s*false/)
  assert.match(ensureWorkerState, /workerStateIncomplete = true/)
  assert.match(ensureWorkerState, /calendarTimelineWorkerStateIncomplete = workerStateIncomplete/)
  assert.match(liveHtml, /Dane niepełne/)
  assert.match(liveHtml, /\$\{activeCount\} \$\{activeCount === 1 \? 'aktywna' : 'aktywnych'\}/)
})

test('publikacja pozostaje zablokowana i jawnie opisana jako przygotowywana', () => {
  assert.match(templateSource, /id="calendarPlanningPublishBtn"[^>]*disabled/)
  assert.match(templateSource, /aria-describedby="calendarPlanningPublishNote"/)
  assert.match(templateSource, /Publikacja wersjonowana jest w przygotowaniu/)
})

test('uklad planowania ogranicza przewijanie do paneli wewnetrznych', () => {
  assert.doesNotMatch(planningCssSource, /min-width:\s*1220px/)
  assert.match(planningCssSource, /grid-template-columns:\s*minmax\(140px, 0\.8fr\)/)
  assert.match(planningCssSource, /\.calendar-planning-filter-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(72px, 0\.82fr\) minmax\(80px, 1fr\) minmax\(112px, 1\.35fr\)/)
  assert.match(planningCssSource, /\.fw-toolbar-right\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(160px, 1fr\) auto auto/)
  assert.match(planningCssSource, /\.is-planning-week #calendarTimelineDateInput\s*\{[\s\S]*display:\s*none !important;/)
  assert.match(planningCssSource, /\.calendar-planning-week::\-webkit-scrollbar-button\s*\{[\s\S]*display:\s*none;/)
  assert.match(planningCssSource, /@media \(max-width: 1439px\)[\s\S]*#portalRoot #view-calendar \.calendar-timeline-prototype > \.portal-page-hero[\s\S]*flex-direction:\s*column/)
  assert.match(planningCssSource, /@media \(max-width: 1439px\)[\s\S]*#portalRoot #view-calendar\s*\{[\s\S]*overflow-y:\s*visible !important;/)
  assert.match(planningCssSource, /\.fw-timeline-card\s*\{[\s\S]*max-height:\s*none !important;/)
  assert.match(planningCssSource, /#calendarPrototypeTimeline\s*\{[\s\S]*height:\s*auto !important;[\s\S]*max-height:\s*none !important;/)
  assert.match(planningCssSource, /@media \(max-width: 1439px\)[\s\S]*\.calendar-planning-live-grid\s*\{[\s\S]*min-width:\s*700px/)
})

test('desktopowy kalendarz odwzorowuje proporcje referencji bez skalowania portalu', () => {
  const referenceStart = planningCssSource.indexOf('/* Reference fidelity:')
  assert.notEqual(referenceStart, -1)
  const referenceEnd = planningCssSource.indexOf('/* Calendar polish:', referenceStart)
  assert.notEqual(referenceEnd, -1)
  const referenceCss = planningCssSource.slice(referenceStart, referenceEnd)
  const referenceBody = referenceCss.replace(/\/\*[\s\S]*?\*\//g, '')
  const referenceSelectorBlocks = [...referenceBody.matchAll(/([^{}]+)\{/g)]
    .map((match) => match[1].trim())
    .filter((selector) => selector && !selector.startsWith('@'))

  assert.match(planningCssSource, /@media \(min-width: 1440px\)/)
  assert.match(referenceCss, /\.calendar-timeline-prototype > \.portal-page-hero\s*\{[\s\S]*height:\s*83px/)
  assert.match(referenceCss, /grid-template-columns:\s*311px minmax\(0, 1fr\)/)
  assert.match(referenceCss, /\.calendar-planning-worker,[\s\S]*\.calendar-planning-day-cell\s*\{[\s\S]*height:\s*64px/)
  assert.match(referenceCss, /\.calendar-planning-live\s*\{[\s\S]*flex:\s*0 0 299px/)
  assert.match(referenceCss, /\.calendar-planning-live__body\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) 176px/)
  assert.ok(referenceSelectorBlocks.length > 40)
  referenceSelectorBlocks.forEach((selectorBlock) => {
    selectorBlock.split(',').forEach((selector) => {
      const scopedSelector = selector.trim()
      assert.ok(
        scopedSelector.startsWith('#portalRoot #view-calendar ') ||
          scopedSelector.startsWith('#portalRoot:has(#view-calendar:not([style*="display: none"]))'),
        `Nieskopowany selektor referencji: ${scopedSelector}`,
      )
    })
  })
  assert.doesNotMatch(referenceCss, /\bzoom\s*:|\bscale\s*:|transform\s*:[^;{}]*scale\s*\(/)
})

test('miesiac i bufor maja jednoznaczne etykiety dostepnosci', () => {
  const monthHtml = extractNamedFunction(calendarSource, 'calendarTimelineMonthHtml')
  const workspaceHtml = extractNamedFunction(calendarSource, 'calendarPlanningWorkspaceHtml')

  assert.match(monthHtml, /aria-label="Dodaj zlecenie na dzień/)
  assert.match(monthHtml, /Brak planu/)
  assert.match(workspaceHtml, /aria-label="Szukaj zadań w buforze"/)
})

test('stan interfejsu planowania przetrwa ponowny render', () => {
  const applyUiState = extractNamedFunction(calendarSource, 'calendarPlanningApplyUiState')
  const renderPrototype = extractNamedFunction(calendarSource, 'renderCalendarTimelinePrototype')

  assert.match(stateSource, /calendarPlanningBufferSearch:\s*['"]/)
  assert.match(stateSource, /calendarPlanningTypeFilter:\s*['"]all['"]/)
  assert.match(stateSource, /calendarPlanningObjectFilter:\s*['"]all['"]/)
  assert.match(stateSource, /calendarPlanningWorkerFilter:\s*['"]all['"]/)
  assert.match(stateSource, /calendarPlanningLiveCollapsed:\s*false/)
  assert.match(stateSource, /calendarPlanningLiveExpanded:\s*false/)
  assert.match(applyUiState, /week\.scrollLeft = Number\(snapshot\.weekScrollLeft/)
  assert.match(applyUiState, /focusTarget\.focus\(\{ preventScroll: true \}\)/)
  assert.match(renderPrototype, /const uiSnapshot = mode === ['"]week['"]/)
  assert.match(renderPrototype, /calendarPlanningApplyUiState\(stage, uiSnapshot\)/)
})

test('przelaczanie widoku zachowuje wybrany zakres kalendarza', () => {
  const bindView = extractNamedFunction(calendarSource, 'bindCalendarViewFunctions')

  assert.match(
    bindView,
    /calendarSwitchTimelineMode\([\s\S]*appState\.calendarCursorDay \|\| todayYmd\(\)/,
  )
})

test('filtry bufora maja wynik pusty, licznik i prawdziwe dzialanie', () => {
  const workspaceHtml = extractNamedFunction(calendarSource, 'calendarPlanningWorkspaceHtml')
  const applyUiState = extractNamedFunction(calendarSource, 'calendarPlanningApplyUiState')

  assert.match(templateSource, /Pokaż braki obsady/)
  assert.doesNotMatch(templateSource, /<div class="fw-toolbar-left"[^>]*aria-hidden="true"/)
  assert.match(workspaceHtml, /calendarPlanningFilterEmpty/)
  assert.match(workspaceHtml, /calendarPlanningBufferCount/)
  assert.match(applyUiState, /visibleCount/)
  assert.match(applyUiState, /visibleMissing/)
})

test('kalendarz zachowuje konflikt, lepki naglowek i dostepne sterowanie', () => {
  assert.match(planningCssSource, /\.calendar-planning-live-conflict\s*\{[\s\S]*display:\s*flex !important;/)
  assert.match(planningCssSource, /\.calendar-planning-worker\s*\{[\s\S]*position:\s*sticky;/)
  assert.match(planningCssSource, /\.calendar-planning-matrix__corner,[\s\S]*\.calendar-planning-day-head\s*\{[\s\S]*position:\s*sticky;/)
  assert.match(planningCssSource, /\.calendar-planning-filter-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(72px, 0\.82fr\) minmax\(80px, 1fr\) minmax\(112px, 1\.35fr\)/)
  assert.match(planningCssSource, /\.fw-toolbar-right\s*\{[\s\S]*grid-template-columns:\s*auto minmax\(160px, 1fr\) auto auto/)
  assert.match(planningCssSource, /\.is-planning-week #calendarTimelineDateInput\s*\{[\s\S]*display:\s*none !important;/)
  assert.match(planningCssSource, /\.calendar-planning-week::\-webkit-scrollbar-button\s*\{[\s\S]*display:\s*none;/)
  assert.match(planningCssSource, /\.calendar-planning-publish-btn:disabled\s*\{[\s\S]*opacity:\s*0\.64;/)
  assert.match(planningCssSource, /@media \(prefers-reduced-motion: reduce\)/)
  assert.match(planningCssSource, /min-height:\s*40px !important/)
  assert.match(calendarSource, /event\.key !== ['"]Escape['"]/)
  assert.match(calendarSource, /calendarTimelineTypePanel[\s\S]*button\.focus\(\{ preventScroll: true \}\)/)
})
