const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const featureRoot = path.join(
  projectRoot,
  'web-app',
  'apps',
  'portal-web',
  'src',
  'features',
  'events',
)

const template = fs.readFileSync(path.join(featureRoot, 'template.html'), 'utf8')
const source = fs.readFileSync(path.join(featureRoot, 'index.js'), 'utf8')
const styles = fs.readFileSync(path.join(featureRoot, 'style.css'), 'utf8')

test('filtry zdarzen maja responsywna siatke i otwieraja natywny wybor daty z calego pola', () => {
  assert.match(template, /class="events-filter-grid"/)
  assert.equal((template.match(/data-events-date-picker/g) ?? []).length, 3)
  assert.doesNotMatch(template, /class="events-filter-date-row"/)
  assert.doesNotMatch(template, /class="events-filter-main-row"/)

  assert.match(source, /typeof input\.showPicker === 'function'/)
  assert.match(source, /document\.querySelectorAll\('\[data-events-date-picker\]'\)/)
  assert.match(styles, /grid-template-columns:repeat\(12, minmax\(0, 1fr\)\)/)
  assert.match(styles, /@media \(max-width:560px\)[\s\S]*?grid-template-columns:1fr/)
})

test('menu Pobierz udostepnia PDF, CSV i XLS zamiast osobnych przyciskow eksportu', () => {
  assert.match(template, /id="evDownloadBtn"/)
  assert.match(template, />Pobierz</)
  assert.deepEqual(
    [...template.matchAll(/data-events-export-format="([^"]+)"/g)].map((match) => match[1]),
    ['pdf', 'csv', 'xls'],
  )
  assert.doesNotMatch(template, /id="evExportPdfBtn"/)
  assert.doesNotMatch(template, /id="evExportExcelBtn"/)

  assert.match(source, /function downloadEventsCsv\(/)
  assert.match(source, /\['pdf', 'csv', 'xls'\]\.includes/)
  assert.match(source, /setEventsDownloadMenuOpen/)
  assert.match(styles, /\.events-download-popover\[hidden\]/)
})

test('awatary zdarzen i problemow korzystaja ze wzorca oraz assetow Pulpitu', () => {
  assert.match(source, /resolveOperationalMapAvatarKind/)
  assert.match(source, /\/assets\/avatars\/default-/)
  assert.match(source, /class="events-worker-avatar"[\s\S]*?eventWorkerAvatarHtml/)
  assert.match(source, /class="events-integrity-card-avatars"/)
  assert.match(source, /class="ev-integrity-modal-worker-avatar"/)
  assert.match(styles, /\.events-integrity-card-avatars img,[\s\S]*?object-fit:cover/)
})

test('naglowki paneli zdarzen dziedzicza typografie sekcji Operacje na zywo', () => {
  assert.match(
    styles,
    /\.events-filter-heading h2,[\s\S]*?\.events-integrity-panel-head strong\{[\s\S]*?font-size:16px !important;[\s\S]*?font-weight:850 !important;[\s\S]*?letter-spacing:-\.02em !important;/,
  )
})

test('alerty integralnosci maja czytelne etykiety i mocny przycisk akcji', () => {
  assert.match(styles, /#evIntegrityModalOverlay \.ev-integrity-modal-worker strong\{[\s\S]*?font-size:12\.5px/)
  assert.match(styles, /#evIntegrityModalOverlay \.ev-integrity-modal-count\{[\s\S]*?background:#fee2e2;[\s\S]*?font-size:10\.5px/)
  assert.match(styles, /#evIntegrityModalOverlay\[data-tone="review"\] \.ev-integrity-modal-count\{[\s\S]*?background:#fff2c7/)
  assert.match(styles, /#evIntegrityModalOverlay \.ev-integrity-modal-show\{[\s\S]*?background:#5b52eb !important;[\s\S]*?color:#fff !important/)
})

test('edytor zdarzenia ma uproszczony i klikalny wybor START oraz STOP', () => {
  assert.equal((template.match(/data-event-time-picker/g) ?? []).length, 2)
  assert.match(template, /ph-clock-countdown/)
  assert.match(template, /ph-check-circle/)
  assert.doesNotMatch(template, /id="evStopNowBtn"/)
  assert.doesNotMatch(source, /setEventStopNow/)
  assert.match(source, /modeIcon\.className = 'ph ph-calendar-check'/)
  assert.match(source, /document\.querySelectorAll\('\[data-event-time-picker\]'\)/)
  assert.match(source, /classList\.toggle\('has-value'/)
  assert.match(styles, /\.ev-editor-time-card\.has-value \.ev-editor-time-state/)
})

test('przycisk usuwania w filtrach ma jednoznaczny czerwony kontrast', () => {
  assert.match(template, /class="btn2 events-delete-button" id="evDeleteSelectedBtn"/)
  assert.doesNotMatch(template, /class="btn2 danger" id="evDeleteSelectedBtn"/)
  assert.match(
    styles,
    /#portalRoot #view-events \.events-filter-actions \.events-delete-button\{[\s\S]*?border-color:#DC0000 !important;[\s\S]*?background:#DC0000 !important;[\s\S]*?color:#fff !important;/,
  )
  assert.match(
    styles,
    /#portalRoot #view-events \.events-filter-actions \.events-delete-button:disabled\{[\s\S]*?background:#DC0000 !important;[\s\S]*?opacity:1 !important;/,
  )
})

test('fioletowe akcje zdarzen maja czytelna typografie wzorca Pobierz', () => {
  assert.match(source, /<i class="ph ph-caret-right"/)
  assert.match(template, /id="evSaveBtn"[\s\S]*?<i class="ph ph-check"/)
  assert.match(
    styles,
    /#evIntegrityModalOverlay \.ev-integrity-modal-show,\s*#evEditorOverlay #evSaveBtn\{[\s\S]*?background:#5b52eb !important;[\s\S]*?font-weight:700 !important;[\s\S]*?letter-spacing:0 !important;/,
  )
  assert.match(
    styles,
    /#evIntegrityModalOverlay \.ev-integrity-modal-show\{[\s\S]*?min-height:34px !important;[\s\S]*?padding:5px 9px !important;[\s\S]*?font-size:10\.5px !important;/,
  )
  assert.match(styles, /#evEditorOverlay #evSaveBtn\{[\s\S]*?font-size:12\.5px !important;/)
})

test('przyciski stopki edytora dziela proporcje i typografie Zapisz zmiany', () => {
  assert.match(
    styles,
    /#evEditorOverlay \.ev-editor-footer :is\(#evDeleteBtn, #evCancelBtn, #evSaveBtn\)\{[\s\S]*?min-height:44px !important;[\s\S]*?border-radius:10px !important;[\s\S]*?font-size:12\.5px !important;[\s\S]*?font-weight:700 !important;/,
  )
  assert.match(
    styles,
    /#evEditorOverlay \.ev-editor-footer :is\(#evDeleteBtn, #evCancelBtn, #evSaveBtn\) i\{[\s\S]*?font-size:14px !important;/,
  )
})
