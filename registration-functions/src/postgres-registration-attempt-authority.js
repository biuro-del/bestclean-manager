import { createHash } from "node:crypto";
import {
  RegistrationGateError,
  normalizedNow,
  requiredText,
} from "./registration-contract.js";

const AUTHORIZABLE_STATUSES = new Set([
  "STARTED",
  "AUTH_CREATED",
  "EMAIL_VERIFIED",
  "PORTAL_ONBOARDING",
]);

function fail(code) {
  throw new RegistrationGateError(code);
}

function normalized(value) {
  return String(value ?? "").trim();
}

function normalizedEmail(value) {
  return normalized(value).toLowerCase();
}

function normalizedPlan(value) {
  const plan = normalized(value).toUpperCase();
  return plan === "START" ? "PLUS" : plan;
}

function normalizedBillingCycle(value) {
  const cycle = normalized(value).toUpperCase();
  return cycle === "YEARLY" ? "ANNUAL" : cycle;
}

function registrationTokenHash(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function consentMap(rows) {
  return new Map((rows || []).map((row) => [normalized(row.consent_type), row]));
}

function assertConsent(row, { version, accepted, locale, code }) {
  if (
    !row ||
    normalized(row.consent_version) !== version ||
    row.accepted !== accepted ||
    normalized(row.locale) !== locale ||
    (accepted && !row.accepted_at)
  ) {
    fail(code);
  }
}

function assertRejectedMarketingConsent(row, locale) {
  if (!row) fail("SOURCE_NEWSLETTER_CONSENT_INVALID");
  if (row.accepted !== false) fail("SOURCE_NEWSLETTER_CONSENT_MISMATCH");
  if (
    !normalized(row.consent_version) ||
    normalized(row.locale) !== locale ||
    row.accepted_at ||
    !row.created_at ||
    !Number.isFinite(new Date(row.created_at).getTime())
  ) {
    fail("SOURCE_NEWSLETTER_CONSENT_INVALID");
  }
}

function safeConsent(row) {
  return Object.freeze({
    type: normalized(row.consent_type),
    version: normalized(row.consent_version),
    accepted: row.accepted === true,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at) : null,
    locale: normalized(row.locale),
    ipHash: normalized(row.ip_hash),
    userAgent: typeof row.user_agent === "string" ? row.user_agent : null,
    createdAt: new Date(row.created_at),
  });
}

