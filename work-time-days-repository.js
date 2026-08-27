'use strict'

const crypto = require('node:crypto')
const {
  BUSINESS_DATE_RE,
  MAX_SESSION_SECONDS,
  WorkTimeDayError,
  buildWorkTimeDay,
  canonicalJson,
  secondsBetween,
  text,
  warsawBusinessDateYmd,
} = require('./work-time-days-policy')

function error(statusCode, code, message, details) {
  return new WorkTimeDayError(statusCode, code, message, details)
}

function timestamp(value, field) {
  if (value == null || value === '') return null
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) throw error(400, 'TIMESTAMP_INVALID', `Pole ${field} ma niepoprawną datę.`)
  return parsed.toISOString()
}

function dayExpression(alias = 'w', businessDateColumnReady = false) {
  const derivedFromStart = `to_char(${alias}.start_at at time zone 'Europe/Warsaw', 'YYYY-MM-DD')`
  return businessDateColumnReady
    ? `coalesce(nullif(btrim(${alias}.business_date_ymd), ''), ${derivedFromStart})`
    : derivedFromStart
}

async function readSchemaState(client) {
  const result = await client.query(
    `select
       exists (
         select 1
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'workday'
            and column_name = 'business_date_ymd'
       ) as business_date_column_ready,
       to_regclass('public.workday_reconciliation_audit') is not null as audit_ready`,
  )
  return {
    auditReady: result.rows?.[0]?.audit_ready === true,
    businessDateColumnReady: result.rows?.[0]?.business_date_column_ready === true,
  }
}

function normalizeDate(value, field = 'businessDate') {
  const normalized = text(value, 10)
  if (!BUSINESS_DATE_RE.test(normalized)) throw error(400, 'BUSINESS_DATE_INVALID', `${field} musi mieć format YYYY-MM-DD.`)
  return normalized
}

