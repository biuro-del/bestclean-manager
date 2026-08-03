import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  createFirestorePasswordRegistrationOperationStore,
} from "../src/firestore-password-registration-operation-store.js";
import {
  PASSWORD_REGISTRATION_STATUS,
} from "../src/password-registration-contract.js";
import { RegistrationGateError } from "../src/registration-contract.js";
import { encryptVerificationLink } from "../src/verification-link-envelope.js";

const PROJECT_ID = "cleanzi-registration-gate-test";
const NOW = Date.parse("2026-08-01T10:00:00.000Z");
const app = initializeApp({ projectId: PROJECT_ID }, `password-registration-${randomUUID()}`);
const db = getFirestore(app);

test.after(async () => {
  await deleteApp(app);
});

function storeForTest() {
  return createFirestorePasswordRegistrationOperationStore({
    db,
    collectionName: `passwordRegistrationTest_${randomUUID().replaceAll("-", "")}`,
  });
}

function reservation(overrides = {}) {
  return {
    operationId: "preg_operation_0001",
    registrationId: "registration_0001",
    requestFingerprint: "request-fingerprint-0001",
    emailHmac: "email-hmac-0001",
    uid: "reg_uid_0001",
    orgId: "org_reg_0001",
    channel: "CLEANING_COMPANY",
    createdAtMs: NOW,
    ...overrides,
  };
}

test("reservation persists privacy-minimal identifiers and is idempotent", async () => {
  const store = storeForTest();
  const first = await store.reserve(reservation());
  const retry = await store.reserve(reservation());

  assert.deepEqual(retry, first);
  assert.equal(first.status, PASSWORD_REGISTRATION_STATUS.RESERVED);
  const serialized = JSON.stringify(first);
  assert.doesNotMatch(serialized, /@/);
  assert.doesNotMatch(serialized, /password/i);
  assert.doesNotMatch(serialized, /turnstile/i);
});

test("same operation id with a different request fingerprint fails closed", async () => {
  const store = storeForTest();
  await store.reserve(reservation());
  await assert.rejects(
    store.reserve(reservation({ requestFingerprint: "different-fingerprint" })),
    (error) =>
      error instanceof RegistrationGateError &&
      error.code === "IDEMPOTENCY_CONFLICT",
  );
});
test("concurrent reservations converge on one operation", async () => {
  const store = storeForTest();
  const results = await Promise.all([
    store.reserve(reservation()),
    store.reserve(reservation()),
  ]);
  assert.equal(results.length, 2);
  assert.deepEqual(results[0], results[1]);
});

test("state transition rejects stale callers but permits the same transition retry", async () => {
  const store = storeForTest();
  const created = await store.reserve(reservation());
  const authCreated = await store.transition({
    operationId: created.operationId,
    expectedStatuses: [PASSWORD_REGISTRATION_STATUS.RESERVED],
    nextStatus: PASSWORD_REGISTRATION_STATUS.AUTH_CREATED,
    patch: { authCreatedAtMs: NOW + 1_000 },
  });
  assert.equal(authCreated.status, PASSWORD_REGISTRATION_STATUS.AUTH_CREATED);

  const retry = await store.transition({
    operationId: created.operationId,
    expectedStatuses: [PASSWORD_REGISTRATION_STATUS.RESERVED],
    nextStatus: PASSWORD_REGISTRATION_STATUS.AUTH_CREATED,
    patch: { authCreatedAtMs: NOW + 2_000 },
  });
  assert.equal(retry.authCreatedAtMs, NOW + 1_000);

  await assert.rejects(
    store.transition({
      operationId: created.operationId,
      expectedStatuses: [PASSWORD_REGISTRATION_STATUS.RESERVED],
      nextStatus: PASSWORD_REGISTRATION_STATUS.COMPLETED,
    }),
    (error) =>
      error instanceof RegistrationGateError &&
      error.code === "REGISTRATION_OPERATION_STATE_CONFLICT",
  );
});

