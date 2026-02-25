import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { addMinutesIso, apiError, durationSec, ensureString, isSameLocalDay, localDateKeyFromIso, nowIso, pickClientNow, sortByIsoDesc, toNumber } from "./utils.js";

const WORKDAY_RUNNING = "RUNNING";
const WORKDAY_ENDING = "ENDING";
const WORKDAY_CLOSED = "CLOSED";
const DEFAULT_ENDING_GRACE_MINUTES = 15;

function mapWorkdayDoc(docSnap) {
  const data = docSnap.data() || {};
  return {
    workdayId: docSnap.id,
    uid: ensureString(data.uid),
    login: ensureString(data.login),
    workerName: ensureString(data.workerName),
    utilityRoomId: ensureString(data.utilityRoomId),
    startAt: ensureString(data.startAt),
    endScanAt: ensureString(data.endScanAt),
    autoCloseAt: ensureString(data.autoCloseAt),
    endAt: ensureString(data.endAt),
    durationSec: toNumber(data.durationSec, 0),
    status: ensureString(data.status).toUpperCase(),
    deviceId: ensureString(data.deviceId),
    startEventId: ensureString(data.startEventId),
    endEventId: ensureString(data.endEventId),
    pause1Status: ensureString(data.pause1Status),
    pause1StartAt: ensureString(data.pause1StartAt),
    pause1StopAt: ensureString(data.pause1StopAt),
    createdAtIso: ensureString(data.createdAtIso),
    updatedAtIso: ensureString(data.updatedAtIso),
  };
}

function isActiveStatus(status) {
  return status === WORKDAY_RUNNING || status === WORKDAY_ENDING;
}

async function listWorkdaysForUser(db, uid) {
  const snap = await db.collection("workdays").where("uid", "==", uid).limit(300).get();
  return snap.docs.map(mapWorkdayDoc);
}

function pickNewestActiveWorkday(workdays) {
  return sortByIsoDesc(
    workdays.filter((workday) => isActiveStatus(workday.status)),
    ["startAt", "createdAtIso", "updatedAtIso"],
  )[0] || null;
}

async function closeDueEndingWorkday(db, workday, closeAtIso) {
  const closeIso = ensureString(closeAtIso) || nowIso();
  const updates = {
    status: WORKDAY_CLOSED,
    endAt: closeIso,
    durationSec: durationSec(workday.startAt, closeIso),
    updatedAt: FieldValue.serverTimestamp(),
    updatedAtIso: nowIso(),
  };
  await db.collection("workdays").doc(workday.workdayId).set(updates, { merge: true });
}

export async function getRuntimeWorkdayConfig(db) {
  const snap = await db.collection("runtimeConfig").doc("workday").get();
  const data = snap.exists ? snap.data() || {} : {};

  const rawRules = Array.isArray(data.stopRules) ? data.stopRules : [];
  const stopRules = rawRules
    .map((rule) => ({
      roomId: ensureString(rule?.roomId),
      graceMinutes: toNumber(rule?.graceMinutes, NaN),
    }))
    .filter((rule) => rule.roomId && Number.isFinite(rule.graceMinutes))
    .map((rule) => ({ roomId: rule.roomId, graceMinutes: Math.max(0, rule.graceMinutes) }));

  const startRoomId = ensureString(data.startRoomId || data.utilityRoomId);
  const defaultGraceMinutes = Math.max(0, toNumber(data.defaultGraceMinutes, DEFAULT_ENDING_GRACE_MINUTES));

  return { startRoomId, utilityRoomId: startRoomId, stopRules, defaultGraceMinutes };
}

function resolveEndingGraceMinutes({ config, roomId }) {
  const rid = ensureString(roomId);
  if (!rid) return config.defaultGraceMinutes;
  const exact = config.stopRules.find((item) => item.roomId === rid);
  if (exact) return exact.graceMinutes;
  return config.defaultGraceMinutes;
}

export async function getActiveWorkdayForClient({ db, uid, clientNow, tzOffsetMinutes }) {
  const nowClientIso = pickClientNow({ clientNow });
  const workdays = await listWorkdaysForUser(db, uid);
  const newestActive = pickNewestActiveWorkday(workdays);
  if (!newestActive) {
    return { workday: null, staleOpen: false, staleStartAt: "" };
  }

  if (
    newestActive.status === WORKDAY_ENDING &&
    newestActive.autoCloseAt &&
    Date.parse(newestActive.autoCloseAt) <= Date.parse(nowClientIso)
  ) {
    await closeDueEndingWorkday(db, newestActive, newestActive.autoCloseAt);
    return { workday: null, staleOpen: false, staleStartAt: "" };
  }

  if (isSameLocalDay(newestActive.startAt, nowClientIso, tzOffsetMinutes)) {
    return { workday: newestActive, staleOpen: false, staleStartAt: "" };
  }

  return { workday: null, staleOpen: true, staleStartAt: newestActive.startAt };
}

