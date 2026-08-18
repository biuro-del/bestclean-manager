import { getApps, initializeApp } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { defineSecret, defineString } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { createProjectionReconciliationHttpHandler } from "./projection-reconciliation-http.js";
import { createCleaningCompanyRegistrationHttpHandler } from "./registration-http.js";
import { createRegistrationRuntimeConfiguration } from "./registration-runtime-config.js";
import {
  createCleaningCompanyRegistrationRuntime,
  createCleaningProviderProjectionRuntime,
  getSharedRegistrationPool,
} from "./registration-runtime.js";

const FUNCTION_REGION = "europe-west3";

const DATABASE_URL = defineSecret("DATABASE_URL");
const REGISTRATION_HMAC_SECRET = defineSecret("CLEANZI_REGISTRATION_HMAC_SECRET");
const TURNSTILE_SECRET_KEY = defineSecret("TURNSTILE_SECRET_KEY");
const RESEND_API_KEY = defineSecret("RESEND_API_KEY");

const ALLOWED_ORIGINS = defineString("CLEANZI_REGISTRATION_ALLOWED_ORIGINS", {
  default: "https://cleanzi.pl,https://www.cleanzi.pl",
});
const ALLOWED_HOSTNAMES = defineString("CLEANZI_REGISTRATION_ALLOWED_HOSTNAMES", {
  default: "cleanzi.pl,www.cleanzi.pl,portal.cleanzi.pl",
});
const APP_CHECK_APP_IDS = defineString("CLEANZI_REGISTRATION_APP_CHECK_APP_IDS");
const VERIFICATION_CONTINUE_URL = defineString("CLEANZI_VERIFICATION_CONTINUE_URL", {
  default: "https://portal.cleanzi.pl/rejestracja/potwierdzona",
});
const VERIFICATION_FROM = defineString("CLEANZI_VERIFICATION_FROM", {
  default: "Cleanzi <rejestracja@cleanzi.pl>",
});
const VERIFICATION_REPLY_TO = defineString("CLEANZI_VERIFICATION_REPLY_TO", {
  default: "",
});
const PASSWORD_OPERATION_COLLECTION = defineString("CLEANZI_PASSWORD_OPERATION_COLLECTION", {
  default: "cleanziPasswordRegistrationOperations",
});
const ABUSE_COLLECTION = defineString("CLEANZI_REGISTRATION_ABUSE_COLLECTION", {
  default: "cleanziRegistrationAbuseCounters",
});
const VERIFICATION_DELIVERY_COLLECTION = defineString(
  "CLEANZI_VERIFICATION_DELIVERY_COLLECTION",
  { default: "cleanziVerificationDeliveries" },
);
const PASSWORD_CHECK_USER_AGENT = defineString("CLEANZI_PASSWORD_CHECK_USER_AGENT", {
  default: "Cleanzi-registration-password-policy/1.0",
});

const firebaseApp = getApps()[0] || initializeApp();
const auth = getAuth(firebaseApp);
const appCheck = getAppCheck(firebaseApp);
const db = getFirestore(firebaseApp);

let registrationHttpHandler;
let projectionReconciler;
let projectionHttpHandler;

function runtimeConfiguration() {
  return createRegistrationRuntimeConfiguration({
    allowedOrigins: ALLOWED_ORIGINS.value(),
    allowedHostnames: ALLOWED_HOSTNAMES.value(),
    allowedAppIds: APP_CHECK_APP_IDS.value(),
    verificationContinueUrl: VERIFICATION_CONTINUE_URL.value(),
    verificationFrom: VERIFICATION_FROM.value(),
    verificationReplyTo: VERIFICATION_REPLY_TO.value(),
    passwordOperationCollection: PASSWORD_OPERATION_COLLECTION.value(),
    abuseCollection: ABUSE_COLLECTION.value(),
    verificationDeliveryCollection: VERIFICATION_DELIVERY_COLLECTION.value(),
    passwordCheckUserAgent: PASSWORD_CHECK_USER_AGENT.value(),
  });
}

