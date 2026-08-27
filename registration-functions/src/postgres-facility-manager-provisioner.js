import { createHash } from "node:crypto";
import {
  FacilityManagerRegistrationError,
  facilityManagerRequiredText,
  normalizeFacilityManagerRegistrationEmail,
  normalizeFacilityManagerRegistrationNow,
} from "./facility-manager-registration-core.js";

const ORGANIZATION_KIND = "FACILITY_MANAGER";
const REGISTRATION_SOURCE = "GOOGLE_FEDERATED";
const REGISTRATION_AUDIT_ACTION = "FACILITY_MANAGER_REGISTERED";
const GOOGLE_IDENTITY_PROVIDER_ID = "google.com";
const DEFAULT_LOCALE = "pl-PL";
const DEFAULT_TIMEZONE = "Europe/Warsaw";
const GOOGLE_IDENTITY_KEY_PATTERN = /^fmgi_[A-Za-z0-9_-]{43}$/;

function stableId(prefix, source) {
  const digest = createHash("sha256").update(source, "utf8").digest("hex").slice(0, 32);
  return `${prefix}_${digest}`;
}

function databaseError(code, safeToCompensateAuth, cause) {
  const error = new FacilityManagerRegistrationError(code);
  error.safeToCompensateAuth = safeToCompensateAuth;
  if (cause) error.cause = cause;
  return error;
}

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizedStoredEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function asDate(value, code) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw databaseError(code, false);
  return date;
}

function registrationAuditId(operationId) {
  return stableId("fmreg", operationId);
}

function normalizedOrganizationName(value) {
  const name = typeof value === "string" ? value.normalize("NFC").trim() : "";
  if (!name || name.length > 120) throw new FacilityManagerRegistrationError("INVALID_ORGANIZATION_NAME");
  return name;
}

function normalizedStoredOrganizationName(value) {
  const name = typeof value === "string" ? value.normalize("NFC").trim() : "";
  return name && name.length <= 120 && name === value ? name : "";
}

function normalizedGoogleIdentityKey(value) {
  const key = facilityManagerRequiredText(value, "INVALID_GOOGLE_IDENTITY_KEY", 64);
  if (!GOOGLE_IDENTITY_KEY_PATTERN.test(key)) {
    throw new FacilityManagerRegistrationError("INVALID_GOOGLE_IDENTITY_KEY");
  }
  return key;
}

function normalizedStoredText(value, maxLength) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= maxLength ? text : "";
}

function isGoogleProvider(value) {
  return String(value ?? "").trim().toLowerCase() === GOOGLE_IDENTITY_PROVIDER_ID;
}

function validateInput(input) {
  return Object.freeze({
    operationId: facilityManagerRequiredText(input?.operationId, "INVALID_OPERATION_ID", 160),
    organizationId: facilityManagerRequiredText(input?.organizationId, "INVALID_ORG_ID", 64),
    organizationName: normalizedOrganizationName(input?.organizationName),
    ownerUid: facilityManagerRequiredText(input?.ownerUid, "INVALID_UID", 128),
    ownerEmail: normalizeFacilityManagerRegistrationEmail(input?.ownerEmail),
    ownerGoogleIdentityKey: normalizedGoogleIdentityKey(input?.ownerGoogleIdentityKey),
  });
}

