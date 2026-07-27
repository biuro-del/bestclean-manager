'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  EVENT_CORRELATION_COLUMNS,
  buildMobileCleanEventInsert,
  insertMobileCleanEvent,
  readRawTaskPlansForOrganization,
  resolveMobileZoneQrRows,
  warsawOccurrenceDateYmd,
} = require('../service-execution-repository')

function event(overrides = {}) {
  return {
    orgId: 'ORG-1',
    eventId: 'EV-1',
    workdayId: 'WD-1',
    zoneId: 'ZONE-1',
    workerLogin: 'worker7',
    workerName: 'Worker Seven',
    startedAt: '2026-07-27T06:15:00.000Z',
    comment: 'QR',
    ...overrides,
  }
}

function matchedCorrelation(overrides = {}) {
  return {
    status: 'MATCHED',
    reason: 'EXACT_IDS_UNIQUE',
    matchMethod: 'EXACT_IDS_UNIQUE',
    match: {
      taskId: 'TASK-1',
      occurrenceDateYmd: '2026-07-27',
      serviceBlockId: 'BLOCK-1',
      allocationId: 'ALLOC-1',
      workSlotKey: 'slot:BLOCK-1:ALLOC-1',
      plannedStartAt: '2026-07-27T06:00:00.000Z',
      plannedEndAt: '2026-07-27T08:00:00.000Z',
      plannedDurationMinutes: 120,
      taskUpdatedAtSnapshot: '2026-07-20T12:00:00.000Z',
    },
    ...overrides,
  }
}

function insertValue(insert, column) {
  const match = /\(([\s\S]*), created_at, updated_at\s*\)\s*values/i.exec(insert.sql)
  const columns = match[1].split(',').map((value) => value.trim())
  return insert.values[columns.indexOf(column)]
}

test('data wystąpienia jest liczona w Europe/Warsaw, także przy granicy UTC', () => {
  assert.equal(warsawOccurrenceDateYmd('2026-07-26T22:30:00.000Z'), '2026-07-27')
  assert.equal(warsawOccurrenceDateYmd('2026-12-31T23:30:00.000Z'), '2027-01-01')
})

test('QR wybiera jeden exact ID przed podobnym compact ID', () => {
  const exact = { zone_id: 'AB-1' }
  const compactCollision = { zone_id: 'AB1' }

  assert.strictEqual(resolveMobileZoneQrRows([compactCollision, exact], 'ab-1'), exact)
})

test('QR bez exact ID odrzuca wiele wyników compact jako 409', () => {
  assert.throws(
    () => resolveMobileZoneQrRows(
      [{ zone_id: 'AB-1' }, { zone_id: 'AB 1' }],
      'AB_1',
    ),
    (error) => {
      assert.equal(error.statusCode, 409)
      assert.equal(error.publicCode, 'QR_ZONE_AMBIGUOUS')
      assert.equal(error.publicDetails.candidateCount, 2)
      return true
    },
  )
})

test('QR odrzuca również wiele exact ID różniących się wielkością liter', () => {
  assert.throws(
    () => resolveMobileZoneQrRows(
      [{ zone_id: 'Zone-A' }, { zone_id: 'ZONE-A' }],
      'zone-a',
    ),
    (error) => error.publicCode === 'QR_ZONE_AMBIGUOUS' && error.statusCode === 409,
  )
})

test('surowe plany są pobierane tylko po orgId i bez portalowego mapowania godzin', async () => {
  const queries = []
  const rawRows = [{ org_id: 'ORG-1', id_task: 'TASK-1', start_time: null, end_time: null }]
  const client = {
    async query(sql, values) {
      queries.push({ sql, values })
      return { rows: rawRows }
    },
  }

  const rows = await readRawTaskPlansForOrganization(client, 'ORG-1')

  assert.strictEqual(rows, rawRows)
  assert.deepEqual(queries[0].values, ['ORG-1'])
  assert.match(queries[0].sql, /from public\.task[\s\S]*where org_id = \$1/i)
  assert.doesNotMatch(queries[0].sql, /start_time\s+is\s+null|coalesce/i)
  assert.equal(rows[0].start_time, null)
})

