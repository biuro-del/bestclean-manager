'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')

test('frontend obsługuje Google, weryfikację email i bezpieczny reset hasła Firebase', () => {
  const auth = fs.readFileSync(path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'auth', 'authService.js'), 'utf8')
  assert.match(auth, /new GoogleAuthProvider\(\)/)
  assert.match(auth, /signInWithPopup\(firebase\.auth, provider\)/)
  assert.match(auth, /signInWithRedirect\(firebase\.auth, provider\)/)
  assert.match(auth, /sendEmailVerification\(user\)/)
  assert.match(auth, /sendPasswordResetEmail\(firebase\.auth, email\)/)
  assert.match(auth, /EMAIL_VERIFICATION_REQUIRED/)
  assert.doesNotMatch(auth, /fetchSignInMethodsForEmail/)
})

test('portal zachowuje wybór istniejącej organizacji i finalizuje nową wyłącznie przez Registration API', () => {
  const app = fs.readFileSync(path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'ui', 'portalApp.js'), 'utf8')
  const auth = fs.readFileSync(path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'auth', 'authService.js'), 'utf8')
  assert.match(app, /showLoginOrganizationSelection/)
  assert.match(app, /continuePendingRegistration/)
  assert.match(app, /completeRegistrationCompany\(/)
  assert.match(app, /selectOrganization\(button\.dataset\.orgId\)/)
  assert.match(app, /window\.location\.assign\(getRegistrationPageUrl\(\)\)/)
  assert.doesNotMatch(app, /createOrganization\(/)
  assert.match(app, /resetPortalState\(\{ session \}\)/)
  assert.match(auth, /\/portal\/organization-profile/)
  assert.match(auth, /\/portal\/company-registry\/lookup/)
})

test('portal przechowuje token bind tylko w fragmencie/sessionStorage i rozdziela bind, zgody oraz verify', () => {
  const service = fs.readFileSync(
    path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'services', 'registrationOnboardingService.js'),
    'utf8',
  )
  const bindStart = service.indexOf('export async function bindRegistrationAccount')
  const bindEnd = service.indexOf('export const bindGoogleRegistrationAccount', bindStart)
  const bindBody = service.slice(bindStart, bindEnd)
  assert.match(service, /url\.hash\.replace/)
  assert.match(service, /fragment\.get\('registrationToken'\)/)
  assert.match(service, /url\.searchParams\.delete\('auth'\)/)
  assert.match(service, /historyValue\?\.replaceState/)
  assert.match(bindBody, /registrationToken/)
  assert.match(bindBody, /REGISTRATION_TOKEN_STORAGE_PREFIX/)
  assert.doesNotMatch(bindBody, /\/api\/registration\/verify/)
  assert.match(service, /\/api\/registration\/consents/)
  assert.match(service, /export function verifyRegistration/)
  assert.match(service, /\/api\/registration\/complete-company/)
  assert.match(service, /'Idempotency-Key'/)
  assert.doesNotMatch(service, /searchParams\.set\(['"]registrationToken/)

  const app = fs.readFileSync(path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'ui', 'portalApp.js'), 'utf8')
  const routeStart = app.indexOf('async function routePendingRegistrationAttempt')
  const routeEnd = app.indexOf('async function continuePendingRegistration', routeStart)
  const routeBody = app.slice(routeStart, routeEnd)
  assert.match(routeBody, /attempt\.consentsComplete !== true/)
  assert.match(routeBody, /await verifyPendingRegistrationAndShowCompany\(\)/)
  assert.match(routeBody, /isRegistrationVerificationError\(error\)/)
})

test('onboarding firmy zbiera ownera, dane kanoniczne, adres i billing oraz otwiera tylko Stripe Checkout', () => {
  const app = fs.readFileSync(path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'ui', 'portalApp.js'), 'utf8')
  const template = fs.readFileSync(path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'ui', 'layoutTemplate.js'), 'utf8')
  for (const id of [
    'loginRegistrationOwnerFirstName',
    'loginRegistrationOwnerLastName',
    'loginRegistrationLegalName',
    'loginRegistrationCountry',
    'loginRegistrationTaxType',
    'loginRegistrationTaxId',
    'loginRegistrationAddress',
    'loginRegistrationPostalCode',
    'loginRegistrationLocality',
    'loginRegistrationBillingEmail',
  ]) {
    assert.match(template, new RegExp(`id=["']${id}["']`))
  }
  assert.match(app, /lookupRegistrationCompany\(/)
  assert.match(app, /bindRegistrationAccount\(pending\.registrationId, registrationOwnerPayload\(\)\)/)
  assert.match(app, /isSafeStripeCheckoutUrl\(result\.checkoutUrl\)/)
  assert.match(app, /Trial 7 dni \(168 godzin\)/)
  assert.match(app, /PAYMENT_PENDING/)
})

test('produkcyjny build portalu ma jawnie konfigurowalny publiczny Registration API base URL', () => {
  const hosting = fs.readFileSync(path.join(root, 'apphosting.yaml'), 'utf8')
  const envExample = fs.readFileSync(path.join(root, 'web-app', '.env.example'), 'utf8')
  assert.match(hosting, /VITE_REGISTRATION_API_BASE_URL[\s\S]*https:\/\/registration-cleanzi\.web\.app/)
  assert.match(envExample, /VITE_REGISTRATION_API_BASE_URL=https:\/\/registration-cleanzi\.web\.app/)
})

test('backend sprawdza zweryfikowany email przed odczytem członkostw tenantowych', () => {
  const backend = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
  const verificationIndex = backend.indexOf("status: 'EMAIL_VERIFICATION_REQUIRED'", backend.indexOf('async function handleAuthSessionContextRequest'))
  const membershipIndex = backend.indexOf('const rows = await getRequesterMemberships', verificationIndex)
  assert.ok(verificationIndex > 0)
  assert.ok(membershipIndex > verificationIndex)
})
