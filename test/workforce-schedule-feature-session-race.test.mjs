import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const webAppRoot = path.join(projectRoot, 'web-app')
const featurePath = path.join(
  webAppRoot,
  'apps',
  'portal-web',
  'src',
  'features',
  'workforce-schedule',
  'index.js',
)
const featureRoot = path.dirname(featurePath)

let featureFactoryPromise

function moduleUrl(...parts) {
  return pathToFileURL(path.resolve(featureRoot, ...parts)).href
}

async function loadFeatureFactory() {
  if (featureFactoryPromise) return featureFactoryPromise
  featureFactoryPromise = (async () => {
    const source = await readFile(featurePath, 'utf8')
    const bodyStart = source.indexOf('function text(value)')
    const bodyEnd = source.indexOf('\nexport default ScheduleContent', bodyStart)
    assert.ok(bodyStart >= 0 && bodyEnd > bodyStart, 'feature host body must remain discoverable')
    const body = source
      .slice(bodyStart, bodyEnd)
      .replace('export function createWorkforceScheduleFeature', 'function createWorkforceScheduleFeature')

    const [contract, clientModel, asyncGuard, catalogSync, transport] = await Promise.all([
      import(moduleUrl('scheduleContract.js')),
      import(moduleUrl('workforceScheduleClientModel.js')),
      import(moduleUrl('workforceScheduleAsyncGuard.js')),
      import(moduleUrl('workforceScheduleCatalogSync.js')),
      import(moduleUrl('..', '..', 'services', 'workforceScheduleTransport.js')),
    ])
    const dependencies = {
      ScheduleContent: function ScheduleContent() {},
      assertWorkforceScheduleSelectableReferences: clientModel.assertWorkforceScheduleSelectableReferences,
      buildWorkforceScheduleWeekCopyPayload: clientModel.buildWorkforceScheduleWeekCopyPayload,
      buildWorkforceScheduleShiftPayload: clientModel.buildWorkforceScheduleShiftPayload,
      createElement(type, props, ...children) {
        return {
          props: {
            ...(props || {}),
            ...(children.length ? { children: children.length === 1 ? children[0] : children } : {}),
          },
          type,
        }
      },
      createRoot: (...args) => globalThis.__workforceScheduleTestRootFactory(...args),
      createWorkforceScheduleAdapter: contract.createWorkforceScheduleAdapter,
      createWorkforceScheduleAsyncGuard: asyncGuard.createWorkforceScheduleAsyncGuard,
      createWorkforceScheduleCatalogSyncGate: catalogSync.createWorkforceScheduleCatalogSyncGate,
      createWorkforceScheduleOperationRegistry: transport.createWorkforceScheduleOperationRegistry,
      defaultWorkforceScheduleService: {},
      formatWorkforceScheduleWarning: clientModel.formatWorkforceScheduleWarning,
      isConfirmedWorkforceScheduleSettings: clientModel.isConfirmedWorkforceScheduleSettings,
      isConfirmedWorkforceScheduleShift: clientModel.isConfirmedWorkforceScheduleShift,
      normalizeWorkforceScheduleBootstrap: clientModel.normalizeWorkforceScheduleBootstrap,
      normalizeWorkforceScheduleSettings: clientModel.normalizeWorkforceScheduleSettings,
      normalizeWorkforceScheduleShift: clientModel.normalizeWorkforceScheduleShift,
      normalizeWorkforceScheduleWeekCopyReceipt: clientModel.normalizeWorkforceScheduleWeekCopyReceipt,
      summarizeWorkforceScheduleCatalogSync: catalogSync.summarizeWorkforceScheduleCatalogSync,
      workforceScheduleCatalogConflictsFromError: clientModel.workforceScheduleCatalogConflictsFromError,
      workforceSchedulePublicationCandidates: clientModel.workforceSchedulePublicationCandidates,
    }
    const names = Object.keys(dependencies)
    const compile = Function(...names, `'use strict'\n${body}\nreturn createWorkforceScheduleFeature`)
    return compile(...names.map((name) => dependencies[name]))
  })()
  return featureFactoryPromise
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, reject, resolve }
}

async function waitFor(predicate, message = 'condition') {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = predicate()
    if (result) return result
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(`Timed out waiting for ${message}.`)
}

