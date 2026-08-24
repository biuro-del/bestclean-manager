'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

const root = path.join(__dirname, '..')

async function importModule(relativePath) {
  const absolutePath = path.join(root, ...relativePath)
  return import(pathToFileURL(absolutePath).href)
}

test('niezmienione pole START zachowuje sekundy i milisekundy źródłowego Eventu', async () => {
  const { preserveUnchangedEventTimestamp } = await importModule([
    'web-app',
    'apps',
    'portal-web',
    'src',
    'features',
    'events',
    'eventTimePolicy.js',
  ])
  const original = '2026-07-24T05:04:23.456Z'

  assert.equal(
    preserveUnchangedEventTimestamp({
      inputValue: '2026-07-24T07:04',
      parsedInputTimestamp: '2026-07-24T05:04:00.000Z',
      originalTimestamp: original,
      formattedOriginalValue: '2026-07-24T07:04',
    }),
    original,
  )
  assert.equal(
    preserveUnchangedEventTimestamp({
      inputValue: '2026-07-24T07:05',
      parsedInputTimestamp: '2026-07-24T05:05:00.000Z',
      originalTimestamp: original,
      formattedOriginalValue: '2026-07-24T07:04',
    }),
    '2026-07-24T05:05:00.000Z',
  )
})

test('identyfikatory planu są porównywane z wielkością liter, a login pracownika bez niej', async () => {
  const { eventCorrelationIdentityChanged } = await importModule([
    'web-app',
    'apps',
    'portal-web',
    'src',
    'services',
    'eventCorrelationIdentityPolicy.js',
  ])
  const baseline = {
    workdayId: 'WD-AbC',
    zoneId: 'ZONE-XyZ',
    workerLogin: 'Worker@Example.com',
    startAt: '2026-07-24T05:04:23.456Z',
  }

  assert.equal(
    eventCorrelationIdentityChanged(baseline, {
      ...baseline,
      workerLogin: 'worker@example.com',
      startAt: '2026-07-24T07:04:23.456+02:00',
    }),
    false,
  )
  assert.equal(
    eventCorrelationIdentityChanged(baseline, { ...baseline, workdayId: 'wd-abc' }),
    true,
  )
  assert.equal(
    eventCorrelationIdentityChanged(baseline, { ...baseline, zoneId: 'zone-xyz' }),
    true,
  )
})
