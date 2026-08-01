import { createHash, createHmac, randomUUID } from "node:crypto";

export const REGISTRATION_GRANT_SCHEMA_VERSION = 1;
export const FIREBASE_AUTH_EVENT_SERVICE = "identitytoolkit.googleapis.com";

export const REGISTRATION_CHANNEL = Object.freeze({
  FACILITY_MANAGER: "FACILITY_MANAGER",
  CLEANING_COMPANY: "CLEANING_COMPANY",
});

export const REGISTRATION_ACTION = Object.freeze({
  FACILITY_MANAGER: "registration_facility_manager",
  CLEANING_COMPANY: "registration_cleaning_company",
});

export const REGISTRATION_PROVIDER = Object.freeze({
  EMAIL_LINK: "emailLink",
  GOOGLE: "google.com",
});

export const MICROSOFT_PROVIDER_ID = "microsoft.com";

export const REGISTRATION_GRANT_STATUS = Object.freeze({
  ISSUED: "ISSUED",
  CONSUMED: "CONSUMED",
});

export const EMAIL_LINK_GRANT_TTL_MS = 30 * 60 * 1_000;
export const FEDERATED_GRANT_TTL_MS = 5 * 60 * 1_000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_SUBJECT_LENGTH = 512;
const MIN_HMAC_KEY_BYTES = 32;

export class RegistrationGateError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "RegistrationGateError";
    this.code = code;
  }
}

export function requiredText(value, code, maxLength = 512) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maxLength) {
    throw new RegistrationGateError(code);
  }
  return text;
}

export function normalizedNow(value) {
  const nowMs = Number(value);
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0) {
    throw new RegistrationGateError("INVALID_NOW");
  }
  return nowMs;
}

function normalizedAllowlist(values, errorCode) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new RegistrationGateError(errorCode);
  }
  return new Set(values.map((value) => requiredText(value, errorCode)));
}

function normalizeHostname(value) {
  const hostname = typeof value === "string"
    ? value.trim().toLowerCase().replace(/\.$/, "")
    : "";
  if (
    !hostname ||
    hostname.length > 253 ||
    !/^[a-z0-9.-]+$/.test(hostname) ||
    hostname.includes("..")
  ) {
    throw new RegistrationGateError("INVALID_TURNSTILE_HOSTNAME");
  }
  return hostname;
}

function assertHmacKey(value) {
  const key = requiredText(value, "HMAC_KEY_REQUIRED", 4_096);
  if (Buffer.byteLength(key, "utf8") < MIN_HMAC_KEY_BYTES) {
    throw new RegistrationGateError("HMAC_KEY_TOO_SHORT");
  }
  return key;
}

function assertChannelAction(channel, action) {
  const expectedAction = REGISTRATION_ACTION[channel];
  if (!expectedAction || action !== expectedAction) {
    throw new RegistrationGateError("INVALID_REGISTRATION_CHANNEL_ACTION");
  }
}

export function normalizeRegistrationEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new RegistrationGateError("INVALID_EMAIL");
  }
  return email;
}

export function normalizeProviderSubject(value) {
  return requiredText(value, "INVALID_PROVIDER_SUBJECT", MAX_SUBJECT_LENGTH);
}

function providerDataSubject(user, providerId) {
  const provider = Array.isArray(user?.providerData)
    ? user.providerData.find((entry) => entry?.providerId === providerId)
    : null;
  return provider?.uid || null;
}

export function assertBeforeCreateContext(event, allowedResources) {
  if (
    typeof event?.eventType !== "string" ||
    !event.eventType.includes("/user.beforeCreate:")
  ) {
    throw new RegistrationGateError("INVALID_BEFORE_CREATE_EVENT_TYPE");
  }

  const resource = event?.resource;
  if (
    !resource ||
    typeof resource !== "object" ||
    Array.isArray(resource) ||
    resource.service !== FIREBASE_AUTH_EVENT_SERVICE
  ) {
    throw new RegistrationGateError("AUTH_RESOURCE_MISMATCH");
  }

  const allowed = normalizedAllowlist(
    allowedResources,
    "ALLOWED_AUTH_RESOURCES_REQUIRED",
  );
  const resourceName = requiredText(
    resource.name,
    "AUTH_RESOURCE_MISMATCH",
  );
  if (!allowed.has(resourceName)) {
    throw new RegistrationGateError("AUTH_RESOURCE_MISMATCH");
  }
}

