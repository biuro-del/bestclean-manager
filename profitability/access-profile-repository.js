'use strict'

const {
  OBJECT_ACTIONS,
  OBJECT_SCOPES,
  evaluateProfitabilityObjectAccess,
  evaluateProfitabilityWriteAccess,
  resolveProfitabilityAccessProfile,
} = require('./access-profile-v2')

const REQUIRED_ACCESS_PROFILE_RELATIONS = Object.freeze([
  'public.profitability_access_enforcement',
  'public.organization_access_profile',
  'public.service_object_assignment',
  'public.profitability_target_history',
])

const REQUIRED_ACCESS_PROFILE_COLUMNS = Object.freeze({
  profitability_access_enforcement: Object.freeze([
    'org_id', 'schema_version', 'enforced_at', 'enforced_by_uid', 'reason',
  ]),
  organization_access_profile: Object.freeze([
    'org_id', 'profile_id', 'uid', 'operational_profile', 'object_scope', 'worker_scope',
    'finance_profile', 'access_mode', 'can_edit_operational_costs',
    'can_edit_contract_terms', 'can_edit_profitability_targets',
    'can_view_worker_rates', 'can_edit_worker_rates', 'valid_from', 'valid_to',
    'revoked_at',
  ]),
  service_object_assignment: Object.freeze([
    'org_id', 'assignment_id', 'uid', 'object_id', 'assignment_role', 'access_mode',
    'valid_from', 'valid_to', 'revoked_at',
  ]),
  profitability_target_history: Object.freeze([
    'org_id', 'object_id', 'target_id', 'minimum_result_minor',
    'minimum_margin_bps', 'currency', 'target_policy', 'effective_from',
    'effective_to', 'revoked_at',
  ]),
})

const REQUIRED_ACCESS_PROFILE_COLUMN_RULES = Object.freeze({
  'profitability_access_enforcement.org_id': ['character varying', 'NO', 64],
  'profitability_access_enforcement.schema_version': ['character varying', 'NO', 8],
  'profitability_access_enforcement.enforced_at': ['timestamp with time zone', 'NO', null],
  'profitability_access_enforcement.enforced_by_uid': ['character varying', 'NO', 128],
  'profitability_access_enforcement.reason': ['text', 'NO', null],
  'organization_access_profile.org_id': ['character varying', 'NO', 64],
  'organization_access_profile.profile_id': ['character varying', 'NO', 64],
  'organization_access_profile.uid': ['character varying', 'NO', 128],
  'organization_access_profile.operational_profile': ['character varying', 'NO', 32, "'NONE'"],
  'organization_access_profile.object_scope': ['character varying', 'NO', 24, "'NONE'"],
  'organization_access_profile.worker_scope': ['character varying', 'NO', 24, "'NONE'"],
  'organization_access_profile.finance_profile': ['character varying', 'NO', 32, "'NONE'"],
  'organization_access_profile.access_mode': ['character varying', 'NO', 8, "'NONE'"],
  'organization_access_profile.can_edit_operational_costs': ['boolean', 'NO', null, 'false'],
  'organization_access_profile.can_edit_contract_terms': ['boolean', 'NO', null, 'false'],
  'organization_access_profile.can_edit_profitability_targets': ['boolean', 'NO', null, 'false'],
  'organization_access_profile.can_view_worker_rates': ['boolean', 'NO', null, 'false'],
  'organization_access_profile.can_edit_worker_rates': ['boolean', 'NO', null, 'false'],
  'organization_access_profile.valid_from': ['timestamp with time zone', 'NO', null],
  'organization_access_profile.valid_to': ['timestamp with time zone', 'YES', null],
  'organization_access_profile.revoked_at': ['timestamp with time zone', 'YES', null],
  'service_object_assignment.org_id': ['character varying', 'NO', 64],
  'service_object_assignment.assignment_id': ['character varying', 'NO', 64],
  'service_object_assignment.uid': ['character varying', 'NO', 128],
  'service_object_assignment.object_id': ['character varying', 'NO', 64],
  'service_object_assignment.assignment_role': ['character varying', 'NO', 32],
  'service_object_assignment.access_mode': ['character varying', 'NO', 8, "'DENY'"],
  'service_object_assignment.valid_from': ['timestamp with time zone', 'NO', null],
  'service_object_assignment.valid_to': ['timestamp with time zone', 'YES', null],
  'service_object_assignment.revoked_at': ['timestamp with time zone', 'YES', null],
  'profitability_target_history.org_id': ['character varying', 'NO', 64],
  'profitability_target_history.object_id': ['character varying', 'NO', 64],
  'profitability_target_history.target_id': ['character varying', 'NO', 64],
  'profitability_target_history.minimum_result_minor': ['bigint', 'YES', null],
  'profitability_target_history.minimum_margin_bps': ['integer', 'YES', null],
  'profitability_target_history.currency': ['character', 'YES', 3],
  'profitability_target_history.target_policy': ['character varying', 'NO', 24, "'ALL_DEFINED'"],
  'profitability_target_history.effective_from': ['date', 'NO', null],
  'profitability_target_history.effective_to': ['date', 'YES', null],
  'profitability_target_history.revoked_at': ['timestamp with time zone', 'YES', null],
})

