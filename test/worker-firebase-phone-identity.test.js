'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const {
  buildWorkerFirebasePhoneCreateFields,
  buildWorkerFirebasePhoneRollbackFields,
  buildWorkerFirebasePhoneUpdateFields,
  hasWorkerFirebasePhoneAuthMismatch,
  hasWorkerFirebasePhoneIdentityChange,
  isFirebaseInvalidPhoneError,
  isFirebasePhoneAlreadyExistsError,
  isWorkerFirebasePhoneIdentityEnabled,
} = require('../worker-firebase-phone-identity')

const root = path.join(__dirname, '..')

test('powiazanie telefonu z Firebase pozostaje domyslnie wylaczone', () => {
  for (const value of [undefined, '', '0', 'false', 'off', 'enabled']) {
    assert.equal(
      isWorkerFirebasePhoneIdentityEnabled({
        WORKER_FIREBASE_PHONE_IDENTITY_ENABLED: value,
      }),
      false,
    )
  }

  assert.deepEqual(buildWorkerFirebasePhoneCreateFields('niepoprawny', {}), {})
  assert.deepEqual(buildWorkerFirebasePhoneUpdateFields('niepoprawny', {}), {})
  assert.equal(hasWorkerFirebasePhoneIdentityChange('+48664322028', '', {}), false)
})

test('jawne wlaczenie buduje kanoniczne pole phoneNumber dla tego samego konta Firebase', () => {
  const environment = { WORKER_FIREBASE_PHONE_IDENTITY_ENABLED: 'true' }
  assert.deepEqual(
    buildWorkerFirebasePhoneCreateFields('664 322 028', environment),
    { phoneNumber: '+48664322028' },
  )
  assert.deepEqual(
    buildWorkerFirebasePhoneUpdateFields('0048 664-322-028', environment),
    { phoneNumber: '+48664322028' },
  )
  assert.deepEqual(
    buildWorkerFirebasePhoneUpdateFields('', environment),
    { phoneNumber: null },
  )
})

test('wlaczone tworzenie konta wymaga poprawnego polskiego numeru', () => {
  const environment = { WORKER_FIREBASE_PHONE_IDENTITY_ENABLED: '1' }
  for (const value of ['', '+49123456789', '123']) {
    assert.throws(
      () => buildWorkerFirebasePhoneCreateFields(value, environment),
      (error) => error?.publicCode === 'WORKER_PHONE_INVALID' && error?.statusCode === 400,
    )
  }
})

test('zmiana numeru uruchamia synchronizacje tylko po jawnym wlaczeniu', () => {
  const enabled = { WORKER_FIREBASE_PHONE_IDENTITY_ENABLED: 'tak' }
  assert.equal(
    hasWorkerFirebasePhoneIdentityChange('+48664322028', '664322028', enabled),
    false,
  )
  assert.equal(
    hasWorkerFirebasePhoneIdentityChange('+48664322029', '+48664322028', enabled),
    true,
  )
  assert.equal(
    hasWorkerFirebasePhoneIdentityChange('', '+48664322028', enabled),
    true,
  )
  assert.equal(
    hasWorkerFirebasePhoneAuthMismatch('+48664322028', '', enabled),
    true,
  )
  assert.equal(
    hasWorkerFirebasePhoneAuthMismatch('+48664322028', '+48664322028', enabled),
    false,
  )
})

test('rollback odtwarza dokladny poprzedni telefon Firebase albo jego brak', () => {
  const enabled = { WORKER_FIREBASE_PHONE_IDENTITY_ENABLED: 'yes' }
  assert.deepEqual(
    buildWorkerFirebasePhoneRollbackFields({ phoneNumber: '+49123456789' }, enabled),
    { phoneNumber: '+49123456789' },
  )
  assert.deepEqual(
    buildWorkerFirebasePhoneRollbackFields({}, enabled),
    { phoneNumber: null },
  )
})

