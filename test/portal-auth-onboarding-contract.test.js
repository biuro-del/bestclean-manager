'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')

test('zwykły panel logowania nie pokazuje logo karty ani wyboru obszaru', () => {
  const app = fs.readFileSync(path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'ui', 'portalApp.js'), 'utf8')
  const template = fs.readFileSync(path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'ui', 'layoutTemplate.js'), 'utf8')

  assert.doesNotMatch(template, /class="login-card-brand"/)
  assert.doesNotMatch(template, /id="loginAuthScopeField"|>Obszar logowania</)
  assert.match(template, /id="loginAuthScope"[^>]*\bhidden\b[^>]*aria-hidden="true"/)
  assert.match(app, /requestedPanel === 'admin'/)
  assert.doesNotMatch(app, /authScopeField\.hidden/)
})

test('frontend obsługuje Google, weryfikację email, reset oraz bezpieczne dołączenie pierwszego hasła', () => {
  const auth = fs.readFileSync(path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'auth', 'authService.js'), 'utf8')
  const firebaseClient = fs.readFileSync(path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'firebase', 'firebaseClient.js'), 'utf8')
  assert.match(auth, /requestGoogleSignInCredential\(\)/)
  assert.match(auth, /signInWithCredential\(firebase\.auth, GoogleAuthProvider\.credential\(idToken\)\)/)
  assert.doesNotMatch(auth, /signInWithPopup\(/)
  assert.match(auth, /signInWithRedirect\(firebase\.auth, provider\)/)
  assert.match(auth, /GOOGLE_IDENTITY_LOAD_TIMEOUT_MS/)
  assert.match(auth, /GOOGLE_ACCOUNT_SELECTION_TIMEOUT_MS/)
  assert.match(auth, /GOOGLE_IDENTITY_LOAD_TIMEOUT/)
  assert.match(auth, /GOOGLE_ACCOUNT_SELECTION_TIMEOUT/)
  assert.match(auth, /googleIdentityScriptPromise = null/)
  assert.match(firebaseClient, /AUTH_PERSISTENCE_TIMEOUT_MS = 8000/)
  assert.match(firebaseClient, /Promise\.race\(\[persistence, timeout\]\)/)
  assert.match(auth, /sendEmailVerification\(user\)/)
  assert.match(auth, /sendPasswordResetEmail\(firebase\.auth, email\)/)
  assert.match(auth, /EMAIL_VERIFICATION_REQUIRED/)
  assert.doesNotMatch(auth, /fetchSignInMethodsForEmail/)
  assert.match(auth, /EmailAuthProvider\.credential\(before\.email, password\)/)
  assert.match(auth, /reauthenticateWithCredential\(user, GoogleAuthProvider\.credential\(idToken\)\)/)
  assert.match(auth, /linkWithCredential\(reauthenticatedUser, credential\)/)
  assert.match(auth, /originalUid/)
  assert.match(auth, /hasGoogleProvider/)
  assert.match(auth, /hasPasswordProvider/)
  assert.doesNotMatch(auth, /createUserWithEmailAndPassword/)
})

test('portal daje zalogowanemu kontu Google bezpieczny formularz ustawienia pierwszego hasła', () => {
  const auth = fs.readFileSync(path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'auth', 'authService.js'), 'utf8')
  const template = fs.readFileSync(
    path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'features', 'settings', 'modules', 'my-account', 'account-security', 'template.html'),
    'utf8',
  )
  const settings = fs.readFileSync(path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'features', 'settings', 'index.js'), 'utf8')

  assert.match(template, /data-account-password-form/)
  assert.match(template, /data-account-password-email/)
  assert.match(template, /data-account-password-new/)
  assert.match(template, /data-account-password-confirm/)
  assert.match(template, /autocomplete="new-password"/)
  assert.match(settings, /ctx\.getEmailPasswordLoginState/)
  assert.match(settings, /ctx\.linkEmailPasswordToCurrentUser/)
  assert.match(settings, /password\.value !== confirmation\.value/)
  assert.match(settings, /Potwierdź teraz to samo konto Google/)

  const accountLinkStart = auth.indexOf('export async function linkEmailPasswordToCurrentUser')
  const accountLinkEnd = auth.indexOf('export async function loginWithGoogle', accountLinkStart)
  const accountLink = auth.slice(accountLinkStart, accountLinkEnd)
  assert.ok(accountLink.indexOf('if (before.hasPasswordProvider)') < accountLink.indexOf('if (!before.hasGoogleProvider)'))

  const renderStateStart = settings.indexOf('const renderState = (state) =>')
  const renderStateEnd = settings.indexOf('const loadState = async () =>', renderStateStart)
  const renderState = settings.slice(renderStateStart, renderStateEnd)
  assert.ok(renderState.indexOf('if (state?.hasPasswordProvider)') < renderState.indexOf('if (!state?.hasGoogleProvider)'))
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
  assert.match(app, /TRIAL: 'Okres próbny'/)
  assert.match(app, /PAYMENT_PENDING/)
})

test('produkcyjny build portalu ma jawnie konfigurowalny publiczny Registration API base URL', () => {
  const hosting = fs.readFileSync(path.join(root, 'apphosting.yaml'), 'utf8')
  const envExample = fs.readFileSync(path.join(root, 'web-app', '.env.example'), 'utf8')
  assert.match(hosting, /VITE_REGISTRATION_API_BASE_URL[\s\S]*https:\/\/registration-cleanzi\.web\.app/)
  assert.match(envExample, /VITE_REGISTRATION_API_BASE_URL=https:\/\/registration-cleanzi\.web\.app/)
})

test('backend dopuszcza wyłącznie stare niezweryfikowane konta po odczycie członkostw UID', () => {
  const backend = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
  const handlerIndex = backend.indexOf('async function handleAuthSessionContextRequest')
  const membershipIndex = backend.indexOf('const rows = await getRequesterMemberships', handlerIndex)
  const policyIndex = backend.indexOf('evaluateTenantEmailVerification(', membershipIndex)
  const verificationIndex = backend.indexOf("status: 'EMAIL_VERIFICATION_REQUIRED'", policyIndex)
  assert.ok(handlerIndex > 0)
  assert.ok(membershipIndex > handlerIndex)
  assert.ok(policyIndex > membershipIndex)
  assert.ok(verificationIndex > policyIndex)
  assert.match(backend, /m\.created_at as membership_created_at/)
  assert.match(backend, /w\.created_at as worker_created_at/)
})

test('portal exposes a safe password setup path for Google-only accounts', () => {
  const app = fs.readFileSync(path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'ui', 'portalApp.js'), 'utf8')
  const layout = fs.readFileSync(path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'ui', 'layoutTemplate.js'), 'utf8')
  const settings = fs.readFileSync(path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'features', 'settings', 'index.js'), 'utf8')

  assert.match(layout, /id="loginGooglePasswordHint"/)
  assert.match(app, /function setLoginGooglePasswordHintVisible/)
  assert.match(app, /showGooglePasswordHint: selectedAuthScope\(\) === 'organization' && passwordResetEligible/)
  assert.match(app, /if \(isPlatformLogin\) setLoginGooglePasswordHintVisible\(false\)/)
  assert.match(layout, /id="dashboardAccountPasswordPrompt"/)
  assert.match(layout, /data-route="settingsAccountSecurity">Ustaw hasło</)
  assert.match(app, /function accountCanAddEmailPassword/)
  assert.match(app, /state\?\.hasGoogleProvider/)
  assert.match(app, /!state\?\.hasPasswordProvider/)
  assert.match(settings, /dashboardAccountPasswordPrompt.*setAttribute\('hidden', ''\)/)
})
