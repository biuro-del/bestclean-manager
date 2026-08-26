'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const portalSource = path.join(root, 'web-app', 'apps', 'portal-web', 'src')
const settingsRoot = path.join(portalSource, 'features', 'settings')

const settingsRoutes = [
  'settings',
  'settingsProfile',
  'settingsNotifications',
  'settingsLanguageApp',
  'settingsAccountSecurity',
  'settingsOrganizationData',
  'settingsAlerts',
  'settingsIntegrations',
  'settingsBilling',
  'settingsDataSecurity',
]

const moduleDirectories = [
  ['overview'],
  ['my-account', 'profile'],
  ['my-account', 'notifications'],
  ['my-account', 'language-app'],
  ['my-account', 'account-security'],
  ['organization', 'organization-data'],
  ['organization', 'alerts'],
  ['organization', 'integrations'],
  ['organization', 'billing'],
  ['organization', 'security-data'],
]

function readPortalSource(...segments) {
  return fs.readFileSync(path.join(portalSource, ...segments), 'utf8')
}

function readSettingsSource(...segments) {
  return fs.readFileSync(path.join(settingsRoot, ...segments), 'utf8')
}

function walkFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath]
  })
}

test('katalog Ustawień zawiera przegląd, dwie grupy i dziewięć podsekcji', () => {
  const catalog = readSettingsSource('catalog.js')

  assert.match(catalog, /id: 'my-account', label: 'Moje konto'/)
  assert.match(catalog, /id: 'organization', label: 'Organizacja'/)
  assert.equal((catalog.match(/SettingsModule,/g) || []).length, 10)

  for (const route of settingsRoutes) {
    assert.match(readSettingsSource('modules', ...moduleDirectories[settingsRoutes.indexOf(route)], 'index.js'), new RegExp(`route: '${route}'`))
  }
})

test('każdy moduł ma osobny indeks i szablon', () => {
  for (const directory of moduleDirectories) {
    assert.equal(fs.existsSync(path.join(settingsRoot, 'modules', ...directory, 'index.js')), true)
    assert.equal(fs.existsSync(path.join(settingsRoot, 'modules', ...directory, 'template.html')), true)
  }

  assert.equal(fs.existsSync(path.join(settingsRoot, 'backup')), false)
  assert.equal(fs.existsSync(path.join(settingsRoot, 'styles')), false)
})

test('dziesięć tras korzysta z jednego widoku i jednego lazy-loaded szablonu', () => {
  const feature = readSettingsSource('index.js')
  const router = readPortalSource('ui', 'router.js')
  const portal = readPortalSource('ui', 'portalApp.js')

  assert.match(feature, /export const routes = SETTINGS_ROUTES/)
  assert.match(feature, /export const viewId = 'view-settings'/)
  assert.match(portal, /return PORTAL_SETTINGS_ROUTES\.has\(normalizedRoute\) \? 'settings' : normalizedRoute/)

  for (const route of settingsRoutes) {
    assert.match(router, new RegExp(`${route}: 'view-settings'`))
    assert.match(portal, new RegExp(`${route}: 'view-settings'`))
  }
})

test('centrum ustawień jest stroną domyślną, a podstrony wracają do przeglądu', () => {
  const layout = readPortalSource('ui', 'layoutTemplate.js')
  const portal = readPortalSource('ui', 'portalApp.js')
  const router = readPortalSource('ui', 'router.js')
  const template = readSettingsSource('template.html')
  const feature = readSettingsSource('index.js')
  const overview = readSettingsSource('modules', 'overview', 'template.html')

  assert.equal(layout.match(/data-route="settings"/g)?.length, 1)
  assert.match(router, /return settingsRoutes\.has\(route\) \? 'settings' : route/)
  assert.match(template, /role="region" aria-label="Zawartość ustawień"/)
  assert.doesNotMatch(template, /<main\b/)
  assert.doesNotMatch(template, /settings-hero|portal-page-hero/)
  assert.doesNotMatch(template, /Zarządzaj kontem, organizacją i sposobem działania portalu/)
  assert.doesNotMatch(template, /settings-navigation|settings-mobile-navigation|settingsModuleSelect/)
  assert.match(feature, /backButton\.dataset\.settingsBack = 'true'/)
  assert.match(feature, /navigation\?\.go\?\.\('settings'\)/)
  assert.match(feature, /content\.dataset\.settingsModuleRoute = module\.route/)
  assert.doesNotMatch(feature, /content\.dataset\.settingsRoute = module\.route/)

  for (const route of settingsRoutes) {
    assert.match(portal, new RegExp(`route: '${route}'`))
  }

  for (const route of settingsRoutes.slice(1)) {
    assert.match(overview, new RegExp(`data-route="${route}"`))
  }
})

