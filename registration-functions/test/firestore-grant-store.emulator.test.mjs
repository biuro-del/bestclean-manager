import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  REGISTRATION_ACTION,
  REGISTRATION_CHANNEL,
  REGISTRATION_PROVIDER,
  RegistrationGateError,
  issueRegistrationGrant,
  registrationGrantCandidate,
  registrationGrantDocumentId,
} from "../src/registration-contract.js";
import { createFirestoreRegistrationGrantStore } from "../src/firestore-grant-store.js";

const PROJECT_ID = "cleanzi-registration-gate-test";
const NOW = Date.parse("2026-08-01T07:00:00.000Z");
const MANAGER_KEY = "manager-test-key-with-at-least-thirty-two-bytes";
const PROVIDER_KEY = "provider-test-key-with-at-least-thirty-two-bytes";
const app = initializeApp({ projectId: PROJECT_ID }, `registration-${randomUUID()}`);
const db = getFirestore(app);

test.after(async () => {
  await deleteApp(app);
});

function storeForTest() {
  return createFirestoreRegistrationGrantStore({
    db,
    collectionName: `registrationGrantTest_${randomUUID().replaceAll("-", "")}`,
  });
}

function issuedGrant({
  channel = REGISTRATION_CHANNEL.FACILITY_MANAGER,
  action = REGISTRATION_ACTION.FACILITY_MANAGER,
  hmacKey = MANAGER_KEY,
  subject = "zarządca@example.test",
  randomUuid = () => randomUUID(),
} = {}) {
  return issueRegistrationGrant({
    channel,
    action,
    providerId: REGISTRATION_PROVIDER.EMAIL_LINK,
    subject,
    hmacKey,
    turnstileVerification: {
      ok: true,
      mode: "enforce",
      action,
      hostname: "portal.cleanzi.pl",
    },
    allowedHostnames: ["portal.cleanzi.pl"],
    nowMs: NOW,
    randomUuid,
  });
}

test("Firestore atomically consumes once and permits only the same event retry", async () => {
  const store = storeForTest();
  const grant = issuedGrant({ randomUuid: () => "grant-once" });
  const issued = await store.issueGrant(grant);
  assert.equal(issued.documentId, registrationGrantDocumentId(grant));
  assert.equal("email" in issued, false);

  const input = {
    candidates: [grant],
    nowMs: NOW + 1_000,
    consumedByUid: "firebase-user-1",
    consumedByEventId: "before-create-event-1",
  };
  const first = await store.consumeExactlyOne(input);
  assert.equal(first.status, "CONSUMED");
  assert.equal(first.consumedByUid, "firebase-user-1");

  const retry = await store.consumeExactlyOne({
    ...input,
    nowMs: NOW + 2_000,
  });
  assert.equal(retry.grantId, "grant-once");

  const replay = await store.consumeExactlyOne({
    ...input,
    nowMs: NOW + 3_000,
    consumedByEventId: "different-event",
  });
  assert.equal(replay, null);
});

test("only one of two concurrent events consumes an issued grant", async () => {
  const store = storeForTest();
  const grant = issuedGrant();
  await store.issueGrant(grant);

  const results = await Promise.all([
    store.consumeExactlyOne({
      candidates: [grant],
      nowMs: NOW + 1_000,
      consumedByUid: "firebase-user-1",
      consumedByEventId: "parallel-event-1",
    }),
    store.consumeExactlyOne({
      candidates: [grant],
      nowMs: NOW + 1_000,
      consumedByUid: "firebase-user-1",
      consumedByEventId: "parallel-event-2",
    }),
  ]);

  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(results.filter((result) => result === null).length, 1);
});

test("two valid channel grants fail closed as ambiguous", async () => {
  const store = storeForTest();
  const subject = "owner@example.test";
  const manager = issuedGrant({ subject });
  const provider = issuedGrant({
    channel: REGISTRATION_CHANNEL.CLEANING_COMPANY,
    action: REGISTRATION_ACTION.CLEANING_COMPANY,
    hmacKey: PROVIDER_KEY,
    subject,
  });
  await store.issueGrant(manager);
  await store.issueGrant(provider);

  const candidates = [
    registrationGrantCandidate({
      hmacKey: MANAGER_KEY,
      channel: REGISTRATION_CHANNEL.FACILITY_MANAGER,
      action: REGISTRATION_ACTION.FACILITY_MANAGER,
      providerId: REGISTRATION_PROVIDER.EMAIL_LINK,
      subject,
    }),
    registrationGrantCandidate({
      hmacKey: PROVIDER_KEY,
      channel: REGISTRATION_CHANNEL.CLEANING_COMPANY,
      action: REGISTRATION_ACTION.CLEANING_COMPANY,
      providerId: REGISTRATION_PROVIDER.EMAIL_LINK,
      subject,
    }),
  ];

  await assert.rejects(
    store.consumeExactlyOne({
      candidates,
      nowMs: NOW + 1_000,
      consumedByUid: "firebase-user-1",
      consumedByEventId: "ambiguous-event",
    }),
    (error) =>
      error instanceof RegistrationGateError &&
      error.code === "AMBIGUOUS_REGISTRATION_GRANT",
  );
});

test("same-event retry wins over a newly issued grant in another channel", async () => {
  const store = storeForTest();
  const subject = "owner@example.test";
  const manager = issuedGrant({ subject });
  const provider = issuedGrant({
    channel: REGISTRATION_CHANNEL.CLEANING_COMPANY,
    action: REGISTRATION_ACTION.CLEANING_COMPANY,
    hmacKey: PROVIDER_KEY,
    subject,
  });
  const candidates = [
    registrationGrantCandidate({
      hmacKey: MANAGER_KEY,
      channel: REGISTRATION_CHANNEL.FACILITY_MANAGER,
      action: REGISTRATION_ACTION.FACILITY_MANAGER,
      providerId: REGISTRATION_PROVIDER.EMAIL_LINK,
      subject,
    }),
    registrationGrantCandidate({
      hmacKey: PROVIDER_KEY,
      channel: REGISTRATION_CHANNEL.CLEANING_COMPANY,
      action: REGISTRATION_ACTION.CLEANING_COMPANY,
      providerId: REGISTRATION_PROVIDER.EMAIL_LINK,
      subject,
    }),
  ];
  const retryInput = {
    candidates,
    nowMs: NOW + 1_000,
    consumedByUid: "firebase-user-1",
    consumedByEventId: "before-create-event-1",
  };

  await store.issueGrant(manager);
  const first = await store.consumeExactlyOne(retryInput);
  assert.equal(first.grantId, manager.grantId);

  await store.issueGrant(provider);
  const retry = await store.consumeExactlyOne({
    ...retryInput,
    nowMs: NOW + 2_000,
  });
  assert.equal(retry.grantId, manager.grantId);

  const providerAfterRetry = await store.consumeExactlyOne({
    candidates: [candidates[1]],
    nowMs: NOW + 3_000,
    consumedByUid: "firebase-user-1",
    consumedByEventId: "provider-event-after-retry",
  });
  assert.equal(providerAfterRetry.grantId, provider.grantId);
  assert.equal(providerAfterRetry.status, "CONSUMED");
});
