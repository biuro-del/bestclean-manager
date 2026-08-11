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
    const result = await this.client.query(
      `select id_task
         from public.task
        where org_id = $1
          and id_task = $2
        limit 1`,
      [requiredText(orgId, 'orgId'), requiredText(sourceOrderId, 'sourceOrderId')],
    )
    if (!result.rows[0]) {
      throw publicError('TASK_NOT_FOUND', 'Nie znaleziono źródłowego zlecenia.', 404)
    }
  }

  async saveDraft({ actorUid, card, orgId, sourceOrderId, sourceSnapshot }) {
    await this.assertSchemaReady()
    const normalizedOrgId = requiredText(orgId, 'orgId')
    const normalizedOrderId = requiredText(sourceOrderId, 'sourceOrderId')
    const normalizedActorUid = requiredText(actorUid, 'actorUid')
    if (!card || typeof card !== 'object' || Array.isArray(card)) {
      throw publicError('JOB_CARD_DRAFT_REQUIRED', 'Brak kompletnego szkicu Karty Zlecenia.')
    }
    await this.assertOrderExists(normalizedOrgId, normalizedOrderId)
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
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb,
         coalesce((
           select max(revision) from public.job_card_revision
            where org_id = $1 and source_order_id = $2
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

  async publishStoredDraft({ acknowledgements = [], actorUid, expectedDraftHash, orgId, sourceOrderId }) {
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
      await this.assertOrderExists(normalizedOrgId, normalizedOrderId)
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

      const latestResult = await this.client.query(
        `select *
           from public.job_card_revision
          where org_id = $1 and source_order_id = $2
          order by revision desc
          limit 1`,
        [normalizedOrgId, normalizedOrderId],
      )
      const latest = mapRevision(latestResult.rows[0])
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
  mapDraft,
  mapRevision,
}
