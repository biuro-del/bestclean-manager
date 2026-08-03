import { createHash } from "node:crypto";
import { RegistrationGateError, normalizedNow, requiredText } from "./registration-contract.js";

function publicErrorCode(error) {
  return String(error?.code || error?.message || "PROJECTION_FAILED").slice(0, 120);
}

function stableEventId(source) {
  return `projection_${createHash("sha256").update(source, "utf8").digest("hex").slice(0, 32)}`;
}

export async function enqueueCleaningProviderActivation({
  client,
  organizationId,
  ownerUid,
  activationOperationId,
  occurredAtMs = Date.now(),
}) {
  if (typeof client?.query !== "function") {
    throw new RegistrationGateError("POSTGRES_CLIENT_REQUIRED");
  }
  const orgId = requiredText(organizationId, "INVALID_ORG_ID", 64);
  const uid = requiredText(ownerUid, "INVALID_UID", 128);
  const operationId = requiredText(activationOperationId, "INVALID_OPERATION_ID", 160);
  const occurredAt = new Date(normalizedNow(occurredAtMs));
  const result = await client.query(
    `SELECT o.org_id, o.name, o.status, o.onboarding_status,
            o.organization_kind, p.legal_name, m.role, m.status AS member_status
       FROM organizations o
       JOIN organization_company_profile p ON p.org_id = o.org_id
       JOIN organization_member m ON m.org_id = o.org_id AND m.uid = $2
      WHERE o.org_id = $1
      FOR UPDATE`,
    [orgId, uid],
  );
  const row = result.rows[0];
  if (!row) throw new RegistrationGateError("PROVIDER_ORGANIZATION_NOT_FOUND");
  const legalName = String(row.legal_name || "").trim();
  if (
    String(row.organization_kind || "").toUpperCase() !== "CLEANING_PROVIDER" ||
    String(row.onboarding_status || "").toUpperCase() !== "COMPLETED" ||
    String(row.role || "").toUpperCase() !== "OWNER" ||
    String(row.member_status || "").toUpperCase() !== "ACTIVE" ||
    legalName.length < 2
  ) {
    throw new RegistrationGateError("PROVIDER_ONBOARDING_INCOMPLETE");
  }
  const eventId = stableEventId(operationId);
  const payload = {
    schemaVersion: 1,
    eventType: "CLEANING_PROVIDER_ACTIVATED",
    operationId,
    occurredAtMs: occurredAt.getTime(),
    organizationId: orgId,
    ownerUid: uid,
    organization: {
      legalName,
      displayName: String(row.name || legalName).trim() || legalName,
      kind: "cleaning_provider",
      status: "active",
    },
    membership: { role: "owner", status: "active" },
    profile: { status: "active" },
  };
  const insertResult = await client.query(
    `INSERT INTO cleanzi_registration_projection_outbox (
       event_id, operation_id, event_type, org_id, uid, state,
       payload, attempts, available_at, created_at, updated_at
     ) VALUES ($1, $2, 'CLEANING_PROVIDER_ACTIVATED', $3, $4,
               'PENDING', $5::jsonb, 0, $6, $6, $6)
     ON CONFLICT (operation_id) DO UPDATE
       SET updated_at = cleanzi_registration_projection_outbox.updated_at
       WHERE cleanzi_registration_projection_outbox.event_id = EXCLUDED.event_id
         AND cleanzi_registration_projection_outbox.event_type = EXCLUDED.event_type
         AND cleanzi_registration_projection_outbox.org_id = EXCLUDED.org_id
         AND cleanzi_registration_projection_outbox.uid = EXCLUDED.uid
     RETURNING event_id`,
    [eventId, operationId, orgId, uid, JSON.stringify(payload), occurredAt],
  );
  if (insertResult.rowCount !== 1) {
    throw new RegistrationGateError("ACTIVATION_IDEMPOTENCY_CONFLICT");
  }
  return Object.freeze({ eventId, operationId, organizationId: orgId, ownerUid: uid });
}

