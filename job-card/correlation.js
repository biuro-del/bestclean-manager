'use strict'

function firstText(...values) {
  for (const value of values) {
    const normalized = String(value ?? '').trim()
    if (normalized) return normalized
  }
  return ''
}

function canonicalText(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pl-PL')
}

function canonicalId(value) {
  return canonicalText(value)
}

function canonicalTime(value) {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return ''
  return `${String(Number(match[1])).padStart(2, '0')}:${match[2]}`
}

function canonicalDate(value) {
  const match = String(value ?? '').trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

function canonicalScheduleMode(value, fallback = {}) {
  const source = firstText(value, fallback?.type, fallback?.repeatPreset).toUpperCase()
  if (['RECURRING', 'REPEAT', 'CYCLIC', 'CYCLE', 'WEEK', 'WEEKLY'].includes(source)) return 'RECURRING'
  if (['ONE_OFF', 'ONCE', 'INDIVIDUAL', 'SINGLE', 'NONE'].includes(source)) return 'ONE_OFF'
  return ''
}

function canonicalStaffingMode(value) {
  const source = String(value ?? '').trim().toUpperCase()
  if (['FIXED', 'PERMANENT'].includes(source)) return 'FIXED'
  if (['VARIABLE_WEEKLY', 'VARIABLE', 'WEEKLY'].includes(source)) return 'VARIABLE_WEEKLY'
  if (['BUFFER', 'UNASSIGNED'].includes(source)) return 'BUFFER'
  return source
}

function canonicalNumber(value, fallback = 0) {
  const normalized = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(normalized) ? normalized : fallback
}

function canonicalInteger(value, fallback = 0) {
  return Math.max(0, Math.floor(canonicalNumber(value, fallback)))
}

function canonicalSet(values = [], mapper = canonicalText) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(mapper)
    .filter((value) => value !== ''))]
    .sort()
}

function canonicalWeekdays(values = []) {
  return canonicalSet(values, (value) => {
    const normalized = Number(value)
    return Number.isInteger(normalized) && normalized >= 0 && normalized <= 6 ? String(normalized) : ''
  })
}

function canonicalAssignments(values = []) {
  return canonicalSet(values, (assignment) => canonicalId(
    typeof assignment === 'string'
      ? assignment
      : firstText(
          assignment?.workerId,
          assignment?.worker_id,
          assignment?.workerLogin,
          assignment?.workerKey,
          assignment?.idWorker,
          assignment?.id,
        ),
  ))
}

function canonicalTasks(values = []) {
  return canonicalSet(values, (item) => {
    if (!item || typeof item !== 'object') return ''
    const zoneId = canonicalId(firstText(item.zoneId, item.zone_id, item.idZone, item.zone?.id, item.id))
    const title = canonicalText(firstText(item.title, item.name, item.taskName, item.description))
    return zoneId || title ? `${zoneId}|${title}` : ''
  })
}

function firstServiceBlock(source = {}) {
  const blocks = Array.isArray(source?.serviceBlocks) ? source.serviceBlocks : []
  return blocks[0] && typeof blocks[0] === 'object' ? blocks[0] : {}
}

function canonicalCard(card = {}) {
  const block = firstServiceBlock(card?.schedule)
  const scheduleMode = canonicalScheduleMode(card?.schedule?.mode)
  return {
    sourceOrderId: canonicalId(card?.source?.orderId),
    clientId: canonicalId(firstText(card?.customer?.customerId, card?.customer?.clientId)),
    objectId: canonicalId(firstText(card?.site?.siteId, card?.site?.objectId)),
    address: canonicalText(card?.site?.address),
    scheduleMode,
    dateStart: canonicalDate(card?.schedule?.startDateYmd),
    startTime: canonicalTime(block?.startTime),
    endTime: canonicalTime(block?.endTime),
    recurrenceUntil: scheduleMode === 'RECURRING' ? canonicalDate(card?.schedule?.recurrenceUntilYmd) : '',
    weekdays: scheduleMode === 'RECURRING' ? canonicalWeekdays(block?.weekdays) : [],
    requiredPeople: canonicalInteger(block?.requiredPeople),
    staffingMode: canonicalStaffingMode(card?.fulfillment?.staffingMode),
    workerIds: canonicalAssignments(card?.fulfillment?.assignments),
    serviceTitle: canonicalText(card?.service?.title),
    tasks: canonicalTasks(card?.service?.scopeItems),
    paymentMethod: canonicalText(card?.commercial?.paymentMethod),
    pricingMode: canonicalText(card?.commercial?.pricingMode),
    amount: canonicalNumber(card?.commercial?.amount),
    contractId: canonicalId(card?.commercial?.contractId),
    paymentDueDate: canonicalDate(card?.commercial?.paymentDueDateYmd),
  }
}

