const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const {
  AUDIT_SEQUENCE_NAME,
  REQUIRED_CONSTRAINTS,
  REQUIRED_INDEXES,
  hasRequiredConstraints,
  hasRequiredIndexes,
  hasRequiredSequencePrivileges,
  hasRequiredTablePrivileges,
} = require('../scripts/migrate-facility-manager-object')

test('facility-manager object migration is additive and does not reuse client or service_object', () => {
  const root = path.join(__dirname, '..')
  const migration = fs.readFileSync(path.join(root, 'dataconnect', 'migrations', '20260827_facility_manager_object_additive.sql'), 'utf8')
  assert.match(migration, /create table if not exists public\.facility_manager_object/i)
  assert.match(migration, /create table if not exists public\.facility_manager_object_audit/i)
  assert.match(migration, /references public\.organizations \(org_id\)/i)
  assert.match(migration, /unique \(org_id, created_by_uid, create_request_key\)/i)
  assert.match(migration, /grant select, insert, update on table public\.facility_manager_object to portal_app/i)
  assert.match(migration, /set local lock_timeout = '5s'/i)
  assert.match(migration, /set local statement_timeout = '60s'/i)
  assert.doesNotMatch(migration, /service_object/i)
  assert.doesNotMatch(migration, /public\.client/i)
})

test('preflight contains read-only relation, constraint, and index checks', () => {
  const root = path.join(__dirname, '..')
  const preflight = fs.readFileSync(path.join(root, 'registration-functions', 'sql', '20260827_facility_manager_object_preflight.sql'), 'utf8')
  assert.match(preflight, /information_schema\.tables/i)
  assert.match(preflight, /pg_constraint/i)
  assert.match(preflight, /pg_index/i)
  assert.doesNotMatch(preflight, /\b(insert|update|delete|alter|create|drop)\b/i)
})

test('dedicated migration runner stays audit-first and requires a scoped production confirmation', () => {
  const root = path.join(__dirname, '..')
  const runner = fs.readFileSync(path.join(root, 'scripts', 'migrate-facility-manager-object.js'), 'utf8')
  const packageJson = fs.readFileSync(path.join(root, 'package.json'), 'utf8')
  assert.match(runner, /const audit = !apply/)
  assert.match(runner, /CLZ-DB-20260827-FACILITY-MANAGER-OBJECT-01/)
  assert.match(runner, /PROJECT_MISMATCH/)
  assert.match(runner, /DATABASE_MISMATCH/)
  assert.match(runner, /BEGIN TRANSACTION READ ONLY/)
  assert.match(runner, /pg_get_constraintdef/)
  assert.match(runner, /pg_get_indexdef/)
  assert.match(runner, /has_table_privilege/)
  assert.match(runner, /has_sequence_privilege/)
  assert.match(runner, /FACILITY_MANAGER_OBJECT_RUNTIME_ROLE_NOT_READY/)
  assert.match(packageJson, /migrate:facility-manager-object/)
})

test('postflight refuses a same-named but incompatible table, index, or grant', () => {
  const constraints = REQUIRED_CONSTRAINTS.map((requirement) => ({
    table_name: requirement.tableName,
    constraint_name: requirement.constraintName,
    constraint_type: requirement.constraintType,
    is_validated: true,
    definition: requirement.definitionIncludes.join(' '),
  }))
  const indexes = REQUIRED_INDEXES.map((requirement) => ({
    index_name: requirement.indexName,
    is_unique: false,
    is_valid: true,
    is_ready: true,
    definition: requirement.definitionIncludes.join(' '),
  }))
  const grants = [
    { table_name: 'facility_manager_object', role_exists: true, can_select: true, can_insert: true, can_update: true },
    { table_name: 'facility_manager_object_audit', role_exists: true, can_select: false, can_insert: true, can_update: false },
  ]
  const sequencePrivileges = [{ sequence_name: AUDIT_SEQUENCE_NAME, role_exists: true, can_usage: true, can_select: true }]

  assert.equal(hasRequiredConstraints(constraints), true)
  assert.equal(hasRequiredIndexes(indexes), true)
  assert.equal(hasRequiredTablePrivileges(grants), true)
  assert.equal(hasRequiredSequencePrivileges(sequencePrivileges), true)

  constraints[0].definition = 'primary key (object_id)'
  indexes[0].is_ready = false
  grants[0].can_update = false
  sequencePrivileges[0].can_usage = false

  assert.equal(hasRequiredConstraints(constraints), false)
  assert.equal(hasRequiredIndexes(indexes), false)
  assert.equal(hasRequiredTablePrivileges(grants), false)
  assert.equal(hasRequiredSequencePrivileges(sequencePrivileges), false)
})
