import { createFirebaseClient } from "./firebaseClient";
import { getOrCreateDeviceId, getStoredSession } from "../auth/sessionStorage";

const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL || "").trim() || "/api";

const SESSION_ERROR_CODES = new Set([
  "AUTH_REQUIRED",
  "AUTH_MISSING_TOKEN",
  "AUTH_MISSING_SESSION",
  "SESSION_EXPIRED",
  "SESSION_REVOKED",
  "UNAUTHORIZED",
]);

function makeEventId(prefix) {
  if (typeof globalThis !== "undefined" && globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function buildRouteUrl(route) {
  const base = API_BASE_URL.replace(/\/+$/, "");
  const cleanRoute = String(route || "").replace(/^\/+/, "");
  return cleanRoute ? `${base}/${cleanRoute}` : base;
}

function toQueryString(payload) {
  const search = new URLSearchParams();
  Object.entries(payload || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    search.set(key, String(value));
  });
  return search.toString();
}

export class ApiClientError extends Error {
  constructor(message, { code = "API_ERROR", status = 500, details = null } = {}) {
    super(String(message || "Nieznany blad API."));
    this.name = "ApiClientError";
    this.code = String(code || "API_ERROR");
    this.status = Number(status || 500);
    this.details = details ?? null;
  }
}

async function buildAuthPayload() {
  const { auth } = createFirebaseClient();
  const user = auth.currentUser;
  if (!user) {
    throw new ApiClientError("Brak aktywnej sesji logowania.", {
      code: "AUTH_REQUIRED",
      status: 401,
    });
  }

  const local = getStoredSession();
  if (!local || local.uid !== user.uid || !local.sessionId) {
    throw new ApiClientError("Sesja wygasla. Zaloguj sie ponownie.", {
      code: "AUTH_MISSING_SESSION",
      status: 401,
    });
  }

  const idToken = await user.getIdToken();
  return {
    idToken,
    sessionId: local.sessionId,
    deviceId: getOrCreateDeviceId(),
    clientNow: new Date().toISOString(),
    tzOffsetMinutes: new Date().getTimezoneOffset(),
  };
}

async function parseApiResponse(response) {
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    throw new ApiClientError(
      json?.error?.message || response.statusText || "Nie udalo sie wykonac zadania.",
      {
        code: json?.error?.code || `HTTP_${response.status}`,
        status: response.status,
        details: json?.error?.details ?? null,
      },
    );
  }

  if (json && json.ok === false) {
    throw new ApiClientError(json?.error?.message || "Blad odpowiedzi API.", {
      code: json?.error?.code || "API_ERROR",
      status: response.status,
      details: json?.error?.details ?? null,
    });
  }

  return json?.data ?? null;
}

async function requestApi(route, { method = "POST", payload = {}, withAuth = true } = {}) {
  const upperMethod = String(method || "POST").toUpperCase();
  const authPayload = withAuth ? await buildAuthPayload() : {};
  const mergedPayload = { ...authPayload, ...(payload || {}) };

  let url = buildRouteUrl(route);
  const init = { method: upperMethod };

  if (upperMethod === "GET") {
    const query = toQueryString(mergedPayload);
    if (query) url = `${url}?${query}`;
  } else {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(mergedPayload);
  }

  const response = await fetch(url, init);
  return parseApiResponse(response);
}

export function isSessionError(error) {
  const code = String(error?.code || "");
  const status = Number(error?.status || 0);
  return SESSION_ERROR_CODES.has(code) || status === 401;
}

export function errorMessage(error, fallback = "Nie udalo sie wykonac operacji.") {
  if (error instanceof ApiClientError) return error.message;
  const message = String(error?.message || "");
  return message || fallback;
}

export const backendApi = {
  health() {
    return requestApi("health", { method: "GET", withAuth: false });
  },
  authMe() {
    return requestApi("auth/me");
  },
  workdayUtilityId() {
    return requestApi("workday/utilityId");
  },
  workdayActive() {
    return requestApi("workday/active");
  },
  workdayStart({ roomId }) {
    return requestApi("workday/start", {
      payload: { roomId, startEventId: makeEventId("workday_start") },
    });
  },
  workdayBeginEnding({ roomId }) {
    return requestApi("workday/beginEnding", {
      payload: { roomId, endEventId: makeEventId("workday_begin_ending") },
    });
  },
  workdayCancelEnding() {
    return requestApi("workday/cancelEnding");
  },
  workdayCloseNow() {
    return requestApi("workday/closeNow", {
      payload: { endEventId: makeEventId("workday_close_now") },
    });
  },
  zoneResolve({ roomId }) {
    return requestApi("zones/resolve", { payload: { roomId } });
  },
  cycleActive() {
    return requestApi("cycles/active");
  },
  cycleStart({ roomId }) {
    return requestApi("cycles/start", {
      payload: { roomId, startEventId: makeEventId("cycle_start") },
    });
  },
  cycleStop({ cycleId, reason = "QR_SAME", comment = "" }) {
    return requestApi("cycles/stop", {
      payload: {
        cycleId,
        reason,
        comment,
        endEventId: makeEventId("cycle_stop"),
      },
    });
  },
  cycleStopAndStart({ cycleId, nextRoomId, reason = "QR_CHANGE", comment = "" }) {
    return requestApi("cycles/stopAndStart", {
      payload: {
        cycleId,
        nextRoomId,
        reason,
        comment,
        opEventId: makeEventId("cycle_stop_start"),
      },
    });
  },
};
