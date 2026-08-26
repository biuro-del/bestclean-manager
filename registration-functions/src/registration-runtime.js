import { randomUUID } from "node:crypto";
import pg from "pg";
import { createCleaningCompanyPasswordRegistrationBroker } from "./password-registration-broker.js";
import { createCloudflareTurnstileVerifier } from "./cloudflare-turnstile-verifier.js";
import { createFirestoreCleaningProviderProjector } from "./firestore-cleaning-provider-projector.js";
import { createFirestorePasswordRegistrationOperationStore } from "./firestore-password-registration-operation-store.js";
import { createFirestoreRegistrationAbuseGuard } from "./firestore-registration-abuse-guard.js";
import { createFirestoreVerificationDeliveryStore } from "./firestore-verification-delivery-store.js";
import { createCleaningCompanyPasswordPolicy, createPwnedPasswordChecker } from "./password-policy.js";
import { createPostgresCleaningCompanyProvisioner } from "./postgres-cleaning-company-provisioner.js";
import { createPostgresRegistrationAttemptAuthority } from "./postgres-registration-attempt-authority.js";
import {
  createCleaningProviderProjectionReconciler,
  createPostgresRegistrationProjectionOutbox,
} from "./postgres-registration-projection-outbox.js";
import { createResendVerificationMailer } from "./resend-verification-mailer.js";
import { normalizeDatabaseUrl } from "./registration-runtime-config.js";

const { Pool } = pg;
let sharedPool;
let sharedDatabaseUrl;

export function getSharedRegistrationPool(databaseUrl, { poolFactory } = {}) {
  const safeUrl = normalizeDatabaseUrl(databaseUrl);
  if (sharedPool) {
    if (sharedDatabaseUrl !== safeUrl) throw new Error("DATABASE_URL_CHANGED_DURING_RUNTIME");
    return sharedPool;
  }
  const createPool = typeof poolFactory === "function"
    ? poolFactory
    : (options) => new Pool(options);
  sharedPool = createPool({
    connectionString: safeUrl,
    application_name: "cleanzi-registration-functions",
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  sharedDatabaseUrl = safeUrl;
  return sharedPool;
}

export function createCleaningCompanyRegistrationRuntime({
  auth,
  db,
  pool,
  configuration,
  secrets,
  fetchImpl = fetch,
}) {
  const operationStore = createFirestorePasswordRegistrationOperationStore({
    db,
    collectionName: configuration.passwordOperationCollection,
  });
  const abuseGuard = createFirestoreRegistrationAbuseGuard({
    db,
    collectionName: configuration.abuseCollection,
  });
  const deliveryStore = createFirestoreVerificationDeliveryStore({
    db,
    collection: configuration.verificationDeliveryCollection,
  });
  const compromisedPasswordChecker = createPwnedPasswordChecker({
    fetchImpl,
    userAgent: configuration.passwordCheckUserAgent,
  });
  const passwordPolicy = createCleaningCompanyPasswordPolicy({
    compromisedPasswordChecker,
  });
  const turnstileVerifier = createCloudflareTurnstileVerifier({
    secret: secrets.turnstileSecret,
    fetchImpl,
  });
  const verificationMailer = createResendVerificationMailer({
    apiKey: secrets.resendApiKey,
    from: configuration.verificationFrom,
    replyTo: configuration.verificationReplyTo,
    deliveryStore,
    hmacKey: secrets.hmacSecret,
    fetchImpl,
  });
  const broker = createCleaningCompanyPasswordRegistrationBroker({
    auth,
    operationStore,
    attemptAuthority: createPostgresRegistrationAttemptAuthority({ pool }),
    organizationProvisioner: createPostgresCleaningCompanyProvisioner({ pool }),
    turnstileVerifier,
    verificationMailer,
    passwordPolicy,
    abuseGuard,
    hmacKey: secrets.hmacSecret,
    allowedHostnames: configuration.allowedHostnames,
    verificationContinueUrl: configuration.verificationContinueUrl,
  });
  return Object.freeze({ broker });
}

export function createCleaningProviderProjectionRuntime({
  db,
  pool,
  workerId = `cleanzi-registration:${process.env.K_REVISION || "local"}:${randomUUID()}`,
}) {
  const outbox = createPostgresRegistrationProjectionOutbox({ pool, workerId });
  const projector = createFirestoreCleaningProviderProjector({ db });
  return Object.freeze({
    reconciler: createCleaningProviderProjectionReconciler({ outbox, projector }),
  });
}

export function resetSharedRegistrationPoolForTests() {
  sharedPool = undefined;
  sharedDatabaseUrl = undefined;
}
