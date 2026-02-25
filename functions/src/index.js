import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { logger } from "firebase-functions";
import { adminDb } from "./firebaseAdmin.js";
import { requireWorkerFromPayload } from "./auth.js";
import { getRuntimeWorkdayConfig, getActiveWorkdayForClient, startWorkday, beginEndingWorkday, cancelEndingWorkday, closeWorkdayNow } from "./workday.js";
import { getActiveCycleForClient, startCycle, stopCycle, stopAndStartCycle } from "./cycles.js";
import { resolveZoneByRoomId } from "./zones.js";
import { apiError, ensureString, pickClientNow, toNumber } from "./utils.js";

setGlobalOptions({
  region: "europe-central2",
  maxInstances: 20,
});

const HOSTING_INVOKERS = [
  "iclean-room@appspot.gserviceaccount.com",
  "1080573912983-compute@developer.gserviceaccount.com",
];

function jsonOk(data) {
  return { ok: true, data };
}

function jsonError(code, message, details = null) {
  return { ok: false, error: { code, message, details } };
}

function readRoute(req) {
  const bodyPath = typeof req.body?.path === "string" ? req.body.path : "";
  const pathOnly = String(req.path || "")
    .replace(/^\/+/, "")
    .trim();

  const rawRoute = (bodyPath || pathOnly || "").replace(/^\/+/, "").trim();
  if (rawRoute === "api") return "";
  if (rawRoute.startsWith("api/")) return rawRoute.slice(4);
  return rawRoute;
}

function pickPayload(req) {
  if (req.method === "GET") return req.query || {};
  return req.body || {};
}

function extractError(error) {
  const status = Number(error?.statusCode || 500);
  const code = ensureString(error?.apiCode || error?.code) || "INTERNAL";
  const message = ensureString(error?.message) || "Unexpected server error.";
  const details = error?.details ?? null;
  return { status: Number.isFinite(status) ? status : 500, code, message, details };
}

