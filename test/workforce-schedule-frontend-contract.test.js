const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const moduleRoot = path.resolve(__dirname, "../web-app/apps/portal-web/src/features/workforce-schedule");

async function loadContract() {
  return import(pathToFileURL(path.join(moduleRoot, "scheduleContract.js")).href);
}

test("empty input remains empty and never falls back to sample catalog data", async () => {
  const { normalizeWorkforceScheduleSnapshot } = await loadContract();
  const snapshot = normalizeWorkforceScheduleSnapshot({
    todayIso: "2026-09-06",
    weekStart: "2026-08-31",
  });

  assert.deepEqual(snapshot.users, []);
  assert.deepEqual(snapshot.locations, []);
  assert.deepEqual(snapshot.shifts, []);
  assert.deepEqual(snapshot.requests, []);
  assert.deepEqual(snapshot.templates, []);
  assert.equal(snapshot.todayIso, "2026-09-06");
  assert.equal(snapshot.weekStart, "2026-08-31");
});

test("snapshot preserves real catalog identifiers and derives Monday from today", async () => {
  const { normalizeWorkforceScheduleSnapshot } = await loadContract();
  const users = [{ id: "W065", firstName: "Weronika", lastName: "Brzozowska-Slowik" }];
  const locations = [{ id: "object-17", name: "Obiekt 17" }];
  const shifts = [{ id: "shift-1", locationId: "object-17", assigneeIds: ["W065"] }];
  const snapshot = normalizeWorkforceScheduleSnapshot({ locations, shifts, todayIso: "2026-09-06", users });

  assert.equal(snapshot.users, users);
  assert.equal(snapshot.locations, locations);
  assert.equal(snapshot.shifts, shifts);
  assert.equal(snapshot.weekStart, "2026-08-31");
});

test("adapter exposes a narrow persistence boundary and safely defaults to no-op", async () => {
  const {
    createWorkforceScheduleAdapter,
    notifyScheduleAdapter,
    WORKFORCE_SCHEDULE_ADAPTER_METHODS,
  } = await loadContract();
  const calls = [];
  const adapter = createWorkforceScheduleAdapter({
    onShiftCreate(payload) {
      calls.push(payload);
      return "saved";
    },
  });

  assert.deepEqual(Object.keys(adapter), [...WORKFORCE_SCHEDULE_ADAPTER_METHODS]);
  assert.equal(notifyScheduleAdapter(adapter, "onShiftCreate", { id: "shift-1" }), "saved");
  assert.equal(notifyScheduleAdapter(adapter, "onShiftUpdate", { id: "shift-1" }), undefined);
  assert.deepEqual(calls, [{ id: "shift-1" }]);
  assert.throws(() => notifyScheduleAdapter(adapter, "onOrderCreate", {}), /Unknown workforce schedule adapter method/);
});

test("frontend boundary is internal, delivery-disabled and isolated from legacy modules", async () => {
  const { WORKFORCE_SCHEDULE_BOUNDARY } = await loadContract();
  const componentSource = await readFile(path.join(moduleRoot, "ScheduleContent.jsx"), "utf8");

  assert.equal(WORKFORCE_SCHEDULE_BOUNDARY.mode, "internal");
  assert.equal(WORKFORCE_SCHEDULE_BOUNDARY.deliveryDisabledByDefault, true);
  assert.deepEqual(WORKFORCE_SCHEDULE_BOUNDARY.forbiddenIntegrations, ["orders", "calendar", "worker-app"]);
  assert.doesNotMatch(componentSource, /scheduleData\.js|FALLBACK_SCHEDULE_USERS|INITIAL_SCHEDULE_SHIFTS|SCHEDULE_LOCATIONS/);
  assert.doesNotMatch(componentSource, /features\/(orders|calendar)|services\/(orders|calendar)/);
  assert.match(componentSource, /Pracownicy nie widzą tego grafiku/);
  assert.match(componentSource, /deliveryDisabled = true/);
});

