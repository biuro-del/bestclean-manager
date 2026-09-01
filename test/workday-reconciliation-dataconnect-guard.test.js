'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const source = fs.readFileSync(
  path.join(__dirname, '..', 'dataconnect', 'connectors', 'example', 'mutations.gql'),
  'utf8',
)
const backendSource = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')

function mutationBlock(name, nextName) {
  const start = source.indexOf(`mutation ${name}(`)
  assert.notEqual(start, -1, `missing mutation ${name}`)
  const end = nextName ? source.indexOf(`mutation ${nextName}(`, start) : source.length
  assert.notEqual(end, -1, `missing next mutation ${nextName}`)
  return source.slice(start, end)
}

test('publiczne Update/Delete Workday sa fail-closed dla istniejacego rekordu', () => {
  const update = mutationBlock('UpdateWorkdayForOrg', 'DeleteWorkdayForOrg')
  const remove = mutationBlock('DeleteWorkdayForOrg', 'InsertEventForOrg')

  for (const block of [update, remove]) {
    const checkIndex = block.indexOf('targetWorkday: workday(key: { orgId: $orgId, workdayId: $workdayId })')
    assert.notEqual(checkIndex, -1)
    assert.match(block.slice(checkIndex), /@check\(expr: "this == null"/)
  }
  assert.ok(update.indexOf('targetWorkday:') < update.indexOf('workday_update('))
  assert.ok(remove.indexOf('targetWorkday:') < remove.indexOf('workday_delete('))
})

test('publiczne Update/Delete Event przepuszczaja tylko niepowiazany Event bez lustrzanego Workday', () => {
  const update = mutationBlock('UpdateEventForOrg', 'ReidentifyEventForOrg')
  const remove = mutationBlock('DeleteEventForOrg', 'InsertBackupCycleForOrg')

  for (const block of [update, remove]) {
    assert.match(block, /targetEvent: event\(key: \{ orgId: \$orgId, eventId: \$eventId \}\)\s*@check\(expr: "this != null"/)
    assert.match(block, /workdayId @check\(expr: "this == null"/)
    assert.match(block, /mirroredWorkday: workday\(key: \{ orgId: \$orgId, workdayId: \$eventId \}\)\s*@check\(expr: "this == null"/)
  }
  assert.ok(update.indexOf('mirroredWorkday:') < update.indexOf('event_update('))
  assert.ok(remove.indexOf('mirroredWorkday:') < remove.indexOf('event_delete('))
})

test('Reidentify Event jest jednorazowym linkiem, a Insert flow pozostaje bez nowych blokad', () => {
  const insertWorkday = mutationBlock('InsertWorkdayForOrg', 'UpdateWorkdayForOrg')
  const insertEvent = mutationBlock('InsertEventForOrg', 'UpdateEventForOrg')
  const reidentify = mutationBlock('ReidentifyEventForOrg', 'DeleteEventForOrg')

  assert.doesNotMatch(insertWorkday, /targetWorkday:|mirroredWorkday:/)
  assert.doesNotMatch(insertEvent, /targetEvent:|mirroredWorkday:/)
  assert.match(insertWorkday, /workday_insert\(/)
  assert.match(insertEvent, /\$workdayId:\s*String\s*@retired/)
  assert.match(insertEvent, /event_insert\([\s\S]*workdayId:\s*null/)
  assert.doesNotMatch(insertEvent.slice(insertEvent.indexOf('event_insert(')), /workdayId:\s*\$workdayId/)

  assert.match(reidentify, /targetEvent: event\(key: \{ orgId: \$orgId, eventId: \$eventId \}\)\s*@check\(expr: "this != null"/)
  assert.match(reidentify, /workdayId @check\(expr: "this == null"/)
  assert.doesNotMatch(reidentify, /mirroredWorkday:/)
  assert.match(reidentify, /\$workdayId:\s*String\s*@retired/)
  assert.match(reidentify, /targetWorkday: workday\(key: \{ orgId: \$orgId, workdayId: \$eventId \}\)\s*@check\(expr: "this != null"/)
  assert.match(reidentify, /workdayId @check\(expr: "this == response\.query\.targetEvent\.eventId"/)
  assert.match(reidentify, /endAt @check\(expr: "this == null"/)
  assert.match(reidentify, /status @check\(expr: "this != 'CLOSED'"/)
  const reidentifyWrite = reidentify.slice(reidentify.indexOf('event_update('))
  assert.match(reidentifyWrite, /workdayId:\s*\$eventId/)
  assert.doesNotMatch(reidentifyWrite, /workdayId:\s*\$workdayId/)
  assert.ok(reidentify.indexOf('targetEvent:') < reidentify.indexOf('event_update('))
})

test('REST bulk-delete blokuje powiazane sesje bez jawnej zgody i pozwala usunac caly Workday', () => {
  const guardStart = backendSource.indexOf('async function assertPortalEventDeleteOutsideReconciliation')
  const deleteStart = backendSource.indexOf('async function deletePortalEventsByIds', guardStart)
  const handlerStart = backendSource.indexOf('async function handlePortalEventsRequest', deleteStart)
  assert.notEqual(guardStart, -1)
  assert.notEqual(deleteStart, -1)
  assert.notEqual(handlerStart, -1)

  const guard = backendSource.slice(guardStart, deleteStart)
  const deletion = backendSource.slice(deleteStart, handlerStart)
  const handler = backendSource.slice(handlerStart, backendSource.indexOf('async function readPortalScheduleOrders', handlerStart))

  assert.match(guard, /pg_advisory_xact_lock/)
  assert.match(guard, /select event_id, workday_id, start_event_id, end_event_id[\s\S]*order by event_id asc\s*for update/)
  assert.doesNotMatch(guard, /nullif\(btrim\(workday_id\), ''\) is not null/)
  assert.match(guard, /select workday_id[\s\S]*order by workday_id asc\s*for update/)
  assert.match(guard, /const protectedWorkdayIds = new Set/)
  assert.match(guard, /const allowedWholeWorkdayIds = new Set/)
  assert.match(guard, /const blockedWorkdayIds = \[\.\.\.protectedWorkdayIds\]\.filter/)
  assert.match(guard, /if \(!blockedWorkdayIds\.length\) return/)

  const beginIndex = deletion.indexOf("await client.query('begin')")
  const guardIndex = deletion.indexOf('await assertPortalEventDeleteOutsideReconciliation')
  const firstDeleteIndex = deletion.indexOf('await deletePortalEventsFromTableByColumns')
  assert.ok(beginIndex >= 0 && beginIndex < guardIndex && guardIndex < firstDeleteIndex)
  assert.match(deletion, /assertPortalEventDeleteOutsideReconciliation\(client, orgId, ids, wholeWorkdayIds\)/)
  assert.match(deletion, /deletePortalWorkdayStopProposalRows/)
  assert.ok(deletion.indexOf('deletePortalWorkdayStopProposalRows') < deletion.lastIndexOf("'public.workday'"))
  assert.doesNotMatch(handler, /await assertPortalEventDeleteOutsideReconciliation/)
  assert.match(handler, /collectPortalWholeWorkdayDeleteIds/)
  assert.match(handler, /deletePortalEventsByIds\(client, orgId, eventIds, \{ wholeWorkdayIds \}\)/)
  assert.match(handler, /client\.query\('rollback'\)/)
})
