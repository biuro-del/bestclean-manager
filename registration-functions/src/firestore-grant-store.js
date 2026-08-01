import {
  REGISTRATION_GRANT_STATUS,
  RegistrationGateError,
  normalizedNow,
  registrationGrantDocumentId,
  requiredText,
} from "./registration-contract.js";

function assertCollectionName(value) {
  const name = requiredText(value, "INVALID_GRANT_COLLECTION", 100);
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new RegistrationGateError("INVALID_GRANT_COLLECTION");
  }
  return name;
}

function candidateMatchesGrant(candidate, grant) {
  return (
    grant?.schemaVersion === candidate.schemaVersion &&
    grant?.channel === candidate.channel &&
    grant?.action === candidate.action &&
    grant?.providerId === candidate.providerId &&
    grant?.subjectHmac === candidate.subjectHmac
  );
}

function assertGrantForIssue(grant) {
  registrationGrantDocumentId(grant);
  if (
    grant?.status !== REGISTRATION_GRANT_STATUS.ISSUED ||
    !Number.isSafeInteger(grant?.issuedAtMs) ||
    !Number.isSafeInteger(grant?.expiresAtMs) ||
    grant.expiresAtMs <= grant.issuedAtMs
  ) {
    throw new RegistrationGateError("INVALID_GRANT_FOR_ISSUE");
  }
}

export function createFirestoreRegistrationGrantStore({
  db,
  collectionName = "cleanziRegistrationGrants",
}) {
  if (typeof db?.runTransaction !== "function") {
    throw new RegistrationGateError("FIRESTORE_REQUIRED");
  }
  const grants = db.collection(assertCollectionName(collectionName));

  return Object.freeze({
    async issueGrant(grant) {
      assertGrantForIssue(grant);
      const documentId = registrationGrantDocumentId(grant);
      const ref = grants.doc(documentId);
      await db.runTransaction(async (transaction) => {
        transaction.set(ref, { ...grant });
      });
      return { documentId, ...grant };
    },

    async consumeExactlyOne({
      candidates,
      nowMs,
      consumedByUid,
      consumedByEventId,
    }) {
      if (!Array.isArray(candidates) || candidates.length === 0) {
        return null;
      }
      const currentTime = normalizedNow(nowMs);
      const uid = requiredText(consumedByUid, "INVALID_UID", 128);
      const eventId = requiredText(
        consumedByEventId,
        "INVALID_EVENT_ID",
        256,
      );
      const unique = [
        ...new Map(
          candidates.map((candidate) => [
            registrationGrantDocumentId(candidate),
            candidate,
          ]),
        ).entries(),
      ];

      return db.runTransaction(async (transaction) => {
        const idempotentRetries = [];
        const issuedMatches = [];
        for (const [documentId, candidate] of unique) {
          const ref = grants.doc(documentId);
          const snapshot = await transaction.get(ref);
          if (!snapshot.exists) continue;
          const grant = snapshot.data();
          if (!candidateMatchesGrant(candidate, grant)) continue;

          const issued = (
            grant.status === REGISTRATION_GRANT_STATUS.ISSUED &&
            Number.isSafeInteger(grant.issuedAtMs) &&
            grant.issuedAtMs <= currentTime &&
            Number.isSafeInteger(grant.expiresAtMs) &&
            grant.expiresAtMs > currentTime
          );
          const idempotentRetry = (
            grant.status === REGISTRATION_GRANT_STATUS.CONSUMED &&
            grant.consumedByUid === uid &&
            grant.consumedByEventId === eventId
          );
          if (idempotentRetry) idempotentRetries.push({ ref, grant });
          if (issued) issuedMatches.push({ ref, grant });
        }

        if (idempotentRetries.length > 1) {
          throw new RegistrationGateError("AMBIGUOUS_REGISTRATION_GRANT");
        }
        if (idempotentRetries.length === 1) {
          return { ...idempotentRetries[0].grant };
        }

        if (issuedMatches.length === 0) return null;
        if (issuedMatches.length !== 1) {
          throw new RegistrationGateError("AMBIGUOUS_REGISTRATION_GRANT");
        }

        const match = issuedMatches[0];
        transaction.update(match.ref, {
          status: REGISTRATION_GRANT_STATUS.CONSUMED,
          consumedAtMs: currentTime,
          consumedByUid: uid,
          consumedByEventId: eventId,
        });
        return {
          ...match.grant,
          status: REGISTRATION_GRANT_STATUS.CONSUMED,
          consumedAtMs: currentTime,
          consumedByUid: uid,
          consumedByEventId: eventId,
        };
      });
    },
  });
}
