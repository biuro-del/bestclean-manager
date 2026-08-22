'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

function readPortalSource(...parts) {
  return fs.readFileSync(
    path.join(__dirname, '..', 'web-app', 'apps', 'portal-web', 'src', ...parts),
    'utf8',
  )
}

const layout = readPortalSource('ui', 'layoutTemplate.js')
const auth = readPortalSource('auth', 'authService.js')
const app = readPortalSource('ui', 'portalApp.js')
const firebase = readPortalSource('firebase', 'firebaseClient.js')

test('portal exposes a separate company-registration path without nesting the onboarding form in login', () => {
  for (const id of [
    'loginCompanyStart',
    'loginCompanyGoogle',
    'loginCompanyEmailSend',
    'loginCompanyEmailLinkConfirm',
    'companyBasicsOverlay',
    'companyBasicsForm',
    'companyBasicsSignOut',
  ]) {
    assert.match(layout, new RegExp(`id="${id}"`))
  }

  const companyFormStart = layout.indexOf('id="companyBasicsForm"')
  const loginFormEnd = layout.lastIndexOf('</form>', companyFormStart)
  assert.ok(loginFormEnd >= 0)
  assert.ok(companyFormStart > loginFormEnd)
  assert.match(layout, /href="https:\/\/cleanzi\.pl\/regulamin"/)
  assert.match(layout, /href="https:\/\/cleanzi\.pl\/polityka-prywatnosci"/)
})

test('registration uses server-published, exact legal documents and a trusted onboarding status', () => {
  assert.match(auth, /CLEANING_COMPANY_ONBOARDING_REQUIRED/)
  assert.match(auth, /registration\/cleaning-company\/legal-documents/)
  assert.match(auth, /registration\/cleaning-company\/provision/)
  assert.match(auth, /version: '2026-07-16'/)
  assert.match(auth, /version: '2026-07-30'/)
  assert.match(auth, /url !== expected\.url/)
  assert.match(auth, /assertCleaningCompanyRegistrationAvailable\(\)/)
  assert.match(app, /result\?\.status === 'CLEANING_COMPANY_ONBOARDING_REQUIRED'/)
})

test('company registration is checked before OAuth/e-mail authentication and reuses the existing App Check provider', () => {
  const googleStart = auth.indexOf('export async function startCleaningCompanyGoogleSignIn')
  const googlePopup = auth.indexOf('signInWithPopup', googleStart)
  const googleAvailability = auth.indexOf('await assertCleaningCompanyRegistrationAvailable()', googleStart)
  const emailStart = auth.indexOf('export async function requestCleaningCompanyEmailLink')
  const emailLink = auth.indexOf('sendSignInLinkToEmail', emailStart)
  const emailAvailability = auth.indexOf('await assertCleaningCompanyRegistrationAvailable()', emailStart)

  assert.ok(googleStart >= 0 && googleAvailability > googleStart && googleAvailability < googlePopup)
  assert.ok(emailStart >= 0 && emailAvailability > emailStart && emailAvailability < emailLink)
  assert.match(auth, /X-Firebase-AppCheck/)
  assert.equal((firebase.match(/initializeAppCheck\(/g) || []).length, 1)
  assert.match(firebase, /getFirebaseAppCheckToken/)
})

test('public company-registration entry is fail-closed until the server enables it', () => {
  assert.match(layout, /id="loginCompanyEntry" hidden/)
  assert.match(app, /let cleaningCompanyRegistrationAvailable = false/)
  assert.match(app, /async function refreshCleaningCompanyRegistrationAvailability\(\)/)
  assert.match(app, /const registration = await getCleaningCompanyLegalDocuments\(\)/)
  assert.match(app, /registration\?\.enabled === true/)
  assert.match(app, /entry\.hidden = !cleaningCompanyRegistrationAvailable/)
  assert.match(app, /void refreshCleaningCompanyRegistrationAvailability\(\)/)
  assert.match(app, /if \(!cleaningCompanyRegistrationAvailable\) return/)
})
