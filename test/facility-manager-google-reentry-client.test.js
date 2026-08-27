const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const candidateRoot = path.join(__dirname, '..')
const authServicePath = path.join(candidateRoot, 'web-app', 'apps', 'portal-web', 'src', 'auth', 'authService.js')
const portalAppPath = path.join(candidateRoot, 'web-app', 'apps', 'portal-web', 'src', 'ui', 'portalApp.js')
const layoutPath = path.join(candidateRoot, 'web-app', 'apps', 'portal-web', 'src', 'ui', 'layoutTemplate.js')

function exportedFunction(source, name, nextName) {
  const start = source.indexOf(`export async function ${name}`)
  const end = source.indexOf(`export async function ${nextName}`, start + 1)
  assert.ok(start >= 0, `${name} must be exported`)
  assert.ok(end > start, `${name} must end before ${nextName}`)
  return source.slice(start, end)
}

test('retry uses the existing Firebase Google session and never issues another registration grant', () => {
  const source = fs.readFileSync(authServicePath, 'utf8')
  const retry = exportedFunction(source, 'retryFacilityManagerGoogleRegistration', 'registerFacilityManagerWithGoogle')

  assert.match(retry, /firebase\.auth\.currentUser \|\| \(await waitForFirebaseAuthReady\(\)\)/)
  assert.match(retry, /provisionFacilityManagerGooglePanel\(firebase, user,/)
  assert.doesNotMatch(retry, /issueFacilityManagerRegistrationGrant/)
  assert.doesNotMatch(retry, /signInWithCredential/)
})

test('existing manager Google login has no grant path while new-user creation remains gated', () => {
  const source = fs.readFileSync(authServicePath, 'utf8')
  const signIn = exportedFunction(source, 'signInFacilityManagerWithGoogle', 'retryFacilityManagerGoogleRegistration')

  assert.match(signIn, /requestGoogleSignInCredential\(\)/)
  assert.match(signIn, /signInWithCredential\(firebase\.auth, GoogleAuthProvider\.credential\(idToken\)\)/)
  assert.doesNotMatch(signIn, /issueFacilityManagerRegistrationGrant/)
  assert.match(source, /beforeCreate only for a new account/)
})

test('portal keeps the same idempotency attempt for a retry and exposes Google login for an existing manager', () => {
  const portal = fs.readFileSync(portalAppPath, 'utf8')
  const layout = fs.readFileSync(layoutPath, 'utf8')

  assert.match(portal, /attempt\.retryProvisioning === true\s*\? await retryFacilityManagerGoogleRegistration/)
  assert.match(portal, /pendingFacilityManagerRegistration = \{ \.\.\.attempt, retryProvisioning: true \}/)
  assert.match(portal, /signInFacilityManagerWithGoogle\(\)/)
  assert.match(layout, /id="loginFacilityManagerGoogleLogin"/)
})
