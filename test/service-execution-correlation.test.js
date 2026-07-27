'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  CORRELATION_REASON,
  CORRELATION_STATUS,
  MATCH_METHOD,
  correlateCleanStartToPlan,
  parseTaskPlanCandidates,
} = require('../service-execution-correlation')

function cleanStart(overrides = {}) {
  return {
    orgId: 'ORG-1',
    workerId: 'WORKER-7',
    workerLogin: 'worker7@bestclean.pl',
    occurrenceDateYmd: '2026-07-27',
    clientId: 'CLIENT-1',
    zoneId: 'ZONE-1',
    timeZone: 'Europe/Warsaw',
    ...overrides,
  }
}

function plannedTask({
  idTask = 'TASK-1',
  orgId = 'ORG-1',
  clientId = 'CLIENT-1',
  zoneId = 'ZONE-1',
  blockId = 'BLOCK-AM',
  slotId = 'SLOT-1',
  workSlotKey = 'slot:BLOCK-AM:SLOT-1',
  workerId = 'WORKER-7',
  workerLogin = 'worker7@bestclean.pl',
  workerName = 'Rafał Dudek',
  startTime = '08:00',
  endTime = '10:00',
  updatedAt = '2026-07-20T12:00:00.000Z',
  ...overrides
} = {}) {
  return {
    orgId,
    idTask,
    dateYmd: '2026-07-27',
    scheduleMode: 'once',
    clientId,
    zoneId,
    updatedAt,
    serviceBlocks: [
      {
        id: blockId,
        slots: [
          {
            slotId,
            key: workSlotKey,
            workerId,
            workerLogin,
            workerName,
            startTime,
            endTime,
          },
        ],
      },
    ],
    ...overrides,
  }
}

test('unikalny plan jest MATCHED bez serviceBlockId i slotId w CLEAN_START', () => {
  const result = correlateCleanStartToPlan({
    cleanStart: cleanStart(),
    tasks: [plannedTask()],
  })

  assert.equal(result.status, CORRELATION_STATUS.MATCHED)
  assert.equal(result.reason, CORRELATION_REASON.EXACT_IDS_UNIQUE)
  assert.equal(result.matchMethod, MATCH_METHOD.EXACT_IDS_UNIQUE)
  assert.equal(result.match.taskId, 'TASK-1')
  assert.equal(result.match.serviceBlockId, 'BLOCK-AM')
  assert.equal(result.match.allocationId, 'SLOT-1')
  assert.equal(result.match.workSlotKey, 'slot:BLOCK-AM:SLOT-1')
  assert.equal(result.match.plannedStartAt, '2026-07-27T06:00:00.000Z')
  assert.equal(result.match.plannedEndAt, '2026-07-27T08:00:00.000Z')
  assert.equal(result.match.plannedDurationMinutes, 120)
  assert.equal(result.match.taskUpdatedAtSnapshot, '2026-07-20T12:00:00.000Z')
})

test('unikalny kandydat bez pełnego klucza planu pozostaje UNMATCHED', () => {
  const result = correlateCleanStartToPlan({
    cleanStart: cleanStart(),
    tasks: [plannedTask({ slotId: '', workSlotKey: '' })],
  })

  assert.equal(result.status, CORRELATION_STATUS.UNMATCHED)
  assert.equal(result.reason, CORRELATION_REASON.INCOMPLETE_PLAN_IDENTITY)
  assert.equal(result.matchMethod, null)
  assert.equal(result.match, null)
  assert.deepEqual(result.missingPlanIdentityFields, ['allocationId', 'workSlotKey'])
})

test('brak rewizji zadania uniemożliwia audytowalne MATCHED', () => {
  const result = correlateCleanStartToPlan({
    cleanStart: cleanStart(),
    tasks: [plannedTask({ updatedAt: '' })],
  })

  assert.equal(result.status, CORRELATION_STATUS.UNMATCHED)
  assert.equal(result.reason, CORRELATION_REASON.INCOMPLETE_PLAN_IDENTITY)
  assert.deepEqual(result.missingPlanIdentityFields, ['taskUpdatedAtSnapshot'])
})