function provisionedResult(row, expected, { createdNow = false, resolveExistingIdentity = false } = {}) {
  if (!row) throw databaseError("FACILITY_MANAGER_PROVISIONING_RESULT_MISSING", false);

  const storedOperationId = normalizedStoredText(row.identity_operation_id, 160);
  const storedOrganizationId = normalizedStoredText(row.identity_org_id, 64);
  const storedOrganizationName = normalizedStoredOrganizationName(row.organization_name);
  const expectedOperationId = resolveExistingIdentity ? storedOperationId : expected.operationId;
  const expectedOrganizationId = resolveExistingIdentity ? storedOrganizationId : expected.organizationId;
  const expectedOrganizationName = resolveExistingIdentity ? storedOrganizationName : expected.organizationName;
  const expectedAuditId = registrationAuditId(expectedOperationId);
  const expectedWorkerId = stableId("worker", expectedOperationId);

  if (
    row.identity_google_identity_key === expected.ownerGoogleIdentityKey &&
    isGoogleProvider(row.identity_provider_id) &&
    (
      row.identity_owner_uid !== expected.ownerUid ||
      row.audit_owner_uid !== expected.ownerUid ||
      row.organization_owner_uid !== expected.ownerUid ||
      row.worker_auth_uid !== expected.ownerUid ||
      row.member_uid !== expected.ownerUid
    )
  ) {
    throw databaseError("FACILITY_MANAGER_GOOGLE_UID_BINDING_MISMATCH", false);
  }

  if (
    !storedOperationId ||
    !storedOrganizationId ||
    !storedOrganizationName ||
    row.identity_google_identity_key !== expected.ownerGoogleIdentityKey ||
    !isGoogleProvider(row.identity_provider_id) ||
    row.identity_owner_uid !== expected.ownerUid ||
    row.identity_org_id !== expectedOrganizationId ||
    row.identity_operation_id !== expectedOperationId ||
    row.identity_registration_audit_id !== expectedAuditId ||
    row.audit_id !== expectedAuditId ||
    row.audit_org_id !== expectedOrganizationId ||
    row.audit_owner_uid !== expected.ownerUid ||
    row.audit_owner_worker_id !== expectedWorkerId ||
    row.audit_action !== REGISTRATION_AUDIT_ACTION ||
    row.organization_id !== expectedOrganizationId ||
    row.organization_name !== expectedOrganizationName ||
    upper(row.organization_kind) !== ORGANIZATION_KIND ||
    upper(row.registration_source) !== REGISTRATION_SOURCE ||
    upper(row.organization_status) !== "ACTIVE" ||
    upper(row.onboarding_status) !== "COMPLETED" ||
    row.organization_owner_uid !== expected.ownerUid ||
    row.organization_owner_worker_id !== expectedWorkerId ||
    row.worker_id !== expectedWorkerId ||
    row.worker_auth_uid !== expected.ownerUid ||
    normalizedStoredEmail(row.worker_email) !== expected.ownerEmail ||
    upper(row.worker_role) !== "OWNER" ||
    row.worker_active !== true ||
    upper(row.worker_status) !== "ACTIVE" ||
    row.member_uid !== expected.ownerUid ||
    row.member_worker_id !== expectedWorkerId ||
    upper(row.member_role) !== "OWNER" ||
    upper(row.member_status) !== "ACTIVE"
  ) {
    throw databaseError("FACILITY_MANAGER_PROVISIONING_MISMATCH", false);
  }
  return Object.freeze({
    organizationId: row.organization_id,
    organizationName: storedOrganizationName,
    organizationKind: ORGANIZATION_KIND,
    workerId: row.worker_id,
    createdNow,
  });
}

async function lockGoogleIdentity(client, input) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text))", [input.ownerGoogleIdentityKey]);
}

async function loadProvisionedByGoogleIdentity(client, input) {
  const result = await client.query(
    `SELECT fmgi.google_identity_key AS identity_google_identity_key,
            fmgi.provider_id AS identity_provider_id,
            fmgi.org_id AS identity_org_id,
            fmgi.registration_operation_id AS identity_operation_id,
            fmgi.registration_audit_id AS identity_registration_audit_id,
            fmgi.owner_uid AS identity_owner_uid,
            al.audit_id,
            al.org_id AS audit_org_id,
            al.actor_uid AS audit_owner_uid,
            al.actor_worker_id AS audit_owner_worker_id,
            al.action AS audit_action,
            o.org_id AS organization_id,
            o.name AS organization_name,
            o.organization_kind,
            o.registration_source,
            o.status AS organization_status,
            o.onboarding_status,
            o.owner_uid AS organization_owner_uid,
            o.owner_worker_id AS organization_owner_worker_id,
            w.worker_id,
            w.auth_uid AS worker_auth_uid,
            w.email AS worker_email,
            w.role AS worker_role,
            w.active AS worker_active,
            w.status AS worker_status,
            m.uid AS member_uid,
            m.worker_id AS member_worker_id,
            m.role AS member_role,
            m.status AS member_status
       FROM facility_manager_google_identity fmgi
       JOIN audit_log al ON al.audit_id = fmgi.registration_audit_id
       JOIN organizations o ON o.org_id = fmgi.org_id AND al.org_id = fmgi.org_id
       JOIN worker w ON w.org_id = o.org_id AND w.worker_id = al.actor_worker_id
       JOIN organization_member m
         ON m.org_id = o.org_id
        AND m.uid = fmgi.owner_uid
        AND m.worker_id = al.actor_worker_id
      WHERE fmgi.google_identity_key = $1
      FOR UPDATE OF fmgi, al, o, w, m`,
    [input.ownerGoogleIdentityKey],
  );
  return result.rows[0] || null;
}

