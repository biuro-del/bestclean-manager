'use strict'

const { randomUUID } = require('node:crypto')

const {
  JOB_CARD_COMPILER_VERSION,
  JOB_CARD_CONTRACT_VERSION,
  JOB_CARD_SCHEMA_VERSION,
  buildMobileProjections,
  diffValues,
  generationStatus,
  jobCardContent,
  jobCardOutputHash,
  normalizeWarningAcknowledgements,
  sha256,
  validateJobCardDraft,
} = require('./domain')
const { validateDetachedDraftCorrelation } = require('./correlation')

function requiredText(value, fieldName) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new TypeError(`${fieldName} is required`)
  return normalized
}

function json(value) {
  return JSON.stringify(value ?? null)
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function publicError(code, message, statusCode = 400, details = null) {
  const error = new Error(code)
  error.publicCode = code
  error.publicMessage = message
  error.statusCode = statusCode
  error.details = details
  return error
}

const JOB_CARD_DRAFT_LIST_DEFAULT_LIMIT = 30
const JOB_CARD_DRAFT_LIST_MAX_LIMIT = 100

function normalizeDraftListLimit(value) {
  if (value === null || value === undefined || value === '') return JOB_CARD_DRAFT_LIST_DEFAULT_LIMIT
  const normalized = Number(value)
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > JOB_CARD_DRAFT_LIST_MAX_LIMIT) {
    throw publicError(
      'JOB_CARD_DRAFT_LIMIT_INVALID',
      `Limit listy szkiców musi być liczbą całkowitą od 1 do ${JOB_CARD_DRAFT_LIST_MAX_LIMIT}.`,
    )
  }
  return normalized
}

function isoTimestamp(value) {
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : ''
}

function decodeDraftListCursor(value) {
  const normalized = String(value ?? '').trim()
  if (!normalized) return null
  try {
    const decoded = JSON.parse(Buffer.from(normalized, 'base64url').toString('utf8'))
    const updatedAt = isoTimestamp(decoded?.updatedAt)
    const sourceOrderId = String(decoded?.sourceOrderId ?? '').trim()
    if (!updatedAt || !sourceOrderId || sourceOrderId.length > 180 || /[\u0000-\u001f\u007f]/.test(sourceOrderId)) {
      throw new Error('invalid cursor')
    }
    return { sourceOrderId, updatedAt }
  } catch {
    throw publicError('JOB_CARD_DRAFT_CURSOR_INVALID', 'Kursor listy szkiców jest niepoprawny.')
  }
}

function encodeDraftListCursor(row = {}) {
  const updatedAt = isoTimestamp(row.updated_at)
  const sourceOrderId = String(row.source_order_id ?? '').trim()
  if (!updatedAt || !sourceOrderId) return null
  return Buffer.from(JSON.stringify({ sourceOrderId, updatedAt }), 'utf8').toString('base64url')
}

function mapDraftListItem(row = {}) {
  if (!row?.source_order_id) return null
  return {
    client: {
      id: String(row.client_id ?? '').trim(),
      name: String(row.client_name ?? '').trim(),
    },
    createdAt: row.created_at,
    generationStatus: row.generation_status,
    materialized: false,
    orderId: row.source_order_id,
    schedule: {
      mode: String(row.schedule_mode ?? '').trim(),
      recurrenceUntilYmd: String(row.recurrence_until_ymd ?? '').trim(),
      startDateYmd: String(row.start_date_ymd ?? '').trim(),
    },
    site: {
      address: String(row.site_address ?? '').trim(),
      id: String(row.site_id ?? '').trim(),
      name: String(row.site_name ?? '').trim(),
    },
    staffing: {
      assignmentCount: Number(row.assignment_count || 0),
      mode: String(row.staffing_mode ?? '').trim(),
      requiredPeople: Math.max(1, Number(row.required_people || 1)),
    },
    title: String(row.title ?? '').trim() || 'Szkic zlecenia',
    updatedAt: row.updated_at,
    validation: {
      errorCount: Number(row.error_count || 0),
      warningCount: Number(row.warning_count || 0),
    },
  }
}

function firstObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
}

function firstArray(...values) {
  return values.find((value) => Array.isArray(value)) || []
}

function firstText(...values) {
  return values.map((value) => String(value ?? '').trim()).find(Boolean) || ''
}

function legacyDraftScheduleMode(value) {
  const normalized = String(value ?? '').trim().toUpperCase()
  return ['RECURRING', 'REPEAT', 'CYCLIC'].includes(normalized) ? 'RECURRING' : 'ONE_OFF'
}

function legacyEditorDraft({ payload = {}, sourceOrderId, sourceSnapshot = {} }) {
  const card = firstObject(payload)
  const order = firstObject(sourceSnapshot?.order)
  const customer = firstObject(card.customer)
  const site = firstObject(card.site)
  const schedule = firstObject(card.schedule)
  const service = firstObject(card.service)
  const fulfillment = firstObject(card.fulfillment)
  const resources = firstObject(card.resources)
  const commercial = firstObject(card.commercial)
  const serviceBlock = firstObject(firstArray(schedule.serviceBlocks, order.serviceBlocks)[0])
  const scopeItems = firstArray(service.scopeItems, order.objectPlanTasks, order.zoneTaskPlan)
  const assignments = firstArray(fulfillment.assignments, order.workerAssignments, order.workAllocations)
  const recurrenceUntil = firstText(
    order.repeatUntil,
    order.repeatEndDate,
    order.recurrenceEndDate,
    order.seriesEndDate,
    schedule.recurrenceUntilYmd,
  )
  const scheduleMode = legacyDraftScheduleMode(order.scheduleMode || order.scheduleType || order.type || schedule.mode)
  const staffingMode = firstText(order.staffingMode, order.assignmentMode, fulfillment.staffingMode).toUpperCase() ||
    (assignments.length ? 'FIXED' : 'BUFFER')
  const requiredPeople = Math.max(1, Number.parseInt(
    order.requiredPeople ?? order.requiredWorkers ?? serviceBlock.requiredPeople ?? assignments.length ?? 1,
    10,
  ) || 1)
  const zoneIds = [...new Set(scopeItems.map((item) => firstText(item?.zoneId, item?.id)).filter(Boolean))]
  const tasks = scopeItems.map((item, index) => ({
    id: firstText(item?.id, item?.taskId, `task-${index + 1}`),
    zoneId: firstText(item?.zoneId, item?.idZone),
    title: firstText(item?.title, item?.name, item?.taskName, item?.description),
    instruction: firstText(item?.instruction, item?.instructions, item?.comment, item?.note),
    expectedResult: firstText(item?.expectedResult, item?.result),
  }))
  const workerIds = [...new Set(assignments.map((item) => firstText(
    item?.workerId,
    item?.workerLogin,
    item?.workerKey,
    item?.idWorker,
    item?.id,
  )).filter(Boolean))]
  const amount = Number(commercial.amount ?? order.price ?? order.amount)

  return {
    id: firstText(sourceOrderId, order.id, order.idTask),
    orderId: firstText(sourceOrderId, order.id, order.idTask),
    clientId: firstText(order.clientId, order.customerId, customer.customerId),
    clientLabel: firstText(order.clientLabel, order.clientName, order.customerName, customer.name),
    objectId: firstText(order.objectId, order.siteId, site.siteId, order.clientId),
    objectLabel: firstText(order.objectLabel, order.siteName, site.name, order.clientLabel, customer.name),
    address: firstText(
      order.executionAddressLabel,
      order.customAddressLabel,
      order.addressLabel,
      order.address,
      site.address,
    ),
    scheduleMode,
    siteMode: firstText(order.siteMode, site.mode) || 'FIXED_CONTRACT_SITE',
    dateStart: firstText(order.dateYmd, order.startDateYmd, schedule.startDateYmd, serviceBlock.dateYmd),
    startTime: firstText(order.startTime, serviceBlock.startTime),
    endTime: firstText(order.endTime, serviceBlock.endTime),
    recurrenceUntil,
    recurrenceUntilConfirmed: scheduleMode === 'ONE_OFF' || schedule.recurrenceHorizonConfirmed === true || Boolean(recurrenceUntil),
    weekdays: firstArray(order.repeatWeekdays, serviceBlock.weekdays),
    serviceName: firstText(order.title, order.name, service.title),
    serviceGoal: firstText(order.description, service.internalDescription),
    zoneIds,
    tasks,
    accessNotes: firstText(order.accessInstruction, order.entryInstruction, site.accessInstruction),
    accessConfirmedNone: order.accessInstructionConfirmedNone === true || site.accessInstructionConfirmedNone === true,
    safetyConfirmed: order.safetyInstructionConfirmedNone === true || service.safetyInstructionConfirmedNone === true || Boolean(firstText(order.safetyInstruction, service.safetyInstruction)),
    suppliesConfirmed: typeof order.packingRequired === 'boolean' || typeof resources.packingRequired === 'boolean',
    staffingMode,
    requiredPeople,
    workerIds,
    leaderId: firstText(order.leaderWorkerId, fulfillment.leaderWorkerId),
    driverId: firstText(order.driverWorkerId, fulfillment.driverWorkerId),
    dispatchRequired: typeof order.dispatchRequired === 'boolean' ? order.dispatchRequired : fulfillment.dispatchRequired,
    paymentMethod: firstText(order.paymentMethod, commercial.paymentMethod).toUpperCase(),
    pricingMode: firstText(order.pricingMode, commercial.pricingMode).toUpperCase(),
    amount: Number.isFinite(amount) && amount > 0 ? String(amount) : '',
    contractId: firstText(order.contractId, commercial.contractId),
    deferredDueDate: firstText(order.paymentDueDateYmd, order.dueDateYmd, commercial.paymentDueDateYmd),
    revision: Number.parseInt(order.revision, 10) || 0,
  }
}