test('dwie zmiany rozstrzyga wyłącznie jawne okno zawierające scannedAt', () => {
  const result = correlateCleanStartToPlan({
    cleanStart: cleanStart({ scannedAt: '2026-07-27T12:30:00+02:00' }),
    tasks: [
      plannedTask({ idTask: 'TASK-AM', blockId: 'BLOCK-AM', slotId: 'SLOT-AM', startTime: '08:00', endTime: '10:00' }),
      plannedTask({ idTask: 'TASK-PM', blockId: 'BLOCK-PM', slotId: 'SLOT-PM', startTime: '12:00', endTime: '14:00' }),
    ],
  })

  assert.equal(result.status, CORRELATION_STATUS.MATCHED)
  assert.equal(result.reason, CORRELATION_REASON.EXACT_IDS_AND_TIME_WINDOW)
  assert.equal(result.matchMethod, MATCH_METHOD.EXACT_IDS_AND_TIME_WINDOW)
  assert.equal(result.initialCandidateCount, 2)
  assert.equal(result.timeWindowCandidateCount, 1)
  assert.equal(result.match.taskId, 'TASK-PM')
  assert.equal(result.match.serviceBlockId, 'BLOCK-PM')
})

test('nakładające się jawne okna pozostają AMBIGUOUS i nie wybierają najbliższego', () => {
  const result = correlateCleanStartToPlan({
    cleanStart: cleanStart({ scannedAt: '2026-07-27T09:30:00+02:00' }),
    tasks: [
      plannedTask({ idTask: 'TASK-A', startTime: '08:00', endTime: '10:30' }),
      plannedTask({ idTask: 'TASK-B', blockId: 'BLOCK-B', slotId: 'SLOT-B', startTime: '09:00', endTime: '11:00' }),
    ],
  })

  assert.equal(result.status, CORRELATION_STATUS.AMBIGUOUS)
  assert.equal(result.reason, CORRELATION_REASON.MULTIPLE_EXACT_CANDIDATES)
  assert.equal(result.matchMethod, null)
  assert.equal(result.candidateCount, 2)
  assert.equal(result.timeWindowCandidateCount, 2)
  assert.equal(result.match, null)
})

test('workerId ma priorytet i niezgodności nie można uratować loginem ani nazwą', () => {
  const result = correlateCleanStartToPlan({
    cleanStart: cleanStart({ workerName: 'Rafał Dudek' }),
    tasks: [
      plannedTask({
        workerId: 'WORKER-OTHER',
        workerLogin: 'worker7@bestclean.pl',
        workerName: 'Rafał Dudek',
      }),
    ],
  })

  assert.equal(result.status, CORRELATION_STATUS.UNMATCHED)
  assert.equal(result.reason, CORRELATION_REASON.NO_EXACT_CANDIDATE)
})

test('zgodny workerId pozostaje rozstrzygający mimo starego loginu w planie', () => {
  const result = correlateCleanStartToPlan({
    cleanStart: cleanStart({
      workerId: 'WORKER-7',
      workerLogin: 'current.worker@bestclean.pl',
    }),
    tasks: [plannedTask({
      workerId: 'WORKER-7',
      workerLogin: 'old.worker@bestclean.pl',
    })],
  })

  assert.equal(result.status, CORRELATION_STATUS.MATCHED)
  assert.equal(result.match.workerId, 'WORKER-7')
})

test('plan bez zoneId może pasować wyłącznie przez dokładny clientId strefy ze skanu', () => {
  const matched = correlateCleanStartToPlan({
    cleanStart: cleanStart({ clientId: 'CLIENT-1', zoneId: 'ZONE-SCANNED' }),
    tasks: [plannedTask({ zoneId: '' })],
  })
  const rejected = correlateCleanStartToPlan({
    cleanStart: cleanStart({ clientId: 'CLIENT-OTHER', zoneId: 'ZONE-SCANNED' }),
    tasks: [plannedTask({ zoneId: '' })],
  })

  assert.equal(matched.status, CORRELATION_STATUS.MATCHED)
  assert.equal(matched.match.zoneId, '')
  assert.equal(matched.match.clientId, 'CLIENT-1')
  assert.equal(rejected.status, CORRELATION_STATUS.UNMATCHED)
})

