import { adminAuth, adminDb } from "./firebaseAdmin.js";
import { apiError, ensureString } from "./utils.js";

function isInactiveFlag(value) {
  if (value === false || value === 0) return true;
  const normalized = ensureString(value).toLowerCase();
  return normalized === "false" || normalized === "0" || normalized === "no" || normalized === "nie" || normalized === "inactive";
}

function fallbackLoginFromEmail(email) {
  const safe = ensureString(email).toLowerCase();
  if (!safe.includes("@")) return "";
  return safe.split("@")[0];
}

export async function requireWorkerFromPayload(payload) {
  const idToken = ensureString(payload?.idToken);
  if (!idToken) {
    throw apiError("AUTH_MISSING_TOKEN", "Missing idToken.", 401);
  }

  const sessionId = ensureString(payload?.sessionId);
  if (!sessionId) {
    throw apiError("AUTH_MISSING_SESSION", "Missing sessionId.", 401);
  }

  const requestDeviceId = ensureString(payload?.deviceId);
  const decoded = await adminAuth().verifyIdToken(idToken, true);
  const uid = ensureString(decoded?.uid);
  if (!uid) {
    throw apiError("UNAUTHORIZED", "Invalid auth token.", 401);
  }

  const db = adminDb();
  const sessionSnap = await db.collection("sessions").doc(uid).get();
  if (!sessionSnap.exists) {
    throw apiError("SESSION_EXPIRED", "Session expired. Please login again.", 401);
  }

  const sessionData = sessionSnap.data() || {};
  const activeSessionId = ensureString(sessionData.activeSessionId);
  const activeDeviceId = ensureString(sessionData.deviceId);

  if (!activeSessionId || activeSessionId !== sessionId) {
    throw apiError("SESSION_REVOKED", "Twoje konto zostalo zalogowane na innym urzadzeniu. Zaloguj sie ponownie.", 401);
  }

  if (requestDeviceId && activeDeviceId && requestDeviceId !== activeDeviceId) {
    throw apiError("SESSION_REVOKED", "Twoje konto zostalo zalogowane na innym urzadzeniu. Zaloguj sie ponownie.", 401);
  }

  const userSnap = await db.collection("users").doc(uid).get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};

  if (isInactiveFlag(userData.active)) {
    throw apiError("ACCOUNT_INACTIVE", "Konto jest nieaktywne.", 403);
  }

  const email = ensureString(decoded.email);
  const login = ensureString(userData.login) || fallbackLoginFromEmail(email);
  const roles = Array.isArray(userData.roles) ? userData.roles.map((item) => ensureString(item)).filter(Boolean) : [];

  return {
    uid,
    email,
    login,
    name: ensureString(userData.name || decoded.name),
    role: ensureString(userData.role),
    roles,
    deviceId: requestDeviceId || activeDeviceId,
  };
}
