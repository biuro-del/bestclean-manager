import assert from "node:assert/strict";
import test from "node:test";
import { createFacilityManagerFirestoreAbuseGuard } from "../src/facility-manager-firestore-abuse-guard.js";

function memoryFirestore() {
  const records = new Map();
  return {
    collection(name) {
      return {
        doc(id) {
          return { key: `${name}/${id}` };
        },
      };
    },
    async runTransaction(callback) {
      const pending = new Map();
      const transaction = {
        async get(ref) {
          const value = records.get(ref.key);
          return {
            exists: value !== undefined,
            data: () => value,
          };
        },
        set(ref, value) {
          pending.set(ref.key, value);
        },
      };
      await callback(transaction);
      for (const [key, value] of pending) records.set(key, value);
    },
  };
}

test("isolated manager abuse guard rate-limits a pseudonymous subject transactionally", async () => {
  const guard = createFacilityManagerFirestoreAbuseGuard({
    db: memoryFirestore(),
    maxAttemptsPerRegistration: 1,
    maxAttemptsPerEmail: 1,
    now: () => 1_735_689_600_000,
  });
  const input = {
    channel: "FACILITY_MANAGER_GOOGLE",
    registrationId: "pseudonymous-subject-key",
    emailHmac: "pseudonymous-subject-key",
  };

  await guard.assertAllowed(input);
  await assert.rejects(
    guard.assertAllowed(input),
    (error) => error.code === "REGISTRATION_RATE_LIMITED",
  );
})
