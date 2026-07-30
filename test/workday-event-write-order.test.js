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

test('createEvent zapisuje Event bez przedwczesnego FK i łączy go dopiero po utworzeniu Workday', () => {
  const workdayGuard = createSource.indexOf('assertNoOtherOpenWorkday(')
  const eventWrite = createSource.indexOf('await insertEventForOrg(')
  const workdayWrite = createSource.indexOf('await createWorkday')
  const linkWrite = createSource.indexOf('await reidentifyEventForOrg(')

  assert.ok(workdayGuard >= 0)
  assert.ok(eventWrite > workdayGuard)
  assert.ok(eventWrite >= 0)
  assert.ok(workdayWrite > eventWrite)
  assert.ok(linkWrite > workdayWrite)
  assert.match(createSource.slice(eventWrite, workdayWrite), /workdayId:\s*null/)
  assert.match(createSource.slice(linkWrite), /workdayId:\s*canonicalWorkdayId/)
  assert.match(createSource, /PARTIAL_EVENT_WORKDAY_WRITE_UNKNOWN/)
  assert.match(createSource, /PARTIAL_EVENT_WORKDAY_LINK_UNKNOWN/)
  assert.doesNotMatch(createSource, /if \(!isOperationNotFoundError\(error, 'InsertEventForOrg'\)\)/)
})

test('updateEvent nie zmienia Workday, gdy kanoniczny Event zostanie odrzucony', () => {
  const workdayGuard = updateSource.indexOf('assertNoOtherOpenWorkday(')
  const eventWrite = updateSource.indexOf('await updateEventForOrg(')
  const workdayWrite = updateSource.indexOf('await updateWorkday')

  assert.ok(workdayGuard >= 0)
  assert.ok(eventWrite > workdayGuard)
  assert.ok(eventWrite >= 0)
  assert.ok(workdayWrite > eventWrite)
  assert.match(updateSource, /if \(shouldReidentify\) \{\s+await reidentifyEventForOrg\(/s)
  assert.match(updateSource, /isMissingDataConnectVariable\(error, 'workerLogin'\)/)
  assert.match(updateSource, /PARTIAL_EVENT_WORKDAY_UPDATE_UNKNOWN/)
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

test('ręczny zapis kontroluje tylko historię wybranego pracownika i nie czeka na polling widoczności', () => {
  assert.match(source, /EventsPageForOrgByWorker/)
  assert.match(source, /WorkdaysPageForOrgByWorker/)
  assert.match(source, /async function readWorkerIntegritySnapshot/)
  assert.match(source, /const \[eventRows, workdayRows, clients, zones, workers\] = await Promise\.all/)
  assert.match(createSource, /const \[, integritySnapshot\] = await Promise\.all/)
  assert.match(createSource, /rows:\s*integritySnapshot\?\.events/)
  assert.match(createSource, /rows:\s*integritySnapshot\?\.workdays/)
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
