import { createHash } from "node:crypto";
import { RegistrationGateError } from "./registration-contract.js";

const PWNED_PASSWORDS_RANGE_URL = "https://api.pwnedpasswords.com/range";

function passwordCodePoints(value) {
  return Array.from(value).length;
}

function contextToken(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("pl-PL")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function contextualPassword(password, context = {}) {
  const candidate = contextToken(password);
  const emailLocal = String(context.email || "").split("@", 1)[0];
  const seeds = new Set([
    "cleanzi",
    contextToken(emailLocal),
    contextToken(context.firstName),
    contextToken(context.lastName),
    contextToken(`${context.firstName || ""}${context.lastName || ""}`),
    contextToken(`${context.lastName || ""}${context.firstName || ""}`),
  ].filter((item) => item.length >= 3));
  const withoutTrailingDigits = candidate.replace(/\d{1,8}$/, "");
  for (const seed of seeds) {
    if (
      candidate === seed ||
      withoutTrailingDigits === seed ||
      (
        withoutTrailingDigits.length >= 2 * seed.length &&
        withoutTrailingDigits.replaceAll(seed, "") === ""
      )
    ) return true;
  }
  return false;
}

export function createPwnedPasswordChecker({
  fetchImpl = fetch,
  timeoutMs = 5_000,
  userAgent = "Cleanzi-registration-password-policy/1.0",
}) {
  if (typeof fetchImpl !== "function") throw new RegistrationGateError("FETCH_REQUIRED");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 15_000) {
    throw new RegistrationGateError("INVALID_PASSWORD_CHECK_TIMEOUT");
  }
  const safeUserAgent = String(userAgent || "").trim();
  if (!safeUserAgent || safeUserAgent.length > 200) {
    throw new RegistrationGateError("INVALID_PASSWORD_CHECK_USER_AGENT");
  }
  return Object.freeze({
    async isCompromised(password) {
      const digest = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
      const prefix = digest.slice(0, 5);
      const suffix = digest.slice(5);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${PWNED_PASSWORDS_RANGE_URL}/${prefix}`, {
          method: "GET",
          headers: {
            "Add-Padding": "true",
            "User-Agent": safeUserAgent,
          },
          signal: controller.signal,
        });
        if (!response.ok) throw new RegistrationGateError("PASSWORD_CHECK_UNAVAILABLE");
        const body = await response.text();
        if (body.length > 200_000) throw new RegistrationGateError("PASSWORD_CHECK_UNAVAILABLE");
        return body.split(/\r?\n/).some((line) => {
          const [candidate, count] = line.trim().split(":", 2);
          return candidate === suffix && Number(count) > 0;
        });
      } catch (error) {
        if (error instanceof RegistrationGateError) throw error;
        throw new RegistrationGateError("PASSWORD_CHECK_UNAVAILABLE");
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}

export function createCleaningCompanyPasswordPolicy({ compromisedPasswordChecker }) {
  if (typeof compromisedPasswordChecker?.isCompromised !== "function") {
    throw new RegistrationGateError("COMPROMISED_PASSWORD_CHECKER_REQUIRED");
  }
  return Object.freeze({
    async assertAllowed(password, context = {}) {
      if (typeof password !== "string") throw new RegistrationGateError("INVALID_PASSWORD");
      const length = passwordCodePoints(password);
      if (length < 15) throw new RegistrationGateError("PASSWORD_TOO_SHORT");
      if (length > 128) throw new RegistrationGateError("PASSWORD_TOO_LONG");
      if (/[\p{Cc}\p{Cf}\p{Cs}]/u.test(password)) {
        throw new RegistrationGateError("PASSWORD_CONTROL_CHARACTER");
      }
      if (contextualPassword(password, context)) {
        throw new RegistrationGateError("PASSWORD_CONTEXTUAL");
      }
      if (await compromisedPasswordChecker.isCompromised(password)) {
        throw new RegistrationGateError("PASSWORD_COMPROMISED");
      }
    },
  });
}

export const __test = Object.freeze({ contextualPassword, passwordCodePoints });
