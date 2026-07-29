'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const modelModule = import('../web-app/apps/portal-web/src/features/dashboard/serviceExecutionModel.js')

const ORG_ID = 'ORG-1'
const DAY = '2026-07-23'
const NOW = '2026-07-23T12:00:00.000Z'
const TASK_UPDATED_AT = '2026-07-20T12:00:00.000Z'

function extractNamedFunction(source, name) {
  const start = source.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `Missing function ${name}`)
  const bodyStart = source.indexOf('{', source.indexOf(')', start))
  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] !== '}') continue
    depth -= 1
    if (depth === 0) return source.slice(start, index + 1)
  }
  throw new Error(`Unclosed function ${name}`)
}

function loadCalendarVisualAllocationDedupe() {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'web-app',
      'apps',
      'portal-web',
      'src',
      'features',
      'calendar',
      'index.js',
    ),
    'utf8',
  )
  const functionNames = [
    'calendarTimelineVisualAllocationDedupeKey',
    'calendarTimelineVisualAllocationScore',
    'calendarTimelineDedupeVisualAllocations',
  ]
  const functionsSource = functionNames
    .map((name) => extractNamedFunction(source, name))
    .join('\n')
  return new Function(
    `${functionsSource}\nreturn calendarTimelineDedupeVisualAllocations`,
  )()
}

function loadDashboardPersistedServiceEventRows() {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'web-app',
      'apps',
      'portal-web',
      'src',
      'features',
      'dashboard',
      'index.js',
    ),
    'utf8',
  )
  const functionNames = [
    'dashboardServiceIsExplicitEvent',
    'dashboardPersistedServiceEventRows',
  ]
  const functionsSource = functionNames
    .map((name) => extractNamedFunction(source, name))
    .join('\n')
  return new Function(
    `${functionsSource}\nreturn dashboardPersistedServiceEventRows`,
  )()
}

function loadDashboardBuildServiceExecutionPlannedBlocks() {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'web-app',
      'apps',
      'portal-web',
      'src',
      'features',
      'dashboard',
      'index.js',
    ),
    'utf8',
  )
  const functionNames = [
    'dashboardServiceExecutionIdentityKey',
    'dashboardBuildServiceExecutionPlannedBlocks',
  ]
  const functionsSource = functionNames
    .map((name) => extractNamedFunction(source, name))
    .join('\n')
  return new Function(
    `${functionsSource}\nreturn dashboardBuildServiceExecutionPlannedBlocks`,
  )()
}

function plan(overrides = {}) {
  return {
    orgId: ORG_ID,
    taskId: 'TASK-1',
    taskUpdatedAt: TASK_UPDATED_AT,
    occurrenceDateYmd: DAY,
    serviceBlockId: 'BLOCK-1',
    clientId: 'CLIENT-1',
    requiredAllocationIds: ['ALLOC-1'],
    ...overrides,
  }
}

function cleanEvent(overrides = {}) {
  return {
    eventId: 'EVENT-1',
    orgId: ORG_ID,
    eventType: 'CLEAN',
    matchStatus: 'MATCHED',
    matchedAt: '2026-07-23T10:59:00.000Z',
    planSnapshotVersion: 1,
    plannedDurationMinutes: 120,
    taskUpdatedAtSnapshot: TASK_UPDATED_AT,
    taskId: 'TASK-1',
    occurrenceDateYmd: DAY,
    serviceBlockId: 'BLOCK-1',
    allocationId: 'ALLOC-1',
    status: 'RUNNING',
    startAt: '2026-07-23T11:00:00.000Z',
    endAt: null,
    updatedAt: '2026-07-23T11:00:00.000Z',
    ...overrides,
  }
}

async function build(overrides = {}) {
  const { buildServiceExecutionModel } = await modelModule
  return buildServiceExecutionModel({
    orgId: ORG_ID,
    dayYmd: DAY,
    plannedBlocks: [plan()],
    events: [],
    now: NOW,
    ...overrides,
  })
}

