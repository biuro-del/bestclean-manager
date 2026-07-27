'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const modelModule = import(
  '../web-app/apps/portal-web/src/features/dashboard/serviceOperationStreamModel.js'
)

test('strumien pokazuje wszystkie aktywne operacje nad zakonczonymi', async () => {
  const { buildServiceOperationStream } = await modelModule
  const stream = buildServiceOperationStream({
    active: [
      { key: 'active-old', title: 'Starsza aktywna', startTs: 100 },
      { key: 'active-new', title: 'Nowsza aktywna', startTs: 400 },
    ],
    completed: [
      { key: 'done-newest', title: 'Wlasnie zakonczona', startTs: 200, stopTs: 500 },
      { key: 'done-old', title: 'Dawniej zakonczona', startTs: 50, stopTs: 300 },
    ],
  })

  assert.deepEqual(
    stream.map((item) => item.key),
    ['active-new', 'active-old', 'done-newest', 'done-old'],
  )
  assert.deepEqual(
    stream.map((item) => item.operationState),
    ['active', 'active', 'completed', 'completed'],
  )
})

test('podglad ogranicza liczbe pozycji bez zmiany kolejnosci', async () => {
  const { serviceOperationPreview } = await modelModule
  const items = [{ key: '3' }, { key: '2' }, { key: '1' }]

  assert.deepEqual(
    serviceOperationPreview(items, 2).map((item) => item.key),
    ['3', '2'],
  )
})

test('otwarty CLEAN bez planu staje sie aktywnoscia faktyczna bez wymyslonego postepu', async () => {
  const { buildObservedServiceOperationCandidates } = await modelModule
  const result = buildObservedServiceOperationCandidates({
    dayYmd: '2026-07-27',
    events: [
      {
        eventId: 'EV-UNPLANNED',
        eventType: 'CLEAN',
        status: 'RUNNING',
        startAt: '2026-07-27T15:20:00+02:00',
      },
    ],
  })

  assert.equal(result.active.length, 1)
  assert.equal(result.completed.length, 0)
  assert.equal(result.active[0].eventId, 'EV-UNPLANNED')
  assert.equal(result.active[0].stopTs, 0)
  assert.equal(result.active[0].operationState, 'active')
})

test('zdarzenie przyjete przez scisla korelacje nie jest wyswietlane drugi raz', async () => {
  const { buildObservedServiceOperationCandidates } = await modelModule
  const result = buildObservedServiceOperationCandidates({
    dayYmd: '2026-07-27',
    consumedEventIds: ['EV-MATCHED'],
    events: [
      {
        eventId: 'EV-MATCHED',
        eventType: 'CLEAN',
        status: 'RUNNING',
        startAt: '2026-07-27T15:20:00+02:00',
      },
    ],
  })

  assert.deepEqual(result, { active: [], completed: [] })
})

test('zamkniety CLEAN bez planu pozostaje widoczny jako zakonczona aktywnosc', async () => {
  const { buildObservedServiceOperationCandidates } = await modelModule
  const result = buildObservedServiceOperationCandidates({
    dayYmd: '2026-07-27',
    events: [
      {
        eventId: 'EV-CLOSED',
        eventType: 'CLEAN',
        status: 'CLOSED',
        startAt: '2026-07-27T14:00:00+02:00',
        endAt: '2026-07-27T15:00:00+02:00',
      },
    ],
  })

  assert.equal(result.active.length, 0)
  assert.equal(result.completed.length, 1)
  assert.equal(result.completed[0].eventId, 'EV-CLOSED')
  assert.equal(result.completed[0].operationState, 'completed')
  assert.ok(result.completed[0].stopTs > result.completed[0].startTs)
})

test('obserwowane CLEAN sa deduplikowane i ograniczone do wskazanego dnia', async () => {
  const { buildObservedServiceOperationCandidates } = await modelModule
  const result = buildObservedServiceOperationCandidates({
    dayYmd: '2026-07-27',
    events: [
      {
        eventId: 'EV-REVISION',
        eventType: 'CLEAN',
        status: 'RUNNING',
        startAt: '2026-07-27T10:00:00+02:00',
        updatedAt: '2026-07-27T10:05:00+02:00',
      },
      {
        eventId: 'EV-REVISION',
        eventType: 'CLEAN',
        status: 'CLOSED',
        startAt: '2026-07-27T10:00:00+02:00',
        endAt: '2026-07-27T11:00:00+02:00',
        updatedAt: '2026-07-27T11:00:00+02:00',
      },
      {
        eventId: 'EV-OLD',
        eventType: 'CLEAN',
        status: 'RUNNING',
        startAt: '2026-07-26T22:00:00+02:00',
      },
    ],
  })

  assert.equal(result.active.length, 0)
  assert.equal(result.completed.length, 1)
  assert.equal(result.completed[0].eventId, 'EV-REVISION')
})

test('status CLOSED bez rzeczywistego STOP nie udaje zakonczonej operacji', async () => {
  const { buildObservedServiceOperationCandidates } = await modelModule
  const result = buildObservedServiceOperationCandidates({
    dayYmd: '2026-07-27',
    events: [
      {
        eventId: 'EV-CLOSED-WITHOUT-STOP',
        eventType: 'CLEAN',
        status: 'CLOSED',
        startAt: '2026-07-27T10:00:00+02:00',
      },
    ],
  })

  assert.deepEqual(result, { active: [], completed: [] })
})

