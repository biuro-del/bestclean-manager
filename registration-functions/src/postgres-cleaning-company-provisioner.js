import { createHash } from "node:crypto";
import {
  RegistrationGateError,
  normalizedNow,
  requiredText,
} from "./registration-contract.js";
import { assertPasswordRegistrationAttempt } from "./postgres-registration-attempt-authority.js";

const TRIAL_DAYS = 14;
const TRIAL_DURATION_MS = TRIAL_DAYS * 24 * 60 * 60 * 1_000;

function stableId(prefix, source) {
  const digest = createHash("sha256").update(source, "utf8").digest("hex").slice(0, 32);
  return `${prefix}_${digest}`;
}

function databaseError(code, safeToCompensateAuth, cause) {
  const error = new RegistrationGateError(code);
  error.safeToCompensateAuth = safeToCompensateAuth;
  if (cause) error.cause = cause;
  return error;
}

function asDate(value, code) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw databaseError(code, false);
  return date;
}

function provisionedResult(row, expected, { createdNow = false } = {}) {
  if (!row) throw databaseError("REGISTRATION_PROVISIONING_RESULT_MISSING", false);
  const startedAt = asDate(row.trial_started_at, "TRIAL_WINDOW_INVALID");
  const endsAt = asDate(row.trial_ends_at, "TRIAL_WINDOW_INVALID");
  if (
    row.org_id !== expected.orgId ||
    row.uid !== expected.uid ||
    row.broker_operation_id !== expected.operationId ||
    row.plan_code !== "TRIAL" ||
    row.subscription_status !== "TRIALING" ||
    endsAt.getTime() - startedAt.getTime() !== TRIAL_DURATION_MS
  ) {
    throw databaseError("REGISTRATION_PROVISIONING_MISMATCH", false);
  }
  return Object.freeze({
    orgId: row.org_id,
    trialStartedAtMs: startedAt.getTime(),
    trialEndsAtMs: endsAt.getTime(),
    trialDays: TRIAL_DAYS,
    projectionState: String(row.projection_state || "PENDING"),
    createdNow,
  });
}

async function loadProvisioned(client, input) {
  const result = await client.query(
    `SELECT ra.org_id, ra.uid, ra.broker_operation_id,
            os.plan_code, os.status AS subscription_status,
            os.trial_started_at, os.trial_ends_at,
            COALESCE(ob.state, 'PENDING') AS projection_state
       FROM registration_attempt ra
       JOIN organization_subscription os ON os.org_id = ra.org_id
       LEFT JOIN cleanzi_registration_projection_outbox ob
         ON ob.operation_id = ra.broker_operation_id
      WHERE ra.registration_id = $1
        AND ra.broker_operation_id = $2
        AND ra.uid = $3
        AND ra.org_id = $4`,
    [
      input.sourceAuthorization.registrationId,
      input.operationId,
      input.uid,
      input.orgId,
    ],
  );
  return result.rows[0] || null;
}

function sourceSnapshot(input) {
  const source = input.sourceAuthorization;
  return Object.freeze({
    registrationId: source.registrationId,
    email: source.email,
    firstName: source.owner.firstName,
    lastName: source.owner.lastName,
    phone: source.owner.phone,
    selectedPlanCode: source.selectedPlanCode,
    billingCycle: source.billingCycle,
    locale: source.locale,
    timezone: source.timezone,
    consents: Object.freeze({
      termsVersion: source.consents.find((item) => item.type === "TERMS")?.version,
      privacyVersion: source.consents.find((item) => item.type === "PRIVACY_POLICY")?.version,
      newsletterConsent: source.consents.find((item) => item.type === "MARKETING")?.accepted === true,
      newsletterVersion: source.consents.find((item) => item.type === "MARKETING")?.accepted === true
        ? source.consents.find((item) => item.type === "MARKETING")?.version
        : null,
    }),
  });
}