function normalizeInput(value = {}) {
  const input = value && typeof value === 'object' ? value : {}
  const expectedVersion = text(input.expectedVersion, 64).toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(expectedVersion)) {
    throw error(400, 'WORK_TIME_DAY_VERSION_INVALID', 'Brak poprawnej wersji dnia. Odśwież dane i ponów zapis.')
  }
  const idempotencyKey = text(input.idempotencyKey, 128)
  if (idempotencyKey.length < 8 || !/^[a-z0-9._:-]+$/i.test(idempotencyKey)) {
    throw error(400, 'IDEMPOTENCY_KEY_INVALID', 'idempotencyKey musi mieć od 8 do 128 bezpiecznych znaków.')
  }
  const reason = text(input.reason, 1001)
  if (reason.length < 3 || reason.length > 1000) {
    throw error(400, 'CORRECTION_REASON_REQUIRED', 'Podaj powód korekty od 3 do 1000 znaków.')
  }

  const attendanceCorrections = (Array.isArray(input.attendanceCorrections) ? input.attendanceCorrections : []).map((source, index) => {
    const workdayId = text(source?.workdayId, 64)
    if (!workdayId) throw error(400, 'WORKDAY_ID_REQUIRED', `Brak workdayId w attendanceCorrections[${index}].`)
    const hasStart = Object.prototype.hasOwnProperty.call(source, 'startAt')
    const hasEnd = Object.prototype.hasOwnProperty.call(source, 'endAt')
    const hasZone = Object.prototype.hasOwnProperty.call(source, 'zoneId')
    if (!hasStart && !hasEnd && !hasZone) throw error(400, 'ATTENDANCE_CORRECTION_EMPTY', `Korekta sesji ${workdayId} jest pusta.`)
    return {
      workdayId,
      ...(hasStart ? { startAt: timestamp(source.startAt, `attendanceCorrections[${index}].startAt`) } : {}),
      ...(hasEnd ? { endAt: timestamp(source.endAt, `attendanceCorrections[${index}].endAt`) } : {}),
      ...(hasZone ? { zoneId: text(source.zoneId, 64) } : {}),
      ...(Object.prototype.hasOwnProperty.call(source, 'clientId') ? { clientId: text(source.clientId, 64) } : {}),
      ...(Object.prototype.hasOwnProperty.call(source, 'location') ? { location: text(source.location, 500) } : {}),
    }
  })

  const activityCorrections = (Array.isArray(input.activityCorrections) ? input.activityCorrections : []).map((source, index) => {
    const eventId = text(source?.eventId, 64)
    if (!eventId) throw error(400, 'EVENT_ID_REQUIRED', `Brak eventId w activityCorrections[${index}].`)
    const hasStart = Object.prototype.hasOwnProperty.call(source, 'startAt')
    const hasEnd = Object.prototype.hasOwnProperty.call(source, 'endAt')
    const hasZone = Object.prototype.hasOwnProperty.call(source, 'zoneId')
    if (!hasStart && !hasEnd && !hasZone) throw error(400, 'ACTIVITY_CORRECTION_EMPTY', `Korekta zdarzenia ${eventId} jest pusta.`)
    return {
      eventId,
      ...(hasStart ? { startAt: timestamp(source.startAt, `activityCorrections[${index}].startAt`) } : {}),
      ...(hasEnd ? { endAt: timestamp(source.endAt, `activityCorrections[${index}].endAt`) } : {}),
      ...(hasZone ? { zoneId: text(source.zoneId, 64) } : {}),
      ...(Object.prototype.hasOwnProperty.call(source, 'clientId') ? { clientId: text(source.clientId, 64) } : {}),
      ...(Object.prototype.hasOwnProperty.call(source, 'location') ? { location: text(source.location, 500) } : {}),
    }
  })

  const duplicateWorkdays = attendanceCorrections.map((entry) => entry.workdayId).filter((id, index, all) => all.indexOf(id) !== index)
  const duplicateEvents = activityCorrections.map((entry) => entry.eventId).filter((id, index, all) => all.indexOf(id) !== index)
  if (duplicateWorkdays.length || duplicateEvents.length) {
    throw error(400, 'DUPLICATE_CORRECTION_TARGET', 'Ten sam rekord występuje w korekcie więcej niż raz.')
  }
  if (!attendanceCorrections.length && !activityCorrections.length && input.finalize !== true) {
    throw error(400, 'WORK_TIME_DAY_CORRECTION_EMPTY', 'Zadanie nie zawiera korekty ani finalizacji.')
  }
  return { attendanceCorrections, activityCorrections, expectedVersion, finalize: input.finalize === true, idempotencyKey, reason }
}

function requestHash({ orgId, workerLogin, businessDateYmd, input }) {
  return crypto.createHash('sha256').update(canonicalJson({ orgId, workerLogin, businessDateYmd, input })).digest('hex')
}

async function readWorker(client, orgId, workerLogin) {
  const result = await client.query(
    `select login, full_name, auth_uid from public.worker where org_id = $1::text and lower(login) = lower($2::text) limit 1`,
    [orgId, workerLogin],
  )
  return result.rows?.[0] || null
}

async function assertWorkerAccess(client, access, orgId, workerLogin) {
  const worker = await readWorker(client, orgId, workerLogin)
  if (!worker) throw error(404, 'WORKER_NOT_FOUND', 'Nie znaleziono pracownika w tej organizacji.')
  if (text(access?.scope, 16).toUpperCase() === 'OWN' && text(worker.auth_uid, 128) !== text(access?.uid, 128)) {
    throw error(403, 'WORK_TIME_DAY_FORBIDDEN', 'Brak uprawnień do danych tego pracownika.')
  }
  return worker
}

async function readWorkdays(client, orgId, workerLogin, businessDateYmd, { businessDateColumnReady = false, forUpdate = false } = {}) {
  const result = await client.query(
    `select w.*, z.id as zone_id, z.zone as zone_name, z.function as zone_function,
            z.location as zone_location, z.client_id, c.name as client_name,
            stop_zone.function as stop_zone_function
       from public.workday w
       left join public.zone z on z.org_id = w.org_id and z.id = w.utility_room_id
       left join public.client c on c.org_id = z.org_id and c.client_id = z.client_id
       left join public.zone stop_zone on stop_zone.org_id = w.org_id and lower(stop_zone.id) = lower(w.stop_object)
      where w.org_id = $1::text
        and lower(w.worker_login) = lower($2::text)
        and ${dayExpression('w', businessDateColumnReady)} = $3::text
      order by w.start_at asc nulls last, w.workday_id asc${forUpdate ? '\n      for update of w' : ''}`,
    [orgId, workerLogin, businessDateYmd],
  )
  return result.rows || []
}