test('MATCHED zapisuje pełny link i snapshot planu', () => {
  const insert = buildMobileCleanEventInsert(event(), matchedCorrelation(), {
    correlationSupported: true,
    matchedAt: '2026-07-27T06:15:01.000Z',
  })

  assert.equal(insertValue(insert, 'event_type'), 'CLEAN')
  assert.equal(insertValue(insert, 'match_status'), 'MATCHED')
  assert.equal(insertValue(insert, 'match_method'), 'EXACT_IDS_UNIQUE')
  assert.equal(insertValue(insert, 'match_reason'), 'EXACT_IDS_UNIQUE')
  assert.equal(insertValue(insert, 'task_id'), 'TASK-1')
  assert.equal(insertValue(insert, 'occurrence_date_ymd'), '2026-07-27')
  assert.equal(insertValue(insert, 'service_block_id'), 'BLOCK-1')
  assert.equal(insertValue(insert, 'allocation_id'), 'ALLOC-1')
  assert.equal(insertValue(insert, 'work_slot_key'), 'slot:BLOCK-1:ALLOC-1')
  assert.equal(insertValue(insert, 'matched_at').toISOString(), '2026-07-27T06:15:01.000Z')
  assert.equal(insertValue(insert, 'plan_snapshot_version'), 1)
  assert.equal(insertValue(insert, 'planned_start_at').toISOString(), '2026-07-27T06:00:00.000Z')
  assert.equal(insertValue(insert, 'planned_end_at').toISOString(), '2026-07-27T08:00:00.000Z')
  assert.equal(insertValue(insert, 'planned_duration_minutes'), 120)
  assert.equal(insertValue(insert, 'task_updated_at_snapshot').toISOString(), '2026-07-20T12:00:00.000Z')
})

test('UNMATCHED i AMBIGUOUS nie zapisują częściowego linku ani snapshotu', () => {
  for (const status of ['UNMATCHED', 'AMBIGUOUS']) {
    const insert = buildMobileCleanEventInsert(event(), {
      ...matchedCorrelation(),
      status,
      reason: status === 'AMBIGUOUS' ? 'MULTIPLE_EXACT_CANDIDATES' : 'NO_EXACT_CANDIDATE',
    }, { correlationSupported: true })

    assert.equal(insertValue(insert, 'match_status'), status)
    assert.equal(insertValue(insert, 'match_method'), null)
    for (const column of [
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
    ]) {
      assert.equal(insertValue(insert, column), null)
    }
  }
})

test('repozytorium obniża niepełny MATCHED do UNMATCHED', () => {
  const insert = buildMobileCleanEventInsert(event(), matchedCorrelation({
    match: {
      ...matchedCorrelation().match,
      workSlotKey: '',
    },
  }), { correlationSupported: true })

  assert.equal(insertValue(insert, 'match_status'), 'UNMATCHED')
  assert.equal(insertValue(insert, 'match_reason'), 'INCOMPLETE_PLAN_IDENTITY')
  assert.equal(insertValue(insert, 'match_method'), null)
  assert.equal(insertValue(insert, 'task_id'), null)
})

test('repozytorium bezpiecznie obniża MATCHED bez obiektu match do UNMATCHED', () => {
  const insert = buildMobileCleanEventInsert(event(), matchedCorrelation({
    match: null,
  }), { correlationSupported: true })

  assert.equal(insertValue(insert, 'match_status'), 'UNMATCHED')
  assert.equal(insertValue(insert, 'match_reason'), 'INCOMPLETE_PLAN_IDENTITY')
  assert.equal(insertValue(insert, 'match_method'), null)
  assert.equal(insertValue(insert, 'task_id'), null)
})

test('repozytorium nie zapisuje MATCHED bez rewizji zadania', () => {
  const insert = buildMobileCleanEventInsert(event(), matchedCorrelation({
    match: {
      ...matchedCorrelation().match,
      taskUpdatedAtSnapshot: '',
    },
  }), { correlationSupported: true })

  assert.equal(insertValue(insert, 'match_status'), 'UNMATCHED')
  assert.equal(insertValue(insert, 'match_reason'), 'INCOMPLETE_PLAN_IDENTITY')
  assert.equal(insertValue(insert, 'task_id'), null)
})

test('repozytorium odrzuca MATCHED z metoda spoza whitelisty', () => {
  const insert = buildMobileCleanEventInsert(event(), matchedCorrelation({
    matchMethod: 'NEAREST_TIME_GUESS',
    reason: 'NEAREST_TIME_GUESS',
  }), { correlationSupported: true })

  assert.equal(insertValue(insert, 'match_status'), 'UNMATCHED')
  assert.equal(insertValue(insert, 'match_method'), null)
  assert.equal(insertValue(insert, 'match_reason'), 'INVALID_MATCH_METHOD')
  assert.equal(insertValue(insert, 'task_id'), null)
})