function validateInput(input) {
  const source = input?.sourceAuthorization;
  if (!source || typeof source !== "object") {
    throw databaseError("SOURCE_AUTHORIZATION_REQUIRED", true);
  }
  for (const [value, code, max] of [
    [input.operationId, "INVALID_OPERATION_ID", 160],
    [input.uid, "INVALID_UID", 128],
    [input.orgId, "INVALID_ORG_ID", 64],
    [input.email, "INVALID_EMAIL", 180],
  ]) requiredText(value, code, max);
  if (
    source.operationId !== input.operationId ||
    source.uid !== input.uid ||
    source.orgId !== input.orgId ||
    source.email !== input.email ||
    source.selectedPlanCode !== input.selectedPlanCode ||
    source.billingCycle !== input.billingCycle ||
    source.locale !== input.locale ||
    source.timezone !== input.timezone ||
    source.countryCode !== "PL" ||
    source.locale !== "pl-PL"
  ) {
    throw databaseError("SOURCE_AUTHORIZATION_MISMATCH", true);
  }
  if (
    input.subscription?.planCode !== "TRIAL" ||
    input.subscription?.status !== "TRIALING" ||
    input.subscription?.trialDays !== TRIAL_DAYS ||
    input.subscription?.trialEndsAtMs - input.subscription?.trialStartedAtMs !== TRIAL_DURATION_MS ||
    input.subscription?.autoConvert !== false ||
    input.subscription?.paymentMethodRequired !== false
  ) {
    throw databaseError("TRIAL_CONTRACT_INVALID", true);
  }
  return source;
}

async function lockAndRevalidateSource(client, input, nowMs) {
  const attemptResult = await client.query(
    `SELECT registration_id, status, selected_plan_code, billing_cycle,
            email_normalized, country_code, locale, uid, org_id,
            first_name, last_name, phone, timezone, auth_provider,
            provider_uid, access_token_hash, broker_operation_id,
            auth_bound_at, expires_at
       FROM registration_attempt
      WHERE registration_id = $1
      FOR UPDATE`,
    [input.sourceAuthorization.registrationId],
  );
  const attempt = attemptResult.rows[0];
  if (
    attempt?.uid === input.uid &&
    attempt?.org_id === input.orgId &&
    attempt?.broker_operation_id === input.operationId
  ) {
    return { alreadyProvisioned: true, attempt };
  }
  const consentResult = await client.query(
    `SELECT consent_type, consent_version, accepted, accepted_at, locale,
            ip_hash, user_agent, created_at
       FROM registration_consent
      WHERE registration_id = $1
      ORDER BY consent_type
      FOR SHARE`,
    [input.sourceAuthorization.registrationId],
  );
  assertPasswordRegistrationAttempt({
    attempt,
    consentRows: consentResult.rows,
    snapshot: sourceSnapshot(input),
    expectedTokenHash: input.sourceAuthorization.tokenHash,
    operationId: input.operationId,
    uid: input.uid,
    orgId: input.orgId,
    nowMs,
  });
  return { alreadyProvisioned: false, attempt };
}

