export const EVENT_CORRELATION_BACKUP_FIELDS = Object.freeze([
  'taskId',
  'occurrenceDateYmd',
  'serviceBlockId',
  'allocationId',
  'workSlotKey',
  'eventType',
  'matchStatus',
  'matchMethod',
  'matchReason',
  'matchedAt',
  'planSnapshotVersion',
  'plannedStartAt',
  'plannedEndAt',
  'plannedDurationMinutes',
  'taskUpdatedAtSnapshot',
])

const CLOSED_EVENT_STATUSES = new Set([
  'CLOSED',
  'COMPLETED',
  'DONE',
  'FINISHED',
  'STOPPED',
])
const SUPPORTED_MATCH_STATUSES = new Set(['MATCHED', 'UNMATCHED', 'AMBIGUOUS'])
const SUPPORTED_PLAN_SNAPSHOT_VERSION = 1

function text(value) {
  return String(value ?? '').trim()
}

function nullableText(value) {
  return text(value) || null
}

function upper(value) {
  return text(value).toUpperCase()
}

function isOpenEvent(row = {}) {
  return !nullableText(row.endAt) && !CLOSED_EVENT_STATUSES.has(upper(row.status))
}

export function validateEventRestoreRows(rows = []) {
  const issues = []
  const openCleanByWorker = new Map()
  const seenEventIds = new Set()

  for (const row of Array.isArray(rows) ? rows : []) {
    const eventId = text(row?.eventId)
    const eventType = upper(row?.eventType)
    const matchStatus = upper(row?.matchStatus)
    const workerLogin = text(row?.workerLogin).toLowerCase()

    if (!eventId) {
      issues.push('(brak eventId): rekord Eventu nie może zostać odtworzony.')
      continue
    }
    if (seenEventIds.has(eventId)) {
      issues.push(`${eventId}: eventId występuje w backupie więcej niż raz.`)
      continue
    }
    seenEventIds.add(eventId)

    if (matchStatus && !SUPPORTED_MATCH_STATUSES.has(matchStatus)) {
      issues.push(`${eventId}: nieobsługiwany matchStatus=${matchStatus}.`)
    }

    if (isOpenEvent(row)) {
      if (eventType !== 'CLEAN') {
        issues.push(`${eventId}: otwarty Event musi mieć eventType=CLEAN.`)
      }
      if (!workerLogin) {
        issues.push(`${eventId}: otwarty CLEAN musi mieć workerLogin.`)
      } else if (eventType === 'CLEAN') {
        const previousEventId = openCleanByWorker.get(workerLogin)
        if (previousEventId) {
          issues.push(
            `${eventId}: pracownik ${workerLogin} ma już otwarty CLEAN ${previousEventId}.`,
          )
        } else {
          openCleanByWorker.set(workerLogin, eventId)
        }
      }
    }

    if (matchStatus === 'MATCHED') {
      const requiredFields = [
        'taskId',
        'occurrenceDateYmd',
        'serviceBlockId',
        'allocationId',
        'workSlotKey',
        'matchMethod',
        'matchReason',
        'matchedAt',
        'planSnapshotVersion',
        'taskUpdatedAtSnapshot',
      ]
      const missingFields = requiredFields.filter((field) => {
        const value = row?.[field]
        return value == null || value === ''
      })
      if (eventType !== 'CLEAN') {
        missingFields.unshift('eventType=CLEAN')
      }
      if (
        row?.planSnapshotVersion != null &&
        Number(row.planSnapshotVersion) !== SUPPORTED_PLAN_SNAPSHOT_VERSION
      ) {
        missingFields.push(
          `planSnapshotVersion=${SUPPORTED_PLAN_SNAPSHOT_VERSION}`,
        )
      }
      if (missingFields.length) {
        issues.push(
          `${eventId}: MATCHED nie ma kompletnego snapshotu (${missingFields.join(', ')}).`,
        )
      }
    }
  }

  return issues
}
