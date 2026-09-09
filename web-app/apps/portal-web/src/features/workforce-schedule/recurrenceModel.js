const MAX_INTERVAL = 30;
const MAX_OCCURRENCES = 366;
const MAX_HORIZON_DAYS = 3660;
const DAY_MS = 86_400_000;

const WEEKDAY_LABELS = Object.freeze(["pon.", "wt.", "śr.", "czw.", "pt.", "sob.", "niedz."]);
const FREQUENCY_LABELS = Object.freeze({ DAILY: "dzień", WEEKLY: "tydzień", MONTHLY: "miesiąc" });
const ORDINAL_LABELS = Object.freeze({ 1: "pierwszy", 2: "drugi", 3: "trzeci", 4: "czwarty", "-1": "ostatni" });

function recurrenceError(message, field) {
  const error = new Error(message);
  error.code = "WORKFORCE_SCHEDULE_INVALID_RECURRENCE";
  error.field = field;
  return error;
}

function recurrenceLimit(message, field) {
  const error = recurrenceError(message, field);
  error.code = "RECURRENCE_LIMIT";
  return error;
}

function validIsoDate(value) {
  const normalized = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return "";
  const candidate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return candidate.toISOString().slice(0, 10) === normalized ? normalized : "";
}

function integer(value, field, min, max) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw recurrenceError(`Niepoprawna wartość pola ${field}.`, field);
  }
  return parsed;
}

