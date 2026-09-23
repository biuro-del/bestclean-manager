'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const auth = fs.readFileSync(path.join(root, 'web-app/apps/portal-web/src/auth/authService.js'), 'utf8')
const app = fs.readFileSync(path.join(root, 'web-app/apps/portal-web/src/ui/portalApp.js'), 'utf8')
const layout = fs.readFileSync(path.join(root, 'web-app/apps/portal-web/src/ui/layoutTemplate.js'), 'utf8')
const server = fs.readFileSync(path.join(root, 'index.js'), 'utf8')

test('backend never grants organization access by email', () => {
  assert.match(server, /getRequesterMemberships\(client, requesterUid\)/)
  assert.match(server, /getAccountLinkingRequirement\(client, decodedToken\)/)
  assert.match(server, /status: accountLinking\.status/)
  assert.doesNotMatch(server, /buildOrganizationSessionContext\(client,\s*[^,]*email/i)
})

test('both company onboarding entry points block an existing email identity', () => {
  assert.equal((server.match(/await assertNoAccountLinkingRequired\(client, decodedToken\)/g) || []).length, 2)
  assert.match(server, /AccountLinkingError/)
})

test('portal shows a dedicated fail-closed account-linking state without new-company action', () => {
  assert.match(layout, /id="loginAccountLinkingPanel"/)
  assert.match(layout, /id="loginAccountLinkingContinue"/)
  const panelStart = layout.indexOf('id="loginAccountLinkingPanel"')
  const panelEnd = layout.indexOf('</div>', panelStart)
  assert.doesNotMatch(layout.slice(panelStart, panelEnd), /loginOrganizationCreateOpen/)
  assert.match(app, /showLoginAccountLinkingRequired/)
  assert.match(app, /ACCOUNT_LINKING_REVIEW_REQUIRED/)
})

test('future Google conflicts link to the authenticated canonical UID in memory only', () => {
  assert.match(auth, /pendingGoogleAccountLink = \{ credential: googleCredential, email: conflictEmail \}/)
  assert.match(auth, /await linkWithCredential\(user, pendingGoogleAccountLink\.credential\)/)
  assert.match(auth, /toText\(result\?\.user\?\.uid\) !== originalUid/)
  assert.match(auth, /ACCOUNT_LINKING_DUPLICATE_REVIEW_REQUIRED/)
  assert.match(auth, /if \(!preserveAccountLinking\) clearPendingGoogleAccountLink\(\)/)
  assert.doesNotMatch(auth, /localStorage\.setItem\([^\n]*pendingGoogleAccountLink/)
  assert.doesNotMatch(auth, /sessionStorage\.setItem\([^\n]*pendingGoogleAccountLink/)
})
