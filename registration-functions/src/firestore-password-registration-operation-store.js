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

    async transition({
      operationId,
      expectedStatuses,
      nextStatus,
      patch = {},
    }) {
      const ref = operations.doc(
        requiredText(operationId, "INVALID_OPERATION_ID", 160),
      );
      const expected = new Set(
        (expectedStatuses || []).map((status) => assertStatus(status)),
      );
      if (expected.size === 0) {
        throw new RegistrationGateError("EXPECTED_OPERATION_STATUS_REQUIRED");
      }
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
