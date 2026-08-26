const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const featureDir = path.join(root, 'web-app', 'apps', 'portal-web', 'src', 'features', 'workers', 'account')
const template = fs.readFileSync(path.join(featureDir, 'template.html'), 'utf8')
const style = fs.readFileSync(path.join(featureDir, 'style.css'), 'utf8')
const source = fs.readFileSync(path.join(featureDir, 'index.js'), 'utf8')

test('worker account keeps all seven tab and panel contracts', () => {
  for (const tab of ['account', 'security', 'roles', 'orders', 'activity', 'time', 'files']) {
    assert.match(template, new RegExp(`data-wa-tab="${tab}"`))
    assert.match(template, new RegExp(`data-wa-panel="${tab}"`))
  }

  for (const id of [
    'waEditAccountBtn',
    'waSaveAccountBtn',
    'waCancelAccountBtn',
    'waEditSecurityBtn',
    'waSaveSecurityBtn',
    'waCancelSecurityBtn',
    'waEditRolesBtn',
    'waSaveRoleBtn',
    'waCancelRoleBtn',
  ]) {
    assert.match(template, new RegExp(`id="${id}"`))
  }
})

test('worker account groups the redesigned workspaces without changing field ids', () => {
  for (const className of [
    'worker-account-form-sections',
    'worker-account-security-workspace',
    'worker-account-roles-workspace',
    'worker-account-time-filter-grid',
  ]) {
    assert.match(template, new RegExp(`class="[^"]*${className}`))
  }

  for (const id of [
    'waWorkerId',
    'waName',
    'waEmail',
    'waContractType',
    'waNewPassword',
    'waRole',
    'waOrdersPageSize',
    'waEventsPageSize',
    'waTimeFrom',
    'waTimeMonthPick',
    'waDownloadTimeBtn',
  ]) {
    assert.match(template, new RegExp(`id="${id}"`))
  }
})

