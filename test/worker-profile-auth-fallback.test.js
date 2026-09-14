'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const backend = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')

function functionBlock(startMarker, endMarker) {
  const start = backend.indexOf(startMarker)
  const end = backend.indexOf(endMarker, start)
  assert.ok(start >= 0, `Nie znaleziono sekcji: ${startMarker}`)
  assert.ok(end > start, `Nie znaleziono konca sekcji: ${endMarker}`)
  return backend.slice(start, end)
}

test('edycja profilu zapisuje Cloud SQL, gdy pracownik nie ma konta Firebase Auth', () => {
  const updateBlock = functionBlock(
    'async function updateWorkerProfileDatabase',
    'async function handleAdminWorkerProfileUpdateRequest',
  )

  assert.match(
    updateBlock,
    /if \(shouldResolveFirebaseUser && \(!authUid \|\| !authMatch\.user\)\) \{[\s\S]*authWarning = WORKER_PROFILE_DB_ONLY_AUTH_WARNING/,
  )
  assert.match(
    updateBlock,
    /const shouldUpdateFirebaseUser = Boolean\(authUid && authMatch\.user\)[\s\S]*if \(shouldUpdateFirebaseUser\) \{[\s\S]*\.updateUser\(authUid/,
  )
  assert.doesNotMatch(updateBlock, /createWorkerProfileAuthRequiredError/)
  assert.match(updateBlock, /workerRepository\.updateWorkerRow/)
  assert.match(updateBlock, /persistenceVerified: true/)
})

test('ustawienie hasla odtwarza brakujace konto Firebase Auth i laczy nowe uid z pracownikiem', () => {
  const passwordBlock = functionBlock(
    'async function setWorkerPasswordDatabase',
    'async function handleAdminWorkerPasswordSetRequest',
  )

  assert.match(passwordBlock, /if \(!authUid\)[\s\S]*createdAuthUser = await createFirebaseAuthUser/)
  assert.match(passwordBlock, /createdAuthUser = await createFirebaseAuthUser/)
  assert.match(passwordBlock, /authRelinked = normalizeLower\(previousAuthUid\) !== normalizeLower\(authUid\)/)
  assert.match(passwordBlock, /workerRepository\.relinkWorkerAuth/)
  assert.match(passwordBlock, /previousAuthUid: normalizeText\(currentWorker\.auth_uid\)/)
  assert.match(passwordBlock, /authCreated = true/)
  assert.match(passwordBlock, /if \(!authCreated\)[\s\S]*updateFirebaseAuthPassword\(authUid, payload\.password\)/)
  assert.match(passwordBlock, /deleteFirebaseUserQuietly\(createdAuthUser\)/)
})
