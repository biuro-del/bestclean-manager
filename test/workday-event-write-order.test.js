'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const servicePath = path.join(
  __dirname,
  '..',
  'web-app',
  'apps',
  'portal-web',
  'src',
  'services',
  'workdayService.js',
)

const source = fs.readFileSync(servicePath, 'utf8')
const createStart = source.indexOf('export async function createEvent')
const updateStart = source.indexOf('export async function updateEvent')
const createSource = source.slice(createStart, updateStart)
const updateSource = source.slice(updateStart)

test('createEvent nie zapisuje Workday przed kanonicznym Event', () => {
  const workdayGuard = createSource.indexOf('await assertNoOtherOpenWorkday')
  const eventWrite = createSource.indexOf("runMutationOperation('InsertEventForOrg'")
  const workdayWrite = createSource.indexOf('await createWorkday')

  assert.ok(workdayGuard >= 0)
  assert.ok(eventWrite > workdayGuard)
  assert.ok(eventWrite >= 0)
  assert.ok(workdayWrite > eventWrite)
  assert.match(createSource, /PARTIAL_EVENT_WORKDAY_WRITE_UNKNOWN/)
  assert.doesNotMatch(createSource, /if \(!isOperationNotFoundError\(error, 'InsertEventForOrg'\)\)/)
})

test('updateEvent nie zmienia Workday, gdy kanoniczny Event zostanie odrzucony', () => {
  const workdayGuard = updateSource.indexOf('await assertNoOtherOpenWorkday')
  const eventWrite = updateSource.indexOf('await runMutationOperation(eventOperation')
  const workdayWrite = updateSource.indexOf('await updateWorkday')

  assert.ok(workdayGuard >= 0)
  assert.ok(eventWrite > workdayGuard)
  assert.ok(eventWrite >= 0)
  assert.ok(workdayWrite > eventWrite)
  assert.match(
    updateSource,
    /shouldReidentify \? 'ReidentifyEventForOrg' : 'UpdateEventForOrg'/,
  )
  assert.match(updateSource, /PARTIAL_EVENT_WORKDAY_UPDATE_UNKNOWN/)
  assert.doesNotMatch(updateSource, /if \(!isOperationNotFoundError\(error, 'UpdateEventForOrg'\)\)/)
})

test('kontrole integralności wymagają kompletnych operacji paginowanych zamiast fallbacku 5000', () => {
  assert.match(source, /requireCompletePagedSource === true/)
  assert.match(source, /error\.code = 'INTEGRITY_CHECK_INCOMPLETE'/)
  assert.match(source, /EventsIntegrityPageForOrg/)
  assert.match(source, /WorkdaysIntegrityPageForOrg/)
  assert.match(source, /readAllWorkdaysForWorkerIntegrity/)
})

test('merge zachowuje kanoniczne pola jawnego Eventu zamiast nadpisywać je nowszym Workday', () => {
  assert.match(source, /const canonicalEventFields = \[/)
  for (const field of ['eventType', 'status', 'startAt', 'endAt', 'linkedWorkdayStatus', 'linkedWorkdayEndAt']) {
    assert.match(source, new RegExp(`'${field}'`))
  }
  assert.match(source, /merged\[field\] = explicitSource\[field\]/)
  assert.match(source, /existingIsExplicitEvent !== incomingIsExplicitEvent/)
  assert.match(source, /const preferred = incomingIsExplicitEvent \? item : existing/)
})
