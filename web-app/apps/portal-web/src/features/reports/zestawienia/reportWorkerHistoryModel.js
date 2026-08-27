import { aggregateWorkTimeDay } from '../../workers/workIntervals.js'
import { reportBusinessDateYmd } from './reportBusinessDateModel.js'

function timestamp(value) {
  const time = new Date(value ?? '').getTime()
  return Number.isFinite(time) ? time : 0
}

function workdayId(row = {}) {
  return String(row?.workdayId ?? row?.id ?? '').trim()
}

function eventId(row = {}, index = 0) {
  return String(row?.eventId ?? row?.id ?? '').trim() || [
    row?.startAt,
    row?.endAt,
    row?.workerLogin,
    row?.zoneId,
    index,
  ].map((value) => String(value ?? '').trim()).join('|')
}

function linkedWorkdayId(row = {}) {
  const linked = String(row?.linkedWorkdayId ?? '').trim()
  if (linked) return linked
  const eventKey = String(row?.eventId ?? '').trim()
  const workdayKey = String(row?.workdayId ?? '').trim()
  return workdayKey && (!eventKey || workdayKey !== eventKey) ? workdayKey : ''
}

function rowStartAt(row = {}) {
  return row?.startAt ?? row?.dayStartAt ?? row?.startIso ?? ''
}

function rowEndAt(row = {}) {
  return row?.endAt ?? row?.dayEndAt ?? row?.endIso ?? row?.stopAt ?? ''
}

function eventFitsWorkday(event, workday) {
  const eventStart = timestamp(rowStartAt(event))
  const dayStart = timestamp(rowStartAt(workday))
  const dayEnd = timestamp(rowEndAt(workday))
  if (!eventStart || !dayStart || eventStart < dayStart) return false
  return !dayEnd || eventStart <= dayEnd
}

function dedupeEvents(rows = []) {
  const unique = new Map()
  ;(Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const key = eventId(row, index)
    const previous = unique.get(key)
    const previousUpdated = timestamp(previous?.updatedAt ?? previous?.endAt ?? previous?.startAt)
    const nextUpdated = timestamp(row?.updatedAt ?? row?.endAt ?? row?.startAt)
    if (!previous || nextUpdated >= previousUpdated) unique.set(key, row)
  })
  return [...unique.values()]
}

function issue(code, details = {}) {
  return { code, ...details }
}

function activitySort(left, right) {
  return timestamp(rowStartAt(left)) - timestamp(rowStartAt(right))
    || timestamp(rowEndAt(left)) - timestamp(rowEndAt(right))
}

export function reportWorkerHistoryOpenState(day = {}, today = '') {
  const integrityState = String(day?.integrityState ?? '').trim().toUpperCase()
  const openSessionCount = Number(day?.openSessionCount ?? day?.runningCount ?? 0)
  const isOpen = integrityState === 'OPEN_SESSION' || openSessionCount > 0
  const dayKey = String(day?.dayKey ?? day?.businessDateYmd ?? '').trim()
  const todayKey = String(today ?? '').trim()
  const isMissingStop = Boolean(isOpen && dayKey && todayKey && dayKey < todayKey)

  return {
    isOpen,
    isMissingStop,
    label: isMissingStop ? 'Brak STOP' : isOpen ? 'W toku' : '',
    tone: isMissingStop ? 'missing-stop' : isOpen ? 'open' : '',
  }
}

/**
 * Builds the Reports > Pracownicy day model. Workday rows are authoritative
 * for attendance time; Event rows are descriptive activities only.
 */
export function buildReportWorkerHistoryDays({ workdays = [], events = [] } = {}) {
  const uniqueEvents = dedupeEvents(events)
  const dayGroups = new Map()
  const workdaysById = new Map()

  ;(Array.isArray(workdays) ? workdays : []).forEach((row, index) => {
    const dayKey = reportBusinessDateYmd(row)
    if (!dayKey) return
    const bucket = dayGroups.get(dayKey) ?? { dayKey, workdays: [], events: [], unassignedActivities: [] }
    const id = workdayId(row) || `workday-${dayKey}-${index}`
    const entry = { id, row, activities: [] }
    bucket.workdays.push(entry)
    workdaysById.set(id, entry)
    dayGroups.set(dayKey, bucket)
  })

  uniqueEvents.forEach((event) => {
    const dayKey = reportBusinessDateYmd(event)
    if (!dayKey) return
    const bucket = dayGroups.get(dayKey) ?? { dayKey, workdays: [], events: [], unassignedActivities: [] }
    bucket.events.push(event)

    const explicitWorkday = workdaysById.get(linkedWorkdayId(event))
    const containingWorkday = explicitWorkday ?? bucket.workdays
      .filter((entry) => eventFitsWorkday(event, entry.row))
      .sort((left, right) => timestamp(rowStartAt(right.row)) - timestamp(rowStartAt(left.row)))[0]

    if (containingWorkday) containingWorkday.activities.push(event)
    else bucket.unassignedActivities.push(event)
    dayGroups.set(dayKey, bucket)
  })

  return [...dayGroups.values()].map((bucket) => {
    const sourceRows = bucket.workdays.map(({ row, activities }) => ({
      ...row,
      activities: dedupeEvents([...(Array.isArray(row?.activities) ? row.activities : []), ...activities]).sort(activitySort),
    }))
    const accounting = aggregateWorkTimeDay(sourceRows)
    const missingWorkday = sourceRows.length === 0 && bucket.events.length > 0
    const integrityIssues = missingWorkday
      ? [issue('WORKDAY_MISSING'), ...(accounting.integrityIssues ?? [])]
      : [...(accounting.integrityIssues ?? [])]
    const sessions = (Array.isArray(accounting.sessions) ? accounting.sessions : []).map((session, index) => ({
      ...session,
      sessionNumber: Number(session?.sessionNumber) || index + 1,
      activities: [...(Array.isArray(session?.activities) ? session.activities : [])].sort(activitySort),
    }))

    return {
      dayKey: bucket.dayKey,
      workerLogin: String(sourceRows[0]?.workerLogin ?? bucket.events[0]?.workerLogin ?? '').trim(),
      workerName: String(sourceRows[0]?.workerName ?? bucket.events[0]?.workerName ?? '').trim(),
      countAll: bucket.events.length,
      runningCount: Number(accounting.openSessionCount ?? 0),
      closedSec: Math.max(0, Math.floor(Number(accounting.closedSessionsSec ?? 0) || 0)),
      pauseSec: Math.max(0, Math.floor(Number(accounting.pauseSec ?? 0) || 0)),
      dayStartIso: accounting.firstStartAt || '',
      dayEndIso: accounting.lastStopAt || accounting.lastClosedStopAt || '',
      openSessionCount: Number(accounting.openSessionCount ?? 0),
      integrityState: missingWorkday ? 'INVALID' : String(accounting.integrityState ?? 'COMPLETE').toUpperCase(),
      integrityIssues,
      issues: integrityIssues,
      sessions,
      activities: [...(accounting.activities ?? [])].sort(activitySort),
      unassignedActivities: [...bucket.unassignedActivities].sort(activitySort),
      sourceRows,
      eventRows: bucket.events,
    }
  }).sort((left, right) => String(right.dayKey).localeCompare(String(left.dayKey)))
}
