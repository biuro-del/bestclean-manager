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
const appEntry = readPortalSource('App.jsx')
const loginStyles = readPortalSource('ui', 'styles', 'login.css')
const firebase = readPortalSource('firebase', 'firebaseClient.js')
const server = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')

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

test('standard login clearly identifies the cleaning-company panel', () => {
  assert.match(layout, /PANEL FIRMY SPRZ&#260;TAJ&#260;CEJ/)
  assert.match(layout, /<h1 class="login-title" id="loginTitle">Zaloguj si&#281;<\/h1>/)
  assert.match(layout, /Logowanie do panelu firmy sprz&#261;taj&#261;cej Cleanzi\./)
  assert.match(layout, /id="loginCompanyStart" type="button">Rejestracja firmy<\/button>/)
  assert.match(app, /loginTitle\.textContent = 'Zaloguj się'/)
  assert.match(app, /if \(title\) title\.textContent = 'Rejestracja firmy'/)
  assert.match(app, /loginCopy\.textContent = 'Logowanie do panelu firmy sprz\\u0105taj\\u0105cej Cleanzi\.'/)
})

test('selected cleaning-company login composition stays isolated and interactive', () => {
  assert.match(appEntry, /import '\.\/ui\/styles\/login\.css'/)
  assert.ok(appEntry.indexOf("import './ui/styles/login.css'") > appEntry.indexOf("import './ui/styles/commandCenter.css'"))
  assert.match(layout, /id="loginPasswordToggle"/)
  assert.match(layout, /class="ph ph-eye"/)
  assert.match(layout, /class="ph ph-lock-key"/)
  assert.match(app, /const setPasswordVisibility = \(isVisible\) =>/)
  assert.match(app, /passwordInput\.type = isVisible \? 'text' : 'password'/)
  assert.match(app, /passwordToggle\.setAttribute\('aria-pressed', String\(isVisible\)\)/)
  assert.match(app, /passwordToggle\?\.addEventListener\('click', togglePasswordVisibility\)/)
  assert.match(app, /passwordToggle\?\.removeEventListener\('click', togglePasswordVisibility\)/)
  assert.match(loginStyles, /grid-template-columns: minmax\(0, 53\.7%\) minmax\(0, 46\.3%\)/)
  assert.match(
    loginStyles,
    /#loginScreen \.login-panel \{[\s\S]*?align-items: center !important;[\s\S]*?justify-content: center !important;/,
  )
  assert.match(loginStyles, /width: min\(384px, 100%\) !important/)
  assert.match(loginStyles, /font-size: clamp\(39px, 3\.05vw, 44px\) !important/)
  assert.match(loginStyles, /min-height: 56px !important/)
  assert.match(loginStyles, /@media \(max-width: 620px\)[\s\S]*height: 128px !important/)
  assert.match(
    loginStyles,
    /@media \(max-width: 920px\) and \(max-height: 820px\)[\s\S]*\.login-visual \{[\s\S]*display: none !important/,
  )
  assert.match(loginStyles, /@media \(max-height: 680px\)[\s\S]*min-height: 44px !important/)
  assert.match(
    loginStyles,
    /@media \(max-height: 480px\)[\s\S]*\.login-security-note \{[\s\S]*display: none !important/,
  )
  assert.doesNotMatch(
    loginStyles,
    /#loginScreen\.login-screen\s*\{[^}]*display:\s*[^;}]+!important/,
    'no login-screen rule may override the authenticated inline display state',
  )
  assert.doesNotMatch(loginStyles, /transform:\s*scale\(/)
  assert.doesNotMatch(loginStyles, /(?:^|[;{\s])zoom\s*:/)
  assert.doesNotMatch(
    loginStyles,
    /#loginScreen(?:\.login-screen| \.login-panel| \.login-card)\s*\{[^}]*overflow:\s*hidden/,
    'compact sizing must not hide overflowing login content',
  )
  for (const selector of [
    'login-company-panel',
    'login-company-email-panel',
    'login-reset-panel',
    'login-organization-panel',
    'login-mfa-panel',
  ]) {
    assert.match(loginStyles, new RegExp(`#loginScreen \\.${selector}\\[hidden\\]`))
  }
  assert.match(loginStyles, /#loginScreen \.login-card \{[\s\S]*background: transparent !important/)
  assert.match(loginStyles, /@media \(max-width: 620px\)/)
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

test('company registration obtains the central gate grant before Firebase Auth and reuses the existing App Check provider', () => {
  const googleStart = auth.indexOf('export async function startCleaningCompanyGoogleSignIn')
  const googleGrant = auth.indexOf('await issueCleaningCompanyRegistrationGrant(firebase, {', googleStart)
  const googleCredential = auth.indexOf('signInWithCredential(firebase.auth, GoogleAuthProvider.credential(idToken))', googleStart)
  const googleAvailability = auth.indexOf('await assertCleaningCompanyRegistrationAvailable()', googleStart)
  const emailStart = auth.indexOf('export async function requestCleaningCompanyEmailLink')
  const emailGrant = auth.indexOf('await issueCleaningCompanyRegistrationGrant(firebase, {', emailStart)
  const emailLink = auth.indexOf('sendSignInLinkToEmail', emailStart)
  const emailAvailability = auth.indexOf('await assertCleaningCompanyRegistrationAvailable()', emailStart)

  assert.ok(googleStart >= 0 && googleAvailability > googleStart && googleAvailability < googleGrant)
  assert.ok(googleGrant > googleStart && googleGrant < googleCredential)
  assert.ok(emailStart >= 0 && emailAvailability > emailStart && emailAvailability < emailGrant)
  assert.ok(emailGrant > emailStart && emailGrant < emailLink)
  assert.match(auth, /httpsCallable/)
  assert.match(auth, /getFunctions\(firebase\.app, CENTRAL_REGISTRATION_FUNCTIONS_REGION\)/)
  assert.match(auth, /providerId: 'google\.com'/)
  assert.match(auth, /providerId: 'emailLink'/)
  assert.match(auth, /VITE_CENTRAL_REGISTRATION_ISSUER_READY/)
  assert.match(auth, /VITE_CENTRAL_REGISTRATION_GOOGLE_CLIENT_ID/)
  assert.match(auth, /requireCleaningCompanyAppCheckToken\(\)/)
  assert.match(auth, /X-Firebase-AppCheck/)
  assert.equal((firebase.match(/initializeAppCheck\(/g) || []).length, 1)
  assert.match(firebase, /getFirebaseAppCheckToken/)
  assert.match(server, /https:\/\/accounts\.google\.com/)
})

test('company bootstrap requires the central registration provenance claim', () => {
  assert.match(server, /hasCleaningCompanyRegistrationProvenance/)
  assert.match(server, /REGISTRATION_PROVENANCE_REQUIRED/)
  assert.match(auth, /getIdToken\(true\)/)
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
