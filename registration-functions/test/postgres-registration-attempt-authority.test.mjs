import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  assertPasswordRegistrationAttempt,
  createPostgresRegistrationAttemptAuthority,
} from "../src/postgres-registration-attempt-authority.js";

const TOKEN = "registration-token-20260802-0001-abcdefghijklmnopqrstuvwxyz";
const TOKEN_HASH = createHash("sha256").update(TOKEN, "utf8").digest("hex");
const NOW = Date.parse("2026-08-02T08:00:00.000Z");

function snapshot(overrides = {}) {
  return {
    registrationId: "registrationID_1001",
    email: "właściciel@żółw-clean.pl",
    firstName: "Rafał",
    lastName: "Żółć",
    phone: "+48 500 600 700",
    selectedPlanCode: "PLUS",
    billingCycle: "ANNUAL",
    locale: "pl-PL",
    timezone: "Europe/Warsaw",
    consents: {
      termsVersion: "2026-07-01",
      privacyVersion: "2026-07-01",
      newsletterConsent: false,
      newsletterVersion: null,
    },
    ...overrides,
  };
}

function attempt(overrides = {}) {
  return {
    registration_id: "registrationID_1001",
    status: "STARTED",
    selected_plan_code: "START",
    billing_cycle: "YEARLY",
    email_normalized: "właściciel@żółw-clean.pl",
    country_code: "PL",
    locale: "pl-PL",
    uid: null,
    org_id: null,
    first_name: "Rafał",
    last_name: "Żółć",
    phone: "+48 500 600 700",
    timezone: "Europe/Warsaw",
    auth_provider: null,
    provider_uid: null,
    access_token_hash: TOKEN_HASH,
    broker_operation_id: null,
    auth_bound_at: null,
    expires_at: new Date(NOW + 60_000),
    ...overrides,
  };
}

function consents(overrides = {}) {
  const base = {
    consent_version: "2026-07-01",
    accepted: true,
    accepted_at: new Date(NOW - 1_000),
    locale: "pl-PL",
    ip_hash: "source-proof-hash",
    user_agent: "source-user-agent",
    created_at: new Date(NOW - 1_000),
  };
  return [
    { ...base, consent_type: "TERMS" },
    { ...base, consent_type: "PRIVACY_POLICY" },
    { ...base, consent_type: "MARKETING", accepted: false, accepted_at: null },
  ].map((row) => ({ ...row, ...overrides[row.consent_type] }));
}

const identifiers = {
  operationId: "preg_operation_1001",
  uid: "reg_uid_1001",
  orgId: "org_reg_1001",
};

test("authority validates source fields, Polish text and versioned consents", () => {
  const result = assertPasswordRegistrationAttempt({
    attempt: attempt(),
    consentRows: consents(),
    snapshot: snapshot(),
    registrationToken: TOKEN,
    ...identifiers,
    nowMs: NOW,
  });
  assert.equal(result.selectedPlanCode, "PLUS");
  assert.equal(result.billingCycle, "ANNUAL");
  assert.equal(result.email, "właściciel@żółw-clean.pl");
  assert.equal(result.owner.firstName, "Rafał");
  assert.equal(result.tokenHash, TOKEN_HASH);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(TOKEN));
});

test("authority rejects a token, payload or newsletter decision that differs from source", () => {
  assert.throws(() => assertPasswordRegistrationAttempt({
    attempt: attempt(), consentRows: consents(), snapshot: snapshot(),
    registrationToken: `${TOKEN}x`, ...identifiers, nowMs: NOW,
  }), (error) => error.code === "SOURCE_ATTEMPT_TOKEN_INVALID");
  assert.throws(() => assertPasswordRegistrationAttempt({
    attempt: attempt(), consentRows: consents(), snapshot: snapshot({ firstName: "Inny" }),
    registrationToken: TOKEN, ...identifiers, nowMs: NOW,
  }), (error) => error.code === "SOURCE_ATTEMPT_PAYLOAD_MISMATCH");
  assert.throws(() => assertPasswordRegistrationAttempt({
    attempt: attempt(),
    consentRows: consents({ MARKETING: { accepted: true, accepted_at: new Date(NOW) } }),
    snapshot: snapshot(), registrationToken: TOKEN, ...identifiers, nowMs: NOW,
  }), (error) => error.code === "SOURCE_NEWSLETTER_CONSENT_MISMATCH");
  assert.throws(() => assertPasswordRegistrationAttempt({
    attempt: attempt(), consentRows: consents().filter((row) => row.consent_type !== "MARKETING"),
    snapshot: snapshot(), registrationToken: TOKEN, ...identifiers, nowMs: NOW,
  }), (error) => error.code === "SOURCE_NEWSLETTER_CONSENT_INVALID");
  assert.throws(() => assertPasswordRegistrationAttempt({
    attempt: attempt(),
    consentRows: consents({ MARKETING: { locale: "en-GB" } }),
    snapshot: snapshot(), registrationToken: TOKEN, ...identifiers, nowMs: NOW,
  }), (error) => error.code === "SOURCE_NEWSLETTER_CONSENT_INVALID");
});

test("already bound source attempt is accepted only for the same broker operation", () => {
  const bound = attempt({
    status: "AUTH_CREATED",
    uid: identifiers.uid,
    org_id: identifiers.orgId,
    broker_operation_id: identifiers.operationId,
    access_token_hash: null,
  });
  const result = assertPasswordRegistrationAttempt({
    attempt: bound, consentRows: consents(), snapshot: snapshot(),
    registrationToken: TOKEN, ...identifiers, nowMs: NOW,
  });
  assert.equal(result.alreadyProvisioned, true);
  assert.equal(result.tokenHash, null);
  const expiredRetry = assertPasswordRegistrationAttempt({
    attempt: { ...bound, expires_at: new Date(NOW - 1) },
    consentRows: consents(), snapshot: snapshot(),
    registrationToken: TOKEN, ...identifiers, nowMs: NOW,
  });
  assert.equal(expiredRetry.alreadyProvisioned, true);
  assert.throws(() => assertPasswordRegistrationAttempt({
    attempt: bound, consentRows: consents(), snapshot: snapshot(),
    registrationToken: TOKEN, ...identifiers, operationId: "preg_other", nowMs: NOW,
  }), (error) => error.code === "SOURCE_ATTEMPT_ALREADY_BOUND");
  assert.throws(() => assertPasswordRegistrationAttempt({
    attempt: attempt({ expires_at: new Date(NOW - 1) }),
    consentRows: consents(), snapshot: snapshot(),
    registrationToken: TOKEN, ...identifiers, nowMs: NOW,
  }), (error) => error.code === "SOURCE_ATTEMPT_EXPIRED");
});

test("Postgres adapter reads attempt and consents in one repeatable-read transaction", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("FROM registration_attempt")) return { rows: [attempt()] };
      if (sql.includes("FROM registration_consent")) return { rows: consents() };
      return { rows: [] };
    },
    release() { calls.push({ sql: "RELEASE" }); },
  };
  const authority = createPostgresRegistrationAttemptAuthority({
    pool: { async connect() { return client; } },
    now: () => NOW,
  });
  const result = await authority.authorizePasswordRegistration(snapshot(), {
    registrationToken: TOKEN,
    ...identifiers,
  });
  assert.equal(result.orgId, identifiers.orgId);
  assert.match(calls[0].sql, /REPEATABLE READ READ ONLY/);
  assert.equal(calls.at(-2).sql, "COMMIT");
  assert.equal(calls.at(-1).sql, "RELEASE");
});