const REQUIRED_ACCESS_PROFILE_CONSTRAINTS = Object.freeze({
  profitability_access_enforcement: Object.freeze([
    'profitability_access_enforcement_org_fk',
    'profitability_access_enforcement_version_check',
    'profitability_access_enforcement_reason_check',
  ]),
  organization_access_profile: Object.freeze([
    'organization_access_profile_member_fk',
    'organization_access_profile_none_is_empty_check',
    'organization_access_profile_finance_capabilities_check',
  ]),
  service_object_assignment: Object.freeze([
    'service_object_assignment_object_fk',
    'service_object_assignment_member_fk',
  ]),
  profitability_target_history: Object.freeze([
    'profitability_target_history_object_fk',
    'profitability_target_history_values_check',
    'profitability_target_history_policy_check',
    'profitability_target_history_no_overlap',
  ]),
})

const REQUIRED_ACCESS_PROFILE_CONSTRAINT_RULES = Object.freeze({
  'profitability_access_enforcement.profitability_access_enforcement_org_fk': ['f', 'foreign key (org_id) references organizations(org_id)'],
  'profitability_access_enforcement.profitability_access_enforcement_version_check': ['c', "check (schema_version = 'v2')"],
  'profitability_access_enforcement.profitability_access_enforcement_reason_check': ['c', "check (nullif(btrim(reason), '') is not null)"],
  'organization_access_profile.organization_access_profile_member_fk': ['f', 'foreign key (org_id, uid) references organization_member(org_id, uid)'],
  'organization_access_profile.organization_access_profile_none_is_empty_check': ['c', "check (access_mode <> 'NONE' or (operational_profile = 'NONE' and object_scope = 'NONE' and worker_scope = 'NONE' and finance_profile = 'NONE' and can_edit_operational_costs is false and can_edit_contract_terms is false and can_edit_profitability_targets is false and can_view_worker_rates is false and can_edit_worker_rates is false))"],
  'organization_access_profile.organization_access_profile_finance_capabilities_check': ['c', "check ((finance_profile = 'NONE' and can_edit_operational_costs is false and can_edit_contract_terms is false and can_edit_profitability_targets is false and can_view_worker_rates is false and can_edit_worker_rates is false) or (finance_profile = 'COST_CONTROL' and can_edit_contract_terms is false and can_edit_profitability_targets is false and can_view_worker_rates is false and can_edit_worker_rates is false) or finance_profile = 'OWNER_FULL')"],
  'service_object_assignment.service_object_assignment_object_fk': ['f', 'foreign key (org_id, object_id) references service_object(org_id, object_id)'],
  'service_object_assignment.service_object_assignment_member_fk': ['f', 'foreign key (org_id, uid) references organization_member(org_id, uid)'],
  'profitability_target_history.profitability_target_history_object_fk': ['f', 'foreign key (org_id, object_id) references service_object(org_id, object_id)'],
  'profitability_target_history.profitability_target_history_values_check': ['c', 'check (minimum_result_minor is not null or minimum_margin_bps is not null)'],
  'profitability_target_history.profitability_target_history_policy_check': ['c', "check (target_policy = 'ALL_DEFINED')"],
  'profitability_target_history.profitability_target_history_no_overlap': ['x', "exclude using gist (org_id with =, object_id with =, daterange(effective_from, coalesce(effective_to, 'infinity'), '[)') with &&) where (revoked_at is null)"],
})

