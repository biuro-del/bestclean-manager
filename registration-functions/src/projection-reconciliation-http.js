function header(request, name) {
  if (typeof request?.get === "function") return request.get(name);
  return request?.headers?.[String(name).toLowerCase()] || null;
}

function json(response, status, body) {
  response.set?.("Cache-Control", "no-store");
  response.set?.("X-Content-Type-Options", "nosniff");
  return response.status(status).json(body);
}

export function createProjectionReconciliationHttpHandler({
  reconciler,
  onUnexpectedError = () => {},
}) {
  if (typeof reconciler?.runOnce !== "function") throw new Error("PROJECTION_RECONCILER_REQUIRED");
  return async function projectionReconciliationHttp(request, response) {
    if (request.method !== "POST") {
      response.set?.("Allow", "POST");
      return json(response, 405, { error: { code: "METHOD_NOT_ALLOWED" } });
    }
    const contentType = String(header(request, "content-type") || "").toLowerCase();
    if (!contentType.startsWith("application/json")) {
      return json(response, 415, { error: { code: "JSON_CONTENT_TYPE_REQUIRED" } });
    }
    if (request.rawBody && request.rawBody.length > 1_024) {
      return json(response, 413, { error: { code: "REQUEST_TOO_LARGE" } });
    }
    const limit = request.body?.limit === undefined ? 20 : Number(request.body.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      return json(response, 400, { error: { code: "INVALID_OUTBOX_BATCH_SIZE" } });
    }
    try {
      const result = await reconciler.runOnce({ limit });
      return json(response, 200, result);
    } catch (error) {
      onUnexpectedError({ code: String(error?.code || "PROJECTION_RECONCILIATION_FAILED") });
      return json(response, 500, { error: { code: "PROJECTION_RECONCILIATION_FAILED" } });
    }
  };
}
