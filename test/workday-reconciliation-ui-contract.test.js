'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

test('dashboard kieruje oba rodzaje otwartych sesji do wspolnego dialogu', () => {
  const source = read('web-app/apps/portal-web/src/features/dashboard/index.js')
  const openCleanBlock = source.slice(
    source.indexOf('const openCleanYesterdayIssues = []'),
    source.indexOf('const cleanTooLongRows'),
  )

  assert.match(openCleanBlock, /action:\s*'workday-reconciliation'/)
  assert.match(openCleanBlock, /linkedWorkdayId\s*\?\?\s*openCleanRow\?\.workdayId/)
  assert.doesNotMatch(openCleanBlock, /hasQrStop/)
  assert.doesNotMatch(openCleanBlock, /dayEndAt/)
  assert.match(openCleanBlock, /isOpenWorkEvent\(row\)/)
  assert.match(source, /detail\?\.action === 'workday-reconciliation'/)
})

test('intencja z pulpitu otwiera dialog sesji zamiast starego edytora Workday', () => {
  const source = read('web-app/apps/portal-web/src/features/workers/account/index.js')
  const pendingBlock = source.slice(
    source.indexOf('function maybeOpenWorkerAccountPendingTimeEditor'),
    source.indexOf('function startWorkerAccountSectionLoads'),
  )

  assert.match(pendingBlock, /openWorkerAccountTimeCodes\(item\.dayKey,\s*\{ workdayId: intent\.workdayId \}\)/)
  assert.doesNotMatch(pendingBlock, /openWorkerAccountDayEditor/)
})