test("host oczekuje na zapis, używa idempotencji i wymaga jawnego potwierdzenia ostrzeżeń", async () => {
  const hostSource = await readFile(path.join(moduleRoot, "index.js"), "utf8");
  const componentSource = await readFile(path.join(moduleRoot, "ScheduleContent.jsx"), "utf8");
  const clientModelSource = await readFile(path.join(moduleRoot, "workforceScheduleClientModel.js"), "utf8");

  assert.match(hostSource, /createWorkforceScheduleOperationRegistry/);
  assert.match(hostSource, /async function runIdempotent/);
  assert.match(hostSource, /operationRegistry\.fail\(operation, error\)/);
  assert.match(hostSource, /WORKFORCE_SCHEDULE_WARNINGS_CONFIRMATION_REQUIRED/);
  assert.match(hostSource, /window\.confirm/);
  assert.match(hostSource, /response\?\.shift/);
  assert.match(hostSource, /isConfirmedWorkforceScheduleShift/);
  assert.match(hostSource, /WORKFORCE_SCHEDULE_INVALID_ARCHIVE_RESPONSE/);
  assert.match(hostSource, /WORKFORCE_SCHEDULE_INVALID_PUBLICATION_RESPONSE/);
  assert.match(hostSource, /formatWorkforceScheduleWarning/);
  assert.match(hostSource, /throw error[\s\S]{0,180}finally/);
  assert.match(componentSource, /const saved = await runMutation/);
  assert.match(componentSource, /if \(!saved\) return/);
  assert.match(componentSource, /normalizeWorkforceScheduleShift\(saved\)/);
  assert.match(componentSource, /applyWorkforceSchedulePublication\(shifts, saved\)/);
  assert.match(componentSource, /if \(!editingEnabled\)/);
  assert.doesNotMatch(clientModelSource, /String\(warning\?\.message \|\| warning\?\.label \|\| warning\)/);
  assert.doesNotMatch(componentSource, /publishNow:\s*true/);
});

