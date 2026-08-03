import {
  REGISTRATION_ACTION,
  REGISTRATION_CHANNEL,
  identityFromBeforeCreate,
  registrationGrantCandidate,
} from "./registration-contract.js";

export const facilityManagerRegistrationAdapter = Object.freeze({
  channel: REGISTRATION_CHANNEL.FACILITY_MANAGER,
  action: REGISTRATION_ACTION.FACILITY_MANAGER,

  candidateFromEvent({ event, hmacKey }) {
    const identity = identityFromBeforeCreate(event);
    return registrationGrantCandidate({
      hmacKey,
      channel: REGISTRATION_CHANNEL.FACILITY_MANAGER,
      action: REGISTRATION_ACTION.FACILITY_MANAGER,
      providerId: identity.providerId,
      subject: identity.subject,
    });
  },

  claimsForGrant() {
    return {
      cleanziInitialRegistrationChannel: REGISTRATION_CHANNEL.FACILITY_MANAGER,
      cleanziRegistrationGrantVersion: 1,
    };
  },
});
