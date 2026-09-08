'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createWorkdayStopProposalApi, dateFilter, portalMembershipCanApprove, WorkdayStopProposalError } = require('../workday-stop-proposal-api')
const { createWorkdayStopProposalRepository } = require('../workday-stop-proposal-repository')

const START = '2026-08-11T06:00:00.000Z'
const PROPOSED_STOP = '2026-08-11T14:00:00.000Z'

function createApi(overrides = {}) {
  return createWorkdayStopProposalApi({
    connectDbClient: async () => ({ query: async () => {}, release: () => {} }),
    getRequesterMembership: async () => ({}),
    parseBearerToken: () => 'token',
    readJsonBody: async () => ({}),
    resolveMobileOrganization: async () => ({ orgId: 'best-clean', membership: {} }),
    resolveMobileWorker: async () => ({ login: 'worker@example.com', workerId: 'W-1' }),
    sendApiError: () => {}, sendJson: () => {}, sendMobileApiError: () => {}, sendMobileJson: () => {},
    verifyFirebaseIdToken: async () => ({ uid: 'worker-uid' }),
    createId: () => 'deterministic',
    ...overrides,
  })
}

function pendingProposal(overrides = {}) {
  return {
    proposal_id: 'p-1', org_id: 'best-clean', workday_id: 'wd-1', worker_id: 'W-1',
    worker_login: 'worker@example.com', worker_name: 'Pracownik Testowy',
    start_at: START, proposed_stop_at: PROPOSED_STOP, proposed_stop_local: '2026-08-11T16:00', time_zone: 'Europe/Warsaw', status: 'PENDING', version: 1,
    submitted_by: 'worker-uid', client_action_id: 'submit-action-1', workday_end_at: null,
    ...overrides,
  }
}

test('portalowa lista zgłoszeń zwraca tokenowo zawężony total obok limitowanej strony', async () => {
  const sent = []
  const calls = []
  const api = createApi({
    connectDbClient: async () => ({ query: async () => {}, release: () => {} }),
    getRequesterMembership: async () => ({ status: 'ACTIVE', role: 'COORDINATOR' }),
    createRepository: () => ({
      schemaReady: async () => true,
      listForReview: async (filters) => { calls.push(['list', filters]); return [pendingProposal()] },
      countForReview: async (filters) => { calls.push(['count', filters]); return 7 },
    }),
    sendJson: (_res, status, body) => sent.push({ status, body }),
  })

  await api.handlePortal(
    { method: 'GET', headers: {} },
    {},
    new URL('https://portal.cleanzi.pl/api/portal/workday-stop-proposals?orgId=best-clean&status=PENDING&limit=1'),
  )

  assert.equal(sent[0].status, 200)
  assert.equal(sent[0].body.data.total, 7)
  assert.equal(sent[0].body.data.proposals.length, 1)
  assert.deepEqual(calls[0][1], calls[1][1])
  assert.equal(calls[0][1].limit, 1)
})

test('decyzja APPROVE zapisuje kanoniczny Workday STOP i domyka otwarte Eventy tą samą godziną', async () => {
  const calls = []
  const repository = {
    hasApproverPermission: async () => true,
    lockProposalWithWorkday: async () => pendingProposal(),
    findDecisionAudit: async () => null,
    updateProposalDecision: async (input) => { calls.push(['proposal', input]); return { ...pendingProposal(), ...input } },
    updateOfficialWorkdayStop: async (input) => { calls.push(['workday', input]); return { workday_id: input.workdayId, end_at: input.officialStopAt } },
    closeOpenEventsForWorkday: async (input) => { calls.push(['events', input]); return { closedCount: 2 } },
    appendAudit: async (input) => { calls.push(['audit', input]) },
  }
  const result = await createApi().handlePortalDecision(repository, {
    orgId: 'best-clean', uid: 'office-uid', body: { proposalId: 'p-1', action: 'APPROVE', clientActionId: 'decision-1', expectedVersion: 1 },
  })
  assert.equal(result.officialWorkday.end_at, PROPOSED_STOP)
  assert.equal(calls.filter(([kind]) => kind === 'workday').length, 1)
  assert.equal(calls.find(([kind]) => kind === 'workday')[1].durationSec, 8 * 60 * 60)
  assert.deepEqual(calls.find(([kind]) => kind === 'events')[1], {
    orgId: 'best-clean',
    workdayId: 'wd-1',
    officialStopAt: PROPOSED_STOP,
    endReason: 'WORKDAY_STOP_PROPOSAL',
  })
  assert.equal(result.closedEventCount, 2)
})

test('aktywny dostęp portalowy daje prawo decyzji, a WORKER pozostaje zablokowany', async () => {
  assert.equal(portalMembershipCanApprove({ status: 'ACTIVE', role: 'COORDINATOR' }), true)
  assert.equal(portalMembershipCanApprove({ status: 'ACTIVE', role: 'PLATFORM_OWNER' }), true)
  assert.equal(portalMembershipCanApprove({ status: 'ACTIVE', role: 'WORKER' }), false)
  assert.equal(portalMembershipCanApprove({ status: 'ACTIVE', role: 'Pracownik' }), false)
  assert.equal(portalMembershipCanApprove({ status: 'INACTIVE', role: 'COORDINATOR' }), false)
})

