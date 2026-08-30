'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const modelModule = import(
  '../web-app/apps/portal-web/src/features/dashboard/operationalMapModel.js'
)
const dashboardSource = readFileSync(
  join(__dirname, '../web-app/apps/portal-web/src/features/dashboard/index.js'),
  'utf8',
)
const layoutSource = readFileSync(
  join(__dirname, '../web-app/apps/portal-web/src/ui/layoutTemplate.js'),
  'utf8',
)

test('status pozostaje zaplanowany do konca 10-minutowego bufora', async () => {
  const { resolveOperationalMapStatus } = await modelModule
  const plannedStartTs = Date.parse('2026-07-27T08:00:00+02:00')

  assert.deepEqual(
    resolveOperationalMapStatus({
      plannedStartTs,
      nowTs: plannedStartTs + 10 * 60 * 1000,
    }),
    { status: 'planned', delayMinutes: 0 },
  )
})

test('status jest alarmowy po przekroczeniu 10 minut bez dokladnego wykonania', async () => {
  const { resolveOperationalMapStatus } = await modelModule
  const plannedStartTs = Date.parse('2026-07-27T08:00:00+02:00')

  assert.deepEqual(
    resolveOperationalMapStatus({
      plannedStartTs,
      nowTs: plannedStartTs + 12 * 60 * 1000,
    }),
    { status: 'late', delayMinutes: 12 },
  )
})

test('dokladne rozpoczecie i zakonczenie zmieniaja status planu', async () => {
  const { resolveOperationalMapStatus } = await modelModule
  const plannedStartTs = Date.parse('2026-07-27T08:00:00+02:00')

  assert.equal(
    resolveOperationalMapStatus({
      plannedStartTs,
      actualStartTs: plannedStartTs + 12 * 60 * 1000,
      nowTs: plannedStartTs + 20 * 60 * 1000,
      hasExactExecutionMatch: true,
    }).status,
    'active',
  )
  assert.equal(
    resolveOperationalMapStatus({
      plannedStartTs,
      actualStartTs: plannedStartTs + 12 * 60 * 1000,
      actualStopTs: plannedStartTs + 60 * 60 * 1000,
      nowTs: plannedStartTs + 90 * 60 * 1000,
      hasExactExecutionMatch: true,
    }).status,
    'finished',
  )
})

test('kazdy zapisany obiekt otrzymuje marker obiektowy, takze dla jednej osoby', async () => {
  const { groupOperationalMapLocations } = await modelModule
  const result = groupOperationalMapLocations([
    { workerKey: 'W001', clientId: 'C100', objectLabel: 'Best Clean' },
    { workerKey: 'W002', clientId: 'C100', objectLabel: 'Best Clean' },
    { workerKey: 'W003', clientId: '', objectLabel: 'Best Clean' },
    { workerKey: 'W004', clientId: 'C200', objectLabel: 'Inny obiekt' },
  ])

  assert.equal(result.groups.length, 2)
  assert.equal(result.groups[0].key, 'client:C100:label:best-clean')
  assert.deepEqual(
    result.groups[0].locations.map((location) => location.workerKey),
    ['W001', 'W002'],
  )
  assert.deepEqual(
    result.standalone.map((location) => location.workerKey).sort(),
    ['W003'],
  )
  assert.deepEqual(result.groups[1].locations.map((location) => location.workerKey), ['W004'])
})

test('rozne placowki jednego klienta nie sa scalane w sztuczny punkt', async () => {
  const { groupOperationalMapLocations } = await modelModule
  const result = groupOperationalMapLocations([
    {
      workerKey: 'W001',
      clientId: 'C100',
      plannedObjectLabel: 'Placowka Gliwice',
      plannedLat: 50.2945,
      plannedLng: 18.6714,
    },
    {
      workerKey: 'W002',
      clientId: 'C100',
      plannedObjectLabel: 'Placowka Tychy',
      plannedLat: 50.1218,
      plannedLng: 19.0200,
    },
  ])

  assert.equal(result.groups.length, 2)
  assert.notEqual(result.groups[0].key, result.groups[1].key)
})

