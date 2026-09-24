'use strict'

const {
  WORKFORCE_SCHEDULE_DB_ROLE,
  WORKFORCE_SCHEDULE_SESSION_ROLE,
  createWorkforceScheduleRepository,
} = require('./workforce-schedule-repository')

const MOBILE_WORKFORCE_SCHEDULE_TIME_ZONE = 'Europe/Warsaw'

const REQUIRED_DELIVERY_COLUMNS = Object.freeze([
  Object.freeze({
    relationName: 'public.workforce_schedule_shift',
    columnName: 'delivered_revision_no',
    typeName: 'integer',
    formattedType: 'integer',
  }),
  Object.freeze({
    relationName: 'public.workforce_schedule_shift',
    columnName: 'delivered_location_name',
    typeName: 'character varying',
    formattedType: 'character varying(180)',
  }),
  Object.freeze({
    relationName: 'public.workforce_schedule_shift',
    columnName: 'delivered_location_short_name',
    typeName: 'character varying',
    formattedType: 'character varying(80)',
  }),
])

const REQUIRED_DELIVERY_CONSTRAINTS = Object.freeze([
  Object.freeze({
    relationName: 'public.workforce_schedule_command',
    constraintName: 'workforce_schedule_command_effects_check',
    constraintType: 'c',
    deferrable: false,
    initiallyDeferred: false,
    checkExpression: "command_type::text='deliver_to_mobile'::textandeffects_json='{delivery:true,downstream:false,notifications:false}'::jsonborcommand_type::text<>'deliver_to_mobile'::textandeffects_json='{delivery:false,downstream:false,notifications:false}'::jsonb",
    columns: [],
    referenceRelationName: '',
    referenceColumns: [],
    updateAction: null,
    deleteAction: null,
    matchType: null,
  }),
  Object.freeze({
    relationName: 'public.workforce_schedule_shift',
    constraintName: 'workforce_schedule_shift_delivered_revision_check',
    constraintType: 'c',
    deferrable: false,
    initiallyDeferred: false,
    checkExpression: 'delivered_revision_noisnullordelivered_revision_no>=1andpublished_revision_noisnotnullanddelivered_revision_no<=published_revision_no',
    columns: [],
    referenceRelationName: '',
    referenceColumns: [],
    updateAction: null,
    deleteAction: null,
    matchType: null,
  }),
  Object.freeze({
    relationName: 'public.workforce_schedule_shift',
    constraintName: 'workforce_schedule_shift_delivered_revision_fk',
    constraintType: 'f',
    deferrable: true,
    initiallyDeferred: true,
    checkExpression: '',
    columns: ['org_id', 'shift_id', 'delivered_revision_no'],
    referenceRelationName: 'public.workforce_schedule_shift_revision',
    referenceColumns: ['org_id', 'shift_id', 'revision_no'],
    updateAction: 'a',
    deleteAction: 'a',
    matchType: 's',
  }),
  Object.freeze({
    relationName: 'public.workforce_schedule_shift',
    constraintName: 'workforce_schedule_shift_delivered_location_snapshot_check',
    constraintType: 'c',
    deferrable: false,
    initiallyDeferred: false,
    checkExpression: "delivered_revision_noisnullanddelivered_location_nameisnullanddelivered_location_short_nameisnullordelivered_revision_noisnotnullanddelivered_location_nameisnotnullandbtrimdelivered_location_name::text<>''::textanddelivered_location_short_nameisnotnullandbtrimdelivered_location_short_name::text<>''::text",
    columns: [],
    referenceRelationName: '',
    referenceColumns: [],
    updateAction: null,
    deleteAction: null,
    matchType: null,
  }),
])

function text(value) {
  return String(value ?? '').trim()
}

function publicError(statusCode, code, message) {
  const error = new Error(code)
  error.statusCode = statusCode
  error.publicCode = code
  error.publicMessage = message
  return error
}

function invalidData() {
  return publicError(
    503,
    'MOBILE_WORKFORCE_SCHEDULE_DATA_INVALID',
    'Udostępniony Grafik ma nieprawidłowe dane. Skontaktuj się z koordynatorem.',
  )
}