test('portalowa decyzja używa aktywnego dostępu bez wpisu uprawnienia i nie dopuszcza WORKER', async () => {
  const allowedWrites = []
  const client = { query: async () => {}, release: () => {} }
  const allowedRepository = {
    schemaReady: async () => true,
    hasApproverPermission: async () => { throw new Error('Nie powinno odczytywać osobnego wpisu uprawnienia.') },
    lockProposalWithWorkday: async () => pendingProposal(),
    findDecisionAudit: async () => null,
    updateProposalDecision: async (input) => ({ ...pendingProposal(), ...input }),
    updateOfficialWorkdayStop: async (input) => { allowedWrites.push(input); return { end_at: input.officialStopAt } },
    closeOpenEventsForWorkday: async () => ({ closedCount: 1 }),
    appendAudit: async () => {},
  }
  const allowedSent = []
  const allowedApi = createApi({
    connectDbClient: async () => client,
    createRepository: () => allowedRepository,
    getRequesterMembership: async () => ({ status: 'ACTIVE', role: 'COORDINATOR' }),
    readJsonBody: async () => ({ proposalId: 'p-1', action: 'APPROVE', clientActionId: 'portal-access-1' }),
    verifyFirebaseIdToken: async () => ({ uid: 'office-uid' }),
    sendJson: (_res, status, body) => allowedSent.push({ status, body }),
  })
  await allowedApi.handlePortal({ method: 'POST', headers: {} }, {}, new URL('https://portal.cleanzi.pl/api/portal/workday-stop-proposals?orgId=best-clean'))
  assert.equal(allowedSent[0].status, 200)
  assert.equal(allowedWrites.length, 1)

  const deniedSent = []
  let locked = false
  const deniedApi = createApi({
    connectDbClient: async () => client,
    createRepository: () => ({
      schemaReady: async () => true,
      hasApproverPermission: async () => true,
      lockProposalWithWorkday: async () => { locked = true; return pendingProposal() },
    }),
    getRequesterMembership: async () => ({ status: 'ACTIVE', role: 'WORKER' }),
    readJsonBody: async () => ({ proposalId: 'p-1', action: 'APPROVE', clientActionId: 'portal-access-2' }),
    verifyFirebaseIdToken: async () => ({ uid: 'office-uid' }),
    sendApiError: (_res, status, code) => deniedSent.push({ status, code }),
  })
  await deniedApi.handlePortal({ method: 'POST', headers: {} }, {}, new URL('https://portal.cleanzi.pl/api/portal/workday-stop-proposals?orgId=best-clean'))
  assert.deepEqual(deniedSent, [{ status: 403, code: 'WORKDAY_TIME_APPROVER_REQUIRED' }])
  assert.equal(locked, false)
})

test('decyzja CORRECT zapisuje godzin? biura, a REJECT nie wywo?uje zapisu STOP', async () => {
  const correctedAt = '2026-08-11T15:15:00.000Z'
  const corrections = []
  const eventClosures = []
  const repository = {
    hasApproverPermission: async () => true,
    lockProposalWithWorkday: async () => pendingProposal(),
    findDecisionAudit: async () => null,
    updateProposalDecision: async (input) => ({ ...pendingProposal(), ...input }),
    updateOfficialWorkdayStop: async (input) => { corrections.push(input); return { end_at: input.officialStopAt } },
    closeOpenEventsForWorkday: async (input) => { eventClosures.push(input); return { closedCount: 1 } },
    appendAudit: async () => {},
  }
  await createApi().handlePortalDecision(repository, {
    orgId: 'best-clean', uid: 'office-uid', body: { proposalId: 'p-1', action: 'CORRECT', officialStopAt: correctedAt, clientActionId: 'decision-2' },
  })
  assert.equal(corrections[0].officialStopAt, correctedAt)
  assert.equal(eventClosures[0].officialStopAt, correctedAt)

  const rejectedRepository = {
    ...repository,
    updateOfficialWorkdayStop: async () => { throw new Error('REJECT nie może zamykać Workday.') },
    closeOpenEventsForWorkday: async () => { throw new Error('REJECT nie może zamykać aktywności.') },
  }
  await createApi().handlePortalDecision(rejectedRepository, {
    orgId: 'best-clean', uid: 'office-uid', body: { proposalId: 'p-1', action: 'REJECT', decisionNote: 'Nie potwierdzono czasu.', clientActionId: 'decision-3' },
  })
})

test('druga r?wnoleg?a decyzja nie mo?e zapisa? drugiego STOP', async () => {
  const state = { proposal: pendingProposal(), endAt: null, writes: 0, eventClosures: 0 }
  const repository = {
    hasApproverPermission: async () => true,
    lockProposalWithWorkday: async () => ({ ...state.proposal, workday_end_at: state.endAt }),
    findDecisionAudit: async () => null,
    updateProposalDecision: async (input) => {
      if (state.proposal.status !== 'PENDING') return null
      state.proposal = { ...state.proposal, ...input }
      return state.proposal
    },
    updateOfficialWorkdayStop: async (input) => {
      if (state.endAt) return null
      state.endAt = input.officialStopAt
      state.writes += 1
      return { end_at: state.endAt }
    },
    closeOpenEventsForWorkday: async () => { state.eventClosures += 1; return { closedCount: 1 } },
    appendAudit: async () => {},
  }
  const api = createApi()
  await api.handlePortalDecision(repository, {
    orgId: 'best-clean', uid: 'office-uid', body: { proposalId: 'p-1', action: 'APPROVE', clientActionId: 'first' },
  })
  await assert.rejects(
    () => api.handlePortalDecision(repository, {
      orgId: 'best-clean', uid: 'other-office-uid', body: { proposalId: 'p-1', action: 'APPROVE', clientActionId: 'second' },
    }),
    (error) => error instanceof WorkdayStopProposalError && error.code === 'WORKDAY_STOP_PROPOSAL_NOT_PENDING',
  )
  assert.equal(state.writes, 1)
  assert.equal(state.eventClosures, 1)
})

test('ponowienie tej samej decyzji nie domyka ponownie aktywności ani Workday', async () => {
  const repository = {
    hasApproverPermission: async () => true,
    lockProposalWithWorkday: async () => pendingProposal({ status: 'APPROVED' }),
    findDecisionAudit: async () => ({
      action: 'APPROVED',
      actor_uid: 'office-uid',
      official_stop_at: PROPOSED_STOP,
      note: null,
    }),
    closeOpenEventsForWorkday: async () => { throw new Error('Retry nie może ponawiać zapisu Event.') },
    updateProposalDecision: async () => { throw new Error('Retry nie może ponawiać decyzji.') },
    updateOfficialWorkdayStop: async () => { throw new Error('Retry nie może ponawiać zapisu Workday.') },
    appendAudit: async () => { throw new Error('Retry nie może ponawiać audytu.') },
  }

  const result = await createApi().handlePortalDecision(repository, {
    orgId: 'best-clean', uid: 'office-uid',
    body: { proposalId: 'p-1', action: 'APPROVE', clientActionId: 'decision-retry' },
  })

  assert.equal(result.idempotent, true)
  assert.equal(result.proposal.status, 'APPROVED')
})