test('GPS i zapisany plan tego samego obiektu tworza jeden marker', async () => {
  const { groupOperationalMapLocations } = await modelModule
  const result = groupOperationalMapLocations([
    {
      workerKey: 'W001',
      clientId: 'C100',
      plannedObjectLabel: 'Placowka Gliwice',
      plannedLat: 50.2945,
      plannedLng: 18.6714,
    },
    {
      workerKey: 'W002',
      clientId: 'C100',
      objectLabel: 'Placowka Gliwice',
      positionKind: 'gps',
      lat: 50.2946,
      lng: 18.6715,
    },
  ])

  assert.equal(result.groups.length, 1)
  assert.deepEqual(
    result.groups[0].locations.map((location) => location.workerKey).sort(),
    ['W001', 'W002'],
  )
  assert.equal(result.standalone.length, 0)
})

test('niejednoznaczny GPS nie jest dopisywany do dwoch obiektow o tej samej nazwie', async () => {
  const { groupOperationalMapLocations } = await modelModule
  const result = groupOperationalMapLocations([
    {
      workerKey: 'W001',
      clientId: 'C100',
      plannedObjectLabel: 'Magazyn',
      plannedLat: 50.2945,
      plannedLng: 18.6714,
    },
    {
      workerKey: 'W002',
      clientId: 'C100',
      plannedObjectLabel: 'Magazyn',
      plannedLat: 50.1218,
      plannedLng: 19.0200,
    },
    {
      workerKey: 'W003',
      clientId: 'C100',
      objectLabel: 'Magazyn',
      positionKind: 'gps',
      lat: 50.2946,
      lng: 18.6715,
    },
  ])

  assert.equal(result.groups.length, 2)
  assert.deepEqual(result.groups.map((group) => group.locations.length), [1, 1])
  assert.deepEqual(result.standalone.map((location) => location.workerKey), ['W003'])
})

test('plan ze wspolrzednymi pozostaje widoczny bez clientId, ale clientless GPS nie tworzy obiektu', async () => {
  const { groupOperationalMapLocations } = await modelModule
  const result = groupOperationalMapLocations([
    {
      workerKey: 'W010',
      clientId: '',
      plannedObjectLabel: 'Magazyn Gliwice',
      plannedLat: 50.2945,
      plannedLng: 18.6714,
    },
    {
      workerKey: 'W011',
      clientId: '',
      objectLabel: 'Odbicie bez klienta',
      positionKind: 'gps',
      lat: 50.2945,
      lng: 18.6714,
    },
  ])

  assert.equal(result.groups.length, 1)
  assert.match(result.groups[0].key, /^site:/)
  assert.deepEqual(result.standalone.map((row) => row.workerKey), ['W011'])
})

test('marker obiektu nigdy nie dziedziczy wspolrzednych GPS pracownika', async () => {
  const { operationalMapStoredFacilityCoordinates } = await modelModule

  assert.equal(
    operationalMapStoredFacilityCoordinates({ lat: 50.2945, lng: 18.6714, positionKind: 'gps' }),
    null,
  )
  assert.deepEqual(
    operationalMapStoredFacilityCoordinates({
      plannedLat: 50.2945,
      plannedLng: 18.6714,
      lat: 50.3000,
      lng: 18.6800,
      positionKind: 'gps',
    }),
    { lat: 50.2945, lng: 18.6714 },
  )
})

test('punkt grupy preferuje zapisana lokalizacje obiektu nad GPS pracownikow', async () => {
  const { resolveOperationalMapGroupPoint } = await modelModule

  assert.deepEqual(
    resolveOperationalMapGroupPoint({
      clientId: 'C100',
      objectLabel: 'Best Clean',
      locations: [
        {
          plannedLat: 50.2945,
          plannedLng: 18.6714,
          lat: 50.4,
          lng: 18.8,
          positionKind: 'gps',
        },
      ],
    }),
    { lat: 50.2945, lng: 18.6714, source: 'stored-facility' },
  )
})

