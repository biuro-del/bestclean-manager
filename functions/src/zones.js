import { apiError, ensureString, toNumber } from "./utils.js";

export function normalizeZoneFunc(rawFunc) {
  const compact = ensureString(rawFunc)
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/_/g, "");

  if (!compact) return "CLEAN";
  if (compact === "START") return "START";
  if (compact === "CLEAN" || compact === "SPRZATANIE" || compact === "SPRZATANIEINDYWIDUALNE" || compact === "ZLECENIEINDYWIDUALNE") {
    return "CLEAN";
  }
  if (/^STOP(0|5|10|15)$/.test(compact)) return compact;
  return "CLEAN";
}

export function stopGraceMinutesFromFunc(func) {
  const match = ensureString(func).toUpperCase().match(/^STOP(0|5|10|15)$/);
  if (!match) return null;
  return toNumber(match[1], null);
}

export async function resolveZoneByRoomId(db, roomIdRaw) {
  const roomId = ensureString(roomIdRaw);
  if (!roomId) {
    throw apiError("BAD_REQUEST", "Missing roomId.", 400);
  }

  const zoneSnap = await db.collection("zones").doc(roomId).get();
  if (!zoneSnap.exists) {
    throw apiError("UNKNOWN_QR", `Nieznany kod QR: ${roomId}.`, 400);
  }

  const data = zoneSnap.data() || {};
  return {
    roomId,
    zone: ensureString(data.zone),
    room: ensureString(data.room),
    func: normalizeZoneFunc(data.func),
    client: ensureString(data.client),
    location: ensureString(data.location),
  };
}