test('worker account uses the portal icon system and desktop layout safeguards', () => {
  assert.doesNotMatch(template, /<svg\b/)
  assert.doesNotMatch(source, /<svg\b/)
  assert.match(template, /class="ph ph-user"/)
  assert.match(template, /class="ph ph-shield-check"/)
  assert.match(source, /ph ph-eye-slash/)
  assert.match(style, /\.worker-account-left\s*\{[\s\S]*position:\s*sticky/)
  assert.match(style, /@media \(max-width:\s*1500px\)/)
  assert.match(style, /@media \(max-width:\s*1100px\)[\s\S]*grid-template-columns:\s*1fr/)
  assert.match(style, /\.btn2\[hidden\][\s\S]*display:\s*none !important/)
})

test('worker account uses one shared table pattern with dashboard avatars', () => {
  const personMarkup = source.slice(
    source.indexOf('function workerTablePersonMarkup'),
    source.indexOf('function renderWorkerAvatar'),
  )
  const exportRowsBlock = source.slice(
    source.indexOf('function timeEvidenceRowsForExport'),
    source.indexOf('function timeEvidenceIntegrityBlockers'),
  )
  assert.equal((template.match(/worker-account-data-table/g) || []).length, 3)
  assert.match(template, /U&#380;ytkownik[\s\S]*Data[\s\S]*Klient[\s\S]*Nazwa zlecenia[\s\S]*Status/)
  assert.match(template, /U&#380;ytkownik[\s\S]*Data[\s\S]*Klient[\s\S]*Strefa[\s\S]*Lokalizacja[\s\S]*Komentarz/)
  const timeHeader = template.slice(
    template.indexOf('worker-account-time-table"'),
    template.indexOf('id="waTimeRows"'),
  )
  assert.match(timeHeader, /U&#380;ytkownik[\s\S]*Data[\s\S]*Start[\s\S]*Stop[\s\S]*Czas[\s\S]*Historia[\s\S]*Przerwa/)
  assert.doesNotMatch(timeHeader, /Klient/)
  assert.doesNotMatch(timeHeader, /checkbox|waTimeSelectAll/)
  assert.match(source, /function workerTablePersonMarkup/)
  assert.match(source, /\/assets\/avatars\/default-\$\{avatarKind\}\.webp/)
  assert.doesNotMatch(personMarkup, /workerLogin|<small>/)
  assert.doesNotMatch(source, /workerAccountTimeClientLabel/)
  assert.doesNotMatch(source, /workerAccountTimeSelectedKeys|data-wa-time-select/)
  assert.match(exportRowsBlock, /appState\.workerAccountTimeRows/)
  assert.doesNotMatch(exportRowsBlock, /selected|CurrentPage/)
  assert.doesNotMatch(source, /data-wa-event-edit/)
  assert.match(source, /function editorDisplayName/)
  assert.equal((source.match(/editorDisplayName\(row\)/g) || []).length, 2)
  assert.match(style, /\.worker-account-person-avatar\s*\{[\s\S]*width:\s*36px[\s\S]*border-radius:\s*50%/)
  assert.match(style, /\.worker-account-events-table\s*\{[\s\S]*--events-grid:[^;]+/)
  assert.match(style, /worker-account-table-block \.worker-account-events-table\s*,[\s\S]*worker-account-table-block \.worker-account-orders-table\s*\{[\s\S]*margin-inline:\s*-18px !important[\s\S]*border:\s*0 !important[\s\S]*scrollbar-gutter:\s*auto/)
  assert.match(style, /\.worker-account-orders-table \.events-head\s*,[\s\S]*\.worker-account-orders-table #waOrderRows\s*\{[\s\S]*width:\s*100% !important[\s\S]*min-width:\s*700px/)
  assert.match(style, /\.worker-account-time-table\s*\{[\s\S]*--events-grid:[^;]+/)
})

test('activity keeps only the event table without the retired KPI cards', () => {
  const activityPanel = template.slice(
    template.indexOf('data-wa-panel="activity"'),
    template.indexOf('data-wa-panel="time"'),
  )
  assert.doesNotMatch(activityPanel, /worker-account-kpi-grid|waActivity(?:Orders|Week|Month|Events)/)
  assert.doesNotMatch(source, /waActivity(?:Orders|Week|Month|Events)|countEventsInRange|eventCount/)
  assert.doesNotMatch(style, /worker-account-kpi-grid/)
  assert.match(activityPanel, /worker-account-events-table/)
})

test('activity comment uses an accessible portal modal and hides technical GPS payloads', () => {
  for (const id of [
    'waEventCommentOverlay',
    'waEventCommentDialog',
    'waEventCommentText',
    'waEventCommentEmpty',
    'waEventCommentClose',
    'waEventCommentDone',
  ]) {
    assert.match(template, new RegExp(`id="${id}"`))
  }
  assert.match(template, /id="waEventCommentOverlay"[^>]*role="dialog"[^>]*aria-modal="true"/)
  assert.match(source, /return workIntervalVisibleComment\(rawComment\)/)
  assert.match(source, /openWorkerAccountEventComment\(row, commentButton\)/)
  assert.doesNotMatch(source, /alert\(comment \|\| 'Brak komentarza/)
  assert.match(style, /#waEventCommentOverlay \.[^{]*worker-account-comment-dialog/)
})

test('worker account aligns roles and preserves readable profile metadata', () => {
  assert.match(style, /\.worker-account-roles-workspace\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(style, /\.worker-account-role-controls\s*,[\s\S]*\.worker-account-role-preview\s*\{[\s\S]*min-height:\s*220px[\s\S]*background:\s*linear-gradient/)
  assert.match(style, /\.worker-account-role-controls \.worker-account-form-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)[\s\S]*border-radius:\s*12px/)
  assert.match(style, /\.worker-account-details div\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)[\s\S]*gap:\s*5px/)
  assert.match(style, /\.worker-account-details dd\s*\{[\s\S]*padding-left:\s*23px[\s\S]*text-align:\s*left[\s\S]*white-space:\s*nowrap/)
  assert.match(style, /#waCardEmail\s*\{[\s\S]*max-width:\s*100%[\s\S]*white-space:\s*nowrap/)
  assert.match(style, /\.worker-account-training-summary li\s*\{[\s\S]*font-family:\s*inherit/)
})

test('worker account keeps only navigation in the top area and moves deactivation to security', () => {
  const hero = template.slice(
    template.indexOf('<header class="worker-account-hero">'),
    template.indexOf('<div class="worker-account-dashboard">'),
  )
  const securityPanel = template.slice(
    template.indexOf('data-wa-panel="security"'),
    template.indexOf('data-wa-panel="roles"'),
  )

  assert.match(hero, /id="waBackBtn"/)
  assert.doesNotMatch(hero, /waTitle|waHeroStatus|waTopDeactivateBtn/)
  assert.match(securityPanel, /worker-account-danger-zone/)
  assert.match(securityPanel, /id="waTopDeactivateBtn"/)
  assert.match(securityPanel, /Dezaktywuj konto/)
  assert.equal((template.match(/id="waTopDeactivateBtn"/g) || []).length, 1)
  assert.doesNotMatch(source, /waTitle|waHeroStatus/)
  assert.match(style, /\.worker-account-hero\s*\{[\s\S]*border:\s*0[\s\S]*background:\s*transparent[\s\S]*box-shadow:\s*none/)
  assert.match(style, /\.worker-account-back\s*\{[\s\S]*min-height:\s*40px[\s\S]*font-size:\s*14px/)
  assert.match(style, /\.worker-account-back \.ph\s*\{[\s\S]*font-size:\s*20px/)
  assert.match(style, /\.worker-account-danger-zone-action\s*\{[\s\S]*justify-content:\s*space-between/)
})