test('visual allocation dedupe keeps visually identical allocations with different exact identities', () => {
  const dedupe = loadCalendarVisualAllocationDedupe()
  const base = {
    serviceBlockId: 'BLOCK-1',
    allocationIdentity: 'block:BLOCK-1:allocation:ALLOC-1',
    row: 3,
    dateYmd: DAY,
    endDateYmd: DAY,
    startTime: '08:00',
    endTime: '10:00',
    minutes: 120,
    workerId: 'WORKER-1',
  }
  const distinctAllocation = {
    ...base,
    allocationIdentity: 'block:BLOCK-1:allocation:ALLOC-2',
  }
  assert.equal(dedupe([base, distinctAllocation]).length, 2)

  const trueDuplicate = {
    ...base,
    row: 8,
    startTime: '09:00',
    endTime: '11:00',
  }
  assert.equal(dedupe([base, trueDuplicate]).length, 1)

  const sameAllocationIdInAnotherBlock = {
    ...base,
    serviceBlockId: 'BLOCK-2',
    allocationIdentity: 'block:BLOCK-2:allocation:ALLOC-1',
  }
  assert.equal(dedupe([base, sameAllocationIdInAnotherBlock]).length, 2)

  const weakLegacyIdentity = {
    ...base,
    allocationIdentity: 'block:BLOCK-1:key:WORKER-1',
  }
  assert.equal(dedupe([weakLegacyIdentity, { ...weakLegacyIdentity }]).length, 2)
})

test('dashboard adapter passes only explicit CLEAN events from the active organization', () => {
  const selectEvents = loadDashboardPersistedServiceEventRows()
  const rows = [
    {
      eventId: 'CLEAN-1',
      workdayId: 'WD-1',
      historySourceKind: 'event',
      hasExplicitEventId: true,
      orgId: ORG_ID,
      eventType: 'CLEAN_START',
    },
    {
      eventId: 'START-1',
      historySourceKind: 'event',
      hasExplicitEventId: true,
      orgId: ORG_ID,
      eventType: 'START',
    },
    {
      eventId: 'OTHER-ORG',
      historySourceKind: 'event',
      hasExplicitEventId: true,
      orgId: 'ORG-2',
      eventType: 'CLEAN',
    },
    {
      eventId: 'WORKDAY-ONLY',
      workdayId: 'WORKDAY-ONLY',
      historySourceKind: 'workday',
      orgId: ORG_ID,
      eventType: 'CLEAN',
    },
  ]

  assert.deepEqual(selectEvents(rows, ORG_ID).map((row) => row.eventId), ['CLEAN-1'])
})

test('dashboard adapter ignores legacy plan rows without any persisted execution identity', () => {
  const buildPlannedBlocks = loadDashboardBuildServiceExecutionPlannedBlocks()
  const legacyPlan = {
    orgId: ORG_ID,
    taskId: 'LEGACY-TASK',
    occurrenceDateYmd: DAY,
    taskUpdatedAt: TASK_UPDATED_AT,
    serviceBlockId: '',
    allocationId: '',
    executionWorkSlotKey: '',
  }
  assert.deepEqual(buildPlannedBlocks([legacyPlan]), [])

  const incompleteStructuredPlan = {
    ...legacyPlan,
    serviceBlockId: 'BLOCK-1',
  }
  assert.equal(buildPlannedBlocks([incompleteStructuredPlan]).length, 1)
})

test('keeps two tasks for the same client as separate occurrence blocks', async () => {
  const result = await build({
    plannedBlocks: [
      plan({ taskId: 'TASK-1', serviceBlockId: 'BLOCK-A', requiredAllocationIds: ['A-1'] }),
      plan({ taskId: 'TASK-2', serviceBlockId: 'BLOCK-B', requiredAllocationIds: ['B-1'] }),
    ],
    events: [
      cleanEvent({ eventId: 'EVENT-A', taskId: 'TASK-1', serviceBlockId: 'BLOCK-A', allocationId: 'A-1' }),
      cleanEvent({ eventId: 'EVENT-B', taskId: 'TASK-2', serviceBlockId: 'BLOCK-B', allocationId: 'B-1' }),
    ],
  })

  assert.equal(result.active.length, 2)
  assert.deepEqual(result.active.map((block) => block.taskId), ['TASK-1', 'TASK-2'])
  assert.notEqual(result.active[0].key, result.active[1].key)
})