function jsonArray(value) {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined) return []
  if (typeof value !== 'string') throw invalidData()
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) throw invalidData()
    return parsed
  } catch (error) {
    if (error?.publicCode) throw error
    throw invalidData()
  }
}

function ymd(value) {
  if (typeof value !== 'string') throw invalidData()
  const normalized = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw invalidData()
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) throw invalidData()
  return normalized
}

function hhmm(value) {
  const normalized = text(value)
  const match = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/)
  if (!match) throw invalidData()
  return `${match[1]}:${match[2]}`
}

function iso(value) {
  const parsed = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(parsed.getTime())) throw invalidData()
  return parsed.toISOString()
}

function positiveInteger(value) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw invalidData()
  return parsed
}

function nonNegativeInteger(value) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw invalidData()
  return parsed
}

function requiredText(value, maxLength) {
  const normalized = text(value)
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f\u007f]/.test(normalized)) throw invalidData()
  return normalized
}

function mapInstructions(value) {
  const rows = jsonArray(value)
  if (rows.length > 50) throw invalidData()
  const positions = new Set()
  const mapped = rows.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw invalidData()
    const position = positiveInteger(item.position)
    const instruction = requiredText(item.text ?? item.instruction, 500)
    if (position > 50 || positions.has(position)) throw invalidData()
    positions.add(position)
    return { position, instruction }
  })
  mapped.sort((left, right) => left.position - right.position)
  return mapped.map((item) => item.instruction)
}

function mapDeliveredShift(row = {}) {
  if (text(row.time_zone) !== MOBILE_WORKFORCE_SCHEDULE_TIME_ZONE) throw invalidData()

  const startsAt = iso(row.starts_at)
  const endsAt = iso(row.ends_at)
  const durationMinutes = (Date.parse(endsAt) - Date.parse(startsAt)) / 60000
  const breakMinutes = nonNegativeInteger(row.break_minutes ?? 0)
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || breakMinutes >= durationMinutes) throw invalidData()

  const notes = row.notes == null ? '' : String(row.notes).trim()
  if (notes.length > 4000) throw invalidData()

  return {
    shiftId: requiredText(row.shift_id, 96),
    revision: positiveInteger(row.delivered_revision_no),
    date: ymd(row.business_date),
    startTime: hhmm(row.local_start_time),
    endTime: hhmm(row.local_end_time),
    startsAt,
    endsAt,
    breakMinutes,
    title: requiredText(row.title, 180),
    notes,
    location: {
      locationId: requiredText(row.location_id, 96),
      sourceObjectId: requiredText(row.location_source_object_id, 64),
      name: requiredText(row.location_name, 180),
    },
    instructions: mapInstructions(row.instructions),
  }
}

