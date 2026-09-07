const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const moduleRoot = path.resolve(__dirname, "../web-app/apps/portal-web/src/features/workforce-schedule");

async function readScheduleSources() {
  const [content, overlays] = await Promise.all([
    readFile(path.join(moduleRoot, "ScheduleContent.jsx"), "utf8"),
    readFile(path.join(moduleRoot, "ScheduleOverlays.jsx"), "utf8"),
  ]);
  return { content, overlays };
}

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
