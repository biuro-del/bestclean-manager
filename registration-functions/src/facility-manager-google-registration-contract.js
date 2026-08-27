import { createHash, createHmac } from "node:crypto";
import {
  FACILITY_MANAGER_REGISTRATION_ACTION,
  FACILITY_MANAGER_REGISTRATION_CHANNEL,
  FacilityManagerRegistrationError,
  facilityManagerRequiredText,
  normalizeFacilityManagerRegistrationEmail,
} from "./facility-manager-registration-core.js";

export const FACILITY_MANAGER_GOOGLE_PROVIDER_ID = "google.com";
export const FACILITY_MANAGER_GOOGLE_REGISTRATION_SCHEMA_VERSION = 1;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,160}$/;
const MIN_HMAC_KEY_BYTES = 32;

function assertExactObject(value, allowedKeys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FacilityManagerRegistrationError(code);
  }
  const allowed = new Set(allowedKeys);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new FacilityManagerRegistrationError(code);
  }
  return value;
}

function normalizedNfcText(value, code, maxLength) {
  const text = typeof value === "string" ? value.normalize("NFC").trim() : "";
  if (!text || text.length > maxLength) {
    throw new FacilityManagerRegistrationError(code);
  }
  return text;
}

function assertHmacKey(value) {
  const key = facilityManagerRequiredText(value, "HMAC_KEY_REQUIRED", 4_096);
  if (Buffer.byteLength(key, "utf8") < MIN_HMAC_KEY_BYTES) {
    throw new FacilityManagerRegistrationError("HMAC_KEY_TOO_SHORT");
  }
  return key;
}

function canonicalRequest(value) {
  const request = assertExactObject(
    value,
    ["channel", "action", "idempotencyKey", "organizationName"],
    "INVALID_FACILITY_MANAGER_REGISTRATION_REQUEST",
  );
  if (
    request.channel !== FACILITY_MANAGER_REGISTRATION_CHANNEL ||
    request.action !== FACILITY_MANAGER_REGISTRATION_ACTION
  ) {
    throw new FacilityManagerRegistrationError("INVALID_FACILITY_MANAGER_REGISTRATION_REQUEST");
  }
  const idempotencyKey = facilityManagerRequiredText(request.idempotencyKey, "INVALID_IDEMPOTENCY_KEY", 160);
  if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    throw new FacilityManagerRegistrationError("INVALID_IDEMPOTENCY_KEY");
  }
  return Object.freeze({
    channel: FACILITY_MANAGER_REGISTRATION_CHANNEL,
    action: FACILITY_MANAGER_REGISTRATION_ACTION,
    idempotencyKey,
    organizationName: normalizedNfcText(request.organizationName, "ORGANIZATION_NAME_REQUIRED", 120),
  });
}

function canonicalGoogleIdentity(value) {
  const identity = assertExactObject(
    value,
    ["uid", "providerId", "subject", "email", "emailVerified"],
    "INVALID_FACILITY_MANAGER_GOOGLE_IDENTITY",
  );
  if (identity.providerId !== FACILITY_MANAGER_GOOGLE_PROVIDER_ID) {
    throw new FacilityManagerRegistrationError("FACILITY_MANAGER_GOOGLE_IDENTITY_REQUIRED");
  }
  if (identity.emailVerified !== true) {
    throw new FacilityManagerRegistrationError("FACILITY_MANAGER_GOOGLE_EMAIL_UNVERIFIED");
  }
  return Object.freeze({
    uid: facilityManagerRequiredText(identity.uid, "INVALID_UID", 128),
    providerId: FACILITY_MANAGER_GOOGLE_PROVIDER_ID,
    subject: facilityManagerRequiredText(identity.subject, "INVALID_GOOGLE_SUBJECT", 512),
    email: normalizeFacilityManagerRegistrationEmail(identity.email),
    emailVerified: true,
  });
}

export function deriveFacilityManagerGoogleIdentityKey({ googleIdentity }) {
  const identity = canonicalGoogleIdentity(googleIdentity);
  const digest = createHash("sha256")
    .update([
      "cleanzi-facility-manager-google-identity-v1",
      identity.providerId,
      identity.subject,
    ].join("\u0000"), "utf8")
    .digest("base64url");
  return `fmgi_${digest}`;
}

export function normalizeFacilityManagerGoogleRegistrationIntent(input = {}) {
  const body = assertExactObject(
    input,
    ["idempotencyKey", "organizationName"],
    "INVALID_FACILITY_MANAGER_REGISTRATION_PAYLOAD",
  );
  return canonicalRequest({
    channel: FACILITY_MANAGER_REGISTRATION_CHANNEL,
    action: FACILITY_MANAGER_REGISTRATION_ACTION,
    idempotencyKey: body.idempotencyKey,
    organizationName: body.organizationName,
  });
}

export function normalizeFacilityManagerGoogleIdentity(identity = {}) {
  return canonicalGoogleIdentity(identity);
}

export function deriveFacilityManagerGoogleRegistrationIdentifiers({ intent, googleIdentity, hmacKey }) {
  const request = canonicalRequest(intent);
  const identity = canonicalGoogleIdentity(googleIdentity);
  const digest = createHmac("sha256", assertHmacKey(hmacKey))
    .update([
      "cleanzi-facility-manager-google-registration-v1",
      request.channel,
      request.action,
      identity.providerId,
      identity.subject,
      request.idempotencyKey,
    ].join("\u0000"), "utf8")
    .digest("base64url");
  return Object.freeze({
    operationId: `fmreg_${digest}`,
    organizationId: `org_fm_${digest}`,
  });
}

export function createFacilityManagerGoogleRegistrationCommand({ input, googleIdentity, hmacKey }) {
  const intent = normalizeFacilityManagerGoogleRegistrationIntent(input);
  const identity = normalizeFacilityManagerGoogleIdentity(googleIdentity);
  const identifiers = deriveFacilityManagerGoogleRegistrationIdentifiers({ intent, googleIdentity: identity, hmacKey });
  const ownerGoogleIdentityKey = deriveFacilityManagerGoogleIdentityKey({ googleIdentity: identity });
  return Object.freeze({
    channel: FACILITY_MANAGER_REGISTRATION_CHANNEL,
    action: FACILITY_MANAGER_REGISTRATION_ACTION,
    ...identifiers,
    organizationName: intent.organizationName,
    ownerUid: identity.uid,
    ownerEmail: identity.email,
    ownerGoogleIdentityKey,
  });
}
