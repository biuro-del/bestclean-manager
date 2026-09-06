function text(value) {
  return String(value ?? '').trim()
}

function unconfirmedSyncError(orgId, result) {
  const error = new Error('Serwer nie potwierdził synchronizacji katalogu Grafiku.')
  error.code = 'WORKFORCE_SCHEDULE_CATALOG_SYNC_NOT_CONFIRMED'
  error.details = {
    expectedOrgId: orgId,
    receivedOrgId: text(result?.orgId),
  }
  return error
}

export function isConfirmedWorkforceScheduleCatalogSyncResponse(orgIdValue, result) {
  const orgId = text(orgIdValue)
  return Boolean(
    orgId
    && result
    && typeof result === 'object'
    && !Array.isArray(result)
    && result.ok === true
    && text(result.orgId) === orgId
    && typeof result.idempotent === 'boolean'
    && result.effects?.delivery === false
    && result.effects?.notifications === false
    && result.effects?.downstream === false
    && Array.isArray(result.people)
    && result.people.every((person) => Boolean(text(person?.personId)))
    && Array.isArray(result.locations)
    && result.locations.every((location) => Boolean(text(location?.locationId))),
  )
}

/**
 * Keeps catalog synchronization scoped to one organization and one active
 * session. A failed or unconfirmed operation remains retryable, while
 * concurrent refreshes for the same organization share one request.
 */
export function createWorkforceScheduleCatalogSyncGate() {
  const completedOrgIds = new Set()
  const pendingByOrgId = new Map()
  let generation = 0

  function isComplete(orgIdValue) {
    const orgId = text(orgIdValue)
    return Boolean(orgId && completedOrgIds.has(orgId))
  }

  async function run(orgIdValue, operation) {
    const orgId = text(orgIdValue)
    if (!orgId) throw new TypeError('Catalog synchronization requires an organization ID.')
    if (typeof operation !== 'function') throw new TypeError('Catalog synchronization requires an operation.')
    if (isComplete(orgId)) return { alreadyComplete: true }
    if (pendingByOrgId.has(orgId)) return pendingByOrgId.get(orgId)

    const runGeneration = generation
    const promise = Promise.resolve()
      .then(operation)
      .then((result) => {
        if (!isConfirmedWorkforceScheduleCatalogSyncResponse(orgId, result)) {
          throw unconfirmedSyncError(orgId, result)
        }
        if (generation === runGeneration) completedOrgIds.add(orgId)
        return result
      })
      .finally(() => {
        if (pendingByOrgId.get(orgId) === promise) pendingByOrgId.delete(orgId)
      })

    pendingByOrgId.set(orgId, promise)
    return promise
  }

  function reset() {
    generation += 1
    completedOrgIds.clear()
    pendingByOrgId.clear()
  }

  return { isComplete, reset, run }
}
