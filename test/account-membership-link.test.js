'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const {
  LINK_CONFIRMATION,
  assertMembershipLinkGate,
  linkAccountMembership,
} = require('../account-membership-link')

const USER = Object.freeze({
  uid: 'google-uid',
  email: 'biuro@bestclean.pl',
  emailVerified: true,
  disabled: false,
  providers: ['google.com'],
})

const ORGANIZATION_ROWS = Object.freeze([{
  org_id: 'bestclean',
  organization_status: 'ACTIVE',
  organization_deleted_at: null,
  owner_uid: 'owner-uid',
}])

function request(overrides = {}) {
  return {
    confirmation: LINK_CONFIRMATION,
    projectId: 'iclean-room',
    orgId: 'bestclean',
    confirmedOrgId: 'bestclean',
    targetEmail: 'biuro@bestclean.pl',
    confirmedEmail: 'biuro@bestclean.pl',
    confirmedUid: 'google-uid',
    role: 'ADMIN',
    displayName: 'Biuro Best Clean',
    ...overrides,
  }
}

test('membership link gate requires exact confirmations and a verified Google account', () => {
  const plan = assertMembershipLinkGate({
    requested: request(),
    targetUser: USER,
    matchingUserCount: 1,
    membershipRows: [],
    organizationRows: ORGANIZATION_ROWS,
    targetUidReferences: [],
  })
  assert.deepEqual(plan, {
    orgId: 'bestclean',
    uid: 'google-uid',
    targetEmail: 'biuro@bestclean.pl',
    displayName: 'Biuro Best Clean',
    role: 'ADMIN',
    createdByUid: 'owner-uid',
  })

  assert.throws(() => assertMembershipLinkGate({
    requested: request({ confirmedUid: 'wrong' }),
    targetUser: USER,
    matchingUserCount: 1,
    membershipRows: [],
    organizationRows: ORGANIZATION_ROWS,
    targetUidReferences: [],
  }), /LINK_UID_CONFIRMATION_MISMATCH/)
  assert.throws(() => assertMembershipLinkGate({
    requested: request(),
    targetUser: { ...USER, emailVerified: false },
    matchingUserCount: 1,
    membershipRows: [],
    organizationRows: ORGANIZATION_ROWS,
    targetUidReferences: [],
  }), /LINK_VERIFIED_ACTIVE_EMAIL_REQUIRED/)
})

test('membership link gate fails closed for reused email, UID, role or ambiguous owner', () => {
  const base = {
    requested: request(),
    targetUser: USER,
    matchingUserCount: 1,
    membershipRows: [],
    organizationRows: ORGANIZATION_ROWS,
    targetUidReferences: [],
  }
  assert.throws(() => assertMembershipLinkGate({ ...base, membershipRows: [{ uid: 'old' }] }), /LINK_EMAIL_ALREADY_ASSIGNED/)
  assert.throws(() => assertMembershipLinkGate({ ...base, targetUidReferences: [{ table: 'worker' }] }), /LINK_UID_DATABASE_REFERENCES_PRESENT/)
  assert.throws(() => assertMembershipLinkGate({ ...base, requested: request({ role: 'OWNER' }) }), /LINK_ROLE_MUST_BE_ADMIN/)
  assert.throws(() => assertMembershipLinkGate({
    ...base,
    organizationRows: [...ORGANIZATION_ROWS, { ...ORGANIZATION_ROWS[0], owner_uid: 'other-owner' }],
  }), /LINK_EXACT_OWNER_REQUIRED/)
})

function successfulClient({ conflict = false } = {}) {
  const calls = []
  return {
    calls,
    async query(sql, params = []) {
      const statement = String(sql)
      calls.push({ sql: statement, params })
      if (statement.includes('from public.organizations') && statement.includes('for update')) {
        return { rows: [{ org_id: 'bestclean', status: 'ACTIVE', deleted_at: null, owner_uid: 'owner-uid' }], rowCount: 1 }
      }
      if (statement.includes('uid_membership_exists')) {
        return { rows: [{ uid_membership_exists: conflict, uid_worker_exists: false, email_worker_exists: false }], rowCount: 1 }
      }
      if (statement.includes("to_regclass('public.worker_id_reservation')")) {
        return { rows: [{ relation_name: 'worker_id_reservation' }], rowCount: 1 }
      }
      if (statement.includes('from public.worker_id_reservation') && statement.includes('order by worker_number')) {
        return { rows: [{ worker_number: 4, worker_id: 'worker_bestclean_4' }], rowCount: 1 }
      }
      if (statement === 'select worker_id from public.worker where org_id = $1::text') {
        return { rows: [{ worker_id: 'worker_bestclean_3' }], rowCount: 1 }
      }
      if (statement.includes('from public.organization_member m') && statement.includes('join public.worker w')) {
        return {
          rows: [{
            org_id: 'bestclean', uid: 'google-uid', role: 'ADMIN', status: 'ACTIVE',
            worker_id: 'worker_bestclean_5', auth_uid: 'google-uid', login: 'u_bestclean_5',
            login_email: 'biuro@bestclean.pl', active: true, worker_status: 'ACTIVE',
          }],
          rowCount: 1,
        }
      }
      return { rows: [], rowCount: statement.startsWith('insert into') ? 1 : 0 }
    },
  }
}

test('membership link is one guarded transaction with reservation and strict postflight', async () => {
  const client = successfulClient()
  const result = await linkAccountMembership(client, {
    orgId: 'bestclean', uid: 'google-uid', targetEmail: 'biuro@bestclean.pl',
    displayName: 'Biuro Best Clean', role: 'ADMIN', createdByUid: 'owner-uid',
  })
  assert.deepEqual(result, {
    orgId: 'bestclean', uid: 'google-uid', role: 'ADMIN',
    workerId: 'worker_bestclean_5', login: 'u_bestclean_5', email: 'biuro@bestclean.pl',
  })
  const source = client.calls.map((call) => call.sql).join('\n')
  assert.match(source, /pg_advisory_xact_lock/)
  assert.match(source, /lock table public\.worker, public\.organization_member in share row exclusive mode/)
  assert.match(source, /insert into public\.worker_id_reservation/)
  assert.match(source, /insert into public\.organization_member/)
  assert.match(source, /insert into public\.worker/)
  assert.equal(client.calls.at(-1).sql, 'commit')
  assert.equal(client.calls.some((call) => call.sql === 'rollback'), false)
})

test('membership link rolls back on any conflict before writes', async () => {
  const client = successfulClient({ conflict: true })
  await assert.rejects(() => linkAccountMembership(client, {
    orgId: 'bestclean', uid: 'google-uid', targetEmail: 'biuro@bestclean.pl',
    displayName: 'Biuro Best Clean', role: 'ADMIN', createdByUid: 'owner-uid',
  }), /LINK_UID_DATABASE_REFERENCES_PRESENT/)
  assert.equal(client.calls.at(-1).sql, 'rollback')
  assert.equal(client.calls.some((call) => call.sql.startsWith('insert into')), false)
})
