'use strict'

const crypto = require('node:crypto')
const { normalizePolishPhoneE164 } = require('./polish-phone-policy')

const PLAN_STATUS = Object.freeze({
  ALREADY_SYNCED: 'ALREADY_SYNCED',
  CONFLICT_FIREBASE_DIFFERENT_PHONE: 'CONFLICT_FIREBASE_DIFFERENT_PHONE',
  CONFLICT_FIREBASE_DISABLED: 'CONFLICT_FIREBASE_DISABLED',
  CONFLICT_FIREBASE_EMAIL_MISMATCH: 'CONFLICT_FIREBASE_EMAIL_MISMATCH',
  CONFLICT_FIREBASE_PASSWORD_PROVIDER_MISSING: 'CONFLICT_FIREBASE_PASSWORD_PROVIDER_MISSING',
  CONFLICT_FIREBASE_USER_MISSING: 'CONFLICT_FIREBASE_USER_MISSING',
  CONFLICT_INVALID_PHONE: 'CONFLICT_INVALID_PHONE',
  CONFLICT_MEMBERSHIP: 'CONFLICT_MEMBERSHIP',
  CONFLICT_PHONE_MULTIPLE_PROFILES: 'CONFLICT_PHONE_MULTIPLE_PROFILES',
  CONFLICT_PHONE_COLUMNS_MISMATCH: 'CONFLICT_PHONE_COLUMNS_MISMATCH',
  CONFLICT_PHONE_OWNED_BY_OTHER_UID: 'CONFLICT_PHONE_OWNED_BY_OTHER_UID',
  CONFLICT_UID_MISSING: 'CONFLICT_UID_MISSING',
  CONFLICT_UID_MULTIPLE_PROFILES: 'CONFLICT_UID_MULTIPLE_PROFILES',
  CONFLICT_WORKER_EMAIL_MISSING: 'CONFLICT_WORKER_EMAIL_MISSING',
  PLANNED_UPDATE: 'PLANNED_UPDATE',
  SKIP_INACTIVE: 'SKIP_INACTIVE',
  SKIP_NO_PHONE: 'SKIP_NO_PHONE',
})

function text(value) {
  return String(value ?? '').trim()
}

function bool(value) {
  if (typeof value === 'boolean') return value
  return ['1', 'true', 'yes', 'tak', 't'].includes(text(value).toLowerCase())
}

function email(value) {
  return text(value).toLowerCase()
}

function hasPasswordProvider(user) {
  return (Array.isArray(user?.providerData) ? user.providerData : [])
    .some((provider) => text(provider?.providerId).toLowerCase() === 'password')
}

function normalizeRow(row) {
  const sourcePhone = text(row?.phone)
  const normalizedColumn = text(row?.phone_normalized ?? row?.phoneNormalized)
  const rawPhone = normalizedColumn || sourcePhone
  const phone = rawPhone ? normalizePolishPhoneE164(rawPhone) : ''
  return {
    orgId: text(row?.org_id ?? row?.orgId),
    login: text(row?.login),
    workerId: text(row?.worker_id ?? row?.workerId),
    authUid: text(row?.auth_uid ?? row?.authUid),
    expectedEmail: email(row?.login_email ?? row?.loginEmail ?? row?.email),
    rawPhone,
    phone,
    phoneColumnsMatch: sourcePhone === normalizedColumn,
    active: bool(row?.active),
    activeMembershipCount: Number(
      row?.active_membership_count ?? row?.activeMembershipCount ?? 0,
    ),
    activeUidMembershipCount: Number(
      row?.active_uid_membership_count ?? row?.activeUidMembershipCount ?? 0,
    ),
  }
}

function incrementCount(map, key) {
  if (!key) return
  map.set(key, (map.get(key) || 0) + 1)
}

function userByKey(source, key) {
  if (!key) return null
  if (source instanceof Map) return source.get(key) || null
  return source?.[key] || null
}

