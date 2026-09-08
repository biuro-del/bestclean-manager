'use strict'

const crypto = require('node:crypto')
const {
  WorkdayStopProposalError,
  assertDecision,
  assertHistoricalWorkday,
  assertProposedStop,
  assertSameOrganization,
  assertWorkerOwnsOpenWorkday,
  identifier,
  optionalText,
  parseWarsawLocalDateTime,
  text,
} = require('./workday-stop-proposal-policy')
const {
  createWorkdayStopProposalRepository,
  mapProposal,
  WORKDAY_STOP_PROPOSAL_EVENT_END_REASON,
} = require('./workday-stop-proposal-repository')

function apiError(statusCode, code, message, details = undefined) {
  return new WorkdayStopProposalError(statusCode, code, message, details)
}

function clientActionId(value, field = 'clientActionId') {
  return identifier(value, field, 128)
}

function statusWorkdayIds(value) {
  if (!Array.isArray(value)) {
    throw apiError(400, 'WORKDAY_STOP_PROPOSAL_STATUS_IDS_REQUIRED', 'Podaj listę dni pracy do sprawdzenia.')
  }
  // Enforce the bound before de-duplication so a very large body cannot avoid
  // the request-size limit simply by repeating the same identifier.
  if (!value.length || value.length > 120) {
    throw apiError(400, 'WORKDAY_STOP_PROPOSAL_STATUS_IDS_INVALID', 'Lista dni pracy musi zawierać od 1 do 120 pozycji.')
  }
  const ids = []
  const seen = new Set()
  for (const item of value) {
    const workdayId = identifier(item, 'workdayIds[]', 64)
    if (seen.has(workdayId)) continue
    seen.add(workdayId)
    ids.push(workdayId)
  }
  return ids
}

function mobileOperation(body) {
  const operation = text(body?.operation).toUpperCase()
  // Keep the deployed WEB caller compatible while APK moves to the explicit
  // operation contract. New clients must send SUBMIT; unknown values fail closed.
  if (!operation) return 'LEGACY_SUBMIT'
  if (['SUBMIT', 'STATUS', 'STATUS_ACTION'].includes(operation)) return operation
  throw apiError(400, 'WORKDAY_STOP_PROPOSAL_OPERATION_INVALID', 'Dozwolone operacje to SUBMIT, STATUS i STATUS_ACTION.')
}

function dateFilter(value, field) {
  const normalized = text(value)
  if (!normalized) return ''
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw apiError(400, 'WORKDAY_STOP_PROPOSAL_DATE_INVALID', `Niepoprawny filtr daty: ${field}.`)
  }
  return normalized
}

function responseError(error, fallbackCode, fallbackMessage) {
  if (error instanceof WorkdayStopProposalError) return error
  if (Number.isFinite(Number(error?.statusCode)) && text(error?.publicCode)) {
    return apiError(Number(error.statusCode), text(error.publicCode), text(error.publicMessage) || fallbackMessage, error?.publicDetails)
  }
  if (error?.code === '23505') {
    if (text(error?.constraint) === 'workday_stop_proposal_worker_client_action_uidx') {
      return apiError(409, 'WORKDAY_STOP_PROPOSAL_IDEMPOTENCY_SCOPE_CONFLICT', 'Klucz idempotencji został użyty dla innego dnia pracy.')
    }
    return apiError(409, 'WORKDAY_STOP_PROPOSAL_DUPLICATE_PENDING', 'Dla tego dnia istnieje ju? oczekuj?ca propozycja.')
  }
  if (error?.code === '23503') {
    return apiError(409, 'WORKDAY_STOP_PROPOSAL_SCOPE_CONFLICT', 'Dzie? pracy lub organizacja nie s? ju? dost?pne.')
  }
  if (error?.code === '22007' || error?.code === '22008' || error?.code === '22003') {
    return apiError(400, 'WORKDAY_STOP_PROPOSAL_VALIDATION_ERROR', 'Niepoprawny czas lub zakres danych.')
  }
  return apiError(500, fallbackCode, fallbackMessage)
}

