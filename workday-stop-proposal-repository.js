'use strict'

const { WorkdayStopProposalError, text } = require('./workday-stop-proposal-policy')

const REQUIRED_RELATIONS = Object.freeze([
  'public.workday_stop_proposal',
  'public.workday_stop_proposal_audit',
  'public.workday_time_permission',
])

function iso(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : ''
}

function mapProposal(row = {}) {
  return {
    proposalId: text(row.proposal_id),
    // `id` is retained only for the local portal component during the transition.
    id: text(row.proposal_id),
    organizationId: text(row.org_id),
    workerId: text(row.worker_id),
    workerLogin: text(row.worker_login),
    workerName: text(row.worker_name),
    workdayId: text(row.workday_id),
    startAt: iso(row.start_at),
    proposedStopAt: iso(row.proposed_stop_at),
    proposedStopLocal: text(row.proposed_stop_local),
    timeZone: text(row.time_zone) || 'Europe/Warsaw',
    submittedAt: iso(row.submitted_at),
    submittedBy: text(row.submitted_by),
    employeeNote: text(row.employee_note),
    status: text(row.status),
    reviewedAt: iso(row.reviewed_at),
    reviewedBy: text(row.reviewed_by),
    decisionNote: text(row.decision_note),
    officialStopAt: iso(row.official_stop_at),
    clientActionId: text(row.client_action_id),
    version: Number(row.version ?? 0),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  }
}

