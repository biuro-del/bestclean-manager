import {
  RegistrationGateError,
  normalizedNow,
  requiredText,
} from "./registration-contract.js";

export const VERIFICATION_DELIVERY_STATE = Object.freeze({
  LEASED: "LEASED",
  UNKNOWN: "UNKNOWN",
  SENT: "SENT",
  RECOVERY_REQUIRED: "RECOVERY_REQUIRED",
});

function collectionName(value) {
  const name = requiredText(value, "INVALID_DELIVERY_COLLECTION", 100);
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new RegistrationGateError("INVALID_DELIVERY_COLLECTION");
  }
  return name;
}

export function createFirestoreVerificationDeliveryStore({
  db,
  collection = "cleanziVerificationDeliveries",
  leaseMs = 60_000,
  providerIdempotencyWindowMs = 23 * 60 * 60_000,
}) {
  if (typeof db?.runTransaction !== "function") throw new RegistrationGateError("FIRESTORE_REQUIRED");
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 5_000 || leaseMs > 15 * 60_000) {
    throw new RegistrationGateError("INVALID_DELIVERY_LEASE");
  }
  if (
    !Number.isSafeInteger(providerIdempotencyWindowMs) ||
    providerIdempotencyWindowMs < 60 * 60_000 ||
    providerIdempotencyWindowMs > 23 * 60 * 60_000
  ) {
    throw new RegistrationGateError("INVALID_PROVIDER_IDEMPOTENCY_WINDOW");
  }
  const deliveries = db.collection(collectionName(collection));

  return Object.freeze({
    async claim({
      deliveryId,
      requestFingerprint,
      providerIdempotencyKey,
      nowMs,
    }) {
      const safeNow = normalizedNow(nowMs);
      const ref = deliveries.doc(requiredText(deliveryId, "INVALID_DELIVERY_ID", 128));
      const fingerprint = requiredText(requestFingerprint, "INVALID_DELIVERY_FINGERPRINT", 128);
      const providerKey = requiredText(providerIdempotencyKey, "INVALID_PROVIDER_IDEMPOTENCY_KEY", 256);
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) {
          const value = {
            schemaVersion: 1,
            deliveryId,
            requestFingerprint: fingerprint,
            providerIdempotencyKey: providerKey,
            state: VERIFICATION_DELIVERY_STATE.LEASED,
            attemptCount: 1,
            firstAttemptAtMs: safeNow,
            providerIdempotencyExpiresAtMs: safeNow + providerIdempotencyWindowMs,
            leaseUntilMs: safeNow + leaseMs,
            createdAtMs: safeNow,
            updatedAtMs: safeNow,
          };
          transaction.create(ref, value);
          return { action: "SEND", ...value };
        }
        const current = snapshot.data();
        if (
          current.requestFingerprint !== fingerprint ||
          current.providerIdempotencyKey !== providerKey
        ) {
          throw new RegistrationGateError("VERIFICATION_IDEMPOTENCY_CONFLICT");
        }
        if (current.state === VERIFICATION_DELIVERY_STATE.SENT) {
          return { action: "ALREADY_SENT", ...current };
        }
        if (current.state === VERIFICATION_DELIVERY_STATE.RECOVERY_REQUIRED) {
          return { action: "RECOVERY_REQUIRED", ...current };
        }
        if (
          current.state === VERIFICATION_DELIVERY_STATE.LEASED &&
          Number(current.leaseUntilMs) > safeNow
        ) {
          return { action: "BUSY", ...current };
        }
        if (Number(current.providerIdempotencyExpiresAtMs) <= safeNow) {
          transaction.update(ref, {
            state: VERIFICATION_DELIVERY_STATE.RECOVERY_REQUIRED,
            leaseUntilMs: null,
            updatedAtMs: safeNow,
          });
          return {
            action: "RECOVERY_REQUIRED",
            ...current,
            state: VERIFICATION_DELIVERY_STATE.RECOVERY_REQUIRED,
          };
        }
        const attemptCount = Number(current.attemptCount) + 1;
        if (!Number.isSafeInteger(attemptCount) || attemptCount < 2) {
          throw new RegistrationGateError("VERIFICATION_DELIVERY_STATE_INVALID");
        }
        const patch = {
          state: VERIFICATION_DELIVERY_STATE.LEASED,
          attemptCount,
          leaseUntilMs: safeNow + leaseMs,
          updatedAtMs: safeNow,
        };
        transaction.update(ref, patch);
        return { action: "SEND", ...current, ...patch };
      });
    },

    async markSent({ deliveryId, providerMessageId, nowMs }) {
      const safeNow = normalizedNow(nowMs);
      const ref = deliveries.doc(requiredText(deliveryId, "INVALID_DELIVERY_ID", 128));
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new RegistrationGateError("VERIFICATION_DELIVERY_NOT_FOUND");
        const current = snapshot.data();
        if (current.state === VERIFICATION_DELIVERY_STATE.SENT) return current;
        if (current.state !== VERIFICATION_DELIVERY_STATE.LEASED) {
          throw new RegistrationGateError("VERIFICATION_DELIVERY_STATE_CONFLICT");
        }
        const patch = {
          state: VERIFICATION_DELIVERY_STATE.SENT,
          providerMessageId: requiredText(providerMessageId, "INVALID_PROVIDER_MESSAGE_ID", 200),
          sentAtMs: safeNow,
          leaseUntilMs: null,
          updatedAtMs: safeNow,
        };
        transaction.update(ref, patch);
        return { ...current, ...patch };
      });
    },

    async markUnknown({ deliveryId, errorCode, nowMs }) {
      const safeNow = normalizedNow(nowMs);
      const ref = deliveries.doc(requiredText(deliveryId, "INVALID_DELIVERY_ID", 128));
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) throw new RegistrationGateError("VERIFICATION_DELIVERY_NOT_FOUND");
        const current = snapshot.data();
        if (current.state === VERIFICATION_DELIVERY_STATE.SENT) return current;
        if (current.state !== VERIFICATION_DELIVERY_STATE.LEASED) return current;
        const patch = {
          state: VERIFICATION_DELIVERY_STATE.UNKNOWN,
          lastErrorCode: requiredText(errorCode, "INVALID_DELIVERY_ERROR", 120),
          leaseUntilMs: null,
          updatedAtMs: safeNow,
        };
        transaction.update(ref, patch);
        return { ...current, ...patch };
      });
    },
  });
}