function buildWorkerFirebasePhonePlan(rows, firebaseState = {}) {
  const normalizedRows = (Array.isArray(rows) ? rows : []).map(normalizeRow)
  const phoneCounts = new Map()
  const uidCounts = new Map()

  for (const row of normalizedRows) {
    // Count every persisted profile, including inactive/phone-less rows. A UID
    // or phone that points at more than one worker must never be auto-mutated.
    incrementCount(phoneCounts, row.phone)
    incrementCount(uidCounts, row.authUid)
  }

  const entries = normalizedRows.map((row) => {
    let status = ''
    let currentFirebasePhone = ''
    let currentFirebaseEmail = ''
    let firebaseHasPasswordProvider = false

    if (!row.active) status = PLAN_STATUS.SKIP_INACTIVE
    else if (!row.rawPhone) status = PLAN_STATUS.SKIP_NO_PHONE
    else if (!row.phoneColumnsMatch) status = PLAN_STATUS.CONFLICT_PHONE_COLUMNS_MISMATCH
    else if (!row.phone || row.rawPhone !== row.phone) status = PLAN_STATUS.CONFLICT_INVALID_PHONE
    else if (!row.authUid) status = PLAN_STATUS.CONFLICT_UID_MISSING
    else if (row.activeMembershipCount !== 1 || row.activeUidMembershipCount !== 1) {
      status = PLAN_STATUS.CONFLICT_MEMBERSHIP
    }
    else if ((phoneCounts.get(row.phone) || 0) !== 1) status = PLAN_STATUS.CONFLICT_PHONE_MULTIPLE_PROFILES
    else if ((uidCounts.get(row.authUid) || 0) !== 1) status = PLAN_STATUS.CONFLICT_UID_MULTIPLE_PROFILES
    else {
      const firebaseUser = userByKey(firebaseState.usersByUid, row.authUid)
      const firebasePhoneOwner = userByKey(firebaseState.usersByPhone, row.phone)
      currentFirebasePhone = text(firebaseUser?.phoneNumber)
      currentFirebaseEmail = email(firebaseUser?.email)
      firebaseHasPasswordProvider = hasPasswordProvider(firebaseUser)
      if (!firebaseUser) status = PLAN_STATUS.CONFLICT_FIREBASE_USER_MISSING
      else if (firebaseUser.disabled === true) status = PLAN_STATUS.CONFLICT_FIREBASE_DISABLED
      else if (!row.expectedEmail) status = PLAN_STATUS.CONFLICT_WORKER_EMAIL_MISSING
      else if (currentFirebaseEmail !== row.expectedEmail) {
        status = PLAN_STATUS.CONFLICT_FIREBASE_EMAIL_MISMATCH
      } else if (!firebaseHasPasswordProvider) {
        status = PLAN_STATUS.CONFLICT_FIREBASE_PASSWORD_PROVIDER_MISSING
      }
      else if (currentFirebasePhone && currentFirebasePhone !== row.phone) {
        status = PLAN_STATUS.CONFLICT_FIREBASE_DIFFERENT_PHONE
      } else if (firebasePhoneOwner && text(firebasePhoneOwner.uid) !== row.authUid) {
        status = PLAN_STATUS.CONFLICT_PHONE_OWNED_BY_OTHER_UID
      } else if (currentFirebasePhone === row.phone && text(firebasePhoneOwner?.uid) === row.authUid) {
        status = PLAN_STATUS.ALREADY_SYNCED
      } else if (!currentFirebasePhone && !firebasePhoneOwner) {
        status = PLAN_STATUS.PLANNED_UPDATE
      } else {
        status = PLAN_STATUS.CONFLICT_PHONE_OWNED_BY_OTHER_UID
      }
    }

    return {
      ...row,
      currentFirebasePhone,
      currentFirebaseEmail,
      firebaseHasPasswordProvider,
      status,
    }
  })

  entries.sort((a, b) => [a.orgId, a.login, a.workerId].join('\u0000').localeCompare(
    [b.orgId, b.login, b.workerId].join('\u0000'),
  ))

  const counts = entries.reduce((result, entry) => {
    result[entry.status] = (result[entry.status] || 0) + 1
    return result
  }, {})
  const conflicts = entries.filter((entry) => entry.status.startsWith('CONFLICT_')).length
  const plannedUpdates = counts[PLAN_STATUS.PLANNED_UPDATE] || 0
  const hashInput = entries.map((entry) => ({
    orgId: entry.orgId,
    login: entry.login,
    workerId: entry.workerId,
    authUid: entry.authUid,
    phone: entry.phone,
    expectedEmail: entry.expectedEmail,
    currentFirebasePhone: entry.currentFirebasePhone,
    currentFirebaseEmail: entry.currentFirebaseEmail,
    firebaseHasPasswordProvider: entry.firebaseHasPasswordProvider,
    status: entry.status,
  }))
  const planHash = crypto.createHash('sha256').update(JSON.stringify(hashInput)).digest('hex')

  return {
    entries,
    counts,
    conflicts,
    plannedUpdates,
    planHash,
  }
}

