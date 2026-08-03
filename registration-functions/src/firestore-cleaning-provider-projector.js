import { RegistrationGateError, requiredText } from "./registration-contract.js";

const REGISTERED = "CLEANING_PROVIDER_REGISTERED";
const ACTIVATED = "CLEANING_PROVIDER_ACTIVATED";

function text(value, code, maxLength = 180) {
  return requiredText(value, code, maxLength);
}

function eventPayload(event) {
  const payload = event?.payload && typeof event.payload === "object"
    ? event.payload
    : event;
  const eventType = text(payload?.eventType || event?.event_type, "INVALID_PROJECTION_EVENT", 80);
  if (![REGISTERED, ACTIVATED].includes(eventType)) {
    throw new RegistrationGateError("UNSUPPORTED_PROJECTION_EVENT");
  }
  const active = eventType === ACTIVATED;
  const membershipStatus = active ? "active" : "onboarding";
  const organizationId = text(payload.organizationId || event?.org_id, "INVALID_ORG_ID", 64);
  const ownerUid = text(payload.ownerUid || event?.uid, "INVALID_UID", 128);
  if (
    event?.org_id && event.org_id !== organizationId ||
    event?.uid && event.uid !== ownerUid ||
    payload.organization?.kind !== "cleaning_provider" ||
    payload.membership?.role !== "owner" ||
    payload.membership?.status !== membershipStatus
  ) {
    throw new RegistrationGateError("PROJECTION_EVENT_MISMATCH");
  }
  const legalName = typeof payload.organization?.legalName === "string"
    ? payload.organization.legalName.trim()
    : "";
  if (active && legalName.length < 2) {
    throw new RegistrationGateError("PROVIDER_LEGAL_NAME_REQUIRED");
  }
  return Object.freeze({
    eventType,
    eventId: text(event?.event_id || payload.eventId || payload.operationId, "INVALID_EVENT_ID", 160),
    operationId: text(payload.operationId || event?.operation_id, "INVALID_OPERATION_ID", 160),
    organizationId,
    ownerUid,
    legalName,
    displayName: text(payload.organization?.displayName || legalName, "INVALID_ORGANIZATION_NAME", 180),
    organizationStatus: active ? "active" : "onboarding",
    membershipStatus,
    profileStatus: active ? "active" : "onboarding",
    occurredAtMs: Number.isSafeInteger(payload.occurredAtMs)
      ? payload.occurredAtMs
      : null,
  });
}

function assertCompatibleExisting({ organization, membership }) {
  if (organization && organization.kind && organization.kind !== "cleaning_provider") {
    throw new RegistrationGateError("PROVIDER_ORGANIZATION_KIND_CONFLICT");
  }
  if (
    membership &&
    (
      membership.role !== "owner" ||
      !["onboarding", "active"].includes(membership.status)
    )
  ) {
    throw new RegistrationGateError("PROVIDER_MEMBERSHIP_CONFLICT");
  }
}

export function createFirestoreCleaningProviderProjector({ db }) {
  if (typeof db?.runTransaction !== "function") {
    throw new RegistrationGateError("FIRESTORE_REQUIRED");
  }
  return Object.freeze({
    async project(event) {
      const projection = eventPayload(event);
      const organizationRef = db.collection("organizations").doc(projection.organizationId);
      const membershipRef = organizationRef.collection("members").doc(projection.ownerUid);
      const profileRef = db.collection("cleaningProviderProfiles").doc(projection.ownerUid);

      const projectedStatus = await db.runTransaction(async (transaction) => {
        const [organizationSnapshot, membershipSnapshot, profileSnapshot] = await Promise.all([
          transaction.get(organizationRef),
          transaction.get(membershipRef),
          transaction.get(profileRef),
        ]);
        const existingOrganization = organizationSnapshot.exists
          ? organizationSnapshot.data()
          : null;
        const existingMembership = membershipSnapshot.exists
          ? membershipSnapshot.data()
          : null;
        const existingProfile = profileSnapshot.exists ? profileSnapshot.data() : null;
        assertCompatibleExisting({
          organization: existingOrganization,
          membership: existingMembership,
        });

        const activationAlreadyApplied = existingOrganization?.status === "active";
        const staleRegistrationProjection = activationAlreadyApplied &&
          projection.eventType === REGISTERED;
        const organizationStatus = activationAlreadyApplied
          ? "active"
          : projection.organizationStatus;
        const legalName = projection.legalName || existingOrganization?.legalName || "";
        const organizationPatch = {
          legalName,
          displayName: staleRegistrationProjection
            ? existingOrganization?.displayName || projection.displayName
            : projection.displayName,
          kind: "cleaning_provider",
          status: organizationStatus,
        };
        if (!staleRegistrationProjection) {
          organizationPatch.projectionOperationId = projection.operationId;
          organizationPatch.projectionEventId = projection.eventId;
          if (projection.occurredAtMs) {
            organizationPatch.projectionOccurredAtMs = projection.occurredAtMs;
          }
        }
        transaction.set(organizationRef, organizationPatch, { merge: true });
        const membershipPatch = {
          organizationId: projection.organizationId,
          userId: projection.ownerUid,
          role: "owner",
          status: activationAlreadyApplied ? "active" : projection.membershipStatus,
        };
        if (!staleRegistrationProjection) {
          membershipPatch.projectionOperationId = projection.operationId;
        }
        transaction.set(membershipRef, membershipPatch, { merge: true });

        const profileStatus = existingProfile?.status === "active"
          ? "active"
          : projection.profileStatus;
        const profilePatch = {
          status: profileStatus,
        };
        if (!staleRegistrationProjection) {
          profilePatch.projectionOperationId = projection.operationId;
        }
        if (!existingProfile?.defaultOrganizationId) {
          profilePatch.defaultOrganizationId = projection.organizationId;
        }
        transaction.set(profileRef, profilePatch, { merge: true });
        return organizationStatus;
      });
      return Object.freeze({
        organizationId: projection.organizationId,
        ownerUid: projection.ownerUid,
        status: projectedStatus,
      });
    },
  });
}

export const __test = Object.freeze({ eventPayload });
