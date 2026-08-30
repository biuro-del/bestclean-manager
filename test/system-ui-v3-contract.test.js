'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.join(__dirname, '..')
const appPath = path.join(repoRoot, 'web-app/apps/portal-web/src/App.jsx')
const layoutPath = path.join(repoRoot, 'web-app/apps/portal-web/src/ui/layoutTemplate.js')
const systemStylesPath = path.join(
  repoRoot,
  'web-app/apps/portal-web/src/ui/styles/systemUiV3.css',
)

function readRequired(filePath) {
  assert.ok(fs.existsSync(filePath), `Brak wymaganego pliku: ${path.relative(repoRoot, filePath)}`)
  return fs.readFileSync(filePath, 'utf8')
}

function occurrenceCount(source, fragment) {
  return source.split(fragment).length - 1
}

test('System UI V3 jest ostatnią warstwą globalnego wyglądu portalu', () => {
  const app = readRequired(appPath)
  const systemImport = "import './ui/styles/systemUiV3.css'"
  const commandCenterImport = "import './ui/styles/commandCenter.css'"
  const loginImport = "import './ui/styles/login.css'"

  const systemIndex = app.indexOf(systemImport)
  const commandCenterIndex = app.indexOf(commandCenterImport)
  const loginIndex = app.indexOf(loginImport)

  assert.equal(occurrenceCount(app, systemImport), 1)
  assert.ok(commandCenterIndex >= 0, 'App.jsx musi nadal importować commandCenter.css')
  assert.ok(loginIndex >= 0, 'App.jsx musi nadal importować login.css')
  assert.ok(systemIndex > commandCenterIndex, 'systemUiV3.css musi być po commandCenter.css')
  assert.ok(systemIndex > loginIndex, 'systemUiV3.css musi być po login.css')
})
test('opcja 1 definiuje spójny zestaw tokenów System UI V3', () => {
  const styles = readRequired(systemStylesPath)
  const requiredTokens = [
    '--system-ui-v3-option',
    '--system-ui-v3-canvas',
    '--system-ui-v3-surface',
    '--system-ui-v3-surface-muted',
    '--system-ui-v3-border',
    '--system-ui-v3-text',
    '--system-ui-v3-muted',
    '--system-ui-v3-primary',
    '--system-ui-v3-radius',
    '--system-ui-v3-shadow',
  ]

  assert.match(styles, /--system-ui-v3-option\s*:\s*1\s*;/)
  requiredTokens.forEach((token) => {
    assert.match(styles, new RegExp(`${token}\\s*:\\s*[^;]+;`), `Brak tokenu ${token}`)
  })
})

test('globalna warstwa spłaszcza shell, sidebar, formularze i tabele oraz zachowuje fokus', () => {
  const styles = readRequired(systemStylesPath)
  const safeInputSelector = '#portalRoot :is(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]):not([type="hidden"]), select, textarea)'
  const safeSidebarSelector = '#portalRoot:not([data-organization-kind="FACILITY_MANAGER"]) .sidebar'

  assert.match(
    styles,
    /#portalRoot\s+\.content-shell\s*\{[\s\S]*?background(?:-color)?\s*:\s*var\(--system-ui-v3-canvas\)[\s\S]*?box-shadow\s*:\s*none\s*;/,
  )
  const safeSidebarBlockStart = styles.indexOf(`${safeSidebarSelector} {`)
  assert.ok(safeSidebarBlockStart >= 0, 'Sidebar musi wykluczać dedykowany panel FACILITY_MANAGER')
  const safeSidebarBlock = styles.slice(safeSidebarBlockStart, styles.indexOf('}', safeSidebarBlockStart) + 1)
  assert.match(safeSidebarBlock, /border-right\s*:[^;]+;/)
  assert.match(safeSidebarBlock, /box-shadow\s*:\s*none\s*!important\s*;/)
  const safeInputBlockStart = styles.indexOf(`${safeInputSelector} {`)
  assert.ok(safeInputBlockStart >= 0, 'Formularze muszą używać selektora wykluczającego techniczne typy inputów')
  const safeInputBlock = styles.slice(safeInputBlockStart, styles.indexOf('}', safeInputBlockStart) + 1)
  assert.match(safeInputBlock, /border-radius\s*:\s*var\(--system-ui-v3-radius\)/)
  assert.match(safeInputBlock, /box-shadow\s*:\s*none\s*;/)
  assert.match(
    styles,
    /#portalRoot\s+:is\([^)]*(?:table|events-table)[^)]*\)\s*\{[\s\S]*?border(?:-color)?\s*:[^;]+;[\s\S]*?box-shadow\s*:\s*none\s*;/,
  )
  assert.match(
    styles,
    /#portalRoot\s+:is\([^)]*(?:button|\[tabindex\])[^)]*\):focus-visible\s*\{[\s\S]*?outline\s*:[^;]+;/,
  )
})