test('bledy Firebase telefonu sa rozpoznawane bez ujawniania numeru', () => {
  assert.equal(
    isFirebasePhoneAlreadyExistsError({ code: 'auth/phone-number-already-exists' }),
    true,
  )
  assert.equal(
    isFirebasePhoneAlreadyExistsError({ firebaseRestMessage: 'PHONE_NUMBER_EXISTS' }),
    true,
  )
  assert.equal(
    isFirebaseInvalidPhoneError({ code: 'auth/invalid-phone-number' }),
    true,
  )
  assert.equal(isFirebaseInvalidPhoneError({ code: 'auth/invalid-email' }), false)
})

test('backend zachowuje UID i email haslo, a telefon dopina w create update i rollback', () => {
  const backend = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
  const repository = fs.readFileSync(path.join(root, 'worker-repository.js'), 'utf8')
  const appHosting = fs.readFileSync(path.join(root, 'apphosting.yaml'), 'utf8')
  const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8')
  const updateStart = backend.indexOf('async function updateWorkerProfileDatabase')
  const updateEnd = backend.indexOf('async function handleAdminWorkerProfileUpdateRequest', updateStart)
  const updateBlock = backend.slice(updateStart, updateEnd)
  const deleteStart = backend.indexOf('async function deleteWorkerProfileDatabase')
  const deleteEnd = backend.indexOf('async function handleAdminWorkerProfileDeleteRequest', deleteStart)
  const deleteBlock = backend.slice(deleteStart, deleteEnd)

  assert.match(
    backend,
    /createFirebaseAuthUser\(payload, \{ workerPhoneIdentity: true \}\)/,
  )
  assert.match(
    backend,
    /createUser\(\{[\s\S]*email: payload\.email,[\s\S]*password: payload\.password,[\s\S]*\.\.\.workerPhoneFields/,
  )
  assert.match(
    backend,
    /workerPhoneIdentityEnabled \|\| !canUseFirebaseRest\(\)/,
  )
  assert.match(
    updateBlock,
    /\(phoneIdentityChanged \|\| phoneIdentityManaged\) && \(!authUid \|\| !authMatch\.user\)[\s\S]*FIREBASE_AUTH_USER_MISSING/,
  )
  assert.match(
    updateBlock,
    /buildWorkerFirebasePhoneRollbackFields\(authMatch\.user, process\.env\)/,
  )
  assert.match(
    updateBlock,
    /\.updateUser\(authUid, \{[\s\S]*buildWorkerFirebasePhoneUpdateFields\(payload\.phone, process\.env\)/,
  )
  assert.match(updateBlock, /const knownAuthUid = normalizeText\(currentWorker\.auth_uid\)/)
  assert.doesNotMatch(updateBlock, /payload\.authUid \|\| currentWorker\.auth_uid/)
  assert.match(deleteBlock, /let authUid = normalizeText\(currentWorker\.auth_uid\)/)
  assert.doesNotMatch(deleteBlock, /payload\.authUid \|\| currentWorker\.auth_uid/)
  assert.match(updateBlock, /allowEmailFallback: !phoneIdentityManaged/)
  assert.match(updateBlock, /hasWorkerFirebasePhoneAuthMismatch/)
  assert.ok(updateBlock.indexOf("await client.query('begin')") < updateBlock.indexOf('.updateUser(authUid'))
  assert.match(
    repository,
    /read-worker-for-password-reset[\s\S]*email,[\s\S]*phone,[\s\S]*auth_uid/,
  )
  assert.match(repository, /read-worker-for-update[\s\S]*for update of w/)
  assert.match(envExample, /^WORKER_FIREBASE_PHONE_IDENTITY_ENABLED=false$/m)
  assert.match(
    appHosting,
    /variable: WORKER_FIREBASE_PHONE_IDENTITY_ENABLED\r?\n\s+value: "false"/,
  )
  assert.match(
    backend,
    /WORKER_RESTORE_PHONE_IDENTITY_REQUIRES_AUDIT/,
  )
})
