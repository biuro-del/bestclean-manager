const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const moduleRoot = path.resolve(__dirname, "../web-app/apps/portal-web/src/features/workforce-schedule");

async function readScheduleSources() {
  const [content, overlays, styles] = await Promise.all([
    readFile(path.join(moduleRoot, "ScheduleContent.jsx"), "utf8"),
    readFile(path.join(moduleRoot, "ScheduleOverlays.jsx"), "utf8"),
    readFile(path.join(moduleRoot, "schedule.css"), "utf8"),
  ]);
  return { content, overlays, styles };
}

test("opcje widoku używają standardowych checkboxów 18 na 18 px", async () => {
  const { content, styles } = await readScheduleSources();

  assert.match(content, /className="tm-schedule-option-checkbox"/);
  assert.match(content, /className="tm-schedule-option-checkbox"[\s\S]{0,320}type="checkbox"/);
  assert.doesNotMatch(content, /className="tm-schedule-option-checkbox"[\s\S]{0,320}role="switch"/);
  assert.match(styles, /#portalRoot \.tm-schedule-menu input\.tm-schedule-option-checkbox\s*\{[\s\S]{0,320}width:\s*18px\s*!important;[\s\S]{0,160}min-width:\s*18px\s*!important;[\s\S]{0,160}height:\s*18px\s*!important;[\s\S]{0,160}min-height:\s*18px\s*!important;[\s\S]{0,200}padding:\s*0\s*!important;/);
  assert.match(styles, /\.tm-schedule-menu button,\s*\.tm-schedule-menu label\s*\{[\s\S]{0,120}min-height:\s*38px;/);
});

test("filtry Grafiku łączą lokalizację, zespół mobilny i konkretną osobę", async () => {
  const { content } = await readScheduleSources();

  assert.match(content, /const \[workerTypeFilter, setWorkerTypeFilter\] = useState\("all"\)/);
  assert.match(content, /<span className="tm-sr-only">Filtr lokalizacji<\/span>/);
  assert.match(content, /<span className="tm-sr-only">Filtr zespołu<\/span>[\s\S]{0,260}<option value="mobile">Zespół mobilny<\/option>/);
  assert.match(content, /<span className="tm-sr-only">Filtr użytkownika<\/span>/);
  assert.match(content, /filterShiftsByWorkerType\(matchingShifts, users, workerTypeFilter\)/);
  assert.match(content, /filterScheduleUsers\(users, weekShifts, \{[\s\S]{0,220}locationId: locationFilter,[\s\S]{0,120}userId: userFilter,[\s\S]{0,120}workerType: workerTypeFilter/);
  assert.match(content, /resourceUsers=\{resourceUsers\}/);
  assert.match(content, /const rowUsers = Array\.isArray\(resourceUsers\) \? resourceUsers : users/);
  assert.match(content, /const resources = grouping === "location" \? locations : rowUsers\.map/);
});

test("formularz zmiany może ograniczyć listę obsady do zespołu mobilnego", async () => {
  const { overlays, styles } = await readScheduleSources();

  assert.match(overlays, /const \[mobileAssigneesOnly, setMobileAssigneesOnly\] = useState\(false\)/);
  assert.match(overlays, /filterScheduleAssigneeUsers\(users, form\.assigneeIds, mobileAssigneesOnly\)/);
  assert.match(overlays, /aria-describedby=\{mobileFilterStatusId\}[\s\S]{0,180}checked=\{mobileAssigneesOnly\}[\s\S]{0,180}setMobileAssigneesOnly\(event\.target\.checked\)[\s\S]{0,180}Tylko zespół mobilny/);
  assert.match(overlays, /\{visibleUsers\.map\(\(user\) =>/);
  assert.match(overlays, /selectedOutsideFilter[\s\S]{0,520}wybrany poza zespołem mobilnym/);
  assert.match(overlays, /<small aria-atomic="true" aria-live="polite" id=\{mobileFilterStatusId\} role="status">[\s\S]{0,360}selectedOutsideMobileCount/);
  assert.match(overlays, /restoreFilterFocus[\s\S]{0,520}mobileFilterRef\.current\?\.focus\(\)/);
  assert.match(overlays, /Brak osób w zespole mobilnym/);
  assert.match(overlays, /return createPortal\([\s\S]{0,900}document\.body,/);
  assert.match(styles, /\.tm-schedule-shift-drawer \.tm-schedule-form-grid \.tm-schedule-assignee-filter-row input\[type="checkbox"\]\s*\{[\s\S]{0,220}width:\s*18px !important;[\s\S]{0,180}height:\s*18px !important;/);
  assert.match(styles, /\.tm-schedule-shift-drawer \.tm-schedule-form-grid \.tm-schedule-assignees > label > input\[type="checkbox"\]\s*\{[\s\S]{0,220}width:\s*18px !important;[\s\S]{0,180}height:\s*18px !important;/);
  assert.match(styles, /\.tm-schedule-shift-drawer \.tm-schedule-form-grid \.tm-schedule-assignee-filter-row input\[type="checkbox"\]:focus-visible,[\s\S]{0,300}outline:\s*2px solid/);
  assert.doesNotMatch(styles, /#portalRoot \.tm-schedule-form-grid \.tm-schedule-assignee-filter-row input\[type="checkbox"\]/);
  assert.doesNotMatch(styles, /#portalRoot \.tm-schedule-form-grid \.tm-schedule-assignees > label > input\[type="checkbox"\]/);
});

test("Filtry pozostają dostępne i opisane na ekranach do 680 px", async () => {
  const { content, styles } = await readScheduleSources();
  const mobileStart = styles.indexOf("@media (max-width: 680px)");
  const nextBreakpoint = styles.indexOf("@media (max-width:", mobileStart + 1);
  const mobileStyles = styles.slice(mobileStart, nextBreakpoint >= 0 ? nextBreakpoint : styles.length);

  assert.ok(mobileStart >= 0, "Brakuje breakpointu mobilnego 680 px");
  assert.match(content, /aria-controls="workforceScheduleFilters"[^>]*aria-expanded=\{filtersOpen\}[^>]*aria-label="Filtry grafiku"[^>]*className="tm-schedule-filter-button"/);
  assert.match(content, /className="tm-schedule-subtoolbar" id="workforceScheduleFilters"/);
  assert.match(mobileStyles, /grid-template-columns:\s*auto auto 1fr auto;/);
  assert.match(mobileStyles, /> button:not\(\.tm-schedule-date-button\):not\(\.tm-schedule-filter-button\)\s*\{\s*display:\s*none;/);
  assert.match(mobileStyles, /\.tm-schedule-filter-button\s*\{[^}]*width:\s*38px;[^}]*min-width:\s*38px;[^}]*justify-content:\s*center;/);
  assert.doesNotMatch(mobileStyles, /> button:not\(\.tm-schedule-date-button\)\s*\{\s*display:\s*none;/);
});

async function loadScheduleModel() {
  return import(pathToFileURL(path.join(moduleRoot, "scheduleModel.js")).href);
}

test("Dzisiaj wraca do rzeczywistej daty i nie odtwarza początkowego tygodnia snapshotu", async () => {
  const { content } = await readScheduleSources();

  assert.match(content, /<button[^>]*onClick=\{goToToday\}[^>]*>Dzisiaj<\/button>/);
  assert.doesNotMatch(content, /setWeekStart\(source\.weekStart\)/);
  assert.match(content, /const goToToday\s*=\s*\(\)\s*=>\s*\{[\s\S]{0,320}setSelectedDay\(todayIso\)[\s\S]{0,160}setWeekStart\(mondayFor\(todayIso\)\)[\s\S]{0,160}setMonthAnchor\(monthStartFor\(todayIso\)\)/);
});

test("nawigacja miesiąca używa miesięcy kalendarzowych, a nie stałego skoku 28 dni", async () => {
  const { content } = await readScheduleSources();

  assert.doesNotMatch(content, /viewMode\s*===\s*["']month["']\s*\?\s*28/);
  assert.match(content, /if\s*\(viewMode\s*===\s*["']month["']\)\s*\{[\s\S]{0,220}setMonthAnchor\([^\n]*addMonths/);
});

test("helpery okresów wyznaczają poniedziałek i przesuwają pełne miesiące", async () => {
  const { addMonths, mondayFor, monthStartFor } = await loadScheduleModel();

  assert.equal(mondayFor("2026-09-06"), "2026-08-31");
  assert.equal(monthStartFor("2026-09-06"), "2026-09-01");
  assert.equal(addMonths("2026-12-01", 1), "2027-01-01");
  assert.equal(addMonths("2026-03-01", -1), "2026-02-01");
});

test("wejście z tygodnia na granicy miesięcy otwiera miesiąc zaznaczonego dnia", async () => {
  const { content } = await readScheduleSources();

  assert.match(content, /if\s*\(nextMode\s*===\s*["']month["']\)\s*\{[\s\S]{0,180}setMonthAnchor\(monthStartFor\(selectedDay\)\)/);
});

test("panel zmiany nie pokazuje generowanej lokalnie atrapy Aktywności", async () => {
  const { overlays } = await readScheduleSources();

  assert.doesNotMatch(overlays, /Przygotowano nową zmianę|Wczytano istniejącą zmianę|Bieżąca sesja|Oczekuje na zapis/);
  assert.doesNotMatch(overlays, /["']activity["']\s*,\s*["']Aktywność["']/);
});

test("w trybie internal i deliveryDisabled edytor ma jeden przycisk zapisu", async () => {
  const { overlays } = await readScheduleSources();
  const internalBranch = overlays.match(/\{deliveryDisabled\s*\?\s*\(?\s*(<button\b[\s\S]*?<\/button>)\s*\)?\s*:\s*\(?/);

  assert.ok(internalBranch, "Brakuje osobnej gałęzi zapisu dla deliveryDisabled");
  assert.equal((internalBranch[1].match(/<button\b/g) || []).length, 1);
  assert.match(internalBranch[1], /onClick=\{\(\) => save\(false\)\}/);
  assert.match(internalBranch[1], /Zapisz(?: jako)? szkic/);
});

test("edytor zmiany i dialog zatwierdzenia nie mogą zamknąć się podczas mutacji", async () => {
  const { overlays } = await readScheduleSources();

  assert.match(overlays, /function PortalDialog\(\{[^}]*closeLocked\s*=\s*false/);
  assert.match(overlays, /const requestClose\s*=\s*\(\)\s*=>\s*\{\s*(?:if\s*\(!closeLocked\)\s*onClose\?\.\(\)|if\s*\(closeLocked\)\s*return)/);
  assert.match(overlays, /useDialogA11y\(ref,\s*requestClose\)/);
  assert.match(overlays, /onMouseDown=\{\(event\)\s*=>\s*event\.target\s*===\s*event\.currentTarget\s*&&\s*requestClose\(\)\}/);
  assert.match(overlays, /<PortalDialog[^>]*className="tm-schedule-shift-drawer"[^>]*closeLocked=\{busy\}|<PortalDialog[^>]*closeLocked=\{busy\}[^>]*className="tm-schedule-shift-drawer"/);
  assert.match(overlays, /<IconButton[^>]*disabled=\{busy\}[^>]*label="Zamknij edycję zmiany"|<IconButton[^>]*label="Zamknij edycję zmiany"[^>]*disabled=\{busy\}/);
  assert.match(overlays, /<PortalDialog[^>]*className="tm-schedule-publish-dialog"[^>]*closeLocked=\{busy\}|<PortalDialog[^>]*closeLocked=\{busy\}[^>]*className="tm-schedule-publish-dialog"/);
  assert.match(overlays, /<IconButton[^>]*disabled=\{busy\}[^>]*label=\{deliveryDisabled\s*\?|<IconButton[^>]*label=\{deliveryDisabled\s*\?[^>]*disabled=\{busy\}/);
  assert.match(overlays, /<PortalDialog[^>]*className="tm-schedule-copy-dialog"[^>]*closeLocked=\{locked\}|<PortalDialog[^>]*closeLocked=\{locked\}[^>]*className="tm-schedule-copy-dialog"/);
  assert.match(overlays, /<PortalDialog[^>]*className="tm-schedule-settings-dialog"[^>]*closeLocked=\{locked\}|<PortalDialog[^>]*closeLocked=\{locked\}[^>]*className="tm-schedule-settings-dialog"/);
});

test("nowa zmiana ma kompletne i dostępne ustawienia powtarzania", async () => {
  const { overlays, styles } = await readScheduleSources();

  assert.match(overlays, /\{isNew && <section className="tm-schedule-recurrence is-wide">/);
  assert.match(overlays, /Powtarzanie/);
  assert.match(overlays, /Codziennie/);
  assert.match(overlays, /Co tydzień/);
  assert.match(overlays, /Co miesiąc/);
  assert.match(overlays, /max="30" min="1"/);
  assert.match(overlays, /RECURRENCE_WEEKDAYS\.map/);
  assert.match(overlays, /DAY_OF_MONTH/);
  assert.match(overlays, /NTH_WEEKDAY/);
  assert.match(overlays, /LAST_DAY/);
  assert.match(overlays, /name="scheduleRecurrenceEnd"[\s\S]{0,260}type="radio"/);
  assert.match(overlays, /aria-label="Liczba wystąpień"/);
  assert.match(overlays, /aria-label="Data zakończenia powtarzania"/);
  assert.match(overlays, /role="alert">\{recurrenceError\}/);
  assert.match(styles, /\.tm-schedule-recurrence-weekdays\s*\{[\s\S]{0,180}grid-template-columns:\s*repeat\(7/);
  assert.match(styles, /@media \(max-width: 400px\)[\s\S]{0,360}\.tm-schedule-recurrence-weekdays\s*\{[^}]*repeat\(4/);
});

test("licznik zasobu w widoku tygodnia obejmuje wszystkie siedem dni", async () => {
  const { content } = await readScheduleSources();

  assert.doesNotMatch(content, /resourceShifts\(resource\.id,\s*days\[0\]\)/);
  assert.match(content, /const resourceWeekShiftCount\s*=\s*\(resourceId\)\s*=>\s*days\.reduce\([\s\S]{0,180}resourceShifts\(resourceId,\s*day\)\.length/);
  assert.match(content, /resourceWeekShiftCount\(resource\.id\)[^\n]{0,100}zmian w tygodniu/);
});

test("dodanie zmiany z komórki pracownika przekazuje i wstępnie zaznacza personId", async () => {
  const { content } = await readScheduleSources();

  assert.match(content, /preferredLocationId=\{locationFilter\s*===\s*["']all["']\s*\?\s*["']["']\s*:\s*locationFilter\}/);
  assert.match(content, /const activeLocation\s*=\s*preferredLocationId\s*\?\s*locations\.find\(\(location\)\s*=>\s*location\.id\s*===\s*preferredLocationId\s*&&\s*isCatalogSelectable\(location\)\)\s*:\s*locations\.find\(isCatalogSelectable\)/);
  assert.match(content, /onCellClick\(day,\s*grouping\s*===\s*["']location["']\s*\?\s*resource\.id\s*:\s*activeLocation\.id,\s*grouping\s*===\s*["']user["']\s*\?\s*resource\.id\s*:\s*["']["']\)/);
  assert.match(content, /const openNewShift\s*=\s*\([^)]*assigneeId[^)]*\)\s*=>/);
  assert.match(content, /users\.find\([^\n]*candidate\.id\s*===\s*assigneeId[^\n]*isCatalogSelectable\(candidate\)/);
  assert.match(content, /assigneeIds:\s*assignee\s*\?\s*\[assignee\.id\]\s*:\s*\[\]/);
});