test("Auth compensation is acquired only while the operation is still rollback-safe", async () => {
  const store = storeForTest();
  const created = await store.reserve(reservation());
  const first = await store.beginCompensation({
    operationId: created.operationId,
    expectedStatuses: [PASSWORD_REGISTRATION_STATUS.RESERVED],
    compensationId: "compensation_owner_0001",
    failureCode: "AUTH_TRANSITION_FAILED",
    nowMs: NOW + 1_000,
  });
  assert.equal(first.acquired, true);
  assert.equal(first.operation.status, PASSWORD_REGISTRATION_STATUS.RECOVERY_REQUIRED);

  const competing = await store.beginCompensation({
    operationId: created.operationId,
    expectedStatuses: [PASSWORD_REGISTRATION_STATUS.RESERVED],
    compensationId: "compensation_owner_0002",
    failureCode: "STALE_CALLER",
    nowMs: NOW + 2_000,
  });
  assert.equal(competing.acquired, false);
  assert.equal(competing.operation.compensationId, "compensation_owner_0001");

  const reset = await store.transition({
    operationId: created.operationId,
    expectedStatuses: [PASSWORD_REGISTRATION_STATUS.RECOVERY_REQUIRED],
    nextStatus: PASSWORD_REGISTRATION_STATUS.RESERVED,
    patch: {
      compensationId: null,
      compensationStartedAtMs: null,
      authCompensatedAtMs: NOW + 3_000,
    },
  });
  assert.equal(reset.status, PASSWORD_REGISTRATION_STATUS.RESERVED);
  assert.equal(reset.compensationId, null);
});

test("verification link generation has one lease and reuses an encrypted envelope", async () => {
  const store = storeForTest();
  const created = await store.reserve(reservation());
  const authCreated = await store.transition({
    operationId: created.operationId,
    expectedStatuses: [PASSWORD_REGISTRATION_STATUS.RESERVED],
    nextStatus: PASSWORD_REGISTRATION_STATUS.AUTH_CREATED,
    patch: { authCreatedAtMs: NOW + 1_000 },
  });
  await store.transition({
    operationId: authCreated.operationId,
    expectedStatuses: [PASSWORD_REGISTRATION_STATUS.AUTH_CREATED],
    nextStatus: PASSWORD_REGISTRATION_STATUS.ORGANIZATION_CREATED,
    patch: {
      organizationCreatedAtMs: NOW + 2_000,
      trialStartedAtMs: NOW + 2_000,
      trialEndsAtMs: NOW + 14 * 24 * 60 * 60 * 1_000,
      trialDays: 14,
    },
  });
  const firstLease = await store.beginVerificationLink({
    operationId: created.operationId,
    leaseId: "verification_lease_0001",
    nowMs: NOW + 3_000,
  });
  assert.equal(firstLease.action, "GENERATE");
  const competingLease = await store.beginVerificationLink({
    operationId: created.operationId,
    leaseId: "verification_lease_0002",
    nowMs: NOW + 4_000,
  });
  assert.equal(competingLease.action, "BUSY");

  const envelope = encryptVerificationLink({
    verificationUrl: "https://portal.cleanzi.pl/verify?oobCode=secret-code",
    operationId: created.operationId,
    hmacKey: "operation-store-envelope-test-key-at-least-32-bytes",
    randomBytes: () => Buffer.alloc(12, 4),
  });
  await assert.rejects(store.storeVerificationLink({
    operationId: created.operationId,
    leaseId: "verification_lease_0002",
    envelope,
    nowMs: NOW + 5_000,
  }), (error) => error.code === "VERIFICATION_LINK_LEASE_LOST");
  const stored = await store.storeVerificationLink({
    operationId: created.operationId,
    leaseId: "verification_lease_0001",
    envelope,
    nowMs: NOW + 5_000,
  });
  assert.equal(stored.status, PASSWORD_REGISTRATION_STATUS.VERIFICATION_PENDING);
  const retry = await store.beginVerificationLink({
    operationId: created.operationId,
    leaseId: "verification_lease_0003",
    nowMs: NOW + 6_000,
  });
  assert.equal(retry.action, "USE_EXISTING");
  assert.deepEqual(retry.operation.verificationLinkEnvelope, envelope);
  assert.doesNotMatch(JSON.stringify(retry.operation), /secret-code/);
});
