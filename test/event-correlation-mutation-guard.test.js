'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const mutations = fs.readFileSync(
  path.join(root, 'dataconnect', 'connectors', 'example', 'mutations.gql'),
  'utf8',
)
const workdayService = fs.readFileSync(
  path.join(
    root,
    'web-app',
    'apps',
    'portal-web',
    'src',
    'services',
    'workdayService.js',
  ),
  'utf8',
)
const eventFeature = fs.readFileSync(
  path.join(
    root,
    'web-app',
    'apps',
    'portal-web',
    'src',
    'features',
    'events',
    'index.js',
  ),
  'utf8',
)
const backupService = fs.readFileSync(
  path.join(
    root,
    'web-app',
    'apps',
    'portal-web',
    'src',
    'services',
    'backupService.js',
  ),
  'utf8',
)
const reportsFeature = fs.readFileSync(
  path.join(
    root,
    'web-app',
    'apps',
    'portal-web',
    'src',
    'features',
    'reports',
    'index.js',
  ),
  'utf8',
)
const {
  isAllowedPlatformOperation,
  isSensitivePlatformOperation,
} = require(path.join(root, 'platform-policy.js'))

function operationSource(name, nextName) {
  const start = mutations.indexOf(`mutation ${name}(`)
  assert.notEqual(start, -1, `Nie znaleziono operacji ${name}`)
  const end = nextName ? mutations.indexOf(`mutation ${nextName}(`, start + 1) : mutations.length
  assert.notEqual(end, -1, `Nie znaleziono granicy ${nextName}`)
  return mutations.slice(start, end)
}

test('zwykłe zamknięcie zdarzenia nie może zmienić źródłowej tożsamości korelacji', () => {
  const source = operationSource('UpdateEventForOrg', 'ReidentifyEventForOrg')
  const updateData = source.slice(source.indexOf('event_update('))

  for (const retiredVariable of ['workdayId', 'zoneId', 'workerLogin', 'startAt']) {
    assert.match(source, new RegExp(`\\$${retiredVariable}: [^\\n]+ @retired`))
  }
  assert.doesNotMatch(updateData, /\bworkdayId:\s*\$workdayId/)
  assert.doesNotMatch(updateData, /\bzoneId:\s*\$zoneId/)
  assert.doesNotMatch(updateData, /\bworkerLogin:\s*\$workerLogin/)
  assert.doesNotMatch(updateData, /\bstartAt:\s*\$startAt/)
  assert.doesNotMatch(updateData, /\bmatchStatus:/)
  assert.match(updateData, /\bendAt:\s*\$endAt/)
  assert.match(updateData, /\bstatus:\s*\$status/)
})

test('zmiana pracownika, obiektu lub START czyści cały stary link i snapshot planu', () => {
  const source = operationSource('ReidentifyEventForOrg', 'DeleteEventForOrg')

  assert.doesNotMatch(source, /'WORKER'|'PRACOWNIK'/)
  assert.match(source, /\bzoneId:\s*\$zoneId/)
  assert.match(source, /\bworkerLogin:\s*\$workerLogin/)
  assert.match(source, /\bstartAt:\s*\$startAt/)
  assert.match(source, /\bmatchStatus:\s*"UNMATCHED"/)
  assert.match(source, /\bmatchReason:\s*"EVENT_IDENTITY_CHANGED_REQUIRES_RECORRELATION"/)

  for (const nullableField of [
    'matchMethod',
    'taskId',
    'occurrenceDateYmd',
    'serviceBlockId',
    'allocationId',
    'workSlotKey',
    'matchedAt',
    'planSnapshotVersion',
    'plannedStartAt',
    'plannedEndAt',
    'plannedDurationMinutes',
    'taskUpdatedAtSnapshot',
  ]) {
    assert.match(source, new RegExp(`\\b${nullableField}: null`), `${nullableField} nie jest czyszczone`)
  }
})

test('portal rozdziela zwykłe zamknięcie od jawnej zmiany tożsamości', () => {
  assert.match(
    workdayService,
    /import \{ eventCorrelationIdentityChanged \} from '\.\/eventCorrelationIdentityPolicy'/,
  )
  assert.match(
    workdayService,
    /shouldReidentify \? 'ReidentifyEventForOrg' : 'UpdateEventForOrg'/,
  )
  assert.match(eventFeature, /correlationIdentityBaseline:\s*appState\.eventEditorItem/)
  assert.match(reportsFeature, /correlationIdentityBaseline:\s*source/)
  assert.match(workdayService, /payload\.forceReidentify === true \|\|\s*!identityBaseline \|\|/)
  assert.match(
    backupService,
    /Odtwarzanie modułu Zdarzenia jest chwilowo zablokowane\./,
  )
  assert.match(
    backupService,
    /const preRestore = await createPreRestoreSnapshot/,
  )
  assert.ok(
    backupService.indexOf('Odtwarzanie modułu Zdarzenia jest chwilowo zablokowane.') <
      backupService.indexOf('const preRestore = await createPreRestoreSnapshot'),
    'blokada restore zdarzeń musi zadziałać przed pierwszym zapisem i snapshotem',
  )
  assert.doesNotMatch(backupService, /await restoreEventForOrg\(payload\)/)
  assert.doesNotMatch(backupService, /await deleteEventForOrg\(\{ orgId, eventId \}\)/)
  assert.doesNotMatch(backupService, /await reidentifyEventForOrg\(payload\)/)
  assert.doesNotMatch(backupService, /await updateEventForOrg\(payload\)/)
})

test('zwykły insert Eventu wymusza CLEAN także dla klienta z rolą WORKER', () => {
  const source = operationSource('InsertEventForOrg', 'UpdateEventForOrg')
  const insertData = source.slice(source.indexOf('event_insert('))

  assert.match(source, /\$eventType:\s*String\s*@retired/)
  assert.match(insertData, /\beventType:\s*"CLEAN"/)
  assert.doesNotMatch(insertData, /\beventType:\s*\$eventType/)
})

test('connector nie wystawia klientowi operacji odtwarzającej skorelowane Eventy', () => {
  assert.doesNotMatch(mutations, /mutation RestoreEventForOrg\(/)
  assert.doesNotMatch(backupService, /\brestoreEventForOrg\b/)
})

test('sesja platformowa dopuszcza reidentify, ale blokuje niezweryfikowany restore Eventu', () => {
  assert.equal(isAllowedPlatformOperation('mutation', 'ReidentifyEventForOrg'), true)
  assert.equal(isAllowedPlatformOperation('mutation', 'RestoreEventForOrg'), false)
  assert.equal(isSensitivePlatformOperation('ReidentifyEventForOrg'), true)
  assert.equal(isSensitivePlatformOperation('RestoreEventForOrg'), true)
})
