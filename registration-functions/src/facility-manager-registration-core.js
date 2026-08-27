export const FACILITY_MANAGER_REGISTRATION_CHANNEL = "FACILITY_MANAGER";
export const FACILITY_MANAGER_REGISTRATION_ACTION = "registration_facility_manager";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export class FacilityManagerRegistrationError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "FacilityManagerRegistrationError";
    this.code = code;
  }
}

export function facilityManagerRequiredText(value, code, maxLength = 512) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > maxLength) {
    throw new FacilityManagerRegistrationError(code);
  }
  return text;
}

export function normalizeFacilityManagerRegistrationEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new FacilityManagerRegistrationError("INVALID_EMAIL");
  }
  return email;
}

export function normalizeFacilityManagerRegistrationNow(value) {
  const nowMs = Number(value);
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0) {
    throw new FacilityManagerRegistrationError("INVALID_NOW");
  }
  return nowMs;
}