test('otwarty dzien pracy staje sie aktywna obecnoscia takze przy brakujacym obiekcie', async () => {
  const { buildObservedWorkdayOperationCandidates } = await modelModule
  const result = buildObservedWorkdayOperationCandidates({
    dayYmd: '2026-07-27',
    workdays: [
      {
        kind: 'workday',
        workdayId: 'WD-ACTIVE',
        workerId: 'WORKER-1',
        workerName: 'Jan Kowalski',
        clientId: 'CLIENT-1',
        companyLabel: 'Obiekt A',
        startTs: new Date('2026-07-27T08:00:00+02:00').getTime(),
        isRunning: true,
      },
      {
        kind: 'workday',
        workdayId: 'WD-WITHOUT-OBJECT',
        workerId: 'WORKER-2',
        workerName: 'Anna Nowak',
        companyLabel: '-',
        startTs: new Date('2026-07-27T09:00:00+02:00').getTime(),
        isRunning: true,
      },
    ],
  })

  assert.equal(result.active.length, 2)
  assert.equal(result.completed.length, 0)
  assert.equal(result.active[0].workdayId, 'WD-WITHOUT-OBJECT')
  assert.equal(result.active[0].clientLabel, '')
  assert.equal(result.active[1].workdayId, 'WD-ACTIVE')
  assert.equal(result.active[1].clientLabel, 'Obiekt A')
})

test('zamkniety dzien pracy pozostaje faktem, ale nie potwierdza wykonania planu', async () => {
  const { buildObservedWorkdayOperationCandidates } = await modelModule
  const result = buildObservedWorkdayOperationCandidates({
    dayYmd: '2026-07-27',
    workdays: [
      {
        kind: 'workday',
        workdayId: 'WD-CLOSED',
        workerLogin: 'worker@example.com',
        workerName: 'Jan Kowalski',
        companyLabel: 'Obiekt A',
        startTs: new Date('2026-07-27T08:00:00+02:00').getTime(),
        stopTs: new Date('2026-07-27T12:00:00+02:00').getTime(),
        isRunning: false,
      },
    ],
  })

  assert.equal(result.active.length, 0)
  assert.equal(result.completed.length, 1)
  assert.equal(result.completed[0].operationState, 'completed')
})

test('obecnosc laczy sie z planem tylko po jednoznacznych zapisanych identyfikatorach', async () => {
  const { matchObservedWorkdayToPlan } = await modelModule
  const workday = {
    clientId: 'CLIENT-1',
    workerId: 'WORKER-1',
    sourceWorkday: {
      clientId: 'CLIENT-1',
      workerId: 'WORKER-1',
      sourceRow: {
        taskId: 'TASK-1',
        serviceBlockId: 'BLOCK-1',
        allocationId: 'ALLOC-1',
        workSlotKey: 'SLOT-1',
      },
    },
  }
  const planned = [
    {
      taskId: 'TASK-1',
      serviceBlockId: 'BLOCK-1',
      allocationId: 'ALLOC-1',
      executionWorkSlotKey: 'SLOT-1',
      clientId: 'CLIENT-1',
      workerId: 'WORKER-1',
      startTs: new Date('2026-07-27T08:00:00+02:00').getTime(),
      stopTs: new Date('2026-07-27T16:00:00+02:00').getTime(),
    },
  ]

  assert.equal(matchObservedWorkdayToPlan(workday, planned), planned[0])
})

test('niejednoznaczne plany tego samego pracownika i obiektu nie tworza procentu', async () => {
  const { matchObservedWorkdayToPlan } = await modelModule
  const workday = {
    clientId: 'CLIENT-1',
    workerLogin: 'worker@example.com',
  }
  const planned = [
    {
      taskId: 'TASK-1',
      serviceBlockId: 'BLOCK-1',
      allocationId: 'ALLOC-1',
      executionWorkSlotKey: 'SLOT-1',
      clientId: 'CLIENT-1',
      workerLogin: 'worker@example.com',
      startTs: new Date('2026-07-27T08:00:00+02:00').getTime(),
      stopTs: new Date('2026-07-27T12:00:00+02:00').getTime(),
    },
    {
      taskId: 'TASK-2',
      serviceBlockId: 'BLOCK-2',
      allocationId: 'ALLOC-2',
      executionWorkSlotKey: 'SLOT-2',
      clientId: 'CLIENT-1',
      workerLogin: 'worker@example.com',
      startTs: new Date('2026-07-27T12:00:00+02:00').getTime(),
      stopTs: new Date('2026-07-27T16:00:00+02:00').getTime(),
    },
  ]

  assert.equal(matchObservedWorkdayToPlan(workday, planned), null)
})

test('pojedynczy plan tego samego pracownika i obiektu bez zapisanej referencji nie tworzy procentu', async () => {
  const { matchObservedWorkdayToPlan } = await modelModule
  const workday = {
    clientId: 'CLIENT-1',
    workerId: 'WORKER-1',
    startTs: new Date('2026-07-27T19:33:00+02:00').getTime(),
  }
  const planned = [
    {
      taskId: 'TASK-1',
      serviceBlockId: 'BLOCK-1',
      allocationId: 'ALLOC-1',
      executionWorkSlotKey: 'SLOT-1',
      clientId: 'CLIENT-1',
      workerId: 'WORKER-1',
      startTs: new Date('2026-07-27T08:30:00+02:00').getTime(),
      stopTs: new Date('2026-07-27T16:30:00+02:00').getTime(),
    },
  ]

  assert.equal(matchObservedWorkdayToPlan(workday, planned), null)
})
