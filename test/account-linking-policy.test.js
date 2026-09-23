'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  ACCOUNT_LINKING_REQUIRED,
  ACCOUNT_LINKING_REVIEW_REQUIRED,
  AccountLinkingError,
  assertNoAccountLinkingRequired,
  findAccountLinkingCandidates,
  resolveAccountLinkingRequirement,
  verifiedIdentity,
} = require('../account-linking-policy')

test('only a verified normalized email can start account-link discovery', () => {
  assert.equal(verifiedIdentity({ uid: 'new-uid', email: 'Owner@Example.PL', email_verified: false }), null)
  assert.equal(verifiedIdentity({ uid: '', email: 'owner@example.pl', email_verified: true }), null)
  assert.deepEqual(
    verifiedIdentity({ uid: ' new-uid ', email: ' Owner@Example.PL ', email_verified: true }),
    { uid: 'new-uid', email: 'owner@example.pl' },
  )
})

test('candidate lookup is self-excluding, active-only and parameterized', async () => {
  let observed
  const client = {
    async query(sql, params) {
      observed = { sql, params }
      return { rows: [{ canonical_uid: 'legacy-uid', org_id: 'bestclean' }] }
    },
  }
  const rows = await findAccountLinkingCandidates(client, {
    uid: 'google-duplicate-uid',
    email: 'biuro@bestclean.pl',
    email_verified: true,
  })

  assert.equal(rows.length, 1)
  assert.deepEqual(observed.params, ['google-duplicate-uid', 'biuro@bestclean.pl'])
  assert.match(observed.sql, /m\.uid <> \$1::text/)
  assert.match(observed.sql, /m\.status = 'ACTIVE'/)
  assert.match(observed.sql, /w\.auth_uid = m\.uid/)
  assert.match(observed.sql, /lower\(btrim\(coalesce\(w\.login_email/)
  assert.doesNotMatch(observed.sql, /biuro@bestclean\.pl/)
})

test('unverified identity performs no database lookup', async () => {
  let calls = 0
  const rows = await findAccountLinkingCandidates({
    async query() {
      calls += 1
      return { rows: [] }
    },
  }, { uid: 'uid', email: 'owner@example.pl', email_verified: false })
  assert.deepEqual(rows, [])
  assert.equal(calls, 0)
})

test('one canonical UID requires linking even when it has multiple organizations', () => {
  assert.deepEqual(resolveAccountLinkingRequirement([
    { canonical_uid: 'legacy-uid', org_id: 'bestclean' },
    { canonical_uid: 'legacy-uid', org_id: 'second-org' },
  ]), { status: ACCOUNT_LINKING_REQUIRED, candidateCount: 1 })
})

test('multiple canonical UIDs fail closed for manual review', () => {
  assert.deepEqual(resolveAccountLinkingRequirement([
    { canonical_uid: 'legacy-uid' },
    { canonical_uid: 'other-uid' },
  ]), { status: ACCOUNT_LINKING_REVIEW_REQUIRED, candidateCount: 2 })
})

test('onboarding guard blocks linking and review cases but allows a new email', async () => {
  const client = {
    async query(_sql, params) {
      if (params[1] === 'new@example.pl') return { rows: [] }
      return { rows: [{ canonical_uid: 'legacy-uid' }] }
    },
  }
  await assert.doesNotReject(() => assertNoAccountLinkingRequired(client, {
    uid: 'new-uid', email: 'new@example.pl', email_verified: true,
  }))
  await assert.rejects(
    () => assertNoAccountLinkingRequired(client, {
      uid: 'duplicate-uid', email: 'owner@example.pl', email_verified: true,
    }),
    (error) => error instanceof AccountLinkingError && error.code === ACCOUNT_LINKING_REQUIRED && error.statusCode === 409,
  )
})
