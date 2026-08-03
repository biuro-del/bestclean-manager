import {
  REGISTRATION_ACTION,
  REGISTRATION_CHANNEL,
  RegistrationGateError,
  assertBeforeCreateContext,
  normalizedNow,
  registrationGrantDocumentId,
  requiredText,
} from "./registration-contract.js";

const REQUIRED_CHANNELS = Object.freeze([
  REGISTRATION_CHANNEL.FACILITY_MANAGER,
  REGISTRATION_CHANNEL.CLEANING_COMPANY,
]);

export function assertCentralGateActivationReady(adapters) {
  if (!Array.isArray(adapters)) {
    throw new RegistrationGateError("CENTRAL_GATE_INCOMPLETE");
  }

  const byChannel = new Map();
  const actions = new Set();
  for (const adapter of adapters) {
    const channel = requiredText(
      adapter?.channel,
      "INVALID_REGISTRATION_ADAPTER",
    );
    const expectedAction = REGISTRATION_ACTION[channel];
    if (
      !expectedAction ||
      adapter?.action !== expectedAction ||
      typeof adapter?.candidateFromEvent !== "function" ||
      typeof adapter?.claimsForGrant !== "function" ||
      byChannel.has(channel) ||
      actions.has(adapter.action)
    ) {
      throw new RegistrationGateError("INVALID_REGISTRATION_ADAPTER");
    }
    byChannel.set(channel, adapter);
    actions.add(adapter.action);
  }

  if (REQUIRED_CHANNELS.some((channel) => !byChannel.has(channel))) {
    throw new RegistrationGateError("CENTRAL_GATE_INCOMPLETE");
  }
  return byChannel;
}

export async function authorizeCentralBeforeCreate(
  event,
  {
    adapters,
    grantStore,
    hmacKeysByChannel,
    allowedResources,
    nowMs = Date.now(),
  },
) {
  const byChannel = assertCentralGateActivationReady(adapters);
  if (typeof grantStore?.consumeExactlyOne !== "function") {
    throw new RegistrationGateError("GRANT_STORE_REQUIRED");
  }
  assertBeforeCreateContext(event, allowedResources);

  const candidates = [];
  for (const adapter of byChannel.values()) {
    const hmacKey = hmacKeysByChannel?.[adapter.channel];
    const candidate = adapter.candidateFromEvent({ event, hmacKey });
    if (candidate) candidates.push(candidate);
  }

  const uniqueCandidates = [
    ...new Map(
      candidates.map((candidate) => [
        registrationGrantDocumentId(candidate),
        candidate,
      ]),
    ).values(),
  ];
  if (uniqueCandidates.length === 0) {
    throw new RegistrationGateError("REGISTRATION_GRANT_REQUIRED");
  }

  const consumed = await grantStore.consumeExactlyOne({
    candidates: uniqueCandidates,
    nowMs: normalizedNow(nowMs),
    consumedByUid: requiredText(event?.data?.uid, "INVALID_UID", 128),
    consumedByEventId: requiredText(
      event?.eventId,
      "INVALID_EVENT_ID",
      256,
    ),
  });
  if (!consumed) {
    throw new RegistrationGateError("REGISTRATION_GRANT_REQUIRED");
  }

  const adapter = byChannel.get(consumed.channel);
  if (!adapter) {
    throw new RegistrationGateError("CONSUMED_GRANT_CHANNEL_MISMATCH");
  }
  return { customClaims: adapter.claimsForGrant(consumed) };
}
