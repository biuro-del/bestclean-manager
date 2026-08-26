import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCleaningCompanyRegistrationAccess,
} from "../src/cleaning-company-access-policy.js";
import {
  PASSWORD_REGISTRATION_STATUS,
} from "../src/password-registration-contract.js";

const NOW = Date.parse("2026-08-01T10:00:00.000Z");

function input(overrides = {}) {
  return {
    decodedToken: { uid: "reg_uid_1", email_verified: false },
    operation: {
      uid: "reg_uid_1",
      orgId: "org_reg_1",
      status: PASSWORD_REGISTRATION_STATUS.COMPLETED,
    },
    organization: {
      orgId: "org_reg_1",
      kind: "cleaning_provider",
      onboardingStatus: "IN_PROGRESS",
      subscription: {
        planCode: "TRIAL",
        status: "TRIALING",
        trialEndsAtMs: NOW + 14 * 24 * 60 * 60 * 1_000,
      },
    },
    nowMs: NOW,
    ...overrides,
  };
}

test("unverified new owner has no portal or operational access", () => {
  assert.deepEqual(evaluateCleaningCompanyRegistrationAccess(input()), {
    portalAllowed: false,
    onboardingAllowed: false,
    operationalAllowed: false,
    code: "EMAIL_VERIFICATION_REQUIRED",
  });
});

test("verified owner can complete onboarding but cannot use operational API yet", () => {
  assert.deepEqual(evaluateCleaningCompanyRegistrationAccess(input({
    decodedToken: { uid: "reg_uid_1", email_verified: true },
  })), {
    portalAllowed: true,
    onboardingAllowed: true,
    operationalAllowed: false,
    code: "ONBOARDING_REQUIRED",
  });
});

test("verified owner with completed onboarding receives trial access until exact end", () => {
  const ready = input({
    decodedToken: { uid: "reg_uid_1", email_verified: true },
    organization: {
      ...input().organization,
      onboardingStatus: "COMPLETED",
    },
  });
  assert.equal(
    evaluateCleaningCompanyRegistrationAccess(ready).operationalAllowed,
    true,
  );
  assert.deepEqual(evaluateCleaningCompanyRegistrationAccess({
    ...ready,
    nowMs: ready.organization.subscription.trialEndsAtMs,
  }), {
    portalAllowed: true,
    onboardingAllowed: false,
    operationalAllowed: false,
    code: "SUBSCRIPTION_INACTIVE",
  });
});

test("UID or organization mismatch fails closed", () => {
  assert.equal(evaluateCleaningCompanyRegistrationAccess(input({
    decodedToken: { uid: "different", email_verified: true },
  })).code, "REGISTRATION_IDENTITY_MISMATCH");
  assert.equal(evaluateCleaningCompanyRegistrationAccess(input({
    decodedToken: { uid: "reg_uid_1", email_verified: true },
    organization: { ...input().organization, orgId: "different" },
  })).code, "CLEANING_COMPANY_ORGANIZATION_MISSING");
});
