'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..', 'web-app', 'apps', 'portal-web', 'src', 'features', 'workers', 'worker_list_profile')
const template = fs.readFileSync(path.join(root, 'template.html'), 'utf8')
const feature = fs.readFileSync(path.join(root, 'index.js'), 'utf8')
const style = fs.readFileSync(path.join(root, 'style.css'), 'utf8')

test('narzędzia listy pracowników rozdzielają filtrowanie od szybkich działań', () => {
  assert.match(template, /class="worker-profile-filter-layout"/)
  assert.match(template, /class="worker-profile-filter-workspace"/)
  assert.match(template, /class="worker-profile-quick-actions"/)
  assert.match(template, /id="wkOpenExportBtn"/)
  assert.match(template, /id="wkAddBtn"/)
  assert.match(style, /grid-template-columns:minmax\(0,1fr\) minmax\(290px,320px\)/)
  assert.match(style, /@media \(max-width:720px\)/)
})

test('tabela nie pokazuje kontaktu i udostępnia jedno menu akcji', () => {
  assert.doesNotMatch(template, /<div>Kontakt<\/div>/)
  assert.doesNotMatch(feature, /worker-profile-contact-cell/)
  assert.match(feature, /data-worker-profile-actions-index/)
  assert.match(template, /id="wkRowActionMenu"/)
  assert.match(template, /data-worker-row-action="account"/)
  assert.match(template, /data-worker-row-action="edit"/)
  assert.match(template, /data-worker-row-action="delete"/)
  assert.match(style, /\.worker-profile-row-action-menu\{[\s\S]*?position:fixed/)
})

test('menu zachowuje dotychczasowe operacje profilu pracownika', () => {
  assert.match(feature, /openWorkerAccount\(worker, router\)/)
  assert.match(feature, /openWorkerProfileModal\(worker, canManageWorkers\(\) \? 'edit' : 'view'\)/)
  assert.match(feature, /void deleteWorkerProfileData\(worker\)/)
  assert.match(feature, /canDeleteWorkers\(\) && !workerProfileIsOwner\(worker\)/)
})

test('rekordy tabeli majÄ… spĂłjnÄ… typografiÄ™, a szybkie dziaĹ‚ania sÄ… kompaktowe', () => {
  assert.match(style, /\.worker-profile-role-cell strong\{[\s\S]*?font-size:12\.5px/)
  assert.match(style, /\.worker-profile-status,\s*#portalRoot #view-workerProfile \.worker-profile-online\{[\s\S]*?font-size:12\.5px/)
  assert.match(style, /\.worker-profile-quick-action\{[\s\S]*?min-height:42px[\s\S]*?font-size:11\.5px/)
  assert.match(style, /\.worker-profile-quick-action i\{[\s\S]*?font-size:17px/)
})

test('historyczny brak STOP z biezacego miesiaca wyroznia caly rekord pracownika', () => {
  assert.match(feature, /status:\s*'RUNNING'/)
  assert.match(feature, /fromIso:\s*monthStart/)
  assert.match(feature, /toIso:\s*today/)
  assert.match(feature, /applyCurrentMonthMissingStopStatus/)
  assert.match(feature, /has-missing-stop/)
  assert.match(style, /\.workers-row\.has-missing-stop\{[\s\S]*?background:#fff8df !important/)
})