test('ten sam decision clientActionId z inną decyzją zwraca konflikt przed kaskadą', async () => {
  const repository = {
    hasApproverPermission: async () => true,
    lockProposalWithWorkday: async () => pendingProposal({ status: 'APPROVED' }),
    findDecisionAudit: async () => ({
      action: 'APPROVED',
      actor_uid: 'office-uid',
      official_stop_at: PROPOSED_STOP,
      note: null,
    }),
    closeOpenEventsForWorkday: async () => { throw new Error('Konflikt nie może uruchomić zapisu Event.') },
    updateProposalDecision: async () => { throw new Error('Konflikt nie może zmienić decyzji.') },
    updateOfficialWorkdayStop: async () => { throw new Error('Konflikt nie może zmienić Workday.') },
    appendAudit: async () => { throw new Error('Konflikt nie może dopisać audytu.') },
  }

  await assert.rejects(
    createApi().handlePortalDecision(repository, {
      orgId: 'best-clean', uid: 'office-uid',
      body: {
        proposalId: 'p-1', action: 'CORRECT', officialStopAt: '2026-08-11T14:15:00.000Z',
        clientActionId: 'decision-retry',
      },
    }),
    (error) =>
      error instanceof WorkdayStopProposalError &&
      error.statusCode === 409 &&
      error.code === 'WORKDAY_STOP_PROPOSAL_DECISION_IDEMPOTENCY_CONFLICT',
  )
})

test('ten sam decision clientActionId ze zmienioną notatką zwraca konflikt przed kaskadą', async () => {
  const repository = {
    hasApproverPermission: async () => true,
    lockProposalWithWorkday: async () => pendingProposal({ status: 'APPROVED' }),
    findDecisionAudit: async () => ({
      action: 'APPROVED',
      actor_uid: 'office-uid',
      official_stop_at: PROPOSED_STOP,
      note: 'pierwsza notatka',
    }),
    closeOpenEventsForWorkday: async () => { throw new Error('Konflikt nie może uruchomić zapisu Event.') },
    updateProposalDecision: async () => { throw new Error('Konflikt nie może zmienić decyzji.') },
    updateOfficialWorkdayStop: async () => { throw new Error('Konflikt nie może zmienić Workday.') },
    appendAudit: async () => { throw new Error('Konflikt nie może dopisać audytu.') },
  }

  await assert.rejects(
    createApi().handlePortalDecision(repository, {
      orgId: 'best-clean', uid: 'office-uid',
      body: {
        proposalId: 'p-1', action: 'APPROVE', decisionNote: 'zmieniona notatka',
        clientActionId: 'decision-retry',
      },
    }),
    (error) =>
      error instanceof WorkdayStopProposalError &&
      error.statusCode === 409 &&
      error.code === 'WORKDAY_STOP_PROPOSAL_DECISION_IDEMPOTENCY_CONFLICT',
  )
})

test('SUPERSEDED nie domyka aktywności, gdy Workday ma już oficjalny STOP', async () => {
  const repository = {
    hasApproverPermission: async () => true,
    lockProposalWithWorkday: async () => pendingProposal({ workday_end_at: PROPOSED_STOP }),
    findDecisionAudit: async () => null,
    closeOpenEventsForWorkday: async () => { throw new Error('SUPERSEDED nie może zamykać aktywności.') },
    updateProposalDecision: async (input) => ({ ...pendingProposal(), ...input }),
    appendAudit: async () => {},
  }

  const result = await createApi().handlePortalDecision(repository, {
    orgId: 'best-clean', uid: 'office-uid',
    body: { proposalId: 'p-1', action: 'APPROVE', clientActionId: 'decision-superseded' },
  })

  assert.equal(result.conflict, true)
  assert.equal(result.proposal.status, 'SUPERSEDED')
})

test('błędny czas Eventu wycofuje transakcję przed zapisem decyzji i Workday', async () => {
  const transactionCalls = []
  const sentErrors = []
  const client = {
    query: async (sql) => { transactionCalls.push(String(sql).toLowerCase()); return { rows: [] } },
    release: () => {},
  }
  const api = createApi({
    connectDbClient: async () => client,
    getRequesterMembership: async () => ({ status: 'ACTIVE', role: 'COORDINATOR' }),
    readJsonBody: async () => ({ proposalId: 'p-1', action: 'APPROVE', clientActionId: 'decision-invalid-event' }),
    verifyFirebaseIdToken: async () => ({ uid: 'office-uid' }),
    createRepository: () => ({
      schemaReady: async () => true,
      lockProposalWithWorkday: async () => pendingProposal(),
      findDecisionAudit: async () => null,
      closeOpenEventsForWorkday: async () => {
        throw new WorkdayStopProposalError(409, 'WORKDAY_STOP_PROPOSAL_EVENT_TIME_CONFLICT', 'Nieprawidłowa kolejność czasu.')
      },
      updateProposalDecision: async () => { throw new Error('Decyzja nie może zostać zapisana.') },
      updateOfficialWorkdayStop: async () => { throw new Error('Workday nie może zostać zapisany.') },
      appendAudit: async () => { throw new Error('Audyt nie może zostać zapisany.') },
    }),
    sendApiError: (_res, status, code) => sentErrors.push({ status, code }),
  })

  await api.handlePortal(
    { method: 'POST', headers: {} },
    {},
    new URL('https://portal.cleanzi.pl/api/portal/workday-stop-proposals?orgId=best-clean'),
  )

  assert.deepEqual(sentErrors, [{ status: 409, code: 'WORKDAY_STOP_PROPOSAL_EVENT_TIME_CONFLICT' }])
  assert.equal(transactionCalls.includes('begin'), true)
  assert.equal(transactionCalls.includes('rollback'), true)
  assert.equal(transactionCalls.includes('commit'), false)
})