function mapDraft(row = {}) {
  if (!row?.source_order_id) return null
  return {
    baseRevision: Number(row.base_revision || 0),
    compilerVersion: row.compiler_version,
    contractVersion: row.contract_version,
    draftHash: row.draft_hash,
    draftId: row.draft_id,
    generationStatus: row.generation_status,
    payload: parseJson(row.payload, {}),
    schemaVersion: row.schema_version,
    sourceHash: row.source_hash,
    sourceOrderId: row.source_order_id,
    updatedAt: row.updated_at,
    updatedByUid: row.updated_by_uid,
    validation: parseJson(row.validation, { errors: [], warnings: [] }),
  }
}

function mapRevision(row = {}) {
  if (!row?.source_order_id) return null
  return {
    compilerVersion: row.compiler_version,
    contractVersion: row.contract_version,
    diff: parseJson(row.diff, []),
    mobileProjection: parseJson(row.mobile_projection, {}),
    outputHash: row.output_hash,
    payload: parseJson(row.payload, {}),
    publishedAt: row.published_at,
    publishedByUid: row.published_by_uid,
    revision: Number(row.revision || 0),
    revisionId: row.revision_id,
    schemaVersion: row.schema_version,
    sourceHash: row.source_hash,
    sourceOrderId: row.source_order_id,
    warningAcknowledgements: parseJson(row.warning_acknowledgements, []),
    warnings: parseJson(row.warnings, []),
  }
}

class JobCardRepository {
  constructor(client) {
    if (!client || typeof client.query !== 'function') {
      throw new TypeError('A PostgreSQL client with query(sql, params) is required')
    }
    this.client = client
  }

  async assertSchemaReady() {
    const result = await this.client.query(
      `select
         to_regclass('public.job_card_draft') is not null as draft_ready,
         to_regclass('public.job_card_revision') is not null as revision_ready`,
    )
    if (result.rows[0]?.draft_ready !== true || result.rows[0]?.revision_ready !== true) {
      throw publicError(
        'JOB_CARD_SCHEMA_MISSING',
        'Brakuje addytywnej migracji Karty Zlecenia. Szkic nie został zapisany.',
        503,
      )
    }
  }

