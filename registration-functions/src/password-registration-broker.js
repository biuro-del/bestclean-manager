import { randomUUID } from "node:crypto";
import {
  REGISTRATION_CHANNEL,
  RegistrationGateError,
  normalizedNow,
} from "./registration-contract.js";
import {
  PASSWORD_REGISTRATION_STATUS,
  CLEANING_COMPANY_TRIAL_DURATION_MS,
  assertCleaningCompanyTurnstile,
  assertVerificationContinueUrl,
  cleaningCompanyTrialWindow,
  derivePasswordRegistrationIdentifiers,
  normalizeCleaningCompanyPasswordRequest,
  passwordRegistrationPrivateSnapshot,
  passwordRegistrationRequestFingerprint,
} from "./password-registration-contract.js";
import {
  decryptVerificationLink,
  encryptVerificationLink,
} from "./verification-link-envelope.js";

function assertMethod(target, method, code) {
  if (typeof target?.[method] !== "function") {
    throw new RegistrationGateError(code);
  }
}

function errorCode(error) {
  return String(error?.code || error?.publicCode || error?.message || "UNKNOWN");
}

function isAlreadyExists(error) {
  return [
    "auth/uid-already-exists",
    "auth/email-already-exists",
    "EMAIL_ALREADY_EXISTS",
  ].includes(errorCode(error));
}

function isDefinitiveAuthReconciliationFailure(error) {
  return [
    "auth/user-not-found",
    "REGISTRATION_AUTH_IDENTITY_MISMATCH",
  ].includes(errorCode(error));
}

function publicResult(operation) {
  const emailVerified = Number.isSafeInteger(operation.emailVerifiedObservedAtMs);
  return Object.freeze({
    status: emailVerified
      ? "EMAIL_VERIFIED"
      : operation.status === PASSWORD_REGISTRATION_STATUS.COMPLETED
        ? "EMAIL_VERIFICATION_REQUIRED"
        : "EMAIL_DELIVERY_PENDING",
    trialStartedAtMs: operation.trialStartedAtMs,
    trialEndsAtMs: operation.trialEndsAtMs,
    trialDays: operation.trialDays,
    emailVerified,
    operationalAccess: false,
  });
}

async function loadOrCreateAuthUser({ auth, operation, request }) {
  try {
    const existing = await auth.getUser(operation.uid);
    if (existing?.email?.toLowerCase() !== request.email) {
      throw new RegistrationGateError("REGISTRATION_AUTH_IDENTITY_MISMATCH");
    }
    return { user: existing, createdNow: false };
  } catch (lookupError) {
    if (errorCode(lookupError) !== "auth/user-not-found") throw lookupError;
  }

  try {
    const user = await auth.createUser({
      uid: operation.uid,
      email: request.email,
      password: request.password,
      displayName: request.displayName,
      emailVerified: false,
      disabled: false,
    });
    return { user, createdNow: true };
  } catch (createError) {
    if (!isAlreadyExists(createError)) throw createError;
    try {
      const existing = await auth.getUser(operation.uid);
      if (existing?.email?.toLowerCase() === request.email) {
        return { user: existing, createdNow: false };
      }
    } catch {
      // The public error below intentionally avoids account enumeration details.
    }
    throw new RegistrationGateError("ACCOUNT_ALREADY_EXISTS_USE_LOGIN");
  }
}

async function compensateAuthUser({ auth, operationStore, operation, cause, now }) {
  const compensationId = randomUUID();
  let claim;
  try {
    claim = await operationStore.beginCompensation({
      operationId: operation.operationId,
      expectedStatuses: [operation.status],
      compensationId,
      failureCode: errorCode(cause),
      nowMs: normalizedNow(now()),
    });
  } catch {
    throw new RegistrationGateError("REGISTRATION_RECOVERY_REQUIRED");
  }
  if (!claim.acquired) {
    return Object.freeze({
      compensated: false,
      operation: claim.operation,
    });
  }
  try {
    await auth.deleteUser(operation.uid);
    const compensatedOperation = await operationStore.transition({
      operationId: operation.operationId,
      expectedStatuses: [PASSWORD_REGISTRATION_STATUS.RECOVERY_REQUIRED],
      nextStatus: PASSWORD_REGISTRATION_STATUS.RESERVED,
      patch: {
        lastFailureCode: errorCode(cause),
        authCompensatedAtMs: normalizedNow(now()),
        compensationId: null,
        compensationStartedAtMs: null,
      },
    });
    return Object.freeze({
      compensated: true,
      operation: compensatedOperation,
    });
  } catch (compensationError) {
    try {
      await operationStore.transition({
        operationId: operation.operationId,
        expectedStatuses: [PASSWORD_REGISTRATION_STATUS.RECOVERY_REQUIRED],
        nextStatus: PASSWORD_REGISTRATION_STATUS.RECOVERY_REQUIRED,
        patch: {
          lastFailureCode: errorCode(cause),
          compensationFailureCode: errorCode(compensationError),
        },
      });
    } catch {
      // The reset to RESERVED may already have committed before its response was lost.
      // Never turn that safe outcome into another destructive compensation attempt.
    }
    throw new RegistrationGateError("REGISTRATION_RECOVERY_REQUIRED");
  }
}

