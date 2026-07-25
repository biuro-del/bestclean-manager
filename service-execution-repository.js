'use strict'

const EVENT_CORRELATION_COLUMNS = Object.freeze([
  'event_type',
  'match_status',
  'match_method',
  'match_reason',
  'task_id',
  'occurrence_date_ymd',
  'service_block_id',
  'allocation_id',
  'work_slot_key',
  'matched_at',
  'plan_snapshot_version',
  'planned_start_at',
  'planned_end_at',
  'planned_duration_minutes',
  'task_updated_at_snapshot',
])

const MATCHED = 'MATCHED'
const UNMATCHED = 'UNMATCHED'
const AMBIGUOUS = 'AMBIGUOUS'
const INCOMPLETE_PLAN_IDENTITY = 'INCOMPLETE_PLAN_IDENTITY'
const DEFAULT_TIME_ZONE = 'Europe/Warsaw'
const ALLOWED_MATCH_METHODS = new Set([
  'EXACT_IDS_UNIQUE',
  'EXACT_IDS_AND_TIME_WINDOW',
])
const DATE_YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function text(value) {
  return String(value ?? '').trim()
}

function compactMobileZoneKey(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function mobileZoneQrAmbiguousError(qrCode, candidateCount) {
  const error = new Error('QR_ZONE_AMBIGUOUS')
  error.statusCode = 409
  error.publicCode = 'QR_ZONE_AMBIGUOUS'
  error.publicMessage = 'Kod QR pasuje do kilku stref. Popraw identyfikatory stref przed kolejnym skanem.'
  error.publicDetails = {
    qrCode: text(qrCode),
    candidateCount: Number(candidateCount) || 0,
  }
  return error
}

function resolveMobileZoneQrRows(rows = [], qrCode = '') {
  const code = text(qrCode)
  if (!code) return null
  const source = (Array.isArray(rows) ? rows : []).filter((row) => row && typeof row === 'object')
  const exactMatches = source.filter(
    (row) => text(row.zone_id ?? row.zoneId ?? row.id).toLowerCase() === code.toLowerCase(),
  )
  if (exactMatches.length === 1) return exactMatches[0]
  if (exactMatches.length > 1) throw mobileZoneQrAmbiguousError(code, exactMatches.length)

  const compactCode = compactMobileZoneKey(code)
  const compactMatches = source.filter(
    (row) => compactMobileZoneKey(row.zone_id ?? row.zoneId ?? row.id) === compactCode,
  )
  if (compactMatches.length === 1) return compactMatches[0]
  if (compactMatches.length > 1) throw mobileZoneQrAmbiguousError(code, compactMatches.length)
  return null
}

function validDate(value) {
  if (value == null || value === '') return null
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function validDateYmd(value) {
  const normalized = text(value)
  if (!DATE_YMD_PATTERN.test(normalized)) return ''
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === normalized
    ? normalized
    : ''
}

function occurrenceDateYmdInTimeZone(value, timeZone = DEFAULT_TIME_ZONE) {
  const date = validDate(value)
  if (!date) return ''

  let formatter
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: text(timeZone) || DEFAULT_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return ''
  }
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  return parts.year && parts.month && parts.day
    ? `${parts.year}-${parts.month}-${parts.day}`
    : ''
}

function warsawOccurrenceDateYmd(value) {
  return occurrenceDateYmdInTimeZone(value, DEFAULT_TIME_ZONE)
}

async function readRawTaskPlansForOrganization(client, orgId) {
  const result = await client.query(
    `select *
       from public.task
      where org_id = $1`,
    [text(orgId)],
  )
  return Array.isArray(result.rows) ? result.rows : []
}

async function readPublicEventColumns(client) {
  const result = await client.query(
    `select column_name
       from information_schema.columns
      where table_schema = $1::text
        and table_name = $2::text`,
    ['public', 'event'],
  )
  return new Set((result.rows || []).map((row) => text(row.column_name)).filter(Boolean))
}

function eventCorrelationSchema(availableColumns) {
  const columns = availableColumns instanceof Set
    ? availableColumns
    : new Set((availableColumns || []).map(text).filter(Boolean))
  const missingColumns = EVENT_CORRELATION_COLUMNS.filter((column) => !columns.has(column))
  return {
    supported: missingColumns.length === 0,
    missingColumns,
  }
}

function invalidPlanIdentityReason(match = {}) {
  const source = match && typeof match === 'object' ? match : {}
  if (
    !text(source.taskId) ||
    !text(source.occurrenceDateYmd) ||
    !text(source.serviceBlockId) ||
    !text(source.allocationId) ||
    !text(source.workSlotKey) ||
    source.taskUpdatedAtSnapshot == null ||
    source.taskUpdatedAtSnapshot === ''
  ) {
    return INCOMPLETE_PLAN_IDENTITY
  }
  if (!validDateYmd(source.occurrenceDateYmd)) return 'INVALID_OCCURRENCE_DATE'
  if (!validDate(source.taskUpdatedAtSnapshot)) return 'INVALID_TASK_REVISION'
  return ''
}

function normalizeCorrelationForPersistence(correlation = {}) {
  const rawStatus = text(correlation.status).toUpperCase()
  const statusIsValid = [MATCHED, UNMATCHED, AMBIGUOUS].includes(rawStatus)
  const status = statusIsValid ? rawStatus : UNMATCHED
  const match = correlation.match && typeof correlation.match === 'object' ? correlation.match : null
  const matchMethod = text(correlation.matchMethod)
  if (status === MATCHED) {
    const planIdentityReason = invalidPlanIdentityReason(match)
    const invalidMatchedReason =
      planIdentityReason ||
      (!matchMethod && 'MISSING_MATCH_METHOD') ||
      (!ALLOWED_MATCH_METHODS.has(matchMethod) && 'INVALID_MATCH_METHOD') ||
      (text(correlation.reason) !== matchMethod && 'MATCH_REASON_METHOD_MISMATCH')
    if (invalidMatchedReason) {
      return {
        status: UNMATCHED,
        matchMethod: null,
        reason: invalidMatchedReason,
        match: null,
      }
    }
  }
  return {
    status,
    matchMethod: status === MATCHED ? matchMethod : null,
    reason: status === MATCHED
      ? matchMethod
      : text(correlation.reason) ||
        (!statusIsValid ? 'INVALID_CORRELATION_RESULT' : `${status}_WITHOUT_REASON`),
    match: status === MATCHED ? match : null,
  }
}

function correlationColumnValues(correlation = {}, matchedAt = new Date()) {
  const normalized = normalizeCorrelationForPersistence(correlation)
  const match = normalized.match
  const isMatched = normalized.status === MATCHED
  return {
    event_type: 'CLEAN',
    match_status: normalized.status,
    match_method: normalized.matchMethod,
    match_reason: normalized.reason,
    task_id: isMatched ? text(match.taskId) || null : null,
    occurrence_date_ymd: isMatched ? text(match.occurrenceDateYmd) || null : null,
    service_block_id: isMatched ? text(match.serviceBlockId) || null : null,
    allocation_id: isMatched ? text(match.allocationId) || null : null,
    work_slot_key: isMatched ? text(match.workSlotKey) || null : null,
    matched_at: isMatched ? validDate(matchedAt) : null,
    plan_snapshot_version: isMatched ? 1 : null,
    planned_start_at: isMatched ? validDate(match.plannedStartAt) : null,
    planned_end_at: isMatched ? validDate(match.plannedEndAt) : null,
    planned_duration_minutes:
      isMatched &&
      match.plannedDurationMinutes != null &&
      match.plannedDurationMinutes !== '' &&
      Number.isFinite(Number(match.plannedDurationMinutes)) &&
      Number(match.plannedDurationMinutes) > 0
        ? Math.floor(Number(match.plannedDurationMinutes))
        : null,
    task_updated_at_snapshot: isMatched ? validDate(match.taskUpdatedAtSnapshot) : null,
  }
}

function buildMobileCleanEventInsert(event = {}, correlation = {}, options = {}) {
  const correlationSupported = options.correlationSupported === true
  const availableCorrelationColumns =
    options.availableCorrelationColumns instanceof Set
      ? options.availableCorrelationColumns
      : new Set((options.availableCorrelationColumns || []).map(text).filter(Boolean))
  const columns = [
    'org_id',
    'event_id',
    'workday_id',
    'zone_id',
    'worker_login',
    'worker_name',
    'start_at',
    'end_at',
    'duration_sec',
    'status',
    'comment',
    'start_event_id',
  ]
  const values = [
    text(event.orgId),
    text(event.eventId),
    text(event.workdayId),
    text(event.zoneId),
    text(event.workerLogin),
    text(event.workerName),
    validDate(event.startedAt),
    null,
    null,
    'RUNNING',
    text(event.comment),
    null,
  ]

  const correlationColumnsToWrite = correlationSupported
    ? EVENT_CORRELATION_COLUMNS
    : EVENT_CORRELATION_COLUMNS.filter((column) => availableCorrelationColumns.has(column))
  if (correlationColumnsToWrite.length) {
    const correlationValues = correlationColumnValues(correlation, options.matchedAt)
    for (const column of correlationColumnsToWrite) {
      columns.push(column)
      values.push(correlationValues[column])
    }
  }

  const placeholders = values.map((_, index) => `$${index + 1}`)
  return {
    sql: `insert into public.event (
       ${columns.join(', ')}, created_at, updated_at
     ) values (${placeholders.join(', ')}, now(), now())
     returning *`,
    values,
    correlationSupported,
    persistedCorrelationColumns: correlationColumnsToWrite,
  }
}

async function insertMobileCleanEvent(client, event, correlation, options = {}) {
  const availableColumns = await readPublicEventColumns(client)
  const schema = eventCorrelationSchema(availableColumns)
  if (!schema.supported) {
    const warn = typeof options.warn === 'function' ? options.warn : console.warn
    warn(
      `[mobile/workflow] public.event correlation schema unavailable; ` +
      `using partial/legacy CLEAN insert with every available correlation column. ` +
      `Missing columns: ${schema.missingColumns.join(', ')}`,
    )
  }

  const insert = buildMobileCleanEventInsert(event, correlation, {
    correlationSupported: schema.supported,
    availableCorrelationColumns: availableColumns,
    matchedAt: options.matchedAt,
  })
  const result = await client.query(insert.sql, insert.values)
  return result.rows?.[0] ?? null
}

module.exports = {
  EVENT_CORRELATION_COLUMNS,
  buildMobileCleanEventInsert,
  correlationColumnValues,
  eventCorrelationSchema,
  insertMobileCleanEvent,
  normalizeCorrelationForPersistence,
  occurrenceDateYmdInTimeZone,
  readPublicEventColumns,
  readRawTaskPlansForOrganization,
  resolveMobileZoneQrRows,
  warsawOccurrenceDateYmd,
}