  async assertActiveOrganizationMember({ orgId, uid }) {
    const result = await this.client.query(
      `select m.org_id, m.uid, m.role
         from public.organization_member m
         join public.organizations o on o.org_id = m.org_id
        where m.org_id = $1
          and m.uid = $2
          and upper(coalesce(m.status, '')) = 'ACTIVE'
          and upper(coalesce(o.status, 'ACTIVE')) not in ('SUSPENDED', 'DELETED')
          and o.deleted_at is null
        limit 1`,
      [requiredText(orgId, 'orgId'), requiredText(uid, 'uid')],
    )
    if (!result.rows[0]) {
      throw publicError('ORG_ACCESS_MISSING', 'Brak aktywnego dostępu do tej organizacji.', 404)
    }
    return result.rows[0]
  }

  async assertOrderExists(orgId, sourceOrderId) {
    const row = await this.readOrderIdentity(orgId, sourceOrderId)
    if (!row) {
      throw publicError('TASK_NOT_FOUND', 'Nie znaleziono źródłowego zlecenia.', 404)
    }
    return row
  }

  async readOrderIdentity(orgId, sourceOrderId) {
    const result = await this.client.query(
      `select id_task
         from public.task
        where org_id = $1
          and id_task = $2
        limit 1`,
      [requiredText(orgId, 'orgId'), requiredText(sourceOrderId, 'sourceOrderId')],
    )
    return result.rows[0] || null
  }

  async assertDraftHash({ expectedDraftHash, orgId, sourceOrderId }) {
    await this.assertSchemaReady()
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedOrderId = requiredText(sourceOrderId, 'sourceOrderId')
    const normalizedExpectedHash = requiredText(expectedDraftHash, 'expectedDraftHash')
    const result = await this.client.query(
      `select *
         from public.job_card_draft
        where org_id = $1 and source_order_id = $2
        for update`,
      [normalizedOrgId, normalizedOrderId],
    )
    const currentDraft = mapDraft(result.rows[0])
    if (!currentDraft) {
      throw publicError('JOB_CARD_DRAFT_NOT_FOUND', 'Nie znaleziono szkicu do aktualizacji.', 404)
    }
    if (currentDraft.draftHash !== normalizedExpectedHash) {
      throw publicError(
        'JOB_CARD_DRAFT_CHANGED',
        'Robocze zlecenie zostało zmienione w innym oknie lub przez inną osobę. Odśwież je przed ponownym zapisem.',
        409,
      )
    }
    return currentDraft
  }

  async saveDetachedDraft(input = {}) {
    const snapshot = input?.sourceSnapshot
    if (
      !snapshot ||
      typeof snapshot !== 'object' ||
      Array.isArray(snapshot) ||
      String(snapshot.persistenceMode || '').trim().toUpperCase() !== 'DRAFT_ONLY' ||
      !snapshot.order ||
      typeof snapshot.order !== 'object' ||
      Array.isArray(snapshot.order)
    ) {
      throw publicError(
        'JOB_CARD_DRAFT_SOURCE_REQUIRED',
        'Szkic wymaga kompletnego snapshotu przyszłego zlecenia.',
      )
    }
    const expectedDraftHash = String(input?.expectedDraftHash ?? '').trim()
    if (expectedDraftHash) {
      await this.assertDraftHash({
        expectedDraftHash,
        orgId: input?.orgId,
        sourceOrderId: input?.sourceOrderId,
      })
    }
    return this.saveDraft({ ...input, allowDetachedDraft: true })
  }

