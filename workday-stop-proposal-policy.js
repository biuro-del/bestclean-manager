'use strict'

const PROPOSAL_STATUSES = Object.freeze([
  'PENDING',
  'APPROVED',
  'CORRECTED',
  'REJECTED',
  'SUPERSEDED',
])

const DECISION_ACTIONS = Object.freeze(['APPROVE', 'CORRECT', 'REJECT'])
const WORKDAY_STOP_PROPOSAL_TIME_ZONE = 'Europe/Warsaw'
const WORKDAY_STOP_PROPOSAL_MAX_DURATION_SEC = 12 * 60 * 60

class WorkdayStopProposalError extends Error {
  constructor(statusCode, code, message, details = undefined) {
    super(message)
    this.name = 'WorkdayStopProposalError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

function text(value) {
  return String(value ?? '').trim()
}

function identifier(value, field, maxLength = 128) {
  const normalized = text(value)
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f]/.test(normalized)) {
    throw new WorkdayStopProposalError(400, 'WORKDAY_STOP_PROPOSAL_VALIDATION_ERROR', `Niepoprawne pole: ${field}.`)
  }
  return normalized
}

function optionalText(value, maxLength = 2000) {
  const normalized = text(value)
  if (normalized.length > maxLength || /[\u0000-\u001f]/.test(normalized)) {
    throw new WorkdayStopProposalError(400, 'WORKDAY_STOP_PROPOSAL_VALIDATION_ERROR', 'Komentarz jest za d?ugi albo zawiera niedozwolone znaki.')
  }
  return normalized
}

function instant(value, field) {
  const normalized = text(value)
  const parsed = new Date(normalized)
  if (!normalized || Number.isNaN(parsed.getTime())) {
    throw new WorkdayStopProposalError(400, 'WORKDAY_STOP_PROPOSAL_INVALID_TIME', `Niepoprawna data: ${field}.`)
  }
  return parsed
}

