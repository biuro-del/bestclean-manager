import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyCurrentMonthMissingStopStatus,
  currentMonthMissingStopWorkerKeys,
} from '../web-app/apps/portal-web/src/features/workers/worker_list_profile/missingStopModel.js'

const range = {
  today: '2026-08-26',
  monthStart: '2026-08-01',
}

test('oznacza pracownika tylko za historyczny brak STOP z aktualnego miesiaca', () => {
  const rows = [
    { workerLogin: 'agata', businessDateYmd: '2026-08-21', status: 'RUNNING', startAt: '2026-08-21T08:00:00.000Z' },
    { workerLogin: 'lipiec', businessDateYmd: '2026-07-31', status: 'RUNNING', startAt: '2026-07-31T08:00:00.000Z' },
    { workerLogin: 'dzisiaj', businessDateYmd: '2026-08-26', status: 'RUNNING', startAt: '2026-08-26T08:00:00.000Z' },
    { workerLogin: 'zamkniety', businessDateYmd: '2026-08-20', status: 'CLOSED', startAt: '2026-08-20T08:00:00.000Z', endAt: '2026-08-20T12:00:00.000Z' },
  ]

  assert.deepEqual([...currentMonthMissingStopWorkerKeys(rows, range)], ['agata'])
})

test('dopasowuje login email do loginu Workday bez domeny', () => {
  const workers = [
    { login: 'agata@bestclean.pl', name: 'Agata Zalewska' },
    { login: 'inna@bestclean.pl', name: 'Inna Osoba' },
  ]
  const rows = [
    { workerLogin: 'agata', businessDateYmd: '2026-08-21', status: 'OPEN', startAt: '2026-08-21T08:00:00.000Z' },
  ]

  const result = applyCurrentMonthMissingStopStatus(workers, rows, range)
  assert.equal(result[0].hasCurrentMonthMissingStop, true)
  assert.equal(result[1].hasCurrentMonthMissingStop, false)
})