  async saveDraft({ actorUid, allowDetachedDraft = false, card, orgId, sourceOrderId, sourceSnapshot }) {
    await this.assertSchemaReady()
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedOrderId = requiredText(sourceOrderId, 'sourceOrderId')
    const normalizedActorUid = requiredText(actorUid, 'actorUid')
    if (!card || typeof card !== 'object' || Array.isArray(card)) {
      throw publicError('JOB_CARD_DRAFT_REQUIRED', 'Brak kompletnego szkicu Karty Zlecenia.')
    }
    if (allowDetachedDraft) {
      const existingOrder = await this.readOrderIdentity(normalizedOrgId, normalizedOrderId)
      if (existingOrder) {
        throw publicError(
          'JOB_CARD_DRAFT_ALREADY_MATERIALIZED',
          'To zlecenie jest już aktywne. Edytuj je w liście zleceń.',
          409,
        )
      }
    } else {
      await this.assertOrderExists(normalizedOrgId, normalizedOrderId)
    }
    const validation = validateJobCardDraft(card)
    const draftHash = sha256(card)
    const sourceHash = sha256(sourceSnapshot ?? {})
    const result = await this.client.query(
      `insert into public.job_card_draft (
         org_id, source_order_id, draft_id, schema_version, compiler_version, contract_version,
         generation_status, source_hash, draft_hash, source_snapshot, payload, validation,
         base_revision, created_by_uid, updated_by_uid, created_at, updated_at
       )
       values (
         $1::varchar(64), $2::varchar(180), $3, $4, $5, $6,
         $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb,
         coalesce((
           select max(revision) from public.job_card_revision
            where org_id = $1::varchar(64) and source_order_id = $2::varchar(180)
         ), 0),
         $13, $13, now(), now()
       )
       on conflict (org_id, source_order_id) do update set
         draft_id = excluded.draft_id,
         schema_version = excluded.schema_version,
         compiler_version = excluded.compiler_version,
         contract_version = excluded.contract_version,
         generation_status = excluded.generation_status,
         source_hash = excluded.source_hash,
         draft_hash = excluded.draft_hash,
         source_snapshot = excluded.source_snapshot,
         payload = excluded.payload,
         validation = excluded.validation,
         base_revision = greatest(public.job_card_draft.base_revision, excluded.base_revision),
         updated_by_uid = excluded.updated_by_uid,
         updated_at = now()
       returning *`,
      [
        normalizedOrgId,
        normalizedOrderId,
        randomUUID(),
        JOB_CARD_SCHEMA_VERSION,
        JOB_CARD_COMPILER_VERSION,
        JOB_CARD_CONTRACT_VERSION,
        generationStatus(validation),
        sourceHash,
        draftHash,
        json(sourceSnapshot ?? {}),
        json(card),
        json(validation),
        normalizedActorUid,
      ],
    )
    return mapDraft(result.rows[0])
  }

  async readState({ orgId, sourceOrderId }) {
    await this.assertSchemaReady()
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedOrderId = requiredText(sourceOrderId, 'sourceOrderId')
    const [draftResult, revisionsResult] = await Promise.all([
      this.client.query(
        `select *
           from public.job_card_draft
          where org_id = $1 and source_order_id = $2`,
        [normalizedOrgId, normalizedOrderId],
      ),
      this.client.query(
        `select *
           from public.job_card_revision
          where org_id = $1 and source_order_id = $2
          order by revision desc`,
        [normalizedOrgId, normalizedOrderId],
      ),
    ])
    const revisions = revisionsResult.rows.map(mapRevision)
    return {
      draft: mapDraft(draftResult.rows[0]),
      latestRevision: revisions[0] || null,
      revisions,
    }
  }