test('konflikt zapisu Workday wycofuje transakcję po domknięciu aktywności', async () => {
  const transactionCalls = []
  const sentErrors = []
  const client = {
    query: async (sql) => { transactionCalls.push(String(sql).toLowerCase()); return { rows: [] } },
    release: () => {},
  }
  const api = createApi({
    connectDbClient: async () => client,
    getRequesterMembership: async () => ({ status: 'ACTIVE', role: 'COORDINATOR' }),
    readJsonBody: async () => ({ proposalId: 'p-1', action: 'APPROVE', clientActionId: 'decision-conflict' }),
    verifyFirebaseIdToken: async () => ({ uid: 'office-uid' }),
    createRepository: () => ({
      schemaReady: async () => true,
      lockProposalWithWorkday: async () => pendingProposal(),
      findDecisionAudit: async () => null,
      closeOpenEventsForWorkday: async () => ({ closedCount: 1 }),
      updateProposalDecision: async (input) => ({ ...pendingProposal(), ...input }),
      updateOfficialWorkdayStop: async () => null,
      appendAudit: async () => { throw new Error('Audyt nie powinien zostać zapisany.') },
    }),
    sendApiError: (_res, status, code) => sentErrors.push({ status, code }),
  })

  await api.handlePortal(
    { method: 'POST', headers: {} },
    {},
    new URL('https://portal.cleanzi.pl/api/portal/workday-stop-proposals?orgId=best-clean'),
  )

  assert.deepEqual(sentErrors, [{ status: 409, code: 'WORKDAY_ALREADY_STOPPED' }])
  assert.equal(transactionCalls.includes('begin'), true)
  assert.equal(transactionCalls.includes('rollback'), true)
  assert.equal(transactionCalls.includes('commit'), false)
})

test('ponowienie mutacji pracownika zwraca istniej?cy PENDING, a QR STOP blokuje nowy', async () => {
  const api = createApi()
  let workdayLocks = 0
  const existing = {
    proposal_id: 'p-existing', workday_id: 'wd-1', proposed_stop_at: PROPOSED_STOP,
    proposed_stop_local: '2026-08-11T16:00', time_zone: 'Europe/Warsaw', employee_note: null,
    client_action_id: 'retry-1', status: 'PENDING',
  }
  const repository = {
    lockWorkday: async () => { workdayLocks += 1; return { worker_login: 'worker@example.com', start_at: START, end_at: null } },
    findProposalByClientAction: async () => existing,
  }
  const result = await api.submitMobileProposal(repository, {
    orgId: 'best-clean', worker: { login: 'worker@example.com', workerId: 'W-1' }, uid: 'worker-uid',
    body: { workdayId: 'wd-1', proposedStopLocal: '2026-08-11T16:00', timeZone: 'Europe/Warsaw', clientActionId: 'retry-1' },
  })
  assert.equal(result.idempotent, true)
  assert.equal(result.proposal.proposalId, 'p-existing')
  assert.equal(result.proposal.proposedStopLocal, '2026-08-11T16:00')
  assert.equal(workdayLocks, 0)

  await assert.rejects(
    () => api.submitMobileProposal({
      findProposalByClientAction: async () => null,
      lockWorkday: async () => ({ worker_login: 'worker@example.com', start_at: START, end_at: PROPOSED_STOP }),
    }, {
      orgId: 'best-clean', worker: { login: 'worker@example.com', workerId: 'W-1' }, uid: 'worker-uid',
      body: { workdayId: 'wd-1', proposedStopLocal: '2026-08-11T16:00', timeZone: 'Europe/Warsaw', clientActionId: 'retry-2' },
    }),
    (error) => error instanceof WorkdayStopProposalError && error.code === 'WORKDAY_ALREADY_STOPPED',
  )
})

test('HTTP replay SUBMIT po zatwierdzeniu zwraca trwały receipt bez ponownej blokady Workday', async () => {
  const transactionCalls = []
  const sent = []
  let workdayLocks = 0
  const approved = pendingProposal({
    status: 'APPROVED',
    workday_end_at: PROPOSED_STOP,
    official_stop_at: PROPOSED_STOP,
    reviewed_at: '2026-08-12T08:00:00.000Z',
  })
  const client = {
    query: async (sql) => { transactionCalls.push(String(sql).toLowerCase()) },
    release: () => {},
  }
  const api = createApi({
    connectDbClient: async () => client,
    readJsonBody: async () => ({
      operation: 'SUBMIT',
      workdayId: 'wd-1',
      proposedStopLocal: '2026-08-11T16:00',
      timeZone: 'Europe/Warsaw',
      clientActionId: 'submit-action-1',
    }),
    createRepository: () => ({
      schemaReady: async () => true,
      findProposalByClientAction: async () => approved,
      lockWorkday: async () => { workdayLocks += 1; return null },
    }),
    sendMobileJson: (_res, status, body) => sent.push({ status, body }),
  })

  await api.handleMobile({ method: 'POST', headers: {} }, {}, { pathname: '/api/mobile/workday-stop-proposals' })

  assert.equal(workdayLocks, 0)
  assert.deepEqual(transactionCalls, ['begin', 'commit'])
  assert.equal(sent[0].status, 200)
  assert.equal(sent[0].body.operation, 'SUBMIT')
  assert.equal(sent[0].body.idempotent, true)
  assert.deepEqual(sent[0].body.receipt, {
    operation: 'SUBMIT', proposalId: 'p-1', workdayId: 'wd-1',
    clientActionId: 'submit-action-1', status: 'APPROVED', idempotent: true,
  })
})

test('ten sam clientActionId z innym payloadem zwraca konflikt zamiast cichego replay', async () => {
  let workdayLocks = 0
  const existing = {
    proposal_id: 'p-existing', workday_id: 'wd-1', proposed_stop_at: PROPOSED_STOP,
    proposed_stop_local: '2026-08-11T16:00', time_zone: 'Europe/Warsaw', employee_note: 'Pierwsza treść',
    client_action_id: 'retry-conflict', status: 'PENDING',
  }
  await assert.rejects(
    () => createApi().submitMobileProposal({
      findProposalByClientAction: async () => existing,
      lockWorkday: async () => { workdayLocks += 1; return null },
    }, {
      orgId: 'best-clean', worker: { login: 'worker@example.com', workerId: 'W-1' }, uid: 'worker-uid',
      body: {
        workdayId: 'wd-1', proposedStopLocal: '2026-08-11T16:00', timeZone: 'Europe/Warsaw',
        employeeNote: 'Zmieniona treść', clientActionId: 'retry-conflict',
      },
    }),
    (error) => error instanceof WorkdayStopProposalError && error.code === 'WORKDAY_STOP_PROPOSAL_IDEMPOTENCY_PAYLOAD_CONFLICT',
  )
  assert.equal(workdayLocks, 0)
})