async function assertTrialNotUsed(client, input) {
  const result = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM trial_redemption
        WHERE uid = $1 OR lower(email_normalized) = lower($2)
       UNION ALL
       SELECT 1 FROM subscription_event
        WHERE event_type = 'TRIAL_STARTED' AND actor_uid = $1
     ) AS already_used`,
    [input.uid, input.email],
  );
  if (result.rows[0]?.already_used === true) {
    throw databaseError("TRIAL_ALREADY_USED", true);
  }
}

async function insertOrganizationGraph(client, input) {
  const source = input.sourceAuthorization;
  const now = asDate(input.subscription.trialStartedAtMs, "TRIAL_WINDOW_INVALID");
  const trialEndsAt = asDate(input.subscription.trialEndsAtMs, "TRIAL_WINDOW_INVALID");
  const workerId = stableId("worker", input.operationId);
  const ownerLogin = `owner-${stableId("login", input.uid).slice(-16)}`;
  const displayName = `${source.owner.firstName} ${source.owner.lastName}`.trim();
  const organizationName = `Firma ${displayName}`.slice(0, 120);

  await client.query(
    `INSERT INTO organizations (
       org_id, name, status, created_at, owner_uid, owner_worker_id,
       country_code, locale, timezone, currency_code, data_region,
       onboarding_status, registration_source, organization_kind,
       created_by_uid, updated_by_uid, updated_at
     ) VALUES ($1, $2, 'ONBOARDING', $3, $4, $5, 'PL', 'pl-PL', $6,
               'PLN', 'EU', 'IN_PROGRESS', 'WEB_PASSWORD_BROKER',
               'CLEANING_PROVIDER', $4, $4, $3)`,
    [input.orgId, organizationName, now, input.uid, workerId, input.timezone],
  );
  await client.query(
    `INSERT INTO worker (
       org_id, login, worker_id, full_name, first_name, last_name,
       login_normalized, email_normalized, phone_normalized, login_email,
       auth_uid, role, role_locked, role_locked_reason, role_assigned_at,
       role_locked_at, active, email, phone, worker_type, status,
       employment_status, position, locale, timezone, invited_at,
       activated_at, created_by_uid, updated_by_uid, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $2, $7, $8, $7, $9,
               'OWNER', true, 'ORGANIZATION_OWNER', $10, $10, false, $7, $11,
               'OWNER', 'ONBOARDING', 'ACTIVE', 'Owner', 'pl-PL', $12, $10, NULL,
               $9, $9, $10, $10)`,
    [
      input.orgId,
      ownerLogin,
      workerId,
      displayName,
      source.owner.firstName,
      source.owner.lastName,
      input.email,
      source.owner.phone,
      input.uid,
      now,
      source.owner.phone,
      input.timezone,
    ],
  );
  await client.query(
    `INSERT INTO organization_member (
       org_id, uid, role, worker_id, status, consumes_seat, invited_at,
       joined_at, created_by_uid, updated_at, created_at
     ) VALUES ($1, $2, 'OWNER', $3, 'ONBOARDING', true, $4, NULL, $2, $4, $4)`,
    [input.orgId, input.uid, workerId, now],
  );
  await client.query(
    `INSERT INTO organization_company_profile (
       org_id, legal_name, registration_country_code, country_code,
       billing_email, billing_phone, created_at, updated_at
     ) VALUES ($1, '', 'PL', 'PL', $2, $3, $4, $4)`,
    [input.orgId, input.email, source.owner.phone, now],
  );
  await client.query(
    `INSERT INTO organization_subscription (
       org_id, billing_owner_uid, billing_owner_worker_id, plan_code, status,
       billing_cycle, currency_code, unit_amount_minor, total_amount_minor,
       seat_limit, trial_started_at, trial_ends_at, cancel_at_period_end,
       provider, discount_code, created_at, updated_at
     ) VALUES ($1, $2, $3, 'TRIAL', 'TRIALING', NULL, 'PLN', NULL, NULL,
               10, $4, $5, false, NULL, NULL, $4, $4)`,
    [input.orgId, input.uid, workerId, now, trialEndsAt],
  );

  for (const consent of source.consents) {
    await client.query(
      `INSERT INTO user_consent (
         consent_id, org_id, uid, consent_type, consent_version, accepted,
         accepted_at, revoked_at, locale, ip_hash, user_agent, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, $10, $11)`,
      [
        stableId("consent", `${input.operationId}:${consent.type}`),
        input.orgId,
        input.uid,
        consent.type,
        consent.version,
        consent.accepted,
        consent.acceptedAt,
        consent.locale,
        consent.ipHash,
        consent.userAgent,
        consent.createdAt,
      ],
    );
  }
  await client.query(
    `INSERT INTO trial_redemption (
       trial_redemption_id, uid, provider_id, provider_uid,
       email_normalized, org_id, redeemed_at, created_at
     ) VALUES ($1, $2, 'password', $2, $3, $4, $5, $5)`,
    [stableId("trialRedemption", input.operationId), input.uid, input.email, input.orgId, now],
  );
  await client.query(
    `INSERT INTO subscription_event (
       org_id, subscription_event_id, event_type, previous_status, new_status,
       previous_plan_code, new_plan_code, actor_uid, actor_worker_id,
       source, reason, metadata, occurred_at, created_at
     ) VALUES ($1, $2, 'TRIAL_STARTED', NULL, 'TRIALING', NULL, 'TRIAL',
               $3, $4, 'PASSWORD_REGISTRATION_BROKER', NULL, $5::jsonb, $6, $6)`,
    [
      input.orgId,
      stableId("subscriptionEvent", input.operationId),
      input.uid,
      workerId,
      JSON.stringify({
        trialDays: TRIAL_DAYS,
        trialEndsAt: trialEndsAt.toISOString(),
        selectedPlanCode: input.selectedPlanCode,
        selectedBillingCycle: input.billingCycle,
      }),
      now,
    ],
  );
  await client.query(
    `INSERT INTO audit_log (
       audit_id, org_id, actor_uid, actor_worker_id, entity_type,
       entity_id, action, ip_hash, user_agent, metadata, occurred_at
     ) VALUES ($1, $2, $3, $4, 'ORGANIZATION', $2,
               'CLEANING_PROVIDER_REGISTERED', NULL, NULL, '{}'::jsonb, $5)`,
    [stableId("audit", input.operationId), input.orgId, input.uid, workerId, now],
  );

  const projectionPayload = {
    schemaVersion: 1,
    eventType: "CLEANING_PROVIDER_REGISTERED",
    occurredAtMs: now.getTime(),
    operationId: input.operationId,
    organizationId: input.orgId,
    ownerUid: input.uid,
    organization: {
      legalName: "",
      displayName: organizationName,
      kind: "cleaning_provider",
      status: "onboarding",
    },
    membership: { role: "owner", status: "onboarding" },
    profile: { status: "onboarding" },
  };
  await client.query(
    `INSERT INTO cleanzi_registration_projection_outbox (
       event_id, operation_id, event_type, org_id, uid, state,
       payload, attempts, available_at, created_at, updated_at
     ) VALUES ($1, $2, 'CLEANING_PROVIDER_REGISTERED', $3, $4,
               'PENDING', $5::jsonb, 0, $6, $6, $6)`,
    [stableId("projection", input.operationId), input.operationId, input.orgId, input.uid, JSON.stringify(projectionPayload), now],
  );
  await client.query(
    `UPDATE registration_attempt
        SET status = 'AUTH_CREATED', current_step = 'ACCOUNT', uid = $2,
            org_id = $3, auth_provider = 'password', provider_uid = $2,
            auth_bound_at = COALESCE(auth_bound_at, $4), access_token_hash = NULL,
            broker_operation_id = $5, organization_kind = 'CLEANING_PROVIDER',
            user_step_completed_at = COALESCE(user_step_completed_at, $4),
            updated_at = $4, error_code = NULL, error_message = NULL
      WHERE registration_id = $1
        AND uid IS NULL AND org_id IS NULL
        AND access_token_hash = $6`,
    [source.registrationId, input.uid, input.orgId, now, input.operationId, source.tokenHash],
  );
}

async function reconcileAfterUnknownCommit(pool, input) {
  let client;
  try {
    client = await pool.connect();
    const existing = await loadProvisioned(client, input);
    return existing ? provisionedResult(existing, input) : null;
  } catch {
    return null;
  } finally {
    client?.release();
  }
}

export function createPostgresCleaningCompanyProvisioner({
  pool,
  now = () => Date.now(),
}) {
  if (typeof pool?.connect !== "function") {
    throw new RegistrationGateError("POSTGRES_POOL_REQUIRED");
  }
  return Object.freeze({
    async provisionCleaningCompany(input) {
      const source = validateInput(input);
      let client;
      let began = false;
      let commitAttempted = false;
      try {
        client = await pool.connect();
        await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
        began = true;

        const sourceState = await lockAndRevalidateSource(
          client,
          input,
          normalizedNow(now()),
        );
        if (sourceState.alreadyProvisioned || source.alreadyProvisioned) {
          const existing = await loadProvisioned(client, input);
          const result = provisionedResult(existing, input, { createdNow: false });
          commitAttempted = true;
          await client.query("COMMIT");
          began = false;
          return result;
        }

        await assertTrialNotUsed(client, input);
        await insertOrganizationGraph(client, input);
        const persisted = await loadProvisioned(client, input);
        const result = provisionedResult(persisted, input, { createdNow: true });
        commitAttempted = true;
        await client.query("COMMIT");
        began = false;
        return result;
      } catch (cause) {
        if (began && !commitAttempted) {
          try {
            await client.query("ROLLBACK");
          } catch {
            // No COMMIT was issued, so PostgreSQL cannot persist this transaction.
          }
          if (cause instanceof RegistrationGateError) {
            cause.safeToCompensateAuth = true;
            throw cause;
          }
          throw databaseError("DATABASE_TRANSACTION_ROLLED_BACK", true, cause);
        }
        if (commitAttempted) {
          const recovered = await reconcileAfterUnknownCommit(pool, input);
          if (recovered) return recovered;
          throw databaseError("DATABASE_COMMIT_RESULT_UNKNOWN", false, cause);
        }
        throw databaseError("DATABASE_UNAVAILABLE_BEFORE_TRANSACTION", true, cause);
      } finally {
        client?.release();
      }
    },
  });
}

export const __test = Object.freeze({
  TRIAL_DAYS,
  TRIAL_DURATION_MS,
  provisionedResult,
  stableId,
});