async function prepareVerificationLink({
  auth,
  operationStore,
  operation,
  request,
  verificationContinueUrl,
  hmacKey,
  now,
}) {
  const leaseId = randomUUID();
  const preparation = await operationStore.beginVerificationLink({
    operationId: operation.operationId,
    leaseId,
    nowMs: normalizedNow(now()),
  });
  if (preparation.action === "BUSY") {
    return Object.freeze({ busy: true, operation: preparation.operation });
  }
  if (preparation.action === "USE_EXISTING") {
    return Object.freeze({
      busy: false,
      operation: preparation.operation,
      verificationUrl: decryptVerificationLink({
        envelope: preparation.operation.verificationLinkEnvelope,
        operationId: operation.operationId,
        hmacKey,
      }),
    });
  }

  try {
    const verificationUrl = await auth.generateEmailVerificationLink(
      request.email,
      { url: verificationContinueUrl },
    );
    const envelope = encryptVerificationLink({
      verificationUrl,
      operationId: operation.operationId,
      hmacKey,
    });
    const stored = await operationStore.storeVerificationLink({
      operationId: operation.operationId,
      leaseId,
      envelope,
      nowMs: normalizedNow(now()),
    });
    return Object.freeze({
      busy: false,
      operation: stored,
      verificationUrl,
    });
  } catch (linkError) {
    let released;
    try {
      released = await operationStore.releaseVerificationLink({
        operationId: operation.operationId,
        leaseId,
        nowMs: normalizedNow(now()),
      });
    } catch {
      throw new RegistrationGateError("REGISTRATION_RECOVERY_REQUIRED");
    }
    if (!released.released && released.operation.verificationLinkEnvelope) {
      return Object.freeze({
        busy: false,
        operation: released.operation,
        verificationUrl: decryptVerificationLink({
          envelope: released.operation.verificationLinkEnvelope,
          operationId: operation.operationId,
          hmacKey,
        }),
      });
    }
    if (!released.released) {
      throw new RegistrationGateError("REGISTRATION_RECOVERY_REQUIRED");
    }
    const pending = await operationStore.transition({
      operationId: operation.operationId,
      expectedStatuses: [PASSWORD_REGISTRATION_STATUS.ORGANIZATION_CREATED],
      nextStatus: PASSWORD_REGISTRATION_STATUS.VERIFICATION_PENDING,
      patch: { verificationFailureCode: errorCode(linkError) },
    });
    return Object.freeze({ busy: true, operation: pending });
  }
}

async function markRecoveryRequired({ operationStore, operation, cause }) {
  await operationStore.transition({
    operationId: operation.operationId,
    expectedStatuses: [operation.status],
    nextStatus: PASSWORD_REGISTRATION_STATUS.RECOVERY_REQUIRED,
    patch: { lastFailureCode: errorCode(cause) },
  });
  throw new RegistrationGateError("REGISTRATION_RECOVERY_REQUIRED");
}

