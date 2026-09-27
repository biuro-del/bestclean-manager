'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  EXPECTED,
  resolveOptions,
  runApply,
  runAudit,
  safeFailureReport,
  validateState,
} = require('../scripts/lib/profitability-bestclean-catalog-hygiene')
const { main } = require('../scripts/apply-profitability-bestclean-catalog-hygiene')

const HEAD = '1'.repeat(40)

function sourceRows(phase = 'before', unassignedZoneRefs = 941) {
  return [
    {
      client_id: EXPECTED.legacyIndividualClientId,
      name: null,
      status: phase === 'before' ? 'Aktywny' : 'Nieaktywny',
      client_type: null,
      zone_refs: 0,
      task_refs: 0,
    },
    {
      client_id: phase === 'before' ? EXPECTED.malformedPamClientId : EXPECTED.canonicalPamClientId,
      name: phase === 'before' ? EXPECTED.malformedPamClientId : EXPECTED.canonicalPamClientId,
      status: 'Aktywny',
      client_type: 'CYKLICZNY',
      zone_refs: 0,
      task_refs: 0,
    },
    {
      client_id: EXPECTED.legacyUnassignedClientId,
      name: null,
      status: phase === 'before' ? 'Aktywny' : 'Nieaktywny',
      client_type: 'CYKLICZNY',
      zone_refs: unassignedZoneRefs,
      task_refs: 0,
    },
  ]
}

function snapshot() {
  return {
    source: { head: HEAD, clean: true, remoteContainsHead: true },
    cloud: {
      project: EXPECTED.project,
      instance: EXPECTED.instance,
      region: EXPECTED.region,
      state: 'RUNNABLE',
      backup: { id: EXPECTED.backupId, status: 'SUCCESSFUL' },
      gates: { allDisabled: true, allowlistCount: 0 },
    },
    database: {
      database: EXPECTED.database,
      pgMajor: 17,
      primary: true,
      readWrite: true,
      foundationExact: false,
      foundationStatus: 'verification_required',
      roleGraphExact: true,
      accessSourceReferences: { status: 'exact' },
      sourceReadBridge: { status: 'exact' },
      accessProfile: { status: 'verification_required' },
      financialModel: { status: 'verification_required' },
    },
  }
}

class FakeClient {
  constructor({ phase = 'before', invalidCount = 0, changeZoneRefs = false } = {}) {
    this.phase = phase
    this.invalidCount = invalidCount
    this.changeZoneRefs = changeZoneRefs
    this.events = []
  }

  async query(sql, params) {
    const statement = String(sql).trim()
    this.events.push(statement)
    if (statement.startsWith('select current_user')) {
      return { rows: [{ current_user: EXPECTED.sourceOwner, session_user: 'biuro@bestclean.pl', client_owner: EXPECTED.sourceOwner }] }
    }
    if (statement.includes('profitability-bestclean-catalog-hygiene:state')) {
      const zoneRefs = this.phase === 'after' && this.changeZoneRefs ? 942 : 941
      return { rows: sourceRows(this.phase, zoneRefs) }
    }
    if (statement.startsWith('update public.client')) {
      if (params?.[1] === EXPECTED.legacyUnassignedClientId) this.phase = 'after'
      return { rows: [], rowCount: 1 }
    }
    if (statement.startsWith('select count(*)::integer as invalid_count')) {
      return { rows: [{ invalid_count: this.invalidCount }] }
    }
    return { rows: [], rowCount: 0 }
  }

  async end() { this.events.push('END') }
}

function deps(client, snapshotValue = snapshot()) {
  return {
    environment: { async inspect() { return snapshotValue } },
    connections: { async openSourceReader() { return client } },
    async close() {},
  }
}

function applyOptions() {
  return resolveOptions([
    '--apply', '--expected-head', HEAD,
    '--confirmation', EXPECTED.confirmation,
  ])
}

test('argument parser rejects secret-bearing flags and wrong confirmation', () => {
  assert.throws(() => resolveOptions(['--password', 'x']), /SECRET_ARGUMENT_FORBIDDEN/)
  assert.throws(
    () => resolveOptions(['--apply', '--expected-head', HEAD, '--confirmation', 'WRONG']),
    /CONFIRMATION_MISMATCH/,
  )
})

