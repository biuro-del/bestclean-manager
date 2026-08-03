import assert from "node:assert/strict";
import test from "node:test";
import {
  createFirestoreCleaningProviderProjector,
} from "../src/firestore-cleaning-provider-projector.js";
import {
  createCleaningProviderProjectionReconciler,
  enqueueCleaningProviderActivation,
} from "../src/postgres-registration-projection-outbox.js";

function firestoreFake() {
  const documents = new Map();
  function ref(path) {
    return {
      path,
      collection(name) { return collection(`${path}/${name}`); },
    };
  }
  function collection(path) {
    return {
      doc(id) { return ref(`${path}/${id}`); },
    };
  }
  return {
    documents,
    collection,
    async runTransaction(callback) {
      const transaction = {
        async get(documentRef) {
          const exists = documents.has(documentRef.path);
          return {
            exists,
            data() { return exists ? structuredClone(documents.get(documentRef.path)) : undefined; },
          };
        },
        set(documentRef, value, options) {
          const current = options?.merge ? documents.get(documentRef.path) || {} : {};
          documents.set(documentRef.path, { ...structuredClone(current), ...structuredClone(value) });
        },
      };
      return callback(transaction);
    },
  };
}

function event({
  eventType = "CLEANING_PROVIDER_REGISTERED",
  orgId = "org_reg_1001",
  uid = "reg_uid_1001",
  legalName = "",
  operationId = "preg_operation_1001",
} = {}) {
  return {
    event_id: `projection_${operationId}`,
    operation_id: operationId,
    event_type: eventType,
    org_id: orgId,
    uid,
    payload: {
      schemaVersion: 1,
      eventType,
      operationId,
      occurredAtMs: Date.parse("2026-08-02T08:00:00.000Z"),
      organizationId: orgId,
      ownerUid: uid,
      organization: {
        legalName,
        displayName: legalName || "Firma Rafał Żółć",
        kind: "cleaning_provider",
        status: eventType === "CLEANING_PROVIDER_ACTIVATED" ? "active" : "onboarding",
      },
      membership: {
        role: "owner",
        status: eventType === "CLEANING_PROVIDER_ACTIVATED" ? "active" : "onboarding",
      },
      profile: { status: eventType === "CLEANING_PROVIDER_ACTIVATED" ? "active" : "onboarding" },
    },
  };
}

function invitationContractSatisfied({ organization, membership, profile, uid }) {
  return profile?.status === "active" &&
    organization?.kind === "cleaning_provider" &&
    organization?.status === "active" &&
    typeof organization?.legalName === "string" && organization.legalName.length >= 2 &&
    membership?.organizationId === profile.defaultOrganizationId &&
    membership?.userId === uid && membership?.status === "active" &&
    ["owner", "admin"].includes(membership?.role);
}

test("initial projection is idempotent but cannot authorize invitations before onboarding", async () => {
  const db = firestoreFake();
  const projector = createFirestoreCleaningProviderProjector({ db });
  await projector.project(event());
  await projector.project(event());
  const organization = db.documents.get("organizations/org_reg_1001");
  const membership = db.documents.get("organizations/org_reg_1001/members/reg_uid_1001");
  const profile = db.documents.get("cleaningProviderProfiles/reg_uid_1001");
  assert.equal(organization.status, "onboarding");
  assert.equal(profile.status, "onboarding");
  assert.equal(membership.role, "owner");
  assert.equal(membership.status, "onboarding");
  assert.equal(invitationContractSatisfied({ organization, membership, profile, uid: "reg_uid_1001" }), false);
});

