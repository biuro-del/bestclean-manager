import { createHash } from "node:crypto";
import {
  RegistrationGateError,
  normalizedNow,
  requiredText,
} from "./registration-contract.js";

function counterId(kind, channel, subject) {
  return createHash("sha256")
    .update(["cleanzi-registration-abuse-v1", kind, channel, subject].join("\0"), "utf8")
    .digest("base64url");
}

function nextCounter(current, { nowMs, windowMs, limit }) {
  const active = current && Number(current.windowEndsAtMs) > nowMs;
  const count = active ? Number(current.count) : 0;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RegistrationGateError("ABUSE_COUNTER_INVALID");
  }
  if (count >= limit) throw new RegistrationGateError("REGISTRATION_RATE_LIMITED");
  return {
    count: count + 1,
    windowStartedAtMs: active ? current.windowStartedAtMs : nowMs,
    windowEndsAtMs: active ? current.windowEndsAtMs : nowMs + windowMs,
    updatedAtMs: nowMs,
  };
}

export function createFirestoreRegistrationAbuseGuard({
  db,
  collectionName = "cleanziRegistrationAbuseCounters",
  windowMs = 15 * 60_000,
  maxAttemptsPerRegistration = 10,
  maxAttemptsPerEmail = 5,
  now = () => Date.now(),
}) {
  if (typeof db?.runTransaction !== "function") throw new RegistrationGateError("FIRESTORE_REQUIRED");
  const collection = db.collection(requiredText(collectionName, "INVALID_ABUSE_COLLECTION", 100));
  if (!Number.isSafeInteger(windowMs) || windowMs < 60_000 || windowMs > 24 * 60 * 60_000) {
    throw new RegistrationGateError("INVALID_ABUSE_WINDOW");
  }
  for (const limit of [maxAttemptsPerRegistration, maxAttemptsPerEmail]) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1_000) {
      throw new RegistrationGateError("INVALID_ABUSE_LIMIT");
    }
  }
  return Object.freeze({
    async assertAllowed(input) {
      const channel = requiredText(input.channel, "INVALID_REGISTRATION_CHANNEL", 40);
      const registrationId = requiredText(input.registrationId, "INVALID_REGISTRATION_ID", 160);
      const emailHmac = requiredText(input.emailHmac, "INVALID_EMAIL_HMAC", 128);
      const refs = [
        {
          kind: "REGISTRATION",
          ref: collection.doc(counterId("REGISTRATION", channel, registrationId)),
          limit: maxAttemptsPerRegistration,
        },
        {
          kind: "EMAIL_HMAC",
          ref: collection.doc(counterId("EMAIL_HMAC", channel, emailHmac)),
          limit: maxAttemptsPerEmail,
        },
      ];
      const nowMs = normalizedNow(now());
      await db.runTransaction(async (transaction) => {
        const snapshots = await Promise.all(refs.map(({ ref }) => transaction.get(ref)));
        const updates = refs.map((entry, index) => ({
          entry,
          value: nextCounter(snapshots[index].exists ? snapshots[index].data() : null, {
            nowMs,
            windowMs,
            limit: entry.limit,
          }),
        }));
        for (const { entry, value } of updates) {
          transaction.set(entry.ref, {
            schemaVersion: 1,
            kind: entry.kind,
            channel,
            ...value,
          });
        }
      });
    },
  });
}

export const __test = Object.freeze({ counterId, nextCounter });