function toWorkdayPayloadRecord({ worker, roomId, deviceId, startEventId, clientNow, tzOffsetMinutes }) {
  const startAt = pickClientNow({ clientNow });
  const createdIso = nowIso();
  return {
    workdayId: `wd_${randomUUID()}`,
    uid: worker.uid,
    login: worker.login,
    workerName: worker.name,
    utilityRoomId: ensureString(roomId),
    startAt,
    endScanAt: "",
    autoCloseAt: "",
    endAt: "",
    durationSec: 0,
    status: WORKDAY_RUNNING,
    deviceId: ensureString(deviceId),
    startEventId: ensureString(startEventId) || randomUUID(),
    endEventId: "",
    pause1Status: "",
    pause1StartAt: "",
    pause1StopAt: "",
    localStartDateKey: localDateKeyFromIso(startAt, tzOffsetMinutes),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdAtIso: createdIso,
    updatedAtIso: createdIso,
  };
}

export async function startWorkday({ db, worker, roomId, deviceId, startEventId, clientNow, tzOffsetMinutes }) {
  const rid = ensureString(roomId);
  const did = ensureString(deviceId);
  if (!rid) throw apiError("BAD_REQUEST", "Missing roomId.", 400);
  if (!did) throw apiError("BAD_REQUEST", "Missing deviceId.", 400);

  const config = await getRuntimeWorkdayConfig(db);
  if (config.startRoomId && rid !== config.startRoomId) {
    throw apiError("INVALID_START_QR", "Ten kod nie jest QR START.", 400);
  }

  const active = await getActiveWorkdayForClient({
    db,
    uid: worker.uid,
    clientNow,
    tzOffsetMinutes,
  });

  if (active.workday) {
    return { alreadyRunning: true, workday: active.workday };
  }

  const record = toWorkdayPayloadRecord({
    worker,
    roomId: rid,
    deviceId: did,
    startEventId,
    clientNow,
    tzOffsetMinutes,
  });

  await db.collection("workdays").doc(record.workdayId).set(record);
  return { alreadyRunning: false, workday: record };
}

export async function beginEndingWorkday({ db, worker, roomId, deviceId, endEventId, clientNow, tzOffsetMinutes }) {
  const did = ensureString(deviceId);
  if (!did) throw apiError("BAD_REQUEST", "Missing deviceId.", 400);

  const active = await getActiveWorkdayForClient({
    db,
    uid: worker.uid,
    clientNow,
    tzOffsetMinutes,
  });

  if (!active.workday) {
    throw apiError("NO_START_TODAY", "Brak START w dniu dzisiejszym. Zeskanuj QR START, aby rozpoczac dzien pracy.", 400);
  }

  if (active.workday.status === WORKDAY_CLOSED) {
    throw apiError("WORKDAY_CLOSED", "Dzien pracy jest juz zamkniety.", 400);
  }

  const nowClientIso = pickClientNow({ clientNow });
  const config = await getRuntimeWorkdayConfig(db);
  const graceMinutes = resolveEndingGraceMinutes({ config, roomId });

  let updates;
  if (graceMinutes <= 0) {
    updates = {
      status: WORKDAY_CLOSED,
      endScanAt: nowClientIso,
      autoCloseAt: nowClientIso,
      endAt: nowClientIso,
      durationSec: durationSec(active.workday.startAt, nowClientIso),
      endEventId: ensureString(endEventId) || randomUUID(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtIso: nowIso(),
    };
  } else {
    updates = {
      status: WORKDAY_ENDING,
      endScanAt: nowClientIso,
      autoCloseAt: addMinutesIso(nowClientIso, graceMinutes),
      endEventId: ensureString(endEventId) || randomUUID(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedAtIso: nowIso(),
    };
  }

  await db.collection("workdays").doc(active.workday.workdayId).set(updates, { merge: true });
  const updated = { ...active.workday, ...updates };
  return { workday: updated };
}

export async function cancelEndingWorkday({ db, worker, clientNow, tzOffsetMinutes }) {
  const active = await getActiveWorkdayForClient({
    db,
    uid: worker.uid,
    clientNow,
    tzOffsetMinutes,
  });

  if (!active.workday) {
    throw apiError("NO_START_TODAY", "Brak aktywnego dnia pracy.", 400);
  }

  if (active.workday.status !== WORKDAY_ENDING) {
    return { workday: active.workday, unchanged: true };
  }

  const updates = {
    status: WORKDAY_RUNNING,
    endScanAt: "",
    autoCloseAt: "",
    endEventId: "",
    updatedAt: FieldValue.serverTimestamp(),
    updatedAtIso: nowIso(),
  };
  await db.collection("workdays").doc(active.workday.workdayId).set(updates, { merge: true });
  return { workday: { ...active.workday, ...updates }, unchanged: false };
}

export async function closeWorkdayNow({ db, worker, endEventId, clientNow, tzOffsetMinutes }) {
  const active = await getActiveWorkdayForClient({
    db,
    uid: worker.uid,
    clientNow,
    tzOffsetMinutes,
  });

  if (!active.workday) {
    throw apiError("NO_START_TODAY", "Brak aktywnego dnia pracy.", 400);
  }

  const closeIso = pickClientNow({ clientNow });
  const updates = {
    status: WORKDAY_CLOSED,
    endAt: closeIso,
    endScanAt: active.workday.endScanAt || closeIso,
    autoCloseAt: active.workday.autoCloseAt || closeIso,
    durationSec: durationSec(active.workday.startAt, closeIso),
    endEventId: ensureString(endEventId) || randomUUID(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedAtIso: nowIso(),
  };

  await db.collection("workdays").doc(active.workday.workdayId).set(updates, { merge: true });
  return { workday: { ...active.workday, ...updates } };
}
