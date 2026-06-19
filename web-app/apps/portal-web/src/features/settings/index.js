import template from './template.html?raw'

export const section = 'settings'
export const routes = ['settings', 'settingsStyles', 'settingsBackup']
export const viewId = 'view-settings'
export { template }

export function createSettingsFeature(ctx) {
  const {
    appState,
    SETTINGS_TAB_BACKUP,
    SETTINGS_TAB_STORAGE_KEY,
    SETTINGS_TAB_STYLES,
    STYLE_FALLBACK_ID,
    applyPortalTheme,
    canManageBackupSettings,
    clearUserStyle,
    createBackup,
    createBindingHelpers,
    deleteBackup,
    ensureBackupAutomation,
    escapeHtml,
    getBackupDownload,
    getEffectiveStyle,
    inspectBackupFile,
    listAvailableStyles,
    listBackups,
    normalizeSettingsTab,
    readStoredSettingsTab,
    resolveStyleMeta,
    restoreBackupById,
    restoreBackupFromFile,
    restoreLatestPreRestore,
    setOrgDefaultStyle,
    setUserStyle,
    showTransientNotice,
    todayYmd,
  } = ctx

  const BACKUP_TYPE_LABELS = {
    full: 'Pelna kopia',
    workers: 'Pracownicy',
    objects: 'Obiekty',
  }
  const BACKUP_SOURCE_LABELS = {
    manual: 'Reczny',
    'auto-daily': 'Auto dzienny',
    'auto-monthly': 'Auto miesieczny',
    'pre-restore': 'Pre-restore',
    'imported-file': 'Import ZIP',
  }
  const BACKUP_INTEGRITY_LABELS = {
    ok: 'OK',
    warning: 'Ostrzezenie',
    error: 'Blad',
    unknown: 'Nieznana',
  }

  const STYLE_SOURCE_LABELS = {
    user: 'nadpisanie uzytkownika',
    org: 'domyslny styl organizacji',
    fallback: 'domyslny fallback',
  }

  function persistSettingsTab(tab) {
    try {
      window.sessionStorage.setItem(SETTINGS_TAB_STORAGE_KEY, normalizeSettingsTab(tab))
    } catch {
      // Ignore storage failures in private mode.
    }
  }

  function settingsStyleSourceLabel(source) {
    const key = String(source ?? '').trim().toLowerCase()
    return STYLE_SOURCE_LABELS[key] ?? STYLE_SOURCE_LABELS.fallback
  }

  function settingsRenderStyleStatus() {
    const statusNode = document.getElementById('settingsStyleStatus')
    if (!(statusNode instanceof HTMLElement)) {
      return
    }

    const effectiveId = String(appState.settingsEffectiveStyleId ?? '').trim() || STYLE_FALLBACK_ID
    const effectiveMeta = resolveStyleMeta(effectiveId)
    const effectiveName = String(effectiveMeta?.name ?? 'Classic Blue')
    const sourceLabel = settingsStyleSourceLabel(appState.settingsEffectiveStyleSource)
    const orgMeta = resolveStyleMeta(appState.settingsOrgStyleId)
    const userMeta = resolveStyleMeta(appState.settingsUserStyleId)

    statusNode.innerHTML = `
      <div class="settings-style-status-top">
        <div class="settings-style-status-label">Aktywny styl efektywny</div>
        <div class="settings-style-status-badge">${escapeHtml(effectiveName)}</div>
      </div>
      <div class="settings-style-status-meta">Zrodlo: <strong>${escapeHtml(sourceLabel)}</strong></div>
      <div class="settings-style-status-hint">
        Domyslny org: <strong>${escapeHtml(orgMeta?.name ?? '-')}</strong>
        <span class="settings-style-status-dot">•</span>
        Moj wybor: <strong>${escapeHtml(userMeta?.name ?? '-')}</strong>
      </div>
    `
  }

  function settingsRenderStyleCards() {
    const root = document.getElementById('settingsStyleCards')
    if (!(root instanceof HTMLElement)) {
      return
    }

    const styles = listAvailableStyles()
    const canSetOrg = canManageBackupSettings()
    const effectiveId = String(appState.settingsEffectiveStyleId ?? '').trim() || STYLE_FALLBACK_ID
    const userStyleId = String(appState.settingsUserStyleId ?? '').trim()
    const orgStyleId = String(appState.settingsOrgStyleId ?? '').trim()
    const hasUserOverride = Boolean(userStyleId)

    root.innerHTML = styles
      .map((style) => {
        const styleId = String(style?.id ?? '').trim()
        const isEffective = styleId === effectiveId
        const isUser = styleId === userStyleId
        const isOrg = styleId === orgStyleId

        return `
          <article class="fido-card settings-style-card${isEffective ? ' is-effective' : ''}" data-style-id="${escapeHtml(styleId)}">
            <div class="settings-style-card-header">
              <h3>${escapeHtml(String(style?.name ?? styleId))}</h3>
              <div class="settings-style-badges">
                ${isEffective ? '<span class="settings-style-pill is-effective">Aktywny</span>' : ''}
                ${isUser ? '<span class="settings-style-pill is-user">Moj styl</span>' : ''}
                ${isOrg ? '<span class="settings-style-pill is-org">Domyslny org</span>' : ''}
              </div>
            </div>
            <p>${escapeHtml(String(style?.description ?? ''))}</p>
            <div class="settings-style-preview settings-style-preview--${escapeHtml(styleId)}">
              <span></span><span></span><span></span>
            </div>
            <div class="settings-style-actions">
              <button class="btn2 primary" type="button" data-style-action="set-user" data-style-id="${escapeHtml(styleId)}">
                Ustaw jako moj styl
              </button>
              <button class="btn2" type="button" data-style-action="clear-user" data-style-id="${escapeHtml(styleId)}"${
                hasUserOverride ? '' : ' disabled'
              }>
                Uzyj domyslnego
              </button>
              ${
                canSetOrg
                  ? `<button class="btn2" type="button" data-style-action="set-org" data-style-id="${escapeHtml(styleId)}">Ustaw jako domyslny organizacji</button>`
                  : ''
              }
            </div>
          </article>
        `
      })
      .join('')
  }

  function settingsSetActiveTab(tab, { persist = true } = {}) {
    const requested = normalizeSettingsTab(tab)
    const canBackup = canManageBackupSettings()
    const effectiveTab = requested === SETTINGS_TAB_BACKUP && !canBackup ? SETTINGS_TAB_STYLES : requested
    appState.settingsActiveTab = effectiveTab

    const tabButtons = document.querySelectorAll('#settingsTabs [data-settings-tab]')
    tabButtons.forEach((button) => {
      if (!(button instanceof HTMLElement)) {
        return
      }
      const tabId = normalizeSettingsTab(button.getAttribute('data-settings-tab'))
      const active = tabId === effectiveTab
      button.classList.toggle('active', active)
      button.setAttribute('aria-selected', active ? 'true' : 'false')
    })

    const panels = document.querySelectorAll('#view-settings [data-settings-panel]')
    panels.forEach((panel) => {
      if (!(panel instanceof HTMLElement)) {
        return
      }
      const panelId = normalizeSettingsTab(panel.getAttribute('data-settings-panel'))
      panel.style.display = panelId === effectiveTab ? '' : 'none'
    })

    if (persist) {
      persistSettingsTab(effectiveTab)
    }
  }

  async function settingsRefreshStyleState({ silent = false } = {}) {
    const orgId = settingsCurrentOrgId()
    const uid = String(appState.session?.uid ?? '').trim() || String(appState.session?.login ?? '').trim()
    if (!orgId) {
      appState.settingsEffectiveStyleId = STYLE_FALLBACK_ID
      appState.settingsEffectiveStyleSource = 'fallback'
      appState.settingsOrgStyleId = ''
      appState.settingsUserStyleId = ''
      applyPortalTheme(STYLE_FALLBACK_ID)
      settingsRenderStyleStatus()
      settingsRenderStyleCards()
      return
    }

    try {
      const effective = await getEffectiveStyle(orgId, uid)
      const effectiveId = resolveStyleMeta(effective?.styleId)?.id ?? STYLE_FALLBACK_ID
      appState.settingsEffectiveStyleId = effectiveId
      appState.settingsEffectiveStyleSource = String(effective?.source ?? 'fallback')
      appState.settingsOrgStyleId = resolveStyleMeta(effective?.orgStyleId)?.id ?? ''
      appState.settingsUserStyleId = resolveStyleMeta(effective?.userStyleId)?.id ?? ''
      applyPortalTheme(effectiveId)
    } catch (error) {
      appState.settingsEffectiveStyleId = STYLE_FALLBACK_ID
      appState.settingsEffectiveStyleSource = 'fallback'
      appState.settingsOrgStyleId = ''
      appState.settingsUserStyleId = ''
      applyPortalTheme(STYLE_FALLBACK_ID)
      if (!silent) {
        const message = error instanceof Error ? error.message : 'Nie udalo sie odczytac stylu.'
        showTransientNotice(message, 'error')
      }
    }

    settingsRenderStyleStatus()
    settingsRenderStyleCards()
  }

  async function settingsApplyUserStyle(styleId) {
    const orgId = settingsCurrentOrgId()
    const uid = String(appState.session?.uid ?? '').trim() || String(appState.session?.login ?? '').trim()
    if (!orgId || !uid) {
      showTransientNotice('Brak aktywnej sesji do zapisu stylu.', 'error')
      return
    }

    const previous = {
      effectiveId: appState.settingsEffectiveStyleId,
      effectiveSource: appState.settingsEffectiveStyleSource,
      orgId: appState.settingsOrgStyleId,
      userId: appState.settingsUserStyleId,
    }

    const meta = resolveStyleMeta(styleId)
    if (!meta) {
      showTransientNotice('Wybrano nieznany styl.', 'error')
      return
    }

    appState.settingsEffectiveStyleId = meta.id
    appState.settingsEffectiveStyleSource = 'user'
    appState.settingsUserStyleId = meta.id
    applyPortalTheme(meta.id)
    settingsRenderStyleStatus()
    settingsRenderStyleCards()

    try {
      await setUserStyle(orgId, uid, meta.id, settingsCurrentActor())
      showTransientNotice(`Ustawiono styl: ${meta.name}.`)
      await settingsRefreshStyleState({ silent: true })
    } catch (error) {
      appState.settingsEffectiveStyleId = previous.effectiveId
      appState.settingsEffectiveStyleSource = previous.effectiveSource
      appState.settingsOrgStyleId = previous.orgId
      appState.settingsUserStyleId = previous.userId
      applyPortalTheme(previous.effectiveId || STYLE_FALLBACK_ID)
      settingsRenderStyleStatus()
      settingsRenderStyleCards()
      const message = error instanceof Error ? error.message : 'Nie udalo sie zapisac stylu.'
      showTransientNotice(message, 'error')
    }
  }

  async function settingsClearUserStyle() {
    const orgId = settingsCurrentOrgId()
    const uid = String(appState.session?.uid ?? '').trim() || String(appState.session?.login ?? '').trim()
    if (!orgId || !uid) {
      showTransientNotice('Brak aktywnej sesji do zapisu stylu.', 'error')
      return
    }

    try {
      await clearUserStyle(orgId, uid)
      await settingsRefreshStyleState({ silent: true })
      showTransientNotice('Wyczyszczono nadpisanie stylu uzytkownika.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie wyczyscic stylu.'
      showTransientNotice(message, 'error')
    }
  }

  async function settingsApplyOrgDefaultStyle(styleId) {
    if (!canManageBackupSettings()) {
      showTransientNotice('Brak uprawnien do zmiany domyslnego stylu organizacji.', 'error')
      return
    }

    const orgId = settingsCurrentOrgId()
    if (!orgId) {
      showTransientNotice('Brak orgId w sesji.', 'error')
      return
    }

    const meta = resolveStyleMeta(styleId)
    if (!meta) {
      showTransientNotice('Wybrano nieznany styl.', 'error')
      return
    }

    try {
      await setOrgDefaultStyle(orgId, meta.id, settingsCurrentActor())
      await settingsRefreshStyleState({ silent: true })
      showTransientNotice(`Ustawiono domyslny styl organizacji: ${meta.name}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie ustawic stylu domyslnego organizacji.'
      showTransientNotice(message, 'error')
    }
  }

  function backupTypeLabel(type) {
    const normalized = String(type ?? '').trim().toLowerCase()
    return BACKUP_TYPE_LABELS[normalized] ?? BACKUP_TYPE_LABELS.full
  }

  function backupSourceLabel(source) {
    const normalized = String(source ?? '').trim().toLowerCase()
    return BACKUP_SOURCE_LABELS[normalized] ?? 'Reczny'
  }

  function backupIntegrityLabel(status) {
    const normalized = String(status ?? '').trim().toLowerCase()
    return BACKUP_INTEGRITY_LABELS[normalized] ?? BACKUP_INTEGRITY_LABELS.unknown
  }

  function backupIntegrityClass(status) {
    const normalized = String(status ?? '').trim().toLowerCase()
    if (normalized === 'ok') {
      return 'is-ok'
    }
    if (normalized === 'warning') {
      return 'is-warning'
    }
    if (normalized === 'error') {
      return 'is-error'
    }
    return 'is-unknown'
  }

  function formatBytes(bytes) {
    const value = Number(bytes)
    if (!Number.isFinite(value) || value <= 0) {
      return '-'
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let number = value
    let unitIndex = 0
    while (number >= 1024 && unitIndex < units.length - 1) {
      number /= 1024
      unitIndex += 1
    }

    const precision = number >= 100 || unitIndex === 0 ? 0 : 1
    return `${number.toFixed(precision)} ${units[unitIndex]}`
  }

  function settingsCurrentOrgId() {
    return String(appState.session?.orgId ?? '').trim()
  }

  function settingsCurrentActor() {
    return (
      String(appState.session?.name ?? '').trim() ||
      String(appState.session?.login ?? '').trim() ||
      String(appState.session?.email ?? '').trim() ||
      '-'
    )
  }

  function settingsSetCreateNote(message = '', type = 'info') {
    const note = document.getElementById('bkCreateNote')
    if (!note) {
      return
    }

    const text = String(message ?? '').trim()
    note.className = 'backup-create-note'
    note.textContent = text

    if (!text) {
      return
    }

    if (type === 'success') {
      note.classList.add('is-success')
      return
    }
    if (type === 'error') {
      note.classList.add('is-error')
      return
    }
    note.classList.add('is-info')
  }

  function settingsSetAccessState() {
    const canManage = canManageBackupSettings()
    const backupTabButton = document.getElementById('settingsTabBackup')
    const backupSection = document.getElementById('settingsBackupSection')
    const backupMenuItem = document.querySelector('[data-route="settingsBackup"]')
    const styleMenuItem = document.querySelector('[data-route="settingsStyles"]')
    const denied = document.getElementById('backupAccessDenied')
    const panel = document.getElementById('backupAdminPanel')

    if (backupTabButton instanceof HTMLElement) {
      backupTabButton.style.display = canManage ? '' : 'none'
    }
    if (backupMenuItem instanceof HTMLElement) {
      backupMenuItem.style.display = canManage ? '' : 'none'
    }
    if (styleMenuItem instanceof HTMLElement) {
      styleMenuItem.style.display = ''
    }

    if (backupSection instanceof HTMLElement && appState.settingsActiveTab === SETTINGS_TAB_BACKUP && !canManage) {
      settingsSetActiveTab(SETTINGS_TAB_STYLES, { persist: false })
    }

    if (denied) {
      denied.style.display = canManage ? 'none' : ''
    }
    if (panel) {
      panel.style.display = canManage ? '' : 'none'
    }
  }

  function syncSettingsPermissions() {
    const settingsToggle = document.querySelector('[data-toggle="settings"]')
    const settingsSubmenu = document.getElementById('submenu-settings')
    const stylesItem = document.querySelector('[data-route="settingsStyles"]')
    const backupItem = document.querySelector('[data-route="settingsBackup"]')

    if (settingsToggle instanceof HTMLElement) {
      settingsToggle.style.display = ''
    }
    if (settingsSubmenu instanceof HTMLElement) {
      settingsSubmenu.style.display = ''
    }
    if (stylesItem instanceof HTMLElement) {
      stylesItem.style.display = ''
    }
    if (backupItem instanceof HTMLElement) {
      backupItem.style.display = ''
    }

    settingsSetAccessState()
  }

  function settingsResetImportState({ clearFile = true } = {}) {
    appState.settingsImportInspection = null
    if (clearFile) {
      const fileInput = document.getElementById('bkImportFile')
      if (fileInput instanceof HTMLInputElement) {
        fileInput.value = ''
      }
    }
  }

  function settingsRenderImportSummary() {
    const summaryNode = document.getElementById('bkImportSummary')
    const restoreButton = document.getElementById('bkImportRestoreBtn')
    if (!summaryNode) {
      return
    }

    const inspection = appState.settingsImportInspection
    const summary = inspection?.summary
    if (!summary) {
      summaryNode.textContent = 'Wybierz plik ZIP, aby zobaczyc podsumowanie i zakres nadpisania.'
      if (restoreButton instanceof HTMLButtonElement) {
        restoreButton.disabled = true
      }
      return
    }

    const modules = Array.isArray(summary.modules) ? summary.modules : []
    const modulesHtml = modules.length
      ? modules
          .map((moduleInfo) => {
            const moduleLabel = String(moduleInfo?.label ?? moduleInfo?.id ?? '-').trim() || '-'
            const records = Number(moduleInfo?.records ?? 0) || 0
            const plan = moduleInfo?.plan
            const planHtml = plan
              ? `<small>+${Number(plan.created ?? 0) || 0} / ~${Number(plan.updated ?? 0) || 0} / -${Number(plan.deleted ?? 0) || 0}</small>`
              : ''
            return `<li><strong>${escapeHtml(moduleLabel)}</strong> <span>${records}</span>${planHtml}</li>`
          })
          .join('')
      : '<li><strong>Brak modulow</strong> <span>0</span></li>'

    const authUsers = Number(summary.authUsers ?? 0) || 0
    const schemaVersion = String(summary.schemaVersion ?? '').trim() || '-'
    const plan = summary.restorePlan
    const totals = plan?.totals
    const restorePlanHtml = totals
      ? `
        <div class="backup-restore-plan">
          <div class="backup-import-modules-title">Plan przywrocenia</div>
          <div class="backup-restore-plan-grid">
            <div><span>Dodane</span><strong>${Number(totals.created ?? 0) || 0}</strong></div>
            <div><span>Zmienione</span><strong>${Number(totals.updated ?? 0) || 0}</strong></div>
            <div><span>Usuwane</span><strong>${Number(totals.deleted ?? 0) || 0}</strong></div>
            <div><span>Bez zmian</span><strong>${Number(totals.unchanged ?? 0) || 0}</strong></div>
          </div>
          <p>Format przy module: <strong>+ dodane / ~ zmienione / - usuwane</strong>.</p>
        </div>
      `
      : ''

    summaryNode.innerHTML = `
      <div class="backup-import-card">
        <div class="backup-import-grid">
          <div><span>Tytul</span><strong>${escapeHtml(String(summary.title ?? '-'))}</strong></div>
          <div><span>Typ</span><strong>${escapeHtml(String(summary.typeLabel ?? backupTypeLabel(summary.type)))}</strong></div>
          <div><span>Data</span><strong>${escapeHtml(String(summary.createdAtLabel ?? '-'))}</strong></div>
          <div><span>Autor</span><strong>${escapeHtml(String(summary.createdBy ?? '-'))}</strong></div>
          <div><span>OrgId</span><strong>${escapeHtml(String(summary.orgId ?? '-'))}</strong></div>
          <div><span>Schema</span><strong>${escapeHtml(schemaVersion)}</strong></div>
        </div>
        <div class="backup-import-modules">
          <div class="backup-import-modules-title">Zakres nadpisania</div>
          <ul>${modulesHtml}</ul>
        </div>
        <div class="backup-import-auth">Auth snapshot (pelna kopia): <strong>${authUsers}</strong></div>
        ${restorePlanHtml}
      </div>
    `

    if (restoreButton instanceof HTMLButtonElement) {
      restoreButton.disabled = false
    }
  }

  function settingsRenderBackupRows(rows = appState.settingsBackups) {
    const tbody = document.getElementById('bkRows')
    if (!tbody) {
      return
    }

    const list = Array.isArray(rows) ? rows : []
    if (!list.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="muted">Brak kopii zapasowych dla tej organizacji.</td>
        </tr>
      `
      return
    }

    tbody.innerHTML = list
      .map((item) => {
        const id = String(item?.id ?? '').trim()
        const integrityStatus = String(item?.integrityStatus ?? 'unknown')
        const integrityClass = backupIntegrityClass(integrityStatus)
        const integrityLabel = backupIntegrityLabel(integrityStatus)
        const integrityMessage = String(item?.integrityMessage ?? '').trim()
        const title = String(item?.title ?? '').trim() || backupTypeLabel(item?.type)

        return `
          <tr>
            <td>${escapeHtml(String(item?.createdAtLabel ?? '-'))}</td>
            <td>${escapeHtml(backupTypeLabel(item?.type))}</td>
            <td>${escapeHtml(title)}</td>
            <td>${escapeHtml(formatBytes(item?.sizeBytes))}</td>
            <td>${escapeHtml(String(item?.createdBy ?? '-'))}</td>
            <td>
              <span class="backup-integrity ${integrityClass}" title="${escapeHtml(integrityMessage || integrityLabel)}">
                ${escapeHtml(integrityLabel)}
              </span>
            </td>
            <td>${escapeHtml(backupSourceLabel(item?.source))}</td>
            <td>
              <div class="backup-row-actions">
                <button class="btn2" type="button" data-bk-action="download" data-bk-id="${escapeHtml(id)}">Pobierz</button>
                <button class="btn2" type="button" data-bk-action="restore" data-bk-id="${escapeHtml(id)}">Przywroc</button>
                <button class="btn2 danger" type="button" data-bk-action="delete" data-bk-id="${escapeHtml(id)}">Usun</button>
              </div>
            </td>
          </tr>
        `
      })
      .join('')
  }

  async function settingsEnsureAutomation() {
    if (!canManageBackupSettings()) {
      return
    }

    const orgId = settingsCurrentOrgId()
    if (!orgId) {
      return
    }

    const dayKey = `${orgId}:${todayYmd()}`
    if (appState.settingsAutomationDayKey === dayKey) {
      return
    }

    await ensureBackupAutomation({
      orgId,
      createdBy: settingsCurrentActor() || 'system',
    })
    appState.settingsAutomationDayKey = dayKey
  }

  async function settingsLoadBackups({ runAutomation = true } = {}) {
    const tbody = document.getElementById('bkRows')
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="muted">Ladowanie listy backupow...</td>
        </tr>
      `
    }

    settingsSetAccessState()
    if (!canManageBackupSettings()) {
      appState.settingsBackups = []
      settingsRenderBackupRows([])
      return
    }

    const orgId = settingsCurrentOrgId()
    if (!orgId) {
      appState.settingsBackups = []
      settingsRenderBackupRows([])
      return
    }

    if (runAutomation) {
      await settingsEnsureAutomation()
    }

    const rows = await listBackups(orgId)
    appState.settingsBackups = rows
    settingsRenderBackupRows(rows)
  }

  async function settingsCreateBackup() {
    if (!canManageBackupSettings()) {
      showTransientNotice('Brak uprawnien do tworzenia backupu.', 'error')
      return
    }

    const orgId = settingsCurrentOrgId()
    if (!orgId) {
      showTransientNotice('Brak orgId w sesji.', 'error')
      return
    }

    const titleInput = document.getElementById('bkTitle')
    const typeInput = document.getElementById('bkType')
    const createButton = document.getElementById('bkCreateBtn')
    const title = String(titleInput?.value ?? '').trim()
    const type = String(typeInput?.value ?? 'full').trim().toLowerCase()

    if (!title) {
      showTransientNotice('Wpisz tytul kopii.', 'error')
      titleInput?.focus?.()
      return
    }

    if (createButton instanceof HTMLButtonElement) {
      createButton.disabled = true
      createButton.textContent = 'Tworzenie...'
    }
    settingsSetCreateNote('Tworzenie backupu i przygotowanie pliku ZIP...', 'info')

    try {
      const created = await createBackup({
        orgId,
        type,
        title,
        createdBy: settingsCurrentActor(),
        source: 'manual',
      })
      await settingsDownloadBackup(created.id)
      settingsSetCreateNote(`Utworzono i pobrano: ${created.fileName} (${formatBytes(created.sizeBytes)}).`, 'success')
      showTransientNotice('Backup ZIP zostal utworzony i pobrany.')
      await settingsLoadBackups({ runAutomation: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie utworzyc backupu.'
      settingsSetCreateNote(message, 'error')
      showTransientNotice(message, 'error')
    } finally {
      if (createButton instanceof HTMLButtonElement) {
        createButton.disabled = false
        createButton.textContent = 'Utworz backup ZIP'
      }
    }
  }

  async function settingsInspectImportFile() {
    if (!canManageBackupSettings()) {
      showTransientNotice('Brak uprawnien do importu backupu.', 'error')
      return
    }

    const input = document.getElementById('bkImportFile')
    const inspectButton = document.getElementById('bkInspectBtn')
    const file = input instanceof HTMLInputElement ? input.files?.[0] : null
    if (!file) {
      showTransientNotice('Wybierz plik ZIP do sprawdzenia.', 'error')
      return
    }

    if (inspectButton instanceof HTMLButtonElement) {
      inspectButton.disabled = true
      inspectButton.textContent = 'Sprawdzanie...'
    }

    try {
      const inspection = await inspectBackupFile(file, { orgId: settingsCurrentOrgId() })
      appState.settingsImportInspection = inspection
      settingsRenderImportSummary()
      showTransientNotice('Plik backupu jest poprawny.')
    } catch (error) {
      appState.settingsImportInspection = null
      settingsRenderImportSummary()
      const message = error instanceof Error ? error.message : 'Niepoprawny plik backupu.'
      showTransientNotice(message, 'error')
    } finally {
      if (inspectButton instanceof HTMLButtonElement) {
        inspectButton.disabled = false
        inspectButton.textContent = 'Sprawdz plik'
      }
    }
  }

  async function settingsRestoreFromFile() {
    if (!canManageBackupSettings()) {
      showTransientNotice('Brak uprawnien do przywracania backupu.', 'error')
      return
    }

    const orgId = settingsCurrentOrgId()
    if (!orgId) {
      showTransientNotice('Brak orgId w sesji.', 'error')
      return
    }

    const input = document.getElementById('bkImportFile')
    const restoreButton = document.getElementById('bkImportRestoreBtn')
    const file = input instanceof HTMLInputElement ? input.files?.[0] : null
    if (!file) {
      showTransientNotice('Wybierz plik ZIP do przywrocenia.', 'error')
      return
    }

    if (!appState.settingsImportInspection) {
      await settingsInspectImportFile()
    }

    const summary = appState.settingsImportInspection?.summary
    if (!summary) {
      showTransientNotice('Najpierw sprawdz plik ZIP.', 'error')
      return
    }

    const confirmRestore = window.confirm(
      `Przywrocic backup "${summary.title}" (${summary.typeLabel})?\n` +
        'Zakres zostanie nadpisany.\n' +
        'System utworzy automatyczny punkt pre-restore przed operacja.',
    )
    if (!confirmRestore) {
      return
    }

    if (restoreButton instanceof HTMLButtonElement) {
      restoreButton.disabled = true
      restoreButton.textContent = 'Przywracanie...'
    }

    try {
      const restored = await restoreBackupFromFile({
        orgId,
        file,
        restoredBy: settingsCurrentActor(),
      })
      settingsResetImportState()
      settingsRenderImportSummary()
      await settingsLoadBackups({ runAutomation: false })

      const modulesCount = Array.isArray(restored?.moduleResults) ? restored.moduleResults.length : 0
      showTransientNotice(`Przywracanie zakonczone. Moduly: ${modulesCount}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie przywrocic backupu.'
      showTransientNotice(message, 'error')
    } finally {
      if (restoreButton instanceof HTMLButtonElement) {
        restoreButton.disabled = false
        restoreButton.textContent = 'Przywroc z pliku'
      }
    }
  }

  async function settingsDownloadBackup(backupId) {
    const orgId = settingsCurrentOrgId()
    if (!orgId) {
      return
    }

    const payload = await getBackupDownload({ orgId, backupId })
    const objectUrl = URL.createObjectURL(payload.blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = String(payload.fileName ?? 'backup.zip')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl)
    }, 1500)
  }

  async function settingsRestoreBackup(backupId) {
    if (!canManageBackupSettings()) {
      showTransientNotice('Brak uprawnien do przywracania backupu.', 'error')
      return
    }

    const orgId = settingsCurrentOrgId()
    if (!orgId) {
      showTransientNotice('Brak orgId w sesji.', 'error')
      return
    }

    const item = appState.settingsBackups.find((row) => String(row?.id ?? '') === String(backupId ?? ''))
    const label = String(item?.title ?? '').trim() || backupId
    const confirmed = window.confirm(
      `Przywrocic backup "${label}"?\n` + 'Zakres danych zostanie nadpisany.\nSystem utworzy pre-restore przed operacja.',
    )
    if (!confirmed) {
      return
    }

    await restoreBackupById({
      orgId,
      backupId,
      restoredBy: settingsCurrentActor(),
    })
    await settingsLoadBackups({ runAutomation: false })
    showTransientNotice('Backup zostal przywrocony.')
  }

  async function settingsDeleteBackup(backupId) {
    if (!canManageBackupSettings()) {
      showTransientNotice('Brak uprawnien do usuwania backupow.', 'error')
      return
    }

    const orgId = settingsCurrentOrgId()
    if (!orgId) {
      showTransientNotice('Brak orgId w sesji.', 'error')
      return
    }

    const item = appState.settingsBackups.find((row) => String(row?.id ?? '') === String(backupId ?? ''))
    const label = String(item?.title ?? '').trim() || backupId
    const confirmed = window.confirm(`Usunac backup "${label}"? Operacja jest nieodwracalna.`)
    if (!confirmed) {
      return
    }

    await deleteBackup({ orgId, backupId })
    appState.settingsBackups = appState.settingsBackups.filter((row) => String(row?.id ?? '') !== String(backupId ?? ''))
    settingsRenderBackupRows(appState.settingsBackups)
    showTransientNotice('Backup zostal usuniety.')
  }

  async function settingsRollbackToPreRestore() {
    if (!canManageBackupSettings()) {
      showTransientNotice('Brak uprawnien do rollbacku.', 'error')
      return
    }

    const orgId = settingsCurrentOrgId()
    if (!orgId) {
      showTransientNotice('Brak orgId w sesji.', 'error')
      return
    }

    const confirmed = window.confirm('Przywrocic ostatni punkt pre-restore?')
    if (!confirmed) {
      return
    }

    await restoreLatestPreRestore({
      orgId,
      restoredBy: settingsCurrentActor(),
    })
    await settingsLoadBackups({ runAutomation: false })
    showTransientNotice('Przywrocono poprzednia wersje (pre-restore).')
  }

  function bindSettingsViewFunctions() {
    const binding = createBindingHelpers()

    appState.settingsActiveTab = readStoredSettingsTab()
    settingsRenderStyleStatus()
    settingsRenderStyleCards()
    syncSettingsPermissions()
    settingsSetActiveTab(appState.settingsActiveTab, { persist: false })
    settingsSetCreateNote('')
    settingsRenderImportSummary()
    settingsRenderBackupRows(appState.settingsBackups)
    void settingsRefreshStyleState({ silent: true })

    binding.add(document.getElementById('settingsTabs'), 'click', (event) => {
      const button = event.target.closest('[data-settings-tab]')
      if (!(button instanceof HTMLElement)) {
        return
      }

      const tab = normalizeSettingsTab(button.getAttribute('data-settings-tab'))
      settingsSetActiveTab(tab, { persist: true })

      if (tab === SETTINGS_TAB_BACKUP && canManageBackupSettings()) {
        void settingsLoadBackups({ runAutomation: true }).catch((error) => {
          const message = error instanceof Error ? error.message : 'Nie udalo sie zaladowac kopii zapasowych.'
          showTransientNotice(message, 'error')
        })
      }
    })

    binding.add(document.getElementById('settingsStyleCards'), 'click', (event) => {
      const button = event.target.closest('[data-style-action][data-style-id]')
      if (!(button instanceof HTMLElement)) {
        return
      }

      const action = String(button.getAttribute('data-style-action') ?? '').trim()
      const styleId = String(button.getAttribute('data-style-id') ?? '').trim()
      if (!action) {
        return
      }

      if (action === 'set-user') {
        void settingsApplyUserStyle(styleId)
        return
      }

      if (action === 'clear-user') {
        void settingsClearUserStyle()
        return
      }

      if (action === 'set-org') {
        void settingsApplyOrgDefaultStyle(styleId)
      }
    })

    binding.add(document.getElementById('bkCreateBtn'), 'click', () => {
      void settingsCreateBackup()
    })
    binding.add(document.getElementById('bkInspectBtn'), 'click', () => {
      void settingsInspectImportFile()
    })
    binding.add(document.getElementById('bkImportRestoreBtn'), 'click', () => {
      void settingsRestoreFromFile()
    })
    binding.add(document.getElementById('bkRefreshBtn'), 'click', () => {
      void settingsLoadBackups({ runAutomation: true }).catch((error) => {
        const message = error instanceof Error ? error.message : 'Nie udalo sie odswiezyc listy backupow.'
        showTransientNotice(message, 'error')
      })
    })
    binding.add(document.getElementById('bkRollbackBtn'), 'click', () => {
      void settingsRollbackToPreRestore().catch((error) => {
        const message = error instanceof Error ? error.message : 'Nie udalo sie wykonac rollbacku.'
        showTransientNotice(message, 'error')
      })
    })

    binding.add(document.getElementById('bkImportFile'), 'change', (event) => {
      settingsResetImportState({ clearFile: false })
      settingsRenderImportSummary()

      const input = event.currentTarget
      const file = input instanceof HTMLInputElement ? input.files?.[0] : null
      const summaryNode = document.getElementById('bkImportSummary')
      if (summaryNode && file) {
        summaryNode.textContent = `Wybrano plik: ${file.name}. Kliknij "Sprawdz plik".`
      }
    })

    binding.add(document.getElementById('bkRows'), 'click', (event) => {
      const button = event.target?.closest?.('[data-bk-action][data-bk-id]')
      if (!button) {
        return
      }

      const action = String(button.getAttribute('data-bk-action') ?? '').trim()
      const backupId = String(button.getAttribute('data-bk-id') ?? '').trim()
      if (!action || !backupId) {
        return
      }

      if (action === 'download') {
        void settingsDownloadBackup(backupId).catch((error) => {
          const message = error instanceof Error ? error.message : 'Nie udalo sie pobrac backupu.'
          showTransientNotice(message, 'error')
        })
        return
      }

      if (action === 'restore') {
        void settingsRestoreBackup(backupId).catch((error) => {
          const message = error instanceof Error ? error.message : 'Nie udalo sie przywrocic backupu.'
          showTransientNotice(message, 'error')
        })
        return
      }

      if (action === 'delete') {
        void settingsDeleteBackup(backupId).catch((error) => {
          const message = error instanceof Error ? error.message : 'Nie udalo sie usunac backupu.'
          showTransientNotice(message, 'error')
        })
      }
    })

    return binding.done
  }

  return {
    bind: bindSettingsViewFunctions,
    setActiveTab: settingsSetActiveTab,
    refreshStyleState: settingsRefreshStyleState,
    setAccessState: settingsSetAccessState,
    syncPermissions: syncSettingsPermissions,
    loadBackups: settingsLoadBackups,
  }
}