export function createPostgresRegistrationProjectionOutbox({
  pool,
  workerId,
  leaseMs = 60_000,
  now = () => Date.now(),
}) {
  if (typeof pool?.connect !== "function") {
    throw new RegistrationGateError("POSTGRES_POOL_REQUIRED");
  }
  const owner = requiredText(workerId, "INVALID_OUTBOX_WORKER_ID", 160);
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 5_000 || leaseMs > 15 * 60_000) {
    throw new RegistrationGateError("INVALID_OUTBOX_LEASE");
  }

  return Object.freeze({
    async claimBatch({ limit = 20 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new RegistrationGateError("INVALID_OUTBOX_BATCH_SIZE");
      }
      const nowDate = new Date(normalizedNow(now()));
      const leaseExpiresAt = new Date(nowDate.getTime() + leaseMs);
      const result = await pool.query(
        `WITH ready AS (
           SELECT event_id
             FROM cleanzi_registration_projection_outbox
            WHERE (
              state IN ('PENDING', 'FAILED') AND available_at <= $1
            ) OR (
              state = 'LEASED' AND lease_expires_at <= $1
            )
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT $2
         )
         UPDATE cleanzi_registration_projection_outbox ob
            SET state = 'LEASED', lease_owner = $3, lease_expires_at = $4,
                attempts = attempts + 1, updated_at = $1
           FROM ready
          WHERE ob.event_id = ready.event_id
         RETURNING ob.event_id, ob.operation_id, ob.event_type, ob.org_id,
                   ob.uid, ob.payload, ob.attempts`,
        [nowDate, limit, owner, leaseExpiresAt],
      );
      return result.rows.map((row) => ({
        ...row,
        payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
      }));
    },

    async markDelivered(eventId) {
      const result = await pool.query(
        `UPDATE cleanzi_registration_projection_outbox
            SET state = 'DELIVERED', delivered_at = $3, lease_owner = NULL,
                lease_expires_at = NULL, last_error_code = NULL, updated_at = $3
          WHERE event_id = $1 AND state = 'LEASED' AND lease_owner = $2
          RETURNING event_id`,
        [requiredText(eventId, "INVALID_EVENT_ID", 64), owner, new Date(normalizedNow(now()))],
      );
      if (result.rowCount !== 1) {
        throw new RegistrationGateError("OUTBOX_LEASE_LOST");
      }
    },

    async markFailed(eventId, error, { retryDelayMs = 30_000 } = {}) {
      if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 1_000 || retryDelayMs > 24 * 60 * 60_000) {
        throw new RegistrationGateError("INVALID_OUTBOX_RETRY_DELAY");
      }
      const nowMs = normalizedNow(now());
      const result = await pool.query(
        `UPDATE cleanzi_registration_projection_outbox
            SET state = 'FAILED', available_at = $4, lease_owner = NULL,
                lease_expires_at = NULL, last_error_code = $3, updated_at = $5
          WHERE event_id = $1 AND state = 'LEASED' AND lease_owner = $2
          RETURNING event_id`,
        [
          requiredText(eventId, "INVALID_EVENT_ID", 64),
          owner,
          publicErrorCode(error),
          new Date(nowMs + retryDelayMs),
          new Date(nowMs),
        ],
      );
      if (result.rowCount !== 1) {
        throw new RegistrationGateError("OUTBOX_LEASE_LOST");
      }
    },
  });
}

export function createCleaningProviderProjectionReconciler({
  outbox,
  projector,
  retryDelayMs = 30_000,
}) {
  if (typeof outbox?.claimBatch !== "function" ||
      typeof outbox?.markDelivered !== "function" ||
      typeof outbox?.markFailed !== "function") {
    throw new RegistrationGateError("PROJECTION_OUTBOX_REQUIRED");
  }
  if (typeof projector?.project !== "function") {
    throw new RegistrationGateError("PROJECTION_PROJECTOR_REQUIRED");
  }
  return Object.freeze({
    async runOnce({ limit = 20 } = {}) {
      const events = await outbox.claimBatch({ limit });
      const result = { claimed: events.length, delivered: 0, failed: 0 };
      for (const event of events) {
        try {
          await projector.project(event);
          await outbox.markDelivered(event.event_id);
          result.delivered += 1;
        } catch (error) {
          await outbox.markFailed(event.event_id, error, { retryDelayMs });
          result.failed += 1;
        }
      }
      return Object.freeze(result);
    },
  });
}
