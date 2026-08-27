import assert from "node:assert/strict";
import test from "node:test";
import {
  createFacilityManagerGoogleRegistrationCommand,
  deriveFacilityManagerGoogleIdentityKey,
  normalizeFacilityManagerGoogleRegistrationIntent,
} from "../src/facility-manager-google-registration-contract.js";

const HMAC_KEY = "facility-manager-contract-test-key-at-least-32-bytes";

function googleIdentity(overrides = {}) {
  return {
    uid: "firebase-uid-1",
    providerId: "google.com",
    subject: "google-subject-1",
    email: "Owner@Example.test",
    emailVerified: true,
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    idempotencyKey: "fm_1234567890123456",
    organizationName: "Zarządca Osiedla",
    ...overrides,
  };
}

test("facility command derives channel, IDs and owner only from trusted context", () => {
  const command = createFacilityManagerGoogleRegistrationCommand({
    input: input(),
    googleIdentity: googleIdentity(),
    hmacKey: HMAC_KEY,
  });

  assert.equal(command.channel, "FACILITY_MANAGER");
  assert.equal(command.action, "registration_facility_manager");
  assert.equal(command.ownerUid, "firebase-uid-1");
  assert.equal(command.ownerEmail, "owner@example.test");
  assert.match(command.operationId, /^fmreg_[A-Za-z0-9_-]{43}$/);
  assert.match(command.organizationId, /^org_fm_[A-Za-z0-9_-]{43}$/);
  assert.match(command.ownerGoogleIdentityKey, /^fmgi_[A-Za-z0-9_-]{43}$/);
  assert.doesNotMatch(JSON.stringify(command), /google-subject-1/);
})

test("browser payload is an exact allowlist and cannot select channel or owner", () => {
  assert.throws(
    () => normalizeFacilityManagerGoogleRegistrationIntent({ ...input(), ownerUid: "attacker" }),
    (error) => error.code === "INVALID_FACILITY_MANAGER_REGISTRATION_PAYLOAD",
  );
  assert.throws(
    () => normalizeFacilityManagerGoogleRegistrationIntent(input({ idempotencyKey: "short" })),
    (error) => error.code === "INVALID_IDEMPOTENCY_KEY",
  );
})

test("one Google identity has an identity key independent from retries", () => {
  const first = deriveFacilityManagerGoogleIdentityKey({ googleIdentity: googleIdentity() });
  const second = deriveFacilityManagerGoogleIdentityKey({ googleIdentity: googleIdentity({ uid: "firebase-uid-2" }) });
  const different = deriveFacilityManagerGoogleIdentityKey({ googleIdentity: googleIdentity({ subject: "google-subject-2" }) });
  assert.equal(first, second)
  assert.notEqual(first, different)
})