async function insertOrganizationGraph(client, input, now) {
  const workerId = stableId("worker", input.operationId);
  const ownerLogin = `owner-${stableId("login", input.ownerUid).slice(-16)}`;
  await client.query(
    `INSERT INTO organizations (
       org_id, name, status, created_at, owner_uid, owner_worker_id,
       country_code, locale, timezone, currency_code, data_region,
       onboarding_status, registration_source, organization_kind,
       created_by_uid, updated_by_uid, updated_at
     ) VALUES ($1, $2, 'ACTIVE', $3, $4, $5, 'PL', 'pl-PL', 'Europe/Warsaw',
               'PLN', 'EU', 'COMPLETED', 'GOOGLE_FEDERATED', 'FACILITY_MANAGER',
               $4, $4, $3)`,
    [input.organizationId, input.organizationName, now, input.ownerUid, workerId],
  );
  await client.query(
    `INSERT INTO worker (
       org_id, login, worker_id, worker_id_normalized, full_name, first_name, last_name,
       login_normalized, email_normalized, phone_normalized, login_email,
       auth_uid, role, role_locked, role_locked_reason, role_assigned_at,
       role_locked_at, active, email, phone, worker_type, status,
       employment_status, position, locale, timezone, invited_at,
       activated_at, created_by_uid, updated_by_uid, created_at, updated_at
     ) VALUES ($1, $2, $3, lower($3), $4, NULL, NULL, $2, $5, NULL, $5, $6,
               'OWNER', true, 'ORGANIZATION_OWNER', $7, $7, true, $5, NULL,
               'OWNER', 'ACTIVE', 'ACTIVE', 'Owner', 'pl-PL', 'Europe/Warsaw',
               $7, $7, $6, $6, $7, $7)`,
    [input.organizationId, ownerLogin, workerId, input.ownerEmail, input.ownerEmail, input.ownerUid, now],
  );
  await client.query(
    `INSERT INTO organization_member (
       org_id, uid, role, worker_id, status, consumes_seat, invited_at,
       joined_at, created_by_uid, updated_at, created_at
     ) VALUES ($1, $2, 'OWNER', $3, 'ACTIVE', true, $4, $4, $2, $4, $4)`,
    [input.organizationId, input.ownerUid, workerId, now],
  );
  await client.query(
    `INSERT INTO audit_log (
       audit_id, org_id, actor_uid, actor_worker_id, entity_type,
       entity_id, action, ip_hash, user_agent, metadata, occurred_at
     ) VALUES ($1, $2, $3, $4, 'ORGANIZATION', $2,
               'FACILITY_MANAGER_REGISTERED', NULL, NULL,
               '{"channel":"FACILITY_MANAGER","provider":"google.com"}'::jsonb, $5)`,
    [registrationAuditId(input.operationId), input.organizationId, input.ownerUid, workerId, now],
  );
  await client.query(
    `INSERT INTO facility_manager_google_identity (
       google_identity_key, provider_id, org_id, registration_operation_id,
       registration_audit_id, owner_uid, created_at
     ) VALUES ($1, 'google.com', $2, $3, $4, $5, $6)`,
    [
      input.ownerGoogleIdentityKey,
      input.organizationId,
      input.operationId,
      registrationAuditId(input.operationId),
      input.ownerUid,
      now,
    ],
  );
}

async function reconcile(pool, input) {
  let client;
  try {
    client = await pool.connect();
    const existing = await loadProvisionedByGoogleIdentity(client, input);
    return existing ? provisionedResult(existing, input, { resolveExistingIdentity: true }) : null;
  } catch (error) {
    if (error instanceof FacilityManagerRegistrationError && error.safeToCompensateAuth === false) throw error;
    return null;
  } finally {
    client?.release();
  }
}

export function createPostgresFacilityManagerProvisioner({ pool, now = () => Date.now() }) {
  if (typeof pool?.connect !== "function") {
    throw new FacilityManagerRegistrationError("POSTGRES_POOL_REQUIRED");
  }
  return Object.freeze({
    async provisionFacilityManager(rawInput) {
      const input = validateInput(rawInput);
      const occurredAt = asDate(normalizeFacilityManagerRegistrationNow(now()), "INVALID_NOW");
      let client;
      let began = false;
      let commitAttempted = false;
      try {
        client = await pool.connect();
        await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
        began = true;
        await lockGoogleIdentity(client, input);
        const existing = await loadProvisionedByGoogleIdentity(client, input);
        if (existing) {
          const result = provisionedResult(existing, input, { createdNow: false, resolveExistingIdentity: true });
          commitAttempted = true;
          await client.query("COMMIT");
          began = false;
          return result;
        }
        await insertOrganizationGraph(client, input, occurredAt);
        const persisted = await loadProvisionedByGoogleIdentity(client, input);
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
          const recovered = await reconcile(pool, input);
          if (recovered) return recovered;
          if (cause instanceof FacilityManagerRegistrationError) {
            if (cause.safeToCompensateAuth !== false) cause.safeToCompensateAuth = true;
            throw cause;
          }
          throw databaseError("DATABASE_TRANSACTION_ROLLED_BACK", true, cause);
        }
        if (commitAttempted) {
          const recovered = await reconcile(pool, input);
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
  DEFAULT_LOCALE,
  DEFAULT_TIMEZONE,
  ORGANIZATION_KIND,
  REGISTRATION_AUDIT_ACTION,
  REGISTRATION_SOURCE,
  provisionedResult,
  registrationAuditId,
  stableId,
});
