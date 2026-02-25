export function apiError(code, message, statusCode = 400, details = null) {
  const error = new Error(message);
  error.apiCode = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

export function nowIso() {
  return new Date().toISOString();
}

export function ensureString(value) {
  return String(value || "").trim();
}

export function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function addMinutesIso(baseIso, minutes) {
  const baseMs = Date.parse(baseIso);
  if (!Number.isFinite(baseMs)) return nowIso();
  return new Date(baseMs + minutes * 60_000).toISOString();
}

export function durationSec(startIso, endIso) {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}

export function localDateKeyFromIso(iso, tzOffsetMinutes = 0) {
  const utcMs = Date.parse(String(iso || ""));
  if (!Number.isFinite(utcMs)) return "";
  const shifted = utcMs - toNumber(tzOffsetMinutes, 0) * 60_000;
  const date = new Date(shifted);
  const y = String(date.getUTCFullYear());
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isSameLocalDay(leftIso, rightIso, tzOffsetMinutes = 0) {
  const left = localDateKeyFromIso(leftIso, tzOffsetMinutes);
  const right = localDateKeyFromIso(rightIso, tzOffsetMinutes);
  return Boolean(left) && left === right;
}

export function pickClientNow(payload) {
  const raw = ensureString(payload?.clientNow || payload?.clientAt);
  if (!raw) return nowIso();
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : nowIso();
}

export function sortByIsoDesc(records, isoFieldCandidates) {
  const fields = Array.isArray(isoFieldCandidates) ? isoFieldCandidates : [isoFieldCandidates];
  return [...records].sort((a, b) => {
    const aIso = fields.map((field) => ensureString(a?.[field])).find(Boolean) || "";
    const bIso = fields.map((field) => ensureString(b?.[field])).find(Boolean) || "";
    const aMs = Date.parse(aIso);
    const bMs = Date.parse(bIso);
    const aSafe = Number.isFinite(aMs) ? aMs : 0;
    const bSafe = Number.isFinite(bMs) ? bMs : 0;
    return bSafe - aSafe;
  });
}
