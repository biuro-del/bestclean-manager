import { createHmac } from "node:crypto";
import {
  REGISTRATION_ACTION,
  REGISTRATION_CHANNEL,
  RegistrationGateError,
  assertTurnstileVerification,
  normalizeRegistrationEmail,
  normalizedNow,
  requiredText,
} from "./registration-contract.js";

export const CLEANING_COMPANY_TRIAL_DAYS = 14;
export const CLEANING_COMPANY_TRIAL_DURATION_MS =
  CLEANING_COMPANY_TRIAL_DAYS * 24 * 60 * 60 * 1_000;

export const CLEANING_COMPANY_PLAN = Object.freeze({
  GO_PLUS: "GO_PLUS",
  PLUS: "PLUS",
  PRO: "PRO",
});

export const BILLING_CYCLE = Object.freeze({
  MONTHLY: "MONTHLY",
  ANNUAL: "ANNUAL",
});

export const PASSWORD_REGISTRATION_STATUS = Object.freeze({
  RESERVED: "RESERVED",
  AUTH_CREATED: "AUTH_CREATED",
  ORGANIZATION_CREATED: "ORGANIZATION_CREATED",
  VERIFICATION_LINK_CREATING: "VERIFICATION_LINK_CREATING",
  VERIFICATION_PENDING: "VERIFICATION_PENDING",
  COMPLETED: "COMPLETED",
  RECOVERY_REQUIRED: "RECOVERY_REQUIRED",
});

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,160}$/;
const REGISTRATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,160}$/;
const REGISTRATION_TOKEN_PATTERN = /^[A-Za-z0-9._~-]{40,100}$/;
const TIMEZONE_PATTERN = /^[A-Za-z0-9_+\-/]{1,80}$/;
const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;
const MIN_HMAC_KEY_BYTES = 32;
const MAX_SOURCE_EMAIL_LENGTH = 180;
const MAX_VERIFICATION_DISPLAY_NAME_LENGTH = 200;

function assertHmacKey(value) {
  const key = requiredText(value, "HMAC_KEY_REQUIRED", 4_096);
  if (Buffer.byteLength(key, "utf8") < MIN_HMAC_KEY_BYTES) {
    throw new RegistrationGateError("HMAC_KEY_TOO_SHORT");
  }
  return key;
}

function enumValue(value, allowed, code) {
  const normalized = requiredText(value, code, 40).toUpperCase();
  if (!Object.values(allowed).includes(normalized)) {
    throw new RegistrationGateError(code);
  }
  return normalized;
}

function optionalText(value, maxLength) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized.length > maxLength) {
    throw new RegistrationGateError("INVALID_REGISTRATION_PAYLOAD");
  }
  return normalized;
}

function versionedConsent(value, code) {
  const version = requiredText(value, code, 80);
  if (!/^[A-Za-z0-9._:-]+$/.test(version)) {
    throw new RegistrationGateError(code);
  }
  return version;
}

export function normalizeCleaningCompanyPasswordRequest(input = {}) {
  const registrationId = requiredText(
    input.registrationId,
    "INVALID_REGISTRATION_ID",
    160,
  );
  const idempotencyKey = requiredText(
    input.idempotencyKey,
    "INVALID_IDEMPOTENCY_KEY",
    160,
  );
  if (!REGISTRATION_ID_PATTERN.test(registrationId)) {
    throw new RegistrationGateError("INVALID_REGISTRATION_ID");
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new RegistrationGateError("INVALID_IDEMPOTENCY_KEY");
  }
  const registrationToken = requiredText(
    input.registrationToken,
    "INVALID_REGISTRATION_TOKEN",
    100,
  );
  if (!REGISTRATION_TOKEN_PATTERN.test(registrationToken)) {
    throw new RegistrationGateError("INVALID_REGISTRATION_TOKEN");
  }

  const firstName = requiredText(input.firstName, "FIRST_NAME_REQUIRED", 100);
  const lastName = requiredText(input.lastName, "LAST_NAME_REQUIRED", 100);
  const displayName = `${firstName} ${lastName}`;
  if (displayName.length > MAX_VERIFICATION_DISPLAY_NAME_LENGTH) {
    throw new RegistrationGateError("INVALID_DISPLAY_NAME");
  }
  const password = typeof input.password === "string"
    ? input.password.normalize("NFC")
    : "";
  if (!password || password.length > 256) {
    throw new RegistrationGateError("INVALID_PASSWORD");
  }
  const locale = optionalText(input.locale || "pl-PL", 20);
  const timezone = optionalText(input.timezone || "Europe/Warsaw", 80);
  if (!LOCALE_PATTERN.test(locale) || !TIMEZONE_PATTERN.test(timezone)) {
    throw new RegistrationGateError("INVALID_REGISTRATION_PAYLOAD");
  }

  const email = normalizeRegistrationEmail(input.email);
  if (email.length > MAX_SOURCE_EMAIL_LENGTH) {
    throw new RegistrationGateError("INVALID_EMAIL");
  }

  return Object.freeze({
    channel: REGISTRATION_CHANNEL.CLEANING_COMPANY,
    action: REGISTRATION_ACTION.CLEANING_COMPANY,
    registrationId,
    registrationToken,
    idempotencyKey,
    email,
    password,
    firstName,
    lastName,
    displayName,
    phone: optionalText(input.phone, 40) || null,
    selectedPlanCode: enumValue(
      input.selectedPlanCode,
      CLEANING_COMPANY_PLAN,
      "INVALID_SELECTED_PLAN",
    ),
    billingCycle: enumValue(
      input.billingCycle,
      BILLING_CYCLE,
      "INVALID_BILLING_CYCLE",
    ),
    locale,
    timezone,
    consents: Object.freeze({
      termsVersion: versionedConsent(
        input.consents?.termsVersion,
        "TERMS_CONSENT_REQUIRED",
      ),
      privacyVersion: versionedConsent(
        input.consents?.privacyVersion,
        "PRIVACY_CONSENT_REQUIRED",
      ),
      newsletterVersion: input.consents?.newsletterConsent === true
        ? versionedConsent(
          input.consents?.newsletterVersion,
          "NEWSLETTER_CONSENT_VERSION_REQUIRED",
        )
        : null,
      newsletterConsent: input.consents?.newsletterConsent === true,
    }),
  });
}

