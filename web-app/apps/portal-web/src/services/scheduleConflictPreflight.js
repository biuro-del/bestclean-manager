function hasOrderIdentity(order = {}) {
  return Boolean(String(order?.id ?? order?.idTask ?? order?.id_task ?? '').trim())
}

/**
 * Client-side conflict checking is only an early UX guard. The backend remains
 * authoritative because it validates the complete current planning snapshot.
 *
 * A full snapshot can contain old, unrelated inconsistencies. Revalidating all
 * of them before every write would prevent a coordinator from saving an
 * otherwise independent order. Only explicitly changed local orders are safe
 * candidates for this early check.
 */
export function scheduleConflictPreflightCandidates(options = {}) {
  const rawCandidates = Array.isArray(options?.conflictCandidates)
    ? options.conflictCandidates
    : Array.isArray(options?.retainLocalOrders)
      ? options.retainLocalOrders
      : []

  const seen = new Set()
  return rawCandidates.filter((order) => {
    if (!order || typeof order !== 'object' || !hasOrderIdentity(order)) {
      return false
    }
    const id = String(order.id ?? order.idTask ?? order.id_task).trim()
    if (seen.has(id)) {
      return false
    }
    seen.add(id)
    return true
  })
}