test('repozytorium wymaga reason rownego dozwolonej metodzie MATCHED', () => {
  const insert = buildMobileCleanEventInsert(event(), matchedCorrelation({
    reason: 'MANUAL_OVERRIDE',
  }), { correlationSupported: true })

  assert.equal(insertValue(insert, 'match_status'), 'UNMATCHED')
  assert.equal(insertValue(insert, 'match_method'), null)
  assert.equal(insertValue(insert, 'match_reason'), 'MATCH_REASON_METHOD_MISMATCH')
  assert.equal(insertValue(insert, 'task_id'), null)
})

test('repozytorium odrzuca MATCHED z niepelna lub niemozliwa data wystapienia', () => {
  for (const occurrenceDateYmd of ['2026-7-27', '2026-02-31']) {
    const insert = buildMobileCleanEventInsert(event(), matchedCorrelation({
      match: {
        ...matchedCorrelation().match,
        occurrenceDateYmd,
      },
    }), { correlationSupported: true })

    assert.equal(insertValue(insert, 'match_status'), 'UNMATCHED')
    assert.equal(insertValue(insert, 'match_reason'), 'INVALID_OCCURRENCE_DATE')
    assert.equal(insertValue(insert, 'occurrence_date_ymd'), null)
    assert.equal(insertValue(insert, 'task_id'), null)
  }
})

test('repozytorium odrzuca MATCHED z niepoprawna rewizja zadania', () => {
  const insert = buildMobileCleanEventInsert(event(), matchedCorrelation({
    match: {
      ...matchedCorrelation().match,
      taskUpdatedAtSnapshot: 'not-a-timestamp',
    },
  }), { correlationSupported: true })

  assert.equal(insertValue(insert, 'match_status'), 'UNMATCHED')
  assert.equal(insertValue(insert, 'match_method'), null)
  assert.equal(insertValue(insert, 'match_reason'), 'INVALID_TASK_REVISION')
  assert.equal(insertValue(insert, 'task_updated_at_snapshot'), null)
  assert.equal(insertValue(insert, 'task_id'), null)
})

test('repozytorium akceptuje druga dozwolona metode i kanonizuje reason do metody', () => {
  const insert = buildMobileCleanEventInsert(event(), matchedCorrelation({
    matchMethod: 'EXACT_IDS_AND_TIME_WINDOW',
    reason: 'EXACT_IDS_AND_TIME_WINDOW',
  }), { correlationSupported: true })

  assert.equal(insertValue(insert, 'match_status'), 'MATCHED')
  assert.equal(insertValue(insert, 'match_method'), 'EXACT_IDS_AND_TIME_WINDOW')
  assert.equal(insertValue(insert, 'match_reason'), 'EXACT_IDS_AND_TIME_WINDOW')
  assert.equal(insertValue(insert, 'task_id'), 'TASK-1')
})

test('brak wdrożonych kolumn używa jawnego legacy insertu i ostrzeżenia', async () => {
  const queries = []
  const warnings = []
  const client = {
    async query(sql, values) {
      queries.push({ sql, values })
      if (/information_schema\.columns/i.test(sql)) return { rows: [] }
      return { rows: [{ event_id: 'EV-1' }] }
    },
  }

  const row = await insertMobileCleanEvent(client, event(), matchedCorrelation(), {
    warn: (message) => warnings.push(message),
  })

  assert.equal(row.event_id, 'EV-1')
  assert.equal(queries.length, 2)
  assert.doesNotMatch(queries[1].sql, /event_type|match_status|planned_start_at/i)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /legacy CLEAN insert/)
  assert.match(warnings[0], new RegExp(EVENT_CORRELATION_COLUMNS[0]))
})

test('częściowy schemat nadal zapisuje jawny event_type CLEAN dla zgodności z guardem', async () => {
  const queries = []
  const client = {
    async query(sql, values) {
      queries.push({ sql, values })
      if (/information_schema\.columns/i.test(sql)) {
        return { rows: [{ column_name: 'event_type' }] }
      }
      return { rows: [{ event_id: 'EV-1' }] }
    },
  }

  await insertMobileCleanEvent(client, event(), matchedCorrelation(), { warn: () => {} })

  assert.equal(insertValue({ sql: queries[1].sql, values: queries[1].values }, 'event_type'), 'CLEAN')
  assert.doesNotMatch(queries[1].sql, /match_status|planned_start_at/i)
})
