'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const queryPath = path.join(
  __dirname,
  '..',
  'dataconnect',
  'connectors',
  'example',
  'queries.gql',
)

test('integrity query paginuje wszystkie Workday organizacji bez filtra case i bez pomijania null startAt', () => {
  const source = fs.readFileSync(queryPath, 'utf8')
  const start = source.indexOf('query WorkdaysIntegrityPageForOrg')
  const end = source.indexOf('query WorkdaysPageForOrgByWorker', start)
  assert.ok(start >= 0 && end > start)
  const body = source.slice(start, end)

  assert.match(body, /\$limit: Int, \$offset: Int/)
  assert.match(body, /limit: \$limit/)
  assert.match(body, /offset: \$offset/)
  assert.match(body, /where: \{ orgId: \{ eq: \$orgId \} \}/)
  assert.match(body, /orderBy: \[\{ updatedAt: DESC \}, \{ workdayId: DESC \}\]/)
  assert.doesNotMatch(body, /workerLogin: \{ eq:/)
  assert.doesNotMatch(body, /startAt: \{ ge:/)
  assert.match(body, /workerLogin/)
  assert.match(body, /endAt/)
  assert.match(body, /status/)
})

test('integrity query Eventów ma stabilne sortowanie i nie pomija null startAt ani nietypowego statusu', () => {
  const source = fs.readFileSync(queryPath, 'utf8')
  const start = source.indexOf('query EventsIntegrityPageForOrg')
  const end = source.indexOf('query EventsPageForOrg', start)
  assert.ok(start >= 0 && end > start)
  const body = source.slice(start, end)

  assert.match(body, /orderBy: \[\{ updatedAt: DESC \}, \{ eventId: DESC \}\]/)
  assert.match(body, /where: \{ orgId: \{ eq: \$orgId \} \}/)
  assert.doesNotMatch(body, /startAt: \{ ge:/)
  assert.doesNotMatch(body, /status: \{ eq:/)
  assert.match(body, /eventType/)
  assert.match(body, /workdayId/)
})

test('obie operacje integrity są jawnie dozwolone dla sesji platformowej', () => {
  const policyPath = path.join(__dirname, '..', 'platform-policy.js')
  const source = fs.readFileSync(policyPath, 'utf8')
  assert.match(source, /'WorkdaysIntegrityPageForOrg'/)
  assert.match(source, /'EventsIntegrityPageForOrg'/)
})