function createWorkdayStopProposalRepository(client) {
  if (!client || typeof client.query !== 'function') {
    throw new TypeError('WorkdayStopProposal repository requires a PostgreSQL client.')
  }

  return {
    async schemaReady() {
      const result = await client.query(
        `select to_regclass('public.workday_stop_proposal') is not null as proposals_ready,
                to_regclass('public.workday_stop_proposal_audit') is not null as audit_ready,
                to_regclass('public.workday_time_permission') is not null as permission_ready`,
      )
      const row = result.rows?.[0] ?? {}
      return Boolean(row.proposals_ready && row.audit_ready && row.permission_ready)
    },

    async lockWorkday({ orgId, workdayId }) {
      const result = await client.query(
        `select w.org_id, w.workday_id, w.worker_login, w.worker_name, w.start_at, w.end_at,
                w.status, w.duration_sec, w.updated_at
           from public.workday w
          where w.org_id = $1::text
            and w.workday_id = $2::text
          for update of w`,
        [orgId, workdayId],
      )
      return result.rows?.[0] ?? null
    },

    async findProposalByClientAction({ orgId, workerId, clientActionId }) {
      const result = await client.query(
        `select p.*
           from public.workday_stop_proposal p
          where p.org_id = $1::text
            and p.worker_id = $2::text
            and p.client_action_id = $3::text
          limit 1`,
        [orgId, workerId, clientActionId],
      )
      return result.rows?.[0] ?? null
    },

    async findPendingForWorkday({ orgId, workdayId }) {
      const result = await client.query(
        `select p.*
           from public.workday_stop_proposal p
          where p.org_id = $1::text
            and p.workday_id = $2::text
            and p.status = 'PENDING'
          limit 1
          for update of p`,
        [orgId, workdayId],
      )
      return result.rows?.[0] ?? null
    },

    async insertProposal(input) {
      const result = await client.query(
        `insert into public.workday_stop_proposal (
           proposal_id, org_id, worker_id, workday_id, proposed_stop_at, proposed_stop_local, time_zone, submitted_at,
           submitted_by, employee_note, status, version, client_action_id, created_at, updated_at
         ) values (
           $1::text, $2::text, $3::text, $4::text, $5::timestamptz, $6::text, $7::text, now(),
           $8::text, nullif($9::text, ''), 'PENDING', 1, $10::text, now(), now()
         ) returning *`,
        [
          input.proposalId,
          input.orgId,
          input.workerId,
          input.workdayId,
          input.proposedStopAt,
          input.proposedStopLocal,
          input.timeZone,
          input.submittedBy,
          input.employeeNote,
          input.clientActionId,
        ],
      )
      return result.rows[0]
    },

    async appendAudit({ proposalId, orgId, action, actorUid, fromStatus = null, toStatus, note = '', proposedStopAt = null, officialStopAt = null, clientActionId = null }) {
      await client.query(
        `insert into public.workday_stop_proposal_audit (
           audit_id, org_id, proposal_id, action, from_status, to_status, actor_uid,
           note, proposed_stop_at, official_stop_at, client_action_id, occurred_at
         ) values (
           $1::text, $2::text, $3::text, $4::text, nullif($5::text, ''), $6::text, $7::text,
           nullif($8::text, ''), $9::timestamptz, $10::timestamptz, nullif($11::text, ''), now()
         )`,
        [
          `${proposalId}:audit:${Date.now()}:${Math.random().toString(16).slice(2)}`,
          orgId,
          proposalId,
          action,
          fromStatus,
          toStatus,
          actorUid,
          note,
          proposedStopAt,
          officialStopAt,
          clientActionId,
        ],
      )
    },

    async hasApproverPermission({ orgId, uid }) {
      const result = await client.query(
        `select 1
           from public.workday_time_permission p
          where p.org_id = $1::text
            and p.uid = $2::text
            and p.permission_code = 'workday_time_approver'
            and p.revoked_at is null
          limit 1`,
        [orgId, uid],
      )
      return result.rowCount > 0
    },

    async lockProposalWithWorkday({ orgId, proposalId }) {
      const result = await client.query(
        `select p.*, w.worker_login, w.worker_name, w.start_at, w.end_at as workday_end_at,
                w.status as workday_status, w.duration_sec as workday_duration_sec
           from public.workday_stop_proposal p
           join public.workday w
             on w.org_id = p.org_id
            and w.workday_id = p.workday_id
          where p.org_id = $1::text
            and p.proposal_id = $2::text
          for update of p, w`,
        [orgId, proposalId],
      )
      return result.rows?.[0] ?? null
    },

    async findDecisionAudit({ orgId, proposalId, clientActionId }) {
      if (!text(clientActionId)) return null
      const result = await client.query(
        `select *
           from public.workday_stop_proposal_audit
          where org_id = $1::text
            and proposal_id = $2::text
            and client_action_id = $3::text
            and action in ('APPROVED', 'CORRECTED', 'REJECTED')
          limit 1`,
        [orgId, proposalId, clientActionId],
      )
      return result.rows?.[0] ?? null
    },

    async updateOfficialWorkdayStop({ orgId, workdayId, officialStopAt, durationSec, reviewedBy }) {
      const result = await client.query(
        `update public.workday
            set end_at = $3::timestamptz,
                duration_sec = $4::integer,
                status = 'CLOSED',
                stop_object = coalesce(nullif(stop_object, ''), 'OFFICE_STOP_PROPOSAL'),
                updated_at = now(),
                updated_by = $5::text
          where org_id = $1::text
            and workday_id = $2::text
            and end_at is null
          returning org_id, workday_id, start_at, end_at, duration_sec, status, updated_at, updated_by`,
        [orgId, workdayId, officialStopAt, durationSec, reviewedBy],
      )
      return result.rows?.[0] ?? null
    },

    async updateProposalDecision({ orgId, proposalId, status, reviewedBy, decisionNote, officialStopAt }) {
      const result = await client.query(
        `update public.workday_stop_proposal
            set status = $3::text,
                reviewed_at = now(),
                reviewed_by = $4::text,
                decision_note = nullif($5::text, ''),
                official_stop_at = $6::timestamptz,
                version = version + 1,
                updated_at = now()
          where org_id = $1::text
            and proposal_id = $2::text
            and status = 'PENDING'
          returning *`,
        [orgId, proposalId, status, reviewedBy, decisionNote, officialStopAt],
      )
      return result.rows?.[0] ?? null
    },

    async listForReview({ orgId, workerId = '', from = '', to = '', status = 'PENDING', limit = 100 }) {
      const result = await client.query(
        `select p.*, w.worker_login, w.worker_name, w.start_at,
                extract(epoch from (p.proposed_stop_at - w.start_at))::integer as proposed_duration_sec
           from public.workday_stop_proposal p
           join public.workday w on w.org_id = p.org_id and w.workday_id = p.workday_id
          where p.org_id = $1::text
            and (nullif($2::text, '') is null or p.worker_id = $2::text)
            and ($3::date is null or w.start_at >= $3::date)
            and ($4::date is null or w.start_at < ($4::date + interval '1 day'))
            and (nullif($5::text, '') is null or p.status = $5::text)
          order by p.submitted_at asc, p.proposal_id asc
          limit $6::integer`,
        [orgId, workerId, from || null, to || null, status, limit],
      )
      return result.rows.map((row) => ({ ...mapProposal(row), proposedDurationSec: Number(row.proposed_duration_sec ?? 0) }))
    },

    async getReviewDetail({ orgId, proposalId }) {
      const proposal = await client.query(
        `select p.*, w.worker_login, w.worker_name, w.start_at,
                extract(epoch from (p.proposed_stop_at - w.start_at))::integer as proposed_duration_sec
           from public.workday_stop_proposal p
           join public.workday w on w.org_id = p.org_id and w.workday_id = p.workday_id
          where p.org_id = $1::text and p.proposal_id = $2::text
          limit 1`,
        [orgId, proposalId],
      )
      if (!proposal.rowCount) return null
      const audit = await client.query(
        `select action, from_status, to_status, actor_uid, note, proposed_stop_at, official_stop_at, occurred_at
           from public.workday_stop_proposal_audit
          where org_id = $1::text and proposal_id = $2::text
          order by occurred_at asc, audit_id asc`,
        [orgId, proposalId],
      )
      return {
        proposal: { ...mapProposal(proposal.rows[0]), proposedDurationSec: Number(proposal.rows[0].proposed_duration_sec ?? 0) },
        history: audit.rows.map((row) => ({
          action: text(row.action), fromStatus: row.from_status ?? null, toStatus: row.to_status ?? null,
          actorUid: text(row.actor_uid), note: row.note ?? null, proposedStopAt: row.proposed_stop_at ?? null,
          officialStopAt: row.official_stop_at ?? null, occurredAt: row.occurred_at ?? null,
        })),
      }
    },

  }
}

module.exports = { REQUIRED_RELATIONS, createWorkdayStopProposalRepository, mapProposal }