  async listDetachedDrafts({ cursor = '', limit = JOB_CARD_DRAFT_LIST_DEFAULT_LIMIT, orgId }) {
    await this.assertSchemaReady()
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedLimit = normalizeDraftListLimit(limit)
    const decodedCursor = decodeDraftListCursor(cursor)
    const result = await this.client.query(
      `select
         d.source_order_id,
         d.generation_status,
         d.created_at,
         d.updated_at,
         coalesce(nullif(d.payload #>> '{service,title}', ''), nullif(d.source_snapshot #>> '{order,title}', '')) as title,
         d.payload #>> '{customer,customerId}' as client_id,
         d.payload #>> '{customer,name}' as client_name,
         d.payload #>> '{site,siteId}' as site_id,
         d.payload #>> '{site,name}' as site_name,
         d.payload #>> '{site,address}' as site_address,
         d.payload #>> '{schedule,mode}' as schedule_mode,
         d.payload #>> '{schedule,startDateYmd}' as start_date_ymd,
         d.payload #>> '{schedule,recurrenceUntilYmd}' as recurrence_until_ymd,
         d.payload #>> '{fulfillment,staffingMode}' as staffing_mode,
         case
           when jsonb_typeof(d.payload #> '{fulfillment,assignments}') = 'array'
             then jsonb_array_length(d.payload #> '{fulfillment,assignments}')
           else 0
         end as assignment_count,
         case
           when coalesce(d.source_snapshot #>> '{order,requiredPeople}', '') ~ '^[1-9][0-9]*$'
             then least((d.source_snapshot #>> '{order,requiredPeople}')::integer, 99)
           else 1
         end as required_people,
         case
           when jsonb_typeof(d.validation -> 'errors') = 'array'
             then jsonb_array_length(d.validation -> 'errors')
           else 0
         end as error_count,
         case
           when jsonb_typeof(d.validation -> 'warnings') = 'array'
             then jsonb_array_length(d.validation -> 'warnings')
           else 0
         end as warning_count
       from public.job_card_draft d
       where d.org_id = $1
         and d.source_snapshot ->> 'persistenceMode' = 'DRAFT_ONLY'
         and d.generation_status in ('BLOCKED', 'READY_WITH_WARNINGS', 'READY')
         and not exists (
           select 1
             from public.task t
            where t.org_id = d.org_id
              and t.id_task = d.source_order_id
         )
         and (
           $2::timestamptz is null
           or d.updated_at < $2::timestamptz
           or (d.updated_at = $2::timestamptz and d.source_order_id < $3::varchar)
         )
       order by d.updated_at desc, d.source_order_id desc
       limit $4`,
      [
        normalizedOrgId,
        decodedCursor?.updatedAt || null,
        decodedCursor?.sourceOrderId || null,
        normalizedLimit + 1,
      ],
    )
    const hasMore = result.rows.length > normalizedLimit
    const visibleRows = result.rows.slice(0, normalizedLimit)
    return {
      drafts: visibleRows.map(mapDraftListItem).filter(Boolean),
      page: {
        hasMore,
        limit: normalizedLimit,
        nextCursor: hasMore ? encodeDraftListCursor(visibleRows[visibleRows.length - 1]) : null,
      },
    }
  }

  async readDetachedDraftDetail({ orgId, sourceOrderId }) {
    await this.assertSchemaReady()
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedOrderId = requiredText(sourceOrderId, 'sourceOrderId')
    const result = await this.client.query(
      `select d.*
         from public.job_card_draft d
        where d.org_id = $1
          and d.source_order_id = $2
          and d.source_snapshot ->> 'persistenceMode' = 'DRAFT_ONLY'
          and d.generation_status in ('BLOCKED', 'READY_WITH_WARNINGS', 'READY')
          and not exists (
            select 1
              from public.task t
             where t.org_id = d.org_id
               and t.id_task = d.source_order_id
          )
        limit 1`,
      [normalizedOrgId, normalizedOrderId],
    )
    const row = result.rows[0]
    if (!row) {
      throw publicError('JOB_CARD_DRAFT_NOT_FOUND', 'Nie znaleziono roboczego zlecenia.', 404)
    }
    const sourceSnapshot = parseJson(row.source_snapshot, {})
    const snapshotVersion = Math.max(1, Number(sourceSnapshot?.snapshotVersion || 1))
    const editorDraft = sourceSnapshot?.editorDraft
    const legacyOrder = sourceSnapshot?.order
    const resumableDraft = editorDraft && typeof editorDraft === 'object' && !Array.isArray(editorDraft)
      ? editorDraft
      : legacyEditorDraft({
          payload: parseJson(row.payload, {}),
          sourceOrderId: normalizedOrderId,
          sourceSnapshot,
        })
    return {
      draft: mapDraft(row),
      editorDraft: resumableDraft,
      legacyOrder: snapshotVersion < 2 && legacyOrder && typeof legacyOrder === 'object' && !Array.isArray(legacyOrder)
        ? legacyOrder
        : null,
      materialized: false,
      orderId: normalizedOrderId,
      snapshotVersion,
    }
  }