test('ponowne sprawdzenie po blokadzie rozstrzyga równoległy SUBMIT jako idempotentny replay', async () => {
  let reads = 0
  let pendingReads = 0
  const existing = {
    proposal_id: 'p-race', workday_id: 'wd-1', proposed_stop_at: PROPOSED_STOP,
    proposed_stop_local: '2026-08-11T16:00', time_zone: 'Europe/Warsaw', employee_note: null,
    client_action_id: 'race-action', status: 'PENDING',
  }
  const result = await createApi().submitMobileProposal({
    findProposalByClientAction: async () => {
      reads += 1
      return reads === 1 ? null : existing
    },
    lockWorkday: async () => ({ worker_login: 'worker@example.com', start_at: START, end_at: null }),
    findPendingForWorkday: async () => { pendingReads += 1; return null },
  }, {
    orgId: 'best-clean', worker: { login: 'worker@example.com', workerId: 'W-1' }, uid: 'worker-uid',
    body: { workdayId: 'wd-1', proposedStopLocal: '2026-08-11T16:00', timeZone: 'Europe/Warsaw', clientActionId: 'race-action' },
  })
  assert.equal(result.idempotent, true)
  assert.equal(result.proposal.proposalId, 'p-race')
  assert.equal(reads, 2)
  assert.equal(pendingReads, 0)
})

test('wyścig tego samego clientActionId dla innego Workday zwraca konflikt zakresu', async () => {
  const queries = []
  const sent = []
  const client = {
    query: async (sql) => queries.push(sql),
    release: () => {},
  }
  const api = createApi({
    connectDbClient: async () => client,
    readJsonBody: async () => ({
      operation: 'SUBMIT',
      workdayId: 'wd-2',
      proposedStopLocal: '2026-08-11T16:00',
      timeZone: 'Europe/Warsaw',
      clientActionId: 'shared-action',
    }),
    createRepository: () => ({
      schemaReady: async () => true,
      findProposalByClientAction: async () => null,
      lockWorkday: async () => ({ worker_login: 'worker@example.com', start_at: START, end_at: null }),
      findPendingForWorkday: async () => null,
      insertProposal: async () => {
        const error = new Error('unique violation')
        error.code = '23505'
        error.constraint = 'workday_stop_proposal_worker_client_action_uidx'
        throw error
      },
    }),
    sendMobileApiError: (_res, status, code) => sent.push({ status, code }),
  })

  await api.handleMobile({ method: 'POST', headers: {} }, {}, { pathname: '/api/mobile/workday-stop-proposals' })

  assert.deepEqual(sent, [{ status: 409, code: 'WORKDAY_STOP_PROPOSAL_IDEMPOTENCY_SCOPE_CONFLICT' }])
  assert.equal(queries.includes('begin'), true)
  assert.equal(queries.includes('rollback'), true)
  assert.equal(queries.includes('commit'), false)
})

test('nowa propozycja zapisuje local time, clientActionId i nie aktualizuje Workday', async () => {
  const writes = []
  const repository = {
    lockWorkday: async () => ({ worker_login: 'worker@example.com', start_at: START, end_at: null }),
    findProposalByClientAction: async () => null,
    findPendingForWorkday: async () => null,
    insertProposal: async (input) => {
      writes.push(['proposal', input])
      return {
        proposal_id: input.proposalId, org_id: input.orgId, worker_id: input.workerId, workday_id: input.workdayId,
        proposed_stop_at: input.proposedStopAt, proposed_stop_local: input.proposedStopLocal, time_zone: input.timeZone,
        employee_note: input.employeeNote, status: 'PENDING', submitted_at: '2026-08-13T16:01:00.000Z',
        submitted_by: input.submittedBy, client_action_id: input.clientActionId,
      }
    },
    appendAudit: async (input) => writes.push(['audit', input]),
  }
  const result = await createApi().submitMobileProposal(repository, {
    orgId: 'best-clean', worker: { login: 'worker@example.com', workerId: 'W-1' }, uid: 'worker-uid',
    body: {
      workdayId: 'wd-1', proposedStopLocal: '2026-08-11T16:00', timeZone: 'Europe/Warsaw',
      employeeNote: '', clientActionId: 'WSP-uuid',
    },
  })
  assert.equal(result.proposal.proposalId, 'wdsp_deterministic')
  assert.equal(result.proposal.proposedStopAt, PROPOSED_STOP)
  assert.equal(result.proposal.proposedStopLocal, '2026-08-11T16:00')
  assert.equal(result.proposal.clientActionId, 'WSP-uuid')
  assert.equal(result.proposal.officialStopAt, '')
  assert.deepEqual(writes.map(([kind]) => kind), ['proposal', 'audit'])
})

test('endpoint mobilny bierze organizacj? z resolvera tokenu, a orgId body tylko por?wnuje', async () => {
  const calls = []
  const sent = []
  const client = { query: async (sql) => calls.push(['transaction', sql]), release: () => {} }
  const repository = {
    schemaReady: async () => true,
    lockWorkday: async ({ orgId }) => {
      calls.push(['workdayScope', orgId])
      return { worker_login: 'worker@example.com', start_at: START, end_at: null }
    },
    findProposalByClientAction: async () => null,
    findPendingForWorkday: async () => null,
    insertProposal: async (input) => ({
      proposal_id: input.proposalId, org_id: input.orgId, worker_id: input.workerId, workday_id: input.workdayId,
      proposed_stop_at: input.proposedStopAt, proposed_stop_local: input.proposedStopLocal, time_zone: input.timeZone,
      status: 'PENDING', submitted_at: PROPOSED_STOP, submitted_by: input.submittedBy, client_action_id: input.clientActionId,
    }),
    appendAudit: async () => {},
  }
  const api = createApi({
    connectDbClient: async () => client,
    readJsonBody: async () => ({
      operation: 'SUBMIT', orgId: 'body-org-that-is-not-trusted', workdayId: 'wd-1', proposedStopLocal: '2026-08-11T16:00',
      timeZone: 'Europe/Warsaw', clientActionId: 'WSP-token-scope', workerLogin: 'other-worker@example.com',
    }),
    resolveMobileOrganization: async (_client, decoded, bodyOrgId) => {
      calls.push(['tokenScope', decoded.uid, bodyOrgId])
      return { orgId: 'token-org', membership: { worker_id: 'W-1' } }
    },
    resolveMobileWorker: async (_client, orgId) => {
      calls.push(['workerScope', orgId])
      return { login: 'worker@example.com', workerId: 'W-1' }
    },
    createRepository: () => repository,
    sendMobileJson: (_res, status, body) => sent.push([status, body]),
  })
  await api.handleMobile({ method: 'POST', headers: {} }, {}, { pathname: '/api/mobile/workday-stop-proposals' })
  assert.deepEqual(calls.find(([kind]) => kind === 'tokenScope'), ['tokenScope', 'worker-uid', 'body-org-that-is-not-trusted'])
  assert.deepEqual(calls.find(([kind]) => kind === 'workerScope'), ['workerScope', 'token-org'])
  assert.deepEqual(calls.find(([kind]) => kind === 'workdayScope'), ['workdayScope', 'token-org'])
  assert.equal(sent[0][0], 200)
  assert.equal(sent[0][1].proposal.proposalId, 'wdsp_deterministic')
  assert.equal(sent[0][1].proposal.status, 'PENDING')
  assert.equal(sent[0][1].proposal.organizationId, undefined)
  assert.equal(sent[0][1].proposal.workdayId, 'wd-1')
  assert.equal(sent[0][1].proposal.clientActionId, 'WSP-token-scope')
  assert.equal(sent[0][1].operation, 'SUBMIT')
  assert.equal(sent[0][1].idempotent, false)
  assert.deepEqual(sent[0][1].receipt, {
    operation: 'SUBMIT', proposalId: 'wdsp_deterministic', workdayId: 'wd-1',
    clientActionId: 'WSP-token-scope', status: 'PENDING', idempotent: false,
  })
})

