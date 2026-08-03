import assert from "node:assert/strict";
import test from "node:test";
import {
  createPostgresCleaningCompanyProvisioner,
} from "../src/postgres-cleaning-company-provisioner.js";

const NOW = Date.parse("2026-08-02T08:00:00.000Z");
const ENDS = NOW + 14 * 24 * 60 * 60 * 1_000;

function sourceAuthorization(overrides = {}) {
  return {
    registrationId: "registrationID_1001",
    operationId: "preg_operation_1001",
    uid: "reg_uid_1001",
    orgId: "org_reg_1001",
    tokenHash: "a".repeat(64),
    alreadyProvisioned: false,
    sourceStatus: "STARTED",
    selectedPlanCode: "PLUS",
    billingCycle: "ANNUAL",
    email: "właściciel@żółw-clean.pl",
    countryCode: "PL",
    locale: "pl-PL",
    timezone: "Europe/Warsaw",
    owner: { firstName: "Rafał", lastName: "Żółć", phone: "+48 500 600 700" },
    consents: [
      { type: "TERMS", version: "2026-07-01", accepted: true, acceptedAt: new Date(NOW - 1_000), locale: "pl-PL", ipHash: "proof", userAgent: "agent", createdAt: new Date(NOW - 1_000) },
      { type: "PRIVACY_POLICY", version: "2026-07-01", accepted: true, acceptedAt: new Date(NOW - 1_000), locale: "pl-PL", ipHash: "proof", userAgent: "agent", createdAt: new Date(NOW - 1_000) },
      { type: "MARKETING", version: "2026-07-01", accepted: false, acceptedAt: null, locale: "pl-PL", ipHash: "proof", userAgent: "agent", createdAt: new Date(NOW - 1_000) },
    ],
    sourceExpiresAt: new Date(NOW + 60_000),
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    operationId: "preg_operation_1001",
    uid: "reg_uid_1001",
    orgId: "org_reg_1001",
    sourceAuthorization: sourceAuthorization(),
    email: "właściciel@żółw-clean.pl",
    owner: { firstName: "Rafał", lastName: "Żółć", displayName: "Rafał Żółć", phone: "+48 500 600 700" },
    selectedPlanCode: "PLUS",
    billingCycle: "ANNUAL",
    locale: "pl-PL",
    timezone: "Europe/Warsaw",
    onboardingStatus: "IN_PROGRESS",
    emailVerificationStatus: "PENDING",
    subscription: {
      planCode: "TRIAL",
      status: "TRIALING",
      trialStartedAtMs: NOW,
      trialEndsAtMs: ENDS,
      trialDays: 14,
      autoConvert: false,
      paymentMethodRequired: false,
    },
    ...overrides,
  };
}

