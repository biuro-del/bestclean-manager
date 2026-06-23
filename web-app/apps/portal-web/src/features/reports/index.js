import template from './template.html?raw'

export const route = 'reports'
export const viewId = 'view-reports'
export { template }

export function createReportsFeature(ctx) {
  const {
    appState,
    zoneNameWithQrHtml,
    ymdToIsoRangeStart,
    ymdToIsoRangeEnd,
    workStatusIntervalsTotalSeconds,
    workStatusIntervalFromTimes,
    visiblePortalZones,
    updateEvent,
    toIso,
    todayYmd,
    setSelectOptions,
    resolveClientLabelWithQrFallback,
    refreshDashboardWidgets,
    pad2,
    normalizeVisibleEventComment,
    localDateAndTimeInputToIso,
    formatTime,
    formatDatePl,
    firstDayOfCurrentMonthYmd,
    fetchEventsForCurrentSession,
    eventTypeInfo,
    ensureSelectValue,
    daysAgoYmd,
    dashboardWorkerSurnameDisplayName,
    dashboardResolveZoneLabel,
    dashboardClockLabelToHm,
    dashboardBuildHistoryRow,
    canManageEvents,
    createBindingHelpers,
    durationSecondsToHms,
    escapeHtml,
    getClients,
    getWorkers,
    getWorkdays,
    getZones,
    normalizeSearchText,
    openEventEditor,
    showTransientNotice,
  } = ctx

  let reportsViewInitPromise = null
  let reportGeoPreviewHideTimer = null
  let reportHistoryScopedFilter = null
  const reportGeoModalState = {
    lat: '',
    lon: '',
    zoom: 18,
  }
  const REPORT_HISTORY_SYSTEM_CLIENT_LABEL = 'Best Clean biuro'
  const REPORT_HISTORY_SYSTEM_ZONE_LABEL = 'SYSTEM'

  function reportSetVisible(id, visible) {
    const element = document.getElementById(id)
    if (!element) {
      return
    }

    element.style.display = visible ? '' : 'none'
  }

  function reportSetStatus(message = '', isError = false) {
    const node = document.getElementById('repStatus')
    if (!node) {
      return
    }

    node.textContent = message
    node.style.color = isError ? '#b91c1c' : ''
  }

  function reportSetKpiValues(statsA = { count: 0, totalSec: 0 }, statsB = { count: 0, totalSec: 0 }) {
    const setValue = (id, value) => {
      const node = document.getElementById(id)
      if (node) {
        node.textContent = value
      }
    }

    setValue('repKpiCountA', String(statsA.count ?? 0))
    setValue('repKpiTimeA', durationSecondsToHms(statsA.totalSec ?? 0))
    setValue('repKpiCountB', String(statsB.count ?? 0))
    setValue('repKpiTimeB', durationSecondsToHms(statsB.totalSec ?? 0))
  }

  function reportResetCharts() {
    ;['repChartA', 'repChartB'].forEach((id) => {
      const root = document.getElementById(id)
      if (!root) {
        return
      }

      root.innerHTML = '<div class="rep-chart-empty">Brak danych do wykresu.</div>'
    })

    const titleA = document.getElementById('repChartPanelAName')
    if (titleA) {
      titleA.textContent = 'Panel A'
    }
    const titleB = document.getElementById('repChartPanelBName')
    if (titleB) {
      titleB.textContent = 'Panel B'
    }
  }

  function reportResetResults() {
    const summary = document.getElementById('repSummary')
    if (summary) {
      summary.innerHTML = ''
    }
    reportSetVisible('repSummary', false)
    reportSetVisible('repTableAWrap', false)
    reportSetVisible('repTableBWrap', false)
    reportSetVisible('repDiffWrap', false)
    reportSetKpiValues()
    reportResetCharts()
    reportSetStatus('')
    appState.reportLastCsv = ''

    const downloadButton = document.getElementById('repDownloadCsv')
    if (downloadButton) {
      downloadButton.disabled = true
    }
  }

  async function ensureReportsReferenceDataLoaded() {
    if (!appState.session?.orgId) {
      return
    }

    const tasks = []

    if (!appState.clientsLoaded) {
      tasks.push(
        getClients(appState.session.orgId).then((clients) => {
          appState.clients = clients
          appState.clientsLoaded = true
        }),
      )
    }

    if (!appState.workersLoaded) {
      tasks.push(
        getWorkers(appState.session.orgId).then((workers) => {
          appState.workers = workers
          appState.workersLoaded = true
        }),
      )
    }

    if (!appState.zonesLoaded) {
      tasks.push(
        getZones(appState.session.orgId).then((zones) => {
          appState.zones = zones
          appState.zonesLoaded = true
        }),
      )
    }

    if (tasks.length) {
      await Promise.all(tasks)
    }
  }

  function reportSetSelectOptions(selectId, options, placeholderLabel) {
    const select = document.getElementById(selectId)
    if (!select) {
      return
    }

    setSelectOptions(select, options, placeholderLabel)
  }

  function reportHistoryFilterOptions(options, query) {
    const normalizedQuery = normalizeSearchText(query)
    if (!normalizedQuery) {
      return [...options]
    }

    return options.filter((option) => {
      const label = normalizeSearchText(option.label)
      const value = normalizeSearchText(option.value)
      const originalLabel = normalizeSearchText(option.originalLabel)
      const searchLabel = normalizeSearchText(option.searchLabel)
      return (
        label.includes(normalizedQuery) ||
        value.includes(normalizedQuery) ||
        originalLabel.includes(normalizedQuery) ||
        searchLabel.includes(normalizedQuery)
      )
    })
  }

  function reportHistoryGetSelectConfig(kind) {
    const normalizedKind = String(kind ?? '').trim().toLowerCase()
    if (normalizedKind === 'worker' || normalizedKind === 'workers') {
      return {
        inputId: 'repHistoryWorkerSearch',
        selectId: 'repHistoryWorker',
        placeholderLabel: '(wybierz osobe)',
        options: appState.reportHistoryWorkerOptions,
      }
    }

    if (normalizedKind === 'zone' || normalizedKind === 'zones') {
      return {
        inputId: 'repHistoryZoneSearch',
        selectId: 'repHistoryZone',
        placeholderLabel: '(wybierz strefe)',
        options: appState.reportHistoryZoneOptions,
      }
    }

    return {
      inputId: 'repHistoryClientSearch',
      selectId: 'repHistoryClient',
      placeholderLabel: '(wybierz obiekt)',
      options: appState.reportHistoryClientOptions,
    }
  }

  function reportHistorySetSelectExpanded(config, expanded, optionCount = 0) {
    const select = document.getElementById(config.selectId)
    if (!select) {
      return
    }

    if (!expanded) {
      select.size = 1
      select.classList.remove('is-expanded')
      return
    }

    const rows = Math.min(Math.max(Number(optionCount || 0) + 1, 2), 8)
    select.size = rows
    select.classList.add('is-expanded')
  }

  function reportHistoryCollapseSelect(kind) {
    reportHistorySetSelectExpanded(reportHistoryGetSelectConfig(kind), false, 0)
  }

  function reportHistoryCollapseAllSelects() {
    reportHistoryCollapseSelect('client')
    reportHistoryCollapseSelect('worker')
    reportHistoryCollapseSelect('zone')
  }

  function reportHistoryMaybeCollapseSelect(kind) {
    const config = reportHistoryGetSelectConfig(kind)
    const activeId = String(document.activeElement?.id ?? '').trim()
    if (activeId === config.inputId || activeId === config.selectId) {
      return
    }

    reportHistorySetSelectExpanded(config, false, 0)
  }

  function reportHistoryApplySelectFilter(kind, { expandOnEmpty = false } = {}) {
    const config = reportHistoryGetSelectConfig(kind)

    const select = document.getElementById(config.selectId)
    if (!select) {
      return
    }

    const currentValue = String(select.value ?? '').trim()
    const query = String(document.getElementById(config.inputId)?.value ?? '').trim()
    const filteredOptions = reportHistoryFilterOptions(config.options, query)
    const placeholderLabel = query && !filteredOptions.length ? '(brak dopasowan)' : config.placeholderLabel

    reportSetSelectOptions(config.selectId, filteredOptions, placeholderLabel)
    const placeholderOption = select.options[0]
    if (placeholderOption) {
      const hasMatches = filteredOptions.length > 0
      placeholderOption.hidden = hasMatches
      placeholderOption.disabled = hasMatches
    }
    reportHistorySetSelectExpanded(config, Boolean(query) || expandOnEmpty, filteredOptions.length)

    if (currentValue && filteredOptions.some((option) => option.value === currentValue)) {
      select.value = currentValue
    }
  }

  function reportHistoryApplyAllSelectFilters() {
    reportHistoryApplySelectFilter('client')
    reportHistoryApplySelectFilter('worker')
    reportHistoryApplySelectFilter('zone')
  }

  function reportDefaultDates() {
    ;['repA_from', 'repB_from'].forEach((id) => {
      const input = document.getElementById(id)
      if (input && !String(input.value ?? '').trim()) {
        input.value = firstDayOfCurrentMonthYmd()
      }
    })

    ;['repA_to', 'repB_to'].forEach((id) => {
      const input = document.getElementById(id)
      if (input && !String(input.value ?? '').trim()) {
        input.value = todayYmd()
      }
    })
  }

  function reportRefreshZoneOptions(panel) {
    const clientSelect = document.getElementById(`rep${panel}_client`)
    const zoneSelect = document.getElementById(`rep${panel}_zone`)
    const zoneSelectId = `rep${panel}_zone`
    if (!clientSelect || !zoneSelect) {
      return
    }

    const clientId = String(clientSelect.value ?? '').trim()
    const currentZoneId = String(zoneSelect.value ?? '').trim()

    if (!clientId) {
      reportSetSelectOptions(zoneSelectId, [], '(najpierw wybierz klienta)')
      zoneSelect.disabled = true
      return
    }

    const zones = appState.zones.filter((zone) => String(zone.clientId ?? '').trim() === clientId)
    const options = zones
      .map((zone) => ({
        value: String(zone.id ?? ''),
        label: zone.name || zone.zone || zone.id,
      }))
      .filter((option) => option.value)
      .sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))

    reportSetSelectOptions(zoneSelectId, options, '(wszystkie strefy klienta)')
    zoneSelect.disabled = false

    if (currentZoneId) {
      const exists = options.some((option) => option.value === currentZoneId)
      if (exists) {
        zoneSelect.value = currentZoneId
      }
    }
  }

  function reportPanelLabel(panel) {
    const clientId = String(panel.clientId ?? '').trim()
    const zoneId = String(panel.zoneId ?? '').trim()
    const client = appState.clients.find((item) => String(item.id ?? '').trim() === clientId)
    const zone = appState.zones.find((item) => String(item.id ?? '').trim() === zoneId)

    const clientLabel = client?.name || clientId || 'Brak klienta'
    const zoneLabel = zone?.name || zone?.zone || zoneId || 'Wszystkie strefy'
    return `${clientLabel} / ${zoneLabel}`
  }

  function reportGroupByLocation(items) {
    const grouped = new Map()

    items.forEach((item) => {
      const rawLocation = String(item.lokalizacja ?? item.location ?? item.zoneName ?? item.strefa ?? '').trim()
      const key = rawLocation || 'Brak lokalizacji'
      const duration = Number(item.durationSec ?? 0)
      const durationSec = Number.isFinite(duration) && duration >= 0 ? Math.floor(duration) : 0

      if (!grouped.has(key)) {
        grouped.set(key, { location: key, totalSec: 0, count: 0 })
      }

      const bucket = grouped.get(key)
      bucket.totalSec += durationSec
      bucket.count += 1
    })

    return [...grouped.values()]
      .sort((left, right) => {
        if (right.totalSec !== left.totalSec) {
          return right.totalSec - left.totalSec
        }
        return left.location.localeCompare(right.location, 'pl', { sensitivity: 'base' })
      })
      .slice(0, 8)
  }

  function reportRenderLocationChart(containerId, buckets) {
    const root = document.getElementById(containerId)
    if (!root) {
      return
    }

    if (!buckets.length) {
      root.innerHTML = '<div class="rep-chart-empty">Brak danych do wykresu.</div>'
      return
    }

    const maxSec = Math.max(...buckets.map((bucket) => bucket.totalSec), 1)
    const barsHtml = buckets
      .map((bucket) => {
        const percent = Math.max(8, Math.round((bucket.totalSec / maxSec) * 100))
        const locationShort = bucket.location.length > 16 ? `${bucket.location.slice(0, 14)}...` : bucket.location
        return `
          <div class="rep-bar-item" title="${escapeHtml(bucket.location)}: ${escapeHtml(durationSecondsToHms(bucket.totalSec))}">
            <div class="rep-bar-meta">
              <span>${escapeHtml(durationSecondsToHms(bucket.totalSec))}</span>
              <span>${escapeHtml(String(bucket.count))} zd.</span>
            </div>
            <div class="rep-bar-track">
              <div class="rep-bar-fill" style="height:${percent}%"></div>
            </div>
            <div class="rep-bar-label">${escapeHtml(locationShort)}</div>
          </div>
        `
      })
      .join('')

    root.innerHTML = `<div class="rep-bars-inner">${barsHtml}</div>`
  }

  function reportRenderCharts(itemsA, itemsB, panelA, panelB) {
    const panelATitle = document.getElementById('repChartPanelAName')
    if (panelATitle) {
      panelATitle.textContent = `Panel A: ${reportPanelLabel(panelA)}`
    }

    const panelBTitle = document.getElementById('repChartPanelBName')
    if (panelBTitle) {
      panelBTitle.textContent = `Panel B: ${reportPanelLabel(panelB)}`
    }

    reportRenderLocationChart('repChartA', reportGroupByLocation(itemsA))
    reportRenderLocationChart('repChartB', reportGroupByLocation(itemsB))
  }

  async function prepareReportsView() {
    if (!appState.session?.orgId) {
      return
    }

    await ensureReportsReferenceDataLoaded()
    const workerDirectory = await getWorkers(appState.session.orgId)
    appState.workers = workerDirectory
    appState.workersLoaded = true

    const clientOptions = appState.clients.map((client) => ({
      value: String(client.id ?? ''),
      label: client.name ? `${client.name} (${client.id})` : String(client.id ?? ''),
    }))
    clientOptions.sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))
    const workerOptions = workerDirectory.map((worker) => ({
      value: String(worker.login ?? worker.id ?? ''),
      label: dashboardWorkerSurnameDisplayName(worker.name || worker.login || worker.id),
      originalLabel: worker.name || worker.login || worker.id,
      searchLabel: [
        worker.name,
        dashboardWorkerSurnameDisplayName(worker.name),
        worker.login,
        worker.id,
      ]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean)
        .join(' '),
    }))
    workerOptions.sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))
    const zoneOptions = appState.zones
      .map((zone) => ({
        value: String(zone.id ?? ''),
        label: zone.name || zone.zone || zone.id,
      }))
      .filter((zone) => zone.value)
      .sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))

    reportSetSelectOptions('repA_client', clientOptions, '(wybierz klienta)')
    reportSetSelectOptions('repB_client', clientOptions, '(wybierz klienta)')
    reportSetSelectOptions('repA_worker', workerOptions, '(wszyscy pracownicy)')
    reportSetSelectOptions('repB_worker', workerOptions, '(wszyscy pracownicy)')
    reportSetSelectOptions('repEventsClient', clientOptions, '(wszyscy klienci)')
    reportSetSelectOptions('repEventsWorker', workerOptions, '(wszyscy pracownicy)')
    reportSetSelectOptions('repEventsType', reportEventsTypeOptions(), 'Wszystkie typy')
    reportEventsDefaultDates()
    reportRefreshEventsZoneOptions()
    appState.reportHistoryClientOptions = [...clientOptions]
    appState.reportHistoryWorkerOptions = [...workerOptions]
    appState.reportHistoryZoneOptions = [...zoneOptions]
    reportHistoryApplyAllSelectFilters()
    reportRefreshZoneOptions('A')
    reportRefreshZoneOptions('B')
    reportDefaultDates()
    reportHistorySetTab(appState.reportHistoryTab)
    reportHistoryApplyRangeMode(reportHistoryReadRangeMode(), { force: false })
    reportHistoryResetResults({ clearStatus: true })
    reportHistorySetStatus('Wybierz filtr i kliknij "Pokaż historię".')
    reportSetKpiValues()
    reportResetCharts()
    reportSetStatus('Ustaw filtry i wygeneruj zestawienie zdarzeń.')
  }

  function reportHistoryNormalizeTab(value) {
    const normalized = String(value ?? '').trim().toLowerCase()
    if (normalized === 'workers' || normalized === 'zones') {
      return normalized
    }

    return 'objects'
  }

  function reportHistoryKindForTab(tab) {
    const normalized = reportHistoryNormalizeTab(tab)
    if (normalized === 'workers') {
      return 'workerTime'
    }
    if (normalized === 'zones') {
      return 'events'
    }

    return 'clients'
  }

  function reportHistoryBuilderConfig(kind) {
    const normalized = String(kind ?? '').trim()
    if (normalized === 'events') {
      return {
        tab: 'zones',
        title: 'Zdarzenia',
        subtitle: 'Historia zdarzeń według stref.',
        status: 'Wybierz strefę i kliknij "Pokaż historię".',
        showTabs: false,
      }
    }
    if (normalized === 'workerTime') {
      return {
        tab: 'workers',
        title: 'Czasy pracowników',
        subtitle: 'Historia pracy według osób.',
        status: 'Wybierz osobę i kliknij "Pokaż historię".',
        showTabs: false,
      }
    }
    if (normalized === 'clients') {
      return {
        tab: 'objects',
        title: 'Klienci',
        subtitle: 'Historia pracy według klientów.',
        status: 'Wybierz klienta i kliknij "Pokaż historię".',
        showTabs: false,
      }
    }
    if (normalized === 'history') {
      return {
        tab: appState.reportHistoryTab,
        title: 'Historia',
        subtitle: 'Historia dnia dla klienta, osoby lub strefy.',
        status: 'Wybierz filtr i kliknij "Pokaż historię".',
        showTabs: true,
      }
    }

    return null
  }

  function reportHistorySetTabsVisible(visible) {
    const tabs = document.getElementById('repHistoryTabs')
    if (!tabs) {
      return
    }

    tabs.style.display = visible ? '' : 'none'
  }

  function reportHistoryReadRangeMode() {
    return document.getElementById('repHistoryRangeWeek')?.checked ? 'week' : 'month'
  }

  function reportHistoryApplyRangeMode(mode, { force = false } = {}) {
    const normalized = String(mode ?? '').trim().toLowerCase() === 'week' ? 'week' : 'month'
    const monthRadio = document.getElementById('repHistoryRangeMonth')
    const weekRadio = document.getElementById('repHistoryRangeWeek')
    const fromInput = document.getElementById('repHistoryFrom')
    const toInput = document.getElementById('repHistoryTo')

    if (monthRadio) {
      monthRadio.checked = normalized === 'month'
    }
    if (weekRadio) {
      weekRadio.checked = normalized === 'week'
    }

    if (!fromInput || !toInput) {
      return
    }

    if (!force && String(fromInput.value ?? '').trim() && String(toInput.value ?? '').trim()) {
      return
    }

    if (normalized === 'week') {
      fromInput.value = daysAgoYmd(6)
      toInput.value = todayYmd()
      return
    }

    fromInput.value = firstDayOfCurrentMonthYmd()
    toInput.value = todayYmd()
  }

  function reportHistorySetStatus(message = '', isError = false) {
    const node = document.getElementById('repHistoryStatus')
    if (!node) {
      return
    }

    node.textContent = message
    node.style.color = isError ? '#b91c1c' : ''
  }

  function reportHistorySetLoading(isLoading, message = 'Ładowanie historii...') {
    const loading = document.getElementById('repHistoryLoading')
    const loadingText = loading?.querySelector('[data-rep-history-loading-text]')
    const button = document.getElementById('repHistoryRun')

    if (loading) {
      loading.style.display = isLoading ? 'grid' : 'none'
      loading.setAttribute('aria-busy', isLoading ? 'true' : 'false')
    }
    if (loadingText) {
      loadingText.textContent = message
    }
    if (button) {
      button.disabled = Boolean(isLoading)
      button.textContent = isLoading ? 'Ładowanie...' : 'Pokaż historię'
    }
  }

  function reportHistorySetTab(tab) {
    const normalized = reportHistoryNormalizeTab(tab)
    const previous = reportHistoryNormalizeTab(appState.reportHistoryTab)

    appState.reportHistoryTab = normalized
    reportGeoHidePreview()
    reportGeoCloseModal()
    reportHistoryCollapseAllSelects()
    document.querySelectorAll('[data-rep-history-tab]').forEach((button) => {
      button.classList.toggle('active', button.getAttribute('data-rep-history-tab') === normalized)
    })

    reportSetVisible('repHistoryClientWrap', normalized === 'objects')
    reportSetVisible('repHistoryWorkerWrap', normalized === 'workers')
    reportSetVisible('repHistoryZoneWrap', normalized === 'zones')

    if (previous !== normalized) {
      reportHistoryResetResults({ clearStatus: false })
    }
  }

  function reportHistorySetSummaryRows(rows = []) {
    const summary = document.getElementById('repHistorySummary')
    if (!summary) {
      return
    }

    if (!rows.length) {
      summary.innerHTML = ''
      reportSetVisible('repHistorySummary', false)
      return
    }

    const days = rows.length
    const events = rows.reduce((sum, row) => sum + Number(row.countAll ?? 0), 0)
    const running = rows.reduce((sum, row) => sum + Number(row.runningCount ?? 0), 0)
    const closedSec = rows.reduce((sum, row) => sum + Number(row.closedSec ?? 0), 0)
    const isWorkersTab = reportHistoryNormalizeTab(appState.reportHistoryTab) === 'workers'
    const selectedWorkerLabel = String(
      document.getElementById('repHistoryWorker')?.selectedOptions?.[0]?.textContent ??
        document.getElementById('repHistoryWorkerSearch')?.value ??
        '',
    ).trim()
    const selectedLabel = isWorkersTab ? selectedWorkerLabel || '-' : 'Wybrany zakres'
    const selectedCaption = isWorkersTab ? 'Osoba' : 'Zestawienie'

    summary.innerHTML = `
      <div class="rep-history-summary-card">
        <div class="rep-history-summary-person">
          <span>${escapeHtml(selectedCaption)}</span>
          <strong>${escapeHtml(selectedLabel)}</strong>
        </div>
        <div class="rep-history-summary-grid">
          <div class="rep-history-summary-kpi">
            <span>Dni</span>
            <strong>${escapeHtml(String(days))}</strong>
          </div>
          <div class="rep-history-summary-kpi">
            <span>Wpisy</span>
            <strong>${escapeHtml(String(events))}</strong>
          </div>
          <div class="rep-history-summary-kpi">
            <span>Otwarte</span>
            <strong>${escapeHtml(String(running))}</strong>
          </div>
          <div class="rep-history-summary-kpi is-total">
            <span>Czas pracy</span>
            <strong>${escapeHtml(durationSecondsToHms(closedSec))}</strong>
          </div>
        </div>
      </div>
    `
    reportSetVisible('repHistorySummary', true)
  }

  function reportHistoryResolveEditableEvent(detail) {
    const source = detail?.sourceItem
    if (!source || typeof source !== 'object') {
      return null
    }

    const eventId = String(source.eventId ?? source.workdayId ?? source.id ?? '').trim()
    if (!eventId) {
      return null
    }

    const editable = { ...source }
    editable.eventId = eventId
    editable.workdayId = String(source.workdayId ?? source.eventId ?? source.id ?? '').trim() || eventId
    editable.workerLogin = String(source.workerLogin ?? source.workerId ?? source.login ?? '').trim()
    editable.workerName =
      String(source.workerName ?? source.name ?? detail?.workerLabel ?? editable.workerLogin ?? '').trim() || '-'
    editable.startAt = toIso(source.startAt ?? source.dayStartAt) || null
    editable.endAt = toIso(source.endAt ?? source.dayEndAt) || null
    editable.comment = String(source.comment ?? source.dayComment ?? '').trim()
    editable.editedBy = String(source.editedBy ?? source.updatedBy ?? appState.session?.name ?? '').trim() || '-'

    const zoneId = String(source.roomId ?? source.utilityRoomId ?? source.zoneId ?? source.workdayUtilityRoomId ?? '').trim()
    if (zoneId) {
      editable.zoneId = zoneId
      editable.roomId = zoneId
      editable.utilityRoomId = zoneId
    }

    const clientId = String(source.clientId ?? '').trim()
    editable.clientId = clientId || null
    return editable
  }

  function reportHistoryStoreEditableDetail(dayKey, detailIndex, detail) {
    const editable = reportHistoryResolveEditableEvent(detail)
    if (!editable) {
      return ''
    }

    const key = `${String(dayKey ?? '').trim()}::${Number(detailIndex)}`
    appState.reportHistoryEditableMap = {
      ...(appState.reportHistoryEditableMap || {}),
      [key]: editable,
    }
    return key
  }

  function reportHistoryStoreEditableSource(dayKey, suffix, sourceItem) {
    const editable = reportHistoryResolveEditableEvent({ sourceItem })
    if (!editable) {
      return ''
    }

    const key = `${String(dayKey ?? '').trim()}::${String(suffix ?? '').trim() || 'marker'}`
    appState.reportHistoryEditableMap = {
      ...(appState.reportHistoryEditableMap || {}),
      [key]: editable,
    }
    return key
  }

  function reportHistoryEditButtonHtml(editKey) {
    if (!canManageEvents() || !editKey) {
      return '-'
    }

    return `
      <button
        class="event-edit-icon-btn rep-history-edit-btn"
        type="button"
        data-rep-history-edit="${escapeHtml(editKey)}"
        aria-label="Edytuj zdarzenie"
        title="Edytuj zdarzenie"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 20h4l10-10-4-4L4 16v4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M13 7l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    `
  }

  function reportHistoryIsDayStopSource(item) {
    if (!item || typeof item !== 'object') {
      return false
    }

    const stopIso = toIso(item?.dayEndAt ?? item?.endAt ?? item?.closeMarkedAt)
    if (!stopIso) {
      return false
    }

    const endReason = String(item?.endReason ?? '').trim().toUpperCase()
    const status = String(item?.status ?? '').trim().toUpperCase()
    return (
      item?.historyMarkerOnly ||
      endReason === 'WORKDAY_STOP' ||
      endReason === 'STOP_END_DAY' ||
      status === 'WORKDAY_CLOSED'
    )
  }

  function reportHistoryHasDayStart(row) {
    return Boolean(toIso(row?.dayStartIso ?? row?.qrStartSourceItem?.dayStartAt ?? row?.qrStartSourceItem?.startAt))
  }

  function reportHistoryHasDayStop(row) {
    return reportHistoryIsDayStopSource(row?.qrStopSourceItem)
  }

  function reportHistoryHasOpenWorkerDay(row) {
    return reportHistoryHasDayStart(row) && !reportHistoryHasDayStop(row)
  }

  function reportHistoryDayStartCloseSource(row) {
    const source = row?.qrStartSourceItem
    if (!source || typeof source !== 'object') {
      return null
    }

    const sourceId = String(source?.eventId ?? source?.workdayId ?? source?.id ?? '').trim()
    if (!sourceId) {
      return null
    }

    const startIso = toIso(source?.startAt ?? source?.dayStartAt ?? row?.dayStartIso)
    return startIso ? source : null
  }

  function reportHistorySourceIds(source) {
    return [source?.eventId, source?.workdayId, source?.id]
      .map((value) => String(value ?? '').trim())
      .filter((value, index, list) => value && list.indexOf(value) === index)
  }

  function reportHistoryApplyClosedWorkerDay(dayKey, endAt, closedTargets = []) {
    const normalizedDayKey = String(dayKey ?? '').trim()
    const endIso = toIso(endAt)
    if (!normalizedDayKey || !endIso || !Array.isArray(appState.reportHistoryRows)) {
      return false
    }

    const targetMap = new Map()
    closedTargets.forEach((target) => {
      const source = target?.sourceItem ?? target
      const targetIds = [...reportHistorySourceIds(source), ...reportHistorySourceIds(target)]
      targetIds.forEach((targetId) => {
        targetMap.set(targetId, target)
      })
    })

    let changed = false
    appState.reportHistoryRows = appState.reportHistoryRows.map((row) => {
      if (String(row?.dayKey ?? '').trim() !== normalizedDayKey) {
        return row
      }

      changed = true
      const details = Array.isArray(row.details) ? row.details : []
      const nextDetails = details.map((detail) => {
        const sourceIds = reportHistorySourceIds(detail?.sourceItem)
        const target = sourceIds.map((sourceId) => targetMap.get(sourceId)).find(Boolean)
        const shouldClose =
          Boolean(target) ||
          (!targetMap.size && String(detail?.statusLabel ?? '').trim().toUpperCase() === 'RUNNING')
        if (!shouldClose) {
          return detail
        }

        const detailEndIso = toIso(target?.endAt) || endIso
        const sourceStartIso = toIso(detail?.sourceItem?.startAt ?? detail?.sourceItem?.dayStartAt)
        const targetDuration = Number(target?.durationSec ?? 0)
        const fallbackDuration =
          reportHistoryToTimestamp(sourceStartIso) && reportHistoryToTimestamp(detailEndIso)
            ? reportHistoryRangeSecondsFromTimestamps(reportHistoryToTimestamp(sourceStartIso), reportHistoryToTimestamp(detailEndIso))
            : 0
        const durationSec = Number.isFinite(targetDuration) && targetDuration > 0 ? Math.floor(targetDuration) : fallbackDuration

        return {
          ...detail,
          stopLabel: formatTime(detailEndIso),
          durationLabel: durationSecondsToHms(durationSec),
          statusLabel: 'CLOSED',
          sortEndTs: reportHistoryToTimestamp(detailEndIso) || Number(detail?.sortEndTs ?? 0),
          sourceItem: {
            ...(detail.sourceItem || {}),
            endAt: detailEndIso,
            dayEndAt: detailEndIso,
            closeMarkedAt: detailEndIso,
            endReason: 'WORKDAY_STOP',
            durationSec,
            status: 'CLOSED',
          },
        }
      })

      const seedTarget = closedTargets[0] ?? {}
      const seedSource = seedTarget?.sourceItem ?? row?.qrStartSourceItem ?? row?.dayStartSourceItem ?? {}
      const rowStartIso = toIso(row?.dayStartIso ?? row?.qrStartSourceItem?.dayStartAt ?? row?.qrStartSourceItem?.startAt)
      const endTs = reportHistoryToTimestamp(endIso)
      const startTs = Number(row?.dayStartTs ?? 0) || reportHistoryToTimestamp(rowStartIso)
      const closedSecFromSpan = reportHistoryRangeSecondsFromTimestamps(startTs, endTs)
      const detailsClosedSec = nextDetails.reduce((sum, detail) => {
        if (String(detail?.statusLabel ?? '').trim().toUpperCase() !== 'CLOSED') {
          return sum
        }
        return sum + reportHistoryClosedDurationSec(detail?.sourceItem || {})
      }, 0)
      const nextClosedSec = closedSecFromSpan || detailsClosedSec || Number(row?.closedSec ?? 0) || 0
      const stopSource = {
        ...(row?.qrStopSourceItem || {}),
        ...(seedSource || {}),
        historyMarkerOnly: true,
        dayStartAt: rowStartIso || toIso(seedSource?.startAt ?? seedSource?.dayStartAt),
        dayEndAt: endIso,
        endAt: endIso,
        closeMarkedAt: endIso,
        endReason: 'WORKDAY_STOP',
        status: 'WORKDAY_CLOSED',
      }

      return {
        ...row,
        runningCount: nextDetails.filter((detail) => String(detail?.statusLabel ?? '').trim().toUpperCase() === 'RUNNING').length,
        closedSec: nextClosedSec,
        dayEndIso: endIso,
        dayEndTs: endTs || Number(row?.dayEndTs ?? 0),
        dayEndIsBoundary: true,
        dayEndSourceItem: stopSource,
        latestRunningStartTs: 0,
        qrStopLabel: formatTime(endIso),
        qrStopSourceItem: stopSource,
        details: nextDetails,
      }
    })

    if (changed) {
      reportHistorySetSummaryRows(appState.reportHistoryRows)
    }
    return changed
  }

  function reportHistoryRenderDetails(row, tab, dayKey = '') {
    const details = Array.isArray(row.details) ? row.details : []
    if (!details.length && tab !== 'workers') {
      return '<div class="rep-history-empty">Brak szczegółów.</div>'
    }

    if (tab === 'zones') {
      const body = details
        .map(
          (detail, detailIndex) => {
            const resolvedClient = resolveClientLabelWithQrFallback(detail.clientLabel || '-', detail.zoneLabel || '-')
            const editKey = reportHistoryStoreEditableDetail(dayKey, detailIndex, detail)
            return `
            <tr>
              <td>${escapeHtml(resolvedClient)}</td>
              <td>${zoneNameWithQrHtml(detail.zoneLabel || '-', detail.sourceItem)}</td>
              <td>${escapeHtml(detail.locationLabel || '-')}</td>
              <td>${escapeHtml(detail.workerLabel || '-')}</td>
              <td class="time-start">${escapeHtml(detail.startLabel || '-')}</td>
              <td class="time-stop">${escapeHtml(detail.stopLabel || '-')}</td>
              <td class="ta-right">${escapeHtml(detail.durationLabel || '-')}</td>
              <td class="ta-right">${escapeHtml(detail.statusLabel || '-')}</td>
              <td class="ta-right rep-history-edit-cell">${reportHistoryEditButtonHtml(editKey)}</td>
            </tr>
          `
          },
        )
        .join('')

      return `
        <div class="rep-history-detail">
          <table class="rep-history-detail-table">
            <thead>
              <tr><th>Klient</th><th>Strefa</th><th>Lok.</th><th>Osoba</th><th class="time-start">Start</th><th class="time-stop">Stop</th><th class="ta-right">Czas</th><th class="ta-right">Status</th><th class="ta-right">Edytuj</th></tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      `
    }

    if (tab === 'workers') {
      const hasDayStop = reportHistoryHasDayStop(row)
      const qrStartEditKey = reportHistoryStoreEditableSource(dayKey, 'marker-start', row?.qrStartSourceItem)
      const qrStopEditKey = reportHistoryStoreEditableSource(dayKey, 'marker-stop', row?.qrStopSourceItem)
      const qrStartIsSystem = reportHistoryIsSystemEntrySource(row?.qrStartSourceItem)
      const qrStopIsSystem = reportHistoryIsSystemEntrySource(row?.qrStopSourceItem)
      const detailsBody = details
        .map(
          (detail, detailIndex) => {
            const resolvedClient = resolveClientLabelWithQrFallback(detail.clientLabel || '-', detail.zoneLabel || '-')
            const editKey = reportHistoryStoreEditableDetail(dayKey, detailIndex, detail)
            return `
            <tr>
              <td>${escapeHtml(resolvedClient)}</td>
              <td>${zoneNameWithQrHtml(detail.zoneLabel || '-', detail.sourceItem)}</td>
              <td>${escapeHtml(detail.locationLabel || '-')}</td>
              <td class="time-start">${escapeHtml(detail.startLabel || '-')}</td>
              <td class="time-stop">${escapeHtml(detail.stopLabel || '-')}</td>
              <td class="ta-right">${escapeHtml(detail.durationLabel || '-')}</td>
              <td class="ta-right">${escapeHtml(detail.statusLabel || '-')}</td>
              <td class="ta-right rep-history-edit-cell">${reportHistoryEditButtonHtml(editKey)}</td>
            </tr>
          `
          },
        )
        .join('')
      const qrStartClient = qrStartIsSystem
        ? REPORT_HISTORY_SYSTEM_CLIENT_LABEL
        : resolveClientLabelWithQrFallback(row.qrStartClientLabel || '-', row.qrStartZoneCode || '-')
      const qrStopClient = qrStopIsSystem
        ? REPORT_HISTORY_SYSTEM_CLIENT_LABEL
        : resolveClientLabelWithQrFallback(row.qrStopClientLabel || '-', row.qrStopZoneCode || '-')
      const qrStartZoneLabel = qrStartIsSystem ? REPORT_HISTORY_SYSTEM_ZONE_LABEL : String(row.qrStartZoneCode || '-')
      const qrStopZoneLabel = qrStopIsSystem ? REPORT_HISTORY_SYSTEM_ZONE_LABEL : String(row.qrStopZoneCode || '-')
      const qrStartLocationLabel = qrStartIsSystem ? REPORT_HISTORY_SYSTEM_ZONE_LABEL : String(row.qrStartGeoLabel || '-')
      const qrStopLocationLabel = qrStopIsSystem ? REPORT_HISTORY_SYSTEM_ZONE_LABEL : String(row.qrStopGeoLabel || '-')
      const qrStartZoneSource = row.qrStartZoneCode && row.qrStartZoneCode !== '-'
        ? row.qrStartZoneCode
        : (row?.qrStartSourceItem ?? qrStartZoneLabel)
      const qrStopZoneSource = row.qrStopZoneCode && row.qrStopZoneCode !== '-'
        ? row.qrStopZoneCode
        : (row?.qrStopSourceItem ?? qrStopZoneLabel)
      const qrStartRow = `
        <tr class="rep-history-marker-row">
          <td>${escapeHtml(qrStartClient)}</td>
          <td>${zoneNameWithQrHtml(qrStartZoneLabel, qrStartZoneSource)}</td>
          <td>${reportHistoryGeoCellHtml(qrStartLocationLabel)}</td>
          <td class="time-start">${escapeHtml(row.qrStartLabel || '-')}</td>
          <td class="time-stop">-</td>
          <td class="ta-right">-</td>
          <td class="ta-right">QR START</td>
          <td class="ta-right rep-history-edit-cell">${reportHistoryEditButtonHtml(qrStartEditKey)}</td>
        </tr>
      `
      const qrStopRow = `
        <tr class="rep-history-marker-row">
          <td>${escapeHtml(qrStopClient)}</td>
          <td>${zoneNameWithQrHtml(qrStopZoneLabel, qrStopZoneSource)}</td>
          <td>${reportHistoryGeoCellHtml(qrStopLocationLabel)}</td>
          <td class="time-start">-</td>
          <td class="time-stop">${escapeHtml(row.qrStopLabel || '-')}</td>
          <td class="ta-right">-</td>
          <td class="ta-right">QR STOP</td>
          <td class="ta-right rep-history-edit-cell">${reportHistoryEditButtonHtml(qrStopEditKey)}</td>
        </tr>
      `
      const body = `${hasDayStop ? qrStopRow : ''}${detailsBody}${qrStartRow}`

      return `
        <div class="rep-history-detail">
          <table class="rep-history-detail-table">
            <thead>
              <tr><th>Klient</th><th>Strefa</th><th>Lok.</th><th class="time-start">Start</th><th class="time-stop">Stop</th><th class="ta-right">Czas</th><th class="ta-right">Status</th><th class="ta-right">Edytuj</th></tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      `
    }

    const body = details
      .map(
        (detail, detailIndex) => {
          const editKey = reportHistoryStoreEditableDetail(dayKey, detailIndex, detail)
          return `
          <tr>
            <td>${zoneNameWithQrHtml(detail.zoneLabel || '-', detail.sourceItem)}</td>
            <td>${escapeHtml(detail.locationLabel || '-')}</td>
            <td>${escapeHtml(detail.workerLabel || '-')}</td>
            <td class="time-start">${escapeHtml(detail.startLabel || '-')}</td>
            <td class="time-stop">${escapeHtml(detail.stopLabel || '-')}</td>
            <td class="ta-right">${escapeHtml(detail.durationLabel || '-')}</td>
            <td class="ta-right">${escapeHtml(detail.statusLabel || '-')}</td>
            <td class="ta-right rep-history-edit-cell">${reportHistoryEditButtonHtml(editKey)}</td>
          </tr>
        `
        },
      )
      .join('')

    return `
      <div class="rep-history-detail">
        <table class="rep-history-detail-table">
          <thead>
            <tr><th>Strefa</th><th>Lok.</th><th>Osoba</th><th class="time-start">Start</th><th class="time-stop">Stop</th><th class="ta-right">Czas</th><th class="ta-right">Status</th><th class="ta-right">Edytuj</th></tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `
  }

  function reportHistoryDayInfoHtml(row) {
    const startValue = String(row?.qrStartLabel ?? '').trim() || '--:--:--'
    const hasOpenDay = reportHistoryHasOpenWorkerDay(row)
    const stopValue = hasOpenDay ? '--:--:--' : String(row?.qrStopLabel ?? '').trim() || '--:--:--'
    const workValue = durationSecondsToHms(Number(row?.closedSec ?? 0))
    const dayKey = String(row?.dayKey ?? '').trim()
    const canStopDay = hasOpenDay && Boolean(dayKey) && canManageEvents()
    const stopDayBusy = canStopDay && appState.reportHistoryClosingDayKey === dayKey
    const stopDayButton = canStopDay
      ? `
        <button
          class="btn2 rep-history-stopday-btn"
          type="button"
          data-rep-history-stop-day="${escapeHtml(dayKey)}"
          ${stopDayBusy ? 'disabled' : ''}
        >
          ${stopDayBusy ? 'Zamykanie...' : 'Zamknij dzień pracy'}
        </button>
      `
      : ''

    return `
      <div class="rep-history-day-info">
        <div class="rep-history-day-metrics">
          <div class="rep-history-time-pill is-start">
            <span>Start</span>
            <strong>${escapeHtml(startValue)}</strong>
          </div>
          <div class="rep-history-time-pill is-stop">
            <span>Stop</span>
            <strong>${escapeHtml(stopValue)}</strong>
          </div>
          <div class="rep-history-time-pill is-work">
            <span>Czas</span>
            <strong>${escapeHtml(workValue)}</strong>
          </div>
        </div>
        ${stopDayButton}
      </div>
    `
  }

  function reportHistoryPromptStopDateTime({ dayKey = '', dayLabel = '-', workerName = '-' } = {}) {
    const normalizedDayKey = String(dayKey ?? '').trim()
    const initialDate = /^\d{4}-\d{2}-\d{2}$/.test(normalizedDayKey) ? normalizedDayKey : todayYmd()
    return new Promise((resolve) => {
      const existingOverlay = document.getElementById('repHistoryStopDayOverlay')
      if (existingOverlay) {
        existingOverlay.remove()
      }

      const overlay = document.createElement('div')
      overlay.id = 'repHistoryStopDayOverlay'
      overlay.className = 'overlay rep-history-stopday-overlay'
      overlay.setAttribute('role', 'dialog')
      overlay.setAttribute('aria-modal', 'true')
      overlay.innerHTML = `
        <div class="modal modal-sm rep-history-stopday-modal" role="document">
          <div class="modal-header">
            <div>
              <div class="modal-title">Zakończ dzień</div>
              <div class="modal-subtitle">${escapeHtml(workerName)} · ${escapeHtml(dayLabel)}</div>
            </div>
            <button class="icon-btn" type="button" data-rep-history-stop-close aria-label="Zamknij">x</button>
          </div>
          <div class="modal-body">
            <div class="form-grid">
              <div class="form-field span-2">
                <label for="repHistoryStopDayDateInput">Data zakończenia</label>
                <input
                  class="rep-history-stopday-date"
                  id="repHistoryStopDayDateInput"
                  type="date"
                  value="${escapeHtml(initialDate)}"
                />
              </div>
              <div class="form-field span-2">
                <label for="repHistoryStopDayInput">Godzina zakończenia</label>
                <input
                  id="repHistoryStopDayInput"
                  type="time"
                  step="60"
                />
                <div class="field-hint">Domyślnie ustawiona jak dzień rozpoczęcia pracy. Możesz ją zmienić.</div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn2" type="button" data-rep-history-stop-cancel>Anuluj</button>
            <button class="btn" type="button" data-rep-history-stop-confirm>Zakończ dzień</button>
          </div>
        </div>
      `

      const cleanup = () => {
        overlay.remove()
        document.removeEventListener('keydown', onKeyDown)
      }

      const closeWith = (isoValue) => {
        cleanup()
        resolve(String(isoValue ?? '').trim())
      }

      const dateInput = overlay.querySelector('#repHistoryStopDayDateInput')
      const input = overlay.querySelector('#repHistoryStopDayInput')
      const cancelButton = overlay.querySelector('[data-rep-history-stop-cancel]')
      const closeButton = overlay.querySelector('[data-rep-history-stop-close]')
      const confirmButton = overlay.querySelector('[data-rep-history-stop-confirm]')

      const submit = () => {
        const iso = localDateAndTimeInputToIso(dateInput?.value, input?.value)
        if (!iso) {
          alert('Podaj poprawną datę i godzinę zakończenia.')
          if (!String(dateInput?.value ?? '').trim()) {
            dateInput?.focus()
          } else {
            input?.focus()
          }
          return
        }

        closeWith(iso)
      }

      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeWith('')
          return
        }

        if (event.key === 'Enter') {
          const target = event.target
          if (target instanceof HTMLInputElement) {
            event.preventDefault()
            submit()
          }
        }
      }

      cancelButton?.addEventListener('click', () => closeWith(''))
      closeButton?.addEventListener('click', () => closeWith(''))
      confirmButton?.addEventListener('click', submit)
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          closeWith('')
        }
      })
      document.addEventListener('keydown', onKeyDown)

      document.body.appendChild(overlay)
      overlay.style.display = 'flex'
      window.setTimeout(() => {
        input?.focus()
        input?.select?.()
      }, 0)
    })
  }

  function reportEventsDefaultDates() {
    const fromInput = document.getElementById('repEventsFrom')
    const toInput = document.getElementById('repEventsTo')
    if (fromInput && !String(fromInput.value ?? '').trim()) {
      fromInput.value = firstDayOfCurrentMonthYmd()
    }
    if (toInput && !String(toInput.value ?? '').trim()) {
      toInput.value = todayYmd()
    }
  }

  function reportEventsTypeOptions() {
    return [
      { value: 'QR START', label: 'QR START' },
      { value: 'QR STOP', label: 'QR STOP' },
      { value: 'QR START + STOP', label: 'QR START + STOP' },
      { value: 'CLEAN', label: 'CLEAN' },
      { value: 'Strefa spec.', label: 'Strefa specjalna' },
      { value: 'Zlecenie ind.', label: 'Zlecenie jednorazowe' },
      { value: 'Inne QR', label: 'Inne QR' },
    ]
  }

  function reportRefreshEventsZoneOptions() {
    const clientSelect = document.getElementById('repEventsClient')
    const zoneSelect = document.getElementById('repEventsZone')
    if (!zoneSelect) {
      return
    }

    const clientId = String(clientSelect?.value ?? '').trim()
    const currentZoneId = String(zoneSelect.value ?? '').trim()
    const zones = visiblePortalZones()
      .filter((zone) => !clientId || String(zone.clientId ?? '').trim() === clientId)
      .map((zone) => ({
        value: String(zone.id ?? zone.qr ?? '').trim(),
        label: [zone.clientName, zone.zoneName, zone.location].filter((value) => String(value ?? '').trim() && value !== '-').join(' / '),
      }))
      .filter((option) => option.value)
      .sort((left, right) => left.label.localeCompare(right.label, 'pl', { numeric: true, sensitivity: 'base' }))

    reportSetSelectOptions('repEventsZone', zones, clientId ? '(wszystkie strefy klienta)' : '(wszystkie strefy)')
    zoneSelect.disabled = false
    if (currentZoneId && zones.some((option) => option.value === currentZoneId)) {
      zoneSelect.value = currentZoneId
    }
  }

  async function reportHistoryCloseWorkerDay(dayKey) {
    if (!appState.session?.orgId) {
      return
    }

    if (!canManageEvents()) {
      alert('Brak uprawnień do zakończenia dnia.')
      return
    }

    const normalizedDayKey = String(dayKey ?? '').trim()
    if (!normalizedDayKey) {
      return
    }

    const currentTab = reportHistoryNormalizeTab(appState.reportHistoryTab)
    if (currentTab !== 'workers') {
      alert('Zakończenie dnia jest dostępne tylko w zakładce Osoby.')
      return
    }

    const row = (Array.isArray(appState.reportHistoryRows) ? appState.reportHistoryRows : []).find(
      (item) => String(item?.dayKey ?? '').trim() === normalizedDayKey,
    )
    if (!row) {
      alert('Nie znaleziono dnia do zamknięcia. Odśwież historię.')
      return
    }

    const runningDetails = (Array.isArray(row.details) ? row.details : []).filter((detail) => {
      const status = String(detail?.statusLabel ?? '').trim().toUpperCase()
      return status === 'RUNNING' && detail?.sourceItem
    })
    const dayStartSource = reportHistoryDayStartCloseSource(row)
    const closeTargets = runningDetails.length
      ? runningDetails
      : dayStartSource
        ? [
            {
              sourceItem: dayStartSource,
              statusLabel: 'RUNNING',
              isDayMarkerClose: true,
            },
          ]
        : []

    if (!closeTargets.length) {
      alert('Brak otwartego dnia pracy do zamknięcia. Odśwież historię.')
      return
    }

    const workerSelect = document.getElementById('repHistoryWorker')
    const workerSearch = document.getElementById('repHistoryWorkerSearch')
    const workerLogin = String(workerSelect?.value ?? '').trim()
    const workerName = String(workerSelect?.selectedOptions?.[0]?.textContent ?? workerSearch?.value ?? '').trim() || 'pracownika'
    const dayLabel = formatDatePl(`${normalizedDayKey}T00:00:00.000Z`)
    const selectedEndIso = await reportHistoryPromptStopDateTime({
      dayKey: normalizedDayKey,
      dayLabel,
      workerName,
    })
    if (!selectedEndIso) {
      return
    }

    const selectedEndTs = new Date(selectedEndIso).getTime()
    const latestStartTs = closeTargets.reduce((maxTs, detail) => {
      const startIso = toIso(detail?.sourceItem?.startAt ?? detail?.sourceItem?.dayStartAt ?? row?.dayStartIso)
      const startTs = startIso ? new Date(startIso).getTime() : 0
      return Number.isFinite(startTs) && startTs > maxTs ? startTs : maxTs
    }, 0)
    if (Number.isFinite(selectedEndTs) && Number.isFinite(latestStartTs) && latestStartTs > 0 && selectedEndTs < latestStartTs) {
      alert('Podana godzina STOP jest wcześniejsza niż start aktywnego wpisu. Wybierz późniejszą godzinę.')
      return
    }

    appState.reportHistoryClosingDayKey = normalizedDayKey
    reportHistoryRenderTable()
    reportHistorySetStatus('Zamykanie dnia...')

    try {
      const nowIso = selectedEndIso
      let updatedCount = 0
      const closedTargets = []

      for (const detail of closeTargets) {
        const source = detail.sourceItem ?? {}
        const eventId = String(source?.eventId ?? source?.workdayId ?? source?.id ?? '').trim()
        if (!eventId) {
          continue
        }

        const sourceWorkerLogin = String(source?.workerLogin ?? source?.workerId ?? workerLogin).trim()
        if (!sourceWorkerLogin) {
          continue
        }

        const sourceWorkerName = String(source?.workerName ?? source?.name ?? workerName).trim() || workerName
        const sourceStartAt = toIso(source?.startAt ?? source?.dayStartAt ?? row?.dayStartIso) || nowIso
        const startMs = new Date(sourceStartAt).getTime()
        const nowMs = new Date(nowIso).getTime()
        const safeEndAt = Number.isFinite(startMs) && Number.isFinite(nowMs) && nowMs < startMs ? sourceStartAt : nowIso
        const endMs = new Date(safeEndAt).getTime()
        const durationSec =
          Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? Math.floor((endMs - startMs) / 1000) : 0

        const zoneId = String(source?.roomId ?? source?.utilityRoomId ?? source?.zoneId ?? '').trim()
        const clientId = String(source?.clientId ?? '').trim()

        await updateEvent(appState.session.orgId, eventId, {
          ...source,
          eventId,
          workdayId: String(source?.workdayId ?? eventId).trim() || eventId,
          workerLogin: sourceWorkerLogin,
          workerName: sourceWorkerName,
          zoneId: zoneId || null,
          roomId: zoneId || null,
          utilityRoomId: zoneId || null,
          clientId: clientId || null,
          startAt: sourceStartAt,
          endAt: safeEndAt,
          durationSec,
          status: 'CLOSED',
          closeMarkedAt: safeEndAt,
          endReason: 'WORKDAY_STOP',
          comment: String(source?.comment ?? '').trim(),
          updatedBy: appState.session?.name ?? null,
        })
        closedTargets.push({
          eventId,
          workdayId: String(source?.workdayId ?? eventId).trim() || eventId,
          sourceItem: source,
          startAt: sourceStartAt,
          endAt: safeEndAt,
          durationSec,
        })
        updatedCount += 1
      }

      if (!updatedCount) {
        throw new Error('Nie udało się zamknąć żadnego aktywnego wpisu.')
      }

      reportHistoryApplyClosedWorkerDay(normalizedDayKey, nowIso, closedTargets)
      reportHistoryRenderTable()
      await runReportHistory()
      reportHistoryApplyClosedWorkerDay(normalizedDayKey, nowIso, closedTargets)
      await fetchEventsForCurrentSession({ resetPage: false })
      await refreshDashboardWidgets({ syncWorktimeToken: true })
      showTransientNotice(
        runningDetails.length
          ? `Dzień zakończony. Zamknięto ${updatedCount} aktywne wpisy.`
          : 'Dzień pracy został zamknięty.',
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udało się zakończyć dnia.'
      alert(message)
    } finally {
      appState.reportHistoryClosingDayKey = ''
      reportHistoryRenderTable()
    }
  }

  function reportHistoryRenderTable() {
    const table = document.getElementById('repHistoryTable')
    if (!table) {
      return
    }

    appState.reportHistoryEditableMap = {}

    const tab = reportHistoryNormalizeTab(appState.reportHistoryTab)
    const rows = Array.isArray(appState.reportHistoryRows) ? appState.reportHistoryRows : []
    const isWorkersTab = tab === 'workers'
    const detailLabel = isWorkersTab ? 'Godziny dnia' : 'Szczegóły'
    const closedLabel = 'Czas pracy'
    const headHtml = `
      <thead>
        <tr>
          <th></th>
          <th>Dzień</th>
          <th class="ta-right">Wpisy</th>
          <th class="ta-right">${closedLabel}</th>
          <th class="ta-right">Otwarte</th>
          <th class="ta-right">${detailLabel}</th>
        </tr>
      </thead>
    `

    if (!rows.length) {
      table.innerHTML = `${headHtml}<tbody><tr><td colspan="6" style="text-align:center; padding:18px;">Brak danych</td></tr></tbody>`
      return
    }

    const bodyHtml = rows
      .map((row) => {
        const dayKey = String(row.dayKey ?? '').trim()
        const expanded = Boolean(appState.reportHistoryExpanded?.[dayKey])
        const actionLabel = expanded ? 'Ukryj' : 'Szczegóły'
        const dayLabel = formatDatePl(`${dayKey}T00:00:00.000Z`)
        const detailHtml = reportHistoryRenderDetails(row, tab, dayKey)
        const detailValue = isWorkersTab
          ? reportHistoryDayInfoHtml(row)
          : escapeHtml(String((row.details || []).length))

        return `
          <tr class="rep-history-main-row">
            <td><button class="btn2 rep-history-toggle" type="button" data-rep-history-toggle="${escapeHtml(dayKey)}">${actionLabel}</button></td>
            <td>${escapeHtml(dayLabel)}</td>
            <td class="ta-right">${escapeHtml(String(row.countAll ?? 0))}</td>
            <td class="ta-right">${escapeHtml(durationSecondsToHms(row.closedSec || 0))}</td>
            <td class="ta-right">${escapeHtml(String(row.runningCount ?? 0))}</td>
            <td class="${isWorkersTab ? 'rep-history-day-info-cell' : 'ta-right'}">${detailValue}</td>
          </tr>
          <tr class="rep-history-detail-row"${expanded ? '' : ' style="display:none;"'}>
            <td colspan="6">${detailHtml}</td>
          </tr>
        `
      })
      .join('')

    table.innerHTML = `${headHtml}<tbody>${bodyHtml}</tbody>`
  }

  function reportHistoryResetResults({ clearStatus = true } = {}) {
    appState.reportHistoryRows = []
    appState.reportHistoryExpanded = {}
    appState.reportHistoryEditableMap = {}
    appState.reportHistoryClosingDayKey = ''
    reportHistorySetSummaryRows([])
    reportHistoryRenderTable()

    if (clearStatus) {
      reportHistorySetStatus('')
    }
  }

  function reportHistoryResolveStatus(item) {
    const normalized = String(item?.status ?? '')
      .trim()
      .toUpperCase()

    if (normalized === 'CLOSED' || item?.endAt) {
      return 'CLOSED'
    }

    if (normalized === 'OPEN' || normalized === 'RUNNING') {
      return 'RUNNING'
    }

    return normalized || 'RUNNING'
  }

  function reportHistoryClosedDurationSec(item) {
    if (reportHistoryResolveStatus(item) !== 'CLOSED') {
      return 0
    }

    const direct = Number(item?.durationSec ?? 0)
    if (Number.isFinite(direct) && direct > 0) {
      return Math.floor(direct)
    }

    const startAt = toIso(item?.startAt)
    const endAt = toIso(item?.endAt)
    if (!startAt || !endAt) {
      return 0
    }

    const diff = Math.floor((new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000)
    return Number.isFinite(diff) && diff > 0 ? diff : 0
  }

  function reportHistoryRangeSecondsFromTimestamps(startTs, endTs) {
    const start = Number(startTs ?? 0)
    const end = Number(endTs ?? 0)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= start) {
      return 0
    }

    return Math.floor((end - start) / 1000)
  }

  function reportHistoryDurationLabel(item) {
    const status = reportHistoryResolveStatus(item)
    if (status !== 'CLOSED') {
      return 'W toku'
    }

    return durationSecondsToHms(reportHistoryClosedDurationSec(item))
  }

  function reportHistoryLocalDayKey(value) {
    const iso = toIso(value)
    if (!iso) {
      return ''
    }

    const date = new Date(iso)
    if (!Number.isFinite(date.getTime())) {
      return ''
    }

    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
  }

  function reportHistoryDayKey(item) {
    const fromStart = reportHistoryLocalDayKey(item?.startAt)
    if (fromStart) {
      return fromStart
    }

    const fromEnd = reportHistoryLocalDayKey(item?.endAt)
    if (fromEnd) {
      return fromEnd
    }

    const fromDayStart = reportHistoryLocalDayKey(item?.dayStartAt)
    if (fromDayStart) {
      return fromDayStart
    }

    const fromDayEnd = reportHistoryLocalDayKey(item?.dayEndAt)
    if (fromDayEnd) {
      return fromDayEnd
    }

    const dayKey = String(item?.dayKey ?? '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
      return dayKey
    }

    return ''
  }

  function reportHistoryToTimestamp(value) {
    const iso = toIso(value)
    if (!iso) {
      return 0
    }

    const timestamp = new Date(iso).getTime()
    return Number.isFinite(timestamp) ? timestamp : 0
  }

  function reportHistoryNormalizeQrCode(value) {
    const raw = String(value ?? '').trim()
    if (!raw || raw === '-') {
      return ''
    }

    if (/^[A-Za-z0-9-]{3,}$/.test(raw) && !raw.includes(':')) {
      return raw.toUpperCase()
    }

    const codeMatch = raw.match(/\b([A-Z]{1,6}\d{2,}[A-Z0-9-]*)\b/i)
    if (codeMatch?.[1]) {
      return codeMatch[1].toUpperCase()
    }

    return ''
  }

  function reportHistoryExtractQrFromComment(comment, phase) {
    const raw = String(comment ?? '').trim()
    if (!raw) {
      return ''
    }

    const normalizedPhase = String(phase ?? '').trim().toLowerCase() === 'start' ? 'start' : 'stop'
    const phaseRegex =
      normalizedPhase === 'start'
        ? /(START|QR\s*START|START_QR)\s*[:=-]?\s*([A-Z0-9-]{3,})/i
        : /(STOP|QR\s*STOP|STOP_QR)\s*[:=-]?\s*([A-Z0-9-]{3,})/i
    const phaseMatch = raw.match(phaseRegex)
    if (phaseMatch?.[2]) {
      return reportHistoryNormalizeQrCode(phaseMatch[2])
    }

    return ''
  }

  function reportHistoryExtractGpsCoords(source, phase) {
    const raw = String(source ?? '').trim()
    if (!raw) {
      return ''
    }

    const entries = []
    const parseGpsAttributes = (value) => {
      const attrs = {}
      const sourceText = String(value ?? '')
      const attrRegex = /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*("[^"]*"|'[^']*'|[^\s\]]+)/g
      let attrMatch = attrRegex.exec(sourceText)
      while (attrMatch) {
        const key = String(attrMatch[1] ?? '').trim().toLowerCase()
        const rawValue = String(attrMatch[2] ?? '').trim()
        attrs[key] = rawValue.replace(/^["']|["']$/g, '')
        attrMatch = attrRegex.exec(sourceText)
      }
      return attrs
    }
    const normalizeGpsEntryPhase = (label, attrs = {}) => {
      const sourceLabel = String(attrs.src ?? attrs.source ?? attrs.phase ?? '').trim().toUpperCase()
      const normalizedLabel = String(label ?? '').trim().toUpperCase()
      if (normalizedLabel.includes('START') || sourceLabel === 'START') {
        return 'start'
      }
      if (normalizedLabel.includes('STOP') || sourceLabel === 'STOP') {
        return 'stop'
      }
      return ''
    }
    const pushGpsEntry = (label, attrs = {}) => {
      const lat = String(attrs.lat ?? '').trim()
      const lon = String(attrs.lon ?? attrs.lng ?? '').trim()
      if (!lat || !lon) {
        return
      }

      const entryPhase = normalizeGpsEntryPhase(label, attrs)
      const normalizedLabel =
        String(label ?? '').trim().toUpperCase() || (entryPhase ? `${entryPhase.toUpperCase()}_GPS` : 'GPS')
      entries.push({
        label: normalizedLabel,
        phase: entryPhase,
        lat,
        lon,
      })
    }

    const bracketRegex = /\[\[\s*GPS\b([\s\S]*?)\]\]/gi
    let bracketMatch = bracketRegex.exec(raw)
    while (bracketMatch) {
      pushGpsEntry('GPS', parseGpsAttributes(bracketMatch[1]))
      bracketMatch = bracketRegex.exec(raw)
    }

    const labeledRegex = /\b(CLEAN_START_GPS|CLEAN_STOP_GPS|START_GPS|STOP_GPS)\b([^\r\n|]*)/gi
    let match = labeledRegex.exec(raw)
    while (match) {
      pushGpsEntry(match[1], parseGpsAttributes(match[2]))
      match = labeledRegex.exec(raw)
    }

    const normalizedPhase = String(phase ?? '').trim().toLowerCase() === 'start' ? 'start' : 'stop'
    const preferredLabels =
      normalizedPhase === 'start'
        ? ['START_GPS', 'CLEAN_START_GPS']
        : ['STOP_GPS', 'CLEAN_STOP_GPS']

    for (const label of preferredLabels) {
      const entry = entries.find((item) => item.label === label)
      if (entry?.lat && entry?.lon) {
        return `${entry.lat}, ${entry.lon}`
      }
    }

    const matchingPhaseEntry = entries.find((item) => item.phase === normalizedPhase && item.lat && item.lon)
    if (matchingPhaseEntry) {
      return `${matchingPhaseEntry.lat}, ${matchingPhaseEntry.lon}`
    }

    const genericEntry = entries.find((item) => !item.phase && item.lat && item.lon)
    if (genericEntry) {
      return `${genericEntry.lat}, ${genericEntry.lon}`
    }

    if (entries.length) {
      return ''
    }

    const fallbackAttrs = parseGpsAttributes(raw)
    const fallbackLat = String(fallbackAttrs.lat ?? '').trim()
    const fallbackLon = String(fallbackAttrs.lon ?? fallbackAttrs.lng ?? '').trim()
    if (fallbackLat && fallbackLon) {
      return `${fallbackLat}, ${fallbackLon}`
    }

    return ''
  }

  function reportHistoryResolveDayQrCode(item, phase) {
    const normalizedPhase = String(phase ?? '').trim().toLowerCase() === 'start' ? 'start' : 'stop'
    const directCode =
      normalizedPhase === 'start'
        ? reportHistoryNormalizeQrCode(item?.dayStartObject ?? item?.startObject)
        : reportHistoryNormalizeQrCode(item?.dayStopObject ?? item?.stopObject)
    if (directCode) {
      return directCode
    }

    const fromComment = reportHistoryExtractQrFromComment(item?.dayComment ?? item?.comment, normalizedPhase)
    if (fromComment) {
      return fromComment
    }

    const roomCode = reportHistoryNormalizeQrCode(item?.workdayUtilityRoomId)
    if (normalizedPhase === 'start' && roomCode) {
      return roomCode
    }

    const zoneCode = reportHistoryNormalizeQrCode(item?.zoneId ?? item?.utilityRoomId ?? item?.roomId)
    if (zoneCode) {
      return zoneCode
    }

    return '-'
  }

  function reportHistoryResolveDayQrCandidate(item, phase) {
    const normalizedPhase = String(phase ?? '').trim().toLowerCase() === 'start' ? 'start' : 'stop'
    const directCode =
      normalizedPhase === 'start'
        ? reportHistoryNormalizeQrCode(item?.dayStartObject ?? item?.startObject)
        : reportHistoryNormalizeQrCode(item?.dayStopObject ?? item?.stopObject)
    if (directCode) {
      return { code: directCode, score: 4 }
    }

    const fromComment = reportHistoryExtractQrFromComment(item?.dayComment ?? item?.comment, normalizedPhase)
    if (fromComment) {
      return { code: fromComment, score: 3 }
    }

    const roomCode = reportHistoryNormalizeQrCode(item?.workdayUtilityRoomId)
    if (normalizedPhase === 'start' && roomCode) {
      return { code: roomCode, score: 2 }
    }

    const zoneCode = reportHistoryNormalizeQrCode(item?.zoneId ?? item?.utilityRoomId ?? item?.roomId)
    if (zoneCode) {
      return { code: zoneCode, score: 1 }
    }

    return { code: '-', score: 0 }
  }

  function reportHistoryResolveClientByZoneCode(zoneCode, fallback = '-') {
    const code = String(zoneCode ?? '').trim().toUpperCase()
    const fallbackLabel = resolveClientLabelWithQrFallback(fallback, code)
    if (!code || code === '-') {
      return fallbackLabel
    }

    const zone = appState.zones.find((item) => String(item.id ?? item.zoneId ?? '').trim().toUpperCase() === code)
    if (!zone) {
      return fallbackLabel
    }

    const clientId = String(zone.clientId ?? '').trim()
    if (!clientId) {
      return fallbackLabel
    }

    const client = appState.clients.find((item) => String(item.id ?? item.clientId ?? '').trim() === clientId)
    const clientLabel = String(client?.name ?? clientId).trim()
    return resolveClientLabelWithQrFallback(clientLabel || fallbackLabel, code)
  }

  function reportHistoryIsSystemEntrySource(item) {
    if (!item || typeof item !== 'object') {
      return false
    }

    if (item?.historyMarkerOnly) {
      return true
    }

    const endReason = String(item?.endReason ?? '').trim().toUpperCase()
    if (endReason === 'WORKDAY_STOP' || endReason === 'STOP_END_DAY') {
      return true
    }

    const clientStatus = String(item?.clientStatus ?? '').trim().toUpperCase()
    if (clientStatus === 'SYSTEM') {
      return true
    }

    return false
  }

  function reportHistoryResolveDayGpsCoords(item, phase) {
    const normalizedPhase = String(phase ?? '').trim().toLowerCase() === 'start' ? 'start' : 'stop'
    const sources = [item?.dayGps, item?.gps, item?.dayComment, item?.comment]
    for (const source of sources) {
      const resolved = reportHistoryExtractGpsCoords(source, normalizedPhase)
      if (resolved) {
        return resolved
      }
    }

    return '-'
  }

  function reportHistoryParseGeoPair(value) {
    const raw = String(value ?? '').trim()
    if (!raw || raw === '-') {
      return null
    }

    const match = raw.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/)
    if (!match?.[1] || !match?.[2]) {
      return null
    }

    const lat = Number(match[1])
    const lon = Number(match[2])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null
    }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      return null
    }

    return {
      lat: String(Math.round(lat * 1000000) / 1000000),
      lon: String(Math.round(lon * 1000000) / 1000000),
    }
  }

  function reportHistoryGeoCellHtml(value) {
    const parsed = reportHistoryParseGeoPair(value)
    if (!parsed) {
      return escapeHtml(String(value ?? '').trim() || '-')
    }

    const label = `${parsed.lat}, ${parsed.lon}`
    return `<button class="rep-geo-link" type="button" data-rep-geo-lat="${escapeHtml(parsed.lat)}" data-rep-geo-lon="${escapeHtml(parsed.lon)}" title="Podglad satelitarny">${escapeHtml(label)}</button>`
  }

  function reportGeoMapEmbedUrl(lat, lon, zoom = 18) {
    const normalizedZoom = Math.min(Math.max(Number(zoom) || 18, 3), 21)
    const query = `${lat},${lon}`
    return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&t=k&z=${normalizedZoom}&hl=pl&output=embed`
  }

  function ensureReportGeoUi() {
    let preview = document.getElementById('repGeoPreview')
    if (!preview) {
      preview = document.createElement('div')
      preview.id = 'repGeoPreview'
      preview.className = 'rep-geo-preview'
      preview.style.display = 'none'
      preview.innerHTML = '<iframe id="repGeoPreviewFrame" title="Podglad satelitarny" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>'
      preview.addEventListener('mouseenter', () => {
        if (reportGeoPreviewHideTimer) {
          window.clearTimeout(reportGeoPreviewHideTimer)
          reportGeoPreviewHideTimer = null
        }
      })
      preview.addEventListener('mouseleave', reportGeoHidePreviewSoon)
      document.body.appendChild(preview)
    }

    let overlay = document.getElementById('repGeoOverlay')
    if (!overlay) {
      overlay = document.createElement('div')
      overlay.id = 'repGeoOverlay'
      overlay.className = 'rep-geo-overlay'
      overlay.style.display = 'none'
      overlay.innerHTML = `
        <div class="rep-geo-modal">
          <div class="rep-geo-head">
            <div class="rep-geo-title">Widok satelitarny</div>
            <div class="rep-geo-tools">
              <button id="repGeoZoomOut" class="btn2" type="button">-</button>
              <button id="repGeoZoomIn" class="btn2" type="button">+</button>
              <button id="repGeoClose" class="btn2" type="button">Zamknij</button>
            </div>
          </div>
          <div id="repGeoCoords" class="rep-geo-coords">-</div>
          <iframe id="repGeoFrame" title="Mapa satelitarna" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
        </div>
      `
      document.body.appendChild(overlay)
    }
  }

  function reportGeoReadCoordsFromNode(node) {
    const lat = String(node?.getAttribute('data-rep-geo-lat') ?? '').trim()
    const lon = String(node?.getAttribute('data-rep-geo-lon') ?? '').trim()
    const parsed = reportHistoryParseGeoPair(`${lat},${lon}`)
    return parsed
  }

  function reportGeoHidePreview() {
    if (reportGeoPreviewHideTimer) {
      window.clearTimeout(reportGeoPreviewHideTimer)
      reportGeoPreviewHideTimer = null
    }

    const preview = document.getElementById('repGeoPreview')
    if (!preview) {
      return
    }

    preview.style.display = 'none'
  }

  function reportGeoHidePreviewSoon() {
    if (reportGeoPreviewHideTimer) {
      window.clearTimeout(reportGeoPreviewHideTimer)
    }

    reportGeoPreviewHideTimer = window.setTimeout(() => {
      reportGeoHidePreview()
    }, 120)
  }

  function reportGeoShowPreview(anchorNode, lat, lon) {
    ensureReportGeoUi()
    if (reportGeoPreviewHideTimer) {
      window.clearTimeout(reportGeoPreviewHideTimer)
      reportGeoPreviewHideTimer = null
    }

    const preview = document.getElementById('repGeoPreview')
    const frame = document.getElementById('repGeoPreviewFrame')
    if (!preview || !frame || !anchorNode) {
      return
    }

    const src = reportGeoMapEmbedUrl(lat, lon, 18)
    if (frame.getAttribute('src') !== src) {
      frame.setAttribute('src', src)
    }

    const rect = anchorNode.getBoundingClientRect()
    const margin = 10
    const width = 320
    const height = 220
    let left = window.scrollX + rect.left
    let top = window.scrollY + rect.bottom + 8
    if (window.innerHeight - rect.bottom < height + 20) {
      top = window.scrollY + rect.top - height - 8
    }
    left = Math.max(window.scrollX + margin, Math.min(left, window.scrollX + window.innerWidth - width - margin))
    top = Math.max(window.scrollY + margin, top)

    preview.style.left = `${left}px`
    preview.style.top = `${top}px`
    preview.style.display = 'block'
  }

  function reportGeoRenderModal() {
    const overlay = document.getElementById('repGeoOverlay')
    const coords = document.getElementById('repGeoCoords')
    const frame = document.getElementById('repGeoFrame')
    if (!overlay || !coords || !frame) {
      return
    }

    const lat = String(reportGeoModalState.lat ?? '').trim()
    const lon = String(reportGeoModalState.lon ?? '').trim()
    if (!lat || !lon) {
      return
    }

    coords.textContent = `${lat}, ${lon} · zoom ${reportGeoModalState.zoom}`
    const src = reportGeoMapEmbedUrl(lat, lon, reportGeoModalState.zoom)
    if (frame.getAttribute('src') !== src) {
      frame.setAttribute('src', src)
    }
  }

  function reportGeoOpenModal(lat, lon) {
    ensureReportGeoUi()
    reportGeoHidePreview()

    reportGeoModalState.lat = String(lat ?? '').trim()
    reportGeoModalState.lon = String(lon ?? '').trim()
    reportGeoModalState.zoom = 18
    reportGeoRenderModal()

    const overlay = document.getElementById('repGeoOverlay')
    if (overlay) {
      overlay.style.display = 'flex'
    }
  }

  function reportGeoChangeZoom(step) {
    const delta = Number(step) || 0
    if (!delta) {
      return
    }

    reportGeoModalState.zoom = Math.min(Math.max((Number(reportGeoModalState.zoom) || 18) + delta, 3), 21)
    reportGeoRenderModal()
  }

  function reportGeoCloseModal() {
    const overlay = document.getElementById('repGeoOverlay')
    if (overlay) {
      overlay.style.display = 'none'
    }
  }

  function reportHistoryDetailSortKey(detail) {
    return [
      detail?.clientLabel || '',
      detail?.zoneLabel || '',
      detail?.locationLabel || '',
      detail?.workerLabel || '',
      detail?.statusLabel || '',
    ].join('|')
  }

  function reportHistoryCompareDetailsByEndToStart(left, right) {
    const leftEnd = Number(left?.sortEndTs ?? 0)
    const rightEnd = Number(right?.sortEndTs ?? 0)
    if (rightEnd !== leftEnd) {
      return rightEnd - leftEnd
    }

    const leftStart = Number(left?.sortStartTs ?? 0)
    const rightStart = Number(right?.sortStartTs ?? 0)
    if (rightStart !== leftStart) {
      return rightStart - leftStart
    }

    return reportHistoryDetailSortKey(left).localeCompare(reportHistoryDetailSortKey(right), 'pl', {
      sensitivity: 'base',
    })
  }

  function reportHistoryBuildRows(items, tab) {
    const normalizedTab = reportHistoryNormalizeTab(tab)
    const groups = new Map()

    items.forEach((item) => {
      const dayKey = reportHistoryDayKey(item)
      if (!dayKey) {
        return
      }

      if (!groups.has(dayKey)) {
        groups.set(dayKey, {
          dayKey,
          countAll: 0,
          runningCount: 0,
          closedSec: 0,
          dayStartIso: '',
          dayEndIso: '',
          dayStartTs: 0,
          dayEndTs: 0,
          latestRunningStartTs: 0,
          dayStartClientLabel: '-',
          dayEndClientLabel: '-',
          dayStartZoneCode: '-',
          dayEndZoneCode: '-',
          dayStartGeoLabel: '-',
          dayEndGeoLabel: '-',
          dayStartQrScore: 0,
          dayEndQrScore: 0,
          dayStartEventTs: 0,
          dayEndEventTs: 0,
          dayStartIsBoundary: false,
          dayEndIsBoundary: false,
          dayStartSourceItem: null,
          dayEndSourceItem: null,
          closedIntervals: [],
          details: [],
        })
      }

      const bucket = groups.get(dayKey)
      const status = reportHistoryResolveStatus(item)
      const closedSec = reportHistoryClosedDurationSec(item)
      const isMarkerOnly = item?.historyMarkerOnly
      const startIso = toIso(item?.startAt)
      const endIso = toIso(item?.endAt)
      const sortStartTs = reportHistoryToTimestamp(startIso)
      const sortEndTs = reportHistoryToTimestamp(endIso) || sortStartTs
      const dayStartIso = toIso(item?.dayStartAt) || startIso || endIso
      const dayEndIso = toIso(item?.dayEndAt) || endIso
      const dayStartTs = reportHistoryToTimestamp(dayStartIso)
      const dayEndTs = reportHistoryToTimestamp(dayEndIso)
      const hasExplicitDayStart = Boolean(toIso(item?.dayStartAt)) || Boolean(isMarkerOnly && dayStartIso)
      const hasExplicitDayEnd = Boolean(toIso(item?.dayEndAt)) || reportHistoryIsDayStopSource(item)
      const clientQrCandidate =
        item?.zoneId ??
        item?.utilityRoomId ??
        item?.roomId ??
        reportHistoryResolveDayQrCode(item, 'start') ??
        reportHistoryResolveDayQrCode(item, 'stop')
      const clientLabel = resolveClientLabelWithQrFallback(String(item.clientName ?? item.klient ?? '-').trim() || '-', clientQrCandidate)
      const qrStartCandidate = reportHistoryResolveDayQrCandidate(item, 'start')
      const qrStopCandidate = reportHistoryResolveDayQrCandidate(item, 'stop')
      const qrStartZoneCode = qrStartCandidate.code
      const qrStopZoneCode = qrStopCandidate.code
      const qrStartClientLabel = reportHistoryResolveClientByZoneCode(qrStartZoneCode, clientLabel)
      const qrStopClientLabel = reportHistoryResolveClientByZoneCode(qrStopZoneCode, clientLabel)
      const qrStartGeoLabel = reportHistoryResolveDayGpsCoords(item, 'start')
      const qrStopGeoLabel = reportHistoryResolveDayGpsCoords(item, 'stop')

      if (!isMarkerOnly) {
        bucket.countAll += 1
        bucket.closedSec += closedSec
        if (normalizedTab === 'workers') {
          const closedInterval = workStatusIntervalFromTimes(startIso, endIso, closedSec)
          if (closedInterval) {
            bucket.closedIntervals.push(closedInterval)
          }
        }
        if (status === 'RUNNING') {
          bucket.runningCount += 1
          if (sortStartTs > bucket.latestRunningStartTs) {
            bucket.latestRunningStartTs = sortStartTs
          }
        }
      }
      const shouldReplaceDayStart =
        dayStartTs &&
        (!bucket.dayStartTs ||
          (normalizedTab === 'workers' && hasExplicitDayStart && !bucket.dayStartIsBoundary) ||
          (!(normalizedTab === 'workers' && bucket.dayStartIsBoundary && !hasExplicitDayStart) &&
            dayStartTs < bucket.dayStartTs))
      if (shouldReplaceDayStart) {
        bucket.dayStartTs = dayStartTs
        bucket.dayStartIso = dayStartIso
        bucket.dayStartClientLabel = qrStartClientLabel
        bucket.dayStartZoneCode = qrStartZoneCode
        bucket.dayStartGeoLabel = qrStartGeoLabel
        bucket.dayStartQrScore = qrStartCandidate.score
        bucket.dayStartEventTs = sortStartTs
        bucket.dayStartIsBoundary = hasExplicitDayStart
        bucket.dayStartSourceItem = item
      } else if (dayStartTs && dayStartTs === bucket.dayStartTs) {
        const replaceByBoundary = hasExplicitDayStart && !bucket.dayStartIsBoundary
        const replaceByScore = qrStartCandidate.score > Number(bucket.dayStartQrScore ?? 0)
        const replaceByEventTs =
          qrStartCandidate.score === Number(bucket.dayStartQrScore ?? 0) &&
          sortStartTs > 0 &&
          (Number(bucket.dayStartEventTs ?? 0) <= 0 || sortStartTs < Number(bucket.dayStartEventTs ?? 0))
        const replaceByMissing = (bucket.dayStartZoneCode === '-' || !bucket.dayStartZoneCode) && qrStartZoneCode !== '-'
        if (replaceByBoundary || replaceByScore || replaceByEventTs || replaceByMissing) {
          bucket.dayStartZoneCode = qrStartZoneCode
          bucket.dayStartClientLabel = qrStartClientLabel
          bucket.dayStartQrScore = qrStartCandidate.score
          bucket.dayStartEventTs = sortStartTs
          bucket.dayStartIsBoundary = hasExplicitDayStart || bucket.dayStartIsBoundary
          bucket.dayStartSourceItem = item
        }
        if ((bucket.dayStartGeoLabel === '-' || !bucket.dayStartGeoLabel) && qrStartGeoLabel !== '-') {
          bucket.dayStartGeoLabel = qrStartGeoLabel
        }
      }
      const shouldReplaceDayEnd =
        dayEndTs &&
        (!bucket.dayEndTs ||
          (normalizedTab === 'workers' && hasExplicitDayEnd && !bucket.dayEndIsBoundary) ||
          (!(normalizedTab === 'workers' && bucket.dayEndIsBoundary && !hasExplicitDayEnd) && dayEndTs > bucket.dayEndTs))
      if (shouldReplaceDayEnd) {
        bucket.dayEndTs = dayEndTs
        bucket.dayEndIso = dayEndIso
        bucket.dayEndClientLabel = qrStopClientLabel
        bucket.dayEndZoneCode = qrStopZoneCode
        bucket.dayEndGeoLabel = qrStopGeoLabel
        bucket.dayEndQrScore = qrStopCandidate.score
        bucket.dayEndEventTs = sortEndTs
        bucket.dayEndIsBoundary = hasExplicitDayEnd
        bucket.dayEndSourceItem = item
      } else if (dayEndTs && dayEndTs === bucket.dayEndTs) {
        const replaceByBoundary = hasExplicitDayEnd && !bucket.dayEndIsBoundary
        const replaceByScore = qrStopCandidate.score > Number(bucket.dayEndQrScore ?? 0)
        const replaceByEventTs =
          qrStopCandidate.score === Number(bucket.dayEndQrScore ?? 0) &&
          sortEndTs > 0 &&
          (Number(bucket.dayEndEventTs ?? 0) <= 0 || sortEndTs > Number(bucket.dayEndEventTs ?? 0))
        const replaceByMissing = (bucket.dayEndZoneCode === '-' || !bucket.dayEndZoneCode) && qrStopZoneCode !== '-'
        if (replaceByBoundary || replaceByScore || replaceByEventTs || replaceByMissing) {
          bucket.dayEndZoneCode = qrStopZoneCode
          bucket.dayEndClientLabel = qrStopClientLabel
          bucket.dayEndQrScore = qrStopCandidate.score
          bucket.dayEndEventTs = sortEndTs
          bucket.dayEndIsBoundary = hasExplicitDayEnd || bucket.dayEndIsBoundary
          bucket.dayEndSourceItem = item
        }
        if ((bucket.dayEndGeoLabel === '-' || !bucket.dayEndGeoLabel) && qrStopGeoLabel !== '-') {
          bucket.dayEndGeoLabel = qrStopGeoLabel
        }
      }

      if (isMarkerOnly) {
        return
      }

      if (normalizedTab === 'workers') {
        bucket.details.push({
          clientLabel,
          zoneLabel: String(item.zoneName ?? item.strefa ?? '-').trim() || '-',
          locationLabel: String(item.lokalizacja ?? item.location ?? '-').trim() || '-',
          startLabel: formatTime(startIso),
          stopLabel: status === 'RUNNING' ? '-' : formatTime(endIso),
          durationLabel: reportHistoryDurationLabel(item),
          statusLabel: status,
          sortStartTs,
          sortEndTs,
          sourceItem: item,
        })
        return
      }

      bucket.details.push({
        clientLabel,
        zoneLabel: String(item.zoneName ?? item.strefa ?? '-').trim() || '-',
        locationLabel: String(item.lokalizacja ?? item.location ?? '-').trim() || '-',
        workerLabel: String(item.workerName ?? item.workerLogin ?? '-').trim() || '-',
        startLabel: formatTime(startIso),
        stopLabel: status === 'RUNNING' ? '-' : formatTime(endIso),
        durationLabel: reportHistoryDurationLabel(item),
        statusLabel: status,
        sortStartTs,
        sortEndTs,
        sourceItem: item,
      })
    })

    return [...groups.values()]
      .map((bucket) => {
        const hasRunning = Number(bucket.runningCount ?? 0) > 0
        const todayKey = todayYmd()
        const isTodayBucket = String(bucket.dayKey ?? '').trim() === todayKey
        const detailedClosedSec = Math.max(0, Number(bucket.closedSec ?? 0))
        const uniqueClosedSec =
          normalizedTab === 'workers' && Array.isArray(bucket.closedIntervals) && bucket.closedIntervals.length
            ? workStatusIntervalsTotalSeconds(bucket.closedIntervals)
            : 0
        const activeRunningSec =
          hasRunning &&
          isTodayBucket &&
          Number(bucket.latestRunningStartTs ?? 0) > 0 &&
          Number(bucket.latestRunningStartTs ?? 0) > Number(bucket.dayEndTs ?? 0)
            ? Math.max(0, Math.floor((Date.now() - Number(bucket.latestRunningStartTs ?? 0)) / 1000))
            : 0
        const daySpanSec =
          normalizedTab === 'workers' && bucket.dayStartIsBoundary && bucket.dayEndIsBoundary
            ? reportHistoryRangeSecondsFromTimestamps(bucket.dayStartTs, bucket.dayEndTs)
            : 0
        const activeDaySpanSec =
          normalizedTab === 'workers' &&
          bucket.dayStartIsBoundary &&
          !bucket.dayEndIsBoundary &&
          isTodayBucket &&
          Number(bucket.dayStartTs ?? 0) > 0
            ? Math.max(0, Math.floor((Date.now() - Number(bucket.dayStartTs ?? 0)) / 1000))
            : 0
        let totalWorkSec = detailedClosedSec
        if (normalizedTab === 'workers') {
          const closedBaseSec = uniqueClosedSec || daySpanSec || detailedClosedSec
          totalWorkSec = closedBaseSec > 0 ? closedBaseSec + activeRunningSec : activeDaySpanSec || activeRunningSec
        }
        return {
          ...bucket,
          closedSec: normalizedTab === 'workers' ? totalWorkSec : bucket.closedSec,
          qrStartLabel: formatTime(bucket.dayStartIso),
          qrStopLabel: formatTime(bucket.dayEndIso),
          qrStartClientLabel: bucket.dayStartClientLabel || '-',
          qrStopClientLabel: bucket.dayEndClientLabel || '-',
          qrStartZoneCode: bucket.dayStartZoneCode || '-',
          qrStopZoneCode: bucket.dayEndZoneCode || '-',
          qrStartGeoLabel: bucket.dayStartGeoLabel || '-',
          qrStopGeoLabel: bucket.dayEndGeoLabel || '-',
          qrStartSourceItem: bucket.dayStartSourceItem || null,
          qrStopSourceItem: bucket.dayEndSourceItem || null,
          details: [...bucket.details].sort(reportHistoryCompareDetailsByEndToStart),
        }
      })
      .sort((left, right) => (left.dayKey < right.dayKey ? 1 : -1))
  }

  function reportHistoryReadFilters() {
    return {
      tab: reportHistoryNormalizeTab(appState.reportHistoryTab),
      clientId: String(document.getElementById('repHistoryClient')?.value ?? '').trim(),
      workerLogin: String(document.getElementById('repHistoryWorker')?.value ?? '').trim(),
      zoneId: String(document.getElementById('repHistoryZone')?.value ?? '').trim(),
      from: String(document.getElementById('repHistoryFrom')?.value ?? '').trim(),
      to: String(document.getElementById('repHistoryTo')?.value ?? '').trim(),
    }
  }

  async function runReportHistory() {
    if (!appState.session?.orgId) {
      return
    }

    const scopedFilter = reportHistoryScopedFilter
    reportHistoryScopedFilter = null

    const filters = reportHistoryReadFilters()
    if (!filters.from || !filters.to) {
      reportHistorySetStatus('Ustaw zakres dat od-do.', true)
      return
    }

    if (filters.from > filters.to) {
      reportHistorySetStatus('Data "od" nie moze byc wieksza niz "do".', true)
      return
    }

    if (filters.tab === 'objects' && !filters.clientId) {
      reportHistorySetStatus('Wybierz obiekt (klienta).', true)
      return
    }

    if (filters.tab === 'workers' && !filters.workerLogin) {
      reportHistorySetStatus('Wybierz osobe.', true)
      return
    }

    if (filters.tab === 'zones' && !filters.zoneId) {
      reportHistorySetStatus('Wybierz strefe.', true)
      return
    }

    reportHistoryResetResults({ clearStatus: false })
    reportHistorySetStatus('Ładowanie historii...')
    reportHistorySetLoading(true)

    try {
      const fetchFilters = {
        source: 'events',
        fromIso: ymdToIsoRangeStart(filters.from),
        toIso: ymdToIsoRangeEnd(filters.to),
      }
      if (filters.tab === 'workers' && filters.workerLogin) {
        fetchFilters.workerLogin = filters.workerLogin
      }

      const items = await reportFetchEventsPaged(appState.session.orgId, {
        ...fetchFilters,
      })

      let filtered = items
      if (filters.tab === 'objects') {
        filtered = items.filter((item) =>
          reportMatchesPanelSelection(item, { clientId: filters.clientId, zoneId: '', workerLogin: '' }),
        )
      } else if (filters.tab === 'workers') {
        const filteredEvents = items.filter(
          (item) =>
            reportIsWorkerHistoryDetailItem(item) &&
            reportMatchesPanelSelection(item, { clientId: '', zoneId: '', workerLogin: filters.workerLogin }),
        )

        let markerRows = []
        try {
          const workerDayItems = await reportFetchEventsPaged(appState.session.orgId, {
            source: 'workdays',
            workerLogin: filters.workerLogin,
            fromIso: ymdToIsoRangeStart(filters.from),
            toIso: ymdToIsoRangeEnd(filters.to),
          })

          markerRows = workerDayItems
            .filter((item) =>
              reportMatchesPanelSelection(item, { clientId: '', zoneId: '', workerLogin: filters.workerLogin }),
            )
            .map((item) => ({
              ...item,
              historyMarkerOnly: true,
              dayStartAt: toIso(item?.dayStartAt ?? item?.startAt),
              dayEndAt: toIso(item?.dayEndAt ?? item?.endAt),
            }))
        } catch {
          markerRows = []
        }

        filtered = markerRows.length ? [...filteredEvents, ...markerRows] : filteredEvents
      } else if (filters.tab === 'zones') {
        filtered = items.filter((item) =>
          reportMatchesPanelSelection(item, { clientId: '', zoneId: filters.zoneId, workerLogin: '' }),
        )
      }

      if (scopedFilter && (scopedFilter.zoneId || scopedFilter.workerLogin)) {
        const scopedZoneCode = reportHistoryNormalizeQrCode(scopedFilter.zoneId)
        const scopedWorkerLogin = String(scopedFilter.workerLogin ?? '').trim()
        filtered = filtered.filter((item) => {
          if (scopedZoneCode) {
            const itemZoneCode = reportHistoryNormalizeQrCode(item?.zoneId ?? item?.utilityRoomId ?? item?.roomId)
            if (!itemZoneCode || itemZoneCode !== scopedZoneCode) {
              return false
            }
          }
          if (scopedWorkerLogin && !reportMatchesWorkerSelection(item, scopedWorkerLogin)) {
            return false
          }
          return true
        })
      }

      appState.reportHistoryRows = reportHistoryBuildRows(filtered, filters.tab)
      appState.reportHistoryExpanded = {}
      appState.reportHistoryEditableMap = {}
      reportHistorySetSummaryRows(appState.reportHistoryRows)
      reportHistoryRenderTable()

      if (!appState.reportHistoryRows.length) {
        reportHistorySetStatus('Brak danych dla wybranych filtrow.')
        return
      }

      const rowsCount = appState.reportHistoryRows.length
      const eventsCount = appState.reportHistoryRows.reduce((sum, row) => sum + Number(row.countAll ?? 0), 0)
      reportHistorySetStatus(`Historia gotowa. Dni: ${rowsCount} · wpisy: ${eventsCount}.`)
    } catch (error) {
      reportHistorySetStatus(error instanceof Error ? error.message : 'Blad pobierania historii.', true)
    } finally {
      reportHistorySetLoading(false)
    }
  }

  function reportHistoryPanelIsVisible() {
    const panel = document.getElementById('repHistory')
    return panel instanceof HTMLElement && panel.style.display !== 'none'
  }

  async function reportHistoryRefreshAfterEventSave(updatedItem = null) {
    if (!reportHistoryPanelIsVisible()) {
      return
    }

    const previousExpanded = { ...(appState.reportHistoryExpanded || {}) }
    const updatedDayKey = reportHistoryDayKey(updatedItem || {})
    await runReportHistory()

    const availableDayKeys = new Set((Array.isArray(appState.reportHistoryRows) ? appState.reportHistoryRows : []).map((row) => String(row.dayKey ?? '').trim()))
    const nextExpanded = {}
    Object.entries(previousExpanded).forEach(([dayKey, expanded]) => {
      if (expanded && availableDayKeys.has(dayKey)) {
        nextExpanded[dayKey] = true
      }
    })
    if (updatedDayKey && availableDayKeys.has(updatedDayKey)) {
      nextExpanded[updatedDayKey] = true
    }

    appState.reportHistoryExpanded = nextExpanded
    reportHistoryRenderTable()
  }

  function reportHistoryFindWorkerOption(workerLogin, workerName) {
    const normalizedLogin = String(workerLogin ?? '').trim()
    const normalizedName = String(workerName ?? '').trim()

    if (!Array.isArray(appState.reportHistoryWorkerOptions) || !appState.reportHistoryWorkerOptions.length) {
      return null
    }

    if (normalizedLogin) {
      const byLogin = appState.reportHistoryWorkerOptions.find((option) => String(option.value ?? '').trim() === normalizedLogin)
      if (byLogin) {
        return byLogin
      }
    }

    const normalizedNameKey = normalizeSearchText(normalizedName)
    if (normalizedNameKey) {
      const exact = appState.reportHistoryWorkerOptions.find((option) => {
        const aliases = [
          option.label,
          option.originalLabel,
          dashboardWorkerSurnameDisplayName(option.originalLabel),
        ].map((value) => normalizeSearchText(value))
        return aliases.some((value) => value === normalizedNameKey)
      })
      if (exact) {
        return exact
      }

      const partial = appState.reportHistoryWorkerOptions.find((option) =>
        normalizeSearchText([option.label, option.originalLabel, option.searchLabel].join(' ')).includes(normalizedNameKey),
      )
      if (partial) {
        return partial
      }
    }

    const loginLocalPart = normalizedLogin ? normalizeSearchText(normalizedLogin.split('@')[0]) : ''
    if (loginLocalPart) {
      return (
        appState.reportHistoryWorkerOptions.find((option) =>
          normalizeSearchText([option.label, option.originalLabel, option.searchLabel].join(' ')).includes(loginLocalPart),
        ) ?? null
      )
    }

    return null
  }

  function reportHistorySelectWorker(workerLogin, workerName) {
    const selectNode = document.getElementById('repHistoryWorker')
    const searchNode = document.getElementById('repHistoryWorkerSearch')
    if (!(selectNode instanceof HTMLSelectElement) || !(searchNode instanceof HTMLInputElement)) {
      return false
    }

    const option = reportHistoryFindWorkerOption(workerLogin, workerName)
    if (!option) {
      return false
    }

    ensureSelectValue(selectNode, option.value, option.label)
    searchNode.value = String(option.label ?? '').trim()
    reportHistoryApplySelectFilter('worker', { expandOnEmpty: false })
    reportHistoryCollapseSelect('worker')
    return true
  }

  function reportHistoryFindClientOption(clientId, clientName) {
    const normalizedId = String(clientId ?? '').trim()
    const normalizedName = normalizeSearchText(clientName)
    if (!Array.isArray(appState.reportHistoryClientOptions) || !appState.reportHistoryClientOptions.length) {
      return null
    }

    if (normalizedId) {
      const byId = appState.reportHistoryClientOptions.find((option) => String(option.value ?? '').trim() === normalizedId)
      if (byId) {
        return byId
      }
    }

    if (normalizedName) {
      const exact = appState.reportHistoryClientOptions.find((option) => normalizeSearchText(option.label) === normalizedName)
      if (exact) {
        return exact
      }

      const partial = appState.reportHistoryClientOptions.find((option) => normalizeSearchText(option.label).includes(normalizedName))
      if (partial) {
        return partial
      }
    }

    return null
  }

  function reportHistorySelectClient(clientId, clientName) {
    const selectNode = document.getElementById('repHistoryClient')
    const searchNode = document.getElementById('repHistoryClientSearch')
    if (!(selectNode instanceof HTMLSelectElement) || !(searchNode instanceof HTMLInputElement)) {
      return false
    }

    const option = reportHistoryFindClientOption(clientId, clientName)
    if (!option) {
      return false
    }

    ensureSelectValue(selectNode, option.value, option.label)
    searchNode.value = String(option.label ?? '').trim()
    reportHistoryApplySelectFilter('client', { expandOnEmpty: false })
    reportHistoryCollapseSelect('client')
    return true
  }

  function reportHistoryFindZoneOption(zoneId, zoneName, options = {}) {
    const strictId = Boolean(options?.strictId)
    const normalizedId = String(zoneId ?? '').trim()
    const normalizedName = normalizeSearchText(zoneName)
    if (!Array.isArray(appState.reportHistoryZoneOptions) || !appState.reportHistoryZoneOptions.length) {
      return null
    }

    if (normalizedId) {
      const byId = appState.reportHistoryZoneOptions.find((option) => String(option.value ?? '').trim() === normalizedId)
      if (byId) {
        return byId
      }
      if (strictId) {
        return null
      }
    }

    if (normalizedName) {
      const exact = appState.reportHistoryZoneOptions.find((option) => normalizeSearchText(option.label) === normalizedName)
      if (exact) {
        return exact
      }

      const partial = appState.reportHistoryZoneOptions.find((option) => normalizeSearchText(option.label).includes(normalizedName))
      if (partial) {
        return partial
      }
    }

    return null
  }

  function reportHistorySelectZone(zoneId, zoneName, options = {}) {
    const selectNode = document.getElementById('repHistoryZone')
    const searchNode = document.getElementById('repHistoryZoneSearch')
    if (!(selectNode instanceof HTMLSelectElement) || !(searchNode instanceof HTMLInputElement)) {
      return false
    }

    const normalizedZoneId = String(zoneId ?? '').trim()
    const strictId = Boolean(options?.strictId)
    const option = reportHistoryFindZoneOption(zoneId, zoneName, { strictId })
    if (!option && strictId && normalizedZoneId) {
      ensureSelectValue(selectNode, normalizedZoneId, normalizedZoneId)
      searchNode.value = String(zoneName ?? normalizedZoneId).trim() || normalizedZoneId
      reportHistoryApplySelectFilter('zone', { expandOnEmpty: false })
      reportHistoryCollapseSelect('zone')
      return true
    }
    if (!option) {
      return false
    }

    ensureSelectValue(selectNode, option.value, option.label)
    searchNode.value = String(option.label ?? '').trim()
    reportHistoryApplySelectFilter('zone', { expandOnEmpty: false })
    reportHistoryCollapseSelect('zone')
    return true
  }

  function eventHistoryDayKey(row) {
    const fromRow = String(row?.dayKey ?? '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(fromRow)) {
      return fromRow
    }

    const fromStart = toIso(row?.startAt)
    if (fromStart) {
      return fromStart.slice(0, 10)
    }

    const fromEnd = toIso(row?.endAt)
    if (fromEnd) {
      return fromEnd.slice(0, 10)
    }

    return todayYmd()
  }

  function eventHistoryMonthRange(dayKey) {
    const match = String(dayKey ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (!match) {
      const today = todayYmd()
      return { day: today, from: firstDayOfCurrentMonthYmd(), to: today }
    }

    const year = Number(match[1])
    const month = Number(match[2])
    const lastDay = new Date(year, month, 0).getDate()
    return {
      day: `${match[1]}-${match[2]}-${match[3]}`,
      from: `${match[1]}-${match[2]}-01`,
      to: `${match[1]}-${match[2]}-${pad2(lastDay)}`,
    }
  }

  async function openEventHistoryFromRow(row, tab, options = {}) {
    if (!appState.session?.orgId) {
      return false
    }

    const go = typeof window.go === 'function' ? window.go : null
    if (!go) {
      return false
    }

    const normalizedTab = reportHistoryNormalizeTab(tab)
    const range = eventHistoryMonthRange(eventHistoryDayKey(row))
    const strictZoneId = Boolean(options?.strictZoneId)
    const scopeFilter = options?.scopeFilter && typeof options.scopeFilter === 'object' ? options.scopeFilter : null
    reportHistoryScopedFilter = scopeFilter

    go('reports')
    await ensureReportsViewReady()
    openReportBuilder(reportHistoryKindForTab(normalizedTab))
    reportHistorySetTab(normalizedTab)

    const fromInput = document.getElementById('repHistoryFrom')
    const toInput = document.getElementById('repHistoryTo')
    if (fromInput instanceof HTMLInputElement) {
      fromInput.value = range.from
    }
    if (toInput instanceof HTMLInputElement) {
      toInput.value = range.to
    }

    let selected = false
    if (normalizedTab === 'workers') {
      selected = reportHistorySelectWorker(row?.workerLogin, row?.workerName)
    } else if (normalizedTab === 'zones') {
      const zoneIdCandidate = String(row?.zoneId ?? row?.roomId ?? row?.utilityRoomId ?? '').trim()
      selected = reportHistorySelectZone(zoneIdCandidate, row?.strefa ?? row?.zoneName, {
        strictId: strictZoneId || Boolean(reportHistoryNormalizeQrCode(zoneIdCandidate)),
      })
    } else {
      selected = reportHistorySelectClient(row?.clientId, row?.klient ?? row?.clientName)
    }

    if (!selected) {
      reportHistoryScopedFilter = null
      reportHistorySetStatus('Nie znaleziono rekordu na liscie historii.', true)
      return false
    }

    await runReportHistory()
    const focusedDay = String(range.day ?? '').trim()
    const dayRow = appState.reportHistoryRows.find((item) => String(item.dayKey ?? '').trim() === focusedDay)
    if (dayRow?.dayKey) {
      appState.reportHistoryExpanded = { [dayRow.dayKey]: true }
      reportHistoryRenderTable()
    }
    return true
  }

  async function openDashboardEntityHistory(row, sourceKind = 'zones') {
    const prepared = dashboardBuildHistoryRow(row, todayYmd())
    const zoneLabel = dashboardResolveZoneLabel(row)
    const zoneId = String(prepared.zoneId ?? prepared.roomId ?? prepared.utilityRoomId ?? '').trim()
    const hasZone = Boolean(zoneId || (zoneLabel && zoneLabel !== '-'))

    if (hasZone) {
      prepared.strefa = zoneLabel && zoneLabel !== '-' ? zoneLabel : zoneId
      prepared.zoneName = zoneLabel && zoneLabel !== '-' ? zoneLabel : zoneId
      const openedZone = await openEventHistoryFromRow(prepared, 'zones', {
        strictZoneId: Boolean(reportHistoryNormalizeQrCode(zoneId)),
        scopeFilter:
          sourceKind === 'zones'
            ? {
                zoneId,
                workerLogin: String(prepared.workerLogin ?? '').trim(),
              }
            : null,
      })
      if (openedZone) {
        return
      }
    }

    if (sourceKind === 'objects') {
      await openEventHistoryFromRow(prepared, 'objects')
      return
    }

    await openEventHistoryFromRow(prepared, 'workers')
  }

  async function openDashboardWorkerHistory(workerLogin, workerName) {
    if (!appState.session?.orgId) {
      return
    }

    const go = typeof window.go === 'function' ? window.go : null
    if (!go) {
      return
    }

    go('reports')
    await ensureReportsViewReady()
    openReportBuilder('workerTime')
    reportHistorySetTab('workers')

    const today = todayYmd()
    const fromInput = document.getElementById('repHistoryFrom')
    const toInput = document.getElementById('repHistoryTo')
    if (fromInput instanceof HTMLInputElement) {
      fromInput.value = today
    }
    if (toInput instanceof HTMLInputElement) {
      toInput.value = today
    }

    const selected = reportHistorySelectWorker(workerLogin, workerName)
    if (!selected) {
      const label = String(workerName ?? workerLogin ?? '').trim() || 'wybrana osoba'
      reportHistorySetStatus(`Nie znaleziono osoby "${label}" na liscie historii.`, true)
      return
    }

    await runReportHistory()
    const todayRow = appState.reportHistoryRows.find((row) => String(row.dayKey ?? '').trim() === today)
    if (todayRow?.dayKey) {
      appState.reportHistoryExpanded = { [todayRow.dayKey]: true }
      reportHistoryRenderTable()
    }
  }

  function reportHistoryToggle(dayKey) {
    const key = String(dayKey ?? '').trim()
    if (!key) {
      return
    }

    appState.reportHistoryExpanded = {
      ...appState.reportHistoryExpanded,
      [key]: !appState.reportHistoryExpanded?.[key],
    }
    reportHistoryRenderTable()
  }

  function openReportBuilder(kind) {
    const title = document.getElementById('repTitle')
    const subtitle = document.getElementById('repSubtitle')
    const historyConfig = reportHistoryBuilderConfig(kind)
    reportSetVisible('repHome', false)
    reportSetVisible('repBuilder', true)
    reportResetResults()

    if (historyConfig) {
      if (title) title.textContent = historyConfig.title
      if (subtitle) subtitle.textContent = historyConfig.subtitle
      reportSetVisible('repEvents', false)
      reportSetVisible('repHistory', true)
      reportSetVisible('repSoon', false)
      reportHistorySetTabsVisible(historyConfig.showTabs)
      reportHistoryApplyAllSelectFilters()
      reportHistorySetTab(historyConfig.tab)
      reportHistoryApplyRangeMode(reportHistoryReadRangeMode(), { force: false })
      reportHistoryResetResults({ clearStatus: false })
      reportHistorySetStatus(historyConfig.status)
      return
    }

    if (kind === 'eventsOperational') {
      if (title) title.textContent = 'Zestawienie zdarzeń'
      if (subtitle) subtitle.textContent = 'Operacyjne podsumowanie zdarzeń według klientów, stref, pracowników i typów.'
      reportSetVisible('repEvents', true)
      reportSetVisible('repHistory', false)
      reportSetVisible('repSoon', false)
      reportEventsDefaultDates()
      reportRefreshEventsZoneOptions()
      reportSetStatus('Ustaw filtry i kliknij "Generuj zestawienie".')
      return
    }

    if (title) title.textContent = 'Wkrótce'
    if (subtitle) subtitle.textContent = 'Ten typ zestawienia dodamy w kolejnym etapie.'
    reportSetVisible('repEvents', false)
    reportSetVisible('repHistory', false)
    reportSetVisible('repSoon', true)
    reportHistorySetTabsVisible(true)
  }

  function closeReportBuilder() {
    reportSetVisible('repBuilder', false)
    reportSetVisible('repHome', true)
    reportSetVisible('repEvents', false)
    reportSetVisible('repHistory', false)
    reportSetVisible('repSoon', false)
    reportHistorySetTabsVisible(true)
    reportGeoHidePreview()
    reportGeoCloseModal()
    reportResetResults()
  }

  function reportHasValue(value) {
    if (value == null) {
      return false
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) && value !== 0
    }
    if (typeof value === 'boolean') {
      return true
    }
    const text = String(value).trim()
    return Boolean(text) && text !== '-'
  }

  function reportHistoryMergeKey(item, index, prefix) {
    const id = String(item?.eventId ?? item?.workdayId ?? item?.id ?? '').trim()
    const startAt = toIso(item?.startAt)
    const endAt = toIso(item?.endAt)
    const status = String(item?.status ?? '').trim().toUpperCase()
    const endReason = String(item?.endReason ?? '').trim().toUpperCase()
    const worker = String(item?.workerLogin ?? item?.workerName ?? '').trim().toLowerCase()
    const zone = String(item?.zoneId ?? item?.utilityRoomId ?? item?.roomId ?? item?.strefa ?? item?.zoneName ?? '')
      .trim()
      .toLowerCase()
    const marker = [startAt, endAt, status, endReason, worker, zone].join('|')
    return id ? `${id}|${marker}` : `${prefix}-${index}|${marker}`
  }

  function reportHistoryMergeScore(item) {
    const fields = [
      item?.eventId,
      item?.workdayId,
      item?.workerLogin,
      item?.workerName,
      item?.zoneId,
      item?.strefa,
      item?.zoneName,
      item?.clientId,
      item?.clientName,
      item?.klient,
      item?.lokalizacja,
      item?.startAt,
      item?.endAt,
      item?.durationSec,
      item?.status,
      item?.endReason,
      item?.dayStartObject,
      item?.dayStopObject,
      item?.comment,
      item?.updatedAt,
    ]
    return fields.reduce((score, value) => score + (reportHasValue(value) ? 1 : 0), 0)
  }

  function reportMergeHistorySourceItems(...collections) {
    const merged = new Map()

    collections.forEach((items, collectionIndex) => {
      if (!Array.isArray(items) || !items.length) {
        return
      }

      const prefix = collectionIndex === 0 ? 'primary' : `secondary-${collectionIndex}`
      items.forEach((item, itemIndex) => {
        const key = reportHistoryMergeKey(item, itemIndex, prefix)
        const existing = merged.get(key)
        if (!existing) {
          merged.set(key, item)
          return
        }

        const existingScore = reportHistoryMergeScore(existing)
        const incomingScore = reportHistoryMergeScore(item)
        const preferIncoming = incomingScore > existingScore
        const preferred = preferIncoming ? item : existing
        const fallback = preferIncoming ? existing : item
        merged.set(key, { ...fallback, ...preferred })
      })
    })

    return [...merged.values()]
  }

  async function reportFetchEventsSourcePaged(orgId, baseFilters, maxPages) {
    const items = []
    let page = 1
    let totalPages = 1

    while (page <= totalPages && page <= maxPages) {
      const response = await getWorkdays(orgId, {
        ...baseFilters,
        page,
      })

      const pageItems = response?.items ?? []
      items.push(...pageItems)
      totalPages = Number(response?.totalPages ?? 1) || 1
      page += 1
    }

    return items
  }

  async function reportFetchEventsPaged(orgId, filters = {}) {
    const pageSize = Math.max(Number(filters.pageSize ?? 1000) || 1000, 1)
    const maxPages = Math.max(Number(filters.maxPages ?? 200) || 200, 1)
    const baseFilters = {
      ...filters,
      pageSize,
    }
    delete baseFilters.maxPages

    const source = String(baseFilters.source ?? '').trim().toLowerCase()
    const primaryItems = await reportFetchEventsSourcePaged(orgId, baseFilters, maxPages)

    if (source !== 'events' && source !== 'event') {
      return primaryItems
    }

    if (primaryItems.length) {
      return primaryItems
    }

    let backupItems = []
    try {
      backupItems = await reportFetchEventsSourcePaged(orgId, { ...baseFilters, source: 'backupcycle' }, maxPages)
    } catch {
      backupItems = []
    }

    if (!backupItems.length) {
      return primaryItems
    }

    return reportMergeHistorySourceItems(primaryItems, backupItems)
  }

  function reportReadPanel(panel) {
    return {
      clientId: String(document.getElementById(`rep${panel}_client`)?.value ?? '').trim(),
      zoneId: String(document.getElementById(`rep${panel}_zone`)?.value ?? '').trim(),
      workerLogin: String(document.getElementById(`rep${panel}_worker`)?.value ?? '').trim(),
      from: String(document.getElementById(`rep${panel}_from`)?.value ?? '').trim(),
      to: String(document.getElementById(`rep${panel}_to`)?.value ?? '').trim(),
    }
  }

  async function reportFetchEventsForPanel(orgId, panel) {
    return reportFetchEventsPaged(orgId, {
      source: 'events',
      status: 'CLOSED',
      fromIso: ymdToIsoRangeStart(panel.from),
      toIso: ymdToIsoRangeEnd(panel.to),
    })
  }

  function reportReadEventsFilters() {
    return {
      from: String(document.getElementById('repEventsFrom')?.value ?? '').trim(),
      to: String(document.getElementById('repEventsTo')?.value ?? '').trim(),
      clientId: String(document.getElementById('repEventsClient')?.value ?? '').trim(),
      zoneId: String(document.getElementById('repEventsZone')?.value ?? '').trim(),
      workerLogin: String(document.getElementById('repEventsWorker')?.value ?? '').trim(),
      status: String(document.getElementById('repEventsStatus')?.value ?? 'all').trim(),
      type: String(document.getElementById('repEventsType')?.value ?? '').trim(),
      groupBy: String(document.getElementById('repEventsGroupBy')?.value ?? 'client').trim() || 'client',
      search: String(document.getElementById('repEventsSearch')?.value ?? '').trim(),
    }
  }

  function reportEventClientLabel(item) {
    const qrCandidate =
      item?.zoneId ??
      item?.roomId ??
      item?.utilityRoomId ??
      item?.dayStartObject ??
      item?.dayStopObject ??
      item?.strefa
    return resolveClientLabelWithQrFallback(String(item?.clientName ?? item?.klient ?? item?.clientId ?? '-').trim() || '-', qrCandidate)
  }

  function reportEventZoneLabel(item) {
    return String(item?.zoneName ?? item?.strefa ?? item?.zoneId ?? item?.roomId ?? '-').trim() || '-'
  }

  function reportEventLocationLabel(item) {
    return String(item?.lokalizacja ?? item?.location ?? '-').trim() || '-'
  }

  function reportEventWorkerLabel(item) {
    return String(item?.workerName ?? item?.workerLogin ?? '-').trim() || '-'
  }

  function reportEventTypeLabel(item) {
    return eventTypeInfo(item).label
  }

  function reportEventDurationSec(item) {
    const direct = Number(item?.durationSec ?? 0)
    if (Number.isFinite(direct) && direct > 0) {
      return Math.floor(direct)
    }

    const startIso = toIso(item?.startAt)
    const endIso = toIso(item?.endAt)
    if (!startIso || !endIso) {
      return 0
    }

    const startMs = new Date(startIso).getTime()
    const endMs = new Date(endIso).getTime()
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
      return 0
    }

    return Math.floor((endMs - startMs) / 1000)
  }

  function reportEventMatchesStatus(item, status) {
    const normalized = String(status ?? 'all').trim().toLowerCase()
    if (!normalized || normalized === 'all') {
      return true
    }

    const closed = reportClosedEvent(item)
    if (normalized === 'closed') {
      return closed
    }
    if (normalized === 'running') {
      return !closed
    }
    return true
  }

  function reportEventMatchesSearch(item, search) {
    const query = normalizeSearchText(search)
    if (!query) {
      return true
    }

    const haystack = [
      reportEventClientLabel(item),
      reportEventZoneLabel(item),
      reportEventLocationLabel(item),
      reportEventWorkerLabel(item),
      item?.workerLogin,
      reportEventTypeLabel(item),
      normalizeVisibleEventComment(item?.comment),
      item?.editedBy,
      item?.date,
      item?.start,
      item?.stop,
    ]
      .map((value) => normalizeSearchText(value))
      .join(' ')

    return haystack.includes(query)
  }

  function reportEventMatchesFilters(item, filters) {
    if (!reportMatchesPanelSelection(item, filters)) {
      return false
    }
    if (!reportEventMatchesStatus(item, filters.status)) {
      return false
    }
    if (filters.type && reportEventTypeLabel(item) !== filters.type) {
      return false
    }
    return reportEventMatchesSearch(item, filters.search)
  }

  function reportEventGroupLabel(item, groupBy) {
    const mode = String(groupBy ?? 'client').trim()
    if (mode === 'zone') {
      const zone = reportEventZoneLabel(item)
      const location = reportEventLocationLabel(item)
      return [zone, location && location !== '-' ? location : ''].filter(Boolean).join(' / ') || 'Bez strefy'
    }
    if (mode === 'worker') {
      return reportEventWorkerLabel(item) || 'Bez pracownika'
    }
    if (mode === 'type') {
      return reportEventTypeLabel(item)
    }
    if (mode === 'day') {
      const key = String(item?.dayKey ?? item?.startAt ?? item?.endAt ?? '').slice(0, 10)
      return key ? formatDatePl(`${key}T12:00:00.000Z`) : 'Bez daty'
    }
    return reportEventClientLabel(item) || 'Bez klienta'
  }

  function reportAggregateEvents(items, groupBy) {
    const groups = new Map()

    items.forEach((item) => {
      const group = reportEventGroupLabel(item, groupBy)
      if (!groups.has(group)) {
        groups.set(group, {
          group,
          count: 0,
          totalSec: 0,
          avgSec: 0,
          closed: 0,
          running: 0,
          workers: new Set(),
          clients: new Set(),
          zones: new Set(),
          firstStart: '',
          lastStop: '',
        })
      }

      const bucket = groups.get(group)
      const durationSec = reportEventDurationSec(item)
      const startIso = toIso(item?.startAt)
      const endIso = toIso(item?.endAt)
      bucket.count += 1
      bucket.totalSec += durationSec
      if (reportClosedEvent(item)) {
        bucket.closed += 1
      } else {
        bucket.running += 1
      }
      const worker = reportEventWorkerLabel(item)
      const client = reportEventClientLabel(item)
      const zone = reportEventZoneLabel(item)
      if (worker && worker !== '-') bucket.workers.add(worker)
      if (client && client !== '-') bucket.clients.add(client)
      if (zone && zone !== '-') bucket.zones.add(zone)
      if (startIso && (!bucket.firstStart || startIso < bucket.firstStart)) {
        bucket.firstStart = startIso
      }
      if (endIso && (!bucket.lastStop || endIso > bucket.lastStop)) {
        bucket.lastStop = endIso
      }
    })

    return [...groups.values()]
      .map((bucket) => ({
        ...bucket,
        workerCount: bucket.workers.size,
        clientCount: bucket.clients.size,
        zoneCount: bucket.zones.size,
        avgSec: bucket.count ? Math.floor(bucket.totalSec / bucket.count) : 0,
      }))
      .sort((left, right) => {
        if (right.totalSec !== left.totalSec) return right.totalSec - left.totalSec
        if (right.count !== left.count) return right.count - left.count
        return left.group.localeCompare(right.group, 'pl', { numeric: true, sensitivity: 'base' })
      })
  }

  function reportRenderEventsSummary(items, groupRows, filters) {
    const summary = document.getElementById('repSummary')
    if (!summary) {
      return
    }

    const closed = items.filter((item) => reportClosedEvent(item)).length
    const running = items.length - closed
    const clients = new Set(items.map((item) => reportEventClientLabel(item)).filter((value) => value && value !== '-')).size
    const zones = new Set(items.map((item) => reportEventZoneLabel(item)).filter((value) => value && value !== '-')).size
    const longest = groupRows[0]
    summary.innerHTML = `
      <div class="rep-summary-card">
        <div><b>Zakres:</b> ${escapeHtml(formatDatePl(`${filters.from}T12:00:00.000Z`))} - ${escapeHtml(formatDatePl(`${filters.to}T12:00:00.000Z`))}</div>
        <div><b>Status:</b> zamknięte ${closed} · otwarte ${running}</div>
        <div><b>Zakres danych:</b> klienci ${clients} · strefy ${zones}</div>
        <div><b>Największa grupa:</b> ${escapeHtml(longest?.group ?? '-')} · ${escapeHtml(durationSecondsToHms(longest?.totalSec ?? 0))}</div>
      </div>
    `
    reportSetVisible('repSummary', true)
  }

  function reportMapEventsDetailsRows(items) {
    return items
      .slice()
      .sort((left, right) => String(right.startAt ?? right.endAt ?? '').localeCompare(String(left.startAt ?? left.endAt ?? '')))
      .slice(0, 300)
      .map((item) => ({
        date: item.date || formatDatePl(item.startAt || item.endAt),
        start: dashboardClockLabelToHm(item.start, '-'),
        stop: dashboardClockLabelToHm(item.stop, '-'),
        duration: durationSecondsToHms(reportEventDurationSec(item)),
        worker: reportEventWorkerLabel(item),
        client: reportEventClientLabel(item),
        zone: zoneNameWithQrHtml(reportEventZoneLabel(item), item),
        location: reportEventLocationLabel(item),
        type: reportEventTypeLabel(item),
        comment: normalizeVisibleEventComment(item.comment) || '-',
      }))
  }

  async function runEventsOperationalReport() {
    if (!appState.session?.orgId) {
      return
    }

    const filters = reportReadEventsFilters()
    if (!filters.from || !filters.to) {
      reportSetStatus('Wybierz zakres dat.', true)
      return
    }
    if (filters.from > filters.to) {
      reportSetStatus('Data "od" nie może być większa niż "do".', true)
      return
    }

    reportResetResults()
    reportSetStatus('Ładowanie zdarzeń...')

    try {
      const sourceRows = await reportFetchEventsPaged(appState.session.orgId, {
        source: 'events',
        fromIso: ymdToIsoRangeStart(filters.from),
        toIso: ymdToIsoRangeEnd(filters.to),
        pageSize: 1000,
        maxPages: 200,
      })
      const rows = sourceRows.filter((item) => reportEventMatchesFilters(item, filters))
      const stats = reportStats(rows)
      const workerCount = new Set(rows.map((item) => reportEventWorkerLabel(item)).filter((value) => value && value !== '-')).size
      const groupRows = reportAggregateEvents(rows, filters.groupBy)
      reportSetKpiValues(
        { count: rows.length, totalSec: stats.totalSec },
        { count: workerCount, totalSec: stats.avgSec },
      )
      reportRenderEventsSummary(rows, groupRows, filters)

      const groupHeaders = [
        { key: 'group', label: 'Grupa' },
        { key: 'count', label: 'Zdarzenia', align: 'right' },
        { key: 'total', label: 'Łączny czas', align: 'right' },
        { key: 'avg', label: 'Średni czas', align: 'right' },
        { key: 'workers', label: 'Pracownicy', align: 'right' },
        { key: 'clients', label: 'Klienci', align: 'right' },
        { key: 'zones', label: 'Strefy', align: 'right' },
        { key: 'running', label: 'Otwarte', align: 'right' },
        { key: 'closed', label: 'Zamknięte', align: 'right' },
      ]
      const groupMapped = groupRows.map((row) => ({
        group: row.group,
        count: String(row.count),
        total: durationSecondsToHms(row.totalSec),
        avg: durationSecondsToHms(row.avgSec),
        workers: String(row.workerCount),
        clients: String(row.clientCount),
        zones: String(row.zoneCount),
        running: String(row.running),
        closed: String(row.closed),
      }))
      reportRenderTable('repTableA', groupHeaders, groupMapped)
      reportSetVisible('repTableAWrap', true)

      reportRenderLocationChart(
        'repChartA',
        groupRows.slice(0, 10).map((row) => ({
          location: row.group,
          totalSec: row.totalSec,
          count: row.count,
        })),
      )
      reportSetVisible('repDiffWrap', true)

      const detailHeaders = [
        { key: 'date', label: 'Data' },
        { key: 'start', label: 'START' },
        { key: 'stop', label: 'STOP' },
        { key: 'duration', label: 'Czas', align: 'right' },
        { key: 'worker', label: 'Pracownik' },
        { key: 'client', label: 'Klient' },
        { key: 'zone', label: 'Strefa', html: true },
        { key: 'location', label: 'Lokalizacja' },
        { key: 'type', label: 'Typ' },
        { key: 'comment', label: 'Komentarz' },
      ]
      const detailRows = reportMapEventsDetailsRows(rows)
      reportRenderTable('repTableB', detailHeaders, detailRows)
      reportSetVisible('repTableBWrap', true)

      const csvLines = [
        reportToCsvLine(['Zestawienie zdarzeń']),
        reportToCsvLine(['Zakres', `${filters.from} - ${filters.to}`]),
        reportToCsvLine(['Zdarzenia', rows.length, 'Łączny czas', durationSecondsToHms(stats.totalSec)]),
        '',
        reportToCsvLine(['Podsumowanie']),
        reportToCsvLine(groupHeaders.map((header) => header.label)),
        ...groupMapped.map((row) => reportToCsvLine(groupHeaders.map((header) => row[header.key] ?? ''))),
        '',
        reportToCsvLine(['Szczegóły']),
        reportToCsvLine(detailHeaders.map((header) => header.label)),
        ...detailRows.map((row) => reportToCsvLine(detailHeaders.map((header) => row[header.key] ?? ''))),
      ]
      appState.reportLastCsv = csvLines.join('\n')

      const downloadButton = document.getElementById('repDownloadCsv')
      if (downloadButton) {
        downloadButton.disabled = !appState.reportLastCsv
      }

      reportSetStatus(`Gotowe. Zdarzenia: ${rows.length} · grupy: ${groupRows.length}.`)
    } catch (error) {
      reportSetStatus(error instanceof Error ? error.message : 'Błąd pobierania danych do zestawienia.', true)
    }
  }

  function reportNormalizeText(value) {
    return String(value ?? '')
      .trim()
      .toLowerCase()
  }

  function reportMatchesWorkerSelection(item, workerLogin) {
    const selectedLoginRaw = String(workerLogin ?? '').trim()
    if (!selectedLoginRaw) {
      return true
    }

    const itemLoginRaw = String(item?.workerLogin ?? '').trim()
    if (itemLoginRaw && itemLoginRaw === selectedLoginRaw) {
      return true
    }

    const selectedLoginNormalized = normalizeSearchText(selectedLoginRaw)
    const itemLoginNormalized = normalizeSearchText(itemLoginRaw)
    if (selectedLoginNormalized && itemLoginNormalized && selectedLoginNormalized === itemLoginNormalized) {
      return true
    }

    const selectedLoginLocal = normalizeSearchText(selectedLoginRaw.split('@')[0])
    const itemLoginLocal = normalizeSearchText(itemLoginRaw.split('@')[0])
    if (selectedLoginLocal && itemLoginLocal && selectedLoginLocal === itemLoginLocal) {
      return true
    }

    const selectedWorker = appState.workers.find(
      (worker) => String(worker.login ?? worker.id ?? '').trim() === selectedLoginRaw,
    )
    const selectedWorkerName = normalizeSearchText(selectedWorker?.name)
    const itemWorkerName = normalizeSearchText(item?.workerName)

    if (selectedWorkerName && itemWorkerName) {
      if (itemWorkerName === selectedWorkerName) {
        return true
      }
      if (itemWorkerName.includes(selectedWorkerName) || selectedWorkerName.includes(itemWorkerName)) {
        return true
      }
    }

    if (selectedLoginLocal && itemWorkerName) {
      if (itemWorkerName.includes(selectedLoginLocal) || selectedLoginLocal.includes(itemWorkerName)) {
        return true
      }
    }

    return false
  }

  function reportIsWorkerHistoryDetailItem(item) {
    return String(item?.historySourceKind ?? '').trim().toLowerCase() !== 'workday'
  }

  function reportMatchesPanelSelection(item, panel) {
    if (panel.clientId) {
      const itemClientId = String(item.clientId ?? '').trim()
      if (itemClientId === panel.clientId) {
        // pass
      } else {
        const selectedClient = appState.clients.find((client) => String(client.id ?? '').trim() === panel.clientId)
        const selectedClientName = reportNormalizeText(selectedClient?.name)
        const itemClientName = reportNormalizeText(item.clientName ?? item.klient ?? item.clientId)
        const matchesByName =
          Boolean(selectedClientName) &&
          Boolean(itemClientName) &&
          (itemClientName === selectedClientName ||
            itemClientName.includes(selectedClientName) ||
            selectedClientName.includes(itemClientName))
        if (!matchesByName) {
          return false
        }
      }
    }

    if (panel.zoneId) {
      const selectedZoneRaw = String(panel.zoneId ?? '').trim()
      const selectedZoneCode = reportHistoryNormalizeQrCode(selectedZoneRaw)
      const itemZoneRaw = String(item.zoneId ?? item.utilityRoomId ?? item.roomId ?? '').trim()
      const itemZoneCode = reportHistoryNormalizeQrCode(itemZoneRaw)
      if (selectedZoneCode) {
        if (!itemZoneCode || itemZoneCode !== selectedZoneCode) {
          return false
        }
      } else if (itemZoneRaw === selectedZoneRaw) {
        // pass
      } else {
        const selectedZone = appState.zones.find((zone) => String(zone.id ?? '').trim() === selectedZoneRaw)
        const selectedZoneName = reportNormalizeText(selectedZone?.name ?? selectedZone?.zone)
        const itemZoneName = reportNormalizeText(item.zoneName ?? item.strefa)
        if (!selectedZoneName || !itemZoneName || itemZoneName !== selectedZoneName) {
          return false
        }
      }
    }

    if (panel.workerLogin) {
      if (!reportMatchesWorkerSelection(item, panel.workerLogin)) {
        return false
      }
    }

    return true
  }

  function reportClosedEvent(item) {
    const status = String(item.status ?? '').trim().toUpperCase()
    return status === 'CLOSED' || Boolean(item.endAt)
  }

  function reportGroupByDay(items) {
    const grouped = new Map()

    items.forEach((item) => {
      const dayKey = String(item.dayKey ?? '').trim() || String(item.startAt ?? '').slice(0, 10)
      if (!dayKey) {
        return
      }

      const duration = Number(item.durationSec ?? 0)
      const durationSec = Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 0
      if (!grouped.has(dayKey)) {
        grouped.set(dayKey, {
          date: dayKey,
          count: 0,
          totalSec: 0,
          minSec: Number.POSITIVE_INFINITY,
          maxSec: 0,
        })
      }

      const bucket = grouped.get(dayKey)
      bucket.count += 1
      bucket.totalSec += durationSec
      bucket.minSec = Math.min(bucket.minSec, durationSec)
      bucket.maxSec = Math.max(bucket.maxSec, durationSec)
    })

    return [...grouped.values()]
      .map((bucket) => ({
        ...bucket,
        minSec: Number.isFinite(bucket.minSec) ? bucket.minSec : 0,
        avgSec: bucket.count > 0 ? Math.floor(bucket.totalSec / bucket.count) : 0,
      }))
      .sort((left, right) => left.date.localeCompare(right.date))
  }

  function reportStats(items) {
    const count = items.length
    const durations = items.map((item) => Number(item.durationSec ?? item.totalSec ?? 0)).filter((value) => Number.isFinite(value) && value >= 0)
    const totalSec = durations.reduce((sum, value) => sum + value, 0)
    const minSec = durations.length ? Math.min(...durations) : 0
    const maxSec = durations.length ? Math.max(...durations) : 0
    const avgSec = count > 0 ? Math.floor(totalSec / count) : 0

    return {
      count,
      totalSec,
      avgSec,
      minSec,
      maxSec,
    }
  }

  function reportRenderTable(tableId, headers, rows) {
    const table = document.getElementById(tableId)
    if (!table) {
      return
    }

    const headHtml = `<thead><tr>${headers.map((header) => `<th>${escapeHtml(header.label)}</th>`).join('')}</tr></thead>`
    if (!rows.length) {
      table.innerHTML = `${headHtml}<tbody><tr><td colspan="${headers.length}" style="text-align:center; padding:18px;">Brak danych</td></tr></tbody>`
      return
    }

    const bodyHtml = rows
      .map(
        (row) =>
          `<tr>${headers
            .map((header) => {
              const value = row[header.key] ?? '-'
              const style = header.align ? ` style="text-align:${header.align};"` : ''
              return `<td${style}>${header.html ? value : escapeHtml(value)}</td>`
            })
            .join('')}</tr>`,
      )
      .join('')

    table.innerHTML = `${headHtml}<tbody>${bodyHtml}</tbody>`
  }

  function reportToCsvLine(values) {
    return values
      .map((value) => {
        const escaped = String(value ?? '').replaceAll('"', '""')
        return `"${escaped}"`
      })
      .join(',')
  }

  function reportSignedDuration(secondsValue) {
    const seconds = Number(secondsValue ?? 0)
    if (!Number.isFinite(seconds) || seconds === 0) {
      return '00:00:00'
    }

    const sign = seconds < 0 ? '-' : ''
    const absolute = Math.abs(Math.floor(seconds))
    const hours = Math.floor(absolute / 3600)
    const minutes = Math.floor((absolute % 3600) / 60)
    const secondsRemainder = absolute % 60

    return `${sign}${pad2(hours)}:${pad2(minutes)}:${pad2(secondsRemainder)}`
  }

  function reportDownloadCsv() {
    if (!appState.reportLastCsv) {
      return
    }

    const blob = new Blob([`\ufeff${appState.reportLastCsv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `zestawienie-zdarzen-${todayYmd()}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  async function _runEventsReportComparison() {
    if (!appState.session?.orgId) {
      return
    }

    const panelA = reportReadPanel('A')
    const panelB = reportReadPanel('B')
    if (!panelA.clientId || !panelB.clientId) {
      reportSetStatus('Najpierw wybierz klienta w panelu A i B.', true)
      return
    }

    if (panelA.from && panelA.to && panelA.from > panelA.to) {
      reportSetStatus('Panel A: data "od" nie może być większa niż "do".', true)
      return
    }
    if (panelB.from && panelB.to && panelB.from > panelB.to) {
      reportSetStatus('Panel B: data "od" nie może być większa niż "do".', true)
      return
    }

    reportResetResults()
    reportSetStatus('Ładowanie danych...')

    const dayMode = Boolean(document.getElementById('repMode_day')?.checked)
    const flags = {
      time: Boolean(document.getElementById('repChk_time')?.checked),
      count: Boolean(document.getElementById('repChk_count')?.checked),
      avg: Boolean(document.getElementById('repChk_avg')?.checked),
        minmax: Boolean(document.getElementById('repChk_minmax')?.checked),
    }
    if (!flags.time && !flags.count && !flags.avg && !flags.minmax) {
      reportSetStatus('Zaznacz co najmniej jedną metrykę do porównania.', true)
      return
    }

    try {
      const [itemsA, itemsB] = await Promise.all([
        reportFetchEventsForPanel(appState.session.orgId, panelA),
        reportFetchEventsForPanel(appState.session.orgId, panelB),
      ])

      const filteredA = itemsA.filter((item) => reportClosedEvent(item) && reportMatchesPanelSelection(item, panelA))
      const filteredB = itemsB.filter((item) => reportClosedEvent(item) && reportMatchesPanelSelection(item, panelB))
      const rowsA = dayMode ? reportGroupByDay(filteredA) : filteredA
      const rowsB = dayMode ? reportGroupByDay(filteredB) : filteredB
      const statsA = reportStats(rowsA)
      const statsB = reportStats(rowsB)
      reportSetKpiValues(statsA, statsB)
      reportRenderCharts(filteredA, filteredB, panelA, panelB)

      const statsDiff = {
        count: statsB.count - statsA.count,
        totalSec: statsB.totalSec - statsA.totalSec,
        avgSec: statsB.avgSec - statsA.avgSec,
        minSec: statsB.minSec - statsA.minSec,
        maxSec: statsB.maxSec - statsA.maxSec,
      }

      const summary = document.getElementById('repSummary')
      if (summary) {
        summary.innerHTML = `
          <div class="rep-summary-card">
            <div><b>Panel A</b> · rekordy: ${statsA.count} · czas: ${durationSecondsToHms(statsA.totalSec)}${flags.avg ? ` · średni: ${durationSecondsToHms(statsA.avgSec)}` : ''}${flags.minmax ? ` · min/max: ${durationSecondsToHms(statsA.minSec)} / ${durationSecondsToHms(statsA.maxSec)}` : ''}</div>
            <div><b>Panel B</b> · rekordy: ${statsB.count} · czas: ${durationSecondsToHms(statsB.totalSec)}${flags.avg ? ` · średni: ${durationSecondsToHms(statsB.avgSec)}` : ''}${flags.minmax ? ` · min/max: ${durationSecondsToHms(statsB.minSec)} / ${durationSecondsToHms(statsB.maxSec)}` : ''}</div>
            <div><b>Różnica (B - A)</b>${flags.count ? ` · rekordy: ${statsDiff.count}` : ''}${flags.time ? ` · czas: ${reportSignedDuration(statsDiff.totalSec)}` : ''}${flags.avg ? ` · średni: ${reportSignedDuration(statsDiff.avgSec)}` : ''}${flags.minmax ? ` · min: ${reportSignedDuration(statsDiff.minSec)} · max: ${reportSignedDuration(statsDiff.maxSec)}` : ''}</div>
          </div>
        `
      }
      reportSetVisible('repSummary', true)

      if (dayMode) {
        const headers = [{ key: 'date', label: 'Data' }]
        if (flags.count) headers.push({ key: 'count', label: 'Liczba zdarzeń', align: 'right' })
        if (flags.time) headers.push({ key: 'total', label: 'Łączny czas', align: 'right' })
        if (flags.avg) headers.push({ key: 'avg', label: 'Średni czas', align: 'right' })
        if (flags.minmax) headers.push({ key: 'min', label: 'Min', align: 'right' }, { key: 'max', label: 'Max', align: 'right' })

        const mappedA = rowsA.map((row) => ({
          date: formatDatePl(row.date),
          count: String(row.count),
          total: durationSecondsToHms(row.totalSec),
          avg: durationSecondsToHms(row.avgSec),
          min: durationSecondsToHms(row.minSec),
          max: durationSecondsToHms(row.maxSec),
        }))
        const mappedB = rowsB.map((row) => ({
          date: formatDatePl(row.date),
          count: String(row.count),
          total: durationSecondsToHms(row.totalSec),
          avg: durationSecondsToHms(row.avgSec),
          min: durationSecondsToHms(row.minSec),
          max: durationSecondsToHms(row.maxSec),
        }))

        const diffByDay = new Map()
        rowsA.forEach((row) => {
          diffByDay.set(row.date, {
            date: formatDatePl(row.date),
            countA: row.count,
            countB: 0,
            totalA: row.totalSec,
            totalB: 0,
          })
        })
        rowsB.forEach((row) => {
          if (!diffByDay.has(row.date)) {
            diffByDay.set(row.date, {
              date: formatDatePl(row.date),
              countA: 0,
              countB: row.count,
              totalA: 0,
              totalB: row.totalSec,
            })
          } else {
            const existing = diffByDay.get(row.date)
            existing.countB = row.count
            existing.totalB = row.totalSec
          }
        })

        const mappedDiff = [...diffByDay.values()].map((row) => ({
          date: row.date,
          countA: String(row.countA),
          countB: String(row.countB),
          countDiff: String(row.countB - row.countA),
          totalA: durationSecondsToHms(row.totalA),
          totalB: durationSecondsToHms(row.totalB),
          totalDiff: reportSignedDuration(row.totalB - row.totalA),
        }))

        const diffHeaders = [{ key: 'date', label: 'Data' }]
        if (flags.count) diffHeaders.push({ key: 'countA', label: 'A · Liczba', align: 'right' }, { key: 'countB', label: 'B · Liczba', align: 'right' }, { key: 'countDiff', label: 'B-A · Liczba', align: 'right' })
        if (flags.time) diffHeaders.push({ key: 'totalA', label: 'A · Czas', align: 'right' }, { key: 'totalB', label: 'B · Czas', align: 'right' }, { key: 'totalDiff', label: 'B-A · Czas', align: 'right' })

        reportRenderTable('repTableA', headers, mappedA)
        reportRenderTable('repTableB', headers, mappedB)
        reportRenderTable('repTableDiff', diffHeaders, mappedDiff)
        reportSetVisible('repTableAWrap', true)
        reportSetVisible('repTableBWrap', true)
        reportSetVisible('repDiffWrap', true)

        const csvLines = []
        csvLines.push(reportToCsvLine(['Sekcja', 'Panel A']))
        csvLines.push(reportToCsvLine(headers.map((header) => header.label)))
        mappedA.forEach((row) => {
          csvLines.push(reportToCsvLine(headers.map((header) => row[header.key] ?? '')))
        })
        csvLines.push('')
        csvLines.push(reportToCsvLine(['Sekcja', 'Panel B']))
        csvLines.push(reportToCsvLine(headers.map((header) => header.label)))
        mappedB.forEach((row) => {
          csvLines.push(reportToCsvLine(headers.map((header) => row[header.key] ?? '')))
        })
        csvLines.push('')
        csvLines.push(reportToCsvLine(['Sekcja', 'Różnice']))
        csvLines.push(reportToCsvLine(diffHeaders.map((header) => header.label)))
        mappedDiff.forEach((row) => {
          csvLines.push(reportToCsvLine(diffHeaders.map((header) => row[header.key] ?? '')))
        })
        appState.reportLastCsv = csvLines.join('\n')
      } else {
        const headers = [
          { key: 'date', label: 'Data' },
          { key: 'worker', label: 'Pracownik' },
          { key: 'client', label: 'Klient' },
          { key: 'zone', label: 'Strefa' },
          { key: 'duration', label: 'Czas', align: 'right' },
        ]

        const mappedA = rowsA.map((row) => ({
          date: row.date || formatDatePl(row.startAt),
          worker: row.workerName || row.workerLogin || '-',
          client: resolveClientLabelWithQrFallback(
            String(row.clientName || row.klient || '-'),
            row.zoneId || row.roomId || row.utilityRoomId || row.strefa || row.zoneName || '-',
          ),
          zone: row.zoneName || row.strefa || '-',
          duration: durationSecondsToHms(Number(row.durationSec ?? 0)),
        }))
        const mappedB = rowsB.map((row) => ({
          date: row.date || formatDatePl(row.startAt),
          worker: row.workerName || row.workerLogin || '-',
          client: resolveClientLabelWithQrFallback(
            String(row.clientName || row.klient || '-'),
            row.zoneId || row.roomId || row.utilityRoomId || row.strefa || row.zoneName || '-',
          ),
          zone: row.zoneName || row.strefa || '-',
          duration: durationSecondsToHms(Number(row.durationSec ?? 0)),
        }))
        const diffRows = [
          {
            metric: 'Różnica B - A',
            count: flags.count ? String(statsDiff.count) : '-',
            total: flags.time ? reportSignedDuration(statsDiff.totalSec) : '-',
            avg: flags.avg ? reportSignedDuration(statsDiff.avgSec) : '-',
            min: flags.minmax ? reportSignedDuration(statsDiff.minSec) : '-',
            max: flags.minmax ? reportSignedDuration(statsDiff.maxSec) : '-',
          },
        ]
        const diffHeaders = [
          { key: 'metric', label: 'Wskaźnik' },
          { key: 'count', label: 'Liczba', align: 'right' },
          { key: 'total', label: 'Czas', align: 'right' },
          { key: 'avg', label: 'Średni', align: 'right' },
          { key: 'min', label: 'Min', align: 'right' },
          { key: 'max', label: 'Max', align: 'right' },
        ]

        reportRenderTable('repTableA', headers, mappedA)
        reportRenderTable('repTableB', headers, mappedB)
        reportRenderTable('repTableDiff', diffHeaders, diffRows)
        reportSetVisible('repTableAWrap', true)
        reportSetVisible('repTableBWrap', true)
        reportSetVisible('repDiffWrap', true)

        const csvLines = []
        csvLines.push(reportToCsvLine(['Sekcja', 'Panel A']))
        csvLines.push(reportToCsvLine(headers.map((header) => header.label)))
        mappedA.forEach((row) => {
          csvLines.push(reportToCsvLine(headers.map((header) => row[header.key] ?? '')))
        })
        csvLines.push('')
        csvLines.push(reportToCsvLine(['Sekcja', 'Panel B']))
        csvLines.push(reportToCsvLine(headers.map((header) => header.label)))
        mappedB.forEach((row) => {
          csvLines.push(reportToCsvLine(headers.map((header) => row[header.key] ?? '')))
        })
        csvLines.push('')
        csvLines.push(reportToCsvLine(diffHeaders.map((header) => header.label)))
        diffRows.forEach((row) => {
          csvLines.push(reportToCsvLine(diffHeaders.map((header) => row[header.key] ?? '')))
        })
        appState.reportLastCsv = csvLines.join('\n')
      }

      const downloadButton = document.getElementById('repDownloadCsv')
      if (downloadButton) {
        downloadButton.disabled = !appState.reportLastCsv
      }

      reportSetStatus(`Porównanie gotowe. A: ${rowsA.length} · B: ${rowsB.length}.`)
    } catch (error) {
      reportSetStatus(error instanceof Error ? error.message : 'Błąd pobierania danych do zestawienia.', true)
    }
  }

  async function initializeReportsView() {
    await prepareReportsView()
    closeReportBuilder()
  }

  async function ensureReportsViewReady() {
    if (!reportsViewInitPromise) {
      reportsViewInitPromise = (async () => {
        try {
          await initializeReportsView()
        } finally {
          reportsViewInitPromise = null
        }
      })()
    }

    await reportsViewInitPromise
  }

  function bindReportsViewFunctions() {
    const binding = createBindingHelpers()
    const reportsRoot = document.getElementById('view-reports')

    binding.add(reportsRoot, 'click', (event) => {
      const geoButton = event.target.closest('[data-rep-geo-lat][data-rep-geo-lon]')
      if (geoButton) {
        event.preventDefault()
        const coords = reportGeoReadCoordsFromNode(geoButton)
        if (coords) {
          reportGeoOpenModal(coords.lat, coords.lon)
        }
        return
      }

      const historyEditButton = event.target.closest('[data-rep-history-edit]')
      if (historyEditButton) {
        if (!canManageEvents()) {
          alert('Brak uprawnień do edycji zdarzeń.')
          return
        }

        const editKey = String(historyEditButton.getAttribute('data-rep-history-edit') ?? '').trim()
        const row = appState.reportHistoryEditableMap?.[editKey]
        if (!row) {
          alert('Nie znaleziono rekordu do edycji. Odśwież historię.')
          return
        }

        void openEventEditor(row)
        return
      }

      const historyStopDayButton = event.target.closest('[data-rep-history-stop-day]')
      if (historyStopDayButton) {
        const dayKey = String(historyStopDayButton.getAttribute('data-rep-history-stop-day') ?? '').trim()
        if (dayKey) {
          void reportHistoryCloseWorkerDay(dayKey)
        }
        return
      }

      const historyTabButton = event.target.closest('[data-rep-history-tab]')
      if (historyTabButton) {
        const tab = String(historyTabButton.getAttribute('data-rep-history-tab') ?? '').trim()
        if (tab) {
          reportHistorySetTab(tab)
          reportHistorySetStatus('Wybierz filtr i kliknij "Pokaż historię".')
        }
        return
      }

      const historyToggleButton = event.target.closest('[data-rep-history-toggle]')
      if (historyToggleButton) {
        const dayKey = String(historyToggleButton.getAttribute('data-rep-history-toggle') ?? '').trim()
        if (dayKey) {
          reportHistoryToggle(dayKey)
        }
        return
      }

      const tile = event.target.closest('[data-rep-open]')
      if (!tile) {
        return
      }

      const kind = String(tile.getAttribute('data-rep-open') ?? '').trim()
      if (!kind) {
        return
      }

      openReportBuilder(kind)
    })
    binding.add(reportsRoot, 'mouseover', (event) => {
      const geoButton = event.target.closest('[data-rep-geo-lat][data-rep-geo-lon]')
      if (!geoButton) {
        return
      }

      const coords = reportGeoReadCoordsFromNode(geoButton)
      if (!coords) {
        return
      }

      reportGeoShowPreview(geoButton, coords.lat, coords.lon)
    })
    binding.add(reportsRoot, 'mouseout', (event) => {
      const geoButton = event.target.closest('[data-rep-geo-lat][data-rep-geo-lon]')
      if (!geoButton) {
        return
      }

      const related = event.relatedTarget
      if (related && geoButton.contains(related)) {
        return
      }

      reportGeoHidePreviewSoon()
    })
    binding.add(document, 'click', (event) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }

      if (target.id === 'repGeoOverlay') {
        reportGeoCloseModal()
        return
      }
      if (target.closest('#repGeoClose')) {
        reportGeoCloseModal()
        return
      }
      if (target.closest('#repGeoZoomIn')) {
        reportGeoChangeZoom(1)
        return
      }
      if (target.closest('#repGeoZoomOut')) {
        reportGeoChangeZoom(-1)
      }
    })

    binding.add(document.getElementById('repBack'), 'click', closeReportBuilder)
    binding.add(document.getElementById('repRun'), 'click', () => {
      void runEventsOperationalReport()
    })
    binding.add(document.getElementById('repDownloadCsv'), 'click', reportDownloadCsv)
    binding.add(document.getElementById('repA_client'), 'change', () => reportRefreshZoneOptions('A'))
    binding.add(document.getElementById('repB_client'), 'change', () => reportRefreshZoneOptions('B'))
    binding.add(document.getElementById('repEventsClient'), 'change', reportRefreshEventsZoneOptions)
    ;[
      'repEventsFrom',
      'repEventsTo',
      'repEventsClient',
      'repEventsZone',
      'repEventsWorker',
      'repEventsStatus',
      'repEventsType',
      'repEventsGroupBy',
      'repEventsSearch',
    ].forEach((id) => {
      binding.add(document.getElementById(id), 'keydown', (event) => {
        if (event.key !== 'Enter') {
          return
        }

        void runEventsOperationalReport()
      })
    })
    binding.add(document.getElementById('repHistoryRun'), 'click', () => {
      void runReportHistory()
    })
    ;[
      { inputId: 'repHistoryClientSearch', selectId: 'repHistoryClient', kind: 'client' },
      { inputId: 'repHistoryWorkerSearch', selectId: 'repHistoryWorker', kind: 'worker' },
      { inputId: 'repHistoryZoneSearch', selectId: 'repHistoryZone', kind: 'zone' },
    ].forEach(({ inputId, selectId, kind }) => {
      binding.add(document.getElementById(inputId), 'input', () => {
        reportHistoryApplySelectFilter(kind, { expandOnEmpty: true })
      })
      binding.add(document.getElementById(inputId), 'focus', () => {
        reportHistoryApplySelectFilter(kind, { expandOnEmpty: true })
      })
      binding.add(document.getElementById(inputId), 'blur', () => {
        window.setTimeout(() => {
          reportHistoryMaybeCollapseSelect(kind)
        }, 120)
      })
      binding.add(document.getElementById(inputId), 'keydown', (event) => {
        if (event.key !== 'Enter') {
          return
        }

        void runReportHistory()
      })
      binding.add(document.getElementById(selectId), 'change', () => {
        const select = document.getElementById(selectId)
        const searchInput = document.getElementById(inputId)
        const selectedOption = select?.selectedOptions?.[0]
        if (searchInput && select?.value) {
          searchInput.value = String(selectedOption?.textContent ?? '').trim()
        }
        reportHistoryCollapseSelect(kind)
      })
      binding.add(document.getElementById(selectId), 'blur', () => {
        window.setTimeout(() => {
          reportHistoryMaybeCollapseSelect(kind)
        }, 120)
      })
    })
    binding.add(document.getElementById('repHistoryRangeMonth'), 'change', () => {
      reportHistoryApplyRangeMode('month', { force: true })
    })
    binding.add(document.getElementById('repHistoryRangeWeek'), 'change', () => {
      reportHistoryApplyRangeMode('week', { force: true })
    })
    ;['repHistoryFrom', 'repHistoryTo'].forEach((id) => {
      binding.add(document.getElementById(id), 'keydown', (event) => {
        if (event.key !== 'Enter') {
          return
        }

        void runReportHistory()
      })
    })

    return () => {
      binding.done()
    }
  }

  return {
    bind: bindReportsViewFunctions,
    ensureReady: ensureReportsViewReady,
    filterHistoryOptions: reportHistoryFilterOptions,
    refreshHistoryAfterEventSave: reportHistoryRefreshAfterEventSave,
    openEventHistoryFromRow,
    normalizeQrCode: reportHistoryNormalizeQrCode,
    extractQrFromComment: reportHistoryExtractQrFromComment,
    extractGpsCoords: reportHistoryExtractGpsCoords,
    resolveDayQrCode: reportHistoryResolveDayQrCode,
    resolveDayQrCandidate: reportHistoryResolveDayQrCandidate,
    resolveClientByZoneCode: reportHistoryResolveClientByZoneCode,
    isSystemEntrySource: reportHistoryIsSystemEntrySource,
    resolveDayGpsCoords: reportHistoryResolveDayGpsCoords,
    parseGeoPair: reportHistoryParseGeoPair,
    readGeoCoordsFromNode: reportGeoReadCoordsFromNode,
    openGeoModal: reportGeoOpenModal,
    showGeoPreview: reportGeoShowPreview,
    hideGeoPreviewSoon: reportGeoHidePreviewSoon,
    openDashboardEntityHistory,
    openDashboardWorkerHistory,
  }
}
