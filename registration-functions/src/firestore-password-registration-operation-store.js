import {
  PASSWORD_REGISTRATION_STATUS,
} from "./password-registration-contract.js";
import {
  RegistrationGateError,
  normalizedNow,
  requiredText,
} from "./registration-contract.js";

const ALLOWED_PATCH_FIELDS = new Set([
  "authCreatedAtMs",
  "authCompensatedAtMs",
  "organizationCreatedAtMs",
  "trialStartedAtMs",
  "trialEndsAtMs",
  "trialDays",
  "verificationSentAtMs",
  "emailVerifiedObservedAtMs",
  "verificationFailureCode",
  "lastFailureCode",
  "compensationFailureCode",
  "compensationId",
  "compensationStartedAtMs",
  "verificationLinkEnvelope",
  "verificationLinkLeaseId",
  "verificationLinkLeaseUntilMs",
]);

function assertCollectionName(value) {
  const name = requiredText(value, "INVALID_OPERATION_COLLECTION", 100);
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new RegistrationGateError("INVALID_OPERATION_COLLECTION");
  }
  return name;
}

function assertStatus(value) {
  if (!Object.values(PASSWORD_REGISTRATION_STATUS).includes(value)) {
    throw new RegistrationGateError("INVALID_OPERATION_STATUS");
  }
  return value;
}

function sanitizedPatch(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const patch = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (!ALLOWED_PATCH_FIELDS.has(key)) {
      throw new RegistrationGateError("INVALID_OPERATION_PATCH");
    }
    patch[key] = fieldValue;
  }
  return patch;
}

function expectedStatusSet(values) {
  const expected = new Set(
    (values || []).map((status) => assertStatus(status)),
  );
  if (expected.size === 0) {
    throw new RegistrationGateError("EXPECTED_OPERATION_STATUS_REQUIRED");
  }
  return expected;
}

function verificationEnvelope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RegistrationGateError("VERIFICATION_LINK_ENVELOPE_INVALID");
  }
  const envelope = {
    version: value.version,
    algorithm: requiredText(
      value.algorithm,
      "VERIFICATION_LINK_ENVELOPE_INVALID",
      32,
    ),
    iv: requiredText(value.iv, "VERIFICATION_LINK_ENVELOPE_INVALID", 128),
    ciphertext: requiredText(
      value.ciphertext,
      "VERIFICATION_LINK_ENVELOPE_INVALID",
      8_192,
    ),
    tag: requiredText(value.tag, "VERIFICATION_LINK_ENVELOPE_INVALID", 128),
  };
  if (envelope.version !== 1 || envelope.algorithm !== "A256GCM") {
    throw new RegistrationGateError("VERIFICATION_LINK_ENVELOPE_INVALID");
  }
  return envelope;
}

