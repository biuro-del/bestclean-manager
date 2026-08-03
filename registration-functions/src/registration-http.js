import { RegistrationGateError } from "./registration-contract.js";

const CLIENT_ERROR_CODES = new Set([
  "INVALID_REGISTRATION_ID",
  "INVALID_IDEMPOTENCY_KEY",
  "INVALID_REGISTRATION_TOKEN",
  "INVALID_EMAIL",
  "INVALID_PASSWORD",
  "INVALID_DISPLAY_NAME",
  "FIRST_NAME_REQUIRED",
  "LAST_NAME_REQUIRED",
  "INVALID_SELECTED_PLAN",
  "INVALID_BILLING_CYCLE",
  "INVALID_REGISTRATION_PAYLOAD",
  "TERMS_CONSENT_REQUIRED",
  "PRIVACY_CONSENT_REQUIRED",
  "NEWSLETTER_CONSENT_VERSION_REQUIRED",
]);
const PASSWORD_ERROR_CODES = new Set([
  "PASSWORD_TOO_SHORT",
  "PASSWORD_TOO_LONG",
  "PASSWORD_CONTROL_CHARACTER",
  "PASSWORD_CONTEXTUAL",
  "PASSWORD_COMPROMISED",
]);
const SOURCE_ERROR_CODES = new Set([
  "SOURCE_ATTEMPT_NOT_FOUND",
  "SOURCE_ATTEMPT_STATE_INVALID",
  "SOURCE_ATTEMPT_EXPIRED",
  "SOURCE_ATTEMPT_TOKEN_INVALID",
  "SOURCE_ATTEMPT_PAYLOAD_MISMATCH",
  "SOURCE_ATTEMPT_ALREADY_BOUND",
  "SOURCE_TERMS_CONSENT_INVALID",
  "SOURCE_PRIVACY_CONSENT_INVALID",
  "SOURCE_NEWSLETTER_CONSENT_INVALID",
  "SOURCE_NEWSLETTER_CONSENT_MISMATCH",
]);
const TURNSTILE_ERROR_CODES = new Set([
  "TURNSTILE_TOKEN_REQUIRED",
  "TURNSTILE_VERIFICATION_FAILED",
  "TURNSTILE_ENFORCEMENT_REQUIRED",
  "TURNSTILE_ACTION_MISMATCH",
  "TURNSTILE_HOSTNAME_NOT_ALLOWED",
  "TURNSTILE_HOSTNAME_MISMATCH",
  "INVALID_TURNSTILE_HOSTNAME",
]);

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function header(request, name) {
  if (typeof request?.get === "function") return request.get(name);
  const key = String(name).toLowerCase();
  return request?.headers?.[key] || request?.headers?.[name] || null;
}

function writeJson(response, status, body, extraHeaders = {}) {
  response.set?.("Cache-Control", "no-store");
  response.set?.("X-Content-Type-Options", "nosniff");
  for (const [name, value] of Object.entries(extraHeaders)) response.set?.(name, value);
  return response.status(status).json(body);
}

