const DEVICE_ID_KEY = "bc.device_id";
const SESSION_ID_KEY = "bc.session_id";
const SESSION_UID_KEY = "bc.session_uid";
const AUTH_MESSAGE_KEY = "bc.auth_message";

function hasCryptoRandomUuid() {
  return typeof globalThis !== "undefined" && globalThis.crypto && typeof globalThis.crypto.randomUUID === "function";
}

function randomId() {
  if (hasCryptoRandomUuid()) {
    return globalThis.crypto.randomUUID();
  }
  const suffix = Math.random().toString(16).slice(2, 10);
  return `${Date.now()}-${suffix}`;
}

export function getOrCreateDeviceId() {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = `device-${randomId()}`;
  localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export function getStoredSession() {
  const uid = localStorage.getItem(SESSION_UID_KEY) || "";
  const sessionId = localStorage.getItem(SESSION_ID_KEY) || "";
  if (!uid || !sessionId) return null;
  return { uid, sessionId };
}

export function setStoredSession(uid, sessionId) {
  localStorage.setItem(SESSION_UID_KEY, String(uid || ""));
  localStorage.setItem(SESSION_ID_KEY, String(sessionId || ""));
}

export function clearStoredSession() {
  localStorage.removeItem(SESSION_UID_KEY);
  localStorage.removeItem(SESSION_ID_KEY);
}

export function newSessionId() {
  return `sess-${randomId()}`;
}

export function setAuthMessage(message) {
  localStorage.setItem(AUTH_MESSAGE_KEY, String(message || ""));
}

export function takeAuthMessage() {
  const message = localStorage.getItem(AUTH_MESSAGE_KEY) || "";
  localStorage.removeItem(AUTH_MESSAGE_KEY);
  return message;
}