test('a multi-worker block completes only after every required allocation has a closed CLEAN event', async () => {
  const plannedBlocks = [plan({ requiredAllocationIds: ['ALLOC-1', 'ALLOC-2'] })]
  const firstResult = await build({
    plannedBlocks,
    events: [
      cleanEvent({
        eventId: 'EVENT-1',
        allocationId: 'ALLOC-1',
        status: 'CLOSED',
        startAt: '2026-07-23T08:00:00.000Z',
        endAt: '2026-07-23T09:00:00.000Z',
      }),
      cleanEvent({
        eventId: 'EVENT-2',
        allocationId: 'ALLOC-2',
        status: 'RUNNING',
        startAt: '2026-07-23T09:00:00.000Z',
      }),
    ],
  })

  assert.equal(firstResult.active.length, 1)
  assert.equal(firstResult.completed.length, 0)
  assert.deepEqual(firstResult.blocks[0].activeAllocationIds, ['ALLOC-2'])
  assert.deepEqual(firstResult.blocks[0].completedAllocationIds, ['ALLOC-1'])

  const completedResult = await build({
    plannedBlocks,
    events: [
      cleanEvent({
        eventId: 'EVENT-1',
        allocationId: 'ALLOC-1',
        status: 'CLOSED',
        startAt: '2026-07-23T08:00:00.000Z',
        endAt: '2026-07-23T09:00:00.000Z',
      }),
      cleanEvent({
        eventId: 'EVENT-2',
        allocationId: 'ALLOC-2',
        status: 'CLOSED',
        startAt: '2026-07-23T09:00:00.000Z',
        endAt: '2026-07-23T10:00:00.000Z',
      }),
    ],
  })

  assert.equal(completedResult.active.length, 0)
  assert.equal(completedResult.completed.length, 1)
  assert.equal(completedResult.completed[0].status, 'COMPLETED')
})

test('deduplicates event revisions by eventId and keeps the newest closed revision', async () => {
  const result = await build({
    events: [
      cleanEvent({
        eventId: 'EVENT-REV',
        status: 'RUNNING',
        updatedAt: '2026-07-23T09:00:00.000Z',
      }),
      cleanEvent({
        eventId: 'EVENT-REV',
        status: 'CLOSED',
        endAt: '2026-07-23T11:30:00.000Z',
        updatedAt: '2026-07-23T11:31:00.000Z',
      }),
    ],
  })

  assert.equal(result.stats.acceptedEvents, 1)
  assert.equal(result.stats.duplicateEvents, 1)
  assert.equal(result.blocks[0].events.length, 1)
  assert.equal(result.blocks[0].events[0].state, 'CLOSED')
  assert.equal(result.completed.length, 1)
  assert.ok(result.exceptions.some((item) => item.code === 'DUPLICATE_EVENT_ID'))
})

test('leaves legacy, unmatched and unlinked CLEAN rows in exceptions', async () => {
  const result = await build({
    events: [
      cleanEvent({ eventId: 'LEGACY', matchStatus: undefined }),
      cleanEvent({ eventId: 'UNMATCHED', matchStatus: 'UNMATCHED' }),
      cleanEvent({ eventId: 'UNLINKED', allocationId: '' }),
      cleanEvent({ eventId: 'UNTYPED', eventType: '' }),
    ],
  })

  assert.equal(result.active.length, 0)
  assert.equal(result.completed.length, 0)
  assert.deepEqual(
    new Set(result.exceptions.map((item) => item.code)),
    new Set(['UNMATCHED_EVENT', 'UNLINKED_EVENT', 'UNCLASSIFIED_EVENT']),
  )
})

test('rejects a CLEAN event matched against a stale task revision', async () => {
  const result = await build({
    events: [
      cleanEvent({
        taskUpdatedAtSnapshot: '2026-07-20T11:59:59.000Z',
      }),
    ],
  })

  assert.equal(result.stats.acceptedEvents, 0)
  assert.equal(result.active.length, 0)
  assert.equal(result.completed.length, 0)
  assert.ok(result.exceptions.some((item) => item.code === 'STALE_PLAN_REVISION'))
})

test('accepts a persisted plan revision snapshot rounded to the database second', async () => {
  const result = await build({
    plannedBlocks: [
      plan({
        taskUpdatedAt: '2026-07-20T12:00:00.026Z',
      }),
    ],
    events: [
      cleanEvent({
        taskUpdatedAtSnapshot: '2026-07-20T12:00:00.000Z',
        status: 'CLOSED',
        endAt: '2026-07-23T11:30:00.000Z',
      }),
    ],
  })

  assert.equal(result.stats.acceptedEvents, 1)
  assert.equal(result.completed.length, 1)
  assert.equal(result.exceptions.some((item) => item.code === 'STALE_PLAN_REVISION'), false)
})

