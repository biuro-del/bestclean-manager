import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createCloudflareTurnstileVerifier,
} from "../src/cloudflare-turnstile-verifier.js";
import {
  createCleaningCompanyPasswordPolicy,
  createPwnedPasswordChecker,
} from "../src/password-policy.js";
import {
  normalizeCleaningCompanyPasswordRequest,
} from "../src/password-registration-contract.js";
import {
  createResendVerificationMailer,
} from "../src/resend-verification-mailer.js";
import {
  decryptVerificationLink,
  encryptVerificationLink,
} from "../src/verification-link-envelope.js";

const NOW = Date.parse("2026-08-02T10:00:00.000Z");
const HMAC_KEY = "security-adapters-test-hmac-key-at-least-32-bytes";

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() { return structuredClone(body); },
  };
}

test("verification links are encrypted at rest and bound to one operation", () => {
  const verificationUrl = "https://portal.cleanzi.pl/verify?oobCode=secret-code";
  const envelope = encryptVerificationLink({
    verificationUrl,
    operationId: "preg_operation_1001",
    hmacKey: HMAC_KEY,
    randomBytes: () => Buffer.alloc(12, 7),
  });
  assert.doesNotMatch(JSON.stringify(envelope), /secret-code|portal\.cleanzi\.pl/);
  assert.equal(decryptVerificationLink({
    envelope,
    operationId: "preg_operation_1001",
    hmacKey: HMAC_KEY,
  }), verificationUrl);
  assert.throws(
    () => decryptVerificationLink({
      envelope,
      operationId: "preg_operation_2002",
      hmacKey: HMAC_KEY,
    }),
    (error) => error.code === "VERIFICATION_LINK_ENVELOPE_INVALID",
  );
});

test("Turnstile uses one random idempotency UUID per verifier invocation", async () => {
  const requests = [];
  const verifier = createCloudflareTurnstileVerifier({
    secret: "turnstile-test-secret",
    fetchImpl: async (_url, options) => {
      requests.push(options);
      if (requests.length === 1) return jsonResponse({}, { ok: false, status: 503 });
      return jsonResponse({
        success: true,
        action: "registration_cleaning_company",
        hostname: "portal.cleanzi.pl",
      });
    },
  });
  const result = await verifier.verify({
    token: "turnstile-token-0001",
    expectedAction: "registration_cleaning_company",
  });
  assert.deepEqual(result, {
    ok: true,
    mode: "enforce",
    action: "registration_cleaning_company",
    hostname: "portal.cleanzi.pl",
    reason: null,
  });
  await verifier.verify({
    token: "turnstile-token-0001",
    expectedAction: "registration_cleaning_company",
  });
  assert.equal(requests.length, 3);
  const keys = requests.map((request) => new URLSearchParams(request.body).get("idempotency_key"));
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[0], keys[2]);
  assert.match(keys[0], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(keys[2], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new URLSearchParams(requests[0].body).get("secret"), "turnstile-test-secret");
});

