import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const modelUrl = pathToFileURL(path.resolve(
  "web-app",
  "apps",
  "portal-web",
  "src",
  "features",
  "workforce-schedule",
  "scheduleModel.js",
)).href;

const modelModule = import(modelUrl);

function frozenFixture() {
  const users = [
    { id: "mobile-1", workerType: "Zespół Mobilny" },
    { id: "fixed-1", workerType: "Stały personel na obiekcie" },
    { id: "fixed-2", workerType: "Stały personel na obiekcie" },
    { id: "mobile-pending", workerType: "zespol mobilny" },
    { id: "mobile-empty", workerType: "ZESPÓŁ MOBILNY" },
    { id: "unknown-type" },
  ].map(Object.freeze);
  const shifts = [
    { id: "shift-mobile", locationId: "location-a", assigneeIds: Object.freeze(["mobile-1"]) },
    { id: "shift-fixed", locationId: "location-a", assigneeIds: Object.freeze(["fixed-1"]) },
    { id: "shift-mixed", locationId: "location-b", assigneeIds: Object.freeze(["mobile-1", "fixed-2"]) },
    { id: "shift-unassigned", locationId: "location-a", assigneeIds: Object.freeze([]) },
    { id: "shift-pending", locationId: "location-a", assigneeIds: Object.freeze(["mobile-pending"]), pendingDeletion: true },
    { id: "shift-unknown", locationId: "location-a", assigneeIds: Object.freeze(["unknown-type"]) },
  ].map(Object.freeze);
  return { users: Object.freeze(users), shifts: Object.freeze(shifts) };
}

test("filtr typu pracownika obejmuje zmianę, gdy co najmniej jedna aktywna osoba ma wskazany typ", async () => {
  const { filterShiftsByWorkerType } = await modelModule;
  const { shifts, users } = frozenFixture();

  assert.deepEqual(
    filterShiftsByWorkerType(shifts, users, "mobile").map(({ id }) => id),
    ["shift-mobile", "shift-mixed"],
  );
  assert.deepEqual(
    filterShiftsByWorkerType(shifts, users, "Zespół Mobilny").map(({ id }) => id),
    ["shift-mobile", "shift-mixed"],
  );
  assert.deepEqual(
    filterShiftsByWorkerType(shifts, users, "Stały personel na obiekcie").map(({ id }) => id),
    ["shift-fixed", "shift-mixed"],
  );
  assert.deepEqual(
    filterShiftsByWorkerType(shifts, users).map(({ id }) => id),
    ["shift-mobile", "shift-fixed", "shift-mixed", "shift-unassigned", "shift-unknown"],
  );
});

test("wiersze osób filtrują się po lokalizacji oglądanego okresu, typie i konkretnym użytkowniku", async () => {
  const { filterScheduleUsers } = await modelModule;
  const { shifts, users } = frozenFixture();

  assert.deepEqual(
    filterScheduleUsers(users, shifts, { locationId: "location-a" }).map(({ id }) => id),
    ["mobile-1", "fixed-1", "unknown-type"],
  );
  assert.deepEqual(
    filterScheduleUsers(users, shifts, { locationId: "location-a", workerType: "mobile" }).map(({ id }) => id),
    ["mobile-1"],
  );
  assert.deepEqual(
    filterScheduleUsers(users, shifts, { locationId: "location-b", workerType: "mobile" }).map(({ id }) => id),
    ["mobile-1"],
  );
  assert.deepEqual(
    filterScheduleUsers(users, shifts, { locationId: "location-b", userId: "fixed-2" }).map(({ id }) => id),
    ["fixed-2"],
  );
  assert.deepEqual(
    filterScheduleUsers(users, shifts, { locationId: "location-a", userId: "fixed-2" }),
    [],
  );
  assert.deepEqual(
    filterScheduleUsers(users, shifts, { workerType: "mobile" }).map(({ id }) => id),
    ["mobile-1", "mobile-pending", "mobile-empty"],
  );
  assert.deepEqual(filterScheduleUsers(users, shifts, { locationId: "missing-location" }), []);
});

test("pendingDeletion nie kwalifikuje zmiany ani osoby, a filtrowanie nie mutuje wejścia", async () => {
  const { filterScheduleUsers, filterShiftsByWorkerType } = await modelModule;
  const { shifts, users } = frozenFixture();
  const before = JSON.stringify({ shifts, users });

  assert.equal(filterShiftsByWorkerType(shifts, users, "mobile").some(({ id }) => id === "shift-pending"), false);
  assert.equal(filterScheduleUsers(users, shifts, { locationId: "location-a", workerType: "mobile" }).some(({ id }) => id === "mobile-pending"), false);
  assert.equal(JSON.stringify({ shifts, users }), before);
});

test("filtr obsady pokazuje zespół mobilny i zachowuje wcześniej wybrane osoby", async () => {
  const { filterScheduleAssigneeUsers } = await modelModule;
  const users = Object.freeze([
    Object.freeze({ id: "fixed-1", workerType: "Stały personel na obiekcie", role: "MOBILE_ADMIN" }),
    Object.freeze({ id: "mobile-1", workerType: "Zespół Mobilny", role: "WORKER" }),
    Object.freeze({ id: "mobile-2", workerType: "zespol mobilny", role: "WORKER" }),
    Object.freeze({ id: "unknown-1", role: "MOBILE_WORKER" }),
    Object.freeze({ id: "not-mobile-1", workerType: "Niemobilny", role: "WORKER" }),
  ]);
  const selected = Object.freeze(["fixed-1", "mobile-2"]);
  const before = JSON.stringify({ selected, users });

  assert.deepEqual(
    filterScheduleAssigneeUsers(users, selected, true).map(({ id }) => id),
    ["fixed-1", "mobile-1", "mobile-2"],
  );
  assert.equal(JSON.stringify({ selected, users }), before);
  assert.equal(filterScheduleAssigneeUsers(users, selected, false), users);
});