function scriptedPool({ failAt, reconcile = false } = {}) {
  const calls = [];
  let bound = reconcile;
  function provisionedRow() {
    return bound ? {
      org_id: "org_reg_1001",
      uid: "reg_uid_1001",
      broker_operation_id: "preg_operation_1001",
      plan_code: "TRIAL",
      subscription_status: "TRIALING",
      trial_started_at: new Date(NOW),
      trial_ends_at: new Date(ENDS),
      projection_state: "PENDING",
    } : null;
  }
  const client = {
    async query(sql, params = []) {
      const compact = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: compact, params });
      if (failAt && compact.includes(failAt)) throw new Error(`FAIL:${failAt}`);
      if (compact.startsWith("SELECT registration_id")) {
        return { rows: [{
          registration_id: "registrationID_1001", status: bound ? "AUTH_CREATED" : "STARTED",
          selected_plan_code: "PLUS", billing_cycle: "ANNUAL",
          email_normalized: "właściciel@żółw-clean.pl", country_code: "PL", locale: "pl-PL",
          uid: bound ? "reg_uid_1001" : null, org_id: bound ? "org_reg_1001" : null,
          first_name: "Rafał", last_name: "Żółć", phone: "+48 500 600 700",
          timezone: "Europe/Warsaw", auth_provider: bound ? "password" : null,
          provider_uid: bound ? "reg_uid_1001" : null,
          access_token_hash: bound ? null : "a".repeat(64),
          broker_operation_id: bound ? "preg_operation_1001" : null,
          auth_bound_at: bound ? new Date(NOW) : null,
          expires_at: new Date(NOW + 60_000),
        }] };
      }
      if (compact.includes("FROM registration_consent")) {
        return { rows: sourceAuthorization().consents.map((consent) => ({
          consent_type: consent.type, consent_version: consent.version,
          accepted: consent.accepted, accepted_at: consent.acceptedAt,
          locale: consent.locale, ip_hash: consent.ipHash,
          user_agent: consent.userAgent, created_at: consent.createdAt,
        })) };
      }
      if (compact.startsWith("SELECT EXISTS")) return { rows: [{ already_used: false }] };
      if (compact.startsWith("UPDATE registration_attempt")) {
        bound = true;
        return { rowCount: 1, rows: [] };
      }
      if (compact.startsWith("SELECT ra.org_id")) {
        const row = provisionedRow();
        return { rows: row ? [row] : [] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() { calls.push({ sql: "RELEASE", params: [] }); },
  };
  return {
    calls,
    async connect() { return client; },
  };
}

test("provisioner creates the graph, exact 14-day trial and pending outbox atomically", async () => {
  const pool = scriptedPool();
  const provisioner = createPostgresCleaningCompanyProvisioner({ pool, now: () => NOW });
  const result = await provisioner.provisionCleaningCompany(input());
  assert.deepEqual(result, {
    orgId: "org_reg_1001",
    trialStartedAtMs: NOW,
    trialEndsAtMs: ENDS,
    trialDays: 14,
    projectionState: "PENDING",
    createdNow: true,
  });
  const sql = pool.calls.map((call) => call.sql).join("\n");
  for (const table of ["organizations", "worker", "organization_member", "organization_company_profile", "organization_subscription", "trial_redemption", "subscription_event", "user_consent", "cleanzi_registration_projection_outbox"]) {
    assert.match(sql, new RegExp(`INSERT INTO ${table}`));
  }
  assert.match(sql, /BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE/);
  assert.match(sql, /COMMIT/);
  const serializedParams = JSON.stringify(pool.calls.map((call) => call.params));
  assert.doesNotMatch(serializedParams, /registration-token/);
  assert.match(serializedParams, /CLEANING_PROVIDER_REGISTERED/);
});

test("known pre-commit SQL failure is explicitly safe for Auth compensation", async () => {
  const pool = scriptedPool({ failAt: "INSERT INTO organizations" });
  const provisioner = createPostgresCleaningCompanyProvisioner({ pool, now: () => NOW });
  await assert.rejects(provisioner.provisionCleaningCompany(input()), (error) => {
    assert.equal(error.code, "DATABASE_TRANSACTION_ROLLED_BACK");
    assert.equal(error.safeToCompensateAuth, true);
    return true;
  });
  assert.equal(pool.calls.some((call) => call.sql === "ROLLBACK"), true);
});

test("unknown COMMIT result is recovered only when the same operation is visible", async () => {
  let connects = 0;
  const transactionPool = scriptedPool({ failAt: "COMMIT" });
  const recoveryPool = scriptedPool({ reconcile: true });
  const pool = {
    async connect() {
      connects += 1;
      return connects === 1 ? await transactionPool.connect() : await recoveryPool.connect();
    },
  };
  const result = await createPostgresCleaningCompanyProvisioner({ pool, now: () => NOW })
    .provisionCleaningCompany(input());
  assert.equal(result.orgId, "org_reg_1001");
  assert.equal(connects, 2);
});

test("unreconciled COMMIT failure never authorizes deletion of Firebase Auth", async () => {
  const transactionPool = scriptedPool({ failAt: "COMMIT" });
  let connects = 0;
  const pool = {
    async connect() {
      connects += 1;
      if (connects === 1) return transactionPool.connect();
      return {
        async query() { return { rows: [] }; },
        release() {},
      };
    },
  };
  await assert.rejects(
    createPostgresCleaningCompanyProvisioner({ pool, now: () => NOW }).provisionCleaningCompany(input()),
    (error) => {
      assert.equal(error.code, "DATABASE_COMMIT_RESULT_UNKNOWN");
      assert.equal(error.safeToCompensateAuth, false);
      return true;
    },
  );
});