test("Turnstile exposes the returned action and hostname so the broker can fail closed", async () => {
  const verifier = createCloudflareTurnstileVerifier({
    secret: "turnstile-test-secret",
    maxAttempts: 1,
    fetchImpl: async () => jsonResponse({
      success: true,
      action: "registration_facility_manager",
      hostname: "attacker.example",
    }),
  });
  const result = await verifier.verify({
    token: "turnstile-token-0002",
    expectedAction: "registration_cleaning_company",
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "ACTION_MISMATCH");
  assert.equal(result.hostname, "attacker.example");
});

test("Turnstile treats a server-side secret rejection as provider unavailability", async () => {
  const verifier = createCloudflareTurnstileVerifier({
    secret: "turnstile-test-secret",
    maxAttempts: 1,
    fetchImpl: async () => jsonResponse({
      success: false,
      "error-codes": ["invalid-input-secret"],
    }),
  });
  const result = await verifier.verify({
    token: "turnstile-token-0003",
    expectedAction: "registration_cleaning_company",
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "PROVIDER_UNAVAILABLE");
});

test("password policy follows 15-character, Unicode and compromised-password rules", async () => {
  const compromised = "Bardzo długie hasło testowe".normalize("NFC");
  const digest = createHash("sha1").update(compromised, "utf8").digest("hex").toUpperCase();
  let requestedUrl;
  let requestedHeaders;
  const checker = createPwnedPasswordChecker({
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestedHeaders = options.headers;
      return {
        ok: true,
        async text() { return `${digest.slice(5)}:42\r\n${"0".repeat(35)}:0`; },
      };
    },
  });
  const policy = createCleaningCompanyPasswordPolicy({ compromisedPasswordChecker: checker });
  await assert.rejects(policy.assertAllowed(compromised), (error) => error.code === "PASSWORD_COMPROMISED");
  assert.equal(requestedUrl.endsWith(digest.slice(0, 5)), true);
  assert.equal(requestedHeaders["Add-Padding"], "true");
  assert.doesNotMatch(requestedUrl, /Bardzo|hasło/);
  await assert.rejects(policy.assertAllowed("za krótkie"), (error) => error.code === "PASSWORD_TOO_SHORT");

  const safePolicy = createCleaningCompanyPasswordPolicy({
    compromisedPasswordChecker: { async isCompromised() { return false; } },
  });
  await safePolicy.assertAllowed("To jest długa fraza bez reguł składu");
  await assert.rejects(
    safePolicy.assertAllowed("cleanzicleanzi2026", { email: "owner@example.com" }),
    (error) => error.code === "PASSWORD_CONTEXTUAL",
  );
  await assert.rejects(
    safePolicy.assertAllowed("właściciel202600", { email: "właściciel@example.com" }),
    (error) => error.code === "PASSWORD_CONTEXTUAL",
  );
});

test("registration normalizes a Unicode password to NFC before policy and Firebase Auth", () => {
  const decomposed = `Bardzo-długie-hasło-A\u0301-2026`;
  const request = normalizeCleaningCompanyPasswordRequest({
    registrationId: "registration_20260802_0001",
    registrationToken: "registration-token-20260802-0001-abcdefghijklmnopqrstuvwxyz",
    idempotencyKey: "idempotency_20260802_0001",
    email: "owner@example.com",
    password: decomposed,
    firstName: "Rafał",
    lastName: "Żółć",
    selectedPlanCode: "PLUS",
    billingCycle: "ANNUAL",
    locale: "pl-PL",
    timezone: "Europe/Warsaw",
    consents: {
      termsVersion: "2026-07-01",
      privacyVersion: "2026-07-01",
      newsletterConsent: false,
    },
  });
  assert.equal(request.password, decomposed.normalize("NFC"));
  assert.notEqual(request.password, decomposed);
});

function deliveryStoreFake() {
  const deliveries = new Map();
  return {
    deliveries,
    async claim(input) {
      const current = deliveries.get(input.deliveryId);
      if (!current) {
        const value = { ...structuredClone(input), state: "LEASED" };
        deliveries.set(input.deliveryId, value);
        return { action: "SEND", ...structuredClone(value) };
      }
      if (current.requestFingerprint !== input.requestFingerprint) throw new Error("IDEMPOTENCY_CONFLICT");
      if (current.state === "SENT") return { action: "ALREADY_SENT", ...structuredClone(current) };
      current.state = "LEASED";
      return { action: "SEND", ...structuredClone(current) };
    },
    async markSent({ deliveryId, providerMessageId, nowMs }) {
      Object.assign(deliveries.get(deliveryId), { state: "SENT", providerMessageId, sentAtMs: nowMs });
    },
    async markUnknown({ deliveryId, errorCode }) {
      Object.assign(deliveries.get(deliveryId), { state: "UNKNOWN", errorCode });
    },
  };
}

test("Resend mailer retries an unknown result with the same key and then deduplicates durably", async () => {
  const deliveryStore = deliveryStoreFake();
  const requests = [];
  let currentNow = NOW;
  const mailer = createResendVerificationMailer({
    apiKey: "resend-test-api-key",
    from: "Cleanzi <rejestracja@cleanzi.pl>",
    deliveryStore,
    hmacKey: HMAC_KEY,
    now: () => currentNow,
    fetchImpl: async (_url, options) => {
      requests.push(options);
      if (requests.length === 1) throw new TypeError("network result unknown");
      return jsonResponse({ id: "resend-message-1001" });
    },
  });
  const message = {
    idempotencyKey: "preg_operation_1001",
    email: "właściciel@żółw-clean.pl",
    displayName: "Rafał <Żółć>",
    verificationUrl: "https://portal.cleanzi.pl/rejestracja/potwierdzona?o=1&k=2",
    locale: "pl-PL",
  };
  await assert.rejects(mailer.sendVerification(message), (error) => error.code === "VERIFICATION_PROVIDER_UNAVAILABLE");
  currentNow += 60_000;
  const sent = await mailer.sendVerification(message);
  assert.equal(sent.providerMessageId, "resend-message-1001");
  const duplicate = await mailer.sendVerification(message);
  assert.equal(duplicate.deduplicated, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers["Idempotency-Key"], requests[1].headers["Idempotency-Key"]);
  const payload = JSON.parse(requests[1].body);
  assert.equal(payload.to[0], "właściciel@żółw-clean.pl");
  assert.match(payload.html, /Rafał &lt;Żółć&gt;/);
  assert.match(payload.html, /o=1&amp;k=2/);
  const stored = JSON.stringify([...deliveryStore.deliveries.values()]);
  assert.doesNotMatch(stored, /@|właściciel|Żółć|verificationUrl/);
});