async function readEvents(client, orgId, workerLogin, businessDateYmd, workdayIds = [], { forUpdate = false } = {}) {
  const result = await client.query(
    `select e.*, z.zone as zone_name, z.function as zone_function, z.location, z.client_id, c.name as client_name
       from public.event e
       left join public.zone z on z.org_id = e.org_id and z.id = e.zone_id
       left join public.client c on c.org_id = z.org_id and c.client_id = z.client_id
      where e.org_id = $1::text
        and (
          e.workday_id = any($4::text[])
          or (
            lower(coalesce(e.worker_login, '')) = lower($2::text)
            and to_char(e.start_at at time zone 'Europe/Warsaw', 'YYYY-MM-DD') = $3::text
          )
        )
      order by e.start_at asc nulls last, e.event_id asc${forUpdate ? '\n      for update of e' : ''}`,
    [orgId, workerLogin, businessDateYmd, workdayIds],
  )
  return result.rows || []
}

async function readDay(client, { orgId, workerLogin, businessDateYmd, forUpdate = false, schemaState = null }) {
  const resolvedSchemaState = schemaState ?? await readSchemaState(client)
  const workdays = await readWorkdays(client, orgId, workerLogin, businessDateYmd, {
    businessDateColumnReady: resolvedSchemaState.businessDateColumnReady,
    forUpdate,
  })
  const workdayIds = workdays.map((row) => text(row.workday_id, 64)).filter(Boolean)
  const events = await readEvents(client, orgId, workerLogin, businessDateYmd, workdayIds, { forUpdate })
  return { events, schemaState: resolvedSchemaState, workdays }
}

async function readIdempotentResult(client, orgId, idempotencyKey, hash) {
  const result = await client.query(
    `select request_hash, response_snapshot from public.workday_reconciliation_audit where org_id = $1::text and idempotency_key = $2::text limit 1`,
    [orgId, idempotencyKey],
  )
  const row = result.rows?.[0]
  if (!row) return null
  if (text(row.request_hash, 64) !== hash) {
    throw error(409, 'IDEMPOTENCY_KEY_REUSED', 'Ten idempotencyKey został już użyty dla innej korekty.')
  }
  try {
    return JSON.parse(String(row.response_snapshot || '{}'))
  } catch {
    throw error(409, 'IDEMPOTENT_RESPONSE_INVALID', 'Nie można odtworzyć wyniku wcześniejszej korekty.')
  }
}

function exposeSchemaCapabilities(day, schemaState) {
  day.schemaReady = schemaState.businessDateColumnReady && schemaState.auditReady
  day.editable = true
  day.auditAvailable = schemaState.auditReady
  day.businessDateStored = schemaState.businessDateColumnReady
  return day
}

async function validateZoneCorrection(client, orgId, correction) {
  if (!Object.prototype.hasOwnProperty.call(correction, 'zoneId')) return null
  if (!correction.zoneId) throw error(400, 'ZONE_REQUIRED', 'Wybierz poprawną strefę dla korygowanego wpisu.')
  const result = await client.query(
    `select z.id, z.client_id, z.location from public.zone z where z.org_id = $1::text and z.id = $2::text limit 1`,
    [orgId, correction.zoneId],
  )
  const zone = result.rows?.[0]
  if (!zone) throw error(400, 'ZONE_NOT_FOUND', `Nie znaleziono strefy ${correction.zoneId}.`)
  if (correction.clientId && text(zone.client_id, 64) !== correction.clientId) {
    throw error(400, 'ZONE_CLIENT_MISMATCH', 'Wybrana strefa nie należy do wskazanego klienta.')
  }
  if (correction.location && text(zone.location, 500) !== correction.location) {
    throw error(400, 'ZONE_LOCATION_MISMATCH', 'Wybrana lokalizacja nie należy do wskazanej strefy.')
  }
  return zone
}

