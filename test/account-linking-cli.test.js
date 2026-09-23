'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const scriptPath = path.join(__dirname, '..', 'scripts', 'account-linking-p0.js')
const source = fs.readFileSync(scriptPath, 'utf8')

test('account-linking CLI is audit-only by default and production-pinned', () => {
  assert.match(source, /const PROJECT_ID = 'iclean-room'/)
  assert.match(source, /const INSTANCE_NAME = 'iclean-room:europe-west3:iclean-room-instance'/)
  assert.match(source, /DESTRUCTIVE_AUTH_MERGE_DISABLED/)
  assert.doesNotMatch(source, /auth\.deleteUser/)
})

test('membership link is a separate exact-confirmation mode', () => {
  assert.match(source, /hasFlag\('link-membership'\)/)
  assert.match(source, /DESTRUCTIVE_AUTH_MERGE_DISABLED/)
  assert.match(source, /confirmedOrgId: text\(option\('confirm-org'\)\)/)
  assert.match(source, /confirmedEmail: email\(option\('confirm-email'\)\)/)
  assert.match(source, /confirmedUid: text\(option\('confirm-uid'\)\)/)
  assert.match(source, /await linkAccountMembership\(client, plan\)/)
})

test('audit reports project-wide duplicate email groups before config tightening', () => {
  assert.match(source, /globalDuplicateEmailGroupCount: duplicateEmailGroups\(allUsers\)\.length/)
  assert.match(source, /allowDuplicateEmails/)
  assert.match(source, /listUsers\(1000, pageToken\)/)
})
