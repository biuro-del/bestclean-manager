function normalizeIdentifier(value) {
  return String(value ?? '').trim()
}

function planIdentityKeys(item = {}) {
  return [
    item?.taskId,
    item?.sourceOrderId,
    item?.orderId,
    item?.editorOrderId,
    item?.key,
  ]
    .map(normalizeIdentifier)
    .filter(Boolean)
}

function operationIdentityKeys(item = {}) {
  return [
    item?.taskId,
    item?.sourceOrderId,
    item?.orderId,
    item?.editorOrderId,
  ]
    .map(normalizeIdentifier)
    .filter(Boolean)
}

function isCancelledPlan(item = {}) {
  const status = String(
    item?.status ??
      item?.orderStatus ??
      item?.lifecycleStatus ??
      '',
  )
    .trim()
    .toUpperCase()
  return (
    item?.cancelled === true ||
    item?.canceled === true ||
    ['CANCELLED', 'CANCELED', 'ANULOWANE', 'ANULOWANY'].includes(status)
  )
}

function matchingPlanIndexes(plans = [], operations = []) {
  const operationKeys = new Set(
    (Array.isArray(operations) ? operations : [])
      .flatMap(operationIdentityKeys),
  )
  return new Set(
    plans
      .map((plan, index) => (
        planIdentityKeys(plan).some((key) => operationKeys.has(key))
          ? index
          : -1
      ))
      .filter((index) => index >= 0),
  )
}

export function buildCommandCenterPlanModel({
  plannedOrders = [],
  activeOperations = [],
  completedOperations = [],
  nowTs = Date.now(),
  horizonMinutes = 60,
} = {}) {
  const plans = Array.isArray(plannedOrders) ? plannedOrders : []
  const cancelledIndexes = new Set(
    plans
      .map((plan, index) => (isCancelledPlan(plan) ? index : -1))
      .filter((index) => index >= 0),
  )
  const completedIndexes = matchingPlanIndexes(
    plans,
    (Array.isArray(completedOperations) ? completedOperations : [])
      .filter((item) => item?.completionConfirmed === true && item?.planned !== false),
  )
  const activeIndexes = matchingPlanIndexes(
    plans,
    (Array.isArray(activeOperations) ? activeOperations : [])
      .filter((item) => item?.planned !== false),
  )

  const completedCount = [...completedIndexes]
    .filter((index) => !cancelledIndexes.has(index))
    .length
  const activeCount = [...activeIndexes]
    .filter((index) => !cancelledIndexes.has(index) && !completedIndexes.has(index))
    .length
  const cancelledCount = cancelledIndexes.size
  const waitingCount = Math.max(
    0,
    plans.length - completedCount - activeCount - cancelledCount,
  )
  const executableCount = Math.max(0, plans.length - cancelledCount)
  const progressPercent = executableCount > 0
    ? Math.min(100, Math.round((completedCount / executableCount) * 100))
    : null
  const horizonEndTs = Number(nowTs) + Math.max(1, Number(horizonMinutes) || 60) * 60 * 1000
  const upcoming = plans
    .map((plan, index) => ({ ...plan, __planIndex: index }))
    .filter((plan) => {
      const index = Number(plan.__planIndex)
      const startTs = Number(plan?.startTs) || 0
      return (
        !cancelledIndexes.has(index) &&
        !completedIndexes.has(index) &&
        !activeIndexes.has(index) &&
        startTs >= Number(nowTs) &&
        startTs <= horizonEndTs
      )
    })
    .sort((left, right) => (
      (Number(left?.startTs) || 0) - (Number(right?.startTs) || 0) ||
      String(left?.title ?? '').localeCompare(String(right?.title ?? ''), 'pl', {
        sensitivity: 'base',
      })
    ))
    .map((plan) => {
      const visiblePlan = { ...plan }
      delete visiblePlan.__planIndex
      return visiblePlan
    })

  return {
    totalCount: plans.length,
    executableCount,
    completedCount,
    activeCount,
    waitingCount,
    cancelledCount,
    progressPercent,
    upcoming,
  }
}