test('System UI V3 ma jawne warianty tabletowe i mobilne', () => {
  const styles = readRequired(systemStylesPath)
  const tabletIndex = styles.indexOf('@media (max-width: 1399px)')
  const mobileIndex = styles.indexOf('@media (max-width: 760px)')

  assert.ok(tabletIndex >= 0, 'Brak breakpointu pośredniego dla laptopa i tabletu')
  assert.ok(mobileIndex > tabletIndex, 'Breakpoint mobilny 760 px musi następować po tabletowym')

  const tabletBlock = styles.slice(tabletIndex, mobileIndex)
  const mobileBlock = styles.slice(mobileIndex)
  assert.match(tabletBlock, /(?:\.content-shell|\.sidebar|\.main)/)
  assert.match(mobileBlock, /(?:\.content-shell|\.sidebar|\.main|input|table)/)
})

test('dashboard zaczyna workspace od aktualności i trzyma live przed alertami w prawej kolumnie', () => {
  const layout = readRequired(layoutPath)

  assert.match(
    layout,
    /class="dash-command-center__workspace"[^>]*>\s*<(?:section|article|div)[^>]*class="[^"]*dash-activity-feed-panel[^"]*"/,
  )

  const workspaceIndex = layout.indexOf('class="dash-command-center__workspace"')
  const feedIndex = layout.indexOf('id="dashActivityFeedTitle"')
  const sideIndex = layout.indexOf('class="dash-command-side"')
  const liveIndex = layout.indexOf('id="dashCommandLivePanel"')
  const alertsIndex = layout.indexOf('id="dashCommandAlertsTitle"')

  assert.ok(workspaceIndex >= 0)
  assert.ok(feedIndex > workspaceIndex)
  assert.ok(sideIndex > feedIndex, 'Prawa kolumna musi następować po feedzie')
  assert.ok(liveIndex > sideIndex, 'Operacje na żywo muszą znajdować się w prawej kolumnie')
  assert.ok(alertsIndex > liveIndex, 'Wymaga reakcji musi znajdować się pod operacjami na żywo')
})

test('dashboard nie duplikuje kluczowych identyfikatorów runtime', () => {
  const layout = readRequired(layoutPath)
  const uniqueIds = [
    'dashCommandCenter',
    'dashCommandLivePanel',
    'dashCommandLiveTitle',
    'dashCommandLiveCount',
    'dashCommandOperationsHost',
    'dashCommandAllOperations',
    'dashCommandAlertsTitle',
    'dashCommandAlertsCount',
    'dashCommandAlertsList',
    'dashActivityFeedTitle',
    'dashActivityFeedDay',
    'dashActivityCalendar',
    'dashActivityFeedSummary',
    'dashRefreshBtn',
    'dashCommandOperationsOverlay',
    'dashCommandAllOperationsList',
  ]

  uniqueIds.forEach((id) => {
    assert.equal(occurrenceCount(layout, `id="${id}"`), 1, `ID ${id} musi wystąpić dokładnie raz`)
  })
})