export function createFirestorePasswordRegistrationOperationStore({
  db,
  collectionName = "cleanziPasswordRegistrationOperations",
}) {
  if (typeof db?.runTransaction !== "function") {
    throw new RegistrationGateError("FIRESTORE_REQUIRED");
  }
  const operations = db.collection(assertCollectionName(collectionName));

  return Object.freeze({
    async reserve(input) {
      const operationId = requiredText(input.operationId, "INVALID_OPERATION_ID", 160);
      const ref = operations.doc(operationId);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (snapshot.exists) {
          const current = snapshot.data();
          if (
            current.requestFingerprint !== input.requestFingerprint ||
            current.registrationId !== input.registrationId ||
            current.emailHmac !== input.emailHmac ||
            current.uid !== input.uid ||
            current.orgId !== input.orgId
          ) {
            throw new RegistrationGateError("IDEMPOTENCY_CONFLICT");
          }
          return { ...current };
        }
        const operation = {
          operationId,
          registrationId: requiredText(
            input.registrationId,
            "INVALID_REGISTRATION_ID",
            160,
          ),
          requestFingerprint: requiredText(
            input.requestFingerprint,
            "INVALID_REQUEST_FINGERPRINT",
            128,
          ),
          emailHmac: requiredText(input.emailHmac, "INVALID_EMAIL_HMAC", 128),
          uid: requiredText(input.uid, "INVALID_UID", 128),
          orgId: requiredText(input.orgId, "INVALID_ORG_ID", 128),
          channel: requiredText(input.channel, "INVALID_REGISTRATION_CHANNEL", 40),
          status: PASSWORD_REGISTRATION_STATUS.RESERVED,
          createdAtMs: normalizedNow(input.createdAtMs),
          updatedAtMs: normalizedNow(input.createdAtMs),
        };
        transaction.create(ref, operation);
        return { ...operation };
      });
    },

    async beginCompensation({
      operationId,
      expectedStatuses,
      compensationId,
      failureCode,
      nowMs,
    }) {
      const ref = operations.doc(
        requiredText(operationId, "INVALID_OPERATION_ID", 160),
      );
      const expected = expectedStatusSet(expectedStatuses);
      const claimId = requiredText(
        compensationId,
        "INVALID_COMPENSATION_ID",
        160,
      );
      const safeFailureCode = requiredText(
        failureCode,
        "INVALID_COMPENSATION_FAILURE_CODE",
        120,
      );
      const startedAtMs = normalizedNow(nowMs);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) {
          throw new RegistrationGateError("REGISTRATION_OPERATION_NOT_FOUND");
        }
        const current = snapshot.data();
        if (
          current.status === PASSWORD_REGISTRATION_STATUS.RECOVERY_REQUIRED &&
          current.compensationId === claimId
        ) {
          return { acquired: true, operation: { ...current } };
        }
        if (!expected.has(current.status)) {
          return { acquired: false, operation: { ...current } };
        }
        const patch = {
          status: PASSWORD_REGISTRATION_STATUS.RECOVERY_REQUIRED,
          compensationId: claimId,
          compensationStartedAtMs: startedAtMs,
          lastFailureCode: safeFailureCode,
          updatedAtMs: startedAtMs,
        };
        transaction.update(ref, patch);
        return {
          acquired: true,
          operation: { ...current, ...patch },
        };
      });
    },

    async beginVerificationLink({
      operationId,
      leaseId,
      nowMs,
      leaseMs = 60_000,
    }) {
      if (!Number.isSafeInteger(leaseMs) || leaseMs < 5_000 || leaseMs > 15 * 60_000) {
        throw new RegistrationGateError("INVALID_VERIFICATION_LINK_LEASE");
      }
      const ref = operations.doc(
        requiredText(operationId, "INVALID_OPERATION_ID", 160),
      );
      const owner = requiredText(leaseId, "INVALID_VERIFICATION_LINK_LEASE_ID", 160);
      const safeNow = normalizedNow(nowMs);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) {
          throw new RegistrationGateError("REGISTRATION_OPERATION_NOT_FOUND");
        }
        const current = snapshot.data();
        if (current.verificationLinkEnvelope) {
          return { action: "USE_EXISTING", operation: { ...current } };
        }
        const linkCreating =
          current.status === PASSWORD_REGISTRATION_STATUS.VERIFICATION_LINK_CREATING;
        if (
          linkCreating &&
          current.verificationLinkLeaseId !== owner &&
          Number(current.verificationLinkLeaseUntilMs) > safeNow
        ) {
          return { action: "BUSY", operation: { ...current } };
        }
        if (
          ![
            PASSWORD_REGISTRATION_STATUS.ORGANIZATION_CREATED,
            PASSWORD_REGISTRATION_STATUS.VERIFICATION_PENDING,
            PASSWORD_REGISTRATION_STATUS.VERIFICATION_LINK_CREATING,
          ].includes(current.status)
        ) {
          throw new RegistrationGateError("REGISTRATION_OPERATION_STATE_CONFLICT");
        }
        const patch = {
          status: PASSWORD_REGISTRATION_STATUS.VERIFICATION_LINK_CREATING,
          verificationLinkLeaseId: owner,
          verificationLinkLeaseUntilMs: safeNow + leaseMs,
          updatedAtMs: safeNow,
        };
        transaction.update(ref, patch);
        return { action: "GENERATE", operation: { ...current, ...patch } };
      });
    },

    async storeVerificationLink({ operationId, leaseId, envelope, nowMs }) {
      const ref = operations.doc(
        requiredText(operationId, "INVALID_OPERATION_ID", 160),
      );
      const owner = requiredText(leaseId, "INVALID_VERIFICATION_LINK_LEASE_ID", 160);
      const safeEnvelope = verificationEnvelope(envelope);
      const safeNow = normalizedNow(nowMs);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) {
          throw new RegistrationGateError("REGISTRATION_OPERATION_NOT_FOUND");
        }
        const current = snapshot.data();
        if (
          current.status === PASSWORD_REGISTRATION_STATUS.VERIFICATION_PENDING &&
          JSON.stringify(current.verificationLinkEnvelope) === JSON.stringify(safeEnvelope)
        ) {
          return { ...current };
        }
        if (
          current.status !== PASSWORD_REGISTRATION_STATUS.VERIFICATION_LINK_CREATING ||
          current.verificationLinkLeaseId !== owner
        ) {
          throw new RegistrationGateError("VERIFICATION_LINK_LEASE_LOST");
        }
        const patch = {
          status: PASSWORD_REGISTRATION_STATUS.VERIFICATION_PENDING,
          verificationLinkEnvelope: safeEnvelope,
          verificationLinkLeaseId: null,
          verificationLinkLeaseUntilMs: null,
          updatedAtMs: safeNow,
        };
        transaction.update(ref, patch);
        return { ...current, ...patch };
      });
    },

    async releaseVerificationLink({ operationId, leaseId, nowMs }) {
      const ref = operations.doc(
        requiredText(operationId, "INVALID_OPERATION_ID", 160),
      );
      const owner = requiredText(leaseId, "INVALID_VERIFICATION_LINK_LEASE_ID", 160);
      const safeNow = normalizedNow(nowMs);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) {
          throw new RegistrationGateError("REGISTRATION_OPERATION_NOT_FOUND");
        }
        const current = snapshot.data();
        if (
          current.status !== PASSWORD_REGISTRATION_STATUS.VERIFICATION_LINK_CREATING ||
          current.verificationLinkLeaseId !== owner
        ) {
          return { released: false, operation: { ...current } };
        }
        const patch = {
          status: PASSWORD_REGISTRATION_STATUS.ORGANIZATION_CREATED,
          verificationLinkLeaseId: null,
          verificationLinkLeaseUntilMs: null,
          updatedAtMs: safeNow,
        };
        transaction.update(ref, patch);
        return { released: true, operation: { ...current, ...patch } };
      });
    },

    async transition({
      operationId,
      expectedStatuses,
      nextStatus,
      patch = {},
    }) {
      const ref = operations.doc(
        requiredText(operationId, "INVALID_OPERATION_ID", 160),
      );
      const expected = expectedStatusSet(expectedStatuses);
      const status = assertStatus(nextStatus);
      const safePatch = sanitizedPatch(patch);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) {
          throw new RegistrationGateError("REGISTRATION_OPERATION_NOT_FOUND");
        }
        const current = snapshot.data();
        if (!expected.has(current.status)) {
          if (current.status === status) return { ...current };
          throw new RegistrationGateError("REGISTRATION_OPERATION_STATE_CONFLICT");
        }
        const updatedAtMs = Date.now();
        const updated = { ...current, ...safePatch, status, updatedAtMs };
        transaction.update(ref, { ...safePatch, status, updatedAtMs });
        return updated;
      });
    },
  });
}
