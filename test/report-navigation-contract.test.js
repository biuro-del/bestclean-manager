const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')

test('menu Raportów udostępnia pięć podsekcji bez nowych tras', () => {
  const layout = read('web-app', 'apps', 'portal-web', 'src', 'ui', 'layoutTemplate.js')
  const reportsMenu = layout.slice(layout.indexOf('data-toggle="reports"'), layout.indexOf('USTAWIENIA'))

  assert.match(reportsMenu, /data-route="reports" data-report-section="home"/)
  for (const sectionId of ['podsumowanie', 'zestawienia', 'analizy', 'raporty-gotowe', 'moje-raporty']) {
    assert.match(reportsMenu, new RegExp(`data-report-section="${sectionId}"`))
  }
  assert.equal((reportsMenu.match(/data-route="reports"/g) || []).length, 1)
})

test('powłoka portalu otwiera podsekcje przez publiczny kontrakt Raportów', () => {
  const portal = read('web-app', 'apps', 'portal-web', 'src', 'ui', 'portalApp.js')
  const reports = read('web-app', 'apps', 'portal-web', 'src', 'features', 'reports', 'index.js')

  assert.match(portal, /async function openReportsSection\(/)
  assert.match(portal, /getReportsFeature\(\)\.openSection\(normalized/)
  assert.match(portal, /reports-section-change/)
  assert.match(reports, /openSection:\s*reportOpenSection/)
})

test('Zestawienia nie zawierają zduplikowanej Ewidencji czasu pracy', () => {
  const registry = read('web-app', 'apps', 'portal-web', 'src', 'features', 'reports', 'shared', 'reportRegistry.js')
  const reports = read('web-app', 'apps', 'portal-web', 'src', 'features', 'reports', 'index.js')

  assert.doesNotMatch(registry, /work-time-evidence|Ewidencja czasu pracy/)
  assert.match(registry, /id:\s*'workers'.*section:\s*'zestawienia'/s)
  assert.match(reports, /workerTime:\s*'workers'/)
})

test('Historia pracownika ma uproszczony zakres, karty KPI, QR i stan Brak STOP', () => {
  const historyTemplate = read('web-app', 'apps', 'portal-web', 'src', 'features', 'reports', 'shared', 'history-detail.html')
  const reports = read('web-app', 'apps', 'portal-web', 'src', 'features', 'reports', 'index.js')
  const styles = read('web-app', 'apps', 'portal-web', 'src', 'features', 'reports', 'style.css')

  assert.doesNotMatch(historyTemplate, /Szybki zakres|repHistoryRange/)
  assert.match(reports, /reportWorkerHistoryOpenState\(row, todayYmd\(\)\)/)
  assert.match(reports, /zoneDisplay/)
  assert.match(reports, /rep-history-summary-tile is-person/)
  assert.match(styles, /rep-worker-status\.is-missing-stop/)
  assert.match(styles, /rep-worker-reconcile[\s\S]*color:#fff !important/)
})
