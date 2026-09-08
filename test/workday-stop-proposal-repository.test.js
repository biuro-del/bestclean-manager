'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  WORKDAY_STOP_PROPOSAL_EVENT_END_REASON,
  createWorkdayStopProposalRepository,
} = require('../workday-stop-proposal-repository')
const { WorkdayStopProposalError } = require('../workday-stop-proposal-policy')

const ORG_ID = 'best-clean'
const WORKDAY_ID = 'WD-2026-09-02'
const OFFICIAL_STOP_AT = '2026-09-02T17:00:00.000Z'

function event(overrides = {}) {
  return {
    org_id: ORG_ID,
    workday_id: WORKDAY_ID,
    event_id: 'EV-OPEN-1',
    start_at: '2026-09-02T15:00:00.000Z',
    end_at: null,
    duration_sec: null,
    status: 'RUNNING',
    close_marked_at: null,
    end_reason: null,
    zone_id: 'BC-001',
    comment: 'existing comment',
    ...overrides,
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

class FakeClient {
  constructor(events = [], { updateLimit = Number.POSITIVE_INFINITY } = {}) {
    this.events = events.map((row) => clone(row))
    this.calls = []
    this.updateLimit = updateLimit
  }

  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase()
    this.calls.push({ sql: normalized, params: clone(params) })

    if (normalized.startsWith('select ') && normalized.includes(' from public.event')) {
      const rows = this.events.filter((row) => row.org_id === params[0] && row.workday_id === params[1])
      return { rows: rows.map((row) => clone(row)), rowCount: rows.length }
    }

    if (normalized.startsWith('update public.event')) {
      const [orgId, workdayId, officialStopAt, endReason, eventIds] = params
      const allowedIds = new Set(eventIds)
      const updated = []

      for (const row of this.events) {
        if (updated.length >= this.updateLimit) break
        if (row.org_id !== orgId || row.workday_id !== workdayId || row.end_at !== null) continue
        if (!allowedIds.has(row.event_id)) continue
        row.end_at = officialStopAt
        row.duration_sec = Math.floor((new Date(officialStopAt).getTime() - new Date(row.start_at).getTime()) / 1000)
        row.status = 'CLOSED'
        row.close_marked_at = officialStopAt
        row.end_reason = endReason
        updated.push(clone(row))
      }
      return { rows: updated, rowCount: updated.length }
    }

    throw new Error(`Unexpected query: ${normalized}`)
  }

  updateCalls() {
    return this.calls.filter((call) => call.sql.startsWith('update public.event'))
  }
}

test('domyka wszystkie Eventy z end_at null tylko w zadanym org i Workday', async () => {
  const closedTarget = event({
    event_id: 'EV-CLOSED',
    start_at: '2026-09-02T15:30:00.000Z',
    end_at: '2026-09-02T16:00:00.000Z',
    duration_sec: 1800,
    status: 'CLOSED',
    close_marked_at: '2026-09-02T16:00:00.000Z',
    end_reason: 'QR_SAME',
  })
  const otherWorkday = event({ event_id: 'EV-OTHER-WORKDAY', workday_id: 'WD-OTHER' })
  const otherOrg = event({ event_id: 'EV-OTHER-ORG', org_id: 'other-org' })
  const sourceEvents = [
    event(),
    event({
      event_id: 'EV-OPEN-STATUS-CLOSED',
      start_at: '2026-09-02T16:30:00.000Z',
      status: 'CLOSED',
    }),
    closedTarget,
    otherWorkday,
    otherOrg,
  ]
  const client = new FakeClient(sourceEvents)
  const repository = createWorkdayStopProposalRepository(client)
  const beforeClosed = clone(closedTarget)
  const beforeOtherWorkday = clone(otherWorkday)
  const beforeOtherOrg = clone(otherOrg)

  const result = await repository.closeOpenEventsForWorkday({
    orgId: ORG_ID,
    workdayId: WORKDAY_ID,
    officialStopAt: OFFICIAL_STOP_AT,
  })

  assert.equal(result.closedCount, 2)
  assert.deepEqual(result.events.map((row) => row.event_id).sort(), ['EV-OPEN-1', 'EV-OPEN-STATUS-CLOSED'])
  assert.deepEqual(
    client.events.filter((row) => ['EV-OPEN-1', 'EV-OPEN-STATUS-CLOSED'].includes(row.event_id)).map((row) => ({
      eventId: row.event_id,
      zoneId: row.zone_id,
      comment: row.comment,
      endAt: row.end_at,
      durationSec: row.duration_sec,
      status: row.status,
      closeMarkedAt: row.close_marked_at,
      endReason: row.end_reason,
    })),
    [
      {
        eventId: 'EV-OPEN-1', zoneId: 'BC-001', comment: 'existing comment',
        endAt: OFFICIAL_STOP_AT, durationSec: 7200, status: 'CLOSED',
        closeMarkedAt: OFFICIAL_STOP_AT, endReason: WORKDAY_STOP_PROPOSAL_EVENT_END_REASON,
      },
      {
        eventId: 'EV-OPEN-STATUS-CLOSED', zoneId: 'BC-001', comment: 'existing comment',
        endAt: OFFICIAL_STOP_AT, durationSec: 1800, status: 'CLOSED',
        closeMarkedAt: OFFICIAL_STOP_AT, endReason: WORKDAY_STOP_PROPOSAL_EVENT_END_REASON,
      },
    ],
  )
  assert.deepEqual(client.events.find((row) => row.event_id === 'EV-CLOSED'), beforeClosed)
  assert.deepEqual(client.events.find((row) => row.event_id === 'EV-OTHER-WORKDAY'), beforeOtherWorkday)
  assert.deepEqual(client.events.find((row) => row.event_id === 'EV-OTHER-ORG'), beforeOtherOrg)
  assert.equal(client.updateCalls().length, 1)
  assert.match(client.calls[0].sql, /where org_id = \$1::text and workday_id = \$2::text/)
  assert.doesNotMatch(client.calls[0].sql, /end_at is null/)
  assert.match(client.calls[0].sql, /for update$/)
  assert.match(client.updateCalls()[0].sql, /event_id = any\(\$5::varchar\[\]\) and end_at is null/)
  assert.deepEqual(client.updateCalls()[0].params.slice(0, 4), [
    ORG_ID,
    WORKDAY_ID,
    OFFICIAL_STOP_AT,
    WORKDAY_STOP_PROPOSAL_EVENT_END_REASON,
  ])
})

test('zwraca zero i nie wykonuje UPDATE, gdy Workday nie ma otwartych Eventów', async () => {
  const closed = event({
    event_id: 'EV-CLOSED',
    end_at: '2026-09-02T16:00:00.000Z',
    duration_sec: 3600,
    status: 'CLOSED',
  })
  const client = new FakeClient([closed])
  const repository = createWorkdayStopProposalRepository(client)

  const result = await repository.closeOpenEventsForWorkday({
    orgId: ORG_ID,
    workdayId: WORKDAY_ID,
    officialStopAt: OFFICIAL_STOP_AT,
  })

  assert.deepEqual(result, { closedCount: 0, events: [] })
  assert.equal(client.updateCalls().length, 0)
  assert.deepEqual(client.events, [closed])
})

for (const [label, startAt] of [
  ['bez start_at', null],
  ['z niepoprawnym start_at', 'invalid-date'],
  ['ze start_at równym official STOP', OFFICIAL_STOP_AT],
  ['ze start_at późniejszym niż official STOP', '2026-09-02T17:00:01.000Z'],
]) {
  test(`odrzuca otwarty Event ${label} kodem 409 bez UPDATE`, async () => {
    const invalid = event({ event_id: `EV-INVALID-${label}`, start_at: startAt })
    const client = new FakeClient([invalid])
    const repository = createWorkdayStopProposalRepository(client)

    await assert.rejects(
      repository.closeOpenEventsForWorkday({
        orgId: ORG_ID,
        workdayId: WORKDAY_ID,
        officialStopAt: OFFICIAL_STOP_AT,
      }),
      (error) =>
        error instanceof WorkdayStopProposalError &&
        error.statusCode === 409 &&
        error.code === 'WORKDAY_STOP_PROPOSAL_EVENT_TIME_CONFLICT' &&
        error.details?.invalidEventCount === 1,
    )
    assert.equal(client.updateCalls().length, 0)
    assert.deepEqual(client.events, [invalid])
  })
}

test('odrzuca cały zapis, gdy zamknięty Event kończy się po official STOP', async () => {
  const validOpen = event({ event_id: 'EV-OPEN-VALID' })
  const closedAfterStop = event({
    event_id: 'EV-CLOSED-AFTER-STOP',
    start_at: '2026-09-02T16:00:00.000Z',
    end_at: '2026-09-02T17:00:01.000Z',
    duration_sec: 3601,
    status: 'CLOSED',
  })
  const initial = [validOpen, closedAfterStop]
  const client = new FakeClient(initial)
  const repository = createWorkdayStopProposalRepository(client)

  await assert.rejects(
    repository.closeOpenEventsForWorkday({
      orgId: ORG_ID,
      workdayId: WORKDAY_ID,
      officialStopAt: OFFICIAL_STOP_AT,
    }),
    (error) => error instanceof WorkdayStopProposalError && error.statusCode === 409,
  )
  assert.equal(client.updateCalls().length, 0)
  assert.deepEqual(client.events, initial)
})

for (const [label, startAt, endAt] of [
  ['zaczyna się dokładnie o official STOP', OFFICIAL_STOP_AT, OFFICIAL_STOP_AT],
  ['zaczyna się po official STOP', '2026-09-02T17:00:01.000Z', '2026-09-02T17:00:02.000Z'],
  ['ma koniec wcześniejszy niż początek', '2026-09-02T16:30:00.000Z', '2026-09-02T16:29:59.000Z'],
]) {
  test(`odrzuca zamknięty Event, który ${label}`, async () => {
    const invalid = event({
      event_id: `EV-CLOSED-INVALID-${label}`,
      start_at: startAt,
      end_at: endAt,
      status: 'CLOSED',
    })
    const client = new FakeClient([invalid])
    const repository = createWorkdayStopProposalRepository(client)

    await assert.rejects(
      repository.closeOpenEventsForWorkday({
        orgId: ORG_ID,
        workdayId: WORKDAY_ID,
        officialStopAt: OFFICIAL_STOP_AT,
      }),
      (error) =>
        error instanceof WorkdayStopProposalError &&
        error.statusCode === 409 &&
        error.code === 'WORKDAY_STOP_PROPOSAL_EVENT_TIME_CONFLICT',
    )
    assert.equal(client.updateCalls().length, 0)
    assert.deepEqual(client.events, [invalid])
  })
}

test('odrzuca niepoprawną oficjalną godzinę przed UPDATE', async () => {
  const source = event()
  const client = new FakeClient([source])
  const repository = createWorkdayStopProposalRepository(client)

  await assert.rejects(
    repository.closeOpenEventsForWorkday({
      orgId: ORG_ID,
      workdayId: WORKDAY_ID,
      officialStopAt: 'invalid-date',
    }),
    (error) =>
      error instanceof WorkdayStopProposalError &&
      error.statusCode === 400 &&
      error.code === 'WORKDAY_STOP_PROPOSAL_INVALID_TIME',
  )
  assert.equal(client.updateCalls().length, 0)
  assert.deepEqual(client.events, [source])
})

test('wykrywa częściowy UPDATE jako konflikt zamiast raportować fałszywy sukces', async () => {
  const source = [event(), event({ event_id: 'EV-OPEN-2', start_at: '2026-09-02T16:00:00.000Z' })]
  const client = new FakeClient(source, { updateLimit: 1 })
  const repository = createWorkdayStopProposalRepository(client)

  await assert.rejects(
    repository.closeOpenEventsForWorkday({
      orgId: ORG_ID,
      workdayId: WORKDAY_ID,
      officialStopAt: OFFICIAL_STOP_AT,
    }),
    (error) =>
      error instanceof WorkdayStopProposalError &&
      error.statusCode === 409 &&
      error.code === 'WORKDAY_STOP_PROPOSAL_EVENT_CLOSE_CONFLICT',
  )
})