function nodeText(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  return nodeText(node?.props?.children)
}

function findElement(node, predicate) {
  if (!node || typeof node !== 'object') return null
  if (predicate(node)) return node
  const children = Array.isArray(node?.props?.children)
    ? node.props.children
    : [node?.props?.children]
  for (const child of children) {
    const found = findElement(child, predicate)
    if (found) return found
  }
  return null
}

function activationButton(rendered) {
  return findElement(rendered, (node) => (
    node.type === 'button'
    && /Uruchom Grafik|Konfiguruj/.test(nodeText(node))
  ))
}

function bootstrap(overrides = {}) {
  return {
    locations: [],
    people: [],
    publications: [],
    requests: [],
    settings: { timeZone: 'Europe/Warsaw', version: 1, weeklyLimitMinutes: 2400 },
    shifts: [],
    templates: [],
    ...overrides,
  }
}

async function createFixture(t) {
  const renders = []
  const notices = []
  const copyCalls = []
  const configureCalls = []
  const shiftCalls = []
  const fetchCalls = []
  const syncCalls = []
  const session = {
    activeOrgId: 'org-a',
    capabilities: { workforceScheduling: true },
    roleCode: 'OWNER',
  }
  let setupRequired = false

  const service = {
    async fetchWorkforceScheduleBootstrap(orgId) {
      fetchCalls.push(orgId)
      return bootstrap({
        locations: [{ locationId: `location-${orgId.replace(/^org-/, '')}`, name: `Location ${orgId}`, status: 'ACTIVE' }],
        people: [{ displayName: `User ${orgId}`, personId: `person-${orgId}`, status: 'ACTIVE' }],
        settings: { orgId, timeZone: 'Europe/Warsaw', version: 1, weeklyLimitMinutes: 2400 },
        setupRequired,
      })
    },
    async syncWorkforceScheduleCatalogs(orgId, payload, options) {
      syncCalls.push({ orgId, payload, options })
      return {
        effects: { delivery: false, downstream: false, notifications: false },
        idempotent: false,
        locations: [],
        ok: true,
        orgId,
        people: [],
      }
    },
    setWorkforceScheduleConfiguration(orgId, configuration, options) {
      const pending = deferred()
      configureCalls.push({ configuration, options, orgId, pending })
      return pending.promise
    },
    copyWorkforceScheduleWeek(orgId, payload, options) {
      const pending = deferred()
      copyCalls.push({ orgId, options, payload, pending })
      return pending.promise
    },
    upsertWorkforceScheduleShift(orgId, payload) {
      const pending = deferred()
      shiftCalls.push({ orgId, payload, pending })
      return pending.promise
    },
  }

  class FakeHTMLElement {}
  const mount = new FakeHTMLElement()
  const root = {
    render(element) { renders.push(element) },
    unmount() {},
  }

  const previousDocument = globalThis.document
  const previousElement = globalThis.HTMLElement
  const previousFactory = globalThis.__workforceScheduleTestRootFactory
  const previousWindow = globalThis.window
  globalThis.document = { getElementById: () => mount }
  globalThis.HTMLElement = FakeHTMLElement
  globalThis.__workforceScheduleTestRootFactory = () => root
  globalThis.window = {
    confirm: () => true,
    setTimeout,
  }

  t.after(() => {
    globalThis.document = previousDocument
    globalThis.HTMLElement = previousElement
    globalThis.__workforceScheduleTestRootFactory = previousFactory
    globalThis.window = previousWindow
  })

  const createWorkforceScheduleFeature = await loadFeatureFactory()
  const feature = createWorkforceScheduleFeature({
    appState: { session },
    showTransientNotice(message, tone) { notices.push({ message, tone }) },
    workforceScheduleService: service,
  })
  feature.bind()

  return {
    configureCalls,
    copyCalls,
    feature,
    fetchCalls,
    lastRender: () => renders.at(-1),
    notices,
    renders,
    service,
    session,
    setSetupRequired(value) { setupRequired = value },
    shiftCalls,
    syncCalls,
  }
}

