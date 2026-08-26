'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const backend = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')

function functionBody(name, nextName) {
  const start = backend.indexOf(`async function ${name}`)
  const end = backend.indexOf(`async function ${nextName}`, start + 1)
  assert.ok(start >= 0, `Nie znaleziono funkcji ${name}.`)
  assert.ok(end > start, `Nie znaleziono konca funkcji ${name}.`)
  return backend.slice(start, end)
}

test('utworzenie pracownika nie wykonuje zawodnego cleanupu po zatwierdzeniu SQL', () => {
  const source = functionBody('createAdminManagedUserDatabase', 'handleAuthProvisionWorkerRequest')
  const createAuthIndex = source.indexOf('createdAuthUser = await createFirebaseAuthUser(payload)')
  const insertIndex = source.indexOf('await workerRepository.insertWorkerAndMembership')
  const commitIndex = source.indexOf("await client.query('commit')")
  const committedIndex = source.indexOf('transactionStarted = false', commitIndex)
  const databaseCommittedIndex = source.indexOf('databaseCommitted = true', committedIndex)
  const returnIndex = source.indexOf('return {', databaseCommittedIndex)

  assert.ok(createAuthIndex >= 0)
  assert.ok(insertIndex > createAuthIndex)
  assert.ok(commitIndex > insertIndex)
  assert.ok(committedIndex > commitIndex)
  assert.ok(databaseCommittedIndex > committedIndex)
  assert.ok(returnIndex > databaseCommittedIndex)

  const afterCommitBeforeReturn = source.slice(databaseCommittedIndex + 'databaseCommitted = true'.length, returnIndex)
  assert.equal(afterCommitBeforeReturn.trim(), '')
  assert.doesNotMatch(source, /currentWorker|updatedRow/)

  assert.match(source, /if \(transactionStarted\)[\s\S]*await client\.query\('rollback'\)/)
  assert.match(source, /if \(createdAuthUser\?\.uid && !databaseCommitted\)[\s\S]*await deleteFirebaseUserQuietly\(createdAuthUser\)/)
  assert.match(source, /if \(!databaseCommitted\)[\s\S]*await deleteWorkerProfilePhotoObject\(uploadedPhoto\)/)
})
