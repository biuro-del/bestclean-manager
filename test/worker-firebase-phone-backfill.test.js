'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const {
  PLAN_STATUS,
  applyWorkerFirebasePhonePlan,
  buildWorkerFirebasePhonePlan,
  redactWorkerFirebasePhonePlan,
} = require('../worker-firebase-phone-backfill')

function row(overrides = {}) {
  const authUid = overrides.auth_uid ?? 'uid-1'
  return {
    org_id: 'bestclean',
    login: 'w001',
    worker_id: 'W001',
    auth_uid: authUid,
    login_email: `${authUid}@example.test`,
    phone: '+48664322028',
    phone_normalized: '+48664322028',
    active: true,
    active_membership_count: 1,
    active_uid_membership_count: 1,
    ...overrides,
  }
}

function firebaseUser(uid, phoneNumber = '') {
  return {
    uid,
    email: `${uid}@example.test`,
    emailVerified: true,
    disabled: false,
    displayName: uid,
    phoneNumber,
    customClaims: { role: 'worker' },
    providerData: [{ providerId: 'password', uid, email: `${uid}@example.test` }],
  }
}

test('audit rozroznia update, stan gotowy oraz rekordy bez telefonu', () => {
  const user1 = firebaseUser('uid-1')
  const user2 = firebaseUser('uid-2', '+48664322029')
  const plan = buildWorkerFirebasePhonePlan([
    row(),
    row({ login: 'w002', worker_id: 'W002', auth_uid: 'uid-2', phone: '+48664322029', phone_normalized: '+48664322029' }),
    row({ login: 'w003', worker_id: 'W003', auth_uid: 'uid-3', phone: null, phone_normalized: null }),
  ], {
    usersByUid: new Map([['uid-1', user1], ['uid-2', user2]]),
    usersByPhone: new Map([['+48664322029', user2]]),
  })

  assert.equal(plan.conflicts, 0)
  assert.equal(plan.plannedUpdates, 1)
  assert.deepEqual(plan.entries.map((entry) => entry.status), [
    PLAN_STATUS.PLANNED_UPDATE,
    PLAN_STATUS.ALREADY_SYNCED,
    PLAN_STATUS.SKIP_NO_PHONE,
  ])
  assert.match(plan.planHash, /^[a-f0-9]{64}$/)
})

test('audit fail-closed wykrywa niejednoznaczne mapowania i niespojny Firebase', () => {
  const owner = firebaseUser('other-uid', '+48664322035')
  const plan = buildWorkerFirebasePhonePlan([
    row(),
    row({ login: 'w002', worker_id: 'W002', auth_uid: 'uid-2' }),
    row({ login: 'w003', worker_id: 'W003', auth_uid: '', phone: '+48664322030', phone_normalized: '+48664322030' }),
    row({ login: 'w004', worker_id: 'W004', auth_uid: 'uid-4', phone: '+48 664 322 031', phone_normalized: '+48 664 322 031' }),
    row({ login: 'w005', worker_id: 'W005', auth_uid: 'uid-5', phone: '+48664322032', phone_normalized: '+48664322032', active_membership_count: 0 }),
    row({ login: 'w006', worker_id: 'W006', auth_uid: 'uid-6', phone: '+48664322033', phone_normalized: '+48664322033' }),
    row({ login: 'w007', worker_id: 'W007', auth_uid: 'uid-7', phone: '+48664322034', phone_normalized: '+48664322034' }),
    row({ login: 'w008', worker_id: 'W008', auth_uid: 'uid-8', phone: '+48664322035', phone_normalized: '+48664322035' }),
  ], {
    usersByUid: new Map([
      ['uid-6', { ...firebaseUser('uid-6'), disabled: true }],
      ['uid-7', firebaseUser('uid-7', '+48664322999')],
      ['uid-8', firebaseUser('uid-8')],
    ]),
    usersByPhone: new Map([['+48664322035', owner]]),
  })

  const statuses = new Set(plan.entries.map((entry) => entry.status))
  assert.ok(statuses.has(PLAN_STATUS.CONFLICT_PHONE_MULTIPLE_PROFILES))
  assert.ok(statuses.has(PLAN_STATUS.CONFLICT_UID_MISSING))
  assert.ok(statuses.has(PLAN_STATUS.CONFLICT_INVALID_PHONE))
  assert.ok(statuses.has(PLAN_STATUS.CONFLICT_MEMBERSHIP))
  assert.ok(statuses.has(PLAN_STATUS.CONFLICT_FIREBASE_DISABLED))
  assert.ok(statuses.has(PLAN_STATUS.CONFLICT_FIREBASE_DIFFERENT_PHONE))
  assert.ok(statuses.has(PLAN_STATUS.CONFLICT_PHONE_OWNED_BY_OTHER_UID))
  assert.equal(plan.conflicts, plan.entries.length)
})

test('audit odrzuca rozjazd phone i phone_normalized', () => {
  const plan = buildWorkerFirebasePhonePlan([
    row({ phone: '+48664322028', phone_normalized: '+48664322029' }),
  ], {
    usersByUid: new Map([['uid-1', firebaseUser('uid-1')]]),
    usersByPhone: new Map(),
  })
  assert.equal(plan.entries[0].status, PLAN_STATUS.CONFLICT_PHONE_COLUMNS_MISMATCH)
  assert.equal(plan.conflicts, 1)
})