function proposalPayload(row) {
  return row && typeof row === 'object' ? mapProposal(row) : null
}

function mobileProposalPayload(proposal) {
  return {
    proposalId: text(proposal?.proposalId),
    workdayId: text(proposal?.workdayId),
    clientActionId: text(proposal?.clientActionId),
    status: text(proposal?.status),
    proposedStopAt: text(proposal?.proposedStopAt),
    proposedStopLocal: text(proposal?.proposedStopLocal),
    timeZone: text(proposal?.timeZone),
    employeeNote: text(proposal?.employeeNote),
    decisionNote: text(proposal?.decisionNote),
    officialStopAt: text(proposal?.officialStopAt),
    submittedAt: text(proposal?.submittedAt),
    reviewedAt: text(proposal?.reviewedAt),
  }
}

function mobileStatusProposalPayload(proposal) {
  return mobileProposalPayload(proposal)
}

function mobileProposalReceipt(proposal, idempotent) {
  if (!proposal) return null
  return {
    operation: 'SUBMIT',
    proposalId: text(proposal.proposalId),
    workdayId: text(proposal.workdayId),
    clientActionId: text(proposal.clientActionId),
    status: text(proposal.status),
    idempotent: idempotent === true,
  }
}

function normalizeMobileSubmitIntent(body) {
  const localProposal = parseWarsawLocalDateTime(body?.proposedStopLocal, body?.timeZone)
  return {
    workdayId: identifier(body?.workdayId, 'workdayId', 64),
    clientActionId: clientActionId(body?.clientActionId),
    employeeNote: optionalText(body?.employeeNote),
    ...localProposal,
  }
}

function assertSubmitIntentMatchesProposal(existingRow, intent) {
  const existing = proposalPayload(existingRow)
  if (text(existing?.workdayId) !== intent.workdayId) {
    throw apiError(409, 'WORKDAY_STOP_PROPOSAL_IDEMPOTENCY_SCOPE_CONFLICT', 'Klucz idempotencji został użyty dla innego dnia pracy.')
  }
  const samePayload =
    text(existing?.proposedStopAt) === intent.proposedStopAt &&
    text(existing?.proposedStopLocal) === intent.proposedStopLocal &&
    text(existing?.timeZone) === intent.timeZone &&
    text(existing?.employeeNote) === intent.employeeNote
  if (!samePayload) {
    throw apiError(
      409,
      'WORKDAY_STOP_PROPOSAL_IDEMPOTENCY_PAYLOAD_CONFLICT',
      'Ten clientActionId został już użyty z inną godziną lub treścią zgłoszenia.',
    )
  }
  return existing
}

function normalizedInstantText(value) {
  if (!text(value)) return ''
  const parsed = value instanceof Date ? value : new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : text(value)
}

function assertDecisionReplayMatchesAudit(existingAudit, decision, uid) {
  const expectedAction = decision.action === 'REJECT' ? 'REJECTED' : decision.status
  const sameIntent =
    text(existingAudit?.action).toUpperCase() === expectedAction &&
    text(existingAudit?.actor_uid ?? existingAudit?.actorUid) === text(uid) &&
    normalizedInstantText(existingAudit?.official_stop_at ?? existingAudit?.officialStopAt) ===
      normalizedInstantText(decision.officialStopAt) &&
    text(existingAudit?.note) === text(decision.decisionNote)
  if (!sameIntent) {
    throw apiError(
      409,
      'WORKDAY_STOP_PROPOSAL_DECISION_IDEMPOTENCY_CONFLICT',
      'Ten clientActionId został już użyty dla innej decyzji.',
    )
  }
}

const TEST_SELF_APPROVAL_PROJECT_ID = 'cleanzi-portal-klienta-test'
const TEST_SELF_APPROVAL_AUDIT_NOTE = 'Zatwierdzono przez \u015bci\u015ble ograniczony wyj\u0105tek samoakceptacji w \u015brodowisku testowym.'

