import { RegistrationGateError, requiredText } from "./registration-contract.js";

function commaSeparated(value, code, normalizer) {
  const values = requiredText(value, code, 8_192)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(normalizer);
  if (values.length === 0 || new Set(values).size !== values.length) {
    throw new RegistrationGateError(code);
  }
  return Object.freeze(values);
}

function hostname(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/\.$/, "");
  if (
    !normalized ||
    normalized.length > 253 ||
    normalized.includes("..") ||
    !/^[a-z0-9.-]+$/.test(normalized)
  ) {
    throw new RegistrationGateError("INVALID_ALLOWED_HOSTNAMES");
  }
  return normalized;
}

function origin(value) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch {
    throw new RegistrationGateError("INVALID_ALLOWED_ORIGINS");
  }
  const isLocalHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !isLocalHttp) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new RegistrationGateError("INVALID_ALLOWED_ORIGINS");
  }
  return url.origin;
}

function appId(value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 200 || !/^[A-Za-z0-9:._-]+$/.test(normalized)) {
    throw new RegistrationGateError("INVALID_APP_CHECK_APP_IDS");
  }
  return normalized;
}

function collection(value, code) {
  const normalized = requiredText(value, code, 100);
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new RegistrationGateError(code);
  }
  return normalized;
}

export function normalizeDatabaseUrl(value) {
  const raw = requiredText(value, "DATABASE_URL_REQUIRED", 8_192);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new RegistrationGateError("DATABASE_URL_INVALID");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    !url.pathname ||
    url.pathname === "/" ||
    url.hash
  ) {
    throw new RegistrationGateError("DATABASE_URL_INVALID");
  }
  return raw;
}

export function createRegistrationRuntimeConfiguration(input = {}) {
  return Object.freeze({
    allowedOrigins: commaSeparated(
      input.allowedOrigins,
      "INVALID_ALLOWED_ORIGINS",
      origin,
    ),
    allowedHostnames: commaSeparated(
      input.allowedHostnames,
      "INVALID_ALLOWED_HOSTNAMES",
      hostname,
    ),
    allowedAppIds: commaSeparated(
      input.allowedAppIds,
      "INVALID_APP_CHECK_APP_IDS",
      appId,
    ),
    verificationContinueUrl: requiredText(
      input.verificationContinueUrl,
      "INVALID_VERIFICATION_CONTINUE_URL",
      2_048,
    ),
    verificationFrom: requiredText(
      input.verificationFrom,
      "VERIFICATION_FROM_REQUIRED",
      320,
    ),
    verificationReplyTo: String(input.verificationReplyTo || "").trim() || null,
    passwordOperationCollection: collection(
      input.passwordOperationCollection,
      "INVALID_OPERATION_COLLECTION",
    ),
    abuseCollection: collection(
      input.abuseCollection,
      "INVALID_ABUSE_COLLECTION",
    ),
    verificationDeliveryCollection: collection(
      input.verificationDeliveryCollection,
      "INVALID_DELIVERY_COLLECTION",
    ),
    passwordCheckUserAgent: requiredText(
      input.passwordCheckUserAgent,
      "INVALID_PASSWORD_CHECK_USER_AGENT",
      200,
    ),
  });
}

export const __test = Object.freeze({ appId, hostname, origin });