test('audit blokuje wspoldzielony UID nawet gdy drugi profil nie ma telefonu', () => {
  const plan = buildWorkerFirebasePhonePlan([
    row(),
    row({ login: 'w002', worker_id: 'W002', phone: null, phone_normalized: null }),
  ], {
    usersByUid: new Map([['uid-1', firebaseUser('uid-1')]]),
    usersByPhone: new Map(),
  })

  assert.equal(plan.entries[0].status, PLAN_STATUS.CONFLICT_UID_MULTIPLE_PROFILES)
  assert.equal(plan.entries[1].status, PLAN_STATUS.SKIP_NO_PHONE)
  assert.equal(plan.plannedUpdates, 0)
  assert.equal(plan.conflicts, 1)
})

test('audit blokuje UID wskazujacy konto o innym emailu lub bez hasla', () => {
  const wrongEmail = buildWorkerFirebasePhonePlan([row()], {
    usersByUid: new Map([['uid-1', firebaseUser('uid-obcy')]]),
    usersByPhone: new Map(),
  })
  assert.equal(wrongEmail.entries[0].status, PLAN_STATUS.CONFLICT_FIREBASE_EMAIL_MISMATCH)

  const withoutPassword = firebaseUser('uid-1')
  withoutPassword.providerData = [{ providerId: 'google.com', uid: 'google-1' }]
  const noPassword = buildWorkerFirebasePhonePlan([row()], {
    usersByUid: new Map([['uid-1', withoutPassword]]),
    usersByPhone: new Map(),
  })
  assert.equal(
    noPassword.entries[0].status,
    PLAN_STATUS.CONFLICT_FIREBASE_PASSWORD_PROVIDER_MISSING,
  )
})

test('audit blokuje UID majacy inne aktywne membershipy', () => {
  const plan = buildWorkerFirebasePhonePlan([
    row({ active_uid_membership_count: 2 }),
  ], {
    usersByUid: new Map([['uid-1', firebaseUser('uid-1')]]),
    usersByPhone: new Map(),
  })

  assert.equal(plan.entries[0].status, PLAN_STATUS.CONFLICT_MEMBERSHIP)
  assert.equal(plan.plannedUpdates, 0)
})

test('raport maskuje pelny telefon i UID', () => {
  const plan = buildWorkerFirebasePhonePlan([row()], {
    usersByUid: new Map([['uid-1', firebaseUser('uid-1')]]),
    usersByPhone: new Map(),
  })
  const output = JSON.stringify(redactWorkerFirebasePhonePlan(plan))
  assert.doesNotMatch(output, /\+48664322028/)
  assert.doesNotMatch(output, /uid-1/)
  assert.match(output, /\+48\*{5}2028/)
})

test('apply zmienia w Firebase wylacznie phoneNumber i weryfikuje wynik', async () => {
  const state = new Map([['uid-1', firebaseUser('uid-1')]])
  const calls = []
  const auth = {
    async getUser(uid) {
      return structuredClone(state.get(uid))
    },
    async updateUser(uid, payload) {
      calls.push({ uid, payload })
      const current = state.get(uid)
      state.set(uid, {
        ...current,
        phoneNumber: payload.phoneNumber,
        providerData: [...current.providerData, { providerId: 'phone', uid: payload.phoneNumber }],
      })
    },
    async getUserByPhoneNumber(phone) {
      return [...state.values()].find((user) => user.phoneNumber === phone)
    },
  }
  const plan = buildWorkerFirebasePhonePlan([row()], {
    usersByUid: state,
    usersByPhone: new Map(),
  })

  const result = await applyWorkerFirebasePhonePlan(plan, auth, { maxUpdates: 1 })
  assert.deepEqual(result, { completedUpdates: 1 })
  assert.deepEqual(calls, [{ uid: 'uid-1', payload: { phoneNumber: '+48664322028' } }])
})

test('apply nie zapisuje przy konflikcie, za malym limicie ani zmianie stanu', async () => {
  let writes = 0
  const auth = {
    async getUser() { return firebaseUser('uid-1', '+48664322999') },
    async updateUser() { writes += 1 },
    async getUserByPhoneNumber() { return null },
  }
  await assert.rejects(
    applyWorkerFirebasePhonePlan({ conflicts: 1, entries: [] }, auth, { maxUpdates: 1 }),
    /PHONE_BACKFILL_CONFLICTS_PRESENT/,
  )
  const plan = buildWorkerFirebasePhonePlan([row()], {
    usersByUid: new Map([['uid-1', firebaseUser('uid-1')]]),
    usersByPhone: new Map(),
  })
  await assert.rejects(applyWorkerFirebasePhonePlan(plan, auth, { maxUpdates: 0 }), /MAX_UPDATES/)
  await assert.rejects(applyWorkerFirebasePhonePlan(plan, auth, { maxUpdates: 1 }), /STATE_CHANGED/)
  assert.equal(writes, 0)
})