export function identityFromBeforeCreate(event) {
  const user = event?.data;
  if (!user?.uid) {
    throw new RegistrationGateError("INVALID_BEFORE_CREATE_EVENT");
  }

  const credentialProvider = event?.credential?.providerId;
  const googleProviderSubject = providerDataSubject(
    user,
    REGISTRATION_PROVIDER.GOOGLE,
  );
  const googleCredentialSubject = event?.credential?.claims?.sub;

  if (
    credentialProvider === REGISTRATION_PROVIDER.GOOGLE ||
    googleProviderSubject
  ) {
    if (
      googleProviderSubject &&
      googleCredentialSubject &&
      googleProviderSubject !== googleCredentialSubject
    ) {
      throw new RegistrationGateError("PROVIDER_SUBJECT_MISMATCH");
    }
    return {
      providerId: REGISTRATION_PROVIDER.GOOGLE,
      subject: normalizeProviderSubject(
        googleProviderSubject || googleCredentialSubject,
      ),
    };
  }

  if (
    credentialProvider === MICROSOFT_PROVIDER_ID ||
    providerDataSubject(user, MICROSOFT_PROVIDER_ID)
  ) {
    throw new RegistrationGateError("MICROSOFT_BROKER_REQUIRED");
  }

  const signInMethod = String(event?.credential?.signInMethod || "");
  const eventSignInMethod = String(event?.eventType || "").split(":").at(-1);
  const emailLinkEvent = signInMethod === REGISTRATION_PROVIDER.EMAIL_LINK
    || eventSignInMethod === REGISTRATION_PROVIDER.EMAIL_LINK;
  const passwordEvent = signInMethod === "password"
    || eventSignInMethod === "password";
  if (
    emailLinkEvent
    || passwordEvent
  ) {
    if (user.emailVerified !== true) {
      throw new RegistrationGateError("EMAIL_LINK_NOT_VERIFIED");
    }
    return {
      providerId: REGISTRATION_PROVIDER.EMAIL_LINK,
      subject: normalizeRegistrationEmail(user.email),
    };
  }

  throw new RegistrationGateError("UNSUPPORTED_PROVIDER");
}

export function deriveRegistrationSubjectHmac({
  hmacKey,
  channel,
  action,
  providerId,
  subject,
}) {
  assertChannelAction(channel, action);
  if (!Object.values(REGISTRATION_PROVIDER).includes(providerId)) {
    throw new RegistrationGateError("UNSUPPORTED_PROVIDER");
  }
  const normalizedSubject = providerId === REGISTRATION_PROVIDER.EMAIL_LINK
    ? normalizeRegistrationEmail(subject)
    : normalizeProviderSubject(subject);
  const payload = [
    `v${REGISTRATION_GRANT_SCHEMA_VERSION}`,
    channel,
    action,
    providerId,
    normalizedSubject,
  ].join("\u0000");
  return createHmac("sha256", assertHmacKey(hmacKey))
    .update(payload, "utf8")
    .digest("base64url");
}

export function registrationGrantCandidate({
  hmacKey,
  channel,
  action,
  providerId,
  subject,
}) {
  return {
    schemaVersion: REGISTRATION_GRANT_SCHEMA_VERSION,
    channel,
    action,
    providerId,
    subjectHmac: deriveRegistrationSubjectHmac({
      hmacKey,
      channel,
      action,
      providerId,
      subject,
    }),
  };
}

export function registrationGrantDocumentId(candidate) {
  if (candidate?.schemaVersion !== REGISTRATION_GRANT_SCHEMA_VERSION) {
    throw new RegistrationGateError("INVALID_GRANT_CANDIDATE");
  }
  const payload = [
    `v${candidate.schemaVersion}`,
    candidate?.channel,
    candidate?.action,
    candidate?.providerId,
    candidate?.subjectHmac,
  ].map((value) => requiredText(value, "INVALID_GRANT_CANDIDATE"))
    .join("\u0000");
  return createHash("sha256").update(payload, "utf8").digest("base64url");
}

export function assertTurnstileVerification({
  verification,
  expectedAction,
  allowedHostnames,
}) {
  if (
    verification?.ok !== true ||
    verification?.mode !== "enforce" ||
    verification?.action !== expectedAction
  ) {
    throw new RegistrationGateError("TURNSTILE_ENFORCEMENT_REQUIRED");
  }

  const allowed = new Set(
    [...normalizedAllowlist(
      allowedHostnames,
      "TURNSTILE_HOSTNAMES_REQUIRED",
    )].map((hostname) => normalizeHostname(hostname)),
  );
  if (!allowed.has(normalizeHostname(verification.hostname))) {
    throw new RegistrationGateError("TURNSTILE_HOSTNAME_MISMATCH");
  }
}

export function issueRegistrationGrant({
  channel,
  action,
  providerId,
  subject,
  hmacKey,
  turnstileVerification,
  allowedHostnames,
  nowMs = Date.now(),
  randomUuid = randomUUID,
}) {
  assertChannelAction(channel, action);
  assertTurnstileVerification({
    verification: turnstileVerification,
    expectedAction: action,
    allowedHostnames,
  });
  const issuedAtMs = normalizedNow(nowMs);
  const candidate = registrationGrantCandidate({
    hmacKey,
    channel,
    action,
    providerId,
    subject,
  });
  const ttlMs = providerId === REGISTRATION_PROVIDER.EMAIL_LINK
    ? EMAIL_LINK_GRANT_TTL_MS
    : FEDERATED_GRANT_TTL_MS;
  return {
    ...candidate,
    grantId: requiredText(randomUuid(), "INVALID_GRANT_ID", 128),
    status: REGISTRATION_GRANT_STATUS.ISSUED,
    issuedAtMs,
    expiresAtMs: issuedAtMs + ttlMs,
    consumedAtMs: null,
    consumedByUid: null,
    consumedByEventId: null,
  };
}
