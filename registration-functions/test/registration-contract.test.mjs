import assert from "node:assert/strict";
import test from "node:test";
import {
  FIREBASE_AUTH_EVENT_SERVICE,
  MICROSOFT_PROVIDER_ID,
  REGISTRATION_ACTION,
  REGISTRATION_CHANNEL,
  REGISTRATION_PROVIDER,
  RegistrationGateError,
  identityFromBeforeCreate,
  issueRegistrationGrant,
  registrationGrantCandidate,
} from "../src/registration-contract.js";
import { facilityManagerRegistrationAdapter } from "../src/facility-manager-adapter.js";
import {
  assertCentralGateActivationReady,
  authorizeCentralBeforeCreate,
} from "../src/central-router.js";

const NOW = Date.parse("2026-08-01T07:00:00.000Z");
const MANAGER_KEY = "manager-test-key-with-at-least-thirty-two-bytes";
const PROVIDER_KEY = "provider-test-key-with-at-least-thirty-two-bytes";
const ALLOWED_RESOURCES = ["projects/iclean-room"];

function emailBeforeCreate(email = "Zarządca@Przykład.pl") {
  return {
    eventId: "before-create-email-1",
    eventType: "providers/cloud.auth/eventTypes/user.beforeCreate:emailLink",
    resource: {
      service: FIREBASE_AUTH_EVENT_SERVICE,
      name: "projects/iclean-room",
    },
    credential: {
      providerId: "password",
      signInMethod: "emailLink",
    },
    data: {
      uid: "firebase-user-1",
      email,
      emailVerified: true,
      providerData: [],
    },
  };
}

function federatedBeforeCreate(providerId, subject) {
  return {
    eventId: `before-create-${providerId}`,
    eventType: `providers/cloud.auth/eventTypes/user.beforeCreate:${providerId}`,
    resource: {
      service: FIREBASE_AUTH_EVENT_SERVICE,
      name: "projects/iclean-room",
    },
    credential: { providerId, claims: { sub: subject } },
    data: {
      uid: `firebase-${providerId}`,
      email: "owner@example.test",
      emailVerified: true,
      providerData: [{ providerId, uid: subject }],
    },
  };
}

function verifiedTurnstile(action, hostname = "portal.cleanzi.pl") {
  return { ok: true, mode: "enforce", action, hostname };
}

const cleaningCompanyTestDouble = Object.freeze({
  channel: REGISTRATION_CHANNEL.CLEANING_COMPANY,
  action: REGISTRATION_ACTION.CLEANING_COMPANY,
  candidateFromEvent({ event, hmacKey }) {
    const identity = identityFromBeforeCreate(event);
    return registrationGrantCandidate({
      hmacKey,
      channel: REGISTRATION_CHANNEL.CLEANING_COMPANY,
      action: REGISTRATION_ACTION.CLEANING_COMPANY,
      providerId: identity.providerId,
      subject: identity.subject,
    });
  },
  claimsForGrant() {
    return {
      cleanziInitialRegistrationChannel: REGISTRATION_CHANNEL.CLEANING_COMPANY,
      cleanziRegistrationGrantVersion: 1,
    };
  },
});

test("activation preflight refuses a facility-manager-only gate", () => {
  assert.throws(
    () => assertCentralGateActivationReady([
      facilityManagerRegistrationAdapter,
    ]),
    (error) =>
      error instanceof RegistrationGateError &&
      error.code === "CENTRAL_GATE_INCOMPLETE",
  );

  const ready = assertCentralGateActivationReady([
    facilityManagerRegistrationAdapter,
    cleaningCompanyTestDouble,
  ]);
  assert.equal(ready.size, 2);
});

test("a new account started from the login screen is rejected when no channel grant exists", async () => {
  let consumeCalls = 0;

  await assert.rejects(
    authorizeCentralBeforeCreate(emailBeforeCreate("new-from-login@example.test"), {
      adapters: [
        facilityManagerRegistrationAdapter,
        cleaningCompanyTestDouble,
      ],
      hmacKeysByChannel: {
        [REGISTRATION_CHANNEL.FACILITY_MANAGER]: MANAGER_KEY,
        [REGISTRATION_CHANNEL.CLEANING_COMPANY]: PROVIDER_KEY,
      },
      allowedResources: ALLOWED_RESOURCES,
      nowMs: NOW,
      grantStore: {
        async consumeExactlyOne() {
          consumeCalls += 1;
          return null;
        },
      },
    }),
    (error) =>
      error instanceof RegistrationGateError &&
      error.code === "REGISTRATION_GRANT_REQUIRED",
  );

  assert.equal(consumeCalls, 1);
});

test("a Firebase email-link credential is recognized only after email verification", () => {
  assert.deepEqual(identityFromBeforeCreate(emailBeforeCreate("ZaRządca@Przykład.pl")), {
    providerId: REGISTRATION_PROVIDER.EMAIL_LINK,
    subject: "zarządca@przykład.pl",
  });

  const unverifiedEvent = emailBeforeCreate("owner@example.test");
  unverifiedEvent.data.emailVerified = false;
  assert.throws(
    () => identityFromBeforeCreate(unverifiedEvent),
    (error) =>
      error instanceof RegistrationGateError
      && error.code === "EMAIL_LINK_NOT_VERIFIED",
  );
});