test('requires supported plan snapshot metadata and a valid matchedAt', async () => {
  const missingVersion = await build({
    events: [cleanEvent({ planSnapshotVersion: undefined })],
  })
  assert.equal(missingVersion.stats.acceptedEvents, 0)
  assert.ok(missingVersion.exceptions.some((item) => (
    item.code === 'INVALID_PLAN_SNAPSHOT' &&
    item.missingFields.includes('planSnapshotVersion')
  )))

  const staleMatchTimestamp = await build({
    events: [cleanEvent({ matchedAt: '2026-07-20T11:59:59.000Z' })],
  })
  assert.equal(staleMatchTimestamp.stats.acceptedEvents, 0)
  assert.ok(staleMatchTimestamp.exceptions.some((item) => (
    item.code === 'INVALID_PLAN_SNAPSHOT' &&
    item.reason === 'MATCHED_BEFORE_TASK_REVISION'
  )))
})

test('does not close an allocation from CLOSED status without a valid endAt', async () => {
  const invalidClosed = await build({
    events: [
      cleanEvent({
        status: 'CLOSED',
        endAt: null,
      }),
    ],
  })
  assert.equal(invalidClosed.completed.length, 0)
  assert.equal(invalidClosed.stats.acceptedEvents, 0)
  assert.ok(invalidClosed.exceptions.some((item) => item.code === 'INVALID_EVENT_STATE'))

  const validClosed = await build({
    events: [
      cleanEvent({
        status: 'CLOSED',
        endAt: '2026-07-23T11:30:00.000Z',
      }),
    ],
  })
  assert.equal(validClosed.completed.length, 1)
})

test('isolates the model by organization and occurrence day', async () => {
  const result = await build({
    plannedBlocks: [
      plan(),
      plan({ orgId: 'ORG-2', taskId: 'OTHER-ORG' }),
      plan({ occurrenceDateYmd: '2026-07-24', taskId: 'OTHER-DAY' }),
    ],
    events: [
      cleanEvent(),
      cleanEvent({ eventId: 'OTHER-ORG-EVENT', orgId: 'ORG-2' }),
      cleanEvent({ eventId: 'OTHER-DAY-EVENT', occurrenceDateYmd: '2026-07-24' }),
    ],
  })

  assert.equal(result.blocks.length, 1)
  assert.equal(result.active.length, 1)
  assert.equal(result.stats.acceptedEvents, 1)
  assert.equal(result.stats.ignoredOutOfScope, 4)
  assert.equal(result.exceptions.length, 0)
})

test('uses only the persisted event snapshot as the progress denominator', async () => {
  const measured = await build({
    plannedBlocks: [plan({ plannedDurationMinutes: 999 })],
    events: [cleanEvent()],
  })
  assert.equal(measured.blocks[0].actualDurationMinutes, 60)
  assert.equal(measured.blocks[0].progressPercent, 50)
  assert.equal(measured.blocks[0].plannedDurationMinutes, 120)
  assert.equal(measured.blocks[0].progressBasis, 'EVENT_PLAN_SNAPSHOT_TOTAL')

  const statusOnly = await build({
    plannedBlocks: [plan({ plannedDurationMinutes: 60 })],
    events: [cleanEvent({ plannedDurationMinutes: undefined })],
  })
  assert.equal(statusOnly.blocks[0].status, 'ACTIVE')
  assert.equal(statusOnly.blocks[0].plannedDurationMinutes, null)
  assert.equal(statusOnly.blocks[0].progressPercent, null)
  assert.equal(statusOnly.blocks[0].progressBasis, 'NO_TRUSTED_EVENT_SNAPSHOT')
})

test('requires a complete and consistent duration snapshot for every required allocation', async () => {
  const plannedBlocks = [
    plan({
      requiredAllocationIds: ['ALLOC-1', 'ALLOC-2'],
      plannedDurationMinutes: 999,
    }),
  ]
  const incomplete = await build({
    plannedBlocks,
    events: [
      cleanEvent({
        eventId: 'EVENT-1',
        allocationId: 'ALLOC-1',
        plannedDurationMinutes: 30,
      }),
    ],
  })
  assert.equal(incomplete.blocks[0].plannedDurationMinutes, null)
  assert.equal(incomplete.blocks[0].progressPercent, null)

  const complete = await build({
    plannedBlocks,
    events: [
      cleanEvent({
        eventId: 'EVENT-1',
        allocationId: 'ALLOC-1',
        plannedDurationMinutes: 30,
        startAt: '2026-07-23T11:30:00.000Z',
      }),
      cleanEvent({
        eventId: 'EVENT-2',
        allocationId: 'ALLOC-2',
        plannedDurationMinutes: 90,
        startAt: '2026-07-23T10:30:00.000Z',
      }),
    ],
  })
  assert.equal(complete.blocks[0].plannedDurationMinutes, 120)
  assert.equal(complete.blocks[0].progressBasis, 'EVENT_PLAN_SNAPSHOT_TOTAL')
  assert.equal(complete.blocks[0].progressPercent, 100)

  const inconsistent = await build({
    plannedBlocks: [plan()],
    events: [
      cleanEvent({ eventId: 'EVENT-1', plannedDurationMinutes: 120 }),
      cleanEvent({
        eventId: 'EVENT-2',
        plannedDurationMinutes: 90,
        startAt: '2026-07-23T11:30:00.000Z',
      }),
    ],
  })
  assert.equal(inconsistent.blocks[0].plannedDurationMinutes, null)
  assert.equal(inconsistent.blocks[0].progressPercent, null)
  assert.ok(inconsistent.exceptions.some((item) => (
    item.code === 'INCONSISTENT_PLAN_DURATION_SNAPSHOT'
  )))
})