function createTestSelfApprovalGuard({
  projectId = process.env.FIREBASE_PROJECT_ID,
  enabled = process.env.WORKDAY_STOP_PROPOSAL_TEST_SELF_APPROVAL,
  orgId = process.env.WORKDAY_STOP_PROPOSAL_TEST_SELF_APPROVAL_ORG_ID,
  proposalId = process.env.WORKDAY_STOP_PROPOSAL_TEST_SELF_APPROVAL_PROPOSAL_ID,
} = {}) {
  const allowedProjectId = text(projectId)
  const allowedOrgId = text(orgId)
  const allowedProposalId = text(proposalId)
  const active =
    allowedProjectId === TEST_SELF_APPROVAL_PROJECT_ID &&
    text(enabled) === '1' &&
    Boolean(allowedOrgId && allowedProposalId)

  function allowsScope({ orgId: requestedOrgId, proposalId: requestedProposalId } = {}) {
    return active && text(requestedOrgId) === allowedOrgId && text(requestedProposalId) === allowedProposalId
  }

  function allows({ orgId: requestedOrgId, proposalId: requestedProposalId, uid, proposal } = {}) {
    const submittedBy = text(proposal?.submitted_by ?? proposal?.submittedBy)
    return allowsScope({ orgId: requestedOrgId, proposalId: requestedProposalId }) && Boolean(submittedBy) && submittedBy === text(uid)
  }

  return { allowsScope, allows }
}

function isWorkerPortalRole(role) {
  const normalized = text(role)
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  return normalized === 'worker' || normalized === 'pracownik' || normalized.includes('worker') || normalized.includes('pracownik')
}

// The portal itself rejects WORKER accounts. Keep the same rule on the API so a
// worker cannot bypass the UI and approve a STOP proposal through a direct call.
function portalMembershipCanApprove(membership) {
  return text(membership?.status).toUpperCase() === 'ACTIVE' && !isWorkerPortalRole(membership?.role)
}