export function createCleaningCompanyPasswordRegistrationBroker({
  auth,
  operationStore,
  attemptAuthority,
  organizationProvisioner,
  turnstileVerifier,
  verificationMailer,
  passwordPolicy,
  abuseGuard,
  hmacKey,
  allowedHostnames,
  verificationContinueUrl,
  now = () => Date.now(),
}) {
  assertMethod(auth, "getUser", "AUTH_ADMIN_REQUIRED");
  assertMethod(auth, "createUser", "AUTH_ADMIN_REQUIRED");
  assertMethod(auth, "deleteUser", "AUTH_ADMIN_REQUIRED");
  assertMethod(auth, "setCustomUserClaims", "AUTH_ADMIN_REQUIRED");
  assertMethod(auth, "generateEmailVerificationLink", "AUTH_ADMIN_REQUIRED");
  assertMethod(operationStore, "find", "OPERATION_STORE_REQUIRED");
  assertMethod(operationStore, "reserve", "OPERATION_STORE_REQUIRED");
  assertMethod(operationStore, "transition", "OPERATION_STORE_REQUIRED");
  assertMethod(operationStore, "beginCompensation", "OPERATION_STORE_REQUIRED");
  assertMethod(operationStore, "beginVerificationLink", "OPERATION_STORE_REQUIRED");
  assertMethod(operationStore, "storeVerificationLink", "OPERATION_STORE_REQUIRED");
  assertMethod(operationStore, "releaseVerificationLink", "OPERATION_STORE_REQUIRED");
  assertMethod(attemptAuthority, "authorizePasswordRegistration", "ATTEMPT_AUTHORITY_REQUIRED");
  assertMethod(organizationProvisioner, "provisionCleaningCompany", "ORGANIZATION_PROVISIONER_REQUIRED");
  assertMethod(turnstileVerifier, "verify", "TURNSTILE_VERIFIER_REQUIRED");
  assertMethod(verificationMailer, "sendVerification", "VERIFICATION_MAILER_REQUIRED");
  assertMethod(passwordPolicy, "assertAllowed", "PASSWORD_POLICY_REQUIRED");
  assertMethod(abuseGuard, "assertAllowed", "ABUSE_GUARD_REQUIRED");
  const safeVerificationContinueUrl = assertVerificationContinueUrl(
    verificationContinueUrl,
    allowedHostnames,
  );

  return Object.freeze({
    async register(input) {
      const request = normalizeCleaningCompanyPasswordRequest(input);
      const identifiers = derivePasswordRegistrationIdentifiers({ request, hmacKey });
      const verification = await turnstileVerifier.verify({
        token: input.turnstileToken,
        expectedAction: request.action,
      });
      if (verification?.reason === "PROVIDER_UNAVAILABLE") {
        throw new RegistrationGateError("TURNSTILE_PROVIDER_UNAVAILABLE");
      }
      assertCleaningCompanyTurnstile({ verification, allowedHostnames });

      await abuseGuard.assertAllowed({
        channel: REGISTRATION_CHANNEL.CLEANING_COMPANY,
        registrationId: request.registrationId,
        emailHmac: identifiers.emailHmac,
      });

      const requestFingerprint = passwordRegistrationRequestFingerprint(
        request,
        hmacKey,
      );
      const reservation = {
        ...identifiers,
        registrationId: request.registrationId,
        requestFingerprint,
        channel: REGISTRATION_CHANNEL.CLEANING_COMPANY,
        createdAtMs: normalizedNow(now()),
      };
      let operation = await operationStore.find(reservation);

      if (operation?.status === PASSWORD_REGISTRATION_STATUS.RECOVERY_REQUIRED) {
        throw new RegistrationGateError("REGISTRATION_RECOVERY_REQUIRED");
      }

      if (!operation) {
        await passwordPolicy.assertAllowed(request.password, {
          email: request.email,
          firstName: request.firstName,
          lastName: request.lastName,
        });
      }

      let sourceAuthorization = null;
      if (
        !operation ||
        [
          PASSWORD_REGISTRATION_STATUS.RESERVED,
          PASSWORD_REGISTRATION_STATUS.AUTH_CREATED,
        ].includes(operation.status)
      ) {
        sourceAuthorization = await attemptAuthority.authorizePasswordRegistration(
          passwordRegistrationPrivateSnapshot(request),
          {
            registrationToken: request.registrationToken,
            operationId: identifiers.operationId,
            uid: identifiers.uid,
            orgId: identifiers.orgId,
            allowExpiredUnboundRetry:
              operation?.status === PASSWORD_REGISTRATION_STATUS.AUTH_CREATED,
          },
        );
      }

      if (!operation) {
        operation = await operationStore.reserve(reservation);
      }

      if (operation.status !== PASSWORD_REGISTRATION_STATUS.RESERVED) {
        try {
          const existing = await auth.getUser(operation.uid);
          if (existing?.email?.toLowerCase() !== request.email) {
            throw new RegistrationGateError("REGISTRATION_AUTH_IDENTITY_MISMATCH");
          }
          if (existing.emailVerified === true) {
            operation = await operationStore.transition({
              operationId: operation.operationId,
              expectedStatuses: [operation.status],
              nextStatus: PASSWORD_REGISTRATION_STATUS.COMPLETED,
              patch: { emailVerifiedObservedAtMs: normalizedNow(now()) },
            });
            return publicResult(operation);
          }
        } catch (reconciliationError) {
          if (isDefinitiveAuthReconciliationFailure(reconciliationError)) {
            return markRecoveryRequired({
              operationStore,
              operation,
              cause: reconciliationError,
            });
          }
          throw reconciliationError;
        }
      }
      if (operation.status === PASSWORD_REGISTRATION_STATUS.COMPLETED) {
        return publicResult(operation);
      }

      let createdAuthNow = false;
      if (operation.status === PASSWORD_REGISTRATION_STATUS.RESERVED) {
        try {
          const authResult = await loadOrCreateAuthUser({ auth, operation, request });
          createdAuthNow = authResult.createdNow;
          await auth.setCustomUserClaims(operation.uid, {
            cleanziInitialRegistrationChannel: REGISTRATION_CHANNEL.CLEANING_COMPANY,
            cleanziRegistrationGrantVersion: 1,
          });
          operation = await operationStore.transition({
            operationId: operation.operationId,
            expectedStatuses: [PASSWORD_REGISTRATION_STATUS.RESERVED],
            nextStatus: PASSWORD_REGISTRATION_STATUS.AUTH_CREATED,
            patch: { authCreatedAtMs: normalizedNow(now()) },
          });
        } catch (authError) {
          if (createdAuthNow) {
            const compensation = await compensateAuthUser({
              auth,
              operationStore,
              operation,
              cause: authError,
              now,
            });
            if (!compensation.compensated) {
              operation = compensation.operation;
            } else {
              throw authError;
            }
          } else if (errorCode(authError) === "REGISTRATION_OPERATION_STATE_CONFLICT") {
            operation = await operationStore.reserve(reservation);
          } else {
            throw authError;
          }
        }
      }

      if (operation.status === PASSWORD_REGISTRATION_STATUS.RECOVERY_REQUIRED) {
        throw new RegistrationGateError("REGISTRATION_RECOVERY_REQUIRED");
      }
      if (operation.status === PASSWORD_REGISTRATION_STATUS.COMPLETED) {
        return publicResult(operation);
      }

      if (operation.status === PASSWORD_REGISTRATION_STATUS.AUTH_CREATED) {
        const trial = cleaningCompanyTrialWindow(normalizedNow(now()));
        try {
          const provisioned = await organizationProvisioner.provisionCleaningCompany({
            operationId: operation.operationId,
            uid: operation.uid,
            orgId: operation.orgId,
            sourceAuthorization,
            email: request.email,
            owner: {
              firstName: request.firstName,
              lastName: request.lastName,
              displayName: request.displayName,
              phone: request.phone,
            },
            selectedPlanCode: request.selectedPlanCode,
            billingCycle: request.billingCycle,
            locale: request.locale,
            timezone: request.timezone,
            onboardingStatus: "IN_PROGRESS",
            emailVerificationStatus: "PENDING",
            subscription: {
              planCode: "TRIAL",
              status: "TRIALING",
              ...trial,
              autoConvert: false,
              paymentMethodRequired: false,
            },
          });
          if (
            provisioned?.orgId !== operation.orgId ||
            !Number.isSafeInteger(provisioned?.trialStartedAtMs) ||
            !Number.isSafeInteger(provisioned?.trialEndsAtMs) ||
            provisioned.trialEndsAtMs - provisioned.trialStartedAtMs !==
              CLEANING_COMPANY_TRIAL_DURATION_MS ||
            (
              provisioned?.createdNow !== false &&
              (
                provisioned.trialStartedAtMs !== trial.trialStartedAtMs ||
                provisioned.trialEndsAtMs !== trial.trialEndsAtMs
              )
            )
          ) {
            throw new RegistrationGateError("ORGANIZATION_PROVISIONING_MISMATCH");
          }
          const authoritativeTrial = {
            trialStartedAtMs: provisioned.trialStartedAtMs,
            trialEndsAtMs: provisioned.trialEndsAtMs,
            trialDays: 14,
          };
          operation = await operationStore.transition({
            operationId: operation.operationId,
            expectedStatuses: [PASSWORD_REGISTRATION_STATUS.AUTH_CREATED],
            nextStatus: PASSWORD_REGISTRATION_STATUS.ORGANIZATION_CREATED,
            patch: {
              ...authoritativeTrial,
              organizationCreatedAtMs: authoritativeTrial.trialStartedAtMs,
            },
          });
        } catch (provisioningError) {
          if (errorCode(provisioningError) === "REGISTRATION_OPERATION_STATE_CONFLICT") {
            operation = await operationStore.reserve(reservation);
          } else if (provisioningError?.safeToCompensateAuth === true) {
            // Once AUTH_CREATED is durable, another request may already be
            // committing the SQL graph. Deleting the shared Firebase user can
            // therefore orphan a successfully committed organization. Keep the
            // non-operational account and let the idempotent provisioner retry.
            try {
              operation = await operationStore.transition({
                operationId: operation.operationId,
                expectedStatuses: [PASSWORD_REGISTRATION_STATUS.AUTH_CREATED],
                nextStatus: PASSWORD_REGISTRATION_STATUS.AUTH_CREATED,
                patch: { lastFailureCode: errorCode(provisioningError) },
              });
            } catch (stateError) {
              if (errorCode(stateError) !== "REGISTRATION_OPERATION_STATE_CONFLICT") {
                throw stateError;
              }
              operation = await operationStore.reserve(reservation);
            }
            if (operation.status === PASSWORD_REGISTRATION_STATUS.AUTH_CREATED) {
              throw provisioningError;
            }
          } else {
            return markRecoveryRequired({
              operationStore,
              operation,
              cause: provisioningError,
            });
          }
        }
      }

      if (operation.status === PASSWORD_REGISTRATION_STATUS.RECOVERY_REQUIRED) {
        throw new RegistrationGateError("REGISTRATION_RECOVERY_REQUIRED");
      }
      if (operation.status === PASSWORD_REGISTRATION_STATUS.COMPLETED) {
        return publicResult(operation);
      }

      let preparedLink;
      try {
        preparedLink = await prepareVerificationLink({
          auth,
          operationStore,
          operation,
          request,
          verificationContinueUrl: safeVerificationContinueUrl,
          hmacKey,
          now,
        });
      } catch (linkError) {
        return markRecoveryRequired({
          operationStore,
          operation,
          cause: linkError,
        });
      }
      operation = preparedLink.operation;
      if (preparedLink.busy) return publicResult(operation);

      let mailError = null;
      try {
        await verificationMailer.sendVerification({
          idempotencyKey: operation.operationId,
          email: request.email,
          displayName: request.displayName,
          verificationUrl: preparedLink.verificationUrl,
          locale: request.locale,
        });
      } catch (error) {
        mailError = error;
      }

      if (mailError) {
        try {
          operation = await operationStore.transition({
            operationId: operation.operationId,
            expectedStatuses: [PASSWORD_REGISTRATION_STATUS.VERIFICATION_PENDING],
            nextStatus: PASSWORD_REGISTRATION_STATUS.VERIFICATION_PENDING,
            patch: { verificationFailureCode: errorCode(mailError) },
          });
        } catch (transitionError) {
          if (errorCode(transitionError) !== "REGISTRATION_OPERATION_STATE_CONFLICT") {
            throw transitionError;
          }
          operation = await operationStore.reserve(reservation);
          if (operation.status !== PASSWORD_REGISTRATION_STATUS.COMPLETED) {
            throw transitionError;
          }
        }
        return publicResult(operation);
      }

      try {
        operation = await operationStore.transition({
          operationId: operation.operationId,
          expectedStatuses: [PASSWORD_REGISTRATION_STATUS.VERIFICATION_PENDING],
          nextStatus: PASSWORD_REGISTRATION_STATUS.COMPLETED,
          patch: {
            verificationSentAtMs: normalizedNow(now()),
            verificationLinkEnvelope: null,
            verificationLinkLeaseId: null,
            verificationLinkLeaseUntilMs: null,
          },
        });
      } catch (transitionError) {
        if (errorCode(transitionError) !== "REGISTRATION_OPERATION_STATE_CONFLICT") {
          throw transitionError;
        }
        operation = await operationStore.reserve(reservation);
        if (operation.status !== PASSWORD_REGISTRATION_STATUS.COMPLETED) {
          throw transitionError;
        }
      }

      return publicResult(operation);
    },
  });
}
