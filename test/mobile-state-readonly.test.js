'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')

function functionSource(name, nextName) {
  const start = source.indexOf(`async function ${name}`)
  assert.notEqual(start, -1, `Nie znaleziono funkcji ${name}`)
  const end = source.indexOf(`async function ${nextName}`, start + 1)
  assert.notEqual(end, -1, `Nie znaleziono granicy ${nextName}`)
  return source.slice(start, end)
}

function mobileOrganizationResolverUnderTest({ claimedOrgIds = [], memberships = [] } = {}) {
  const resolverSource = functionSource('resolveMobileOrganizationFromToken', 'resolveMobileWorker')
  const normalizeText = (value) => String(value || '').trim()
  const normalizeOrgId = (value) => normalizeText(value).toUpperCase()
  const mobileTokenOrganizationIds = () => claimedOrgIds
  const assertMobileRequester = async (_client, orgId) => ({ org_id: orgId, status: 'ACTIVE' })
  const mobileOrganizationScopeError = (statusCode, publicCode, publicMessage) => {
    const error = new Error(publicCode)
    error.statusCode = statusCode
    error.publicCode = publicCode
    error.publicMessage = publicMessage
    return error
  }
  const resolve = new Function(
    'normalizeText',
    'normalizeOrgId',
    'mobileTokenOrganizationIds',
    'assertMobileRequester',
    'mobileOrganizationScopeError',
    `${resolverSource}\nreturn resolveMobileOrganizationFromToken;`,
  )(
    normalizeText,
    normalizeOrgId,
    mobileTokenOrganizationIds,
    assertMobileRequester,
    mobileOrganizationScopeError,
  )
  const client = {
    query: async () => ({ rows: memberships.map((org_id) => ({ org_id })) }),
  }
  return { client, resolve }
}

test('odczyt /api/mobile/state nie aktualizuje worker_runtime_state', () => {
  const snapshot = functionSource('buildMobileSnapshotFromDb', 'closeMobileEvent')
  const scan = functionSource('processMobileWorkflowScan', 'handleMobileWorkflowRequest')

  assert.match(snapshot, /\{ persistRuntimeState = false \} = \{\}/)
  assert.match(snapshot, /if \(persistRuntimeState\) \{\s*await upsertMobileRuntimeState/s)
  assert.match(scan, /buildMobileSnapshotFromDb\(client, orgId, worker, \{ persistRuntimeState: true \}\)/)
})

test('stan mobilny uruchamia transakcje read-only, a skan QR zachowuje transakcje zapisu i blokade doradcza', () => {
  const request = functionSource('handleMobileWorkflowRequest', 'databaseRelationExists')

  assert.match(request, /const isMobileScanRequest = requestUrl\.pathname === MOBILE_SCAN_PATH/)
  assert.match(request, /if \(isMobileStateRequest \|\| isMobileScanRequest\) \{/)
  assert.match(request, /await client\.query\(isMobileStateRequest \? 'begin transaction read only' : 'begin'\)/)
  assert.match(request, /if \(isMobileScanRequest\) \{\s*await client\.query\('select pg_advisory_xact_lock/s)
  assert.match(request, /if \(transactionStarted\) \{\s*await client\.query\('commit'\)/s)
  assert.match(request, /if \(transactionStarted\) \{\s*try \{\s*await client\.query\('rollback'\)/s)
})

test('stan mobilny bez orgId wybiera pojedyncza aktywna organizacje tylko z tokenu', async () => {
  const request = functionSource('handleMobileWorkflowRequest', 'databaseRelationExists')

  assert.match(request, /const isMobileStateRequest = requestUrl\.pathname === MOBILE_STATE_PATH/)
  assert.match(request, /const requestedOrgId = isMobileStateRequest \? '' : normalizeOrgId\(body\?\.orgId\)/)
  assert.match(request, /if \(!isMobileStateRequest && !requestedOrgId\) \{\s*sendMobileApiError\(res, 400, 'ORG_ID_MISSING'/s)
  assert.match(request, /const organization = isMobileStateRequest\s*\? await resolveMobileOrganizationFromToken\(client, decodedToken, requestedOrgId\)/s)
  assert.match(request, /const orgId = organization\.orgId/)
  assert.match(request, /const membership = organization\.membership/)

  const { client, resolve } = mobileOrganizationResolverUnderTest({ memberships: ['CLZ-ONE'] })
  const organization = await resolve(client, { uid: 'firebase-user-1' }, '')
  assert.deepEqual(organization, {
    orgId: 'CLZ-ONE',
    membership: { org_id: 'CLZ-ONE', status: 'ACTIVE' },
  })
})

test('skan QR nadal wymaga jawnego orgId z body', () => {
  const request = functionSource('handleMobileWorkflowRequest', 'databaseRelationExists')

  assert.match(request, /const isMobileScanRequest = requestUrl\.pathname === MOBILE_SCAN_PATH/)
  assert.match(request, /const requestedOrgId = isMobileStateRequest \? '' : normalizeOrgId\(body\?\.orgId\)/)
  assert.match(request, /if \(!isMobileStateRequest && !requestedOrgId\) \{\s*sendMobileApiError\(res, 400, 'ORG_ID_MISSING'/s)
  assert.match(request, /orgId: requestedOrgId,\s*membership: await assertMobileRequester\(client, requestedOrgId, decodedToken\)/s)
  assert.match(request, /processMobileWorkflowScan\(client, orgId, worker, body\)/)
})

test('token wieloorganizacyjny pozostaje bezpiecznie odrzucany', async () => {
  const claimed = mobileOrganizationResolverUnderTest({ claimedOrgIds: ['CLZ-ONE', 'CLZ-TWO'] })
  await assert.rejects(
    () => claimed.resolve(claimed.client, { uid: 'firebase-user-1' }, ''),
    (error) => error?.statusCode === 409 && error?.publicCode === 'MOBILE_ORG_CONTEXT_AMBIGUOUS',
  )

  const memberships = mobileOrganizationResolverUnderTest({ memberships: ['CLZ-ONE', 'CLZ-TWO'] })
  await assert.rejects(
    () => memberships.resolve(memberships.client, { uid: 'firebase-user-1' }, ''),
    (error) => error?.statusCode === 409 && error?.publicCode === 'MOBILE_ORG_CONTEXT_REQUIRED',
  )
})
