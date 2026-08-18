import assert from "node:assert/strict";
import test from "node:test";
import { createProjectionReconciliationHttpHandler } from "../src/projection-reconciliation-http.js";

function response() {
  return {
    headers: {},
    statusCode: null,
    payload: null,
    set(name, value) { this.headers[name] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function request(overrides = {}) {
  const headers = { "content-type": "application/json", ...(overrides.headers || {}) };
  return {
    method: "POST",
    body: {},
    rawBody: Buffer.from("{}"),
    ...overrides,
    headers,
    get(name) { return headers[String(name).toLowerCase()] || null; },
  };
}

test("private projection endpoint drains a bounded batch and returns counts only", async () => {
  let received;
  const endpoint = createProjectionReconciliationHttpHandler({
    reconciler: {
      async runOnce(input) {
        received = input;
        return { claimed: 3, delivered: 2, failed: 1 };
      },
    },
  });
  const res = response();
  await endpoint(request({ body: { limit: 7 } }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(received, { limit: 7 });
  assert.deepEqual(res.payload, { claimed: 3, delivered: 2, failed: 1 });
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("private projection endpoint rejects invalid method, content type and batch", async () => {
  const endpoint = createProjectionReconciliationHttpHandler({
    reconciler: { runOnce: async () => ({}) },
  });
  const wrongMethod = response();
  await endpoint(request({ method: "GET" }), wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers.Allow, "POST");

  const wrongType = response();
  await endpoint(request({ headers: { "content-type": "text/plain" } }), wrongType);
  assert.equal(wrongType.statusCode, 415);

  const invalidBatch = response();
  await endpoint(request({ body: { limit: 101 } }), invalidBatch);
  assert.equal(invalidBatch.statusCode, 400);
});

test("private projection endpoint hides internal failures", async () => {
  const diagnostics = [];
  const endpoint = createProjectionReconciliationHttpHandler({
    reconciler: { runOnce: async () => { throw new Error("postgres secret detail"); } },
    onUnexpectedError: (event) => diagnostics.push(event),
  });
  const res = response();
  await endpoint(request(), res);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.payload, { error: { code: "PROJECTION_RECONCILIATION_FAILED" } });
  assert.deepEqual(diagnostics, [{ code: "PROJECTION_RECONCILIATION_FAILED" }]);
  assert.doesNotMatch(JSON.stringify(diagnostics), /secret detail/);
});