export function assertPasswordRegistrationAttempt({
  attempt,
  consentRows,
  snapshot,
  registrationToken,
  expectedTokenHash,
  operationId,
  uid,
  orgId,
  allowExpiredUnboundRetry = false,
  nowMs = Date.now(),
}) {
  if (!attempt) fail("SOURCE_ATTEMPT_NOT_FOUND");
  if (!AUTHORIZABLE_STATUSES.has(normalized(attempt.status).toUpperCase())) {
    fail("SOURCE_ATTEMPT_STATE_INVALID");
  }
  const alreadyProvisioned = Boolean(attempt.uid || attempt.org_id);
  if (alreadyProvisioned) {
    if (
      attempt.uid !== uid ||
      attempt.org_id !== orgId ||
      attempt.broker_operation_id !== operationId
    ) {
      fail("SOURCE_ATTEMPT_ALREADY_BOUND");
    }
  } else {
    if (
      allowExpiredUnboundRetry !== true &&
      attempt.expires_at &&
      new Date(attempt.expires_at).getTime() <= nowMs
    ) {
      fail("SOURCE_ATTEMPT_EXPIRED");
    }
    if (expectedTokenHash && !/^[a-f0-9]{64}$/.test(expectedTokenHash)) {
      fail("SOURCE_ATTEMPT_TOKEN_INVALID");
    }
    const suppliedHash = expectedTokenHash || registrationTokenHash(
      requiredText(registrationToken, "INVALID_REGISTRATION_TOKEN", 100),
    );
    if (!attempt.access_token_hash || attempt.access_token_hash !== suppliedHash) {
      fail("SOURCE_ATTEMPT_TOKEN_INVALID");
    }
  }

  if (
    attempt.registration_id !== snapshot.registrationId ||
    normalizedEmail(attempt.email_normalized) !== snapshot.email ||
    normalizedPlan(attempt.selected_plan_code) !== snapshot.selectedPlanCode ||
    normalizedBillingCycle(attempt.billing_cycle) !== snapshot.billingCycle ||
    normalized(attempt.first_name) !== snapshot.firstName ||
    normalized(attempt.last_name) !== snapshot.lastName ||
    normalized(attempt.phone) !== normalized(snapshot.phone) ||
    normalized(attempt.locale) !== snapshot.locale ||
    normalized(attempt.timezone) !== snapshot.timezone
  ) {
    fail("SOURCE_ATTEMPT_PAYLOAD_MISMATCH");
  }

  const consents = consentMap(consentRows);
  assertConsent(consents.get("TERMS"), {
    version: snapshot.consents.termsVersion,
    accepted: true,
    locale: snapshot.locale,
    code: "SOURCE_TERMS_CONSENT_INVALID",
  });
  assertConsent(consents.get("PRIVACY_POLICY"), {
    version: snapshot.consents.privacyVersion,
    accepted: true,
    locale: snapshot.locale,
    code: "SOURCE_PRIVACY_CONSENT_INVALID",
  });
  const marketing = consents.get("MARKETING");
  if (snapshot.consents.newsletterConsent) {
    assertConsent(marketing, {
      version: snapshot.consents.newsletterVersion,
      accepted: true,
      locale: snapshot.locale,
      code: "SOURCE_NEWSLETTER_CONSENT_INVALID",
    });
  } else {
    assertRejectedMarketingConsent(marketing, snapshot.locale);
  }

  const tokenHash = alreadyProvisioned
    ? null
    : expectedTokenHash || registrationTokenHash(registrationToken);
  return Object.freeze({
    registrationId: attempt.registration_id,
    operationId,
    uid,
    orgId,
    tokenHash,
    alreadyProvisioned,
    sourceStatus: normalized(attempt.status).toUpperCase(),
    selectedPlanCode: normalizedPlan(attempt.selected_plan_code),
    billingCycle: normalizedBillingCycle(attempt.billing_cycle),
    email: normalizedEmail(attempt.email_normalized),
    countryCode: normalized(attempt.country_code || "PL").toUpperCase(),
    locale: normalized(attempt.locale),
    timezone: normalized(attempt.timezone),
    owner: Object.freeze({
      firstName: normalized(attempt.first_name),
      lastName: normalized(attempt.last_name),
      phone: normalized(attempt.phone) || null,
    }),
    consents: Object.freeze(
      ["TERMS", "PRIVACY_POLICY", "MARKETING"]
        .map((type) => consents.get(type))
        .filter(Boolean)
        .map(safeConsent),
    ),
    sourceExpiresAt: attempt.expires_at ? new Date(attempt.expires_at) : null,
    sourceAuthBoundAt: attempt.auth_bound_at ? new Date(attempt.auth_bound_at) : null,
  });
}

export function createPostgresRegistrationAttemptAuthority({
  pool,
  now = () => Date.now(),
}) {
  if (typeof pool?.connect !== "function") {
    throw new RegistrationGateError("POSTGRES_POOL_REQUIRED");
  }

  return Object.freeze({
    async authorizePasswordRegistration(snapshot, authorization = {}) {
      const client = await pool.connect();
      let began = false;
      try {
        await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
        began = true;
        const attemptResult = await client.query(
          `SELECT registration_id, status, selected_plan_code, billing_cycle,
                  email_normalized, country_code, locale, uid, org_id,
                  first_name, last_name, phone, timezone, auth_provider,
                  provider_uid, access_token_hash, broker_operation_id,
                  auth_bound_at, expires_at
             FROM registration_attempt
            WHERE registration_id = $1`,
          [snapshot.registrationId],
        );
        const consentResult = await client.query(
          `SELECT consent_type, consent_version, accepted, accepted_at, locale,
                  ip_hash, user_agent, created_at
             FROM registration_consent
            WHERE registration_id = $1
            ORDER BY consent_type`,
          [snapshot.registrationId],
        );
        const result = assertPasswordRegistrationAttempt({
          attempt: attemptResult.rows[0],
          consentRows: consentResult.rows,
          snapshot,
          registrationToken: authorization.registrationToken,
          operationId: requiredText(
            authorization.operationId,
            "INVALID_OPERATION_ID",
            160,
          ),
          uid: requiredText(authorization.uid, "INVALID_UID", 128),
          orgId: requiredText(authorization.orgId, "INVALID_ORG_ID", 128),
          allowExpiredUnboundRetry:
            authorization.allowExpiredUnboundRetry === true,
          nowMs: normalizedNow(now()),
        });
        await client.query("COMMIT");
        began = false;
        return result;
      } catch (error) {
        if (began) {
          try {
            await client.query("ROLLBACK");
          } catch {
            // Authorization happens before Auth creation; the original error wins.
          }
        }
        throw error;
      } finally {
        client.release();
      }
    },
  });
}

export const __test = Object.freeze({
  registrationTokenHash,
});
