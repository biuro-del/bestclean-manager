'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const backend = fs.readFileSync(path.join(repoRoot, 'index.js'), 'utf8')
const scheduleService = fs.readFileSync(
  path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'services', 'scheduleTaskDataConnectService.js'),
  'utf8',
)
const calendar = fs.readFileSync(
  path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'features', 'calendar', 'index.js'),
  'utf8',
)

test('runtime endpoint grafiku nie wykonuje DDL i sprawdza gotowosc schematu tylko do odczytu', () => {
  assert.doesNotMatch(backend, /ensurePortalScheduleOrderTable/)
  assert.doesNotMatch(backend, /create\s+table\s+if\s+not\s+exists\s+public\.task/i)
  assert.match(backend, /async function assertPortalScheduleOrderSchemaReady\(client\)/)
  assert.match(backend, /to_regclass\('public\.task'\)/)
  assert.match(backend, /column_name = 'lifecycle_status'/)
  assert.match(backend, /PORTAL_SCHEDULE_ORDERS_SCHEMA_UNAVAILABLE/)
  assert.match(backend, /await assertPortalScheduleOrderSchemaReady\(client\)/)
})

test('pobieranie zlecen importuje guard konfiguracji Firebase uzywany przez naglowki sesji', () => {
  assert.match(scheduleService, /import \{ ensureFirebase, isFirebaseConfigured \} from '\.\.\/firebase\/firebaseClient'/)
  assert.match(scheduleService, /async function scheduleOrderAuthHeaders\(\{ forceRefresh = false \} = \{\}\) \{\s*if \(!isFirebaseConfigured\(\)\)/)
})

test('odczyt grafiku toleruje brak opcjonalnego pola NIP klienta w starszym schemacie', () => {
  assert.match(backend, /to_jsonb\(c\) ->> 'nip' as joined_client_nip/)
  assert.doesNotMatch(backend, /c\.nip as joined_client_nip/)
})

test('frontend nie odpytuje Data Connect po bledzie endpointu zlecen ani przy usuwaniu', () => {
  assert.doesNotMatch(scheduleService, /fetchScheduleTasksViaDataConnect/)
  assert.doesNotMatch(scheduleService, /deleteScheduleTasksViaDataConnect/)
  assert.doesNotMatch(scheduleService, /tasksForOrg/)
  assert.doesNotMatch(scheduleService, /deleteTaskForOrg/)
  assert.doesNotMatch(scheduleService, /uses DataConnect fallback/)
  assert.match(scheduleService, /return fetchScheduleTasksViaBackend\(normalizedOrgId\)/)
  assert.match(scheduleService, /return deleteScheduleTasksViaBackend\(normalizedOrgId, ids\)/)
  assert.match(scheduleService, /SCHEDULE_ORDERS_UNAVAILABLE/)
})

test('uzytkownik widzi blad serwera zamiast blednego komunikatu Firebase', () => {
  assert.match(calendar, /showPortalErrorNotice\('Nie udało się pobrać zleceń z serwera', error\)/)
  assert.doesNotMatch(calendar, /Nie udało się pobrać zleceń z Firebase/)
})
