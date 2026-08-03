import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  createFirestoreRegistrationAbuseGuard,
} from "../src/firestore-registration-abuse-guard.js";
import {
  createFirestoreVerificationDeliveryStore,
  VERIFICATION_DELIVERY_STATE,
} from "../src/firestore-verification-delivery-store.js";

const PROJECT_ID = "cleanzi-registration-gate-test";
const NOW = Date.parse("2026-08-02T10:00:00.000Z");
const app = initializeApp({ projectId: PROJECT_ID }, `registration-guards-${randomUUID()}`);
const db = getFirestore(app);

test.after(async () => deleteApp(app));

test("abuse guard is atomic, rate-limited and stores no raw subjects", async () => {
  const collectionName = `abuseGuardTest_${randomUUID().replaceAll("-", "")}`;
  const guard = createFirestoreRegistrationAbuseGuard({
    db,
    collectionName,
    maxAttemptsPerRegistration: 100,
    maxAttemptsPerEmail: 3,
    now: () => NOW,
  });
  const input = {
    channel: "CLEANING_COMPANY",
    registrationId: "registration-secret-1001",
    emailHmac: "private-email-hmac-1001",
  };
  const attempts = await Promise.allSettled(
    Array.from({ length: 10 }, () => guard.assertAllowed(input)),
  );
  assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 3);
  assert.equal(attempts.filter((item) => item.reason?.code === "REGISTRATION_RATE_LIMITED").length, 7);
  const snapshot = await db.collection(collectionName).get();
  assert.equal(snapshot.size, 2);
  const serialized = JSON.stringify(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
  assert.doesNotMatch(serialized, /registration-secret|private-email-hmac|@/);
});

test("verification delivery retries only inside the provider idempotency window", async () => {
  const store = createFirestoreVerificationDeliveryStore({
    db,
    collection: `verificationDeliveryTest_${randomUUID().replaceAll("-", "")}`,
    leaseMs: 5_000,
    providerIdempotencyWindowMs: 60 * 60_000,
  });
  const input = {
    deliveryId: "delivery_1001",
    requestFingerprint: "private-request-fingerprint-1001",
    providerIdempotencyKey: "email-verification/preg_operation_1001",
    nowMs: NOW,
  };
  assert.equal((await store.claim(input)).action, "SEND");
  assert.equal((await store.claim({ ...input, nowMs: NOW + 1_000 })).action, "BUSY");
  await store.markUnknown({
    deliveryId: input.deliveryId,
    errorCode: "NETWORK_RESULT_UNKNOWN",
    nowMs: NOW + 2_000,
  });
  assert.equal((await store.claim({ ...input, nowMs: NOW + 3_000 })).action, "SEND");
  await store.markSent({
    deliveryId: input.deliveryId,
    providerMessageId: "resend-message-1001",
    nowMs: NOW + 4_000,
  });
  const sent = await store.claim({ ...input, nowMs: NOW + 2 * 60 * 60_000 });
  assert.equal(sent.action, "ALREADY_SENT");
  assert.equal(sent.state, VERIFICATION_DELIVERY_STATE.SENT);

  const expiring = { ...input, deliveryId: "delivery_1002", requestFingerprint: "fingerprint-1002" };
  await store.claim(expiring);
  await store.markUnknown({
    deliveryId: expiring.deliveryId,
    errorCode: "NETWORK_RESULT_UNKNOWN",
    nowMs: NOW + 2_000,
  });
  const expired = await store.claim({ ...expiring, nowMs: NOW + 60 * 60_000 });
  assert.equal(expired.action, "RECOVERY_REQUIRED");
  assert.equal(expired.state, VERIFICATION_DELIVERY_STATE.RECOVERY_REQUIRED);
});