export const api = onRequest({ cors: true, invoker: HOSTING_INVOKERS }, async (req, res) => {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json(jsonError("METHOD_NOT_ALLOWED", "Use GET or POST."));
    return;
  }

  const route = readRoute(req);
  const payload = pickPayload(req);

  try {
    if (!route || route === "health") {
      res.status(200).json(
        jsonOk({
          service: "best-clean-api",
          status: "ok",
          route: route || "health",
          serverNow: new Date().toISOString(),
          region: "europe-central2",
        }),
      );
      return;
    }

    if (route === "auth/bootstrap") {
      res.status(200).json(
        jsonOk({
          projectId: process.env.GCLOUD_PROJECT || "",
          authMode: "firebase-login-or-email",
          now: new Date().toISOString(),
        }),
      );
      return;
    }

    const db = adminDb();

    if (route === "auth/me") {
      const worker = await requireWorkerFromPayload(payload);
      res.status(200).json(
        jsonOk({
          worker: {
            uid: worker.uid,
            email: worker.email,
            login: worker.login,
            name: worker.name,
            role: worker.role,
            roles: worker.roles,
          },
        }),
      );
      return;
    }

    if (route === "workday/utilityId") {
      const worker = await requireWorkerFromPayload(payload);
      if (!worker.uid) throw apiError("UNAUTHORIZED", "Unauthorized.", 401);
      const config = await getRuntimeWorkdayConfig(db);
      res.status(200).json(
        jsonOk({
          utilityRoomId: config.utilityRoomId,
          startRoomId: config.startRoomId,
          stopRules: config.stopRules,
        }),
      );
      return;
    }

    if (route === "workday/active") {
      const worker = await requireWorkerFromPayload(payload);
      const clientNow = pickClientNow(payload);
      const tzOffsetMinutes = toNumber(payload?.tzOffsetMinutes, 0);
      const data = await getActiveWorkdayForClient({
        db,
        uid: worker.uid,
        clientNow,
        tzOffsetMinutes,
      });
      res.status(200).json(jsonOk(data));
      return;
    }

    if (route === "workday/start") {
      const worker = await requireWorkerFromPayload(payload);
      const data = await startWorkday({
        db,
        worker,
        roomId: payload?.roomId,
        deviceId: payload?.deviceId,
        startEventId: payload?.startEventId,
        clientNow: payload?.clientNow,
        tzOffsetMinutes: toNumber(payload?.tzOffsetMinutes, 0),
      });
      res.status(200).json(jsonOk(data));
      return;
    }

    if (route === "workday/beginEnding") {
      const worker = await requireWorkerFromPayload(payload);
      const data = await beginEndingWorkday({
        db,
        worker,
        roomId: payload?.roomId,
        deviceId: payload?.deviceId,
        endEventId: payload?.endEventId,
        clientNow: payload?.clientNow,
        tzOffsetMinutes: toNumber(payload?.tzOffsetMinutes, 0),
      });
      res.status(200).json(jsonOk(data));
      return;
    }

    if (route === "workday/cancelEnding") {
      const worker = await requireWorkerFromPayload(payload);
      const data = await cancelEndingWorkday({
        db,
        worker,
        clientNow: payload?.clientNow,
        tzOffsetMinutes: toNumber(payload?.tzOffsetMinutes, 0),
      });
      res.status(200).json(jsonOk(data));
      return;
    }

    if (route === "workday/closeNow") {
      const worker = await requireWorkerFromPayload(payload);
      const data = await closeWorkdayNow({
        db,
        worker,
        endEventId: payload?.endEventId,
        clientNow: payload?.clientNow || payload?.clientAt,
        tzOffsetMinutes: toNumber(payload?.tzOffsetMinutes, 0),
      });
      res.status(200).json(jsonOk(data));
      return;
    }

    if (route === "zones/resolve") {
      await requireWorkerFromPayload(payload);
      const zone = await resolveZoneByRoomId(db, payload?.roomId);
      res.status(200).json(jsonOk({ zone }));
      return;
    }

    if (route === "cycles/active") {
      const worker = await requireWorkerFromPayload(payload);
      const data = await getActiveCycleForClient({
        db,
        uid: worker.uid,
        clientNow: payload?.clientNow,
        tzOffsetMinutes: toNumber(payload?.tzOffsetMinutes, 0),
      });
      res.status(200).json(jsonOk(data));
      return;
    }

    if (route === "cycles/start") {
      const worker = await requireWorkerFromPayload(payload);
      const data = await startCycle({
        db,
        worker,
        roomId: payload?.roomId,
        deviceId: payload?.deviceId,
        startEventId: payload?.startEventId,
        clientNow: payload?.clientNow,
        tzOffsetMinutes: toNumber(payload?.tzOffsetMinutes, 0),
      });
      res.status(200).json(jsonOk(data));
      return;
    }

    if (route === "cycles/stop") {
      const worker = await requireWorkerFromPayload(payload);
      const data = await stopCycle({
        db,
        worker,
        cycleId: payload?.cycleId,
        deviceId: payload?.deviceId,
        endEventId: payload?.endEventId,
        reason: payload?.reason,
        comment: payload?.comment,
        clientNow: payload?.clientNow || payload?.clientAt,
      });
      res.status(200).json(jsonOk(data));
      return;
    }

    if (route === "cycles/stopAndStart") {
      const worker = await requireWorkerFromPayload(payload);
      const data = await stopAndStartCycle({
        db,
        worker,
        cycleId: payload?.cycleId,
        nextRoomId: payload?.nextRoomId,
        deviceId: payload?.deviceId,
        opEventId: payload?.opEventId,
        reason: payload?.reason,
        comment: payload?.comment,
        clientNow: payload?.clientNow,
        tzOffsetMinutes: toNumber(payload?.tzOffsetMinutes, 0),
      });
      res.status(200).json(jsonOk(data));
      return;
    }

    res.status(404).json(jsonError("NOT_IMPLEMENTED", `Route "${route}" is not implemented yet.`));
  } catch (error) {
    const apiErr = extractError(error);
    logger.error("api_error", {
      route,
      code: apiErr.code,
      message: apiErr.message,
      details: apiErr.details,
      raw: String(error?.stack || error?.message || error),
    });
    res.status(apiErr.status).json(jsonError(apiErr.code, apiErr.message, apiErr.details));
  }
});
