import assert from "node:assert/strict";
import test from "node:test";
import {
  __test,
  createPostgresFacilityManagerProvisioner,
} from "../src/postgres-facility-manager-provisioner.js";

function command() {
  return {
    operationId: "fmreg_1234567890123456789012345678901234567890123",
    organizationId: "org_fm_1234567890123456789012345678901234567890123",
    organizationName: "Panel zarządcy",
    ownerUid: "firebase-uid-1",
    ownerEmail: "owner@example.test",
    ownerGoogleIdentityKey: `fmgi_${"A".repeat(43)}`,
  };
}

function persistedRow(input) {
  const workerId = __test.stableId("worker", input.operationId);
  return {
    identity_google_identity_key: input.ownerGoogleIdentityKey,
    identity_provider_id: "google.com",
    identity_org_id: input.organizationId,
    identity_operation_id: input.operationId,
    identity_registration_audit_id: __test.registrationAuditId(input.operationId),
    identity_owner_uid: input.ownerUid,
    audit_id: __test.registrationAuditId(input.operationId),
    audit_org_id: input.organizationId,
    audit_owner_uid: input.ownerUid,
    audit_owner_worker_id: workerId,
    audit_action: "FACILITY_MANAGER_REGISTERED",
    organization_id: input.organizationId,
    organization_name: input.organizationName,
    organization_kind: "FACILITY_MANAGER",
    registration_source: "GOOGLE_FEDERATED",
    organization_status: "ACTIVE",
    onboarding_status: "COMPLETED",
    organization_owner_uid: input.ownerUid,
    organization_owner_worker_id: workerId,
    worker_id: workerId,
    worker_auth_uid: input.ownerUid,
    worker_email: input.ownerEmail,
    worker_role: "OWNER",
    worker_active: true,
    worker_status: "ACTIVE",
    member_uid: input.ownerUid,
    member_worker_id: workerId,
    member_role: "OWNER",
    member_status: "ACTIVE",
  };
}

test("provisioner writes a serializable manager graph and direct worker normalization", async () => {
  const queries = [];
  const input = command();
  let graphInserted = false;
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.includes("FROM facility_manager_google_identity")) {
        return { rows: graphInserted ? [persistedRow(input)] : [] };
      }
      if (sql.includes("INSERT INTO facility_manager_google_identity")) graphInserted = true;
      return { rows: [] };
    },
    release() {},
  };
  const provisioner = createPostgresFacilityManagerProvisioner({
    pool: { async connect() { return client } },
    now: () => 1_735_689_600_000,
  });

  const result = await provisioner.provisionFacilityManager(input);

  assert.equal(result.createdNow, true)
  assert.equal(result.organizationId, input.organizationId)
  assert.ok(queries.some(({ sql }) => sql.includes("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE")))
  assert.ok(queries.some(({ sql }) => sql.includes("INSERT INTO facility_manager_google_identity")))
  assert.ok(queries.some(({ sql }) => sql.includes("COMMIT")))
  const workerInsert = queries.find(({ sql }) => sql.includes("INSERT INTO worker"))?.sql || ""
  assert.match(workerInsert, /worker_id_normalized/)
  assert.match(workerInsert, /lower\(\$3\)/)
})

test("existing Google identity is replayed rather than creating a second graph", async () => {
  const input = command();
  const queries = [];
  const client = {
    async query(sql, values) {
      queries.push({ sql, values });
      if (sql.includes("FROM facility_manager_google_identity")) return { rows: [persistedRow(input)] };
      return { rows: [] };
    },
    release() {},
  };
  const provisioner = createPostgresFacilityManagerProvisioner({
    pool: { async connect() { return client } },
    now: () => 1_735_689_600_000,
  });

  const result = await provisioner.provisionFacilityManager(input);

  assert.equal(result.createdNow, false)
  assert.equal(queries.some(({ sql }) => sql.includes("INSERT INTO organizations")), false)
})
