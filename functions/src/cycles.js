import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { apiError, durationSec, ensureString, isSameLocalDay, nowIso, pickClientNow, sortByIsoDesc } from "./utils.js";
import { resolveZoneByRoomId } from "./zones.js";
import { getActiveWorkdayForClient } from "./workday.js";

const CYCLE_RUNNING = "RUNNING";
const CYCLE_CLOSED = "CLOSED";

function mapCycleDoc(docSnap) {
  const data = docSnap.data() || {};
  return {
    cycleId: docSnap.id,
    workdayId: ensureString(data.workdayId),
    uid: ensureString(data.uid),
    login: ensureString(data.login),
    workerName: ensureString(data.workerName),
    roomId: ensureString(data.roomId),
    zone: ensureString(data.zone),
    room: ensureString(data.room),
    location: ensureString(data.location),
    func: ensureString(data.func),
    startAt: ensureString(data.startAt),
    endAt: ensureString(data.endAt),
    durationSec: Number(data.durationSec || 0),
    status: ensureString(data.status).toUpperCase(),
    deviceId: ensureString(data.deviceId),
    startEventId: ensureString(data.startEventId),
    endEventId: ensureString(data.endEventId),
    endReason: ensureString(data.endReason),
    comment: ensureString(data.comment),
    createdAtIso: ensureString(data.createdAtIso),
    updatedAtIso: ensureString(data.updatedAtIso),
  };
}

async function listCyclesForUser(db, uid) {
  const snap = await db.collection("cycles").where("uid", "==", uid).limit(500).get();
  return snap.docs.map(mapCycleDoc);
}

function pickNewestActiveCycle(cycles) {
  return sortByIsoDesc(
    cycles.filter((cycle) => cycle.status === CYCLE_RUNNING),
    ["startAt", "createdAtIso", "updatedAtIso"],
  )[0] || null;
}

function ensureCanStartFromZone(zone) {
  const func = ensureString(zone.func).toUpperCase();
  if (func === "START") {
    throw apiError("INVALID_CYCLE_QR", "Zeskanowano kod START. Mozna rozpoczac sprzatanie.", 400);
  }
  if (func.startsWith("STOP")) {
    throw apiError("INVALID_CYCLE_QR", "Zeskanowano kod STOP. Uzyj zakonczania dnia pracy.", 400);
  }
}

function makeCycleRecord({ worker, workdayId, zone, deviceId, startEventId, clientNow }) {
  const startAt = pickClientNow({ clientNow });
  const nowServerIso = nowIso();
  return {
    cycleId: `cy_${randomUUID()}`,
    workdayId,
    uid: worker.uid,
    login: worker.login,
    workerName: worker.name,
    roomId: zone.roomId,
    zone: zone.zone,
    room: zone.room,
    location: zone.location,
    func: zone.func,
    startAt,
    endAt: "",
    durationSec: 0,
    status: CYCLE_RUNNING,
    deviceId: ensureString(deviceId),
    startEventId: ensureString(startEventId) || randomUUID(),
    endEventId: "",
    endReason: "",
    comment: "",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdAtIso: nowServerIso,
    updatedAtIso: nowServerIso,
  };
}

export async function getActiveCycleForClient({ db, uid, clientNow, tzOffsetMinutes }) {
  const nowClientIso = pickClientNow({ clientNow });
  const cycles = await listCyclesForUser(db, uid);
  const newestActive = pickNewestActiveCycle(cycles);
  if (!newestActive) return { cycle: null };

  if (!isSameLocalDay(newestActive.startAt, nowClientIso, tzOffsetMinutes)) {
    return { cycle: null };
  }
  return { cycle: newestActive };
}

export async function startCycle({ db, worker, roomId, deviceId, startEventId, clientNow, tzOffsetMinutes }) {
  const rid = ensureString(roomId);
  const did = ensureString(deviceId);
  if (!rid) throw apiError("BAD_REQUEST", "Missing roomId.", 400);
  if (!did) throw apiError("BAD_REQUEST", "Missing deviceId.", 400);

  const workday = await getActiveWorkdayForClient({
    db,
    uid: worker.uid,
    clientNow,
    tzOffsetMinutes,
  });

  if (!workday.workday || workday.workday.status !== "RUNNING") {
    if (workday.staleOpen) {
      throw apiError(
        "STALE_WORKDAY",
        "Wykryto bledy w twoim czasie pracy - skanuj START aby kontynuowac prace a koordynator uzupelni braki. Ty masz to juz z glowy.",
        400,
      );
    }
    throw apiError("NO_WORKDAY", "Brak aktywnego dnia pracy. Zeskanuj najpierw QR START.", 400);
  }

  const activeCycle = await getActiveCycleForClient({
    db,
    uid: worker.uid,
    clientNow,
    tzOffsetMinutes,
  });
  if (activeCycle.cycle) {
    return { alreadyRunning: true, cycle: activeCycle.cycle };
  }

  const zone = await resolveZoneByRoomId(db, rid);
  ensureCanStartFromZone(zone);

  const record = makeCycleRecord({
    worker,
    workdayId: workday.workday.workdayId,
    zone,
    deviceId: did,
    startEventId,
    clientNow,
  });

  await db.collection("cycles").doc(record.cycleId).set(record);
  return { alreadyRunning: false, cycle: record };
}