export function passwordRegistrationPrivateSnapshot(request) {
  return Object.freeze({
    channel: request.channel,
    action: request.action,
    registrationId: request.registrationId,
    email: request.email,
    firstName: request.firstName,
    lastName: request.lastName,
    displayName: request.displayName,
    phone: request.phone,
    selectedPlanCode: request.selectedPlanCode,
    billingCycle: request.billingCycle,
    locale: request.locale,
    timezone: request.timezone,
    consents: request.consents,
  });
}

export function passwordRegistrationRequestFingerprint(request, hmacKey) {
  const key = assertHmacKey(hmacKey);
  const canonical = JSON.stringify(passwordRegistrationPrivateSnapshot(request));
  const passwordHmac = createHmac("sha256", key)
    .update(
      ["cleanzi-password-registration-credential-v1", request.password].join("\u0000"),
      "utf8",
    )
    .digest("base64url");
  return createHmac("sha256", key)
    .update(
      ["cleanzi-password-registration-request-v2", canonical, passwordHmac].join("\u0000"),
      "utf8",
    )
    .digest("base64url");
}

export function derivePasswordRegistrationIdentifiers({ request, hmacKey }) {
  const key = assertHmacKey(hmacKey);
  const operationDigest = createHmac("sha256", key)
    .update([
      "cleanzi-password-registration-v1",
      request.channel,
      request.registrationId,
      request.idempotencyKey,
    ].join("\u0000"), "utf8")
    .digest("base64url");
  const emailHmac = createHmac("sha256", key)
    .update(["cleanzi-registration-email-v1", request.email].join("\u0000"), "utf8")
    .digest("base64url");
  return Object.freeze({
    operationId: `preg_${operationDigest}`,
    uid: `reg_${operationDigest}`,
    orgId: `org_reg_${operationDigest}`,
    emailHmac,
  });
}

export function cleaningCompanyTrialWindow(startedAtMs) {
  const trialStartedAtMs = normalizedNow(startedAtMs);
  return Object.freeze({
    trialStartedAtMs,
    trialEndsAtMs: trialStartedAtMs + CLEANING_COMPANY_TRIAL_DURATION_MS,
    trialDays: CLEANING_COMPANY_TRIAL_DAYS,
  });
}

export function assertCleaningCompanyTurnstile({
  verification,
  allowedHostnames,
}) {
  assertTurnstileVerification({
    verification,
    expectedAction: REGISTRATION_ACTION.CLEANING_COMPANY,
    allowedHostnames,
  });
}

export function assertVerificationContinueUrl(value, allowedHostnames) {
  const raw = requiredText(value, "INVALID_VERIFICATION_CONTINUE_URL", 2_048);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new RegistrationGateError("INVALID_VERIFICATION_CONTINUE_URL");
  }
  const hostname = url.hostname.toLowerCase();
  const allowed = new Set(
    (allowedHostnames || []).map((entry) => String(entry).trim().toLowerCase()),
  );
  const localHttp = url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "::1"].includes(hostname);
  if (
    (url.protocol !== "https:" && !localHttp) ||
    !allowed.has(hostname) ||
    url.username ||
    url.password
  ) {
    throw new RegistrationGateError("INVALID_VERIFICATION_CONTINUE_URL");
  }
  return url.toString();
}