const REQUIRED_ACCESS_PROFILE_INDEXES = Object.freeze([
  'organization_access_profile_active_uid_idx',
  'organization_access_profile_lookup_idx',
  'service_object_assignment_active_scope_idx',
  'service_object_assignment_member_lookup_idx',
  'service_object_assignment_object_lookup_idx',
  'profitability_target_history_lookup_idx',
])

const REQUIRED_ACCESS_PROFILE_INDEX_RULES = Object.freeze({
  organization_access_profile_active_uid_idx: ['organization_access_profile', true, 'create unique index organization_access_profile_active_uid_idx on organization_access_profile using btree (org_id, uid) where (revoked_at is null)'],
  organization_access_profile_lookup_idx: ['organization_access_profile', false, 'create index organization_access_profile_lookup_idx on organization_access_profile using btree (org_id, uid, access_mode, valid_from, valid_to) where (revoked_at is null)'],
  service_object_assignment_active_scope_idx: ['service_object_assignment', true, 'create unique index service_object_assignment_active_scope_idx on service_object_assignment using btree (org_id, object_id, uid, assignment_role) where (revoked_at is null)'],
  service_object_assignment_member_lookup_idx: ['service_object_assignment', false, 'create index service_object_assignment_member_lookup_idx on service_object_assignment using btree (org_id, uid, access_mode, object_id, valid_from, valid_to) where (revoked_at is null)'],
  service_object_assignment_object_lookup_idx: ['service_object_assignment', false, 'create index service_object_assignment_object_lookup_idx on service_object_assignment using btree (org_id, object_id, access_mode, uid, valid_from, valid_to) where (revoked_at is null)'],
  profitability_target_history_lookup_idx: ['profitability_target_history', false, 'create index profitability_target_history_lookup_idx on profitability_target_history using btree (org_id, object_id, effective_from desc, effective_to) where (revoked_at is null)'],
})

class ProfitabilityAccessProfileError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'ProfitabilityAccessProfileError'
    this.code = code
    this.statusCode = code === 'OBJECT_NOT_ASSIGNED' ? 404 : 403
    this.details = details
  }
}

function text(value) {
  return String(value ?? '').trim()
}

function normalizedDefinition(value) {
  return text(value)
    .toLowerCase()
    .replace(/"/g, '')
    .replace(/public\./g, '')
    .replace(/::(?:character varying|text|name|date|integer|bigint|boolean|timestamp with time zone)/g, '')
    .replace(/[()]/g, '')
    .replace(/\s+/g, '')
}

function identifier(value, field, maxLength = 128) {
  const normalized = text(value)
  if (!normalized || normalized.length > maxLength || /[\u0000-\u001f]/.test(normalized)) {
    throw new TypeError(`Invalid ${field}.`)
  }
  return normalized
}

function activeStatus(row) {
  if (!row || row.revoked_at) return 'REVOKED'
  return 'ACTIVE'
}

function mapMembership(row) {
  if (!row) return undefined
  return {
    orgId: row.org_id,
    uid: row.uid,
    role: row.role,
    status: text(row.status).toUpperCase(),
  }
}

function mapBinding(row) {
  if (!row) return undefined
  return {
    orgId: row.org_id,
    uid: row.uid,
    status: activeStatus(row),
    operationalProfile: row.operational_profile,
    objectScope: row.object_scope,
    workerScope: row.worker_scope,
    financeProfile: row.finance_profile,
    accessMode: row.access_mode,
    canEditOperationalCosts: row.can_edit_operational_costs === true,
    canEditContractTerms: row.can_edit_contract_terms === true,
    canEditProfitabilityTargets: row.can_edit_profitability_targets === true,
    canViewWorkerRates: row.can_view_worker_rates === true,
    canEditWorkerRates: row.can_edit_worker_rates === true,
    validFrom: row.valid_from,
    validUntil: row.valid_to,
  }
}

function mapAssignments(rows) {
  return (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const objectId = text(row.object_id)
    if (!objectId) return []
    return [{
      orgId: row.org_id,
      uid: row.uid,
      objectId,
      accessMode: text(row.access_mode).toUpperCase(),
      status: activeStatus(row),
      validFrom: row.valid_from,
      validUntil: row.valid_to,
    }]
  })
}

function assertDatabaseClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new TypeError('A PostgreSQL client is required.')
  }
  return client
}

class ProfitabilityAccessProfileRepository {
  constructor(client) {
    this.client = assertDatabaseClient(client)
    this.cache = new Map()
  }

  async schemaReady() {
    const relationResult = await this.client.query(
      `select to_regclass('public.profitability_access_enforcement') is not null as enforcement,
              to_regclass('public.organization_access_profile') is not null as access_profile,
              to_regclass('public.service_object_assignment') is not null as object_assignment,
              to_regclass('public.profitability_target_history') is not null as target_history`,
    )
    const row = relationResult.rows[0] ?? {}
    const missing = []
    if (row.enforcement !== true) missing.push(REQUIRED_ACCESS_PROFILE_RELATIONS[0])
    if (row.access_profile !== true) missing.push(REQUIRED_ACCESS_PROFILE_RELATIONS[1])
    if (row.object_assignment !== true) missing.push(REQUIRED_ACCESS_PROFILE_RELATIONS[2])
    if (row.target_history !== true) missing.push(REQUIRED_ACCESS_PROFILE_RELATIONS[3])

    // Avoid querying catalogs and privileges with missing regclass targets.
    // PostgreSQL can throw here instead of returning false, which would turn a
    // controlled module-level deny into an unrelated request/session failure.
    if (missing.length > 0) return { ready: false, missing }

    const boundaryResult = await this.client.query(
      `select has_schema_privilege(current_user, 'public', 'USAGE') as schema_usage,
              not has_schema_privilege(current_user, 'public', 'CREATE') as no_schema_create,
              exists (select 1 from pg_extension where extname = 'btree_gist') as extension_ready`,
    )
    const boundary = boundaryResult.rows[0] ?? {}
    if (boundary.schema_usage !== true) missing.push('runtime:public.SCHEMA_USAGE')
    if (boundary.no_schema_create !== true) missing.push('runtime:public.SCHEMA_CREATE_EXCESS')
    if (boundary.extension_ready !== true) missing.push('extension:btree_gist')

    const columnResult = await this.client.query(
      `select table_name, column_name, data_type, is_nullable,
              character_maximum_length, column_default
         from information_schema.columns
        where table_schema = 'public'
          and table_name = any($1::text[])`,
      [Object.keys(REQUIRED_ACCESS_PROFILE_COLUMNS)],
    )
    const actualColumns = new Map(
      columnResult.rows.map((entry) => [`${entry.table_name}.${entry.column_name}`, entry]),
    )
    for (const [fingerprint, rule] of Object.entries(REQUIRED_ACCESS_PROFILE_COLUMN_RULES)) {
      const actual = actualColumns.get(fingerprint)
      const [dataType, nullable, maximumLength, defaultToken] = rule
      const matches = actual
        && text(actual.data_type).toLowerCase() === dataType
        && text(actual.is_nullable).toUpperCase() === nullable
        && (maximumLength === null || Number(actual.character_maximum_length) === maximumLength)
        && (defaultToken === undefined
          || normalizedDefinition(actual.column_default).includes(normalizedDefinition(defaultToken)))
      if (!matches) missing.push(`column:${fingerprint}`)
    }

    const constraintResult = await this.client.query(
      `select relation.relname as table_name, constraint_row.conname as constraint_name,
              constraint_row.contype as constraint_type,
              constraint_row.convalidated as validated,
              pg_get_constraintdef(constraint_row.oid, true) as definition
         from pg_constraint constraint_row
         join pg_class relation on relation.oid = constraint_row.conrelid
         join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = any($1::text[])`,
      [Object.keys(REQUIRED_ACCESS_PROFILE_CONSTRAINTS)],
    )
    const actualConstraints = new Map(
      constraintResult.rows.map((entry) => [`${entry.table_name}.${entry.constraint_name}`, entry]),
    )
    for (const [fingerprint, rule] of Object.entries(REQUIRED_ACCESS_PROFILE_CONSTRAINT_RULES)) {
      const actual = actualConstraints.get(fingerprint)
      const [constraintType, expectedDefinition] = rule
      const definition = normalizedDefinition(actual?.definition)
      const matches = actual?.validated === true
        && text(actual.constraint_type) === constraintType
        && definition === normalizedDefinition(expectedDefinition)
      if (!matches) missing.push(`constraint:${fingerprint}`)
    }

    const indexResult = await this.client.query(
      `select index_row.relname as index_name, relation.relname as table_name,
              index_meta.indisunique as is_unique,
              index_meta.indisvalid as is_valid,
              index_meta.indisready as is_ready,
              pg_get_indexdef(index_meta.indexrelid, 0, true) as definition
         from pg_index index_meta
         join pg_class index_row on index_row.oid = index_meta.indexrelid
         join pg_class relation on relation.oid = index_meta.indrelid
         join pg_namespace namespace on namespace.oid = index_row.relnamespace
        where namespace.nspname = 'public'
          and index_row.relkind = 'i'
          and index_row.relname = any($1::text[])`,
      [REQUIRED_ACCESS_PROFILE_INDEXES],
    )
    const actualIndexes = new Map(indexResult.rows.map((entry) => [entry.index_name, entry]))
    for (const [indexName, rule] of Object.entries(REQUIRED_ACCESS_PROFILE_INDEX_RULES)) {
      const actual = actualIndexes.get(indexName)
      const [tableName, isUnique, expectedDefinition] = rule
      const definition = normalizedDefinition(actual?.definition)
      const matches = actual?.table_name === tableName
        && actual?.is_unique === isUnique
        && actual?.is_valid === true
        && actual?.is_ready === true
        && definition === normalizedDefinition(expectedDefinition)
      if (!matches) missing.push(`index:public.${indexName}`)
    }

    const privilegeResult = await this.client.query(
      `select relation_name,
              has_table_privilege(current_user, relation_name, 'SELECT') as ready,
              has_table_privilege(current_user, relation_name, 'INSERT')
                or has_table_privilege(current_user, relation_name, 'UPDATE')
                or has_table_privilege(current_user, relation_name, 'DELETE')
                or has_table_privilege(current_user, relation_name, 'TRUNCATE')
                or has_table_privilege(current_user, relation_name, 'REFERENCES')
                or has_table_privilege(current_user, relation_name, 'TRIGGER') as excessive
         from unnest($1::text[]) as required(relation_name)`,
      [REQUIRED_ACCESS_PROFILE_RELATIONS],
    )
    const privilegeByRelation = new Map(
      privilegeResult.rows.map((entry) => [entry.relation_name, entry]),
    )
    for (const relationName of REQUIRED_ACCESS_PROFILE_RELATIONS) {
      const privilege = privilegeByRelation.get(relationName)
      if (privilege?.ready !== true) {
        missing.push(`privilege:${relationName}.SELECT`)
      }
      if (privilege?.excessive === true) missing.push(`privilege:${relationName}.DML_EXCESS`)
    }

    return { ready: missing.length === 0, missing }
  }

