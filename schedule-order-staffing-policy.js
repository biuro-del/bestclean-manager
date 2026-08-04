'use strict'

function nonNegativeInteger(value, fallback = 0) {
  const number = typeof value === 'number'
    ? value
    : Number(String(value ?? '').trim().replace(',', '.'))
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : fallback
}

function resolveScheduleOrderRequiredPeople(order = {}, assignedWorkers = []) {
  const assignedCount = Array.isArray(assignedWorkers)
    ? new Set(assignedWorkers.map((value) => String(value ?? '').trim().toLowerCase()).filter(Boolean)).size
    : nonNegativeInteger(assignedWorkers, 0)
  const requested = nonNegativeInteger(
    order?.requiredPeople ?? order?.required_people ?? order?.requiredWorkers ?? order?.workerSlots,
    assignedCount,
  )
  return Math.max(assignedCount, requested)
}

module.exports = {
  resolveScheduleOrderRequiredPeople,
}