function isoWeekday(isoDate) {
  const day = new Date(`${isoDate}T12:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function dayOfMonth(isoDate) {
  return Number(isoDate.slice(8, 10));
}

function isoTimestamp(isoDate) {
  return Date.parse(`${isoDate}T12:00:00.000Z`);
}

function isoDateFromTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999) {
    throw recurrenceLimit("Zakres powtarzania wykracza poza obsługiwany zakres dat.", "date");
  }
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year, month) {
  const date = new Date(0);
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCFullYear(year, month, 0);
  return date.getUTCDate();
}

export function createDefaultRecurrence(dateValue) {
  const date = validIsoDate(dateValue);
  if (!date) throw recurrenceError("Wybierz prawidłową datę zmiany.", "date");
  return {
    enabled: false,
    frequency: "WEEKLY",
    interval: 1,
    weekdays: [isoWeekday(date)],
    monthlyPattern: { kind: "DAY_OF_MONTH", day: dayOfMonth(date) },
    ends: { mode: "COUNT", count: 5, until: date },
  };
}

export function normalizeRecurrenceDraft(draft = {}, dateValue) {
  const date = validIsoDate(dateValue);
  if (!date) throw recurrenceError("Wybierz prawidłową datę zmiany.", "date");
  const frequency = String(draft.frequency ?? "").trim().toUpperCase();
  if (!Object.hasOwn(FREQUENCY_LABELS, frequency)) {
    throw recurrenceError("Wybierz częstotliwość powtarzania.", "frequency");
  }
  const interval = integer(draft.interval, "interval", 1, MAX_INTERVAL);
  const rule = { frequency, interval };

  if (frequency === "WEEKLY") {
    const weekdays = [...new Set((Array.isArray(draft.weekdays) ? draft.weekdays : []).map(Number))]
      .sort((left, right) => left - right);
    if (!weekdays.length || weekdays.some((weekday) => !Number.isSafeInteger(weekday) || weekday < 1 || weekday > 7)) {
      throw recurrenceError("Wybierz co najmniej jeden dzień tygodnia.", "weekdays");
    }
    rule.weekdays = weekdays;
  }

  if (frequency === "MONTHLY") {
    const source = draft.monthlyPattern && typeof draft.monthlyPattern === "object" ? draft.monthlyPattern : {};
    const kind = String(source.kind ?? "").trim().toUpperCase();
    if (kind === "DAY_OF_MONTH") {
      rule.monthlyPattern = { kind, day: integer(source.day, "monthlyPattern.day", 1, 31) };
    } else if (kind === "NTH_WEEKDAY") {
      const ordinal = Number(source.ordinal);
      if (![1, 2, 3, 4, -1].includes(ordinal)) {
        throw recurrenceError("Wybierz pozycję dnia w miesiącu.", "monthlyPattern.ordinal");
      }
      rule.monthlyPattern = {
        kind,
        ordinal,
        weekday: integer(source.weekday, "monthlyPattern.weekday", 1, 7),
      };
    } else if (kind === "LAST_DAY") {
      rule.monthlyPattern = { kind };
    } else {
      throw recurrenceError("Wybierz sposób powtarzania w miesiącu.", "monthlyPattern.kind");
    }
  }

  const endSource = draft.ends && typeof draft.ends === "object" ? draft.ends : {};
  const mode = String(endSource.mode ?? "").trim().toUpperCase();
  if (mode === "COUNT") {
    rule.ends = { mode, count: integer(endSource.count, "ends.count", 1, MAX_OCCURRENCES) };
  } else if (mode === "UNTIL") {
    const until = validIsoDate(endSource.until);
    if (!until || until < date) throw recurrenceError("Data końcowa nie może być wcześniejsza niż data zmiany.", "ends.until");
    const horizonDays = Math.round((isoTimestamp(until) - isoTimestamp(date)) / DAY_MS);
    if (horizonDays > MAX_HORIZON_DAYS) {
      throw recurrenceLimit(`Zakres powtarzania nie może przekraczać ${MAX_HORIZON_DAYS} dni.`, "ends.until");
    }
    rule.ends = { mode, until };
  } else {
    throw recurrenceError("Wybierz sposób zakończenia powtarzania.", "ends.mode");
  }
  return rule;
}

function matchesMonthlyPattern(candidate, pattern) {
  const day = candidate.getUTCDate();
  const month = candidate.getUTCMonth() + 1;
  const year = candidate.getUTCFullYear();
  if (pattern.kind === "DAY_OF_MONTH") return day === pattern.day;
  if (pattern.kind === "LAST_DAY") return day === daysInMonth(year, month);

  const weekday = candidate.getUTCDay() === 0 ? 7 : candidate.getUTCDay();
  if (weekday !== pattern.weekday) return false;
  if (pattern.ordinal === -1) return day + 7 > daysInMonth(year, month);
  return Math.floor((day - 1) / 7) + 1 === pattern.ordinal;
}

export function expandRecurrenceDraftDates(draft = {}, dateValue) {
  const startDate = validIsoDate(dateValue);
  if (!startDate) throw recurrenceError("Wybierz prawidłową datę zmiany.", "date");
  const rule = normalizeRecurrenceDraft(draft, startDate);
  const startTimestamp = isoTimestamp(startDate);
  const startWeekday = isoWeekday(startDate);
  const weeklyAnchorTimestamp = startTimestamp - (startWeekday - 1) * DAY_MS;
  const start = new Date(startTimestamp);
  const monthlyAnchorIndex = start.getUTCFullYear() * 12 + start.getUTCMonth();
  const requestedCount = rule.ends.mode === "COUNT" ? rule.ends.count : null;
  const scanDays = rule.ends.mode === "UNTIL"
    ? Math.round((isoTimestamp(rule.ends.until) - startTimestamp) / DAY_MS)
    : MAX_HORIZON_DAYS;
  const dates = [];

  for (let offset = 0; offset <= scanDays; offset += 1) {
    const timestamp = startTimestamp + offset * DAY_MS;
    const isoDate = isoDateFromTimestamp(timestamp);
    const candidate = new Date(timestamp);
    let matches = false;

    if (rule.frequency === "DAILY") {
      matches = offset % rule.interval === 0;
    } else if (rule.frequency === "WEEKLY") {
      const elapsedWeeks = Math.floor((timestamp - weeklyAnchorTimestamp) / (7 * DAY_MS));
      matches = elapsedWeeks % rule.interval === 0 && rule.weekdays.includes(isoWeekday(isoDate));
    } else {
      const monthIndex = candidate.getUTCFullYear() * 12 + candidate.getUTCMonth();
      matches = (monthIndex - monthlyAnchorIndex) % rule.interval === 0
        && matchesMonthlyPattern(candidate, rule.monthlyPattern);
    }

    if (!matches) continue;
    dates.push(isoDate);
    if (dates.length > MAX_OCCURRENCES) {
      throw recurrenceLimit(`Reguła nie może tworzyć więcej niż ${MAX_OCCURRENCES} wystąpień.`, "ends");
    }
    if (requestedCount !== null && dates.length === requestedCount) return dates;
  }

  if (requestedCount !== null && dates.length < requestedCount) {
    throw recurrenceLimit(`Nie można wygenerować wszystkich wystąpień w limicie ${MAX_HORIZON_DAYS} dni.`, "ends.count");
  }
  return dates;
}

function pluralInterval(frequency, interval) {
  if (interval === 1) return `co ${FREQUENCY_LABELS[frequency]}`;
  const plural = { DAILY: "dni", WEEKLY: "tygodnie", MONTHLY: "miesiące" }[frequency];
  return `co ${interval} ${plural}`;
}

export function recurrenceSummary(rule = {}) {
  const frequency = String(rule.frequency ?? "").toUpperCase();
  let cadence = pluralInterval(frequency, Number(rule.interval));
  if (frequency === "WEEKLY") {
    cadence += ` · ${rule.weekdays.map((weekday) => WEEKDAY_LABELS[weekday - 1]).join(", ")}`;
  }
  if (frequency === "MONTHLY") {
    const pattern = rule.monthlyPattern || {};
    if (pattern.kind === "DAY_OF_MONTH") cadence += ` · ${pattern.day}. dzień miesiąca`;
    if (pattern.kind === "LAST_DAY") cadence += " · ostatni dzień miesiąca";
    if (pattern.kind === "NTH_WEEKDAY") cadence += ` · ${ORDINAL_LABELS[pattern.ordinal]} ${WEEKDAY_LABELS[pattern.weekday - 1]}`;
  }
  const ending = rule.ends?.mode === "UNTIL"
    ? `do ${rule.ends.until}`
    : `${rule.ends?.count ?? 0} wystąpień`;
  return `${cadence} · ${ending}`;
}

export const RECURRENCE_LIMITS = Object.freeze({
  horizonDays: MAX_HORIZON_DAYS,
  interval: MAX_INTERVAL,
  occurrences: MAX_OCCURRENCES,
});
export const RECURRENCE_WEEKDAYS = WEEKDAY_LABELS;