test('plan z jawną inną zoneId jest odrzucony nawet przy zgodnym clientId', () => {
  const result = correlateCleanStartToPlan({
    cleanStart: cleanStart({ clientId: 'CLIENT-1', zoneId: 'ZONE-SCANNED' }),
    tasks: [plannedTask({ clientId: 'CLIENT-1', zoneId: 'ZONE-OTHER' })],
  })

  assert.equal(result.status, CORRELATION_STATUS.UNMATCHED)
  assert.equal(result.reason, CORRELATION_REASON.NO_EXACT_CANDIDATE)
})

test('zgodna zoneId nie maskuje sprzecznego clientId zapisanego w planie', () => {
  const result = correlateCleanStartToPlan({
    cleanStart: cleanStart({ clientId: 'CLIENT-SCANNED', zoneId: 'ZONE-1' }),
    tasks: [plannedTask({ clientId: 'CLIENT-OTHER', zoneId: 'ZONE-1' })],
  })

  assert.equal(result.status, CORRELATION_STATUS.UNMATCHED)
  assert.equal(result.reason, CORRELATION_REASON.NO_EXACT_CANDIDATE)
})

test('cykl tygodniowy i marker serviceBlocks w JSON tworzą kandydata tylko w dniu wystąpienia', () => {
  const cyclicTask = plannedTask({
    dateYmd: '2026-07-06',
    scheduleMode: 'repeat',
    repeatEvery: 1,
    repeatUnit: 'week',
    repeatWeekdays: JSON.stringify([1, 3]),
    serviceBlocks: undefined,
    weeklyScheduleRules: JSON.stringify([
      {
        marker: 'cleanz_service_blocks_v2',
        version: 2,
        serviceBlocks: [{
          id: 'BLOCK-AM',
          weekdays: [1, 3],
          slots: [{
            slotId: 'SLOT-1',
            workerId: 'WORKER-7',
            workerLogin: 'worker7@bestclean.pl',
            startTime: '08:00',
            endTime: '10:00',
          }],
        }],
      },
    ]),
  })

  const monday = correlateCleanStartToPlan({
    cleanStart: cleanStart({ occurrenceDateYmd: '2026-07-27' }),
    tasks: [cyclicTask],
  })
  const tuesday = correlateCleanStartToPlan({
    cleanStart: cleanStart({ occurrenceDateYmd: '2026-07-28' }),
    tasks: [cyclicTask],
  })

  assert.equal(monday.status, CORRELATION_STATUS.MATCHED)
  assert.equal(monday.match.occurrenceId, 'TASK-1__repeat__2026-07-27')
  assert.equal(tuesday.status, CORRELATION_STATUS.UNMATCHED)
})

test('recurrenceEndDate z markera v2 kończy cykl bez osobnej kolumny Task', () => {
  const cyclicTask = plannedTask({
    dateYmd: '2026-07-06',
    scheduleMode: 'repeat',
    repeatEvery: 1,
    repeatUnit: 'week',
    repeatWeekdays: JSON.stringify([1]),
    serviceBlocks: undefined,
    weeklyScheduleRules: JSON.stringify([
      {
        marker: 'cleanz_service_blocks_v2',
        version: 2,
        recurrenceEndDate: '2026-07-20',
        serviceBlocks: [{
          id: 'BLOCK-AM',
          weekdays: [1],
          slots: [{
            slotId: 'SLOT-1',
            key: 'slot:BLOCK-AM:SLOT-1',
            workerId: 'WORKER-7',
            workerLogin: 'worker7@bestclean.pl',
            startTime: '08:00',
            endTime: '10:00',
          }],
        }],
      },
    ]),
  })

  const result = correlateCleanStartToPlan({
    cleanStart: cleanStart({ occurrenceDateYmd: '2026-07-27' }),
    tasks: [cyclicTask],
  })

  assert.equal(result.status, CORRELATION_STATUS.UNMATCHED)
  assert.equal(result.reason, CORRELATION_REASON.NO_EXACT_CANDIDATE)
})