test('odczyt STATUS jest tokenowo zawężony, nie otwiera transakcji i zwraca PENDING', async () => {
  const calls = []
  const sent = []
  const client = {
    query: async (sql) => calls.push(sql),
    release: () => calls.push('release'),
  }
  const api = createApi({
    connectDbClient: async () => client,
    readJsonBody: async () => ({
      operation: 'STATUS',
      orgId: 'niezaufany-org',
      workerLogin: 'niezaufany-pracownik@example.com',
      workdayId: 'wd-attempted-write',
      proposedStopLocal: '2026-08-11T16:00',
      clientActionId: 'must-not-write',
      workdayIds: ['wd-1', 'wd-1', 'wd-2'],
    }),
    resolveMobileOrganization: async (_client, decoded, bodyOrgId) => {
      calls.push(['org', decoded.uid, bodyOrgId])
      return { orgId: 'token-org', membership: { worker_id: 'W-1' } }
    },
    resolveMobileWorker: async (_client, orgId, body) => {
      calls.push(['worker', orgId, body])
      return { login: 'worker@example.com', workerId: 'W-1' }
    },
    createRepository: () => ({
      schemaReady: async () => true,
      listForMobileWorkerWorkdays: async (input) => {
        calls.push(['statuses', input])
        return [pendingProposal({ org_id: 'token-org', workday_id: 'wd-1' })]
      },
      lockWorkday: async () => { throw new Error('STATUS must not lock Workday.') },
      insertProposal: async () => { throw new Error('STATUS must not insert a proposal.') },
    }),
    sendMobileJson: (_res, status, body) => sent.push({ status, body }),
  })

  await api.handleMobile({ method: 'POST', headers: {} }, {}, { pathname: '/api/mobile/workday-stop-proposals' })

  assert.deepEqual(calls.find((item) => Array.isArray(item) && item[0] === 'org'), ['org', 'worker-uid', ''])
  assert.deepEqual(calls.find((item) => Array.isArray(item) && item[0] === 'worker'), ['worker', 'token-org', {}])
  assert.deepEqual(calls.find((item) => Array.isArray(item) && item[0] === 'statuses'), [
    'statuses',
    { orgId: 'token-org', workerId: 'W-1', workerLogin: 'worker@example.com', workdayIds: ['wd-1', 'wd-2'] },
  ])
  assert.equal(calls.includes('begin'), false)
  assert.equal(calls.includes('rollback'), false)
  assert.equal(sent[0].status, 200)
  assert.equal(sent[0].body.operation, 'STATUS')
  assert.deepEqual(sent[0].body.proposals.map((proposal) => proposal.workdayId), ['wd-1'])
  assert.equal(sent[0].body.proposals[0].status, 'PENDING')
})

test('odczyt STATUS z poprawną pustą listą wyników potwierdza brak propozycji', async () => {
  const calls = []
  const sent = []
  const api = createApi({
    readJsonBody: async () => ({ operation: 'STATUS', workdayIds: ['wd-without-proposal'] }),
    createRepository: () => ({
      schemaReady: async () => true,
      listForMobileWorkerWorkdays: async (input) => { calls.push(input); return [] },
    }),
    sendMobileJson: (_res, status, body) => sent.push({ status, body }),
  })

  await api.handleMobile({ method: 'POST', headers: {} }, {}, { pathname: '/api/mobile/workday-stop-proposals' })

  assert.deepEqual(calls, [{
    orgId: 'best-clean',
    workerId: 'W-1',
    workerLogin: 'worker@example.com',
    workdayIds: ['wd-without-proposal'],
  }])
  assert.deepEqual(sent, [{ status: 200, body: { ok: true, operation: 'STATUS', proposals: [] } }])
})

test('odczyt STATUS zwraca APPROVED wraz z kanonicznym officialStopAt', async () => {
  const sent = []
  const api = createApi({
    readJsonBody: async () => ({ operation: 'STATUS', workdayIds: ['wd-approved'] }),
    createRepository: () => ({
      schemaReady: async () => true,
      listForMobileWorkerWorkdays: async () => [pendingProposal({
        workday_id: 'wd-approved',
        status: 'APPROVED',
        proposed_stop_at: '2026-08-03T17:00:00.000Z',
        proposed_stop_local: '2026-08-03T19:00',
        official_stop_at: '2026-08-03T17:00:00.000Z',
        reviewed_at: '2026-08-25T11:00:00.000Z',
        decision_note: 'Godzina zatwierdzona przez koordynatora.',
      })],
    }),
    sendMobileJson: (_res, status, body) => sent.push({ status, body }),
  })

  await api.handleMobile({ method: 'POST', headers: {} }, {}, { pathname: '/api/mobile/workday-stop-proposals' })

  assert.equal(sent[0].status, 200)
  assert.deepEqual(sent[0].body.proposals, [
    {
      proposalId: 'p-1',
      workdayId: 'wd-approved',
      clientActionId: 'submit-action-1',
      status: 'APPROVED',
      proposedStopAt: '2026-08-03T17:00:00.000Z',
      proposedStopLocal: '2026-08-03T19:00',
      timeZone: 'Europe/Warsaw',
      employeeNote: '',
      decisionNote: 'Godzina zatwierdzona przez koordynatora.',
      officialStopAt: '2026-08-03T17:00:00.000Z',
      submittedAt: '',
      reviewedAt: '2026-08-25T11:00:00.000Z',
    },
  ])
})