test("a facility-manager grant is action and hostname bound and privacy minimized", () => {
  const grant = issueRegistrationGrant({
    channel: REGISTRATION_CHANNEL.FACILITY_MANAGER,
    action: REGISTRATION_ACTION.FACILITY_MANAGER,
    providerId: REGISTRATION_PROVIDER.EMAIL_LINK,
    subject: "Rafał.Dudek@example.com",
    hmacKey: MANAGER_KEY,
    turnstileVerification: verifiedTurnstile(
      REGISTRATION_ACTION.FACILITY_MANAGER,
    ),
    allowedHostnames: ["portal.cleanzi.pl"],
    nowMs: NOW,
    randomUuid: () => "manager-grant-1",
  });

  assert.equal(grant.channel, REGISTRATION_CHANNEL.FACILITY_MANAGER);
  assert.equal(grant.grantId, "manager-grant-1");
  assert.equal("email" in grant, false);
  assert.equal("turnstileToken" in grant, false);
  assert.equal(JSON.stringify(grant).includes("Rafał"), false);

  assert.throws(
    () => issueRegistrationGrant({
      channel: REGISTRATION_CHANNEL.FACILITY_MANAGER,
      action: REGISTRATION_ACTION.FACILITY_MANAGER,
      providerId: REGISTRATION_PROVIDER.EMAIL_LINK,
      subject: "owner@example.test",
      hmacKey: MANAGER_KEY,
      turnstileVerification: verifiedTurnstile(
        REGISTRATION_ACTION.CLEANING_COMPANY,
      ),
      allowedHostnames: ["portal.cleanzi.pl"],
      nowMs: NOW,
    }),
    (error) => error.code === "TURNSTILE_ENFORCEMENT_REQUIRED",
  );
});

test("the central router selects the one channel whose grant was consumed", async () => {
  const event = emailBeforeCreate("owner@example.test");
  let observedCandidates;
  const response = await authorizeCentralBeforeCreate(event, {
    adapters: [
      facilityManagerRegistrationAdapter,
      cleaningCompanyTestDouble,
    ],
    hmacKeysByChannel: {
      [REGISTRATION_CHANNEL.FACILITY_MANAGER]: MANAGER_KEY,
      [REGISTRATION_CHANNEL.CLEANING_COMPANY]: PROVIDER_KEY,
    },
    allowedResources: ALLOWED_RESOURCES,
    nowMs: NOW,
    grantStore: {
      async consumeExactlyOne(input) {
        observedCandidates = input.candidates;
        return {
          ...input.candidates.find(
            (candidate) =>
              candidate.channel === REGISTRATION_CHANNEL.FACILITY_MANAGER,
          ),
          status: "CONSUMED",
        };
      },
    },
  });

  assert.equal(observedCandidates.length, 2);
  assert.deepEqual(response.customClaims, {
    cleanziInitialRegistrationChannel: REGISTRATION_CHANNEL.FACILITY_MANAGER,
    cleanziRegistrationGrantVersion: 1,
  });
});

test("the router rejects missing grants and propagates ambiguous-grant failures", async () => {
  const options = {
    adapters: [
      facilityManagerRegistrationAdapter,
      cleaningCompanyTestDouble,
    ],
    hmacKeysByChannel: {
      [REGISTRATION_CHANNEL.FACILITY_MANAGER]: MANAGER_KEY,
      [REGISTRATION_CHANNEL.CLEANING_COMPANY]: PROVIDER_KEY,
    },
    allowedResources: ALLOWED_RESOURCES,
    nowMs: NOW,
  };

  await assert.rejects(
    authorizeCentralBeforeCreate(emailBeforeCreate(), {
      ...options,
      grantStore: { async consumeExactlyOne() { return null; } },
    }),
    (error) => error.code === "REGISTRATION_GRANT_REQUIRED",
  );

  await assert.rejects(
    authorizeCentralBeforeCreate(emailBeforeCreate(), {
      ...options,
      grantStore: {
        async consumeExactlyOne() {
          throw new RegistrationGateError("AMBIGUOUS_REGISTRATION_GRANT");
        },
      },
    }),
    (error) => error.code === "AMBIGUOUS_REGISTRATION_GRANT",
  );
});

test("a real Firebase v2 resource object is required", async () => {
  const event = emailBeforeCreate();
  event.resource = "projects/iclean-room";
  await assert.rejects(
    authorizeCentralBeforeCreate(event, {
      adapters: [
        facilityManagerRegistrationAdapter,
        cleaningCompanyTestDouble,
      ],
      hmacKeysByChannel: {
        [REGISTRATION_CHANNEL.FACILITY_MANAGER]: MANAGER_KEY,
        [REGISTRATION_CHANNEL.CLEANING_COMPANY]: PROVIDER_KEY,
      },
      allowedResources: ALLOWED_RESOURCES,
      grantStore: { async consumeExactlyOne() { return null; } },
      nowMs: NOW,
    }),
    (error) => error.code === "AUTH_RESOURCE_MISMATCH",
  );
});

test("new Microsoft registration remains broker-only", async () => {
  await assert.rejects(
    authorizeCentralBeforeCreate(
      federatedBeforeCreate(MICROSOFT_PROVIDER_ID, "microsoft-subject"),
      {
        adapters: [
          facilityManagerRegistrationAdapter,
          cleaningCompanyTestDouble,
        ],
        hmacKeysByChannel: {
          [REGISTRATION_CHANNEL.FACILITY_MANAGER]: MANAGER_KEY,
          [REGISTRATION_CHANNEL.CLEANING_COMPANY]: PROVIDER_KEY,
        },
        allowedResources: ALLOWED_RESOURCES,
        grantStore: { async consumeExactlyOne() { return null; } },
        nowMs: NOW,
      },
    ),
    (error) => error.code === "MICROSOFT_BROKER_REQUIRED",
  );
});
