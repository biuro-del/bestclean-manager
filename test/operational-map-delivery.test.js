'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const dashboardSource = fs.readFileSync(
  path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'features', 'dashboard', 'index.js'),
  'utf8',
)
const commandCenterStyles = fs.readFileSync(
  path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'ui', 'styles', 'commandCenter.css'),
  'utf8',
)
const portalPackage = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'web-app', 'package.json'), 'utf8'),
)
const backendSource = fs.readFileSync(path.join(repoRoot, 'index.js'), 'utf8')

test('Leaflet jest wersjonowana zaleznoscia lokalnego builda portalu', () => {
  assert.equal(portalPackage.dependencies?.leaflet, '1.9.4')
  assert.match(dashboardSource, /import 'leaflet\/dist\/leaflet\.css'/)
  assert.match(dashboardSource, /import\('leaflet'\)/)
})

test('loader mapy nie zalezy od zewnetrznego CDN', () => {
  assert.doesNotMatch(dashboardSource, /cdn\.jsdelivr\.net\/npm\/leaflet/)
  assert.doesNotMatch(dashboardSource, /cleanzi-leaflet-(?:css|js)/)
})

test('CSP dopuszcza tylko obrazy kafelkow OpenStreetMap', () => {
  const cspMatch = backendSource.match(
    /'Content-Security-Policy':\s*\[(?<directives>[\s\S]*?)\]\.join\('; '\)/,
  )

  assert.ok(cspMatch?.groups?.directives)
  assert.match(cspMatch.groups.directives, /img-src[^"\r\n]*https:\/\/\*\.tile\.openstreetmap\.org/)
  assert.doesNotMatch(cspMatch.groups.directives, /script-src[^"\r\n]*jsdelivr/)
})

test('alarm mapy nie otwiera automatycznie szczegolow pracownika', () => {
  assert.match(
    dashboardSource,
    /const selectedWorkerKey = String\(options\?\.selectedWorkerKey \?\? ''\)\.trim\(\)/,
  )
  assert.match(
    dashboardSource,
    /dashboardActiveWorkerMapPersonHtml\(location,\s*\{\s*selected: false,/,
  )
})

test('mapa pokazuje etykiety i orbite tylko w aktywnym kontekscie', () => {
  assert.match(
    commandCenterStyles,
    /\.dash-command-map-object__label,[\s\S]*?visibility: hidden;[\s\S]*?opacity: 0;/,
  )
  assert.match(
    commandCenterStyles,
    /\.dash-command-map-object:is\(:hover, :focus-within, \.is-expanded\):not\(\.is-live-open\)[\s\S]*?visibility: visible;[\s\S]*?opacity: 1;/,
  )
  assert.match(
    commandCenterStyles,
    /\.dash-command-map-object\.is-live-open[\s\S]*?\.dash-command-map-object__people[\s\S]*?\.dash-command-map-person[\s\S]*?visibility: hidden;/,
  )
})

test('klikniecie pustej mapy zamyka aktywne szczegoly', () => {
  assert.match(dashboardSource, /function dashboardClearActiveWorkerMapSelection\(\)/)
  assert.match(
    dashboardSource,
    /dashboardActiveWorkerMapDialogIsOpen\(\)\) \{\s*dashboardClearActiveWorkerMapSelection\(\)/,
  )
})