test('reset sesji podczas configure ignoruje stary wynik i nie zwalnia blokady nowej sesji', async (t) => {
  const f = await createFixture(t)
  f.setSetupRequired(true)
  await f.feature.refresh({ syncCatalogs: false })

  activationButton(f.lastRender()).props.onClick()
  await waitFor(() => f.configureCalls.length === 1, 'first configure request')

  f.feature.resetSession()
  await f.feature.refresh({ syncCatalogs: false })
  activationButton(f.lastRender()).props.onClick()
  await waitFor(() => f.configureCalls.length === 2, 'second configure request')
  assert.equal(activationButton(f.lastRender()).props.disabled, true)

  f.configureCalls[0].pending.resolve({
    settings: { timeZone: 'Europe/Berlin', version: 91, weeklyLimitMinutes: 2400 },
  })
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(activationButton(f.lastRender()).props.disabled, true)
  assert.deepEqual(f.notices, [])

  f.setSetupRequired(false)
  f.configureCalls[1].pending.resolve({
    settings: { orgId: 'org-a', timeZone: 'Europe/Warsaw', version: 2, weeklyLimitMinutes: 2400 },
  })
  await waitFor(() => f.notices.length === 1, 'current configure completion')
  await waitFor(() => typeof f.lastRender()?.type === 'function', 'schedule content render')

  assert.match(f.notices[0].message, /^Grafik .+ uruchomiony\.$/)
  assert.equal(f.lastRender().props.snapshot.users[0].id, 'person-org-a')
  assert.equal(f.syncCalls.length, 1)
  assert.equal(f.syncCalls[0].orgId, 'org-a')
})

test('pierwsze uruchomienie nie ogłasza sukcesu bez pełnego potwierdzenia ustawień', async (t) => {
  const f = await createFixture(t)
  f.setSetupRequired(true)
  await f.feature.refresh({ syncCatalogs: false })

  activationButton(f.lastRender()).props.onClick()
  await waitFor(() => f.configureCalls.length === 1, 'configuration request')
  f.configureCalls[0].pending.resolve({
    settings: { orgId: 'org-a', timeZone: 'Europe/Warsaw', version: 1, weeklyLimitMinutes: 2400 },
  })
  await waitFor(() => /pełnego potwierdzenia uruchomienia/.test(nodeText(f.lastRender())), 'invalid confirmation error')

  assert.deepEqual(f.notices, [])
  assert.match(nodeText(f.lastRender()), /Skonfiguruj Grafik/)
})

test('zmiana organizacji podczas runWrite odrzuca stary wynik i nie zwalnia nowego zapisu', async (t) => {
  const f = await createFixture(t)
  await f.feature.refresh({ syncCatalogs: false })
  const oldAdapter = f.lastRender().props.adapter
  const oldWrite = oldAdapter.onShiftCreate({
    shift: {
      assigneeIds: ['person-org-a'],
      date: '2026-09-07',
      endTime: '12:00',
      locationId: 'location-a',
      startTime: '08:00',
      title: 'Old session',
      version: 0,
    },
  })
  await waitFor(() => f.shiftCalls.length === 1, 'old session write')

  f.session.activeOrgId = 'org-b'
  f.feature.resetSession()
  await f.feature.refresh({ syncCatalogs: false })
  const currentAdapter = f.lastRender().props.adapter
  const currentWrite = currentAdapter.onShiftCreate({
    shift: {
      assigneeIds: ['person-org-b'],
      date: '2026-09-07',
      endTime: '13:00',
      locationId: 'location-b',
      startTime: '09:00',
      title: 'Current session',
      version: 0,
    },
  })
  await waitFor(() => f.shiftCalls.length === 2, 'current session write')

  f.shiftCalls[0].pending.resolve({
    shift: { revision: 1, shiftId: 'shift-org-a', version: 1 },
  })
  assert.equal(await oldWrite, false)

  await assert.rejects(
    currentAdapter.onShiftCreate({ shift: {} }),
    { code: 'WORKFORCE_SCHEDULE_WRITE_IN_PROGRESS' },
  )

  f.shiftCalls[1].pending.resolve({
    shift: { revision: 1, shiftId: 'shift-org-b', version: 1 },
  })
  const saved = await currentWrite
  assert.equal(saved.shiftId, 'shift-org-b')
  assert.equal(f.shiftCalls[0].orgId, 'org-a')
  assert.equal(f.shiftCalls[1].orgId, 'org-b')

  await waitFor(() => f.fetchCalls.filter((orgId) => orgId === 'org-b').length >= 2, 'current session refresh')
  assert.equal(f.lastRender().props.snapshot.users[0].id, 'person-org-b')
})