function createWorkdayStopProposalApi(dependencies = {}) {
  const {
    connectDbClient,
    getRequesterMembership,
    parseBearerToken,
    readJsonBody,
    resolveMobileOrganization,
    resolveMobileWorker,
    sendApiError,
    sendJson,
    sendMobileApiError,
    sendMobileJson,
    verifyFirebaseIdToken,
    createRepository = createWorkdayStopProposalRepository,
    createId = () => crypto.randomUUID(),
    testSelfApprovalGuard = createTestSelfApprovalGuard(),
  } = dependencies

  if (![connectDbClient, getRequesterMembership, parseBearerToken, readJsonBody, resolveMobileOrganization, resolveMobileWorker, sendApiError, sendJson, sendMobileApiError, sendMobileJson, verifyFirebaseIdToken, createRepository, createId].every((fn) => typeof fn === 'function') || typeof testSelfApprovalGuard?.allowsScope !== 'function' || typeof testSelfApprovalGuard?.allows !== 'function') {
    throw new TypeError('Workday stop proposal API dependencies are incomplete.')
  }

  async function authenticate(req, orgId, mobile = false) {
    const token = parseBearerToken(req)
    if (!token) throw apiError(401, 'UNAUTHENTICATED', 'Brak tokenu Firebase.')
    let decoded
    try {
      decoded = await verifyFirebaseIdToken(token)
    } catch {
      throw apiError(401, 'UNAUTHENTICATED', 'Sesja wygas?a. Zaloguj si? ponownie.')
    }
    const uid = identifier(decoded?.uid, 'uid', 128)
    return { decoded, uid, mobile }
  }

  async function assertSchema(repository) {
    if (!(await repository.schemaReady())) {
      throw apiError(503, 'WORKDAY_STOP_PROPOSAL_SCHEMA_NOT_READY', 'Schemat propozycji STOP nie jest jeszcze aktywny w tym ?rodowisku.')
    }
  }

  async function submitMobileProposal(repository, { orgId, worker, uid, body }) {
    const intent = normalizeMobileSubmitIntent(body)
    const workdayId = intent.workdayId
    const actionId = intent.clientActionId
    // Resolve an acknowledged retry before locking or validating mutable
    // Workday state. A lost response remains recoverable after later approval.
    const existingByKey = await repository.findProposalByClientAction({
      orgId,
      workerId: worker.workerId,
      clientActionId: actionId,
    })
    if (existingByKey) {
      return { idempotent: true, proposal: assertSubmitIntentMatchesProposal(existingByKey, intent) }
    }

    const workday = await repository.lockWorkday({ orgId, workdayId })
    if (!workday) {
      throw apiError(404, 'WORKDAY_NOT_FOUND', 'Nie znaleziono dnia pracy.')
    }
    assertWorkerOwnsOpenWorkday({ workday, worker })
    assertHistoricalWorkday({ startAt: workday.start_at })
    const validProposal = {
      ...assertProposedStop({ startAt: workday.start_at, proposedStopAt: intent.proposedStopAt }),
      proposedStopAt: intent.proposedStopAt,
      proposedStopLocal: intent.proposedStopLocal,
      timeZone: intent.timeZone,
    }

    // A concurrent first SUBMIT may have committed while this transaction
    // waited on the Workday row lock. Re-read before the one-PENDING guard.
    const existingAfterLock = await repository.findProposalByClientAction({
      orgId,
      workerId: worker.workerId,
      clientActionId: actionId,
    })
    if (existingAfterLock) {
      return { idempotent: true, proposal: assertSubmitIntentMatchesProposal(existingAfterLock, intent) }
    }
    const pending = await repository.findPendingForWorkday({ orgId, workdayId })
    if (pending) {
      throw apiError(409, 'WORKDAY_STOP_PROPOSAL_PENDING_EXISTS', 'Dla tego dnia istnieje ju? propozycja oczekuj?ca na decyzj?.')
    }

    const proposal = await repository.insertProposal({
      proposalId: `wdsp_${createId()}`,
      orgId,
      workerId: identifier(worker.workerId, 'workerId', 128),
      workdayId,
      proposedStopAt: validProposal.proposedStopAt,
      proposedStopLocal: validProposal.proposedStopLocal,
      timeZone: validProposal.timeZone,
      submittedBy: uid,
      employeeNote: intent.employeeNote,
      clientActionId: actionId,
    })
    await repository.appendAudit({
      proposalId: proposal.proposal_id,
      orgId,
      action: 'SUBMITTED',
      actorUid: uid,
      toStatus: 'PENDING',
      note: intent.employeeNote,
      proposedStopAt: validProposal.proposedStopAt,
      clientActionId: actionId,
    })
    return { idempotent: false, proposal: proposalPayload(proposal), durationSec: validProposal.durationSec }
  }

  async function readMobileProposalStatuses(repository, { orgId, worker, workdayIds }) {
    const rows = await repository.listForMobileWorkerWorkdays({
      orgId,
      workerId: identifier(worker?.workerId, 'workerId', 128),
      workerLogin: text(worker?.login),
      workdayIds,
    })
    return rows.map((row) => mobileStatusProposalPayload(proposalPayload(row)))
  }

  async function readMobileProposalStatusByAction(repository, { orgId, worker, actionId }) {
    const row = await repository.findProposalByClientAction({
      orgId,
      workerId: identifier(worker?.workerId, 'workerId', 128),
      clientActionId: actionId,
    })
    return row ? proposalPayload(row) : null
  }

  async function handleMobile(req, res, requestUrl) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' })
      res.end()
      return
    }
    if (text(req.method).toUpperCase() !== 'POST') {
      sendMobileApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolona metoda to POST.')
      return
    }
    let client
    let transactionOpen = false
    try {
      const { decoded, uid } = await authenticate(req, '', true)
      // Authenticate before reading a payload or opening a database transaction.
      // An unauthenticated request must not reach any proposal write path.
      const body = await readJsonBody(req)
      const operation = mobileOperation(body)
      const isStatusRead = operation === 'STATUS'
      const isActionStatusRead = operation === 'STATUS_ACTION'
      const isRead = isStatusRead || isActionStatusRead
      // Validate bounded STATUS input before any DB connection, auth-scope
      // lookup, schema check, lock, or mutation path.
      const statusIds = isStatusRead ? statusWorkdayIds(body?.workdayIds) : null
      const statusActionId = isActionStatusRead ? clientActionId(body?.clientActionId) : ''
      client = await connectDbClient()
      // Read operations are scoped only from the verified Firebase token.
      // Client-provided organization and worker identifiers never expand it.
      const { orgId, membership } = await resolveMobileOrganization(client, decoded, isRead ? '' : body?.orgId)
      const worker = await resolveMobileWorker(client, orgId, isRead ? {} : body, decoded, membership)
      const repository = createRepository(client)
      await assertSchema(repository)

      if (isStatusRead) {
        const proposals = await readMobileProposalStatuses(repository, { orgId, worker, workdayIds: statusIds })
        sendMobileJson(res, 200, { ok: true, operation, proposals })
        return
      }
      if (isActionStatusRead) {
        const proposal = await readMobileProposalStatusByAction(repository, {
          orgId,
          worker,
          actionId: statusActionId,
        })
        const found = Boolean(proposal)
        sendMobileJson(res, 200, {
          ok: true,
          operation,
          found,
          idempotent: found,
          receipt: mobileProposalReceipt(proposal, found),
          proposal: proposal ? mobileProposalPayload(proposal) : null,
        })
        return
      }

      await client.query('begin')
      transactionOpen = true
      const payload = await submitMobileProposal(repository, { orgId, worker, uid, body })
      await client.query('commit')
      transactionOpen = false
      sendMobileJson(res, 200, {
        ok: true,
        operation: 'SUBMIT',
        idempotent: payload.idempotent === true,
        receipt: mobileProposalReceipt(payload.proposal, payload.idempotent),
        proposal: mobileProposalPayload(payload.proposal),
      })
    } catch (error) {
      if (transactionOpen) {
        try { await client?.query('rollback') } catch {}
      }
      const mapped = responseError(error, 'WORKDAY_STOP_PROPOSAL_MOBILE_ERROR', 'Nie uda?o si? zapisa? propozycji STOP.')
      sendMobileApiError(res, mapped.statusCode, mapped.code, mapped.message, mapped.details)
    } finally {
      client?.release?.()
    }
  }

  async function resolvePortalScope(req, requestUrl, body = null) {
    const queryOrgId = text(requestUrl.searchParams.get('orgId'))
    const bodyOrgId = text(body?.orgId)
    if (queryOrgId && bodyOrgId && queryOrgId !== bodyOrgId) {
      throw apiError(403, 'WORKDAY_STOP_PROPOSAL_SCOPE_MISMATCH', 'Zakres organizacji w adresie i tre?ci ??dania jest r??ny.')
    }
    const orgId = identifier(queryOrgId || bodyOrgId, 'orgId', 64)
    const { uid } = await authenticate(req, orgId, false)
    return { orgId, uid }
  }

  async function handlePortalDecision(repository, { orgId, uid, body, membership = null }) {
    const proposalId = identifier(body?.proposalId, 'proposalId', 96)
    // Access is inherited dynamically from the active portal membership. This
    // covers existing and future portal accounts without a mutable backfill.
    // Direct unit callers without a membership keep the explicit-permission
    // compatibility path; HTTP requests always provide a membership.
    const permission = membership
      ? portalMembershipCanApprove(membership)
      : await repository.hasApproverPermission({ orgId, uid })
    if (!permission && !testSelfApprovalGuard.allowsScope({ orgId, proposalId })) {
      throw apiError(403, 'WORKDAY_TIME_APPROVER_REQUIRED', 'Wymagane jest osobne uprawnienie workday_time_approver.')
    }
    const locked = await repository.lockProposalWithWorkday({ orgId, proposalId })
    if (!locked) throw apiError(404, 'WORKDAY_STOP_PROPOSAL_NOT_FOUND', 'Nie znaleziono zg?oszenia.')
    assertSameOrganization(locked.org_id, orgId)
    const testSelfApproval = testSelfApprovalGuard.allows({ orgId, proposalId, uid, proposal: locked })
    if (!permission && !testSelfApproval) {
      throw apiError(403, 'WORKDAY_TIME_APPROVER_REQUIRED', 'Wymagane jest osobne uprawnienie workday_time_approver.')
    }
    const decisionActionId = clientActionId(body?.clientActionId || body?.idempotencyKey)
    const decisionNote = testSelfApproval
      ? `${TEST_SELF_APPROVAL_AUDIT_NOTE}${text(body?.decisionNote) ? ` ${text(body.decisionNote)}` : ''}`
      : body?.decisionNote
    const requestedDecision = () => assertDecision({
      action: body?.action,
      // A completed proposal is cloned as PENDING only to validate and
      // fingerprint an idempotent retry. No persistence uses this clone.
      proposal: { ...locked, status: 'PENDING', start_at: locked.start_at },
      actorUid: uid,
      officialStopAt: body?.officialStopAt,
      decisionNote,
      allowSelfReview: testSelfApproval,
    })
    const existingDecision = await repository.findDecisionAudit({ orgId, proposalId, clientActionId: decisionActionId })
    if (existingDecision) {
      assertDecisionReplayMatchesAudit(existingDecision, requestedDecision(), uid)
      return { idempotent: true, proposal: proposalPayload(locked) }
    }
    if (text(locked.status).toUpperCase() !== 'PENDING') {
      throw apiError(409, 'WORKDAY_STOP_PROPOSAL_NOT_PENDING', 'To zg?oszenie nie oczekuje ju? na decyzj?.')
    }
    if (body?.expectedVersion !== undefined && Number(body.expectedVersion) !== Number(locked.version)) {
      throw apiError(409, 'WORKDAY_STOP_PROPOSAL_VERSION_CONFLICT', 'Zg?oszenie zmieni?o si? ? od?wie? szczeg??y przed decyzj?.')
    }
    if (locked.workday_end_at) {
      const superseded = await repository.updateProposalDecision({
        orgId, proposalId, status: 'SUPERSEDED', reviewedBy: uid,
        decisionNote: 'Oficjalny STOP zosta? zapisany przed decyzj? biura.', officialStopAt: null,
      })
      await repository.appendAudit({
        proposalId, orgId, action: 'SUPERSEDED', actorUid: uid, fromStatus: 'PENDING', toStatus: 'SUPERSEDED',
        note: 'Oficjalny STOP zosta? zapisany przed decyzj? biura.', clientActionId: decisionActionId,
      })
      return { conflict: true, proposal: proposalPayload(superseded) }
    }

    const decision = requestedDecision()
    if (decision.action === 'REJECT') {
      const rejected = await repository.updateProposalDecision({
        orgId, proposalId, status: 'REJECTED', reviewedBy: uid, decisionNote: decision.decisionNote, officialStopAt: null,
      })
      await repository.appendAudit({
        proposalId, orgId, action: 'REJECTED', actorUid: uid, fromStatus: 'PENDING', toStatus: 'REJECTED',
        note: decision.decisionNote, proposedStopAt: locked.proposed_stop_at, clientActionId: decisionActionId,
      })
      return { proposal: proposalPayload(rejected) }
    }

    // The outer portal transaction holds the proposal, canonical Workday and
    // every linked Event. Validate/close activities first so an impossible STOP
    // fails before any proposal or Workday row is changed.
    const closedEvents = await repository.closeOpenEventsForWorkday({
      orgId,
      workdayId: locked.workday_id,
      officialStopAt: decision.officialStopAt,
      endReason: WORKDAY_STOP_PROPOSAL_EVENT_END_REASON,
    })
    const updatedProposal = await repository.updateProposalDecision({
      orgId, proposalId, status: decision.status, reviewedBy: uid,
      decisionNote: decision.decisionNote, officialStopAt: decision.officialStopAt,
    })
    const officialWorkday = await repository.updateOfficialWorkdayStop({
      orgId, workdayId: locked.workday_id, officialStopAt: decision.officialStopAt,
      durationSec: decision.durationSec, reviewedBy: uid,
    })
    if (!officialWorkday) {
      throw apiError(409, 'WORKDAY_ALREADY_STOPPED', 'Oficjalny STOP zosta? zapisany r?wnolegle. Decyzja nie zosta?a zatwierdzona.')
    }
    await repository.appendAudit({
      proposalId, orgId, action: decision.status, actorUid: uid, fromStatus: 'PENDING', toStatus: decision.status,
      note: decision.decisionNote, proposedStopAt: locked.proposed_stop_at,
      officialStopAt: decision.officialStopAt, clientActionId: decisionActionId,
    })
    return {
      proposal: proposalPayload(updatedProposal),
      officialWorkday,
      closedEventCount: Number(closedEvents?.closedCount || 0),
    }
  }

  async function handlePortal(req, res, requestUrl) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    const method = text(req.method).toUpperCase()
    if (!['GET', 'POST'].includes(method)) {
      sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Dozwolone metody to GET i POST.')
      return
    }
    let client
    try {
      const body = method === 'POST' ? await readJsonBody(req) : null
      const { orgId, uid } = await resolvePortalScope(req, requestUrl, body)
      client = await connectDbClient()
      await client.query('begin')
      const membership = await getRequesterMembership(client, orgId, uid)
      if (!membership) throw apiError(403, 'WORKDAY_STOP_PROPOSAL_FORBIDDEN', 'Brak dost?pu do tej organizacji.')
      const repository = createRepository(client)
      await assertSchema(repository)
      if (method === 'GET') {
        const proposalId = text(requestUrl.searchParams.get('proposalId'))
        const permission = portalMembershipCanApprove(membership)
        if (proposalId) {
          const detail = await repository.getReviewDetail({ orgId, proposalId: identifier(proposalId, 'proposalId', 96) })
          if (!detail) throw apiError(404, 'WORKDAY_STOP_PROPOSAL_NOT_FOUND', 'Nie znaleziono zg?oszenia.')
          const testSelfApproval = testSelfApprovalGuard.allows({ orgId, proposalId, uid, proposal: detail.proposal })
          await client.query('commit')
          sendJson(res, 200, { ok: true, data: { ...detail, capability: { canApprove: permission || testSelfApproval, testSelfApproval } } })
          return
        }
        const filters = {
          orgId,
          workerId: text(requestUrl.searchParams.get('workerId')),
          from: dateFilter(requestUrl.searchParams.get('from'), 'from'),
          to: dateFilter(requestUrl.searchParams.get('to'), 'to'),
          status: text(requestUrl.searchParams.get('status')).toUpperCase() || 'PENDING',
          limit: Math.min(Math.max(Number(requestUrl.searchParams.get('limit')) || 100, 1), 100),
        }
        const proposals = await repository.listForReview(filters)
        const total = await repository.countForReview(filters)
        await client.query('commit')
        sendJson(res, 200, { ok: true, data: { proposals, total, capability: { canApprove: permission, testSelfApproval: false } } })
        return
      }
      const result = await handlePortalDecision(repository, { orgId, uid, body, membership })
      await client.query('commit')
      if (result.conflict) {
        sendApiError(res, 409, 'WORKDAY_ALREADY_STOPPED', 'Oficjalny STOP zosta? ju? zapisany; zg?oszenie oznaczono jako nieaktualne.')
        return
      }
      sendJson(res, 200, { ok: true, data: result })
    } catch (error) {
      try { await client?.query('rollback') } catch {}
      const mapped = responseError(error, 'WORKDAY_STOP_PROPOSAL_PORTAL_ERROR', 'Nie uda?o si? obs?u?y? zg?oszenia czasu pracy.')
      sendApiError(res, mapped.statusCode, mapped.code, mapped.message, mapped.details)
    } finally {
      client?.release?.()
    }
  }

  return { handleMobile, handlePortal, submitMobileProposal, handlePortalDecision }
}

module.exports = {
  TEST_SELF_APPROVAL_AUDIT_NOTE,
  WorkdayStopProposalError,
  createTestSelfApprovalGuard,
  createWorkdayStopProposalApi,
  dateFilter,
  mobileOperation,
  portalMembershipCanApprove,
  mobileProposalPayload,
  mobileProposalReceipt,
}