test('odczyt STATUS zwraca CORRECTED wraz z officialStopAt, reviewedAt i decisionNote', async () => {
  const sent = []
  const api = createApi({
    readJsonBody: async () => ({ operation: 'STATUS', workdayIds: ['wd-corrected'] }),
    createRepository: () => ({
      schemaReady: async () => true,
      listForMobileWorkerWorkdays: async () => [pendingProposal({
        workday_id: 'wd-corrected',
        status: 'CORRECTED',
        proposed_stop_at: '2026-08-03T17:00:00.000Z',
        proposed_stop_local: '2026-08-03T19:00',
        official_stop_at: '2026-08-03T17:15:00.000Z',
        reviewed_at: '2026-08-25T11:05:00.000Z',
        decision_note: 'Godzina skorygowana przez koordynatora.',
      })],
    }),
    sendMobileJson: (_res, status, body) => sent.push({ status, body }),
  })

  await api.handleMobile({ method: 'POST', headers: {} }, {}, { pathname: '/api/mobile/workday-stop-proposals' })

  assert.equal(sent[0].status, 200)
  assert.deepEqual(sent[0].body.proposals[0], {
    proposalId: 'p-1',
    workdayId: 'wd-corrected',
    clientActionId: 'submit-action-1',
    status: 'CORRECTED',
    proposedStopAt: '2026-08-03T17:00:00.000Z',
    proposedStopLocal: '2026-08-03T19:00',
    timeZone: 'Europe/Warsaw',
    employeeNote: '',
    decisionNote: 'Godzina skorygowana przez koordynatora.',
    officialStopAt: '2026-08-03T17:15:00.000Z',
    submittedAt: '',
    reviewedAt: '2026-08-25T11:05:00.000Z',
  })
})

test('nieprawidłowy STATUS odrzuca błędne lub ponad-120 ID przed połączeniem, schema i odczytem', async () => {
  for (const [workdayIds, expectedCode] of [
    ['wd-1', 'WORKDAY_STOP_PROPOSAL_STATUS_IDS_REQUIRED'],
    [Array.from({ length: 121 }, () => 'wd-1'), 'WORKDAY_STOP_PROPOSAL_STATUS_IDS_INVALID'],
  ]) {
    const sent = []
    let connections = 0
    let schemaChecks = 0
    let statusReads = 0
    const api = createApi({
      readJsonBody: async () => ({ operation: 'STATUS', workdayIds }),
      connectDbClient: async () => {
        connections += 1
        return { query: async () => {}, release: () => {} }
      },
      createRepository: () => ({
        schemaReady: async () => { schemaChecks += 1; return true },
        listForMobileWorkerWorkdays: async () => { statusReads += 1; return [] },
      }),
      sendMobileApiError: (_res, status, code) => sent.push({ status, code }),
    })

    await api.handleMobile({ method: 'POST', headers: {} }, {}, { pathname: '/api/mobile/workday-stop-proposals' })

    assert.deepEqual(sent, [{ status: 400, code: expectedCode }])
    assert.equal(connections, 0)
    assert.equal(schemaChecks, 0)
    assert.equal(statusReads, 0)
  }
})

for (const status of ['REJECTED', 'SUPERSEDED']) {
  test(`odczyt STATUS jawnie zwraca ${status} dla klienta fail-closed`, async () => {
    const sent = []
    const workdayId = `wd-${status.toLowerCase()}`
    const api = createApi({
      readJsonBody: async () => ({ operation: 'STATUS', workdayIds: [workdayId] }),
      createRepository: () => ({
        schemaReady: async () => true,
        listForMobileWorkerWorkdays: async () => [pendingProposal({
          workday_id: workdayId,
          status,
          decision_note: status === 'REJECTED'
            ? 'Koordynator odrzucił propozycję.'
            : 'Propozycja została zastąpiona stanem kanonicznym.',
          reviewed_at: '2026-08-25T11:10:00.000Z',
        })],
      }),
      sendMobileJson: (_res, responseStatus, body) => sent.push({ status: responseStatus, body }),
    })

    await api.handleMobile({ method: 'POST', headers: {} }, {}, { pathname: '/api/mobile/workday-stop-proposals' })

    assert.equal(sent[0].status, 200)
    assert.equal(sent[0].body.ok, true)
    assert.equal(sent[0].body.operation, 'STATUS')
    assert.equal(sent[0].body.proposals.length, 1)
    assert.equal(sent[0].body.proposals[0].workdayId, workdayId)
    assert.equal(sent[0].body.proposals[0].clientActionId, 'submit-action-1')
    assert.equal(sent[0].body.proposals[0].status, status)
    assert.equal(sent[0].body.proposals[0].officialStopAt, '')
    assert.equal(sent[0].body.proposals[0].reviewedAt, '2026-08-25T11:10:00.000Z')
  })
}