test('poprawna zapisana podtrasa Ustawień może zostać odtworzona', () => {
  const portal = readPortalSource('ui', 'portalApp.js')
  const routeExistsStart = portal.indexOf('function portalRouteExists(route)')
  const readStoredStart = portal.indexOf('function readStoredCurrentRoute()')
  const routeRestoreContract = portal.slice(routeExistsStart, portal.indexOf('function writeStoredCurrentRoute'))

  assert.notEqual(routeExistsStart, -1)
  assert.notEqual(readStoredStart, -1)
  assert.match(routeRestoreContract, /PORTAL_SETTINGS_ROUTES\.has\(normalizedRoute\)/)
  assert.match(routeRestoreContract, /portalRouteExists\(storedRoute\) \? storedRoute : 'dashboard'/)
})

test('makiety są dostępne semantycznie i nie umożliwiają zapisu', () => {
  const feature = readSettingsSource('index.js')
  const moduleTemplates = moduleDirectories.slice(1).map((directory) => readSettingsSource('modules', ...directory, 'template.html'))

  assert.match(feature, /new Set\(\['OWNER', 'ADMIN'\]\)/)
  assert.match(feature, /shell\.dataset\.canEdit = String\(canEdit\)/)

  for (const template of moduleTemplates) {
    assert.match(template, /<section class="settings-module" aria-labelledby=/)
    assert.match(template, /<fieldset class="settings-fieldset" disabled>/)
    assert.doesNotMatch(template, /<form\b|type="submit"|localStorage|sessionStorage/)

    const controlsOutsideDisabledFieldsets = template
      .replace(/<fieldset class="settings-fieldset" disabled>[\s\S]*?<\/fieldset>/g, '')
      .match(/<(?:input|select|textarea|button)\b/g)
    assert.equal(controlsOutsideDisabledFieldsets, null)
  }
})

test('nowe moduły nie przywracają usług, motywów ani integracji danych', () => {
  const settingsSource = walkFiles(settingsRoot)
    .map((filePath) => fs.readFileSync(filePath, 'utf8'))
    .join('\n')

  assert.doesNotMatch(settingsSource, /backupService|styleService|data-theme|\/portal\/ui-style|DataConnect|fetch\s*\(|localStorage|sessionStorage/i)
  assert.equal(/portal-backups/.test(settingsSource), false)
})

test('start portalu zachowuje nieblokujące czyszczenie wycofanego stanu', () => {
  const source = readPortalSource('ui', 'portalApp.js')
  const cleanupStart = source.indexOf('function cleanupRetiredSettingsStorage()')
  const mountStart = source.indexOf('export function mountPortalApp()')
  const cleanup = source.slice(cleanupStart, mountStart)

  assert.notEqual(cleanupStart, -1)
  assert.match(cleanup, /sessionStorage\.removeItem/)
  assert.match(cleanup, /indexedDB\.deleteDatabase/)
  assert.match(cleanup, /request\.onerror = \(\) => \{\}/)
  assert.match(cleanup, /request\.onblocked = \(\) => \{\}/)
  assert.match(source.slice(mountStart, mountStart + 400), /cleanupRetiredSettingsStorage\(\)/)
})