  async resolve({ orgId, uid, now = new Date(), refresh = false }) {
    const normalizedOrgId = identifier(orgId, 'orgId', 64)
    const normalizedUid = identifier(uid, 'uid')
    const explicitAccessTime = arguments[0]?.now !== undefined
    const nowDate = now instanceof Date ? now : new Date(now)
    if (!Number.isFinite(nowDate.getTime())) throw new TypeError('Invalid access time.')

    // The repository is request-scoped. Calls without an explicit audit time
    // must share one decision instead of re-querying membership, binding and
    // assignments for every object in the same response.
    const cacheTime = explicitAccessTime ? nowDate.toISOString() : 'request'
    const cacheKey = `${normalizedOrgId}\u0000${normalizedUid}\u0000${cacheTime}`
    if (!refresh && this.cache.has(cacheKey)) return this.cache.get(cacheKey)

    const [membershipResult, bindingResult, assignmentResult] = await Promise.all([
      this.client.query(
        `select org_id, uid, role, status
           from public.organization_member
          where org_id = $1
            and uid = $2
          limit 2`,
        [normalizedOrgId, normalizedUid],
      ),
      this.client.query(
        `select org_id, uid, operational_profile, object_scope, worker_scope,
                finance_profile, access_mode, can_edit_operational_costs,
                can_edit_contract_terms, can_edit_profitability_targets,
                can_view_worker_rates, can_edit_worker_rates,
                valid_from, valid_to, revoked_at
           from public.organization_access_profile
          where org_id = $1
            and uid = $2
            and revoked_at is null
          order by valid_from desc, profile_id desc
          limit 2`,
        [normalizedOrgId, normalizedUid],
      ),
      this.client.query(
        `select org_id, uid, object_id, assignment_role, access_mode,
                valid_from, valid_to, revoked_at
           from public.service_object_assignment
          where org_id = $1
            and uid = $2
            and revoked_at is null
          order by object_id, assignment_id`,
        [normalizedOrgId, normalizedUid],
      ),
    ])

    let decision
    if (membershipResult.rows.length !== 1) {
      decision = resolveProfitabilityAccessProfile({
        requestOrgId: normalizedOrgId,
        authenticatedOrgId: normalizedOrgId,
        authenticatedUid: normalizedUid,
        membership: undefined,
        binding: undefined,
        now: nowDate,
      })
    } else if (bindingResult.rows.length > 1) {
      decision = {
        ...resolveProfitabilityAccessProfile({
          requestOrgId: normalizedOrgId,
          authenticatedOrgId: normalizedOrgId,
          authenticatedUid: normalizedUid,
          membership: mapMembership(membershipResult.rows[0]),
          binding: undefined,
          now: nowDate,
        }),
        code: 'ACCESS_BINDING_AMBIGUOUS',
      }
    } else {
      const binding = mapBinding(bindingResult.rows[0])
      decision = resolveProfitabilityAccessProfile({
        requestOrgId: normalizedOrgId,
        authenticatedOrgId: normalizedOrgId,
        authenticatedUid: normalizedUid,
        membership: mapMembership(membershipResult.rows[0]),
        binding,
        trustedObjectAssignments: mapAssignments(assignmentResult.rows),
        now: nowDate,
      })
      if (decision.allowed && binding?.operationalProfile) {
        decision = { ...decision, operationalProfile: binding.operationalProfile }
      }
    }

    this.cache.set(cacheKey, Object.freeze(decision))
    return decision
  }