test("kopiowanie tygodnia jest jedną operacją serwera bez optymistycznego dopisywania zmian", async () => {
  const hostSource = await readFile(path.join(moduleRoot, "index.js"), "utf8");
  const componentSource = await readFile(path.join(moduleRoot, "ScheduleContent.jsx"), "utf8");
  const transportSource = await readFile(path.resolve(
    moduleRoot,
    "..",
    "..",
    "services",
    "workforceScheduleTransport.js",
  ), "utf8");
  const copyStart = componentSource.indexOf('  const copyWeek = async () => {');
  const publishStart = componentSource.indexOf('  const publishSchedule = async () => {', copyStart);
  const copySource = componentSource.slice(copyStart, publishStart);

  assert.ok(copyStart >= 0 && publishStart > copyStart);
  assert.match(copySource, /await runMutation\("onWeekCopy", \{/);
  assert.match(copySource, /sourceShifts:\s*weekCopySource/);
  assert.match(copySource, /if \(!saved\) return/);
  assert.match(copySource, /saved\.targetFrom/);
  assert.match(copySource, /saved\.createdCount/);
  assert.doesNotMatch(copySource, /setShifts|duplicateShift|\.forEach\(|onShiftCreate|emitSnapshot/);
  assert.match(hostSource, /onWeekCopy:\s*\(payload\)\s*=>\s*runWrite\(\(\)\s*=>\s*copyWeek\(payload\)/);
  assert.match(hostSource, /service\.copyWorkforceScheduleWeek\(orgId, payload, \{ idempotencyKey \}\)/);
  assert.match(hostSource, /normalizeWorkforceScheduleWeekCopyReceipt\(response\?\.copy/);
  assert.match(hostSource, /WORKFORCE_SCHEDULE_INVALID_COPY_RESPONSE/);
  assert.match(transportSource, /'COPY_WEEK'/);
  assert.match(transportSource, /sendCommand\(orgId, 'COPY_WEEK', payload, optionsValue\)/);
});

test("powtarzające się zmiany są tworzone jednym atomowym wywołaniem backendu", async () => {
  const hostSource = await readFile(path.join(moduleRoot, "index.js"), "utf8");
  const componentSource = await readFile(path.join(moduleRoot, "ScheduleContent.jsx"), "utf8");
  const contractSource = await readFile(path.join(moduleRoot, "scheduleContract.js"), "utf8");
  const serviceSource = await readFile(path.resolve(moduleRoot, "..", "..", "services", "workforceScheduleService.js"), "utf8");
  const transportSource = await readFile(path.resolve(moduleRoot, "..", "..", "services", "workforceScheduleTransport.js"), "utf8");
  const saveStart = componentSource.indexOf('  const saveShift = async (form) => {');
  const deleteStart = componentSource.indexOf('  const deleteShift = async', saveStart);
  const saveSource = componentSource.slice(saveStart, deleteStart);

  assert.match(contractSource, /"onRecurringShiftsCreate"/);
  assert.match(saveSource, /await runMutation\("onRecurringShiftsCreate", \{ publishNow, recurrence, shift: values \}\)/);
  assert.match(saveSource, /if \(!saved\) return/);
  assert.match(saveSource, /saved\.shifts/);
  assert.doesNotMatch(saveSource, /Promise\.all|\.forEach\([^)]*onShiftCreate|onShiftCreate[^\n]*onShiftCreate/);
  assert.match(hostSource, /onRecurringShiftsCreate:\s*\(payload\)\s*=>\s*runWrite\(\(\)\s*=>\s*createRecurringShifts\(payload\)\)/);
  assert.match(hostSource, /service\.createRecurringWorkforceScheduleShifts\(orgId, payload, \{ idempotencyKey \}\)/);
  assert.match(hostSource, /normalizeWorkforceScheduleRecurringShiftsReceipt\(response\?\.recurrence/);
  assert.match(serviceSource, /createRecurringWorkforceScheduleShifts = transport\.createRecurringShifts/);
  assert.match(transportSource, /'CREATE_RECURRING_SHIFTS'/);
  assert.match(transportSource, /sendCommand\(orgId, 'CREATE_RECURRING_SHIFTS', payload, optionsValue\)/);
});

test("konfiguracja i zapis ignorują wyniki starej sesji", async () => {
  const hostSource = await readFile(path.join(moduleRoot, "index.js"), "utf8");
  const configureStart = hostSource.indexOf("  async function configure()")
  const runWriteStart = hostSource.indexOf("  async function runWrite(task", configureStart)
  const saveShiftStart = hostSource.indexOf("  async function saveShift", runWriteStart)
  const configureSource = hostSource.slice(configureStart, runWriteStart)
  const runWriteSource = hostSource.slice(runWriteStart, saveShiftStart)

  assert.ok(configureStart >= 0 && runWriteStart > configureStart && saveShiftStart > runWriteStart)
  assert.match(configureSource, /const operationContext = asyncGuard\.beginBusy\(\)/)
  assert.match(configureSource, /const response = await runIdempotent[\s\S]+if \(!asyncGuard\.isCurrent\(operationContext\)\) return false/)
  assert.match(configureSource, /state\.setupRequired = false[\s\S]+const refreshed = await refresh\(\{ forceRefresh: true, syncCatalogs: true \}\)[\s\S]+if \(!asyncGuard\.isCurrent\(operationContext\)\) return false/)
  assert.match(configureSource, /asyncGuard\.releaseBusy\(operationContext\)/)
  assert.doesNotMatch(configureSource, /syncWorkforceScheduleCatalogs|catalogSyncGate\.run/)

  assert.match(runWriteSource, /const operationContext = asyncGuard\.beginBusy\(\)/)
  assert.match(runWriteSource, /const result = await task\(\)[\s\S]+if \(!asyncGuard\.isCurrent\(operationContext\)\) return false/)
  assert.match(runWriteSource, /if \(shouldRefresh && asyncGuard\.isCurrent\(operationContext\)\)/)
  assert.match(runWriteSource, /setTimeout\([\s\S]+if \(!asyncGuard\.isCurrent\(operationContext\)\) return/)
  assert.match(runWriteSource, /asyncGuard\.releaseBusy\(operationContext\)/)
});

test("klient Grafiku odrzuca sesję platformową zamiast wysyłać jej token", async () => {
  const serviceSource = await readFile(path.resolve(
    moduleRoot,
    "..",
    "..",
    "services",
    "workforceScheduleService.js",
  ), "utf8");

  assert.match(serviceSource, /isPlatformSession\(current\.session\)/);
  assert.match(serviceSource, /WORKFORCE_SCHEDULE_PLATFORM_CONTEXT_FORBIDDEN/);
  assert.doesNotMatch(serviceSource, /platformAuthHeaders/);
});

test("ręczna synchronizacja katalogów i nieaktywne snapshoty pozostają w bezpiecznej granicy UI", async () => {
  const hostSource = await readFile(path.join(moduleRoot, "index.js"), "utf8");
  const componentSource = await readFile(path.join(moduleRoot, "ScheduleContent.jsx"), "utf8");
  const overlaysSource = await readFile(path.join(moduleRoot, "ScheduleOverlays.jsx"), "utf8");
  const syncSource = await readFile(path.join(moduleRoot, "workforceScheduleCatalogSync.js"), "utf8");

  assert.match(hostSource, /catalogRefreshEnabled: canConfigure\(\)/);
  assert.match(hostSource, /\{ force: true \}/);
  assert.match(hostSource, /sync-catalogs-manual/);
  assert.match(componentSource, /Odśwież pracowników i obiekty/);
  assert.match(componentSource, /isCatalogSelectable/);
  assert.match(componentSource, /data-drop-day=\{cellSelectable \? day : undefined\}/);
  assert.match(componentSource, /catalogSyncStale/);
  assert.match(componentSource, /data-state=\{catalogSyncStale \? "stale"/);
  assert.match(componentSource, /setStructuralConflicts\(blocking\);[\s\S]{0,160}setOverlay\(null\);[\s\S]{0,80}setEditorShift\(null\)/);
  assert.match(componentSource, /structuralConflictRef\.current\?\.focus\(\)/);
  assert.match(componentSource, /ref=\{structuralConflictRef\} role="alert" tabIndex=\{-1\}/);
  const contextStart = componentSource.indexOf('function conflictContext(conflict)');
  const contextEnd = componentSource.indexOf('\nfunction ShiftCard', contextStart);
  const contextSource = componentSource.slice(contextStart, contextEnd);
  assert.ok(contextStart >= 0 && contextEnd > contextStart);
  assert.match(contextSource, /ID zmiany|ID pracownika|ID obiektu|Data/);
  assert.doesNotMatch(contextSource, /userName|displayName|\.name|\.title/);
  assert.match(overlaysSource, /Nieaktywny/);
  assert.match(syncSource, /delivery.*downstream.*notifications/);
  assert.doesNotMatch(componentSource, /features\/(orders|calendar)|services\/(orders|calendar)/);
  assert.doesNotMatch(hostSource, /features\/(orders|calendar)|services\/(orders|calendar)/);
});

test("ustawienia operacyjne zapisują wyłącznie strefę i limit po potwierdzeniu backendu", async () => {
  const hostSource = await readFile(path.join(moduleRoot, "index.js"), "utf8");
  const componentSource = await readFile(path.join(moduleRoot, "ScheduleContent.jsx"), "utf8");
  const overlaysSource = await readFile(path.join(moduleRoot, "ScheduleOverlays.jsx"), "utf8");

  assert.match(hostSource, /settingsEnabled: canConfigure\(\) && Boolean\(state\.settings\)/);
  assert.match(hostSource, /onSettingsSave: \(payload\) => updateSettings\(payload\)/);
  assert.match(hostSource, /isConfirmedWorkforceScheduleSettings\(response\?\.settings/);
  assert.match(hostSource, /set-configuration-update/);
  assert.match(componentSource, /const saved = await runMutation\("onSettingsSave", \{ settings \}\)/);
  assert.match(componentSource, /initialSettings=\{scheduleSettings\}/);
  assert.doesNotMatch(componentSource, /emit\("onSettingsSave", \{ settings \}\); onNotify/);
  assert.match(overlaysSource, /Tygodniowy limit pracy/);
  assert.match(overlaysSource, /Strefa czasowa/);
  assert.match(overlaysSource, /expectedVersion: initialVersion/);
  assert.match(overlaysSource, /weeklyLimitMinutes/);
  assert.doesNotMatch(overlaysSource, /Domyślne pola zmiany|Wymagaj potwierdzenia|Tagi zmiany/);
});
