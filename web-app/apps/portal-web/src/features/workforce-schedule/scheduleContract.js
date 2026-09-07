const EMPTY_LIST = Object.freeze([]);

export const WORKFORCE_SCHEDULE_ADAPTER_METHODS = Object.freeze([
  "onShiftCreate",
  "onShiftUpdate",
  "onShiftDelete",
  "onShiftMove",
  "onWeekCopy",
  "onSchedulePublish",
  "onRequestResolve",
  "onSettingsSave",
  "onExport",
  "onRangeChange",
  "onSnapshotChange",
]);

function list(value) {
  return Array.isArray(value) ? value : EMPTY_LIST;
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function mondayFor(isoDate) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/**
 * Defines the read model consumed by the standalone workforce schedule UI.
 * Missing collections stay empty deliberately: production catalog failures must
 * never be hidden by sample people, locations or shifts.
 */
export function normalizeWorkforceScheduleSnapshot(snapshot = {}) {
  const todayIso = typeof snapshot.todayIso === "string" && snapshot.todayIso
    ? snapshot.todayIso
    : todayUtc();
  const weekStart = typeof snapshot.weekStart === "string" && snapshot.weekStart
    ? snapshot.weekStart
    : mondayFor(todayIso);

  return {
    users: list(snapshot.users),
    locations: list(snapshot.locations),
    shifts: list(snapshot.shifts),
    requests: list(snapshot.requests),
    templates: list(snapshot.templates),
    todayIso,
    weekStart,
    version: snapshot.version ?? null,
  };
}

/**
 * Adapter callbacks are optional at the UI boundary. A host can add persistence
 * later without importing orders, calendar or worker-delivery code here.
 */
export function createWorkforceScheduleAdapter(callbacks = {}) {
  return Object.fromEntries(WORKFORCE_SCHEDULE_ADAPTER_METHODS.map((method) => [
    method,
    typeof callbacks[method] === "function" ? callbacks[method] : () => undefined,
  ]));
}

export function notifyScheduleAdapter(adapter, method, payload) {
  if (!WORKFORCE_SCHEDULE_ADAPTER_METHODS.includes(method)) {
    throw new Error(`Unknown workforce schedule adapter method: ${method}`);
  }
  return adapter?.[method]?.(payload);
}

export const WORKFORCE_SCHEDULE_BOUNDARY = Object.freeze({
  deliveryDisabledByDefault: true,
  mode: "internal",
  reads: Object.freeze(["users", "locations", "shifts", "requests", "templates"]),
  forbiddenIntegrations: Object.freeze(["orders", "calendar", "worker-app"]),
});
