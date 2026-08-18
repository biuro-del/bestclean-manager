import {
  PASSWORD_REGISTRATION_STATUS,
} from "./password-registration-contract.js";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function denied(code, extras = {}) {
  return Object.freeze({
    portalAllowed: false,
    onboardingAllowed: false,
    operationalAllowed: false,
    code,
    ...extras,
  });
}
export function evaluateCleaningCompanyRegistrationAccess({
  decodedToken,
  operation,
  organization,
  nowMs = Date.now(),
}) {
  const uid = text(decodedToken?.uid || decodedToken?.sub);
  if (!uid || uid !== text(operation?.uid)) {
    return denied("REGISTRATION_IDENTITY_MISMATCH");
  }
  if (
    ![
      PASSWORD_REGISTRATION_STATUS.COMPLETED,
      PASSWORD_REGISTRATION_STATUS.VERIFICATION_PENDING,
    ].includes(operation?.status)
  ) {
    return denied("REGISTRATION_INCOMPLETE");
  }
  if (decodedToken?.email_verified !== true) {
    return denied("EMAIL_VERIFICATION_REQUIRED");
  }
  if (
    text(organization?.orgId) !== text(operation?.orgId) ||
    upper(organization?.kind) !== "CLEANING_PROVIDER"
  ) {
    return denied("CLEANING_COMPANY_ORGANIZATION_MISSING");
  }

  const onboardingStatus = upper(organization?.onboardingStatus);
  if (onboardingStatus !== "COMPLETED") {
    return Object.freeze({
      portalAllowed: true,
      onboardingAllowed: true,
      operationalAllowed: false,
      code: "ONBOARDING_REQUIRED",
    });
  }

  const subscription = organization?.subscription || {};
  const trialEndsAtMs = Number(subscription.trialEndsAtMs);
  const currentTime = Number(nowMs);
  if (
    upper(subscription.planCode) !== "TRIAL" ||
    upper(subscription.status) !== "TRIALING" ||
    !Number.isSafeInteger(currentTime) ||
    !Number.isSafeInteger(trialEndsAtMs) ||
    trialEndsAtMs <= currentTime
  ) {
    return Object.freeze({
      portalAllowed: true,
      onboardingAllowed: false,
      operationalAllowed: false,
      code: "SUBSCRIPTION_INACTIVE",
    });
  }

  return Object.freeze({
    portalAllowed: true,
    onboardingAllowed: true,
    operationalAllowed: true,
    code: "ACCESS_ALLOWED",
  });
}