test('state validator accepts only exact before or after shapes', () => {
  assert.equal(validateState(sourceRows('before')).phase, 'before')
  assert.equal(validateState(sourceRows('after')).phase, 'after')
  const invalid = sourceRows('before')
  invalid[0].zone_refs = 1
  assert.throws(() => validateState(invalid), /LEGACY_INDIVIDUAL_ZONE_REFERENCES_PRESENT/)

  const malformedCanonicalName = sourceRows('after')
  malformedCanonicalName[1].name = 'Pam Transport'
  assert.throws(
    () => validateState(malformedCanonicalName),
    /CATALOG_HYGIENE_STATE_NOT_EXACT/,
  )

  const partialStatus = sourceRows('before')
  partialStatus[0].status = 'Nieaktywny'
  assert.throws(
    () => validateState(partialStatus),
    /CATALOG_HYGIENE_STATE_NOT_EXACT/,
  )
})

test('audit is read-only and reports a ready exact before-state', async () => {
  const client = new FakeClient()
  const result = await runAudit(resolveOptions([]), deps(client))
  assert.deepEqual(result, {
    ok: true,
    mode: 'audit',
    phase: 'before',
    readyToApply: true,
    exact: false,
    unassignedZoneRefs: 941,
  })
  assert.equal(client.events.some((entry) => entry.startsWith('update public.client')), false)
  assert.equal(client.events.includes('rollback'), true)
})

test('apply mutates three exact rows in one serializable transaction', async () => {
  const client = new FakeClient()
  const result = await runApply(applyOptions(), deps(client))
  assert.equal(result.changed, true)
  assert.equal(result.exact, true)
  assert.equal(client.events.filter((entry) => entry.startsWith('update public.client')).length, 3)
  assert.equal(client.events.includes('commit'), true)
})

test('apply is idempotent when exact after-state already exists', async () => {
  const client = new FakeClient({ phase: 'after' })
  const result = await runApply(applyOptions(), deps(client))
  assert.equal(result.changed, false)
  assert.equal(client.events.some((entry) => entry.startsWith('update public.client')), false)
})

test('apply rolls back on unexpected active invalid client or reference drift', async () => {
  const invalidClient = new FakeClient({ invalidCount: 1 })
  await assert.rejects(() => runApply(applyOptions(), deps(invalidClient)), /ACTIVE_CLIENT_CATALOG_STILL_INVALID/)
  assert.equal(invalidClient.events.includes('rollback'), true)

  const refDrift = new FakeClient({ changeZoneRefs: true })
  await assert.rejects(() => runApply(applyOptions(), deps(refDrift)), /UNASSIGNED_REFERENCES_CHANGED_DURING_APPLY/)
  assert.equal(refDrift.events.includes('rollback'), true)
})

test('apply fails closed when gates are enabled or worktree is dirty', async () => {
  const gateSnapshot = snapshot()
  gateSnapshot.cloud.gates.allDisabled = false
  await assert.rejects(
    () => runApply(applyOptions(), deps(new FakeClient(), gateSnapshot)),
    /PROFITABILITY_GATES_MUST_REMAIN_OFF/,
  )
  const dirtySnapshot = snapshot()
  dirtySnapshot.source.clean = false
  await assert.rejects(
    () => runApply(applyOptions(), deps(new FakeClient(), dirtySnapshot)),
    /DIRTY_WORKTREE/,
  )
})

test('CLI emits only safe structured failure', async () => {
  let stdout = ''
  let stderr = ''
  const exitCode = await main({
    argv: ['--apply', '--expected-head', HEAD, '--confirmation', 'WRONG'],
    deps: deps(new FakeClient()),
    stdout: { write(value) { stdout += value } },
    stderr: { write(value) { stderr += value } },
  })
  assert.equal(exitCode, 1)
  assert.equal(stdout, '')
  assert.deepEqual(JSON.parse(stderr), {
    ok: false,
    error: 'CONFIRMATION_MISMATCH',
    persistentChange: false,
  })
  assert.deepEqual(safeFailureReport(new Error('sensitive details')), {
    ok: false,
    error: 'CATALOG_HYGIENE_FAILED',
    persistentChange: false,
  })
})
