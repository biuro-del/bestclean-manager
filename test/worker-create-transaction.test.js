const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const backend = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')

function functionBody(startName, nextName) {
  const start = backend.indexOf(`async function ${startName}`)
  const end = backend.indexOf(`async function ${nextName}`, start + 1)
  assert.notEqual(start, -1, `${startName} should exist`)
  assert.notEqual(end, -1, `${nextName} should exist after ${startName}`)
  return backend.slice(start, end)
}

test('worker creation does not delete Firebase identity after SQL commit', () => {
  const source = functionBody('createAdminManagedUserDatabase', 'handleAuthProvisionWorkerRequest')

  assert.match(source, /let databaseCommitted = false/)
  assert.match(source, /await client\.query\('commit'\)[\s\S]*databaseCommitted = true/)
  assert.match(source, /createdAuthUser\?\.uid && !databaseCommitted/)
  assert.match(source, /if \(!databaseCommitted\) \{\s*await deleteWorkerProfilePhotoObject\(uploadedPhoto\)/)
  assert.doesNotMatch(source, /currentWorker\?\.photo_url/)
  assert.doesNotMatch(source, /updatedRow\?\.photo_url/)
})