test("activation with a real legal name produces the exact invitation-backend profile", async () => {
  const db = firestoreFake();
  const projector = createFirestoreCleaningProviderProjector({ db });
  await projector.project(event());
  await projector.project(event({
    eventType: "CLEANING_PROVIDER_ACTIVATED",
    legalName: "Żółw Clean sp. z o.o.",
    operationId: "preg_operation_1001_activation",
  }));
  const organization = db.documents.get("organizations/org_reg_1001");
  const membership = db.documents.get("organizations/org_reg_1001/members/reg_uid_1001");
  const profile = db.documents.get("cleaningProviderProfiles/reg_uid_1001");
  assert.equal(organization.legalName, "Żółw Clean sp. z o.o.");
  assert.equal(invitationContractSatisfied({ organization, membership, profile, uid: "reg_uid_1001" }), true);
});

test("a delayed registration projection cannot regress an already active provider", async () => {
  const db = firestoreFake();
  const projector = createFirestoreCleaningProviderProjector({ db });
  await projector.project(event({
    eventType: "CLEANING_PROVIDER_ACTIVATED",
    legalName: "Żółw Clean sp. z o.o.",
    operationId: "preg_operation_1001_activation",
  }));
  const result = await projector.project(event({
    operationId: "preg_operation_1001_delayed_registration",
  }));
  const organization = db.documents.get("organizations/org_reg_1001");
  const membership = db.documents.get("organizations/org_reg_1001/members/reg_uid_1001");
  const profile = db.documents.get("cleaningProviderProfiles/reg_uid_1001");
  assert.equal(result.status, "active");
  assert.equal(organization.status, "active");
  assert.equal(organization.legalName, "Żółw Clean sp. z o.o.");
  assert.equal(organization.displayName, "Żółw Clean sp. z o.o.");
  assert.equal(organization.projectionOperationId, "preg_operation_1001_activation");
  assert.equal(membership.projectionOperationId, "preg_operation_1001_activation");
  assert.equal(profile.status, "active");
  assert.equal(profile.projectionOperationId, "preg_operation_1001_activation");
});

test("a second organization never silently replaces an existing default organization", async () => {
  const db = firestoreFake();
  const projector = createFirestoreCleaningProviderProjector({ db });
  await projector.project(event({
    eventType: "CLEANING_PROVIDER_ACTIVATED",
    legalName: "Pierwsza sp. z o.o.",
  }));
  await projector.project(event({
    orgId: "org_reg_2002",
    operationId: "preg_operation_2002",
  }));
  assert.equal(
    db.documents.get("cleaningProviderProfiles/reg_uid_1001").defaultOrganizationId,
    "org_reg_1001",
  );
});

test("reconciler records Firestore failure without undoing authoritative SQL and succeeds later", async () => {
  const sqlOrganization = { orgId: "org_reg_1001", trialStartedAtMs: Date.now() };
  const queue = [event()];
  let shouldFail = true;
  let failed = 0;
  let delivered = 0;
  const outbox = {
    async claimBatch() { return queue.splice(0, queue.length); },
    async markDelivered() { delivered += 1; },
    async markFailed(_eventId, _error) { failed += 1; queue.push(event()); },
  };
  const projector = {
    async project() {
      if (shouldFail) throw new Error("FIRESTORE_UNAVAILABLE");
    },
  };
  const reconciler = createCleaningProviderProjectionReconciler({ outbox, projector });
  assert.deepEqual(await reconciler.runOnce(), { claimed: 1, delivered: 0, failed: 1 });
  assert.equal(sqlOrganization.orgId, "org_reg_1001");
  shouldFail = false;
  assert.deepEqual(await reconciler.runOnce(), { claimed: 1, delivered: 1, failed: 0 });
  assert.equal(delivered, 1);
  assert.equal(failed, 1);
  assert.equal(sqlOrganization.trialStartedAtMs > 0, true);
});