test('COPY_WEEK ignoruje receipt starej organizacji i nie zwalnia blokady bieżącej operacji', async (t) => {
  const f = await createFixture(t)
  await f.feature.refresh({ syncCatalogs: false })
  const sourceFor = (orgId, date, version) => ({
    date,
    id: `shift-${orgId}`,
    revision: 1,
    shiftId: `shift-${orgId}`,
    version,
  })
  const receiptFor = (orgId, source, sourceFrom, targetFrom, targetTo) => ({
    copy: {
      orgId,
      sourceFrom,
      sourceTo: sourceFrom === '2026-09-07' ? '2026-09-13' : '2026-09-20',
      targetFrom,
      targetTo,
      createdCount: 1,
      created: [{
        sourceShiftId: source.shiftId,
        shiftId: `copy-${orgId}`,
        date: targetFrom,
        revision: 1,
        version: 1,
      }],
    },
  })

  const oldSource = sourceFor('org-a', '2026-09-07', 3)
  const oldWrite = f.lastRender().props.adapter.onWeekCopy({
    sourceShifts: [oldSource],
    sourceWeekStart: '2026-09-07',
  })
  await waitFor(() => f.copyCalls.length === 1, 'old organization week copy')

  f.session.activeOrgId = 'org-b'
  f.feature.resetSession()
  await f.feature.refresh({ syncCatalogs: false })
  const currentAdapter = f.lastRender().props.adapter
  const currentSource = sourceFor('org-b', '2026-09-14', 5)
  const currentWrite = currentAdapter.onWeekCopy({
    sourceShifts: [currentSource],
    sourceWeekStart: '2026-09-14',
  })
  await waitFor(() => f.copyCalls.length === 2, 'current organization week copy')

  f.copyCalls[0].pending.resolve(receiptFor(
    'org-a', oldSource, '2026-09-07', '2026-09-14', '2026-09-20',
  ))
  assert.equal(await oldWrite, false)
  await assert.rejects(
    currentAdapter.onWeekCopy({ sourceShifts: [currentSource], sourceWeekStart: '2026-09-14' }),
    { code: 'WORKFORCE_SCHEDULE_WRITE_IN_PROGRESS' },
  )

  f.copyCalls[1].pending.resolve(receiptFor(
    'org-b', currentSource, '2026-09-14', '2026-09-21', '2026-09-27',
  ))
  const saved = await currentWrite

  assert.equal(saved.orgId, 'org-b')
  assert.equal(saved.targetFrom, '2026-09-21')
  assert.equal(f.copyCalls[0].orgId, 'org-a')
  assert.equal(f.copyCalls[1].orgId, 'org-b')
  assert.deepEqual(f.copyCalls[1].payload, {
    sourceWeekStart: '2026-09-14',
    expectedVersions: [{ shiftId: 'shift-org-b', version: 5 }],
  })
  assert.match(f.copyCalls[1].options.idempotencyKey, /^ws-/)
  await waitFor(() => f.fetchCalls.filter((orgId) => orgId === 'org-b').length >= 2, 'current organization refresh')
  assert.equal(f.lastRender().props.snapshot.users[0].id, 'person-org-b')
})

