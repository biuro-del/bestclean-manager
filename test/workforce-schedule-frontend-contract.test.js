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
  assert.match(hostSource, /operationRegistry\.fail\(operation\.signature, error\)/);
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
