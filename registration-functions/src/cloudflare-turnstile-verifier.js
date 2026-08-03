import { createHash } from "node:crypto";
import { RegistrationGateError, requiredText } from "./registration-contract.js";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function deterministicUuid(secret, token) {
  const bytes = createHash("sha256")
    .update(secret, "utf8")
    .update("\0", "utf8")
    .update(token, "utf8")
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function failureCodes(value) {
  return Array.isArray(value)
    ? value.filter((code) => typeof code === "string").slice(0, 20)
    : [];
}

function normalizedHostname(value) {
  const hostname = String(value || "").trim().toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname.length > 253 || hostname.includes("..") || !/^[a-z0-9.-]+$/.test(hostname)) {
    return null;
  }
  return hostname;
}

function retryable(result, responseOk) {
  return !responseOk || failureCodes(result?.["error-codes"]).includes("internal-error");
}

function providerUnavailable(result, responseOk) {
  if (!responseOk) return true;
  const codes = failureCodes(result?.["error-codes"]);
  return codes.some((code) => [
    "internal-error",
    "missing-input-secret",
    "invalid-input-secret",
    "bad-request",
  ].includes(code));
}

export function createCloudflareTurnstileVerifier({
  secret,
  fetchImpl = fetch,
  timeoutMs = 5_000,
  maxAttempts = 2,
}) {
  const safeSecret = requiredText(secret, "TURNSTILE_SECRET_REQUIRED", 4_096);
  if (typeof fetchImpl !== "function") throw new RegistrationGateError("FETCH_REQUIRED");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 15_000) {
    throw new RegistrationGateError("INVALID_TURNSTILE_TIMEOUT");
  }
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 2) {
    throw new RegistrationGateError("INVALID_TURNSTILE_ATTEMPTS");
  }

  return Object.freeze({
    async verify({ token, expectedAction }) {
      const safeToken = requiredText(token, "TURNSTILE_TOKEN_REQUIRED", 2_048);
      const action = requiredText(expectedAction, "TURNSTILE_ACTION_REQUIRED", 32);
      if (!/^[A-Za-z0-9_-]+$/.test(action)) {
        throw new RegistrationGateError("TURNSTILE_ACTION_REQUIRED");
      }
      const idempotencyKey = deterministicUuid(safeSecret, safeToken);
      let lastResult = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetchImpl(SITEVERIFY_URL, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              secret: safeSecret,
              response: safeToken,
              idempotency_key: idempotencyKey,
            }),
            signal: controller.signal,
          });
          let result = null;
          try {
            result = await response.json();
          } catch {
            result = null;
          }
          lastResult = { responseOk: response.ok, result };
          if (!retryable(result, response.ok) || attempt === maxAttempts) break;
        } catch {
          lastResult = { responseOk: false, result: null };
          if (attempt === maxAttempts) break;
        } finally {
          clearTimeout(timeout);
        }
      }

      const result = lastResult?.result;
      const hostname = normalizedHostname(result?.hostname);
      const returnedAction = typeof result?.action === "string" ? result.action : null;
      if (!lastResult?.responseOk || result?.success !== true) {
        return Object.freeze({
          ok: false,
          mode: "enforce",
          action: returnedAction,
          hostname,
          reason: providerUnavailable(result, lastResult?.responseOk)
            ? "PROVIDER_UNAVAILABLE"
            : "TOKEN_REJECTED",
        });
      }
      return Object.freeze({
        ok: returnedAction === action && Boolean(hostname),
        mode: "enforce",
        action: returnedAction,
        hostname,
        reason: returnedAction !== action
          ? "ACTION_MISMATCH"
          : hostname ? null : "HOSTNAME_MISSING",
      });
    },
  });
}

export const __test = Object.freeze({ deterministicUuid, providerUnavailable });