test('punkt grupy bez zapisanej lokalizacji jest orientacyjnym centroidem GPS zespolu', async () => {
  const { resolveOperationalMapGroupPoint } = await modelModule
  const nowTs = Date.UTC(2026, 7, 28, 10, 0, 0)

  const point = resolveOperationalMapGroupPoint(
    {
      clientId: 'C200',
      objectLabel: 'Doradca',
      locations: [
        {
          lat: 50.2945,
          lng: 18.6714,
          positionKind: 'gps',
          gpsAction: 'START_GPS',
          gpsTrustedSource: true,
          gpsTimestamp: nowTs - 5 * 60 * 1000,
        },
        {
          lat: 50.295,
          lng: 18.6718,
          positionKind: 'gps',
          gpsAction: 'STOP_GPS',
          gpsTrustedSource: true,
          gpsTimestamp: nowTs - 60 * 1000,
        },
      ],
    },
    { nowTs },
  )

  assert.equal(point.source, 'last-qr-gps-centroid')
  assert.equal(point.sampleCount, 2)
  assert.equal(point.latestTimestamp, nowTs - 60 * 1000)
  assert.ok(point.maxRadiusMeters < 50)
  assert.ok(point.maxSpreadMeters < 100)
  assert.ok(Math.abs(point.lat - 50.29475) < 1e-9)
  assert.ok(Math.abs(point.lng - 18.6716) < 1e-9)
})

test('pojedyncze swieze odbicie QR GPS daje orientacyjny punkt grupy', async () => {
  const { resolveOperationalMapGroupPoint } = await modelModule
  const nowTs = Date.UTC(2026, 7, 28, 10, 0, 0)

  const point = resolveOperationalMapGroupPoint(
    {
      clientId: 'C201',
      objectLabel: 'GROSS salon',
      locations: [
        {
          lat: 50.2945,
          lng: 18.6714,
          positionKind: 'gps',
          gpsAction: 'CLEAN_START_GPS',
          gpsTrustedSource: true,
          gpsTimestamp: nowTs - 1000,
        },
      ],
    },
    { nowTs },
  )

  assert.equal(point.source, 'last-qr-gps')
  assert.equal(point.sampleCount, 1)
  assert.equal(point.maxRadiusMeters, 0)
})

test('odlegle odbicia QR GPS nie tworza falszywego centroidu obiektu', async () => {
  const { resolveOperationalMapGroupPoint } = await modelModule
  const nowTs = Date.UTC(2026, 7, 28, 10, 0, 0)

  assert.equal(
    resolveOperationalMapGroupPoint(
      {
        clientId: 'C202',
        objectLabel: 'Doradca',
        locations: [
          { lat: 50.2, lng: 18.6, positionKind: 'gps', gpsAction: 'START_GPS', gpsTrustedSource: true, gpsTimestamp: nowTs - 1000 },
          { lat: 50.4, lng: 18.8, positionKind: 'gps', gpsAction: 'STOP_GPS', gpsTrustedSource: true, gpsTimestamp: nowTs - 2000 },
        ],
      },
      { nowTs },
    ),
    null,
  )

  assert.equal(
    resolveOperationalMapGroupPoint(
      {
        clientId: 'C202',
        objectLabel: 'Doradca',
        locations: [
          { lat: 50.2945, lng: 18.6714, positionKind: 'gps', gpsAction: 'START_GPS', gpsTrustedSource: true, gpsTimestamp: nowTs - 1000 },
          { lat: 50.2981, lng: 18.6714, positionKind: 'gps', gpsAction: 'STOP_GPS', gpsTrustedSource: true, gpsTimestamp: nowTs - 2000 },
        ],
      },
      { nowTs },
    ),
    null,
  )
})