function canonicalOrder(order = {}) {
  const block = firstServiceBlock(order)
  const scheduleMode = canonicalScheduleMode(order?.scheduleMode, order)
  const assignments = [
    ...(Array.isArray(order?.workerAssignments) ? order.workerAssignments : []),
    ...(Array.isArray(order?.workAllocations) ? order.workAllocations : []),
    ...(Array.isArray(order?.workerIds) ? order.workerIds : []),
  ]
  return {
    sourceOrderId: canonicalId(firstText(order?.id, order?.idTask, order?.id_task, order?.taskId, order?.sourceOrderId)),
    clientId: canonicalId(firstText(order?.clientId, order?.client_id, order?.customerId)),
    objectId: canonicalId(firstText(order?.objectId, order?.object_id, order?.siteId)),
    address: canonicalText(firstText(
      order?.executionAddressLabel,
      order?.customAddressLabel,
      order?.addressLabel,
      order?.address,
      order?.location,
    )),
    scheduleMode,
    dateStart: canonicalDate(firstText(order?.dateYmd, order?.startDateYmd, order?.dateStart)),
    startTime: canonicalTime(firstText(order?.startTime, block?.startTime)),
    endTime: canonicalTime(firstText(order?.endTime, block?.endTime)),
    recurrenceUntil: scheduleMode === 'RECURRING'
      ? canonicalDate(firstText(
          order?.repeatUntil,
          order?.repeatEndDate,
          order?.recurrenceEndDate,
          order?.seriesEndDate,
          order?.repeatUntilYmd,
        ))
      : '',
    weekdays: scheduleMode === 'RECURRING'
      ? canonicalWeekdays(
          Array.isArray(order?.repeatWeekdays) && order.repeatWeekdays.length
            ? order.repeatWeekdays
            : block?.weekdays,
        )
      : [],
    requiredPeople: canonicalInteger(firstText(order?.requiredPeople, order?.requiredWorkers, block?.requiredPeople)),
    staffingMode: canonicalStaffingMode(firstText(order?.staffingMode, order?.assignmentMode, order?.fulfillment?.staffingMode)),
    workerIds: canonicalAssignments(assignments),
    serviceTitle: canonicalText(firstText(order?.serviceName, order?.serviceType, order?.title, order?.name)),
    tasks: canonicalTasks(
      Array.isArray(order?.objectPlanTasks)
        ? order.objectPlanTasks
        : Array.isArray(order?.tasks)
          ? order.tasks
          : order?.zoneTaskPlan,
    ),
    paymentMethod: canonicalText(firstText(order?.paymentMethod, order?.commercial?.paymentMethod, order?.billing?.paymentMethod)),
    pricingMode: canonicalText(firstText(order?.pricingMode, order?.commercial?.pricingMode, order?.billing?.pricingMode)),
    amount: canonicalNumber(firstText(order?.price, order?.amount, order?.commercial?.amount, order?.billing?.amount)),
    contractId: canonicalId(firstText(order?.contractId, order?.commercial?.contractId, order?.billing?.contractId)),
    paymentDueDate: canonicalDate(firstText(
      order?.paymentDueDateYmd,
      order?.deferredDueDate,
      order?.commercial?.paymentDueDateYmd,
      order?.billing?.deferredDueDate,
    )),
  }
}