function formatLocalDateTime(value, timeZone = WORKDAY_STOP_PROPOSAL_TIME_ZONE) {
  const date = value instanceof Date ? value : instant(value, 'date')
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const byType = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:${byType.minute}`
}

function parseWarsawLocalDateTime(proposedStopLocal, timeZone) {
  const normalizedLocal = text(proposedStopLocal)
  const normalizedZone = text(timeZone)
  if (normalizedZone !== WORKDAY_STOP_PROPOSAL_TIME_ZONE) {
    throw new WorkdayStopProposalError(422, 'WORKDAY_STOP_PROPOSAL_TIME_ZONE_INVALID', 'Dopuszczalna strefa czasu to Europe/Warsaw.')
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(normalizedLocal)
  if (!match) {
    throw new WorkdayStopProposalError(400, 'WORKDAY_STOP_PROPOSAL_LOCAL_TIME_INVALID', 'Proponowany STOP musi mie? format RRRR-MM-DDTHH:mm.')
  }
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const nominalUtcMillis = Date.UTC(year, month - 1, day, hour, minute)
  const nominal = new Date(nominalUtcMillis)
  if (
    nominal.getUTCFullYear() !== year ||
    nominal.getUTCMonth() !== month - 1 ||
    nominal.getUTCDate() !== day ||
    nominal.getUTCHours() !== hour ||
    nominal.getUTCMinutes() !== minute
  ) {
    throw new WorkdayStopProposalError(400, 'WORKDAY_STOP_PROPOSAL_LOCAL_TIME_INVALID', 'Proponowana lokalna data nie istnieje.')
  }

  // Gather both offsets around the requested civil time. Matching by formatting
  // rejects spring DST gaps and autumn DST repetitions rather than guessing.
  const offsets = new Set()
  for (const hours of [-36, -12, 0, 12, 36]) {
    const probe = new Date(nominalUtcMillis + hours * 60 * 60 * 1000)
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: normalizedZone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(probe)
    const byType = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
    const localAsUtc = Date.UTC(Number(byType.year), Number(byType.month) - 1, Number(byType.day), Number(byType.hour), Number(byType.minute), Number(byType.second))
    offsets.add(localAsUtc - probe.getTime())
  }
  const candidates = [...offsets]
    .map((offset) => new Date(nominalUtcMillis - offset))
    .filter((candidate) => formatLocalDateTime(candidate, normalizedZone) === normalizedLocal)
  if (candidates.length !== 1) {
    throw new WorkdayStopProposalError(
      422,
      candidates.length ? 'WORKDAY_STOP_PROPOSAL_LOCAL_TIME_AMBIGUOUS' : 'WORKDAY_STOP_PROPOSAL_LOCAL_TIME_NONEXISTENT',
      'Podana lokalna godzina jest niejednoznaczna albo nie istnieje w strefie Europe/Warsaw.',
    )
  }
  return {
    proposedStopAt: candidates[0].toISOString(),
    proposedStopLocal: normalizedLocal,
    timeZone: normalizedZone,
  }
}

function secondsBetween(startAt, stopAt) {
  return Math.floor((stopAt.getTime() - startAt.getTime()) / 1000)
}

function warsawDate(value) {
  const date = value instanceof Date ? value : instant(value, 'date')
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const byType = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

function assertHistoricalWorkday({ startAt, now = new Date() }) {
  const start = instant(startAt, 'startAt')
  const current = now instanceof Date ? now : instant(now, 'now')
  const startDate = warsawDate(startAt)
  const today = warsawDate(current)
  const reachedLimit = current.getTime() - start.getTime() >= WORKDAY_STOP_PROPOSAL_MAX_DURATION_SEC * 1000
  if (startDate >= today && !reachedLimit) {
    throw new WorkdayStopProposalError(
      409,
      'WORKDAY_STOP_PROPOSAL_NOT_HISTORICAL',
      'Godzinę zakończenia można uzupełnić po przekroczeniu 12 godzin albo dla wcześniejszego dnia pracy.',
    )
  }
}

function assertWorkerOwnsOpenWorkday({ workday, worker }) {
  const workerLogin = text(worker?.login).toLowerCase()
  const workdayLogin = text(workday?.worker_login ?? workday?.workerLogin).toLowerCase()
  if (!workerLogin || !workdayLogin || workerLogin !== workdayLogin) {
    throw new WorkdayStopProposalError(403, 'WORKDAY_STOP_PROPOSAL_FORBIDDEN', 'Mo?esz zg?osi? godzin? wy??cznie dla w?asnego dnia pracy.')
  }
  if (workday?.end_at ?? workday?.endAt) {
    throw new WorkdayStopProposalError(409, 'WORKDAY_ALREADY_STOPPED', 'Ten dzie? ma ju? oficjalny STOP.')
  }
  if (!workday?.start_at && !workday?.startAt) {
    throw new WorkdayStopProposalError(409, 'WORKDAY_START_AMBIGUOUS', 'Dzie? pracy nie ma jednoznacznego START i wymaga obs?ugi biura.')
  }
}

function assertProposedStop({ startAt, proposedStopAt, now = new Date() }) {
  const start = instant(startAt, 'startAt')
  const proposed = instant(proposedStopAt, 'proposedStopAt')
  const current = now instanceof Date ? now : instant(now, 'now')
  if (proposed.getTime() <= start.getTime()) {
    throw new WorkdayStopProposalError(422, 'WORKDAY_STOP_NOT_AFTER_START', 'Proponowany STOP musi by? p??niejszy ni? START.')
  }
  if (proposed.getTime() > current.getTime()) {
    throw new WorkdayStopProposalError(422, 'WORKDAY_STOP_IN_FUTURE', 'Proponowany STOP nie mo?e by? w przysz?o?ci.')
  }
  if (proposed.getTime() > start.getTime() + WORKDAY_STOP_PROPOSAL_MAX_DURATION_SEC * 1000) {
    throw new WorkdayStopProposalError(
      422,
      'WORKDAY_STOP_AFTER_12H_LIMIT',
      'Godzina STOP nie może przekraczać 12 godzin od START.',
    )
  }
  return { proposedStopAt: proposed.toISOString(), durationSec: secondsBetween(start, proposed) }
}

function normalizeDecisionAction(value) {
  const action = text(value).toUpperCase()
  if (!DECISION_ACTIONS.includes(action)) {
    throw new WorkdayStopProposalError(400, 'WORKDAY_STOP_PROPOSAL_UNKNOWN_ACTION', 'Nieznana decyzja dla zg?oszenia czasu pracy.')
  }
  return action
}

function assertDecision({ action, proposal, actorUid, officialStopAt, decisionNote, allowSelfReview = false, now = new Date() }) {
  const normalizedAction = normalizeDecisionAction(action)
  const actor = identifier(actorUid, 'reviewedBy', 128)
  const submittedBy = text(proposal?.submitted_by ?? proposal?.submittedBy)
  if (submittedBy && submittedBy === actor && allowSelfReview !== true) {
    throw new WorkdayStopProposalError(403, 'WORKDAY_STOP_PROPOSAL_SELF_REVIEW_FORBIDDEN', 'Nie mo?esz zatwierdzi? ani poprawi? w?asnego zg?oszenia.')
  }
  if (text(proposal?.status).toUpperCase() !== 'PENDING') {
    throw new WorkdayStopProposalError(409, 'WORKDAY_STOP_PROPOSAL_NOT_PENDING', 'To zg?oszenie nie oczekuje ju? na decyzj?.')
  }

  const note = optionalText(decisionNote)
  if (normalizedAction === 'REJECT') {
    if (!note) {
      throw new WorkdayStopProposalError(422, 'WORKDAY_STOP_PROPOSAL_REJECTION_REASON_REQUIRED', 'Przy odrzuceniu podaj pow?d.')
    }
    return { action: normalizedAction, decisionNote: note, officialStopAt: null }
  }

  const proposed = proposal?.proposed_stop_at ?? proposal?.proposedStopAt
  const effectiveStop = normalizedAction === 'APPROVE' ? proposed : officialStopAt
  const valid = assertProposedStop({ startAt: proposal?.start_at ?? proposal?.startAt, proposedStopAt: effectiveStop, now })
  return {
    action: normalizedAction,
    decisionNote: note,
    officialStopAt: valid.proposedStopAt,
    durationSec: valid.durationSec,
    status: normalizedAction === 'APPROVE' ? 'APPROVED' : 'CORRECTED',
  }
}

function assertSameOrganization(proposalOrgId, requestedOrgId) {
  if (identifier(proposalOrgId, 'proposalOrgId', 64) !== identifier(requestedOrgId, 'orgId', 64)) {
    throw new WorkdayStopProposalError(403, 'WORKDAY_STOP_PROPOSAL_ORG_FORBIDDEN', 'Zg?oszenie nie nale?y do wybranej organizacji.')
  }
}

module.exports = {
  DECISION_ACTIONS,
  PROPOSAL_STATUSES,
  WORKDAY_STOP_PROPOSAL_MAX_DURATION_SEC,
  WORKDAY_STOP_PROPOSAL_TIME_ZONE,
  WorkdayStopProposalError,
  assertDecision,
  assertHistoricalWorkday,
  assertProposedStop,
  assertSameOrganization,
  assertWorkerOwnsOpenWorkday,
  identifier,
  optionalText,
  parseWarsawLocalDateTime,
  secondsBetween,
  text,
}