async function getCycleForWorker({ db, cycleId, uid }) {
  const cid = ensureString(cycleId);
  if (!cid) throw apiError("BAD_REQUEST", "Missing cycleId.", 400);

  const snap = await db.collection("cycles").doc(cid).get();
  if (!snap.exists) throw apiError("NOT_FOUND", "Cycle not found.", 404);
  const cycle = mapCycleDoc(snap);
  if (cycle.uid !== uid) throw apiError("FORBIDDEN", "Cycle belongs to another worker.", 403);
  return cycle;
}

export async function stopCycle({ db, worker, cycleId, deviceId, endEventId, reason, comment, clientNow }) {
  const did = ensureString(deviceId);
  if (!did) throw apiError("BAD_REQUEST", "Missing deviceId.", 400);

  const cycle = await getCycleForWorker({ db, cycleId, uid: worker.uid });
  if (cycle.status === CYCLE_CLOSED) {
    return { cycle, unchanged: true };
  }

  const endAt = pickClientNow({ clientNow });
  const updates = {
    status: CYCLE_CLOSED,
    endAt,
    durationSec: durationSec(cycle.startAt, endAt),
    endReason: ensureString(reason) || "QR_SAME",
    comment: ensureString(comment).slice(0, 300),
    endEventId: ensureString(endEventId) || randomUUID(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedAtIso: nowIso(),
  };
  await db.collection("cycles").doc(cycle.cycleId).set(updates, { merge: true });
  return { cycle: { ...cycle, ...updates }, unchanged: false };
}

export async function stopAndStartCycle({ db, worker, cycleId, nextRoomId, deviceId, opEventId, reason, comment, clientNow, tzOffsetMinutes }) {
  const did = ensureString(deviceId);
  const nextRid = ensureString(nextRoomId);
  if (!did) throw apiError("BAD_REQUEST", "Missing deviceId.", 400);
  if (!nextRid) throw apiError("BAD_REQUEST", "Missing nextRoomId.", 400);

  const current = await getCycleForWorker({ db, cycleId, uid: worker.uid });
  if (current.status !== CYCLE_RUNNING) {
    throw apiError("INVALID_STATE", "Cycle is not running.", 400);
  }

  const workday = await getActiveWorkdayForClient({
    db,
    uid: worker.uid,
    clientNow,
    tzOffsetMinutes,
  });
  if (!workday.workday || workday.workday.status !== "RUNNING") {
    throw apiError("NO_WORKDAY", "Brak aktywnego dnia pracy.", 400);
  }

  const zone = await resolveZoneByRoomId(db, nextRid);
  ensureCanStartFromZone(zone);

  const nowClientIso = pickClientNow({ clientNow });
  const newCycleRecord = makeCycleRecord({
    worker,
    workdayId: current.workdayId || workday.workday.workdayId,
    zone,
    deviceId: did,
    startEventId: ensureString(opEventId),
    clientNow: nowClientIso,
  });

  const currentRef = db.collection("cycles").doc(current.cycleId);
  const newRef = db.collection("cycles").doc(newCycleRecord.cycleId);

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(currentRef);
    if (!snap.exists) throw apiError("NOT_FOUND", "Cycle not found.", 404);
    const latest = mapCycleDoc(snap);
    if (latest.uid !== worker.uid) throw apiError("FORBIDDEN", "Cycle belongs to another worker.", 403);
    if (latest.status !== CYCLE_RUNNING) throw apiError("INVALID_STATE", "Cycle is not running.", 400);

    transaction.set(
      currentRef,
      {
        status: CYCLE_CLOSED,
        endAt: nowClientIso,
        durationSec: durationSec(latest.startAt, nowClientIso),
        endReason: ensureString(reason) || "QR_CHANGE",
        comment: ensureString(comment).slice(0, 300),
        endEventId: ensureString(opEventId) || randomUUID(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedAtIso: nowIso(),
      },
      { merge: true },
    );

    transaction.set(newRef, newCycleRecord);
  });

  return { cycle: newCycleRecord };
}