function createMobileWorkforceScheduleRepository(client) {
  if (!client || typeof client.query !== 'function') {
    throw new TypeError('Mobile workforce schedule repository requires a PostgreSQL client.')
  }

  const scheduleRepository = createWorkforceScheduleRepository(client)

  async function deliverySchemaReady() {
    const missing = []
    const columnResult = await client.query(
      `select required.relation_name, required.column_name,
              target.attnum is not null and target.attnum > 0 and not target.attisdropped as column_ready,
              coalesce(target.atttypid = to_regtype(required.type_name)
                       and format_type(target.atttypid, target.atttypmod) = required.formatted_type, false) as exact_type,
              coalesce(target.attnotnull = false, false) as exact_nullability,
              coalesce(target.atthasdef = false, false) as exact_default,
              coalesce(target.attidentity::text = '' and target.attgenerated::text = '', false) as exact_storage
         from jsonb_to_recordset($1::jsonb) as required(
           relation_name text,
           column_name text,
           type_name text,
           formatted_type text
         )
         left join pg_attribute target
           on target.attrelid = to_regclass(required.relation_name)
          and target.attname = required.column_name`,
      [JSON.stringify(REQUIRED_DELIVERY_COLUMNS.map((column) => ({
        relation_name: column.relationName,
        column_name: column.columnName,
        type_name: column.typeName,
        formatted_type: column.formattedType,
      })))],
    )
    for (const row of columnResult.rows || []) {
      const label = `${text(row.relation_name)}:${text(row.column_name)}`
      if (row.column_ready !== true) missing.push(`${label}:COLUMN`)
      else {
        if (row.exact_type !== true) missing.push(`${label}:TYPE`)
        if (row.exact_nullability !== true) missing.push(`${label}:NULLABILITY`)
        if (row.exact_default !== true) missing.push(`${label}:DEFAULT`)
        if (row.exact_storage !== true) missing.push(`${label}:STORAGE`)
      }
    }

    const constraintResult = await client.query(
      `select required.relation_name, required.constraint_name,
              target.oid is not null as constraint_ready,
              coalesce(target.contype = required.constraint_type::"char", false) as exact_type,
              coalesce(target.convalidated = true, false) as exact_validation,
              coalesce(target.condeferrable = required.expected_deferrable
                       and target.condeferred = required.expected_initially_deferred, false) as exact_deferrability,
              coalesce(case required.constraint_type
                when 'c' then
                  target.connoinherit is false
                  and replace(replace(
                        regexp_replace(lower(pg_get_expr(target.conbin, target.conrelid, false)), '[[:space:]()]', '', 'g'),
                        '"', ''), 'public.', '') = required.check_expression
                when 'f' then
                  target.confrelid = to_regclass(required.reference_relation_name)
                  and target.confupdtype = required.update_action::"char"
                  and target.confdeltype = required.delete_action::"char"
                  and target.confmatchtype = required.match_type::"char"
                  and (
                    select array_agg(attribute.attname::text order by key_column.ordinality)
                      from unnest(target.conkey) with ordinality as key_column(attnum, ordinality)
                      join pg_attribute attribute
                        on attribute.attrelid = target.conrelid and attribute.attnum = key_column.attnum
                  ) = required.columns
                  and (
                    select array_agg(attribute.attname::text order by key_column.ordinality)
                      from unnest(target.confkey) with ordinality as key_column(attnum, ordinality)
                      join pg_attribute attribute
                        on attribute.attrelid = target.confrelid and attribute.attnum = key_column.attnum
                  ) = required.reference_columns
                else false
              end, false) as exact_definition
         from jsonb_to_recordset($1::jsonb) as required(
           relation_name text,
           constraint_name text,
           constraint_type text,
           expected_deferrable boolean,
           expected_initially_deferred boolean,
           check_expression text,
           columns text[],
           reference_relation_name text,
           reference_columns text[],
           update_action text,
           delete_action text,
           match_type text
         )
         left join pg_constraint target
           on target.conrelid = to_regclass(required.relation_name)
          and target.conname = required.constraint_name`,
      [JSON.stringify(REQUIRED_DELIVERY_CONSTRAINTS.map((constraint) => ({
        relation_name: constraint.relationName,
        constraint_name: constraint.constraintName,
        constraint_type: constraint.constraintType,
        expected_deferrable: constraint.deferrable,
        expected_initially_deferred: constraint.initiallyDeferred,
        check_expression: constraint.checkExpression,
        columns: constraint.columns,
        reference_relation_name: constraint.referenceRelationName,
        reference_columns: constraint.referenceColumns,
        update_action: constraint.updateAction,
        delete_action: constraint.deleteAction,
        match_type: constraint.matchType,
      })))],
    )
    for (const row of constraintResult.rows || []) {
      const label = `${text(row.relation_name)}:${text(row.constraint_name)}`
      if (row.constraint_ready !== true) missing.push(`${label}:CONSTRAINT`)
      else {
        if (row.exact_type !== true) missing.push(`${label}:TYPE`)
        if (row.exact_validation !== true) missing.push(`${label}:VALIDATION`)
        if (row.exact_deferrability !== true) missing.push(`${label}:DEFERRABILITY`)
        if (row.exact_definition !== true) missing.push(`${label}:DEFINITION`)
      }
    }
    return { ready: missing.length === 0, missing }
  }

  async function resolveOwnPerson({ orgId, uid, workerId }) {
    const result = await client.query(
      `select person_id
         from public.workforce_schedule_person
        where org_id = $1::text
          and status = 'ACTIVE'
          and source_auth_uid = $2::text
          and source_worker_id_normalized = lower(btrim($3::text))
        order by person_id asc
        limit 2`,
      [orgId, uid, workerId],
    )
    if (result.rows?.length !== 1 || !text(result.rows[0]?.person_id)) {
      throw publicError(
        409,
        'WORKFORCE_SCHEDULE_PERSON_NOT_READY',
        'Profil pracownika nie jest jeszcze gotowy do odczytu Grafiku.',
      )
    }
    return { personId: text(result.rows[0].person_id) }
  }

  async function resolveScheduleTimeZone(orgId) {
    const result = await client.query(
      `select time_zone
         from public.workforce_schedule_settings
        where org_id = $1::text
        limit 2`,
      [orgId],
    )
    if (result.rows?.length !== 1 || text(result.rows[0]?.time_zone) !== MOBILE_WORKFORCE_SCHEDULE_TIME_ZONE) {
      throw publicError(
        503,
        'MOBILE_WORKFORCE_SCHEDULE_TIME_ZONE_NOT_READY',
        'Strefa czasowa Grafiku nie jest gotowa dla aplikacji mobilnej.',
      )
    }
    return MOBILE_WORKFORCE_SCHEDULE_TIME_ZONE
  }

  async function listOwnDeliveredShifts({ orgId, personId, from, to }) {
    const result = await client.query(
      `select h.shift_id,
              h.delivered_revision_no,
              to_char(r.business_date, 'YYYY-MM-DD') as business_date,
              r.title,
              r.local_start_time,
              r.local_end_time,
              r.starts_at,
              r.ends_at,
              r.time_zone,
              r.break_minutes,
              r.location_id,
              r.notes,
              location.source_object_id as location_source_object_id,
              h.delivered_location_name as location_name,
              coalesce((
                select jsonb_agg(
                         jsonb_build_object('position', instruction.position, 'text', instruction.instruction)
                         order by instruction.position
                       )
                  from public.workforce_schedule_shift_instruction instruction
                 where instruction.org_id = h.org_id
                   and instruction.shift_id = h.shift_id
                   and instruction.revision_no = h.delivered_revision_no
              ), '[]'::jsonb) as instructions
         from public.workforce_schedule_shift h
         join public.workforce_schedule_shift_revision r
           on r.org_id = h.org_id
          and r.shift_id = h.shift_id
          and r.revision_no = h.delivered_revision_no
         join public.workforce_schedule_location location
           on location.org_id = r.org_id
          and location.location_id = r.location_id
        where h.org_id = $1::text
          and h.delivered_revision_no is not null
          and r.is_deleted = false
          and r.business_date between $2::date and $3::date
          and exists (
                select 1
                  from public.workforce_schedule_shift_revision_assignee assignment
                 where assignment.org_id = h.org_id
                   and assignment.shift_id = h.shift_id
                   and assignment.revision_no = h.delivered_revision_no
                   and assignment.person_id = $4::text
              )
        order by r.business_date asc, r.starts_at asc, h.shift_id asc`,
      [orgId, from, to, personId],
    )
    const shifts = (result.rows || []).map(mapDeliveredShift)
    if (new Set(shifts.map((shift) => shift.shiftId)).size !== shifts.length) throw invalidData()
    return shifts
  }

  return {
    deliverySchemaReady,
    listOwnDeliveredShifts,
    resolveOwnPerson,
    resolveScheduleTimeZone,
    schemaReady: scheduleRepository.schemaReady,
    setActorContext: scheduleRepository.setActorContext,
    setTenantContext: scheduleRepository.setTenantContext,
  }
}

module.exports = {
  MOBILE_WORKFORCE_SCHEDULE_TIME_ZONE,
  WORKFORCE_SCHEDULE_DB_ROLE,
  WORKFORCE_SCHEDULE_SESSION_ROLE,
  createMobileWorkforceScheduleRepository,
  mapDeliveredShift,
}