test('recurrenceSkippedDates z markera v2 wyklucza oryginalne wystąpienie po utworzeniu override', () => {
  const cyclicTask = plannedTask({
    dateYmd: '2026-07-06',
    scheduleMode: 'repeat',
    repeatEvery: 1,
    repeatUnit: 'week',
    repeatWeekdays: JSON.stringify([1]),
    serviceBlocks: undefined,
    weeklyScheduleRules: JSON.stringify([
      {
        marker: 'cleanz_service_blocks_v2',
        version: 2,
        recurrenceSkippedDates: ['2026-07-27'],
        serviceBlocks: [{
          id: 'BLOCK-AM',
          weekdays: [1],
          slots: [{
            slotId: 'SLOT-1',
            key: 'slot:BLOCK-AM:SLOT-1',
            workerId: 'WORKER-7',
            workerLogin: 'worker7@bestclean.pl',
            startTime: '08:00',
            endTime: '10:00',
          }],
        }],
      },
    ]),
  })

  const result = correlateCleanStartToPlan({
    cleanStart: cleanStart({ occurrenceDateYmd: '2026-07-27' }),
    tasks: [cyclicTask],
  })

  assert.equal(result.status, CORRELATION_STATUS.UNMATCHED)
  assert.equal(result.reason, CORRELATION_REASON.NO_EXACT_CANDIDATE)
})

test('jednorazowy serviceBlock nie powtarza się razem z cyklicznym rodzicem', () => {
  const task = plannedTask({
    dateYmd: '2026-07-06',
    scheduleMode: 'repeat',
    repeatEvery: 1,
    repeatUnit: 'week',
    repeatWeekdays: JSON.stringify([1]),
    serviceBlocks: [{
      id: 'BLOCK-ONCE',
      scheduleMode: 'once',
      dateYmd: '2026-07-13',
      slots: [{
        slotId: 'SLOT-1',
        key: 'slot:BLOCK-ONCE:SLOT-1',
        workerId: 'WORKER-7',
        workerLogin: 'worker7@bestclean.pl',
        startTime: '08:00',
        endTime: '10:00',
      }],
    }],
  })

  const onBlockDay = correlateCleanStartToPlan({
    cleanStart: cleanStart({ occurrenceDateYmd: '2026-07-13' }),
    tasks: [task],
  })
  const laterParentOccurrence = correlateCleanStartToPlan({
    cleanStart: cleanStart({ occurrenceDateYmd: '2026-07-27' }),
    tasks: [task],
  })

  assert.equal(onBlockDay.status, CORRELATION_STATUS.MATCHED)
  assert.equal(onBlockDay.match.plannedStartAt, '2026-07-13T06:00:00.000Z')
  assert.equal(onBlockDay.match.plannedEndAt, '2026-07-13T08:00:00.000Z')
  assert.equal(laterParentOccurrence.status, CORRELATION_STATUS.UNMATCHED)
  assert.equal(laterParentOccurrence.reason, CORRELATION_REASON.NO_EXACT_CANDIDATE)
})

test('tenant jest izolowany dokładnym orgId', () => {
  const result = correlateCleanStartToPlan({
    cleanStart: cleanStart({ orgId: 'ORG-1' }),
    tasks: [
      plannedTask({ orgId: 'ORG-2', idTask: 'TASK-FOREIGN' }),
      plannedTask({ orgId: 'ORG-1', idTask: 'TASK-LOCAL' }),
    ],
  })

  assert.equal(result.status, CORRELATION_STATUS.MATCHED)
  assert.equal(result.match.taskId, 'TASK-LOCAL')
  assert.equal(result.match.orgId, 'ORG-1')
})

test('lokalny slot i globalne workAllocation tego samego przydziału tworzą jednego kandydata', () => {
  const source = plannedTask({
    serviceBlocks: [{
      id: 'BLOCK-AM',
      slots: [{
        slotId: 'SLOT-1',
        workerId: 'WORKER-7',
        workerLogin: 'worker7@bestclean.pl',
      }],
    }],
    workAllocations: JSON.stringify([
      {
        serviceBlockId: 'BLOCK-AM',
        slotId: 'SLOT-1',
        key: 'worker-slot:1',
        workerId: 'WORKER-7',
        workerLogin: 'worker7@bestclean.pl',
        startTime: '08:00',
        endTime: '10:00',
      },
    ]),
  })

  const candidates = parseTaskPlanCandidates(source, '2026-07-27')
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].serviceBlockId, 'BLOCK-AM')
  assert.equal(candidates[0].allocationId, 'SLOT-1')
  assert.equal(candidates[0].workSlotKey, 'worker-slot:1')
})