function exactOrigin(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function applyCors(request, response, allowedOrigins) {
  const origin = exactOrigin(header(request, "origin"));
  if (!origin || !allowedOrigins.has(origin)) {
    throw new HttpError(403, "REGISTRATION_ORIGIN_NOT_ALLOWED");
  }
  response.set?.("Access-Control-Allow-Origin", origin);
  response.set?.("Vary", "Origin");
  response.set?.("Access-Control-Allow-Methods", "POST,OPTIONS");
  response.set?.("Access-Control-Allow-Headers", "Content-Type,X-Firebase-AppCheck");
  response.set?.("Access-Control-Max-Age", "3600");
}

function requireJsonRequest(request, maxBodyBytes) {
  const contentType = String(header(request, "content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new HttpError(415, "JSON_CONTENT_TYPE_REQUIRED");
  }
  if (request?.rawBody && request.rawBody.length > maxBodyBytes) {
    throw new HttpError(413, "REQUEST_TOO_LARGE");
  }
  if (!request?.body || typeof request.body !== "object" || Array.isArray(request.body)) {
    throw new HttpError(400, "INVALID_REGISTRATION_PAYLOAD");
  }
  return request.body;
}

async function requireAppCheck(request, appCheck, allowedAppIds) {
  const token = String(header(request, "x-firebase-appcheck") || "").trim();
  if (!token) throw new HttpError(401, "APP_CHECK_REQUIRED");
  let claims;
  try {
    claims = await appCheck.verifyToken(token);
  } catch {
    throw new HttpError(401, "APP_CHECK_INVALID");
  }
  if (!allowedAppIds.has(claims?.appId)) {
    throw new HttpError(403, "APP_CHECK_APP_NOT_ALLOWED");
  }
}

function publicRegistrationError(error) {
  const code = String(error?.code || "");
  if (CLIENT_ERROR_CODES.has(code)) return new HttpError(400, code);
  if (PASSWORD_ERROR_CODES.has(code)) return new HttpError(422, code);
  if (TURNSTILE_ERROR_CODES.has(code)) return new HttpError(403, "TURNSTILE_REJECTED");
  if (SOURCE_ERROR_CODES.has(code)) return new HttpError(409, "REGISTRATION_AUTHORIZATION_INVALID");
  if (code === "REGISTRATION_RATE_LIMITED") return new HttpError(429, code);
  if (["IDEMPOTENCY_CONFLICT", "ACCOUNT_ALREADY_EXISTS_USE_LOGIN", "TRIAL_ALREADY_USED"].includes(code)) {
    return new HttpError(409, "REGISTRATION_CONFLICT");
  }
  if ([
    "PASSWORD_CHECK_UNAVAILABLE",
    "TURNSTILE_PROVIDER_UNAVAILABLE",
    "REGISTRATION_RECOVERY_REQUIRED",
    "DATABASE_UNAVAILABLE_BEFORE_TRANSACTION",
    "DATABASE_COMMIT_RESULT_UNKNOWN",
  ].includes(code)) {
    return new HttpError(503, "REGISTRATION_TEMPORARILY_UNAVAILABLE");
  }
  return new HttpError(500, "INTERNAL_ERROR");
}

export function createCleaningCompanyRegistrationHttpHandler({
  broker,
  appCheck,
  allowedOrigins,
  allowedAppIds,
  maxBodyBytes = 32 * 1024,
  onUnexpectedError = () => {},
}) {
  if (typeof broker?.register !== "function") throw new Error("REGISTRATION_BROKER_REQUIRED");
  if (typeof appCheck?.verifyToken !== "function") throw new Error("APP_CHECK_REQUIRED");
  const origins = new Set(allowedOrigins || []);
  const appIds = new Set(allowedAppIds || []);
  if (!origins.size || !appIds.size) throw new Error("REGISTRATION_ALLOWLIST_REQUIRED");
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1_024 || maxBodyBytes > 128 * 1_024) {
    throw new Error("INVALID_REQUEST_BODY_LIMIT");
  }

  return async function cleaningCompanyRegistrationHttp(request, response) {
    try {
      applyCors(request, response, origins);
      if (request.method === "OPTIONS") return response.status(204).send("");
      if (request.method !== "POST") throw new HttpError(405, "METHOD_NOT_ALLOWED");
      await requireAppCheck(request, appCheck, appIds);
      const body = requireJsonRequest(request, maxBodyBytes);
      const result = await broker.register(body);
      return writeJson(response, 200, result);
    } catch (error) {
      const publicError = error instanceof HttpError
        ? error
        : publicRegistrationError(error);
      if (publicError.status >= 500) {
        onUnexpectedError({
          code: error instanceof RegistrationGateError ? error.code : "UNEXPECTED_ERROR",
          publicCode: publicError.code,
        });
      }
      return writeJson(
        response,
        publicError.status,
        { error: { code: publicError.code } },
        publicError.status === 429 ? { "Retry-After": "900" } : {},
      );
    }
  };
}

export const __test = Object.freeze({ exactOrigin, publicRegistrationError });
