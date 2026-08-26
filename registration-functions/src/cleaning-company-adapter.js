import {
  REGISTRATION_ACTION,
  REGISTRATION_CHANNEL,
  identityFromBeforeCreate,
  registrationGrantCandidate,
} from "./registration-contract.js";

export const cleaningCompanyRegistrationAdapter = Object.freeze({
  channel: REGISTRATION_CHANNEL.CLEANING_COMPANY,
  action: REGISTRATION_ACTION.CLEANING_COMPANY,

  candidateFromEvent({ event, hmacKey }) {
    const identity = identityFromBeforeCreate(event);
    return registrationGrantCandidate({
      hmacKey,
      channel: REGISTRATION_CHANNEL.CLEANING_COMPANY,
      action: REGISTRATION_ACTION.CLEANING_COMPANY,
      providerId: identity.providerId,
      subject: identity.subject,
    });
  },

  claimsForGrant() {
    return {
      cleanziInitialRegistrationChannel: REGISTRATION_CHANNEL.CLEANING_COMPANY,
      cleanziRegistrationGrantVersion: 1,
    };
  },
});
