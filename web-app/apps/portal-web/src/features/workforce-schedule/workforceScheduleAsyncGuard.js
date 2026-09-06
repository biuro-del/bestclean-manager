function text(value) {
  return String(value ?? '').trim()
}

export function createWorkforceScheduleAsyncGuard(getOrgId) {
  if (typeof getOrgId !== 'function') {
    throw new TypeError('Async guard requires getOrgId.')
  }

  let sessionSequence = 0
  let operationSequence = 0
  let busyOwner = null

  function capture() {
    return Object.freeze({
      orgId: text(getOrgId()),
      sessionSequence,
    })
  }

  function isCurrent(context) {
    return Boolean(
      context
      && context.sessionSequence === sessionSequence
      && text(context.orgId) === text(getOrgId()),
    )
  }

  function beginBusy() {
    if (busyOwner) return null
    busyOwner = Object.freeze({
      ...capture(),
      token: ++operationSequence,
    })
    return busyOwner
  }

  function releaseBusy(context) {
    if (!isCurrent(context) || busyOwner?.token !== context?.token) return false
    busyOwner = null
    return true
  }

  function resetSession() {
    sessionSequence += 1
    busyOwner = null
    return sessionSequence
  }

  return {
    beginBusy,
    capture,
    isCurrent,
    releaseBusy,
    resetSession,
  }
}