function canonicalEditorDraft(editorDraft = {}) {
  const scheduleMode = canonicalScheduleMode(editorDraft?.scheduleMode)
  return {
    sourceOrderId: canonicalId(firstText(editorDraft?.orderId, editorDraft?.id)),
    clientId: canonicalId(editorDraft?.clientId),
    objectId: canonicalId(firstText(editorDraft?.objectId, editorDraft?.siteId)),
    address: canonicalText(firstText(editorDraft?.address, editorDraft?.location)),
    scheduleMode,
    dateStart: canonicalDate(firstText(editorDraft?.dateStart, editorDraft?.startDateYmd)),
    startTime: canonicalTime(editorDraft?.startTime),
    endTime: canonicalTime(editorDraft?.endTime),
    recurrenceUntil: scheduleMode === 'RECURRING'
      ? canonicalDate(firstText(editorDraft?.recurrenceUntil, editorDraft?.recurrenceUntilYmd))
      : '',
    weekdays: scheduleMode === 'RECURRING' ? canonicalWeekdays(editorDraft?.weekdays) : [],
    requiredPeople: canonicalInteger(editorDraft?.requiredPeople),
    staffingMode: canonicalStaffingMode(firstText(editorDraft?.staffingMode, editorDraft?.assignmentMode)),
    workerIds: canonicalAssignments(editorDraft?.workerIds),
    serviceTitle: canonicalText(firstText(editorDraft?.serviceName, editorDraft?.title)),
    tasks: canonicalTasks(editorDraft?.tasks),
    paymentMethod: canonicalText(firstText(editorDraft?.paymentMethod, editorDraft?.billing?.paymentMethod)),
    pricingMode: canonicalText(firstText(editorDraft?.pricingMode, editorDraft?.billing?.pricingMode)),
    amount: canonicalNumber(firstText(editorDraft?.amount, editorDraft?.price, editorDraft?.billing?.amount)),
    contractId: canonicalId(firstText(editorDraft?.contractId, editorDraft?.billing?.contractId)),
    paymentDueDate: canonicalDate(firstText(
      editorDraft?.paymentDueDateYmd,
      editorDraft?.deferredDueDate,
      editorDraft?.billing?.deferredDueDate,
    )),
  }
}

function comparableValue(value) {
  return Array.isArray(value) ? JSON.stringify(value) : String(value ?? '')
}

function validateDetachedDraftCorrelation({ card = {}, editorDraft = {}, order = {}, sourceOrderId = '' } = {}) {
  const cardValue = canonicalCard(card)
  const orderValue = canonicalOrder(order)
  const editorValue = canonicalEditorDraft(editorDraft)
  const expectedSourceOrderId = canonicalId(sourceOrderId)
  const mismatches = []

  const compare = (field, { includeEditor = true } = {}) => {
    const values = {
      card: cardValue[field],
      order: orderValue[field],
      ...(includeEditor ? { editorDraft: editorValue[field] } : {}),
    }
    const distinct = new Set(Object.values(values).map(comparableValue))
    if (distinct.size > 1) mismatches.push({ field, values })
  }

  const sourceValues = {
    card: cardValue.sourceOrderId,
    order: orderValue.sourceOrderId,
    sourceOrderId: expectedSourceOrderId,
  }
  if (editorValue.sourceOrderId) sourceValues.editorDraft = editorValue.sourceOrderId
  if (new Set(Object.values(sourceValues).map(comparableValue)).size > 1) {
    mismatches.push({ field: 'sourceOrderId', values: sourceValues })
  }

  ;[
    'clientId',
    'objectId',
    'address',
    'scheduleMode',
    'dateStart',
    'startTime',
    'endTime',
    'recurrenceUntil',
    'weekdays',
    'requiredPeople',
    'staffingMode',
    'workerIds',
    'serviceTitle',
    'tasks',
    'paymentMethod',
    'pricingMode',
    'amount',
    'contractId',
    'paymentDueDate',
  ].forEach((field) => compare(field))

  return {
    valid: mismatches.length === 0,
    mismatches,
  }
}

module.exports = {
  validateDetachedDraftCorrelation,
}
