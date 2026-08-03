import assert from "node:assert/strict";
import test from "node:test";
import { RegistrationGateError } from "../src/registration-contract.js";
import { createCleaningCompanyRegistrationHttpHandler } from "../src/registration-http.js";

function request(overrides = {}) {
  const headers = {
    origin: "https://cleanzi.pl",
    "content-type": "application/json",
    "x-firebase-appcheck": "valid-app-check",
    ...(overrides.headers || {}),
  };
  return {
    method: "POST",
    body: { registrationId: "registration_123" },
    rawBody: Buffer.from("{}"),
    ...overrides,
    headers,
    get(name) {
      return headers[String(name).toLowerCase()] || null;
    },
  };
}

function response() {
  return {
    headers: {},
    statusCode: null,
    payload: undefined,
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.payload = value;
      return this;
    },
    send(value) {
      this.payload = value;
      return this;
    },
  };
}

function handler(overrides = {}) {
  return createCleaningCompanyRegistrationHttpHandler({
    broker: { register: async () => ({ status: "EMAIL_VERIFICATION_REQUIRED" }) },
    appCheck: { verifyToken: async () => ({ appId: "1:123:web:cleanzi" }) },
    allowedOrigins: ["https://cleanzi.pl"],
    allowedAppIds: ["1:123:web:cleanzi"],
    ...overrides,
  });
}

test("registration endpoint requires exact origin and App Check before calling broker", async () => {
  let received;
  const endpoint = handler({
    broker: {
      async register(body) {
        received = body;
        return { status: "EMAIL_VERIFICATION_REQUIRED", operationalAccess: false };
      },
    },
  });
  const res = response();
  await endpoint(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "https://cleanzi.pl");
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.deepEqual(received, { registrationId: "registration_123" });
  assert.equal(res.payload.operationalAccess, false);
});

test("registration preflight is allowlisted and does not call security providers", async () => {
  let calls = 0;
  const endpoint = handler({
    broker: { register: async () => { calls += 1; } },
    appCheck: { verifyToken: async () => { calls += 1; } },
  });
  const res = response();
  await endpoint(request({ method: "OPTIONS" }), res);
  assert.equal(res.statusCode, 204);
  assert.equal(calls, 0);
});

test("registration rejects missing or different browser origin", async () => {
  for (const origin of ["", "https://evil.example", "https://cleanzi.pl/path"]) {
    const res = response();
    await handler()(request({ headers: { origin } }), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.payload.error.code, "REGISTRATION_ORIGIN_NOT_ALLOWED");
    assert.equal(res.headers["Access-Control-Allow-Origin"], undefined);
  }
});

test("registration rejects missing, invalid and wrong-app App Check tokens", async () => {
  const missing = response();
  await handler()(request({ headers: { "x-firebase-appcheck": "" } }), missing);
  assert.equal(missing.statusCode, 401);
  assert.equal(missing.payload.error.code, "APP_CHECK_REQUIRED");

  const invalid = response();
  await handler({ appCheck: { verifyToken: async () => { throw new Error("bad"); } } })(request(), invalid);
  assert.equal(invalid.statusCode, 401);
  assert.equal(invalid.payload.error.code, "APP_CHECK_INVALID");

  const wrongApp = response();
  await handler({ appCheck: { verifyToken: async () => ({ appId: "1:999:web:other" }) } })(request(), wrongApp);
  assert.equal(wrongApp.statusCode, 403);
  assert.equal(wrongApp.payload.error.code, "APP_CHECK_APP_NOT_ALLOWED");
});

test("registration enforces JSON and body size before broker", async () => {
  const wrongType = response();
  await handler()(request({ headers: { "content-type": "text/plain" } }), wrongType);
  assert.equal(wrongType.statusCode, 415);

  const tooLarge = response();
  await handler()(request({ rawBody: Buffer.alloc(32 * 1024 + 1) }), tooLarge);
  assert.equal(tooLarge.statusCode, 413);
});

test("registration exposes only classified public error codes", async () => {
  const password = response();
  await handler({
    broker: { register: async () => { throw new RegistrationGateError("PASSWORD_COMPROMISED"); } },
  })(request(), password);
  assert.equal(password.statusCode, 422);
  assert.equal(password.payload.error.code, "PASSWORD_COMPROMISED");

  const source = response();
  await handler({
    broker: { register: async () => { throw new RegistrationGateError("SOURCE_ATTEMPT_TOKEN_INVALID"); } },
  })(request(), source);
  assert.equal(source.statusCode, 409);
  assert.equal(source.payload.error.code, "REGISTRATION_AUTHORIZATION_INVALID");

  const conflict = response();
  await handler({
    broker: { register: async () => { throw new RegistrationGateError("ACCOUNT_ALREADY_EXISTS_USE_LOGIN"); } },
  })(request(), conflict);
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.payload.error.code, "REGISTRATION_CONFLICT");
});

test("an overlong composed display name is exposed as a client error", async () => {
  const diagnostics = [];
  const res = response();
  await handler({
    broker: {
      register: async () => {
        throw new RegistrationGateError("INVALID_DISPLAY_NAME");
      },
    },
    onUnexpectedError: (event) => diagnostics.push(event),
  })(request(), res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { error: { code: "INVALID_DISPLAY_NAME" } });
  assert.deepEqual(diagnostics, []);
});

test("registration rate limit returns Retry-After without request data", async () => {
  const res = response();
  await handler({
    broker: { register: async () => { throw new RegistrationGateError("REGISTRATION_RATE_LIMITED"); } },
  })(request(), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["Retry-After"], "900");
  assert.deepEqual(res.payload, { error: { code: "REGISTRATION_RATE_LIMITED" } });
});

test("Turnstile provider outage is exposed as temporary unavailability", async () => {
  const res = response();
  await handler({
    broker: {
      register: async () => {
        throw new RegistrationGateError("TURNSTILE_PROVIDER_UNAVAILABLE");
      },
    },
  })(request(), res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.payload, {
    error: { code: "REGISTRATION_TEMPORARILY_UNAVAILABLE" },
  });
});

test("unexpected failures are generic and diagnostics contain codes only", async () => {
  const diagnostics = [];
  const res = response();
  await handler({
    broker: { register: async () => { throw new Error("password=never-log-me"); } },
    onUnexpectedError: (event) => diagnostics.push(event),
  })(request(), res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.payload, { error: { code: "INTERNAL_ERROR" } });
  assert.deepEqual(diagnostics, [{ code: "UNEXPECTED_ERROR", publicCode: "INTERNAL_ERROR" }]);
  assert.doesNotMatch(JSON.stringify(diagnostics), /never-log-me/);
});