test('COPY_WEEK ponawia niezweryfikowane potwierdzenie z tym samym kluczem idempotencji', async (t) => {
  const f = await createFixture(t)
  await f.feature.refresh({ syncCatalogs: false })
  const source = {
    date: '2026-09-07',
    id: 'shift-org-a',
    revision: 1,
    shiftId: 'shift-org-a',
    version: 3,
  }
  const copy = () => f.lastRender().props.adapter.onWeekCopy({
    sourceShifts: [source],
    sourceWeekStart: '2026-09-07',
  })

  const firstWrite = copy()
  await waitFor(() => f.copyCalls.length === 1, 'first week copy')
  f.copyCalls[0].pending.resolve({ copy: { createdCount: 1 } })
  await assert.rejects(firstWrite, { code: 'WORKFORCE_SCHEDULE_INVALID_COPY_RESPONSE' })
  await waitFor(() => f.fetchCalls.length >= 2, 'refresh after unverified receipt')

  const retryWrite = copy()
  await waitFor(() => f.copyCalls.length === 2, 'retried week copy')
  assert.equal(
    f.copyCalls[1].options.idempotencyKey,
    f.copyCalls[0].options.idempotencyKey,
  )
  f.copyCalls[1].pending.resolve({
    copy: {
      orgId: 'org-a',
      sourceFrom: '2026-09-07',
      sourceTo: '2026-09-13',
      targetFrom: '2026-09-14',
      targetTo: '2026-09-20',
      createdCount: 1,
      created: [{
        sourceShiftId: source.shiftId,
        shiftId: 'copy-org-a',
        date: '2026-09-14',
        revision: 1,
        version: 1,
      }],
    },
  })
  const saved = await retryWrite
  assert.equal(saved.created[0].shiftId, 'copy-org-a')
})

test('OWNER może świadomie wymusić kolejne synchronizacje z nowym kluczem, a COORDINATOR pozostaje read-only', async (t) => {
  const f = await createFixture(t)
  await f.feature.refresh()

  assert.equal(f.lastRender().props.catalogRefreshEnabled, true)
  assert.equal(f.lastRender().props.editingEnabled, true)
  assert.equal(f.lastRender().props.settingsEnabled, true)
  assert.equal(f.syncCalls.length, 0)
  await f.lastRender().props.onCatalogRefresh()
  await f.lastRender().props.onCatalogRefresh()

  assert.equal(f.syncCalls.length, 2)
  assert.notEqual(f.syncCalls[0].options.idempotencyKey, f.syncCalls[1].options.idempotencyKey)
  assert.equal(f.lastRender().props.catalogSyncSummary.people.active, 0)
  assert.equal(f.lastRender().props.catalogSyncSummary.locations.active, 0)
  assert.match(f.lastRender().props.catalogSyncSummary.lastSyncedAt, /^\d{4}-\d{2}-\d{2}T/)

  f.session.roleCode = 'COORDINATOR'
  f.feature.resetSession()
  await f.feature.refresh({ syncCatalogs: false })

  assert.equal(f.lastRender().props.catalogRefreshEnabled, false)
  assert.equal(f.lastRender().props.editingEnabled, false)
  assert.equal(f.lastRender().props.settingsEnabled, false)
})

test('OWNER zapisuje rzeczywiste ustawienia z bieżącą wersją i otrzymuje potwierdzony stan', async (t) => {
  const f = await createFixture(t)
  await f.feature.refresh({ syncCatalogs: false })

  const write = f.lastRender().props.adapter.onSettingsSave({
    settings: { expectedVersion: 1, timeZone: 'Europe/Warsaw', weeklyLimitMinutes: 2250 },
  })
  await waitFor(() => f.configureCalls.length === 1, 'settings update request')
  assert.deepEqual(f.configureCalls[0].configuration, {
    expectedVersion: 1,
    timeZone: 'Europe/Warsaw',
    weeklyLimitMinutes: 2250,
  })
  assert.match(f.configureCalls[0].options.idempotencyKey, /^ws-/)

  f.configureCalls[0].pending.resolve({
    settings: {
      orgId: 'org-a',
      timeZone: 'Europe/Warsaw',
      version: 2,
      weeklyLimitMinutes: 2250,
    },
  })
  const saved = await write

  assert.equal(saved.orgId, 'org-a')
  assert.equal(saved.version, 2)
  assert.equal(saved.weeklyLimitMinutes, 2250)
  assert.equal(f.lastRender().props.scheduleSettings.version, 2)
  assert.equal(f.lastRender().props.weeklyLimitMinutes, 2250)
})

test('zapis ustawień bez wersji okna jest blokowany przed wywołaniem backendu', async (t) => {
  const f = await createFixture(t)
  await f.feature.refresh({ syncCatalogs: false })
  const fetchesBeforeWrite = f.fetchCalls.length

  await assert.rejects(
    f.lastRender().props.adapter.onSettingsSave({
      settings: { timeZone: 'Europe/Warsaw', weeklyLimitMinutes: 2250 },
    }),
    { code: 'WORKFORCE_SCHEDULE_INVALID_SETTINGS_REQUEST' },
  )
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(f.configureCalls.length, 0)
  assert.equal(f.fetchCalls.length, fetchesBeforeWrite)
})

