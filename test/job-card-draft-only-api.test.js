'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const backend = fs.readFileSync(path.join(repoRoot, 'index.js'), 'utf8')
const repository = fs.readFileSync(path.join(repoRoot, 'job-card', 'repository.js'), 'utf8')
const migration = fs.readFileSync(
  path.join(repoRoot, 'dataconnect', 'migrations', '20260728_job_card_publication_additive.sql'),
  'utf8',
)

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start + startMarker.length)
  assert.notEqual(start, -1, `Missing start marker: ${startMarker}`)
  assert.notEqual(end, -1, `Missing end marker: ${endMarker}`)
  return source.slice(start, end)
}

test('istniejący schemat pozwala utrwalić szkic bez rekordu task', () => {
  const draftTable = section(
    migration,
    'create table if not exists public.job_card_draft',
    'create table if not exists public.job_card_revision',
  )
  assert.match(draftTable, /primary key \(org_id, source_order_id\)/)
  assert.doesNotMatch(draftTable, /references\s+public\.task/i)
})

test('dedykowany endpoint zapisuje wyłącznie odłączony szkic', () => {
  assert.match(backend, /PORTAL_JOB_CARD_DRAFTS_PATH = '\/api\/portal\/job-card-drafts'/)
  assert.match(backend, /requestUrl\.pathname === PORTAL_JOB_CARD_DRAFTS_PATH/)
  const handler = section(
    backend,
    'async function handlePortalJobCardDraftsRequest',
    'async function handlePortalJobCardsRequest',
  )
  assert.match(handler, /repository\.saveDetachedDraft\(/)
  assert.match(handler, /persistenceMode:\s*'DRAFT_ONLY'/)
  assert.match(handler, /materialized:\s*false/)
  assert.doesNotMatch(handler, /upsertPortalScheduleOrderTask\(/)
  assert.doesNotMatch(handler, /insertPortalScheduleOrderTaskOnce\(/)
  assert.doesNotMatch(handler, /ensurePortalScheduleOrderTable\(/)
})

test('szkic i publikacja wymagają aktywnego członkostwa bez dodatkowej bramki roli', () => {
  const draftHandler = section(
    backend,
    'async function handlePortalJobCardDraftsRequest',
    'async function handlePortalJobCardsRequest',
  )
  const publicationHandler = section(
    backend,
    'async function handlePortalJobCardsRequest',
    'function shouldUseLocalPortalTaskFileStorage',
  )
  assert.match(draftHandler, /repository\.assertActiveOrganizationMember/)
  assert.match(publicationHandler, /repository\.assertActiveOrganizationMember/)
  assert.doesNotMatch(draftHandler, /requirePortalScheduleOrderAccess/)
  assert.doesNotMatch(publicationHandler, /requirePortalScheduleOrderAccess/)
})

test('publikacja waliduje i potwierdza ostrzeżenia przed materializacją', () => {
  const publication = section(
    repository,
    'async publishStoredDraft',
    '\n}\n\nmodule.exports',
  )
  const validationAt = publication.indexOf('const validation = validateJobCardDraft')
  const acknowledgementsAt = publication.indexOf('const warningState = normalizeWarningAcknowledgements')
  const materializationAt = publication.indexOf('await materializeOrder')
  assert.ok(validationAt >= 0 && validationAt < materializationAt)
  assert.ok(acknowledgementsAt >= 0 && acknowledgementsAt < materializationAt)
  assert.ok(publication.indexOf("await this.client.query('begin')") < materializationAt)
  assert.ok(publication.indexOf("await this.client.query('commit')") > materializationAt)
})

test('materializacja tworzy jeden aktywny rekord bez nadpisywania istniejącego', () => {
  const insertOnce = section(
    backend,
    'async function insertPortalScheduleOrderTaskOnce',
    'function shouldUseLocalPortalScheduleOrderFileStorage',
  )
  assert.match(insertOnce, /insert into public\.task/)
  assert.match(insertOnce, /on conflict \(org_id, id_task\) do nothing/)
  assert.match(insertOnce, /returning id_task/)
  assert.doesNotMatch(insertOnce, /do update/i)

  const jobCardHandler = section(
    backend,
    'async function handlePortalJobCardsRequest',
    'function shouldUseLocalPortalTaskFileStorage',
  )
  assert.match(jobCardHandler, /materializeOrder:\s*async/)
  assert.match(jobCardHandler, /lifecycleStatus:\s*'ACTIVE'/)
  assert.match(jobCardHandler, /hashtext\('portal_schedule_orders'\)/)
  assert.match(jobCardHandler, /insertPortalScheduleOrderTaskOnce\(client, dbRow\)/)
})

test('GET listuje robocze zlecenia i pobiera detail do wznowienia bez materializacji', () => {
  const handler = section(
    backend,
    'async function handlePortalJobCardDraftsRequest',
    'async function handlePortalJobCardsRequest',
  )
  const route = section(
    backend,
    'if (requestUrl.pathname === PORTAL_JOB_CARD_DRAFTS_PATH)',
    'if (requestUrl.pathname === PORTAL_JOB_CARDS_PATH)',
  )

  assert.match(handler, /if \(method === 'GET'\)/)
  assert.match(handler, /requestUrl\.searchParams\.get\(['"]orgId['"]\)/)
  assert.match(handler, /requestUrl\.searchParams\.get\(['"]orderId['"]\)/)
  assert.match(handler, /requestUrl\.searchParams\.get\(['"]limit['"]\)/)
  assert.match(handler, /requestUrl\.searchParams\.get\(['"]cursor['"]\)/)
  assert.match(handler, /repository\.listDetachedDrafts\(\{[\s\S]*cursor[\s\S]*limit[\s\S]*orgId[\s\S]*\}\)/)
  assert.match(handler, /repository\.(?:readDetachedDraftForResume|readDetachedDraftDetail)\(\{[\s\S]*orgId[\s\S]*sourceOrderId[\s\S]*\}\)/)
  assert.match(handler, /materialized:\s*false/)
  assert.match(route, /handlePortalJobCardDraftsRequest\(req, res, requestUrl\)/)

  const getAt = handler.indexOf("method === 'GET'")
  const bodyAt = handler.indexOf('await readJsonBody(req)')
  assert.ok(getAt >= 0 && bodyAt > getAt, 'GET musi zostac obsluzony przed odczytem body POST')
})

test('GET szkicow stosuje domyslny limit 30 i przekazuje nieprzezroczysty kursor', () => {
  const handler = section(
    backend,
    'async function handlePortalJobCardDraftsRequest',
    'async function handlePortalJobCardsRequest',
  )
  const repositorySource = section(
    repository,
    'async listDetachedDrafts',
    'async readDetachedDraft',
  )

  assert.match(repository, /JOB_CARD_DRAFT_LIST_DEFAULT_LIMIT\s*=\s*30/)
  assert.match(repository, /JOB_CARD_DRAFT_LIST_MAX_LIMIT\s*=\s*100/)
  assert.match(repositorySource, /normalizedLimit \+ 1/)
  assert.match(repositorySource, /order by d\.updated_at desc, d\.source_order_id desc/)
  assert.match(repositorySource, /nextCursor/)
  assert.match(handler, /cursor/)
  assert.match(handler, /limit/)
})

test('POST zapisuje snapshotVersion 2 z pelnym editorDraft do dalszej edycji', () => {
  const handler = section(
    backend,
    'async function handlePortalJobCardDraftsRequest',
    'async function handlePortalJobCardsRequest',
  )

  assert.match(handler, /const editorDraft = body\?\.editorDraft/)
  assert.match(handler, /JOB_CARD_EDITOR_DRAFT_REQUIRED/)
  assert.match(handler, /sourceSnapshot:\s*\{[\s\S]*editorDraft[\s\S]*persistenceMode:\s*'DRAFT_ONLY'[\s\S]*snapshotVersion:\s*2[\s\S]*\}/)
  assert.doesNotMatch(handler, /snapshotVersion:\s*1/)
})

test('POST aktualizacji szkicu wymaga expectedDraftHash i zwraca konflikt zamiast nadpisania', () => {
  const handler = section(
    backend,
    'async function handlePortalJobCardDraftsRequest',
    'async function handlePortalJobCardsRequest',
  )
  const repositorySource = section(
    repository,
    'async assertDraftHash',
    'async saveDetachedDraft',
  )

  assert.match(handler, /const expectedDraftHash = normalizeText\(body\?\.expectedDraftHash\)/)
  assert.match(handler, /requestedOrderId && !expectedDraftHash/)
  assert.match(handler, /JOB_CARD_DRAFT_VERSION_REQUIRED/)
  assert.match(handler, /repository\.saveDetachedDraft\(\{[\s\S]*expectedDraftHash[\s\S]*\}\)/)
  assert.match(repositorySource, /select \*[\s\S]*from public\.job_card_draft[\s\S]*for update/)
  assert.match(repositorySource, /JOB_CARD_DRAFT_CHANGED/)
  assert.match(repositorySource, /409/)
})

test('listowanie i wznowienie szkicu wymagaja aktywnego czlonkostwa organizacji', () => {
  const handler = section(
    backend,
    'async function handlePortalJobCardDraftsRequest',
    'async function handlePortalJobCardsRequest',
  )
  const membershipAt = handler.indexOf('repository.assertActiveOrganizationMember')
  const listAt = handler.indexOf('repository.listDetachedDrafts')
  const detailAt = Math.max(
    handler.indexOf('repository.readDetachedDraftForResume'),
    handler.indexOf('repository.readDetachedDraftDetail'),
  )

  assert.ok(membershipAt >= 0 && listAt > membershipAt)
  assert.ok(detailAt > membershipAt)
  assert.doesNotMatch(handler, /requirePortalScheduleOrderAccess/)
})

test('snapshot szkicu zachowuje object_id i pola decyzji potrzebne do materializacji', () => {
  const columns = section(
    backend,
    'const PORTAL_SCHEDULE_ORDER_COLUMNS',
    'function portalScheduleOrderUniqueText',
  )
  const toDb = section(
    backend,
    'function portalScheduleOrderDbRow',
    'function portalScheduleOrderFromDbRow',
  )
  const fromDb = section(
    backend,
    'function portalScheduleOrderFromDbRow',
    'function sortPortalScheduleOrders',
  )

  assert.match(columns, /'object_id'/)
  assert.match(toDb, /object_id:\s*portalScheduleOrderNullableText\(order\.objectId \?\? order\.object_id \?\? order\.siteId/)
  assert.match(fromDb, /objectId:\s*portalScheduleOrderNullableText\(row\.object_id/)
  assert.match(fromDb, /siteId:\s*portalScheduleOrderNullableText\(row\.object_id/)
  assert.match(fromDb, /staffingMode:\s*portalScheduleOrderNullableText\(servicePayload\?\.staffingMode/)
  assert.match(fromDb, /paymentMethod:\s*portalScheduleOrderNullableText\(servicePayload\?\.paymentMethod/)
  assert.match(fromDb, /pricingMode:\s*portalScheduleOrderNullableText\(servicePayload\?\.pricingMode/)
  assert.match(fromDb, /contractId:\s*portalScheduleOrderNullableText\(servicePayload\?\.contractId/)
})

test('POST i publikacja v2 waliduja korelacje trzech reprezentacji przed zapisem lub materializacja', () => {
  const handler = section(
    backend,
    'async function handlePortalJobCardDraftsRequest',
    'async function handlePortalJobCardsRequest',
  )
  const publication = section(
    repository,
    'async publishStoredDraft',
    '\n}\n\nmodule.exports',
  )

  const saveCorrelationAt = handler.indexOf('validateDetachedDraftCorrelation')
  const saveAt = handler.indexOf('repository.saveDetachedDraft')
  assert.ok(saveCorrelationAt >= 0 && saveCorrelationAt < saveAt)
  assert.match(handler, /JOB_CARD_DRAFT_CORRELATION_INVALID/)

  const publishCorrelationAt = publication.indexOf('validateDetachedDraftCorrelation')
  const materializationAt = publication.indexOf('await materializeOrder')
  assert.ok(publishCorrelationAt >= 0 && publishCorrelationAt < materializationAt)
  assert.match(publication, /snapshotVersion >= 2/)
  assert.match(publication, /JOB_CARD_DRAFT_CORRELATION_INVALID/)
})