  async readStatesForOrders({ orgId, sourceOrderIds = [] }) {
    await this.assertSchemaReady()
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const ids = [...new Set(
      (Array.isArray(sourceOrderIds) ? sourceOrderIds : [])
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    )]
    if (!ids.length) return new Map()
    const [draftsResult, latestResult] = await Promise.all([
      this.client.query(
        `select *
           from public.job_card_draft
          where org_id = $1
            and source_order_id = any($2::varchar[])`,
        [normalizedOrgId, ids],
      ),
      this.client.query(
        `select distinct on (source_order_id) *
           from public.job_card_revision
          where org_id = $1
            and source_order_id = any($2::varchar[])
          order by source_order_id, revision desc`,
        [normalizedOrgId, ids],
      ),
    ])
    const states = new Map(ids.map((id) => [id, { draft: null, latestRevision: null }]))
    draftsResult.rows.map(mapDraft).filter(Boolean).forEach((draft) => {
      states.set(draft.sourceOrderId, {
        ...(states.get(draft.sourceOrderId) || {}),
        draft,
      })
    })
    latestResult.rows.map(mapRevision).filter(Boolean).forEach((revision) => {
      states.set(revision.sourceOrderId, {
        ...(states.get(revision.sourceOrderId) || {}),
        latestRevision: revision,
      })
    })
    return states
  }