function maskedPhone(value) {
  const phone = text(value)
  if (!phone) return ''
  return `${phone.slice(0, 3)}*****${phone.slice(-4)}`
}

function maskedUid(value) {
  const uid = text(value)
  if (!uid) return ''
  return crypto.createHash('sha256').update(uid).digest('hex').slice(0, 12)
}

function redactWorkerFirebasePhonePlan(plan) {
  return {
    planHash: text(plan?.planHash),
    conflicts: Number(plan?.conflicts || 0),
    plannedUpdates: Number(plan?.plannedUpdates || 0),
    counts: { ...(plan?.counts || {}) },
    entries: (Array.isArray(plan?.entries) ? plan.entries : []).map((entry) => ({
      orgId: text(entry.orgId),
      login: text(entry.login),
      workerId: text(entry.workerId),
      uidHash: maskedUid(entry.authUid),
      phoneMasked: maskedPhone(entry.phone || entry.rawPhone),
      status: text(entry.status),
    })),
  }
}

function firebaseUserInvariantSnapshot(user) {
  const providers = (Array.isArray(user?.providerData) ? user.providerData : [])
    .filter((provider) => text(provider?.providerId) !== 'phone')
    .map((provider) => ({
      providerId: text(provider?.providerId),
      uid: text(provider?.uid),
      email: text(provider?.email),
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return {
    uid: text(user?.uid),
    email: text(user?.email),
    emailVerified: user?.emailVerified === true,
    disabled: user?.disabled === true,
    displayName: text(user?.displayName),
    customClaims: user?.customClaims || {},
    providers,
  }
}

async function applyWorkerFirebasePhonePlan(plan, auth, options = {}) {
  if (Number(plan?.conflicts || 0) > 0) throw new Error('PHONE_BACKFILL_CONFLICTS_PRESENT')
  const updates = (Array.isArray(plan?.entries) ? plan.entries : [])
    .filter((entry) => entry.status === PLAN_STATUS.PLANNED_UPDATE)
  const maxUpdates = Number(options.maxUpdates)
  if (!Number.isInteger(maxUpdates) || maxUpdates < updates.length) {
    throw new Error('PHONE_BACKFILL_MAX_UPDATES_EXCEEDED')
  }

  const completed = []
  for (const entry of updates) {
    try {
      const before = await auth.getUser(entry.authUid)
      if (
        text(before.uid) !== entry.authUid ||
        before.disabled === true ||
        email(before.email) !== entry.expectedEmail ||
        !hasPasswordProvider(before) ||
        text(before.phoneNumber) !== text(entry.currentFirebasePhone)
      ) {
        throw new Error('PHONE_BACKFILL_FIREBASE_STATE_CHANGED')
      }
      const beforeInvariant = firebaseUserInvariantSnapshot(before)
      await auth.updateUser(entry.authUid, { phoneNumber: entry.phone })
      const after = await auth.getUser(entry.authUid)
      const owner = await auth.getUserByPhoneNumber(entry.phone)
      if (text(after.phoneNumber) !== entry.phone || text(owner?.uid) !== entry.authUid) {
        throw new Error('PHONE_BACKFILL_POSTFLIGHT_FAILED')
      }
      if (JSON.stringify(firebaseUserInvariantSnapshot(after)) !== JSON.stringify(beforeInvariant)) {
        throw new Error('PHONE_BACKFILL_NON_PHONE_FIELDS_CHANGED')
      }
      completed.push(entry.authUid)
    } catch (error) {
      error.completedUpdates = completed.length
      error.failedUidHash = maskedUid(entry.authUid)
      throw error
    }
  }
  return { completedUpdates: completed.length }
}

module.exports = {
  PLAN_STATUS,
  applyWorkerFirebasePhonePlan,
  buildWorkerFirebasePhonePlan,
  firebaseUserInvariantSnapshot,
  maskedPhone,
  maskedUid,
  redactWorkerFirebasePhonePlan,
}
