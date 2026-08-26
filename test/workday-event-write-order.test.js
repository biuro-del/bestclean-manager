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
const updateEnd = source.indexOf('async function findEventIdsLinkedToWorkday', updateStart)
const createSource = source.slice(createStart, updateStart)
const updateSource = source.slice(updateStart, updateEnd)

test('createEvent zapisuje czynność bez tworzenia lustrzanego Workday', () => {
  const eventWrite = createSource.indexOf('await insertEventForOrg(')

  assert.ok(eventWrite >= 0)
  assert.match(createSource, /resolveContainingWorkdayId\(integritySnapshot\?\.workdays/)
  assert.match(createSource.slice(eventWrite), /workdayId:\s*linkedWorkdayId \|\| null/)
  assert.doesNotMatch(createSource, /await createWorkday/)
  assert.doesNotMatch(createSource, /await reidentifyEventForOrg/)
  assert.doesNotMatch(createSource, /assertNoOtherOpenWorkday/)
  assert.doesNotMatch(createSource, /if \(!isOperationNotFoundError\(error, 'InsertEventForOrg'\)\)/)
})

test('updateEvent zapisuje wyłącznie sesję i nigdy nie nadpisuje całego Workday', () => {
  const workdayGuard = updateSource.indexOf('assertNoOtherOpenWorkday(')
  const eventWrite = updateSource.indexOf('await updateEventForOrg(')

  assert.ok(workdayGuard >= 0)
  assert.ok(eventWrite > workdayGuard)
  assert.ok(eventWrite >= 0)
  assert.match(updateSource, /if \(shouldReidentify\) \{\s+await reidentifyEventForOrg\(/s)
  assert.match(updateSource, /isMissingDataConnectVariable\(error, 'workerLogin'\)/)
  assert.doesNotMatch(updateSource, /await updateWorkday\(/)
  assert.doesNotMatch(updateSource, /PARTIAL_EVENT_WORKDAY_UPDATE_UNKNOWN/)
  assert.doesNotMatch(updateSource, /if \(!isOperationNotFoundError\(error, 'UpdateEventForOrg'\)\)/)
})

test('kontrole integralności używają kompletnych operacji paginowanych wybranego pracownika', () => {
  assert.match(source, /requireCompletePagedSource === true/)
  assert.match(source, /error\.code = 'INTEGRITY_CHECK_INCOMPLETE'/)
  assert.match(source, /EventsIntegrityPageForOrg/)
  assert.match(source, /EventsPageForOrgByWorker/)
  assert.match(source, /WorkdaysPageForOrgByWorker/)
  assert.match(source, /WorkdaysIntegrityPageForOrg/)
  assert.match(source, /readOrganizationIntegrityRows/)
  assert.match(source, /readAllWorkdaysForWorkerIntegrity/)
})

test('ręczny zapis kontroluje historię pracownika, powiązuje czynność i nie czeka na polling widoczności', () => {
  assert.match(source, /EventsPageForOrgByWorker/)
  assert.match(source, /WorkdaysPageForOrgByWorker/)
  assert.match(source, /async function readWorkerIntegritySnapshot/)
  assert.match(source, /const \[eventRows, workdayRows, clients, zones, workers\] = await Promise\.all/)
  assert.match(createSource, /const \[, integritySnapshot\] = await Promise\.all/)
  assert.match(createSource, /rows:\s*integritySnapshot\?\.events/)
  assert.match(createSource, /resolveContainingWorkdayId\(integritySnapshot\?\.workdays/)
  assert.match(createSource, /mutationPayload\.workerLogin = workerLogin/)
  assert.match(updateSource, /mutationPayload\.workerLogin = workerLogin/)
  assert.match(source, /fetchPolicy: 'SERVER_ONLY'/)
  assert.match(source, /forceRefresh: filters\.forceRefresh === true/)
  assert.doesNotMatch(source, /assertWorkdayVisibleAfterSave/)
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

test('ewidencja czasu nie wraca do sumy Workday, gdy nie można pobrać sesji Event', () => {
  const getWorkdaysStart = source.indexOf('export async function getWorkdays')
  const getWorkerTimeStart = source.indexOf('export async function getWorkerTime', getWorkdaysStart)
  const getRecentEventsStart = source.indexOf('export async function getRecentEvents', getWorkerTimeStart)
  const getWorkdaysSource = source.slice(getWorkdaysStart, getWorkerTimeStart)
  const getWorkerTimeSource = source.slice(getWorkerTimeStart, getRecentEventsStart)

  assert.match(getWorkdaysSource, /getMappedEventsForOrg\(orgId\)/)
  assert.doesNotMatch(getWorkdaysSource, /getMappedEventsForOrg\(orgId\)\.catch\(\(\) => \[\]\)/)
  assert.match(getWorkerTimeSource, /source:\s*'events'/)
  assert.doesNotMatch(getWorkerTimeSource, /\.catch\(\(\) => \(\{ items: \[\] \}\)\)/)
})