test('wynik zapisu ustawień ze starej organizacji nie zmienia bieżącego widoku', async (t) => {
  const f = await createFixture(t)
  await f.feature.refresh({ syncCatalogs: false })
  const oldWrite = f.lastRender().props.adapter.onSettingsSave({
    settings: { expectedVersion: 1, timeZone: 'Europe/Warsaw', weeklyLimitMinutes: 2100 },
  })
  await waitFor(() => f.configureCalls.length === 1, 'old settings request')

  f.session.activeOrgId = 'org-b'
  f.feature.resetSession()
  await f.feature.refresh({ syncCatalogs: false })
  f.configureCalls[0].pending.resolve({
    settings: {
      orgId: 'org-a',
      timeZone: 'Europe/Warsaw',
      version: 2,
      weeklyLimitMinutes: 2100,
    },
  })

  assert.equal(await oldWrite, false)
  assert.equal(f.lastRender().props.scheduleSettings.orgId, 'org-b')
  assert.equal(f.lastRender().props.scheduleSettings.weeklyLimitMinutes, 2400)
})

test('niepełne potwierdzenie ustawień jest odrzucane i nie nadpisuje stanu', async (t) => {
  const f = await createFixture(t)
  await f.feature.refresh({ syncCatalogs: false })
  const write = f.lastRender().props.adapter.onSettingsSave({
    settings: { expectedVersion: 1, timeZone: 'Europe/Warsaw', weeklyLimitMinutes: 2250 },
  })
  await waitFor(() => f.configureCalls.length === 1, 'invalid settings receipt request')
  f.configureCalls[0].pending.resolve({
    settings: {
      orgId: 'org-a',
      timeZone: 'Europe/Warsaw',
      version: 1,
      weeklyLimitMinutes: 2250,
    },
  })

  await assert.rejects(write, { code: 'WORKFORCE_SCHEDULE_INVALID_SETTINGS_RESPONSE' })
  assert.equal(f.lastRender().props.scheduleSettings.version, 1)
  assert.equal(f.lastRender().props.scheduleSettings.weeklyLimitMinutes, 2400)
})

test('błąd ręcznej synchronizacji nie nadpisuje ostatniego sukcesu i przekazuje tylko bezpieczne konflikty', async (t) => {
  const f = await createFixture(t)
  await f.feature.refresh({ syncCatalogs: false })
  await f.lastRender().props.onCatalogRefresh()
  const previousSummary = f.lastRender().props.catalogSyncSummary

  f.service.syncWorkforceScheduleCatalogs = async () => {
    const error = new Error('Nie można wyłączyć używanego obiektu.')
    error.code = 'WORKFORCE_SCHEDULE_OBJECT_IN_USE'
    error.details = {
      affected: [{ locationId: 'location-a', shiftId: 'shift-1', date: '2026-09-08', secret: 'ukryte' }],
      hasMore: false,
    }
    throw error
  }
  const refreshed = await f.lastRender().props.onCatalogRefresh()

  assert.equal(refreshed, false)
  assert.deepEqual(f.lastRender().props.catalogSyncSummary, previousSummary)
  assert.deepEqual(f.lastRender().props.catalogSyncConflicts[0].affected, {
    locationId: 'location-a',
    shiftId: 'shift-1',
    date: '2026-09-08',
  })
  assert.doesNotMatch(JSON.stringify(f.lastRender().props.catalogSyncConflicts), /ukryte/)
})

