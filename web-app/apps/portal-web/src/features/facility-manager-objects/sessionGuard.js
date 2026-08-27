function sessionKey(value) {
  return String(value ?? '')
}

export function createSessionEpochGuard(getCurrentSessionKey) {
  let epoch = 0
  let latestRequest = 0

  function capture() {
    return {
      epoch,
      sessionKey: sessionKey(getCurrentSessionKey()),
    }
  }

  function isCurrent(token) {
    return Boolean(token) && token.epoch === epoch && token.sessionKey === sessionKey(getCurrentSessionKey())
  }

  function startRequest() {
    latestRequest += 1
    return {
      ...capture(),
      request: latestRequest,
    }
  }

  function isCurrentRequest(token) {
    return isCurrent(token) && token.request === latestRequest
  }

  function invalidate() {
    epoch += 1
    latestRequest += 1
  }

  return { capture, isCurrent, startRequest, isCurrentRequest, invalidate }
}
