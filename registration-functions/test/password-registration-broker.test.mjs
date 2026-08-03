import assert from "node:assert/strict";
import test from "node:test";
import {
  CLEANING_COMPANY_TRIAL_DURATION_MS,
  PASSWORD_REGISTRATION_STATUS,
  derivePasswordRegistrationIdentifiers,
  normalizeCleaningCompanyPasswordRequest,
  passwordRegistrationRequestFingerprint,
} from "../src/password-registration-contract.js";
import {
  createCleaningCompanyPasswordRegistrationBroker,
} from "../src/password-registration-broker.js";

const NOW = Date.parse("2026-08-01T10:00:00.000Z");
const HMAC_KEY = "cleaning-company-password-broker-test-key-32-bytes-minimum";

function registrationInput(overrides = {}) {
  return {
    registrationId: "registration_20260801_0001",
    registrationToken: "registration-token-20260801-0001-abcdefghijklmnopqrstuvwxyz",
    idempotencyKey: "idempotency_20260801_0001",
    email: "właściciel@żółw-clean.pl",
    password: "Bardzo-Dlugie-Haslo-2026!",
    firstName: "Rafał",
    lastName: "Żółć",
    phone: "+48 500 600 700",
    selectedPlanCode: "PLUS",
    billingCycle: "ANNUAL",
    locale: "pl-PL",
    timezone: "Europe/Warsaw",
    turnstileToken: "turnstile-test-token",
    consents: {
      termsVersion: "terms-pl-2026-08-01",
      privacyVersion: "privacy-pl-2026-08-01",
      newsletterConsent: false,
    },
    ...overrides,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function operationStoreFake() {
  const operations = new Map();
  return {
    operations,
    async find(input) {
      const current = operations.get(input.operationId);
      if (!current) return null;
      if (current.requestFingerprint !== input.requestFingerprint) {
        const error = new Error("IDEMPOTENCY_CONFLICT");
        error.code = "IDEMPOTENCY_CONFLICT";
        throw error;
      }
      return clone(current);
    },
    async reserve(input) {
      const current = operations.get(input.operationId);
      if (current) {
        if (current.requestFingerprint !== input.requestFingerprint) {
          const error = new Error("IDEMPOTENCY_CONFLICT");
          error.code = "IDEMPOTENCY_CONFLICT";
          throw error;
        }
        return clone(current);
      }
      const created = { ...clone(input), status: PASSWORD_REGISTRATION_STATUS.RESERVED };
      operations.set(input.operationId, created);
      return clone(created);
    },
    async transition({ operationId, expectedStatuses, nextStatus, patch = {} }) {
      const current = operations.get(operationId);
      if (!current) throw new Error("REGISTRATION_OPERATION_NOT_FOUND");
      if (!expectedStatuses.includes(current.status) && current.status !== nextStatus) {
        throw new Error("REGISTRATION_OPERATION_STATE_CONFLICT");
      }
      if (current.status !== nextStatus || expectedStatuses.includes(current.status)) {
        Object.assign(current, clone(patch), { status: nextStatus });
      }
      return clone(current);
    },
    async beginCompensation({
      operationId,
      expectedStatuses,
      compensationId,
      failureCode,
      nowMs,
    }) {
      const current = operations.get(operationId);
      if (!current) throw new Error("REGISTRATION_OPERATION_NOT_FOUND");
      if (
        current.status === PASSWORD_REGISTRATION_STATUS.RECOVERY_REQUIRED &&
        current.compensationId === compensationId
      ) {
        return { acquired: true, operation: clone(current) };
      }
      if (!expectedStatuses.includes(current.status)) {
        return { acquired: false, operation: clone(current) };
      }
      Object.assign(current, {
        status: PASSWORD_REGISTRATION_STATUS.RECOVERY_REQUIRED,
        compensationId,
        compensationStartedAtMs: nowMs,
        lastFailureCode: failureCode,
      });
      return { acquired: true, operation: clone(current) };
    },
    async beginVerificationLink({ operationId, leaseId, nowMs, leaseMs = 60_000 }) {
      const current = operations.get(operationId);
      if (!current) throw new Error("REGISTRATION_OPERATION_NOT_FOUND");
      if (current.verificationLinkEnvelope) {
        return { action: "USE_EXISTING", operation: clone(current) };
      }
      if (
        current.status === PASSWORD_REGISTRATION_STATUS.VERIFICATION_LINK_CREATING &&
        current.verificationLinkLeaseId !== leaseId &&
        current.verificationLinkLeaseUntilMs > nowMs
      ) {
        return { action: "BUSY", operation: clone(current) };
      }
      Object.assign(current, {
        status: PASSWORD_REGISTRATION_STATUS.VERIFICATION_LINK_CREATING,
        verificationLinkLeaseId: leaseId,
        verificationLinkLeaseUntilMs: nowMs + leaseMs,
      });
      return { action: "GENERATE", operation: clone(current) };
    },
    async storeVerificationLink({ operationId, leaseId, envelope }) {
      const current = operations.get(operationId);
      if (
        current?.status !== PASSWORD_REGISTRATION_STATUS.VERIFICATION_LINK_CREATING ||
        current.verificationLinkLeaseId !== leaseId
      ) {
        throw new Error("VERIFICATION_LINK_LEASE_LOST");
      }
      Object.assign(current, {
        status: PASSWORD_REGISTRATION_STATUS.VERIFICATION_PENDING,
        verificationLinkEnvelope: clone(envelope),
        verificationLinkLeaseId: null,
        verificationLinkLeaseUntilMs: null,
      });
      return clone(current);
    },
    async releaseVerificationLink({ operationId, leaseId }) {
      const current = operations.get(operationId);
      if (
        current?.status !== PASSWORD_REGISTRATION_STATUS.VERIFICATION_LINK_CREATING ||
        current.verificationLinkLeaseId !== leaseId
      ) {
        return { released: false, operation: clone(current) };
      }
      Object.assign(current, {
        status: PASSWORD_REGISTRATION_STATUS.ORGANIZATION_CREATED,
        verificationLinkLeaseId: null,
        verificationLinkLeaseUntilMs: null,
      });
      return { released: true, operation: clone(current) };
    },
  };
}

function authFake() {
  const users = new Map();
  const claims = new Map();
  return {
    users,
    claims,
    createCount: 0,
    deleteCount: 0,
    linkCount: 0,
    async getUser(uid) {
      const user = users.get(uid);
      if (!user) {
        const error = new Error("auth/user-not-found");
        error.code = "auth/user-not-found";
        throw error;
      }
      return { ...user };
    },
    async createUser(input) {
      this.createCount += 1;
      if (users.has(input.uid)) {
        const error = new Error("auth/uid-already-exists");
        error.code = "auth/uid-already-exists";
        throw error;
      }
      if ([...users.values()].some((user) => user.email === input.email)) {
        const error = new Error("auth/email-already-exists");
        error.code = "auth/email-already-exists";
        throw error;
      }
      const user = { ...input };
      users.set(input.uid, user);
      return { ...user };
    },
    async deleteUser(uid) {
      this.deleteCount += 1;
      users.delete(uid);
    },
    async setCustomUserClaims(uid, value) {
      claims.set(uid, clone(value));
    },
    async generateEmailVerificationLink(email) {
      this.linkCount += 1;
      return `https://portal.cleanzi.pl/verify?oobCode=link-${this.linkCount}&email=${encodeURIComponent(email)}`;
    },
  };
}

function harness(options = {}) {
  let currentNow = NOW;
  const auth = options.auth || authFake();
  const operationStore = options.operationStore || operationStoreFake();
  const attempts = [];
  const organizations = new Map();
  const messages = new Map();
  const deliveryAttempts = [];
  let provisionFailure = options.provisionFailure || null;
  let mailFailure = options.mailFailure || null;

  const broker = createCleaningCompanyPasswordRegistrationBroker({
    auth,
    operationStore,
    hmacKey: HMAC_KEY,
    allowedHostnames: ["portal.cleanzi.pl"],
    verificationContinueUrl: options.verificationContinueUrl ||
      "https://portal.cleanzi.pl/rejestracja/potwierdzona",
    now: () => currentNow,
    passwordPolicy: options.passwordPolicy || {
      async assertAllowed(password) {
        if (password.length < 15) throw new Error("PASSWORD_TOO_SHORT");
      },
    },
    abuseGuard: options.abuseGuard || {
      async assertAllowed(input) {
        assert.equal(input.channel, "CLEANING_COMPANY");
        assert.match(input.emailHmac, /^[A-Za-z0-9_-]+$/);
        if (options.rejectAsAbuse) throw new Error("REGISTRATION_RATE_LIMITED");
      },
    },
    turnstileVerifier: options.turnstileVerifier || {
      async verify({ expectedAction }) {
        return {
          ok: true,
          mode: "enforce",
          action: expectedAction,
          hostname: "portal.cleanzi.pl",
        };
      },
    },
    attemptAuthority: {
      async authorizePasswordRegistration(snapshot, authorization) {
        attempts.push(clone(snapshot));
        assert.equal(
          authorization.registrationToken,
          "registration-token-20260801-0001-abcdefghijklmnopqrstuvwxyz",
        );
        if (options.rejectAttempt) throw new Error("SOURCE_ATTEMPT_NOT_AUTHORIZED");
        assert.match(authorization.operationId, /^preg_/);
        assert.match(authorization.uid, /^reg_/);
        assert.match(authorization.orgId, /^org_reg_/);
        assert.equal(snapshot.consents.termsVersion, "terms-pl-2026-08-01");
        assert.equal(snapshot.consents.privacyVersion, "privacy-pl-2026-08-01");
        return Object.freeze({
          registrationId: snapshot.registrationId,
          operationId: authorization.operationId,
          uid: authorization.uid,
          orgId: authorization.orgId,
          tokenHash: "a".repeat(64),
          alreadyProvisioned: false,
          selectedPlanCode: snapshot.selectedPlanCode,
          billingCycle: snapshot.billingCycle,
          email: snapshot.email,
          countryCode: "PL",
          locale: snapshot.locale,
          timezone: snapshot.timezone,
          owner: {
            firstName: snapshot.firstName,
            lastName: snapshot.lastName,
            phone: snapshot.phone,
          },
          consents: [],
        });
      },
    },
    organizationProvisioner: {
      async provisionCleaningCompany(input) {
        if (provisionFailure) throw provisionFailure;
        if (options.provisionedResult) {
          const value = typeof options.provisionedResult === "function"
            ? options.provisionedResult(input)
            : options.provisionedResult;
          return clone(value);
        }
        const existing = organizations.get(input.orgId);
        if (existing) return clone(existing);
        const organization = {
          ...clone(input),
          orgId: input.orgId,
          trialStartedAtMs: input.subscription.trialStartedAtMs,
          trialEndsAtMs: input.subscription.trialEndsAtMs,
        };
        organizations.set(input.orgId, organization);
        return clone(organization);
      },
    },
    verificationMailer: {
      async sendVerification(input) {
        deliveryAttempts.push(clone(input));
        if (options.beforeMailSend) {
          await options.beforeMailSend(input, deliveryAttempts.length);
        }
        if (mailFailure) throw mailFailure;
        if (!messages.has(input.idempotencyKey)) {
          messages.set(input.idempotencyKey, clone(input));
        }
      },
    },
  });

  return {
    auth,
    broker,
    operationStore,
    attempts,
    organizations,
    messages,
    deliveryAttempts,
    setNow(value) { currentNow = value; },
    setProvisionFailure(value) { provisionFailure = value; },
    setMailFailure(value) { mailFailure = value; },
  };
}

test("broker creates one unverified admin and organization with an exact 14-day trial", async () => {
  const env = harness();
  const result = await env.broker.register(registrationInput());

  assert.equal(result.status, "EMAIL_VERIFICATION_REQUIRED");
  assert.equal(result.emailVerified, false);
  assert.equal(result.operationalAccess, false);
  assert.equal("uid" in result, false);
  assert.equal("orgId" in result, false);
  assert.equal("operationId" in result, false);
  assert.equal(result.trialDays, 14);
  assert.equal(result.trialEndsAtMs - result.trialStartedAtMs, CLEANING_COMPANY_TRIAL_DURATION_MS);
  assert.equal(env.auth.users.size, 1);
  assert.equal(env.organizations.size, 1);
  assert.equal(env.messages.size, 1);

  const user = [...env.auth.users.values()][0];
  assert.equal(user.displayName, "Rafał Żółć");
  assert.equal(user.emailVerified, false);
  const organization = [...env.organizations.values()][0];
  assert.equal(organization.onboardingStatus, "IN_PROGRESS");
  assert.equal(organization.emailVerificationStatus, "PENDING");
  assert.equal(organization.subscription.planCode, "TRIAL");
  assert.equal(organization.subscription.autoConvert, false);
  assert.equal(organization.subscription.paymentMethodRequired, false);
  assert.equal(organization.selectedPlanCode, "PLUS");
  assert.equal(organization.billingCycle, "ANNUAL");
});

test("password is never placed in the attempt snapshot, operation or organization", async () => {
  const env = harness();
  await env.broker.register(registrationInput());
  const serialized = JSON.stringify({
    attempts: env.attempts,
    operations: [...env.operationStore.operations.values()],
    organizations: [...env.organizations.values()],
  });
  assert.doesNotMatch(serialized, /Bardzo-Dlugie-Haslo-2026/);
  assert.doesNotMatch(serialized, /registration-token-20260801/);
  assert.match(serialized, /"tokenHash":"a{64}"/);
  assert.equal(env.attempts[0].email, "właściciel@żółw-clean.pl");
});

test("retry is idempotent and does not create another account, organization or email", async () => {
  const env = harness();
  const first = await env.broker.register(registrationInput());
  env.setNow(NOW + 60_000);
  const retry = await env.broker.register(registrationInput());

  assert.deepEqual(retry, first);
  assert.equal(env.auth.createCount, 1);
  assert.equal(env.auth.users.size, 1);
  assert.equal(env.organizations.size, 1);
  assert.equal(env.messages.size, 1);
});

test("parallel duplicate requests converge on one account and one organization", async () => {
  const env = harness();
  const results = await Promise.all([
    env.broker.register(registrationInput()),
    env.broker.register(registrationInput()),
  ]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(env.auth.users.size, 1);
  assert.equal(env.organizations.size, 1);
  assert.equal(env.messages.size, 1);
});

test("a stale creator never deletes Auth after a duplicate advances the operation", async () => {
  const auth = authFake();
  const originalSetClaims = auth.setCustomUserClaims.bind(auth);
  let claimsCalls = 0;
  let releaseFirstClaims;
  let signalFirstClaims;
  const firstClaimsStarted = new Promise((resolve) => { signalFirstClaims = resolve; });
  const firstClaimsRelease = new Promise((resolve) => { releaseFirstClaims = resolve; });
  auth.setCustomUserClaims = async (uid, value) => {
    claimsCalls += 1;
    if (claimsCalls === 1) {
      signalFirstClaims();
      await firstClaimsRelease;
    }
    return originalSetClaims(uid, value);
  };
  const env = harness({ auth });
  const firstRequest = env.broker.register(registrationInput());
  await firstClaimsStarted;
  const secondResult = await env.broker.register(registrationInput());
  releaseFirstClaims();
  const firstResult = await firstRequest;

  assert.deepEqual(firstResult, secondResult);
  assert.equal(auth.deleteCount, 0);
  assert.equal(auth.users.size, 1);
  assert.equal(env.organizations.size, 1);
  assert.equal(env.messages.size, 1);
});

test("same operation key with a changed business payload fails as an idempotency conflict", async () => {
  const env = harness({ mailFailure: new Error("MAIL_PROVIDER_UNAVAILABLE") });
  await env.broker.register(registrationInput());
  await assert.rejects(
    env.broker.register(registrationInput({ selectedPlanCode: "PRO" })),
    /IDEMPOTENCY_CONFLICT/,
  );
  assert.equal(env.auth.users.size, 1);
  assert.equal(env.organizations.size, 1);
});

test("same operation key with a changed password fails without persisting the password", async () => {
  const env = harness({ mailFailure: new Error("MAIL_PROVIDER_UNAVAILABLE") });
  await env.broker.register(registrationInput());
  await assert.rejects(
    env.broker.register(registrationInput({ password: "Inne-Bardzo-Dlugie-Haslo-2026!" })),
    /IDEMPOTENCY_CONFLICT/,
  );
  const serialized = JSON.stringify([...env.operationStore.operations.values()]);
  assert.doesNotMatch(serialized, /Bardzo-Dlugie-Haslo|Inne-Bardzo-Dlugie/);
  assert.equal(env.auth.createCount, 1);
  assert.equal(env.organizations.size, 1);
});

test("source attempt, consents and Turnstile are checked before Firebase Auth creation", async () => {
  const env = harness({ rejectAttempt: true });
  await assert.rejects(
    env.broker.register(registrationInput()),
    /SOURCE_ATTEMPT_NOT_AUTHORIZED/,
  );
  assert.equal(env.auth.createCount, 0);
  assert.equal(env.organizations.size, 0);
});

test("an email longer than the source schema limit is rejected before Auth", async () => {
  const env = harness();
  const email = `${"a".repeat(169)}@example.com`;
  assert.equal(email.length, 181);
  await assert.rejects(
    env.broker.register(registrationInput({ email })),
    (error) => error.code === "INVALID_EMAIL",
  );
  assert.equal(env.auth.createCount, 0);
  assert.equal(env.attempts.length, 0);
});

test("an overlong composed display name is rejected before Auth", async () => {
  const env = harness();
  await assert.rejects(
    env.broker.register(registrationInput({
      firstName: "A".repeat(100),
      lastName: "B".repeat(100),
    })),
    (error) => error.code === "INVALID_DISPLAY_NAME",
  );
  assert.equal(env.auth.createCount, 0);
  assert.equal(env.attempts.length, 0);
});

test("server abuse guard runs before the source attempt and Auth creation", async () => {
  const env = harness({ rejectAsAbuse: true });
  await assert.rejects(
    env.broker.register(registrationInput()),
    /REGISTRATION_RATE_LIMITED/,
  );
  assert.equal(env.attempts.length, 0);
  assert.equal(env.auth.createCount, 0);
});

test("Turnstile outage is retryable and blocks abuse, password and source work", async () => {
  let abuseChecks = 0;
  let passwordChecks = 0;
  const env = harness({
    turnstileVerifier: {
      async verify() {
        return {
          ok: false,
          mode: "enforce",
          action: "registration_cleaning_company",
          hostname: null,
          reason: "PROVIDER_UNAVAILABLE",
        };
      },
    },
    abuseGuard: { async assertAllowed() { abuseChecks += 1; } },
    passwordPolicy: { async assertAllowed() { passwordChecks += 1; } },
  });
  await assert.rejects(
    env.broker.register(registrationInput()),
    (error) => error.code === "TURNSTILE_PROVIDER_UNAVAILABLE",
  );
  assert.equal(abuseChecks, 0);
  assert.equal(passwordChecks, 0);
  assert.equal(env.attempts.length, 0);
  assert.equal(env.auth.createCount, 0);
});

test("valid Turnstile and abuse checks run before external password screening", async () => {
  const order = [];
  const env = harness({
    rejectAttempt: true,
    turnstileVerifier: {
      async verify({ expectedAction }) {
        order.push("turnstile");
        return {
          ok: true,
          mode: "enforce",
          action: expectedAction,
          hostname: "portal.cleanzi.pl",
        };
      },
    },
    abuseGuard: { async assertAllowed() { order.push("abuse"); } },
    passwordPolicy: { async assertAllowed() { order.push("password"); } },
  });
  await assert.rejects(
    env.broker.register(registrationInput()),
    /SOURCE_ATTEMPT_NOT_AUTHORIZED/,
  );
  assert.deepEqual(order, ["turnstile", "abuse", "password"]);
  assert.equal(env.auth.createCount, 0);
});

test("verification email cannot be configured with an external redirect", () => {
  assert.throws(
    () => harness({ verificationContinueUrl: "https://attacker.example/collect" }),
    (error) => error.code === "INVALID_VERIFICATION_CONTINUE_URL",
  );
});

test("a known pre-commit provisioning failure removes Auth and permits a clean retry", async () => {
  const failure = new Error("DATABASE_UNAVAILABLE_BEFORE_TRANSACTION");
  failure.safeToCompensateAuth = true;
  const env = harness({ provisionFailure: failure });
  await assert.rejects(
    env.broker.register(registrationInput()),
    /DATABASE_UNAVAILABLE_BEFORE_TRANSACTION/,
  );
  assert.equal(env.auth.users.size, 0);
  assert.equal(env.auth.deleteCount, 1);
  assert.equal([...env.operationStore.operations.values()][0].status, PASSWORD_REGISTRATION_STATUS.RESERVED);

  env.setProvisionFailure(null);
  const result = await env.broker.register(registrationInput());
  assert.equal(result.status, "EMAIL_VERIFICATION_REQUIRED");
  assert.equal(env.auth.users.size, 1);
  assert.equal(env.organizations.size, 1);
});

test("an ambiguous provisioning failure is fail-closed and requires reconciliation", async () => {
  const env = harness({ provisionFailure: new Error("DATABASE_COMMIT_RESULT_UNKNOWN") });
  await assert.rejects(
    env.broker.register(registrationInput()),
    (error) => error.code === "REGISTRATION_RECOVERY_REQUIRED",
  );
  assert.equal(env.auth.users.size, 1);
  assert.equal([...env.operationStore.operations.values()][0].status, PASSWORD_REGISTRATION_STATUS.RECOVERY_REQUIRED);
  await assert.rejects(
    env.broker.register(registrationInput()),
    (error) => error.code === "REGISTRATION_RECOVERY_REQUIRED",
  );
  assert.equal(env.auth.createCount, 1);
});

test("mail failure keeps the organization and retries delivery without extending trial", async () => {
  const env = harness({ mailFailure: new Error("MAIL_PROVIDER_UNAVAILABLE") });
  const first = await env.broker.register(registrationInput());
  assert.equal(first.status, "EMAIL_DELIVERY_PENDING");
  assert.equal(env.auth.users.size, 1);
  assert.equal(env.organizations.size, 1);
  assert.equal(env.auth.linkCount, 1);
  assert.equal(env.deliveryAttempts.length, 1);
  const firstVerificationUrl = env.deliveryAttempts[0].verificationUrl;
  const pendingOperation = [...env.operationStore.operations.values()][0];
  assert.equal(pendingOperation.status, PASSWORD_REGISTRATION_STATUS.VERIFICATION_PENDING);
  assert.equal(typeof pendingOperation.verificationLinkEnvelope?.ciphertext, "string");
  assert.doesNotMatch(JSON.stringify(pendingOperation), /oobCode|portal\.cleanzi\.pl/);

  env.setMailFailure(null);
  env.setNow(NOW + 3_600_000);
  const retry = await env.broker.register(registrationInput());
  assert.equal(retry.status, "EMAIL_VERIFICATION_REQUIRED");
  assert.equal(retry.trialStartedAtMs, first.trialStartedAtMs);
  assert.equal(retry.trialEndsAtMs, first.trialEndsAtMs);
  assert.equal(env.auth.createCount, 1);
  assert.equal(env.auth.linkCount, 1);
  assert.equal(env.organizations.size, 1);
  assert.equal(env.messages.size, 1);
  assert.equal(env.deliveryAttempts.length, 2);
  assert.equal(env.deliveryAttempts[1].verificationUrl, firstVerificationUrl);
  assert.equal(
    [...env.operationStore.operations.values()][0].verificationLinkEnvelope,
    null,
  );
});

test("delivery retry skips mutable password screening after the operation exists", async () => {
  let passwordChecks = 0;
  let compromised = false;
  const env = harness({
    mailFailure: new Error("MAIL_PROVIDER_UNAVAILABLE"),
    passwordPolicy: {
      async assertAllowed() {
        passwordChecks += 1;
        if (compromised) throw new Error("PASSWORD_COMPROMISED");
      },
    },
  });
  const first = await env.broker.register(registrationInput());
  compromised = true;
  env.setMailFailure(null);

  const retry = await env.broker.register(registrationInput());
  assert.equal(first.status, "EMAIL_DELIVERY_PENDING");
  assert.equal(retry.status, "EMAIL_VERIFICATION_REQUIRED");
  assert.equal(passwordChecks, 1);
  assert.equal(env.auth.linkCount, 1);
  assert.equal(env.organizations.size, 1);
});

test("parallel mail retries converge after one caller completes the operation", async () => {
  let retryCalls = 0;
  let releaseFirstRetry;
  let signalFirstRetry;
  const firstRetryStarted = new Promise((resolve) => { signalFirstRetry = resolve; });
  const firstRetryRelease = new Promise((resolve) => { releaseFirstRetry = resolve; });
  const env = harness({
    mailFailure: new Error("MAIL_PROVIDER_UNAVAILABLE"),
    async beforeMailSend(_input, attemptNumber) {
      if (attemptNumber === 1) return;
      retryCalls += 1;
      if (retryCalls === 1) {
        signalFirstRetry();
        await firstRetryRelease;
      }
    },
  });
  await env.broker.register(registrationInput());
  env.setMailFailure(null);

  const firstRetry = env.broker.register(registrationInput());
  await firstRetryStarted;
  const secondResult = await env.broker.register(registrationInput());
  releaseFirstRetry();
  const firstResult = await firstRetry;

  assert.deepEqual(firstResult, secondResult);
  assert.equal(firstResult.status, "EMAIL_VERIFICATION_REQUIRED");
  assert.equal(env.auth.linkCount, 1);
  assert.equal(env.auth.deleteCount, 0);
  assert.equal(env.organizations.size, 1);
  assert.equal(env.messages.size, 1);
});

test("retry observes an already verified Firebase user and does not send another email", async () => {
  const env = harness({ mailFailure: new Error("MAIL_RESULT_UNKNOWN") });
  const first = await env.broker.register(registrationInput());
  const user = [...env.auth.users.values()][0];
  user.emailVerified = true;
  env.setMailFailure(null);

  const retry = await env.broker.register(registrationInput());
  assert.equal(retry.status, "EMAIL_VERIFIED");
  assert.equal(retry.emailVerified, true);
  assert.equal(retry.operationalAccess, false);
  assert.equal(env.messages.size, 0);
  assert.equal(env.organizations.size, 1);
});

test("transient Auth reconciliation failures remain retryable without poisoning the operation", async () => {
  const env = harness();
  await env.broker.register(registrationInput());
  const transientError = new Error("auth/internal-error");
  transientError.code = "auth/internal-error";
  env.auth.getUser = async () => { throw transientError; };

  await assert.rejects(
    env.broker.register(registrationInput()),
    (error) => error === transientError,
  );
  assert.equal(
    [...env.operationStore.operations.values()][0].status,
    PASSWORD_REGISTRATION_STATUS.COMPLETED,
  );
  assert.equal(env.auth.deleteCount, 0);
});

test("a missing Auth user after reservation is a definitive recovery condition", async () => {
  const env = harness();
  await env.broker.register(registrationInput());
  env.auth.users.clear();

  await assert.rejects(
    env.broker.register(registrationInput()),
    (error) => error.code === "REGISTRATION_RECOVERY_REQUIRED",
  );
  assert.equal(
    [...env.operationStore.operations.values()][0].status,
    PASSWORD_REGISTRATION_STATUS.RECOVERY_REQUIRED,
  );
});

test("recovery accepts the authoritative SQL trial window without extending it", async () => {
  const env = harness({
    provisionedResult: (provisioningInput) => ({
      orgId: provisioningInput.orgId,
      trialStartedAtMs: NOW,
      trialEndsAtMs: NOW + CLEANING_COMPANY_TRIAL_DURATION_MS,
      createdNow: false,
    }),
  });
  const request = normalizeCleaningCompanyPasswordRequest(registrationInput());
  const identifiers = derivePasswordRegistrationIdentifiers({ request, hmacKey: HMAC_KEY });
  env.auth.users.set(identifiers.uid, {
    uid: identifiers.uid,
    email: request.email,
    emailVerified: false,
  });
  env.operationStore.operations.set(identifiers.operationId, {
    ...identifiers,
    registrationId: request.registrationId,
    requestFingerprint: passwordRegistrationRequestFingerprint(request, HMAC_KEY),
    channel: "CLEANING_COMPANY",
    status: PASSWORD_REGISTRATION_STATUS.AUTH_CREATED,
    createdAtMs: NOW,
  });
  env.setNow(NOW + 60 * 60 * 1_000);
  const value = await env.broker.register(registrationInput());
  assert.equal(value.trialStartedAtMs, NOW);
  assert.equal(value.trialEndsAtMs, NOW + CLEANING_COMPANY_TRIAL_DURATION_MS);
});

test("newsletter consent is independent and versioned only when selected", async () => {
  const env = harness();
  await env.broker.register(registrationInput());
  assert.deepEqual(env.attempts[0].consents, {
    termsVersion: "terms-pl-2026-08-01",
    privacyVersion: "privacy-pl-2026-08-01",
    newsletterVersion: null,
    newsletterConsent: false,
  });

  const envWithNewsletter = harness();
  await envWithNewsletter.broker.register(registrationInput({
    registrationId: "registration_20260801_0002",
    idempotencyKey: "idempotency_20260801_0002",
    consents: {
      termsVersion: "terms-pl-2026-08-01",
      privacyVersion: "privacy-pl-2026-08-01",
      newsletterConsent: true,
      newsletterVersion: "newsletter-pl-2026-08-01",
    },
  }));
  assert.equal(envWithNewsletter.attempts[0].consents.newsletterConsent, true);
  assert.equal(envWithNewsletter.attempts[0].consents.newsletterVersion, "newsletter-pl-2026-08-01");
});
