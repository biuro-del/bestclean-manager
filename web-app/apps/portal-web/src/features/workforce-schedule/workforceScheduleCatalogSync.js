function text(value) {
  return String(value ?? '').trim()
}

const EFFECT_KEYS = ['delivery', 'downstream', 'notifications']
const RECEIPT_KEYS = ['effects', 'locations', 'orgId', 'people', 'synchronizedAt', 'version']
const RECEIPT_COUNTER_KEYS = ['active', 'created', 'deactivated', 'updated']

function plainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasExactKeys(value, keys) {
  return plainObject(value)
    && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
}

function hasDisabledEffects(value) {
  return hasExactKeys(value, EFFECT_KEYS)
    && EFFECT_KEYS.every((key) => value[key] === false)
}

function hasNonNegativeCounters(value, keys = RECEIPT_COUNTER_KEYS) {
  return hasExactKeys(value, keys)
    && keys.every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0)
}

function canonicalIsoTimestamp(value) {
  const normalized = text(value)
  const milliseconds = Date.parse(normalized)
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === normalized
    ? normalized
    : ''
}

export function isConfirmedWorkforceScheduleCatalogSyncReceipt(orgIdValue, receipt) {
  const orgId = text(orgIdValue)
  return Boolean(
    orgId
    && hasExactKeys(receipt, RECEIPT_KEYS)
    && receipt.version === 1
    && text(receipt.orgId) === orgId
    && canonicalIsoTimestamp(receipt.synchronizedAt)
    && hasNonNegativeCounters(receipt.people)
    && hasNonNegativeCounters(receipt.locations)
    && hasDisabledEffects(receipt.effects),
  )
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
  const legacyResponseConfirmed = Boolean(
    orgId
    && result
    && typeof result === 'object'
    && !Array.isArray(result)
    && result.ok === true
    && text(result.orgId) === orgId
    && typeof result.idempotent === 'boolean'
    && hasDisabledEffects(result.effects)
    && Array.isArray(result.people)
    && result.people.every((person) => Boolean(text(person?.personId)))
    && Array.isArray(result.locations)
    && result.locations.every((location) => Boolean(text(location?.locationId))),
  )
  if (!legacyResponseConfirmed) return false
  return result.receipt === undefined
    || isConfirmedWorkforceScheduleCatalogSyncReceipt(orgId, result.receipt)
}

export function summarizeWorkforceScheduleCatalogSync(orgIdValue, result, options = {}) {
  if (!isConfirmedWorkforceScheduleCatalogSyncResponse(orgIdValue, result)) return null
  if (result.receipt) {
    return {
      lastSyncedAt: result.receipt.synchronizedAt,
      source: 'receipt',
      people: { ...result.receipt.people },
      locations: { ...result.receipt.locations },
    }
  }
  const completedAt = canonicalIsoTimestamp(options.completedAt)
  return {
    lastSyncedAt: completedAt,
    source: 'legacy',
    people: {
      active: result.people.length,
      created: null,
      updated: null,
      deactivated: null,
    },
    locations: {
      active: result.locations.length,
      created: null,
      updated: null,
      deactivated: null,
    },
  }
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

  async function run(orgIdValue, operation, options = {}) {
    const orgId = text(orgIdValue)
    if (!orgId) throw new TypeError('Catalog synchronization requires an organization ID.')
    if (typeof operation !== 'function') throw new TypeError('Catalog synchronization requires an operation.')
    const force = options?.force === true
    if (!force && isComplete(orgId)) return { alreadyComplete: true }
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