test('stare lub nierozpoznane GPS nie tworzy markera obiektu', async () => {
  const { resolveOperationalMapGroupPoint } = await modelModule
  const nowTs = Date.UTC(2026, 7, 28, 10, 0, 0)
  const baseGroup = { clientId: 'C203', objectLabel: 'Doradca' }

  assert.equal(
    resolveOperationalMapGroupPoint(
      {
        ...baseGroup,
        locations: [
          { lat: 50.2, lng: 18.6, positionKind: 'gps', gpsAction: 'GPS', gpsTrustedSource: true, gpsTimestamp: nowTs - 1000 },
        ],
      },
      { nowTs },
    ),
    null,
  )
  assert.equal(
    resolveOperationalMapGroupPoint(
      {
        ...baseGroup,
        locations: [
          { lat: 50.2, lng: 18.6, positionKind: 'gps', gpsAction: 'START_GPS', gpsTrustedSource: true, gpsTimestamp: nowTs - 25 * 60 * 60 * 1000 },
        ],
      },
      { nowTs },
    ),
    null,
  )
  assert.equal(
    resolveOperationalMapGroupPoint(
      {
        ...baseGroup,
        locations: [
          { lat: 50.2, lng: 18.6, positionKind: 'gps', gpsAction: 'START_GPS', gpsTrustedSource: false, gpsTimestamp: nowTs - 1000 },
        ],
      },
      { nowTs },
    ),
    null,
  )
})

test('grupa aktywnego GPS uzywa biezacej nazwy obiektu zamiast planowanej', async () => {
  const { groupOperationalMapLocations } = await modelModule
  const result = groupOperationalMapLocations([
    {
      workerKey: 'W001',
      clientId: 'C500',
      objectLabel: 'Doradca',
      plannedObjectLabel: 'Inny plan',
      positionKind: 'gps',
    },
  ])

  assert.equal(result.groups[0].objectLabel, 'Doradca')
  assert.match(result.groups[0].key, /doradca$/)
})

test('nieznany obiekt nie otrzymuje markera z GPS', async () => {
  const { resolveOperationalMapGroupPoint } = await modelModule
  const nowTs = Date.UTC(2026, 7, 28, 10, 0, 0)

  assert.equal(
    resolveOperationalMapGroupPoint(
      {
        clientId: 'C300',
        objectLabel: 'Brak obiektu przy ostatnim odbiciu',
        locations: [
          { lat: 50.2, lng: 18.6, positionKind: 'gps', gpsAction: 'START_GPS', gpsTrustedSource: true, gpsTimestamp: nowTs - 1000 },
        ],
      },
      { nowTs },
    ),
    null,
  )

  assert.equal(
    resolveOperationalMapGroupPoint(
      {
        clientId: 'C300',
        objectLabel: 'BC0827',
        locations: [
          { lat: 50.2, lng: 18.6, positionKind: 'gps', gpsAction: 'START_GPS', gpsTrustedSource: true, gpsTimestamp: nowTs - 1000 },
        ],
      },
      { nowTs },
    ),
    null,
  )
})

test('techniczne i nierozpoznane nazwy nie sa liczone jako obiekty', async () => {
  const { groupOperationalMapLocations } = await modelModule
  const source = [
    { workerKey: 'W001', clientId: 'C300', objectLabel: 'Brak obiektu przy ostatnim odbiciu' },
    { workerKey: 'W002', clientId: 'C300', objectLabel: 'BC0827' },
    { workerKey: 'W003', clientId: 'C300', objectLabel: 'QR-START-0827' },
    { workerKey: 'W004', clientId: 'C300', objectLabel: 'Doradca' },
  ]

  const result = groupOperationalMapLocations(source)

  assert.equal(result.groups.length, 1)
  assert.equal(result.groups[0].objectLabel, 'Doradca')
  assert.deepEqual(
    result.standalone.map((location) => location.workerKey),
    ['W001', 'W002', 'W003'],
  )
})