test('receipt synchronizacji pozostaje po bootstrapie z tym samym czasem', async (t) => {
  const f = await createFixture(t)
  await f.feature.refresh({ syncCatalogs: false })
  const synchronizedAt = '2026-09-07T10:15:30.000Z'
  f.service.syncWorkforceScheduleCatalogs = async (orgId, payload, options) => {
    f.syncCalls.push({ orgId, payload, options })
    return {
      effects: { delivery: false, downstream: false, notifications: false },
      idempotent: false,
      locations: [],
      ok: true,
      orgId,
      people: [],
      receipt: {
        version: 1,
        orgId,
        synchronizedAt,
        people: { active: 7, created: 2, updated: 3, deactivated: 1 },
        locations: { active: 4, created: 1, updated: 2, deactivated: 0 },
        effects: { delivery: false, notifications: false, downstream: false },
      },
    }
  }
  f.service.fetchWorkforceScheduleBootstrap = async (orgId) => bootstrap({
    catalogSync: {
      lastSyncedAt: synchronizedAt,
      people: { active: 7, inactive: 1 },
      locations: { active: 4, inactive: 0 },
    },
    locations: [{ locationId: `location-${orgId.replace(/^org-/, '')}`, name: `Location ${orgId}`, status: 'ACTIVE' }],
    people: [{ displayName: `User ${orgId}`, personId: `person-${orgId}`, status: 'ACTIVE' }],
  })

  assert.equal(await f.lastRender().props.onCatalogRefresh(), true)
  assert.deepEqual(f.lastRender().props.catalogSyncSummary, {
    lastSyncedAt: synchronizedAt,
    source: 'receipt',
    people: { active: 7, created: 2, updated: 3, deactivated: 1 },
    locations: { active: 4, created: 1, updated: 2, deactivated: 0 },
  })
})

test('nowy receipt jest ujawniany dopiero po udanym bootstrapie, a błąd zachowuje poprzedni widok', async (t) => {
  const f = await createFixture(t)
  await f.feature.refresh({ syncCatalogs: false })
  await f.lastRender().props.onCatalogRefresh()
  const previousSummary = f.lastRender().props.catalogSyncSummary
  const previousSnapshot = f.lastRender().props.snapshot
  const synchronizedAt = '2026-09-07T12:30:00.000Z'
  f.service.syncWorkforceScheduleCatalogs = async (orgId) => ({
    effects: { delivery: false, downstream: false, notifications: false },
    idempotent: false,
    locations: [],
    ok: true,
    orgId,
    people: [],
    receipt: {
      version: 1,
      orgId,
      synchronizedAt,
      people: { active: 9, created: 2, updated: 1, deactivated: 0 },
      locations: { active: 5, created: 1, updated: 0, deactivated: 0 },
      effects: { delivery: false, notifications: false, downstream: false },
    },
  })
  f.service.fetchWorkforceScheduleBootstrap = async () => {
    throw new Error('bootstrap unavailable')
  }

  assert.equal(await f.lastRender().props.onCatalogRefresh(), false)
  assert.deepEqual(f.lastRender().props.catalogSyncSummary, previousSummary)
  assert.equal(f.lastRender().props.snapshot, previousSnapshot)
  assert.equal(f.lastRender().props.catalogSyncStale, true)
  assert.match(f.lastRender().props.catalogSyncError, /Wyświetlane dane mogą być nieaktualne/)
  assert.notEqual(f.lastRender().props.catalogSyncSummary.lastSyncedAt, synchronizedAt)
  assert.equal(f.notices.at(-1).tone, 'error')
})

test('konflikt strukturalny bez mutacji nie uruchamia odświeżenia', async (t) => {
  const f = await createFixture(t)
  await f.feature.refresh({ syncCatalogs: false })
  const fetchesBeforePublication = f.fetchCalls.length
  f.service.publishWorkforceSchedule = async () => {
    const error = new Error('Grafik zawiera konflikt strukturalny.')
    error.code = 'WORKFORCE_SCHEDULE_PUBLICATION_BLOCKED'
    error.details = {
      blocking: [{ type: 'OVERLAP', affected: { personId: 'person-org-a', shiftId: 'shift-1', date: '2026-09-07' } }],
    }
    throw error
  }

  await assert.rejects(
    f.lastRender().props.adapter.onSchedulePublish({
      changes: [{
        assigneeIds: ['person-org-a'],
        date: '2026-09-07',
        endTime: '12:00',
        id: 'shift-1',
        locationId: 'location-a',
        publishedRevision: 1,
        revision: 2,
        shiftId: 'shift-1',
        startTime: '08:00',
        version: 1,
      }],
    }),
    { code: 'WORKFORCE_SCHEDULE_PUBLICATION_BLOCKED' },
  )
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(f.fetchCalls.length, fetchesBeforePublication)
})