test('merges flat exact plan candidates into one block without grouping by client', async () => {
  const result = await build({
    plannedBlocks: [
      plan({ requiredAllocationIds: undefined, allocationId: 'ALLOC-1' }),
      plan({ requiredAllocationIds: undefined, allocationId: 'ALLOC-2' }),
    ],
    events: [
      cleanEvent({ eventId: 'EVENT-1', allocationId: 'ALLOC-1' }),
      cleanEvent({ eventId: 'EVENT-2', allocationId: 'ALLOC-2' }),
    ],
  })

  assert.equal(result.blocks.length, 1)
  assert.deepEqual(result.blocks[0].requiredAllocationIds, ['ALLOC-1', 'ALLOC-2'])
  assert.equal(result.active.length, 1)
})

test('ignores non-CLEAN rows and rejects fully linked CLEAN events for unknown plans or allocations', async () => {
  const result = await build({
    events: [
      cleanEvent({ eventId: 'START-EVENT', eventType: 'START' }),
      cleanEvent({ eventId: 'UNKNOWN-TASK', taskId: 'TASK-404' }),
      cleanEvent({ eventId: 'UNKNOWN-ALLOCATION', allocationId: 'ALLOC-404' }),
    ],
  })

  assert.equal(result.active.length, 0)
  assert.equal(result.stats.ignoredNonClean, 1)
  assert.ok(result.exceptions.some((item) => item.code === 'UNKNOWN_PLAN_BLOCK'))
  assert.ok(result.exceptions.some((item) => item.code === 'UNKNOWN_ALLOCATION'))
})

test('does not trust duplicate eventIds that point at different allocations', async () => {
  const result = await build({
    plannedBlocks: [plan({ requiredAllocationIds: ['ALLOC-1', 'ALLOC-2'] })],
    events: [
      cleanEvent({ eventId: 'CONFLICT', allocationId: 'ALLOC-1' }),
      cleanEvent({ eventId: 'CONFLICT', allocationId: 'ALLOC-2' }),
    ],
  })

  assert.equal(result.stats.acceptedEvents, 0)
  assert.equal(result.active.length, 0)
  assert.ok(result.exceptions.some((item) => item.code === 'CONFLICTING_DUPLICATE_EVENT'))
})

test('strict mode requires and verifies the persisted workSlotKey', async () => {
  const strictPlan = plan({
    requiredAllocationIds: undefined,
    allocations: [{ allocationId: 'ALLOC-1', workSlotKey: 'SLOT-KEY-1', minutes: 120 }],
  })
  const matched = await build({
    requireWorkSlotKey: true,
    plannedBlocks: [strictPlan],
    events: [cleanEvent({ workSlotKey: 'SLOT-KEY-1' })],
  })
  assert.equal(matched.active.length, 1)
  assert.equal(matched.stats.acceptedEvents, 1)

  const wrongSlot = await build({
    requireWorkSlotKey: true,
    plannedBlocks: [strictPlan],
    events: [cleanEvent({ workSlotKey: 'SLOT-KEY-OTHER' })],
  })
  assert.equal(wrongSlot.active.length, 0)
  assert.ok(wrongSlot.exceptions.some((item) => item.code === 'UNKNOWN_WORK_SLOT'))

  const missingPlanSlot = await build({
    requireWorkSlotKey: true,
    plannedBlocks: [plan()],
    events: [cleanEvent({ workSlotKey: 'SLOT-KEY-1' })],
  })
  assert.equal(missingPlanSlot.blocks.length, 0)
  assert.ok(missingPlanSlot.exceptions.some((item) => (
    item.code === 'INVALID_PLAN_BLOCK' && item.missingFields.includes('workSlotKey')
  )))
})