function createWorkTimeDaysRepository(client, { authorize }) {
  if (!client?.query || typeof authorize !== 'function') throw new TypeError('Work time day repository dependencies are incomplete.')

  async function read({ orgId, uid, workerLogin, businessDateYmd }) {
    const access = await authorize(client, { orgId, uid, write: false })
    const worker = await assertWorkerAccess(client, access, orgId, workerLogin)
    const source = await readDay(client, { orgId, workerLogin, businessDateYmd })
    const day = exposeSchemaCapabilities(
      buildWorkTimeDay({ ...source, orgId, workerLogin, businessDateYmd }),
      source.schemaState,
    )
    day.workerName = text(worker.full_name, 300) || day.workerName
    return day
  }

  async function list({ orgId, uid, workerLogin = '', fromYmd, toYmd, page = 1, pageSize = 50 }) {
    const access = await authorize(client, { orgId, uid, write: false })
    let requestedWorker = text(workerLogin, 80)
    if (text(access?.scope, 16).toUpperCase() === 'OWN') {
      const own = await client.query(`select login from public.worker where org_id = $1::text and auth_uid = $2::text limit 1`, [orgId, uid])
      const ownLogin = text(own.rows?.[0]?.login, 80)
      if (!ownLogin) throw error(403, 'WORK_TIME_DAY_FORBIDDEN', 'Brak powiązanego konta pracownika.')
      if (requestedWorker && requestedWorker.toLowerCase() !== ownLogin.toLowerCase()) {
        throw error(403, 'WORK_TIME_DAY_FORBIDDEN', 'Brak uprawnień do danych tego pracownika.')
      }
      requestedWorker = ownLogin
    }
    const from = normalizeDate(fromYmd, 'fromYmd')
    const to = normalizeDate(toYmd, 'toYmd')
    if (from > to) throw error(400, 'DATE_RANGE_INVALID', 'fromYmd nie może być późniejsze niż toYmd.')
    const schemaState = await readSchemaState(client)
    const result = await client.query(
      `select w.*, ${dayExpression('w', schemaState.businessDateColumnReady)} as computed_business_date_ymd,
              z.id as zone_id, z.zone as zone_name, z.function as zone_function,
              z.location as zone_location, z.client_id, c.name as client_name,
              stop_zone.function as stop_zone_function
         from public.workday w
         left join public.zone z on z.org_id = w.org_id and z.id = w.utility_room_id
         left join public.client c on c.org_id = z.org_id and c.client_id = z.client_id
         left join public.zone stop_zone on stop_zone.org_id = w.org_id and lower(stop_zone.id) = lower(w.stop_object)
        where w.org_id = $1::text
          and ($2::text = '' or lower(w.worker_login) = lower($2::text))
          and ${dayExpression('w', schemaState.businessDateColumnReady)} between $3::text and $4::text
        order by w.worker_login asc, ${dayExpression('w', schemaState.businessDateColumnReady)} desc, w.start_at asc`,
      [orgId, requestedWorker, from, to],
    )
    const grouped = new Map()
    ;(result.rows || []).forEach((row) => {
      const dayKey = text(row.computed_business_date_ymd ?? row.business_date_ymd, 10)
      const key = `${text(row.worker_login, 80).toLowerCase()}|${dayKey}`
      const group = grouped.get(key) ?? { businessDateYmd: dayKey, workerLogin: text(row.worker_login, 80), workdays: [] }
      group.workdays.push(row)
      grouped.set(key, group)
    })
    const groups = [...grouped.values()]
    const days = []
    for (const group of groups) {
      const workdayIds = group.workdays.map((row) => text(row.workday_id, 64)).filter(Boolean)
      const events = await readEvents(client, orgId, group.workerLogin, group.businessDateYmd, workdayIds)
      const day = exposeSchemaCapabilities(buildWorkTimeDay({ orgId, ...group, events }), schemaState)
      days.push(day)
    }
    days.sort((left, right) => right.businessDateYmd.localeCompare(left.businessDateYmd) || left.workerLogin.localeCompare(right.workerLogin))
    const normalizedPageSize = Math.min(200, Math.max(1, Math.floor(Number(pageSize) || 50)))
    const total = days.length
    const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize))
    const normalizedPage = Math.min(totalPages, Math.max(1, Math.floor(Number(page) || 1)))
    return {
      items: days.slice((normalizedPage - 1) * normalizedPageSize, normalizedPage * normalizedPageSize),
      page: normalizedPage,
      pageSize: normalizedPageSize,
      total,
      totalPages,
    }
  }

  async function reconcile({ orgId, uid, workerLogin, businessDateYmd, value }) {
    const input = normalizeInput(value)
    const hash = requestHash({ orgId, workerLogin, businessDateYmd, input })
    const access = await authorize(client, { orgId, uid, write: true })
    await assertWorkerAccess(client, access, orgId, workerLogin)
    const schemaState = await readSchemaState(client)
    await client.query('begin')
    try {
      await client.query(`select pg_advisory_xact_lock(hashtextextended($1::text, 0))`, [`${orgId}|${workerLogin.toLowerCase()}|${businessDateYmd}`])
      const replay = schemaState.auditReady
        ? await readIdempotentResult(client, orgId, input.idempotencyKey, hash)
        : null
      if (replay) {
        await client.query('commit')
        return { ...replay, idempotent: true }
      }
      const beforeSource = await readDay(client, { orgId, workerLogin, businessDateYmd, forUpdate: true, schemaState })
      if (!beforeSource.workdays.length) throw error(404, 'WORK_TIME_DAY_NOT_FOUND', 'Nie znaleziono sesji pracy dla tego dnia.')
      const before = buildWorkTimeDay({ ...beforeSource, orgId, workerLogin, businessDateYmd })
      if (before.version !== input.expectedVersion) {
        throw error(409, 'WORK_TIME_DAY_CONFLICT', 'Dane dnia zmieniły się. Odśwież widok i ponów korektę.', { currentVersion: before.version })
      }
      const workdayIds = new Set(beforeSource.workdays.map((row) => text(row.workday_id, 64)))
      const eventIds = new Set(beforeSource.events.map((row) => text(row.event_id, 64)))

      for (const correction of input.attendanceCorrections) {
        if (!workdayIds.has(correction.workdayId)) throw error(409, 'WORKDAY_OUTSIDE_DAY', 'Korygowana sesja nie należy do tego dnia.')
        const current = beforeSource.workdays.find((row) => text(row.workday_id, 64) === correction.workdayId)
        const zone = await validateZoneCorrection(client, orgId, correction)
        const startAt = Object.prototype.hasOwnProperty.call(correction, 'startAt') ? correction.startAt : isoOrNull(current.start_at)
        const endAt = Object.prototype.hasOwnProperty.call(correction, 'endAt') ? correction.endAt : isoOrNull(current.end_at)
        if (startAt && warsawBusinessDateYmd(startAt) !== businessDateYmd) {
          throw error(409, 'WORKDAY_DATE_CHANGE_REQUIRES_SEPARATE_MODE', 'Zmiana daty dnia wymaga osobnego trybu korekty daty.')
        }
        const durationSec = secondsBetween(startAt, endAt)
        if (startAt && endAt && (!durationSec || durationSec > MAX_SESSION_SECONDS)) {
          throw error(409, 'ATTENDANCE_TIME_INVALID', 'STOP sesji musi być późniejszy niż START, a sesja nie może przekraczać 24 godzin.')
        }
        await client.query(
          `update public.workday set start_at = $4::timestamptz, end_at = $5::timestamptz, duration_sec = $6::int,
                  status = case when $5::timestamptz is null then 'RUNNING' else 'CLOSED' end,
                  updated_at = now(), updated_by = $7::text, utility_room_id = $8::text
            where org_id = $1::text and worker_login = $2::text and workday_id = $3::text`,
          [
            orgId,
            workerLogin,
            correction.workdayId,
            startAt,
            endAt,
            durationSec,
            uid,
            Object.prototype.hasOwnProperty.call(correction, 'zoneId')
              ? zone?.id ?? null
              : text(current.utility_room_id, 64) || null,
          ],
        )
      }

      for (const correction of input.activityCorrections) {
        if (!eventIds.has(correction.eventId)) throw error(409, 'EVENT_OUTSIDE_DAY', 'Korygowane zdarzenie nie należy do tego dnia.')
        const current = beforeSource.events.find((row) => text(row.event_id, 64) === correction.eventId)
        const zone = await validateZoneCorrection(client, orgId, correction)
        const startAt = Object.prototype.hasOwnProperty.call(correction, 'startAt') ? correction.startAt : isoOrNull(current.start_at)
        const endAt = Object.prototype.hasOwnProperty.call(correction, 'endAt') ? correction.endAt : isoOrNull(current.end_at)
        const durationSec = secondsBetween(startAt, endAt)
        if (startAt && endAt && !durationSec) throw error(409, 'ACTIVITY_TIME_INVALID', 'Koniec zdarzenia musi być późniejszy niż początek.')
        await client.query(
          `update public.event set start_at = $4::timestamptz, end_at = $5::timestamptz, duration_sec = $6::int,
                  status = case when $5::timestamptz is null then 'RUNNING' else 'CLOSED' end,
                  close_marked_at = case when $5::timestamptz is null then null else $5::timestamptz end,
                  zone_id = coalesce($7::text, zone_id), updated_at = now()
            where org_id = $1::text and worker_login = $2::text and event_id = $3::text`,
          [orgId, workerLogin, correction.eventId, startAt, endAt, durationSec, zone?.id ?? null],
        )
      }

      const afterSource = await readDay(client, { orgId, workerLogin, businessDateYmd, forUpdate: true, schemaState })
      const after = exposeSchemaCapabilities(
        buildWorkTimeDay({ ...afterSource, orgId, workerLogin, businessDateYmd }),
        schemaState,
      )
      const hardCodes = new Set(['ACTIVITY_OUTSIDE_SESSION', 'OVERLAPPING_WORK_SESSIONS'])
      const hardIssues = after.issues.filter((entry) => hardCodes.has(entry.code))
      if (hardIssues.length) throw error(409, 'WORK_TIME_DAY_INTEGRITY_CONFLICT', 'Korekta powoduje nakładanie sesji albo zdarzenie poza sesją.', { issues: hardIssues })
      if (input.finalize && !after.canFinalize) {
        throw error(409, 'WORK_TIME_DAY_NOT_FINALIZABLE', 'Nie można zamknąć dnia, dopóki wszystkie sesje i zdarzenia nie są poprawne.', { issues: after.issues })
      }
      const auditId = schemaState.auditReady ? `WT-${crypto.randomUUID()}`.slice(0, 64) : null
      const anchorWorkdayId = text(afterSource.workdays[0]?.workday_id, 64)
      const response = {
        ...after,
        latestCorrection: {
          action: input.finalize ? 'FINALIZE' : 'CORRECT',
          actorUid: uid,
          auditId,
          stored: schemaState.auditReady,
          createdAt: new Date().toISOString(),
          reason: input.reason,
        },
      }
      if (schemaState.auditReady) {
        await client.query(
          `insert into public.workday_reconciliation_audit
            (org_id, audit_id, workday_id, idempotency_key, request_hash, action, reason, actor_uid,
             before_snapshot, after_snapshot, response_snapshot, created_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())`,
          [orgId, auditId, anchorWorkdayId, input.idempotencyKey, hash, input.finalize ? 'FINALIZE' : 'CORRECT', input.reason, uid,
            JSON.stringify(before), JSON.stringify(after), JSON.stringify(response)],
        )
      }
      await client.query('commit')
      return response
    } catch (cause) {
      await client.query('rollback')
      throw cause
    }
  }

  return { list, read, reconcile }
}

function isoOrNull(value) {
  const parsed = value ? new Date(value) : null
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

module.exports = {
  createWorkTimeDaysRepository,
  normalizeInput,
  requestHash,
}