function registrationHandler() {
  if (registrationHttpHandler) return registrationHttpHandler;
  const configuration = runtimeConfiguration();
  const pool = getSharedRegistrationPool(DATABASE_URL.value());
  const runtime = createCleaningCompanyRegistrationRuntime({
    auth,
    db,
    pool,
    configuration,
    secrets: {
      hmacSecret: REGISTRATION_HMAC_SECRET.value(),
      turnstileSecret: TURNSTILE_SECRET_KEY.value(),
      resendApiKey: RESEND_API_KEY.value(),
    },
  });
  registrationHttpHandler = createCleaningCompanyRegistrationHttpHandler({
    broker: runtime.broker,
    appCheck,
    allowedOrigins: configuration.allowedOrigins,
    allowedAppIds: configuration.allowedAppIds,
    onUnexpectedError: ({ code, publicCode }) => {
      logger.error("Cleaning company registration failed", { code, publicCode });
    },
  });
  return registrationHttpHandler;
}

function getProjectionReconciler() {
  if (projectionReconciler) return projectionReconciler;
  const pool = getSharedRegistrationPool(DATABASE_URL.value());
  projectionReconciler = createCleaningProviderProjectionRuntime({ db, pool }).reconciler;
  return projectionReconciler;
}

function sendUnavailable(response, code) {
  response.set("Cache-Control", "no-store");
  response.set("X-Content-Type-Options", "nosniff");
  return response.status(503).json({ error: { code } });
}

export const registerCleaningCompany = onRequest({
  region: FUNCTION_REGION,
  invoker: "public",
  cors: false,
  memory: "512MiB",
  timeoutSeconds: 60,
  concurrency: 10,
  maxInstances: 5,
  secrets: [
    DATABASE_URL,
    REGISTRATION_HMAC_SECRET,
    TURNSTILE_SECRET_KEY,
    RESEND_API_KEY,
  ],
}, async (request, response) => {
  try {
    return await registrationHandler()(request, response);
  } catch (error) {
    logger.error("Cleaning company registration runtime unavailable", {
      code: String(error?.code || "REGISTRATION_RUNTIME_UNAVAILABLE"),
    });
    return sendUnavailable(response, "REGISTRATION_TEMPORARILY_UNAVAILABLE");
  }
});

export const reconcileCleaningCompanyProjections = onRequest({
  region: FUNCTION_REGION,
  invoker: "private",
  cors: false,
  memory: "256MiB",
  timeoutSeconds: 120,
  concurrency: 1,
  maxInstances: 1,
  secrets: [DATABASE_URL],
}, async (request, response) => {
  try {
    if (!projectionHttpHandler) {
      projectionHttpHandler = createProjectionReconciliationHttpHandler({
        reconciler: getProjectionReconciler(),
        onUnexpectedError: ({ code }) => {
          logger.error("Cleaning company projection reconciliation failed", { code });
        },
      });
    }
    return await projectionHttpHandler(request, response);
  } catch (error) {
    logger.error("Cleaning company projection runtime unavailable", {
      code: String(error?.code || "PROJECTION_RUNTIME_UNAVAILABLE"),
    });
    return sendUnavailable(response, "PROJECTION_RECONCILIATION_UNAVAILABLE");
  }
});

export const drainCleaningCompanyProjectionOutbox = onSchedule({
  region: FUNCTION_REGION,
  schedule: "every 1 minutes",
  timeZone: "Etc/UTC",
  memory: "256MiB",
  timeoutSeconds: 120,
  concurrency: 1,
  maxInstances: 1,
  secrets: [DATABASE_URL],
}, async () => {
  try {
    const result = await getProjectionReconciler().runOnce({ limit: 20 });
    logger.info("Cleaning company projection outbox completed", result);
  } catch (error) {
    logger.error("Cleaning company projection outbox failed", {
      code: String(error?.code || "PROJECTION_OUTBOX_FAILED"),
    });
    throw new Error("PROJECTION_OUTBOX_FAILED");
  }
});