test('produkcyjne reprezentacje slotu nie mnożą jednego przydziału', () => {
  const detailedAllocation = {
    key: 'slot:BLOCK-AM:SLOT-1',
    slotId: 'SLOT-1',
    serviceBlockId: 'BLOCK-AM',
    workerId: 'WORKER-7',
    workerLogin: 'worker7@bestclean.pl',
    startTime: '08:00',
    endTime: '10:00',
  }
  const source = plannedTask({
    zoneId: '',
    serviceBlocks: [{
      id: 'BLOCK-AM',
      slots: [{
        id: 'SLOT-1',
        slotId: 'SLOT-1',
        workerId: 'WORKER-7',
        workerLogin: 'worker7@bestclean.pl',
        startTime: '08:00',
        endTime: '10:00',
      }],
      workAllocations: [{ ...detailedAllocation }],
      workerAllocations: [{ ...detailedAllocation }],
      workerAssignments: [{
        row: 7,
        key: 'worker-7',
        workerId: 'WORKER-7',
        workerLogin: 'worker7@bestclean.pl',
      }],
    }],
    workAllocations: [{
      row: 7,
      key: 'worker-7',
      workerId: 'WORKER-7',
      workerLogin: 'worker7@bestclean.pl',
      startTime: '08:00',
      endTime: '10:00',
    }],
  })

  const candidates = parseTaskPlanCandidates(source, '2026-07-27')
  const result = correlateCleanStartToPlan({
    cleanStart: cleanStart({ zoneId: 'ZONE-SCANNED' }),
    tasks: [source],
  })

  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].serviceBlockId, 'BLOCK-AM')
  assert.equal(candidates[0].allocationId, 'SLOT-1')
  assert.equal(candidates[0].workSlotKey, 'slot:BLOCK-AM:SLOT-1')
  assert.equal(result.status, CORRELATION_STATUS.MATCHED)
  assert.equal(result.reason, CORRELATION_REASON.EXACT_IDS_UNIQUE)
})

test('globalny przydzial bloku MON nie tworzy kandydata we WTO, gdy inny blok jest wtedy aktywny', () => {
  const source = plannedTask({
    dateYmd: '2026-07-06',
    scheduleMode: 'repeat',
    repeatEvery: 1,
    repeatUnit: 'week',
    repeatWeekdays: [1, 2],
    serviceBlocks: [
      {
        id: 'BLOCK-MON',
        weekdays: [1],
        slots: [],
      },
      {
        id: 'BLOCK-TUE',
        weekdays: [2],
        slots: [{
          slotId: 'SLOT-TUE',
          key: 'slot:BLOCK-TUE:SLOT-TUE',
          workerId: 'WORKER-TUE',
          workerLogin: 'worker.tue@bestclean.pl',
          startTime: '08:00',
          endTime: '10:00',
        }],
      },
    ],
    workAllocations: [{
      serviceBlockId: 'BLOCK-MON',
      slotId: 'SLOT-MON',
      key: 'slot:BLOCK-MON:SLOT-MON',
      workerId: 'WORKER-7',
      workerLogin: 'worker7@bestclean.pl',
      startTime: '08:00',
      endTime: '10:00',
    }],
  })

  const candidates = parseTaskPlanCandidates(source, '2026-07-28')
  const result = correlateCleanStartToPlan({
    cleanStart: cleanStart({ occurrenceDateYmd: '2026-07-28' }),
    tasks: [source],
  })

  assert.deepEqual(candidates.map((candidate) => candidate.serviceBlockId), ['BLOCK-TUE'])
  assert.equal(result.status, CORRELATION_STATUS.UNMATCHED)
  assert.equal(result.reason, CORRELATION_REASON.NO_EXACT_CANDIDATE)
})

test('brak wymaganego klucza skanu zwraca jawny UNMATCHED bez zgadywania', () => {
  const result = correlateCleanStartToPlan({
    cleanStart: cleanStart({ zoneId: '', clientId: '' }),
    tasks: [plannedTask()],
  })

  assert.equal(result.status, CORRELATION_STATUS.UNMATCHED)
  assert.equal(result.reason, CORRELATION_REASON.MISSING_REQUIRED_EXECUTION_FIELDS)
  assert.deepEqual(result.missingFields, ['clientId', 'zoneId'])
})