  async assertRead({ orgId, uid, objectId = '', now }) {
    const decision = await this.resolve({ orgId, uid, now })
    if (!decision.allowed) this.throwDenied(decision)

    const normalizedObjectId = text(objectId)
    if (!normalizedObjectId) {
      if (
        decision.objectScope === OBJECT_SCOPES.ASSIGNED
        && decision.assignedObjectIds.length === 0
      ) {
        this.throwDenied({ ...decision, code: 'OBJECT_ASSIGNMENT_REQUIRED' })
      }
      return decision
    }

    const objectAccess = evaluateProfitabilityObjectAccess(decision, {
      objectId: normalizedObjectId,
      action: OBJECT_ACTIONS.READ,
    })
    if (!objectAccess.allowed) this.throwDenied({ ...decision, ...objectAccess })
    return decision
  }

  async assertWrite({ orgId, uid, objectId, writeKind, now }) {
    const decision = await this.resolve({ orgId, uid, now })
    if (!decision.allowed) this.throwDenied(decision)
    const writeAccess = evaluateProfitabilityWriteAccess(decision, { objectId, writeKind })
    if (!writeAccess.allowed) this.throwDenied({ ...decision, ...writeAccess })
    return decision
  }

  throwDenied(decision) {
    throw new ProfitabilityAccessProfileError(
      decision?.code || 'PROFITABILITY_ACCESS_DENIED',
      'Brak dostępu do tego zakresu danych rentowności.',
      {
        financeProfile: decision?.financeProfile ?? null,
        objectScope: decision?.objectScope ?? null,
        orgId: decision?.orgId ?? null,
      },
    )
  }
}

function createProfitabilityAccessProfileRepository(client) {
  return new ProfitabilityAccessProfileRepository(client)
}

module.exports = {
  ProfitabilityAccessProfileError,
  ProfitabilityAccessProfileRepository,
  REQUIRED_ACCESS_PROFILE_COLUMNS,
  REQUIRED_ACCESS_PROFILE_COLUMN_RULES,
  REQUIRED_ACCESS_PROFILE_CONSTRAINTS,
  REQUIRED_ACCESS_PROFILE_CONSTRAINT_RULES,
  REQUIRED_ACCESS_PROFILE_INDEXES,
  REQUIRED_ACCESS_PROFILE_INDEX_RULES,
  REQUIRED_ACCESS_PROFILE_RELATIONS,
  createProfitabilityAccessProfileRepository,
  mapAssignments,
}
