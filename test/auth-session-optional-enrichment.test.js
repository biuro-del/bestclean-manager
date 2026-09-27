const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const serverSource = fs.readFileSync(path.join(root, 'index.js'), 'utf8')

function sourceBetween(startMarker, endMarker) {
  const start = serverSource.indexOf(startMarker)
  const end = serverSource.indexOf(endMarker, start + startMarker.length)
  assert.ok(start >= 0, `Brak poczatku: ${startMarker}`)
  assert.ok(end > start, `Brak konca: ${endMarker}`)
  return serverSource.slice(start, end)
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

test('sprawdzenie opcjonalnej relacji wymaga istnienia tabeli i SELECT dla biezacej roli', async () => {
  const existsSource = sourceBetween(
    'async function databaseRelationExists',
    'async function databaseRelationReadable',
  )
  const readableSource = sourceBetween(
    'async function databaseRelationReadable',
    'async function databaseColumnExists',
  )
  const load = new Function(
    'normalizeText',
    `${existsSource}\n${readableSource}\nreturn databaseRelationReadable`,
  )
  const databaseRelationReadable = load(normalizeText)
  const queries = []
  const client = {
    async query(sql, params) {
      queries.push({ sql, params })
      if (sql.includes('to_regclass')) {
        return { rows: [{ relation_name: 'service_object' }] }
      }
      if (sql.includes('has_table_privilege')) {
        return { rows: [{ can_select: false }] }
      }
      throw new Error(`Nieoczekiwane SQL: ${sql}`)
    },
  }

  assert.equal(await databaseRelationReadable(client, 'public.service_object'), false)
  assert.equal(queries.length, 2)
  assert.match(queries[1].sql, /has_table_privilege/)
  assert.deepEqual(queries[1].params, ['public.service_object'])
})

test('plan PRO nie odczytuje service_object bez SELECT i nadal zwraca licznik pracownikow', async () => {
  const existsSource = sourceBetween(
    'async function databaseRelationExists',
    'async function databaseRelationReadable',
  )
  const readableSource = sourceBetween(
    'async function databaseRelationReadable',
    'async function databaseColumnExists',
  )
  const numericSource = sourceBetween('function numericCount', 'async function buildPlanUsage')
  const usageSource = sourceBetween('async function buildPlanUsage', 'async function findExistingWorker')
  const load = new Function(
    'normalizeText',
    'normalizeOrgId',
    'normalizePlanCode',
    'calculateMeteredOverage',
    `${existsSource}\n${readableSource}\n${numericSource}\n${usageSource}\nreturn buildPlanUsage`,
  )
  const calculateMeteredOverage = (usedValue, includedValue) => {
    const used = Number(usedValue) || 0
    const included = Number(includedValue) || 0
    return { used, included, overage: Math.max(0, used - included) }
  }
  const buildPlanUsage = load(
    normalizeText,
    (value) => normalizeText(value).toLowerCase(),
    (value) => normalizeText(value).toUpperCase(),
    calculateMeteredOverage,
  )
  const queries = []
  const client = {
    async query(sql) {
      queries.push(sql)
      if (sql.includes('from public.worker')) {
        return { rows: [{ used: 7 }] }
      }
      if (sql.includes('to_regclass')) {
        return { rows: [{ relation_name: 'service_object' }] }
      }
      if (sql.includes('has_table_privilege')) {
        return { rows: [{ can_select: false }] }
      }
      if (sql.includes('from public.service_object')) {
        throw Object.assign(new Error('permission denied'), { code: '42501' })
      }
      throw new Error(`Nieoczekiwane SQL: ${sql}`)
    },
  }

  const usage = await buildPlanUsage(client, 'bestclean', 'PRO', {
    includedWorkerSlots: 10,
    includedProObjects: 3,
    includedZonesPerProObject: 5,
  })

  assert.deepEqual(usage.workerSlots, { used: 7, included: 10, overage: 0 })
  assert.equal(usage.proObjects.used, 0)
  assert.equal(queries.some((sql) => sql.includes('from public.service_object')), false)
})

test('brak ACL w opcjonalnym liczniku nie blokuje gotowego kontekstu logowania', async () => {
  const sessionSource = sourceBetween(
    'async function buildOrganizationSessionContext',
    'function numericCount',
  )
  const load = new Function(
    'databaseRelationReadable',
    'buildSessionContext',
    'isWorkforceScheduleOrganizationEnabled',
    'buildPlanUsage',
    'normalizeText',
    `${sessionSource}\nreturn buildOrganizationSessionContext`,
  )
  const permissionDenied = Object.assign(new Error('permission denied for table service_object'), {
    code: '42501',
  })
  const buildOrganizationSessionContext = load(
    async () => false,
    () => ({
      planCode: 'PRO',
      limits: {},
      capabilities: { workforceScheduling: true },
    }),
    () => true,
    async () => { throw permissionDenied },
    normalizeText,
  )

  const context = await buildOrganizationSessionContext({}, 'uid-1', { org_id: 'bestclean' })
  assert.equal(context.planCode, 'PRO')
  assert.equal(context.capabilities.workforceScheduling, true)
  assert.deepEqual(context.usage, {})
})

test('niepowiazany blad bazy nadal blokuje kontekst zamiast zostac ukryty', async () => {
  const sessionSource = sourceBetween(
    'async function buildOrganizationSessionContext',
    'function numericCount',
  )
  const load = new Function(
    'databaseRelationReadable',
    'buildSessionContext',
    'isWorkforceScheduleOrganizationEnabled',
    'buildPlanUsage',
    'normalizeText',
    `${sessionSource}\nreturn buildOrganizationSessionContext`,
  )
  const connectionFailure = Object.assign(new Error('connection reset'), { code: '08006' })
  const buildOrganizationSessionContext = load(
    async () => false,
    () => ({ planCode: 'PRO', limits: {}, capabilities: {} }),
    () => true,
    async () => { throw connectionFailure },
    normalizeText,
  )

  await assert.rejects(
    () => buildOrganizationSessionContext({}, 'uid-1', { org_id: 'bestclean' }),
    (error) => error === connectionFailure,
  )
})
