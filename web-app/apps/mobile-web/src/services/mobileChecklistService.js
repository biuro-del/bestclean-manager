import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore'
import { ensureFirebase, waitForFirebaseAuthReady } from '../firebase/firebaseClient'

function toText(value) {
  return String(value ?? '').trim()
}

function toBool(value) {
  if (value === true || value === false) return value
  const normalized = toText(value).toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'tak'
}

function taskKey(section, taskId, index) {
  const safeSection = toText(section).toLowerCase() || 'task'
  const safeTaskId = toText(taskId)
  return safeTaskId ? `${safeSection}:${safeTaskId}` : `${safeSection}:idx-${index}`
}

function normalizeTaskRow(rawTask, section, index) {
  const taskId = toText(rawTask?.taskId || rawTask?.id || rawTask?.extraId || rawTask?.code)
  const taskName = toText(rawTask?.taskName || rawTask?.name || rawTask?.label || rawTask?.title)
  if (!taskName) return null
  return {
    key: taskKey(section, taskId, index),
    section: section === 'additional' ? 'additional' : 'standard',
    taskId: taskId || null,
    taskName,
    required: rawTask?.required === undefined ? true : toBool(rawTask?.required),
    order: Number.isFinite(Number(rawTask?.order)) ? Number(rawTask.order) : index + 1,
    checked: false,
    reason: '',
  }
}

function normalizeTaskList(rawList, section) {
  if (!Array.isArray(rawList)) return []
  const normalized = []
  rawList.forEach((rawTask, index) => {
    const task = normalizeTaskRow(rawTask, section, index)
    if (task) normalized.push(task)
  })
  return normalized.sort((a, b) => a.order - b.order)
}

function normalizeDefinition(rawDoc, orgId, zoneId) {
  const data = rawDoc || {}
  const additionalTasks = normalizeTaskList(
    data.additionalTasks || data.extraTasks || data.extra || data.additional || data.tasksAdditional,
    'additional',
  )
  const standardTasks = normalizeTaskList(
    data.standardTasks || data.dailyTasks || data.standard || data.daily || data.tasksStandard,
    'standard',
  )

  return {
    orgId: toText(data.orgId || orgId),
    zoneId: toText(data.zoneId || zoneId),
    zoneName: toText(data.zoneName),
    clientName: toText(data.clientName),
    location: toText(data.location),
    additionalTasks,
    standardTasks,
    fetchedAtIso: new Date().toISOString(),
    source: toText(data.source || 'firestore'),
  }
}

function normalizeAnswers(items) {
  return (items || []).map((item) => {
    const reason = toText(item?.reason)
    const checked = Boolean(item?.checked)
    return {
      key: toText(item?.key),
      section: toText(item?.section),
      taskId: toText(item?.taskId) || null,
      taskName: toText(item?.taskName),
      required: Boolean(item?.required),
      checked,
      status: checked ? 'OK' : 'NOK',
      reason: checked ? '' : reason,
    }
  })
}

export async function fetchZoneChecklistDefinition(session, zone) {
  const firebase = ensureFirebase()
  if (!firebase?.db) {
    return normalizeDefinition({}, session?.orgId, zone?.id)
  }

  await waitForFirebaseAuthReady()
  const orgId = toText(session?.orgId)
  const zoneId = toText(zone?.id || zone?.zoneId)
  if (!orgId || !zoneId) {
    return normalizeDefinition({}, orgId, zoneId)
  }

  const scopedRef = doc(firebase.db, 'orgs', orgId, 'zoneChecklistDefinitions', zoneId)
  const scopedSnap = await getDoc(scopedRef)
  if (scopedSnap.exists()) {
    return normalizeDefinition(scopedSnap.data(), orgId, zoneId)
  }

  const fallbackRef = doc(firebase.db, 'zoneChecklistDefinitions', `${orgId}__${zoneId}`)
  const fallbackSnap = await getDoc(fallbackRef)
  if (fallbackSnap.exists()) {
    return normalizeDefinition(fallbackSnap.data(), orgId, zoneId)
  }

  return normalizeDefinition({}, orgId, zoneId)
}

export async function saveZoneChecklistResult({
  session,
  activeCycle,
  zone,
  closeReason,
  closeComment,
  closePhotoDataUrl,
  checklistItems,
}) {
  const firebase = ensureFirebase()
  if (!firebase?.db) {
    throw new Error('Brak dostepu do Firestore (db).')
  }

  await waitForFirebaseAuthReady()
  const orgId = toText(session?.orgId)
  const zoneId = toText(zone?.id || activeCycle?.zoneId)
  if (!orgId || !zoneId) {
    throw new Error('Brak orgId lub zoneId do zapisu checklisty.')
  }

  const answers = normalizeAnswers(checklistItems)
  const additionalAnswers = answers.filter((row) => row.section === 'additional')
  const standardAnswers = answers.filter((row) => row.section === 'standard')
  const doneCount = answers.filter((row) => row.checked).length
  const notDoneCount = answers.length - doneCount

  const payload = {
    orgId,
    zoneId,
    zoneName: toText(zone?.zoneName || activeCycle?.zoneName) || null,
    clientName: toText(zone?.clientName || activeCycle?.clientName) || null,
    location: toText(zone?.location || activeCycle?.location) || null,
    cycleId: toText(activeCycle?.eventId || activeCycle?.cycleId) || null,
    eventId: toText(activeCycle?.eventId) || null,
    workdayId: toText(activeCycle?.workdayId) || null,
    workerLogin: toText(session?.workerLogin || activeCycle?.workerLogin) || null,
    workerName: toText(session?.workerName || activeCycle?.workerName) || null,
    closedByReason: toText(closeReason || 'QR_CYCLE_CLOSE'),
    closeComment: toText(closeComment) || null,
    closePhotoDataUrl: toText(closePhotoDataUrl) || null,
    closePhotoProvided: Boolean(toText(closePhotoDataUrl)),
    cycleStartedAt: toText(activeCycle?.startAt) || null,
    closedAtClientIso: new Date().toISOString(),
    checklistSummary: {
      total: answers.length,
      done: doneCount,
      notDone: notDoneCount,
      additional: additionalAnswers.length,
      standard: standardAnswers.length,
    },
    additionalTasks: additionalAnswers,
    standardTasks: standardAnswers,
    createdAt: serverTimestamp(),
  }

  await addDoc(collection(firebase.db, 'orgs', orgId, 'zoneChecklistResults'), payload)
}