test('plan innego obiektu nie jest konsumowany ani nie zmienia statusu aktywnego markera', () => {
  assert.match(
    dashboardSource,
    /const plannedRow = plannedObjectMatchesActual \? plannedCandidateRow : null/,
  )
  assert.match(
    dashboardSource,
    /if \(plannedRow && plannedIndex >= 0\) \{\s*usedPlannedIndexes\.add\(plannedIndex\)/,
  )
})

test('komentarz eventu jest zaufanym GPS tylko dla skutku QR START STOP lub strefy specjalnej', () => {
  assert.match(
    dashboardSource,
    /const explicitQrGpsEvent = explicitEvent && dashboardActiveWorkerMapHasQrGpsEffect\(row\)/,
  )
  assert.match(
    dashboardSource,
    /const trustedStructuredEvent = explicitQrGpsEvent && structuredKind !== 'fallback'/,
  )
})

test('cykliczny tick odswieza alerty i operacje bez ponownego renderowania mapy', () => {
  assert.match(
    dashboardSource,
    /function dashboardRerenderSimulatedTimeline\(\)[\s\S]*?dashboardRerenderOperationalAlerts\(\)[\s\S]*?dashboardRenderOperationalServicePanels\(\)[\s\S]*?if \(dashboardActivityDayKey/,
  )
  assert.match(
    dashboardSource,
    /function dashboardRerenderOperationalAlerts\(\)[\s\S]*?dashboardRenderCommandCenterAlerts\(\{[\s\S]*?locations: snapshot\.locations/,
  )
  assert.equal((dashboardSource.match(/dashboardRenderActiveWorkersMap\(/g) ?? []).length, 0)
})

test('usuniety widok mapy nie pozostawia przelacznikow ani obslugi listy mapy', () => {
  const bindStart = dashboardSource.indexOf('function bindDashboardViewFunctions')
  const bindEnd = dashboardSource.indexOf('async function hydrateSections', bindStart)
  const bindBlock = dashboardSource.slice(bindStart, bindEnd)

  assert.doesNotMatch(layoutSource, /dash-operational-map-tabs/)
  assert.doesNotMatch(layoutSource, /data-dashboard-map-list-mode=/)
  assert.doesNotMatch(layoutSource, /id="dashActiveWorkersMap"/)
  assert.doesNotMatch(
    bindBlock,
    /querySelectorAll\('\[data-dashboard-map-list-mode\]'\)/,
  )
})

test('kontekst alertow odrzuca dane wykonania z innego dnia bez mapowego odswiezenia', () => {
  assert.match(
    dashboardSource,
    /const activeDayKey = dashboardResolveDayKey\(activeRow\)[\s\S]*?activeDayKey !== normalizedDay/,
  )
  assert.match(
    dashboardSource,
    /const rowDayKey = dashboardResolveDayKey\(row\)[\s\S]*?rowDayKey !== normalizedDay/,
  )
  assert.match(dashboardSource, /function dashboardCurrentOperationalAlertSnapshot\(todayRows/)
  assert.match(dashboardSource, /dashboardActiveWorkerMapCandidateRows\(todayRows, dayKey\)/)
  assert.doesNotMatch(dashboardSource, /dashboardActiveWorkersMapSourceDayKey/)
})

test('ton markera obiektu ma priorytet alarm, praca i plan', async () => {
  const { resolveOperationalMapObjectTone } = await modelModule

  assert.equal(resolveOperationalMapObjectTone([{ workStatus: 'planned' }]), 'planned')
  assert.equal(
    resolveOperationalMapObjectTone([
      { workStatus: 'finished' },
      { workStatus: 'active' },
    ]),
    'active',
  )
  assert.equal(
    resolveOperationalMapObjectTone([
      { workStatus: 'active' },
      { workStatus: 'late' },
    ]),
    'late',
  )
})

test('filtry lekkiej mapy rozdzielaja alarmy, prace i wyszukiwanie obiektow', async () => {
  const { filterOperationalMapLocations } = await modelModule
  const locations = [
    { workerKey: 'W001', workerName: 'Maria Czarnula', objectLabel: 'Nash Tackle Zory', workStatus: 'active' },
    { workerKey: 'W002', workerName: 'Agnieszka Ostrowska', objectLabel: 'Helios Med', workStatus: 'late' },
    { workerKey: 'W003', workerName: 'Tomasz Zielinski', objectLabel: 'Biuro Gliwice', workStatus: 'planned' },
  ]

  assert.deepEqual(
    filterOperationalMapLocations(locations, { mode: 'active' }).map((row) => row.workerKey),
    ['W001'],
  )
  assert.deepEqual(
    filterOperationalMapLocations(locations, { mode: 'late' }).map((row) => row.workerKey),
    ['W002'],
  )
  assert.deepEqual(
    filterOperationalMapLocations(locations, { mode: 'objects', query: 'żory' }).map((row) => row.workerKey),
    ['W001'],
  )
})

test('domyslny awatar respektuje jawna plec pracownika', async () => {
  const { resolveOperationalMapAvatarKind } = await modelModule

  assert.equal(
    resolveOperationalMapAvatarKind({ gender: 'female', workerName: 'Jan Kowalski' }),
    'female',
  )
  assert.equal(
    resolveOperationalMapAvatarKind({ plec: 'mężczyzna', workerName: 'Anna Nowak' }),
    'male',
  )
})

test('domyslny awatar rozpoznaje typowe polskie imie', async () => {
  const { resolveOperationalMapAvatarKind } = await modelModule

  assert.equal(resolveOperationalMapAvatarKind({ workerName: 'Marta Cisak' }), 'female')
  assert.equal(resolveOperationalMapAvatarKind({ workerName: 'Cisak Marta' }), 'female')
  assert.equal(resolveOperationalMapAvatarKind({ workerName: 'Rafał Dudek' }), 'male')
  assert.equal(resolveOperationalMapAvatarKind({ workerName: 'Kuba Nowak' }), 'male')
})

test('podsumowanie live obiektu liczy statusy i unikalne strefy', async () => {
  const { buildOperationalMapObjectLiveSummary } = await modelModule
  const summary = buildOperationalMapObjectLiveSummary([
    { workerKey: 'W001', workStatus: 'active', serviceBlockId: 'ZONE-1' },
    { workerKey: 'W002', workStatus: 'planned', serviceBlockId: 'ZONE-1' },
    { workerKey: 'W003', workStatus: 'finished', serviceBlockId: 'ZONE-2' },
    { workerKey: 'W004', workStatus: 'late', serviceBlockId: 'ZONE-3' },
  ])

  assert.deepEqual(summary.statusCounts, {
    active: 1,
    planned: 1,
    finished: 1,
    late: 1,
  })
  assert.equal(summary.zoneTotal, 3)
  assert.equal(summary.zoneDone, 1)
  assert.equal(summary.objectProgress, 33)
  assert.equal(summary.zoneSummary, '1/3 stref')
})

test('strefa nie jest zakonczona dopoki wszystkie przypisane osoby jej nie zakoncza', async () => {
  const { buildOperationalMapObjectLiveSummary } = await modelModule
  const summary = buildOperationalMapObjectLiveSummary([
    { workerKey: 'W001', workStatus: 'finished', serviceBlockId: 'ZONE-1' },
    { workerKey: 'W002', workStatus: 'active', serviceBlockId: 'ZONE-1' },
  ])

  assert.equal(summary.zoneTotal, 1)
  assert.equal(summary.zoneDone, 0)
  assert.equal(summary.objectProgress, 0)
})