test('raport otwiera wspolny dialog i nie zapisuje zdarzen pojedynczo', () => {
  const source = read('web-app/apps/portal-web/src/features/reports/index.js')

  assert.match(source, /data-rep-history-reconcile-day/)
  assert.match(source, /source:\s*'reports-workday-reconciliation'/)
  assert.match(source, /source\?\.linkedWorkdayId\s*\?\?\s*source\?\.workdayId/)
  assert.match(source, /new CustomEvent\('worker-account-select'/)
  assert.doesNotMatch(source, /reportHistoryPromptStopDateTime/)
  assert.doesNotMatch(source, /await updateEvent/)
  assert.doesNotMatch(source, /data-rep-history-stop-day/)
  const workerDetailsBlock = source.slice(
    source.indexOf("if (tab === 'workers')"),
    source.indexOf('const body = details', source.indexOf("if (tab === 'workers')")),
  )
  assert.match(workerDetailsBlock, /data-rep-history-reconcile-day/)
  assert.doesNotMatch(workerDetailsBlock, /reportHistoryEditButtonHtml/)
})

test('raport pracownika sumuje tylko unie zamknietych par bez Date.now i obwiedni Workday', () => {
  const source = read('web-app/apps/portal-web/src/features/reports/index.js')
  const calculationBlock = source.slice(
    source.indexOf("return [...groups.values()]"),
    source.indexOf('function reportHistoryReadFilters'),
  )

  assert.match(calculationBlock, /closedSec:\s*normalizedTab === 'workers' \? uniqueClosedSec : bucket\.closedSec/)
  assert.doesNotMatch(calculationBlock, /Date\.now\(\)/)
  assert.doesNotMatch(calculationBlock, /activeRunningSec|activeDaySpanSec|daySpanSec/)
  assert.match(source, /isExplicitEvent && hasEventStart && !hasEventStop/)
})

test('pozostale sumy raportow uzywaja kanonicznej daty i zamknietych par', () => {
  const source = read('web-app/apps/portal-web/src/features/reports/index.js')
  const dayGroupBlock = source.slice(
    source.indexOf('function reportGroupByDay'),
    source.indexOf('function reportStats'),
  )
  const statsBlock = source.slice(
    source.indexOf('function reportStats'),
    source.indexOf('function reportRenderTable'),
  )

  assert.match(source, /function reportHistoryDayKey\(item\) \{\s*return reportBusinessDateYmd\(item\)/)
  assert.match(dayGroupBlock, /const dayKey = reportBusinessDateYmd\(item\)/)
  assert.match(dayGroupBlock, /const durationSec = reportEventDurationSec\(item\)/)
  assert.match(statsBlock, /items\.filter\(reportClosedEvent\)\.map\(reportEventDurationSec\)/)
  assert.doesNotMatch(source, /Number\(item\?*\.?durationSec/)
})

test('zapis rozliczenia wymaga obu wersji optimistic lock', () => {
  const source = read('web-app/apps/portal-web/src/features/workers/account/index.js')
  const saveBlock = source.slice(
    source.indexOf('async function saveWorkerAccountReconciliationChanges'),
    source.indexOf('function maybeOpenWorkerAccountPendingTimeEditor'),
  )
  const service = read('web-app/apps/portal-web/src/services/workdayReconciliationService.js')

  assert.match(saveBlock, /expectedUpdatedAt:\s*model\.version/)
  assert.match(saveBlock, /expectedSessionVersion:\s*model\.sessionVersion/)
  assert.match(service, /\^\[0-9a-f\]\{64\}\$/)
  assert.match(service, /expectedSessionVersion,/)
})

test('widok szczegolow czasu propaguje integralnosc i ostrzega bez blokowania eksportow', () => {
  const source = read('web-app/apps/portal-web/src/features/workers/time-detail/index.js')
  const aggregateBlock = source.slice(
    source.indexOf('function workerDetailAggregateRows'),
    source.indexOf('function workerDetailSelectionKey'),
  )
  const csvBlock = source.slice(
    source.indexOf('function downloadWorkerDetailEwidencjaCsv'),
    source.indexOf('async function downloadWorkerDetailEwidencjaPdf'),
  )
  const pdfBlock = source.slice(
    source.indexOf('async function downloadWorkerDetailEwidencjaPdf'),
    source.indexOf('function openWorkerDetailExportModal'),
  )

  assert.match(aggregateBlock, /aggregateWorkTimeDay\(bucket\.sourceRows\)/)
  assert.match(aggregateBlock, /integrityState:\s*dayAccounting\.integrityState/)
  assert.match(aggregateBlock, /integrityIssues:\s*dayAccounting\.integrityIssues/)
  assert.match(aggregateBlock, /issues:\s*dayAccounting\.integrityIssues/)
  assert.match(aggregateBlock, /openSessions:\s*dayAccounting\.openSessions/)
  assert.match(aggregateBlock, /workSec:\s*sessionSec/)
  assert.match(aggregateBlock, /realWorkSec/)
  assert.match(csvBlock, /workerDetailWarnAboutIncompleteRows\(rows\)/)
  assert.match(pdfBlock, /workerDetailWarnAboutIncompleteRows\(rows\)/)
  assert.match(source, /incompleteWorkTimeRows\(rows\)/)
  assert.doesNotMatch(source, /assertWorkTimeRowsExportable\(rows\)/)
})

test('niekompletne dni nie blokuja przyciskow, podgladu ani pobierania PDF i CSV', () => {
  const accountSource = read('web-app/apps/portal-web/src/features/workers/account/index.js')
  const evidenceExportSource = read('web-app/apps/portal-web/src/features/workers/work_time_evidence_export.js')
  const profileExportSource = read('web-app/apps/portal-web/src/features/workers/work_time_export.js')
  const csvDownloadBlock = evidenceExportSource.slice(
    evidenceExportSource.indexOf('export function downloadWorkTimeEvidenceCsv'),
    evidenceExportSource.indexOf('export async function downloadWorkTimeEvidencePdf'),
  )
  const pdfDownloadBlock = evidenceExportSource.slice(
    evidenceExportSource.indexOf('export async function downloadWorkTimeEvidencePdf'),
    evidenceExportSource.indexOf('export function workTimeEvidenceErrorMessage'),
  )
  const profilePdfBlock = profileExportSource.slice(
    profileExportSource.indexOf('export async function downloadWorkTimeEwidencjaPdf'),
  )

  assert.match(accountSource, /const canDownload = rows\.length > 0 && columns\.length > 0/)
  assert.match(accountSource, /Eksport nadal jest dostępny/)
  assert.doesNotMatch(accountSource, /Eksport jest zablokowany/)
  assert.doesNotMatch(csvDownloadBlock, /assertWorkTimeRowsExportable/)
  assert.doesNotMatch(pdfDownloadBlock, /assertWorkTimeRowsExportable/)
  assert.doesNotMatch(profilePdfBlock, /assertWorkTimeRowsExportable/)
})

test('dialog rozliczenia ma tekstowy status i prosty zapis zmian', () => {
  const source = read('web-app/apps/portal-web/src/features/workers/account/index.js')
  const template = read('web-app/apps/portal-web/src/features/workers/account/template.html')
  assert.match(template, /id="waReconciliationStatus"/)
  assert.match(template, /id="waReconciliationLive"[^>]*aria-live="polite"/)
  assert.match(template, /id="waReconciliationProblems"[^>]*role="alert"/)
  assert.doesNotMatch(template, /waReconciliationSaveDraft|waReconciliationFinalize|waReconciliationReason/)
  assert.doesNotMatch(template, /Naprawa i dane dnia|Dane dnia \(legacy Workday\)/)
  assert.doesNotMatch(template, /id="waDayEditorOverlay"/)
  assert.match(source, /code === 'MULTIPLE_WORKDAYS_FOR_BUSINESS_DATE'\) return false/)
  assert.match(source, /code === 'EMPTY_SESSION_SET' && sessions\.length > 0/)
})

test('dialog sesji zachowuje zwarty wyglad START i STOP z jednym lacznym czasem', () => {
  const source = read('web-app/apps/portal-web/src/features/workers/account/index.js')
  const template = read('web-app/apps/portal-web/src/features/workers/account/template.html')
  const style = read('web-app/apps/portal-web/src/features/workers/account/style.css')
  const renderBlock = source.slice(
    source.indexOf('function reconciliationSessionMarkup'),
    source.indexOf('function refreshWorkerAccountReconciliationControls'),
  )

  assert.match(source, /title\.textContent = `Start i stop - \$\{dateLabel\}`/)
  assert.match(source, /meta\.textContent = `\$\{codeCount\} \$\{codeLabel\} START\/STOP`/)
  assert.match(renderBlock, /\{ type: 'START'/)
  assert.match(renderBlock, /\{ type: 'STOP'/)
  assert.match(renderBlock, /wa-time-code-item \$\{stateClasses\}/)
  assert.match(template, /class="wa-time-codes-total"/)
  assert.match(template, /\u0141\u0105czny czas pracy/)
  assert.match(template, /id="waTimeCodesDone"[^>]*>Gotowe</)
  assert.match(style, /width:\s*min\(820px, calc\(100vw - 32px\)\)/)
  assert.match(style, /\.wa-time-code-item \.wa-time-code-controls\s*\{[\s\S]*grid-column:\s*2 \/ -1/)
})

test('dialog pokazuje godziny START i STOP bez sekund', () => {
  const source = read('web-app/apps/portal-web/src/features/workers/account/index.js')
  const formatterBlock = source.slice(
    source.indexOf('function reconciliationTimeInput'),
    source.indexOf('function setWorkerAccountTimeCodesOpen'),
  )

  assert.match(formatterBlock, /timeValue\.slice\(0, 5\)/)
})

test('dialog edytuje pojedynczy wpis przez menu trzech kropek', () => {
  const source = read('web-app/apps/portal-web/src/features/workers/account/index.js')
  const template = read('web-app/apps/portal-web/src/features/workers/account/template.html')

  assert.match(source, /data-wa-session-time/)
  assert.match(source, /data-wa-session-zone/)
  assert.match(source, /data-wa-activity-start/)
  assert.match(source, /data-wa-activity-end/)
  assert.match(source, /ph ph-dots-three-vertical/)
  assert.match(source, /data-wa-session-toggle/)
  assert.match(source, /data-wa-activity-toggle/)
  assert.match(source, /Zapisz zmianę/)
  assert.match(source, /reconciliationZoneOptions\(session\)/)
  assert.match(source, /zoneId:\s*correction\.zoneId/)
  assert.doesNotMatch(template, /waTimeCodeEditor|waReconciliationEditPrimary|waReconciliationRepair/)
  assert.doesNotMatch(template, /bezpiecznego rejestru korekt czasu pracy/i)
  assert.match(source, /addWorkerAccountSessionCorrection\(sessionApply\)/)
  assert.match(source, /addWorkerAccountActivityCorrection\(activityApply\)/)
  assert.match(source, /void saveWorkerAccountReconciliationChanges\(false\)/)
  assert.match(source, /selectedWorkerLogin[\s\S]*reconciliation\?\.editable === false/)
})

test('uprawnienia edycji czasu uwzgledniaja kod i poziom roli sesji', () => {
  const source = read('web-app/apps/portal-web/src/ui/portalApp.js')
  const accessBlock = source.slice(
    source.indexOf('function currentSessionRoleLevel'),
    source.indexOf('function canDeleteWorkers'),
  )

  assert.match(accessBlock, /roleLevel\(appState\.session\?\.role\)/)
  assert.match(accessBlock, /roleLevel\(appState\.session\?\.roleCode\)/)
  assert.match(accessBlock, /Number\(appState\.session\?\.roleLevel\)/)
  assert.match(accessBlock, /function canManageWorkers\(\)[\s\S]*currentSessionRoleLevel\(\) >= 2/)
  assert.match(accessBlock, /function canAdministerWorkers\(\)[\s\S]*currentSessionRoleLevel\(\) >= 3/)
})

test('tabela dnia pokazuje brak STOP przez etykiete i zolte tlo rekordu', () => {
  const source = read('web-app/apps/portal-web/src/features/workers/account/index.js')
  const style = read('web-app/apps/portal-web/src/features/workers/account/style.css')
  const tableBlock = source.slice(
    source.indexOf('function renderTimeTable'),
    source.indexOf('function renderAllTables'),
  )

  assert.doesNotMatch(tableBlock, /Brak STOP sesji|Brak STOP zdarzenia/)
  assert.match(tableBlock, /openActivityCountForDay\(row\)/)
  assert.match(tableBlock, /isCurrentOpenDay/)
  assert.match(tableBlock, /hasOpenSession \? 'BRAK'/)
  assert.match(tableBlock, /has-missing-stop/)
  assert.match(style, /\.worker-account-time-row\.has-missing-stop\s*\{[\s\S]*background:\s*#fff8df/)
})

test('tabela czasu wzbogaca dane zgodnie z kanonicznym endpointem dni', () => {
  const source = read('web-app/apps/portal-web/src/features/workers/account/index.js')

  assert.match(source, /getWorkTimeDays\(appState\.session\.orgId/)
  assert.match(source, /applyCanonicalWorkTimeDays\(/)
  assert.match(source, /openActivityCount:/)
})

test('tabela czasu pokazuje osobny wiersz dla kazdego cyklu START STOP dnia', () => {
  const source = read('web-app/apps/portal-web/src/features/workers/account/index.js')
  const renderBlock = source.slice(
    source.indexOf('function renderTimeTable'),
    source.indexOf('function renderAllTables'),
  )
  const historyButtonBlock = source.slice(
    source.indexOf('function workerAccountTimeCodesButton'),
    source.indexOf('function _editIconButton'),
  )

  assert.match(renderBlock, /workTimeCycleRowsFromDays\(appState\.workerAccountTimeRows\)/)
  assert.match(historyButtonBlock, /row\?\.workdayId \?\? preferredSource\?\.workdayId/)
})

test('dialog scala dokladne duplikaty i wysyla korekte do kazdego rekordu zrodlowego', () => {
  const source = read('web-app/apps/portal-web/src/features/workers/account/index.js')

  assert.match(source, /scalono \$\{sourceRecordCount\}/)
  assert.match(source, /sourceWorkdayIds:\s*\[\.\.\.new Set/)
  assert.match(source, /attendanceCorrections:\s*attendanceDrafts\.flatMap/)
  assert.match(source, /return sourceWorkdayIds\.map\(\(workdayId\) =>/)
})

test('dialog ukrywa techniczny GPS w komentarzu i zachowuje dedykowana ikone', () => {
  const source = read('web-app/apps/portal-web/src/features/workers/account/index.js')
  const activityBlock = source.slice(
    source.indexOf('function reconciliationActivityMarkup'),
    source.indexOf('function reconciliationSessionMarkup'),
  )

  assert.match(activityBlock, /workIntervalVisibleComment\(activity\.comment\)/)
  assert.match(activityBlock, /workerAccountTimeCodeGpsIndicator\(code\)/)
  assert.doesNotMatch(activityBlock, /escapeHtml\(activity\.comment\)/)
})

test('dashboard oddziela zatwierdzony, roboczy i aktywny czas', () => {
  const dashboard = read('web-app/apps/portal-web/src/features/dashboard/index.js')
  const service = read('web-app/apps/portal-web/src/services/workdayService.js')
  const summaryBlock = dashboard.slice(
    dashboard.indexOf('function dashboardBuildSummary'),
    dashboard.indexOf('function renderDashboardSummary'),
  )

  assert.match(service, /activeElapsedSec,/)
  assert.match(service, /closedSessionsSec,/)
  assert.match(service, /confirmedSec,/)
  assert.match(service, /provisionalSec,/)
  assert.doesNotMatch(service, /bucket\.closedSec \+ activeSec/)
  assert.match(summaryBlock, /workSessionConfirmedTotalSeconds\(normalizedTodayRows\)/)
  assert.match(dashboard, /Czas zatwierdzony/)
  assert.match(dashboard, /Czas roboczy/)
  assert.match(dashboard, /Aktywna od/)
})

test('oficjalny dashboard nie uzywa diagnostycznej sciezki legacy-events', () => {
  const dashboard = read('web-app/apps/portal-web/src/features/dashboard/index.js')
  const service = read('web-app/apps/portal-web/src/services/workdayService.js')
  const fastLoadBlock = dashboard.slice(
    dashboard.indexOf('async function dashboardLoadFastRows'),
    dashboard.indexOf('async function dashboardSyncCalendarOrdersForTimeline'),
  )
  const legacyBlock = service.slice(
    service.indexOf("if (options?.source !== 'legacy-events')"),
    service.indexOf('export async function getDashboardSummary'),
  )

  assert.match(fastLoadBlock, /getTodayActiveWorkers\(orgId, \{ forceRefresh \}\)/)
  assert.doesNotMatch(fastLoadBlock, /legacy-events/)
  assert.match(legacyBlock, /Explicit diagnostic compatibility path only/)
  assert.match(legacyBlock, /const closedSessionsSec = workIntervalsTotalSeconds\(bucket\.closedSessionIntervals\)/)
  assert.match(legacyBlock, /const confirmedSec = 0/)
  assert.match(legacyBlock, /const provisionalSec = closedSessionsSec/)
})

test('time-detail pokazuje zatwierdzony i roboczy czas bez komunikatu o wymaganej finalizacji', () => {
  const source = read('web-app/apps/portal-web/src/features/workers/time-detail/index.js')
  const template = read('web-app/apps/portal-web/src/features/workers/time-detail/template.html')

  assert.match(source, /workSessionConfirmedTotalSeconds\(items\)/)
  assert.match(source, /workSessionProvisionalTotalSeconds\(items\)/)
  assert.match(source, /brak STOP/)
  assert.doesNotMatch(source, /roboczo · wymaga finalizacji/)
  assert.match(template, /id="wtdMonthWork"/)
  assert.match(template, /id="wtdMonthProvisional"/)
  assert.match(template, /Czas zatwierdzony/)
  assert.match(template, /Czas roboczy/)
  assert.match(template, /Start dnia/)
  assert.match(template, /Koniec dnia/)
  assert.match(template, /Czas sesji/)
})

test('tabela konta liczy czas z wielu sesji Workday i nie z Event', () => {
  const source = read('web-app/apps/portal-web/src/features/workers/account/index.js')
  const template = read('web-app/apps/portal-web/src/features/workers/account/template.html')
  const aggregateBlock = source.slice(
    source.indexOf('function aggregateTimeRows'),
    source.indexOf('function sortRowsByLatest'),
  )

  assert.match(aggregateBlock, /aggregateWorkTimeDay\(bucket\.sourceRows\)/)
  assert.match(aggregateBlock, /workSec:\s*sessionSec/)
  assert.match(aggregateBlock, /realWorkSec/)
  assert.match(aggregateBlock, /workerLogin:\s*bucket\.workerLogin \|\| workerLogin\(worker\)/)
  assert.match(source, /selectedWorkerLogin = String\(row\.workerLogin \|\| workerLogin\(selectedWorker\)/)
  assert.doesNotMatch(source, /roboczo · wymaga finalizacji/)
  const timeHeader = template.slice(
    template.indexOf('worker-account-time-table"'),
    template.indexOf('id="waTimeRows"'),
  )
  assert.match(timeHeader, /U&#380;ytkownik[\s\S]*Data[\s\S]*Start/)
  assert.doesNotMatch(timeHeader, /Klient/)
  assert.doesNotMatch(timeHeader, /checkbox|waTimeSelectAll/)
  assert.match(template, /<div>Start<\/div><div>Stop<\/div><div>Czas<\/div><div>Historia<\/div>/)
  assert.match(template, /<div>Przerwa<\/div><div>Edytowa&#322;<\/div>/)
})

test('podglad draftu liczy unie sesji wspolnym agregatorem', () => {
  const source = read('web-app/apps/portal-web/src/features/workers/account/index.js')
  const renderBlock = source.slice(
    source.indexOf('function renderWorkerAccountReconciliation'),
    source.indexOf('async function openWorkerAccountTimeCodes'),
  )

  assert.match(renderBlock, /workIntervalsTotalSeconds\(/)
  assert.doesNotMatch(renderBlock, /closedDraftSec = sessions\.reduce/)
})

test('account i time-detail grupuja po canonical businessDateYmd w Europe\/Warsaw', () => {
  const account = read('web-app/apps/portal-web/src/features/workers/account/index.js')
  const detail = read('web-app/apps/portal-web/src/features/workers/time-detail/index.js')

  assert.match(account, /row\.businessDateYmd \?\? row\.business_date_ymd \?\? row\.dayKey/)
  assert.match(account, /return warsawBusinessDateKey\(iso\)/)
  assert.match(detail, /row\.businessDateYmd \?\? row\.business_date_ymd \?\? row\.dayKey/)
  assert.match(detail, /warsawBusinessDateKey\(iso\)/)
  assert.match(account, /const businessToday = typeof todayYmd === 'function' \? todayYmd\(\) : ''/)
  assert.match(detail, /const businessToday = todayYmd\(\)/)
})

test('tabela czasu rezerwuje miejsce na pracownika, HH:MM:SS, status i osobna historie dnia', () => {
  const source = read('web-app/apps/portal-web/src/features/workers/account/index.js')
  const style = read('web-app/apps/portal-web/src/features/workers/account/style.css')

  assert.match(style, /worker-account-time-table\s*\{[\s\S]*minmax\(160px, 1\.5fr\)/)
  assert.match(style, /worker-account-time-table \.events-head,[\s\S]*min-width:\s*860px !important/)
  assert.match(style, /\.wa-time-history-cell\s*\{[\s\S]*place-items:\s*center/)
  assert.match(source, /<div class="wa-time-history-cell">\$\{workerAccountTimeCodesButton\(row\)\}<\/div>/)
  assert.match(style, /worker-account-time-row \.time-start,[\s\S]*min-width:\s*78px/)
  assert.match(style, /\.wa-time-summary-kpi\s*\{[\s\S]*"value value"/)
  assert.match(style, /\.wa-time-summary-kpi strong\s*\{[\s\S]*white-space:\s*nowrap/)
  assert.match(style, /\.wa-time-summary-kpi strong\s*\{[\s\S]*text-align:\s*center/)
  assert.match(style, /worker-account-time-table \.wa-time-work-cell\s*\{[\s\S]*place-items:\s*center/)
  assert.match(style, /#view-workerAccount\s*\{[\s\S]*overflow-x:\s*clip/)
  assert.match(style, /worker-account-table\.worker-account-time-table\s*\{[\s\S]*overflow-x:\s*auto !important/)
  assert.match(style, /worker-account-time-list-card\s*\{[\s\S]*padding:\s*0/)
  assert.match(style, /worker-account-time-list-card \.worker-account-time-table\s*\{[\s\S]*overflow-y:\s*hidden !important[\s\S]*border:\s*0 !important[\s\S]*scrollbar-gutter:\s*auto/)
  assert.match(style, /wa-time-codes-total > \[hidden\]\s*\{[\s\S]*display:\s*none !important/)
  assert.match(style, /wa-time-codes-total > strong\s*\{[\s\S]*justify-self:\s*end[\s\S]*text-align:\s*right/)
  assert.doesNotMatch(source, /'duplikat dnia'/)
})

test('wczesny odczyt cache zlecen nie wymaga gotowego modulu kalendarza', () => {
  const source = read('web-app/apps/portal-web/src/ui/portalApp.js')
  const block = source.slice(
    source.indexOf('function ordersListSourceOrders'),
    source.indexOf('function calendarTimelineOrderDurationMinutes'),
  )

  assert.match(block, /calendarFeature\?\.listSourceOrders\?\./)
  assert.match(block, /\?\? \[\]/)
  assert.doesNotMatch(block, /getCalendarFeature\(\)/)
})

test('edytor zdarzen zapisuje powiazany rekord lokalnie przez audytowany endpoint dnia', () => {
  const events = read('web-app/apps/portal-web/src/features/events/index.js')
  const service = read('web-app/apps/portal-web/src/services/workdayService.js')
  const backend = read('index.js')
  const docs = read('docs/workday-reconciliation.md')

  const openBlock = events.slice(
    events.indexOf('async function openEventEditor'),
    events.indexOf('async function openCreateEventEditor'),
  )
  const saveBlock = events.slice(
    events.indexOf('async function saveEventEditor'),
    events.indexOf('function closeEventDeleteConfirmation'),
  )

  assert.match(events, /function eventReconciliationWorkdayId/)
  assert.match(events, /function eventEditorLoadCorrectionContext/)
  assert.match(openBlock, /usesDayCorrection/)
  assert.match(openBlock, /eventEditorLoadCorrectionContext\(item\)/)
  assert.doesNotMatch(openBlock, /openEventWorkdayReconciliation\(item\)/)
  assert.match(events, /return !eventReconciliationWorkdayId\(row\) && eventDeletionCandidateIds\(row\)\.length > 0/)
  assert.doesNotMatch(saveBlock, /legacyEventCreationIsDisabled/)
  assert.match(saveBlock, /eventReconciliationWorkdayId\(appState\.eventEditorItem\)/)
  assert.match(saveBlock, /saveWorkTimeDay\(/)
  assert.match(saveBlock, /attendanceCorrections:\s*isWorkdayRecord \? \[correction\] : \[\]/)
  assert.match(saveBlock, /activityCorrections:\s*isWorkdayRecord \? \[\] : \[correction\]/)
  assert.doesNotMatch(saveBlock, /openEventWorkdayReconciliation\(reconciliationRow\)/)
  assert.match(service, /WORKDAY_RECONCILIATION_REQUIRED/)
  assert.match(backend, /assertPortalEventDeleteOutsideReconciliation/)
  assert.match(backend, /publicCode = 'WORKDAY_RECONCILIATION_REQUIRED'/)
  assert.match(docs, /jedynym kontrolowanym procesem korekt czasu pracy/)
})
