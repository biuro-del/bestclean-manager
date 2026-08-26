import assert from "node:assert/strict";
import test from "node:test";
import {
  createRegistrationRuntimeConfiguration,
  normalizeDatabaseUrl,
} from "../src/registration-runtime-config.js";
import {
  getSharedRegistrationPool,
  resetSharedRegistrationPoolForTests,
} from "../src/registration-runtime.js";

function validConfiguration(overrides = {}) {
  return {
    allowedOrigins: "https://cleanzi.pl, http://127.0.0.1:3112",
    allowedHostnames: "cleanzi.pl,portal.cleanzi.pl",
    allowedAppIds: "1:123:web:abc,1:123:web:def",
    verificationContinueUrl: "https://portal.cleanzi.pl/rejestracja/potwierdzona",
    verificationFrom: "Cleanzi <rejestracja@cleanzi.pl>",
    verificationReplyTo: "",
    passwordOperationCollection: "cleanziPasswordRegistrationOperations",
    abuseCollection: "cleanziRegistrationAbuseCounters",
    verificationDeliveryCollection: "cleanziVerificationDeliveries",
    passwordCheckUserAgent: "Cleanzi-registration-password-policy/1.0",
    ...overrides,
  };
}

test("runtime config normalizes exact origins, hostnames and App Check app IDs", () => {
  const result = createRegistrationRuntimeConfiguration(validConfiguration());
  assert.deepEqual(result.allowedOrigins, [
    "https://cleanzi.pl",
    "http://127.0.0.1:3112",
  ]);
  assert.deepEqual(result.allowedHostnames, ["cleanzi.pl", "portal.cleanzi.pl"]);
  assert.deepEqual(result.allowedAppIds, ["1:123:web:abc", "1:123:web:def"]);
  assert.equal(result.verificationReplyTo, null);
});

test("runtime config rejects non-TLS remote origins and duplicate allowlist entries", () => {
  assert.throws(
    () => createRegistrationRuntimeConfiguration(validConfiguration({
      allowedOrigins: "http://cleanzi.pl",
    })),
    { code: "INVALID_ALLOWED_ORIGINS" },
  );
  assert.throws(
    () => createRegistrationRuntimeConfiguration(validConfiguration({
      allowedAppIds: "1:123:web:abc,1:123:web:abc",
    })),
    { code: "INVALID_APP_CHECK_APP_IDS" },
  );
});

test("database URL accepts PostgreSQL only and is never decomposed into public config", () => {
  const databaseUrl = "postgresql://cleanzi:secret@db.internal/cleanzi?sslmode=require";
  assert.equal(normalizeDatabaseUrl(databaseUrl), databaseUrl);
  assert.throws(
    () => normalizeDatabaseUrl("https://db.internal/cleanzi"),
    { code: "DATABASE_URL_INVALID" },
  );
});

test("shared pool is bounded and refuses a runtime connection switch", () => {
  resetSharedRegistrationPoolForTests();
  const created = [];
  const poolFactory = (options) => {
    const pool = { options };
    created.push(pool);
    return pool;
  };
  const url = "postgresql://cleanzi:secret@db.internal/cleanzi";
  const first = getSharedRegistrationPool(url, { poolFactory });
  const second = getSharedRegistrationPool(url, { poolFactory });
  assert.equal(first, second);
  assert.equal(created.length, 1);
  assert.equal(created[0].options.max, 4);
  assert.throws(
    () => getSharedRegistrationPool("postgresql://other:secret@db.internal/cleanzi", { poolFactory }),
    /DATABASE_URL_CHANGED_DURING_RUNTIME/,
  );
  resetSharedRegistrationPoolForTests();
});
