const DAY_MS = 24 * 60 * 60 * 1000;

export function parseIsoDate(isoDate) {
  return new Date(`${isoDate}T12:00:00Z`);
}

export function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, amount) {
  const date = parseIsoDate(iso);
  return isoDate(new Date(date.getTime() + amount * DAY_MS));
}

export function getWeekDays(startIso) {
  return Array.from({ length: 7 }, (_, index) => addDays(startIso, index));
}

export function mondayFor(iso) {
  const date = parseIsoDate(iso);
  const day = date.getUTCDay();
  return addDays(iso, day === 0 ? -6 : 1 - day);
}

export function monthStartFor(iso) {
  const date = parseIsoDate(iso);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12)).toISOString().slice(0, 10);
}

export function addMonths(iso, amount) {
  const date = parseIsoDate(monthStartFor(iso));
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1, 12)).toISOString().slice(0, 10);
}

export function minutesFromTime(time) {
  const [hours, minutes] = String(time).split(":").map(Number);
  return hours * 60 + minutes;
}

export function getShiftMinutes(shift) {
  let total = minutesFromTime(shift.endTime) - minutesFromTime(shift.startTime);
  if (total < 0) total += 24 * 60;
  return Math.max(0, total - Number(shift.breakMinutes || 0));
}

export function isShiftDirty(shift) {
  return shift.pendingDeletion || shift.publishedRevision == null || shift.revision > shift.publishedRevision;
}

export function dirtyShifts(shifts) {
  return shifts.filter(isShiftDirty);
}

export function publishShifts(shifts) {
  return shifts
    .filter((shift) => !shift.pendingDeletion)
    .map((shift) => ({ ...shift, publishedRevision: shift.revision }));
}

export function duplicateShift(shift, id, nextDate = shift.date) {
  return {
    ...shift,
    id,
    shiftId: "",
    date: nextDate,
    revision: 1,
    publishedRevision: null,
    publishedDate: "",
    version: 0,
    pendingDeletion: false,
    status: "DRAFT",
    title: `${shift.title} — kopia`,
  };
}

function normalizedInterval(shift) {
  const dayStart = Date.parse(`${shift.date}T00:00:00Z`) / 60000;
  const start = minutesFromTime(shift.startTime);
  const rawEnd = minutesFromTime(shift.endTime);
  return {
    start: dayStart + start,
    end: dayStart + (rawEnd < start ? rawEnd + 24 * 60 : rawEnd),
  };
}

export function shiftsOverlap(first, second) {
  const firstInterval = normalizedInterval(first);
  const secondInterval = normalizedInterval(second);
  return firstInterval.start < secondInterval.end && secondInterval.start < firstInterval.end;
}

export function moveShiftToCell(shift, target) {
  let assigneeIds = shift.assigneeIds;
  if (target.fromUserId && target.toUserId && target.fromUserId !== target.toUserId) {
    assigneeIds = [...new Set(shift.assigneeIds.map((id) => id === target.fromUserId ? target.toUserId : id))];
  }
  return {
    ...shift,
    date: target.date ?? shift.date,
    locationId: target.locationId ?? shift.locationId,
    assigneeIds,
  };
}

export function validateShiftMove(shifts, shiftId, target) {
  const shift = shifts.find((candidate) => candidate.id === shiftId);
  if (!shift || shift.pendingDeletion) return { ok: false, code: "missing", message: "Ta zmiana nie może zostać przeniesiona." };
  const nextShift = moveShiftToCell(shift, target);
  const unchanged = nextShift.date === shift.date && nextShift.locationId === shift.locationId && nextShift.assigneeIds.join("|") === shift.assigneeIds.join("|");
  if (unchanged) return { ok: false, code: "same-cell", message: "Zmiana jest już w tej komórce." };
  const collision = shifts.find((candidate) =>
    candidate.id !== shift.id
    && !candidate.pendingDeletion
    && candidate.assigneeIds.some((id) => nextShift.assigneeIds.includes(id))
    && shiftsOverlap(candidate, nextShift),
  );
  if (collision) return { ok: false, code: "overlap", conflictingShiftId: collision.id, message: `Nie można przenieść — kolizja z „${collision.title}”.` };
  return { ok: true, code: "allowed", nextShift };
}

export function filterShifts(shifts, query, locationId = "all", userId = "all") {
  const normalized = String(query || "").trim().toLocaleLowerCase("pl");
  return shifts.filter((shift) => {
    const matchesQuery = !normalized || `${shift.title} ${shift.notes}`.toLocaleLowerCase("pl").includes(normalized);
    const matchesLocation = locationId === "all" || shift.locationId === locationId;
    const matchesUser = userId === "all" || shift.assigneeIds.includes(userId);
    return matchesQuery && matchesLocation && matchesUser && !shift.pendingDeletion;
  });
}

export function findConflicts(shifts, users, weeklyLimitMinutes = 40 * 60) {
  const conflicts = [];
  const active = shifts.filter((shift) => !shift.pendingDeletion);
  active.forEach((shift) => {
    if (shift.assigneeIds.length < shift.requiredHeadcount) {
      conflicts.push({ id: `coverage-${shift.id}`, shiftId: shift.id, type: "coverage", label: `Brakuje ${shift.requiredHeadcount - shift.assigneeIds.length} os. do obsady` });
    }
  });
  users.forEach((user) => {
    const assigned = active.filter((shift) => shift.assigneeIds.includes(user.id));
    const total = assigned.reduce((sum, shift) => sum + getShiftMinutes(shift), 0);
    if (total > weeklyLimitMinutes) conflicts.push({ id: `hours-${user.id}`, userId: user.id, type: "hours", label: `${user.firstName} przekracza limit o ${Math.ceil((total - weeklyLimitMinutes) / 60)} godz.` });
    for (let index = 0; index < assigned.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < assigned.length; otherIndex += 1) {
        const first = assigned[index];
        const second = assigned[otherIndex];
        if (first.date !== second.date) continue;
        const overlap = shiftsOverlap(first, second);
        if (overlap) conflicts.push({ id: `overlap-${user.id}-${first.id}-${second.id}`, userId: user.id, shiftId: second.id, type: "overlap", label: `${user.firstName} ma nakładające się zmiany` });
      }
    }
  });
  return conflicts;
}

export function summarizeShifts(shifts) {
  const active = shifts.filter((shift) => !shift.pendingDeletion);
  const uniqueUsers = new Set(active.flatMap((shift) => shift.assigneeIds));
  return {
    minutes: active.reduce((sum, shift) => sum + getShiftMinutes(shift), 0),
    shifts: active.length,
    users: uniqueUsers.size,
    openSlots: active.reduce((sum, shift) => sum + Math.max(0, shift.requiredHeadcount - shift.assigneeIds.length), 0),
  };
}

export function formatDuration(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
