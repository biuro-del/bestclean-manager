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