  async publishStoredDraft({
    acknowledgements = [],
    actorUid,
    expectedDraftHash,
    materializeOrder = null,
    orgId,
    sourceOrderId,
  }) {
    await this.assertSchemaReady()
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedOrderId = requiredText(sourceOrderId, 'sourceOrderId')
    const normalizedActorUid = requiredText(actorUid, 'actorUid')
    const normalizedExpectedHash = requiredText(expectedDraftHash, 'expectedDraftHash')
    await this.client.query('begin')
    try {
      await this.client.query(
        `select pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
        [normalizedOrgId, `job-card:${normalizedOrderId}`],
      )
      const draftResult = await this.client.query(
        `select *
           from public.job_card_draft
          where org_id = $1 and source_order_id = $2
          for update`,
        [normalizedOrgId, normalizedOrderId],
      )
      const draft = mapDraft(draftResult.rows[0])
      if (!draft) {
        throw publicError('JOB_CARD_DRAFT_NOT_FOUND', 'Najpierw zapisz szkic Karty Zlecenia.', 404)
      }
      if (draft.draftHash !== normalizedExpectedHash) {
        throw publicError(
          'JOB_CARD_DRAFT_CHANGED',
          'Szkic zmienił się przed publikacją. Odśwież podgląd i spróbuj ponownie.',
          409,
        )
      }
      const validation = validateJobCardDraft(draft.payload)
      if (!validation.valid) {
        throw publicError(
          'JOB_CARD_NOT_READY',
          'Karta Zlecenia zawiera braki blokujące publikację.',
          422,
          { errors: validation.errors },
        )
      }
      const warningState = normalizeWarningAcknowledgements(validation.warnings, acknowledgements)
      if (warningState.missing.length) {
        throw publicError(
          'JOB_CARD_WARNINGS_UNCONFIRMED',
          'Potwierdź osobno każde ostrzeżenie przed publikacją.',
          422,
          { missingWarningCodes: warningState.missing },
        )
      }

      const sourceSnapshot = parseJson(draftResult.rows[0]?.source_snapshot, {})
      const isDetachedDraft = String(sourceSnapshot?.persistenceMode || '').trim().toUpperCase() === 'DRAFT_ONLY'
      const snapshotVersion = Math.max(1, Number(sourceSnapshot?.snapshotVersion || 1))
      if (isDetachedDraft && snapshotVersion >= 2) {
        const correlation = validateDetachedDraftCorrelation({
          card: draft.payload,
          editorDraft: sourceSnapshot?.editorDraft,
          order: sourceSnapshot?.order,
          sourceOrderId: normalizedOrderId,
        })
        if (!correlation.valid) {
          throw publicError(
            'JOB_CARD_DRAFT_CORRELATION_INVALID',
            'Dane roboczego zlecenia są niespójne. Odśwież kreator i zapisz je ponownie.',
            422,
            { mismatches: correlation.mismatches },
          )
        }
      }
      const existingOrder = await this.readOrderIdentity(normalizedOrgId, normalizedOrderId)
      if (!existingOrder) {
        if (!isDetachedDraft || typeof materializeOrder !== 'function') {
          throw publicError('TASK_NOT_FOUND', 'Nie znaleziono źródłowego zlecenia.', 404)
        }
        await materializeOrder({
          actorUid: normalizedActorUid,
          card: draft.payload,
          client: this.client,
          orgId: normalizedOrgId,
          sourceOrderId: normalizedOrderId,
          sourceSnapshot,
        })
        await this.assertOrderExists(normalizedOrgId, normalizedOrderId)
      }

      const latestResult = await this.client.query(
        `select *
           from public.job_card_revision
          where org_id = $1 and source_order_id = $2
          order by revision desc
          limit 1`,
        [normalizedOrgId, normalizedOrderId],
      )
      const latest = mapRevision(latestResult.rows[0])
      if (isDetachedDraft && existingOrder && !latest) {
        throw publicError(
          'JOB_CARD_ORDER_ID_CONFLICT',
          'Identyfikator szkicu jest już zajęty przez inne zlecenie.',
          409,
        )
      }
      const outputHash = jobCardOutputHash(draft.payload)
      if (latest?.outputHash === outputHash) {
        await this.client.query('commit')
        return { idempotent: true, revision: latest }
      }

      const nextRevision = (latest?.revision || 0) + 1
      const revisionId = randomUUID()
      const publishedAt = new Date().toISOString()
      const publishedPayload = {
        ...draft.payload,
        publication: {
          publishedAt,
          publishedByUid: normalizedActorUid,
          revision: nextRevision,
          revisionId,
        },
        status: 'PUBLISHED',
      }
      const warningAcknowledgements = warningState.accepted.map((entry) => ({
        ...entry,
        acknowledgedAt: publishedAt,
        acknowledgedByUid: normalizedActorUid,
      }))
      const revisionResult = await this.client.query(
        `insert into public.job_card_revision (
           org_id, source_order_id, revision, revision_id,
           schema_version, compiler_version, contract_version,
           source_hash, output_hash, payload, mobile_projection, diff,
           warnings, warning_acknowledgements, published_by_uid, published_at
         )
         values (
           $1, $2, $3, $4,
           $5, $6, $7,
           $8, $9, $10::jsonb, $11::jsonb, $12::jsonb,
           $13::jsonb, $14::jsonb, $15, $16::timestamptz
         )
         returning *`,
        [
          normalizedOrgId,
          normalizedOrderId,
          nextRevision,
          revisionId,
          JOB_CARD_SCHEMA_VERSION,
          JOB_CARD_COMPILER_VERSION,
          JOB_CARD_CONTRACT_VERSION,
          draft.sourceHash,
          outputHash,
          json(publishedPayload),
          json(buildMobileProjections(publishedPayload)),
          json(diffValues(jobCardContent(latest?.payload ?? null), jobCardContent(draft.payload))),
          json(validation.warnings),
          json(warningAcknowledgements),
          normalizedActorUid,
          publishedAt,
        ],
      )
      await this.client.query(
        `update public.job_card_draft
            set generation_status = 'PUBLISHED',
                base_revision = $3,
                updated_by_uid = $4,
                updated_at = now()
          where org_id = $1 and source_order_id = $2`,
        [normalizedOrgId, normalizedOrderId, nextRevision, normalizedActorUid],
      )
      await this.client.query('commit')
      return { idempotent: false, revision: mapRevision(revisionResult.rows[0]) }
    } catch (error) {
      try {
        await this.client.query('rollback')
      } catch {
        // Preserve the original publication error.
      }
      throw error
    }
  }
}

module.exports = {
  JobCardRepository,
  decodeDraftListCursor,
  mapDraft,
  mapDraftListItem,
  mapRevision,
  normalizeDraftListLimit,
}