test('STATUS_ACTION rozstrzyga utraconą odpowiedź po clientActionId bez transakcji', async () => {
  const calls = []
  const sent = []
  const client = { query: async (sql) => calls.push(sql), release: () => calls.push('release') }
  const api = createApi({
    connectDbClient: async () => client,
    readJsonBody: async () => ({ operation: 'STATUS_ACTION', clientActionId: 'submit-action-1', orgId: 'ignored' }),
    resolveMobileOrganization: async (_client, _decoded, bodyOrgId) => {
      calls.push(['orgBody', bodyOrgId])
      return { orgId: 'token-org', membership: { worker_id: 'W-1' } }
    },
    resolveMobileWorker: async (_client, _orgId, body) => {
      calls.push(['workerBody', body])
      return { login: 'worker@example.com', workerId: 'W-1' }
    },
    createRepository: () => ({
      schemaReady: async () => true,
      findProposalByClientAction: async (input) => {
        calls.push(['actionStatus', input])
        return pendingProposal({ org_id: 'token-org' })
      },
      lockWorkday: async () => { throw new Error('STATUS_ACTION must not lock Workday.') },
      insertProposal: async () => { throw new Error('STATUS_ACTION must not write.') },
    }),
    sendMobileJson: (_res, status, body) => sent.push({ status, body }),
  })

  await api.handleMobile({ method: 'POST', headers: {} }, {}, { pathname: '/api/mobile/workday-stop-proposals' })

  assert.deepEqual(calls.find((item) => Array.isArray(item) && item[0] === 'orgBody'), ['orgBody', ''])
  assert.deepEqual(calls.find((item) => Array.isArray(item) && item[0] === 'workerBody'), ['workerBody', {}])
  assert.deepEqual(calls.find((item) => Array.isArray(item) && item[0] === 'actionStatus'), [
    'actionStatus', { orgId: 'token-org', workerId: 'W-1', clientActionId: 'submit-action-1' },
  ])
  assert.equal(calls.includes('begin'), false)
  assert.equal(sent[0].status, 200)
  assert.equal(sent[0].body.found, true)
  assert.equal(sent[0].body.idempotent, true)
  assert.equal(sent[0].body.proposal.workdayId, 'wd-1')
  assert.equal(sent[0].body.proposal.clientActionId, 'submit-action-1')
  assert.deepEqual(sent[0].body.receipt, {
    operation: 'SUBMIT', proposalId: 'p-1', workdayId: 'wd-1', clientActionId: 'submit-action-1',
    status: 'PENDING', idempotent: true,
  })
})

test('STATUS_ACTION zwraca jednoznaczne found=false, gdy zapis nie istnieje', async () => {
  const sent = []
  const api = createApi({
    readJsonBody: async () => ({ operation: 'STATUS_ACTION', clientActionId: 'missing-action' }),
    createRepository: () => ({ schemaReady: async () => true, findProposalByClientAction: async () => null }),
    sendMobileJson: (_res, status, body) => sent.push({ status, body }),
  })
  await api.handleMobile({ method: 'POST', headers: {} }, {}, { pathname: '/api/mobile/workday-stop-proposals' })
  assert.deepEqual(sent[0], {
    status: 200,
    body: {
      ok: true, operation: 'STATUS_ACTION', found: false, idempotent: false, receipt: null, proposal: null,
    },
  })
})

test('nieznana operacja mobilna jest odrzucana przed połączeniem z bazą', async () => {
  let connections = 0
  const sent = []
  const api = createApi({
    readJsonBody: async () => ({ operation: 'DELETE_ALL' }),
    connectDbClient: async () => { connections += 1; return { release: () => {} } },
    sendMobileApiError: (_res, status, code) => sent.push({ status, code }),
  })
  await api.handleMobile({ method: 'POST', headers: {} }, {}, { pathname: '/api/mobile/workday-stop-proposals' })
  assert.deepEqual(sent, [{ status: 400, code: 'WORKDAY_STOP_PROPOSAL_OPERATION_INVALID' }])
  assert.equal(connections, 0)
})

test('STATUS repository requires canonical worker ID even when the login text matches', async () => {
  const calls = []
  const repository = createWorkdayStopProposalRepository({
    query: async (sql, params) => {
      calls.push({ sql, params })
      return { rows: params[1] === 'W-1' ? [pendingProposal()] : [] }
    },
  })

  const ownerRows = await repository.listForMobileWorkerWorkdays({
    orgId: 'best-clean', workerId: 'W-1', workerLogin: 'worker@example.com', workdayIds: ['wd-1'],
  })
  const otherWorkerRows = await repository.listForMobileWorkerWorkdays({
    orgId: 'best-clean', workerId: 'W-2', workerLogin: 'worker@example.com', workdayIds: ['wd-1'],
  })

  assert.equal(ownerRows.length, 1)
  assert.equal(otherWorkerRows.length, 0)
  assert.match(calls[0].sql, /p\.worker_id = \$2::text/)
  assert.deepEqual(calls[1].params, ['best-clean', 'W-2', 'worker@example.com', ['wd-1']])
})

test('schemaReady wymaga dokładnego unikalnego indeksu Receipt V2', async () => {
  const calls = []
  const rows = [
    {
      proposals_ready: true,
      audit_ready: true,
      permission_ready: true,
      receipt_action_unique_ready: false,
    },
    {
      proposals_ready: true,
      audit_ready: true,
      permission_ready: true,
      receipt_action_unique_ready: true,
    },
  ]
  const repository = createWorkdayStopProposalRepository({
    query: async (sql) => {
      calls.push(sql)
      return { rows: [rows.shift()] }
    },
  })

  assert.equal(await repository.schemaReady(), false)
  assert.equal(await repository.schemaReady(), true)
  assert.match(calls[0], /workday_stop_proposal_worker_client_action_uidx/)
  assert.match(calls[0], /i\.indisunique/)
  assert.match(calls[0], /i\.indisvalid/)
  assert.match(calls[0], /array\['org_id', 'worker_id', 'client_action_id'\]::name\[\]/)
})

test('brak tokenu zwraca 401 przed odczytem body, po??czeniem z baz? lub zapisem propozycji', async () => {
  const sent = []
  let bodyReads = 0
  let databaseConnections = 0
  let repositoryCreations = 0
  const api = createApi({
    parseBearerToken: () => '',
    readJsonBody: async () => {
      bodyReads += 1
      return {}
    },
    connectDbClient: async () => {
      databaseConnections += 1
      return { query: async () => {}, release: () => {} }
    },
    createRepository: () => {
      repositoryCreations += 1
      return {}
    },
    sendMobileApiError: (_res, status, code, message) => sent.push({ status, code, message }),
  })

  await api.handleMobile(
    { method: 'POST', headers: {} },
    {},
    { pathname: '/api/mobile/workday-stop-proposals' },
  )

  assert.deepEqual(sent, [{ status: 401, code: 'UNAUTHENTICATED', message: 'Brak tokenu Firebase.' }])
  assert.equal(bodyReads, 0)
  assert.equal(databaseConnections, 0)
  assert.equal(repositoryCreations, 0)
})

test('filtr daty portalu odrzuca niemo?liw? dat? zamiast normalizowa? j? po cichu', () => {
  assert.throws(
    () => dateFilter('2026-02-31', 'from'),
    (error) => error instanceof WorkdayStopProposalError && error.code === 'WORKDAY_STOP_PROPOSAL_DATE_INVALID',
  )
})