test("activation event can be enqueued only after authoritative onboarding is complete", async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes("FROM organizations o")) {
        return { rows: [{
          org_id: "org_reg_1001",
          name: "Żółw Clean",
          status: "TRIAL",
          onboarding_status: "COMPLETED",
          organization_kind: "CLEANING_PROVIDER",
          legal_name: "Żółw Clean sp. z o.o.",
          role: "OWNER",
          worker_id: "worker_owner_1001",
          member_status: "ONBOARDING",
        }] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  const result = await enqueueCleaningProviderActivation({
    client,
    organizationId: "org_reg_1001",
    ownerUid: "reg_uid_1001",
    decodedToken: { uid: "reg_uid_1001", email_verified: true },
    activationOperationId: "provider_activation_1001",
    occurredAtMs: Date.parse("2026-08-02T09:00:00.000Z"),
  });
  assert.equal(result.organizationId, "org_reg_1001");
  const insert = calls.find((call) => call.sql.includes("INSERT INTO cleanzi_registration_projection_outbox"));
  assert.match(insert.params[4], /CLEANING_PROVIDER_ACTIVATED/);
  assert.match(insert.params[4], /Żółw Clean sp\. z o\.o\./);
  assert.doesNotMatch(insert.params[4], /@/);
  assert.equal(calls.some((call) => sqlText(call.sql).startsWith("UPDATE organizations")), true);
  assert.equal(calls.some((call) => sqlText(call.sql).startsWith("UPDATE organization_member")), true);
  assert.equal(calls.some((call) => sqlText(call.sql).startsWith("UPDATE worker")), true);

  const incompleteClient = {
    async query(sql) {
      if (sql.includes("FROM organizations o")) {
        return { rows: [{
          organization_kind: "CLEANING_PROVIDER",
          onboarding_status: "IN_PROGRESS",
          legal_name: "",
          role: "OWNER",
          worker_id: "worker_owner_1001",
          member_status: "ONBOARDING",
        }] };
      }
      return { rows: [] };
    },
  };
  await assert.rejects(enqueueCleaningProviderActivation({
    client: incompleteClient,
    organizationId: "org_reg_1001",
    ownerUid: "reg_uid_1001",
    decodedToken: { uid: "reg_uid_1001", email_verified: true },
    activationOperationId: "provider_activation_1002",
  }), (error) => error.code === "PROVIDER_ONBOARDING_INCOMPLETE");

  const conflictingClient = {
    async query(sql) {
      if (sql.includes("FROM organizations o")) {
        return { rows: [{
          org_id: "org_reg_1001",
          name: "Żółw Clean",
          onboarding_status: "COMPLETED",
          organization_kind: "CLEANING_PROVIDER",
          legal_name: "Żółw Clean sp. z o.o.",
          role: "OWNER",
          worker_id: "worker_owner_1001",
          member_status: "ONBOARDING",
        }] };
      }
      if (sql.includes("INSERT INTO cleanzi_registration_projection_outbox")) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    },
  };
  await assert.rejects(enqueueCleaningProviderActivation({
    client: conflictingClient,
    organizationId: "org_reg_1001",
    ownerUid: "reg_uid_1001",
    decodedToken: { uid: "reg_uid_1001", email_verified: true },
    activationOperationId: "provider_activation_conflict",
  }), (error) => error.code === "ACTIVATION_IDEMPOTENCY_CONFLICT");
});

test("activation rejects an unverified owner before touching SQL", async () => {
  let queries = 0;
  const client = {
    async query() {
      queries += 1;
      return { rows: [] };
    },
  };
  await assert.rejects(enqueueCleaningProviderActivation({
    client,
    organizationId: "org_reg_1001",
    ownerUid: "reg_uid_1001",
    decodedToken: { uid: "reg_uid_1001", email_verified: false },
    activationOperationId: "provider_activation_unverified",
  }), (error) => error.code === "EMAIL_VERIFICATION_REQUIRED");
  await assert.rejects(enqueueCleaningProviderActivation({
    client,
    organizationId: "org_reg_1001",
    ownerUid: "reg_uid_1001",
    decodedToken: { uid: "different_uid", email_verified: true },
    activationOperationId: "provider_activation_wrong_identity",
  }), (error) => error.code === "REGISTRATION_IDENTITY_MISMATCH");
  assert.equal(queries, 0);
});

function sqlText(sql) {
  return sql.replace(/\s+/g, " ").trim();
}
