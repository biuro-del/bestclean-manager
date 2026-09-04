import './style.css'
import template from './template.html?raw'
import { getClients } from '../../../services/clientService'
import { generateZoneQrCodes } from '../../../services/zoneService'
import {
  createZoneQrPdfBlob,
  downloadZoneQrPdfBlob,
  printZoneQrPdfUrl,
  zoneQrPdfFilename,
} from './qrPrint'
import {
  createZoneQrPrintLayout,
  zoneQrPageMeta,
} from './qrLayout'
import { createZoneQrPdfPreviewRenderer } from './qrPreview'

export const route = 'zones'
export const viewId = 'view-zones'
export { template }

const GENERATED_ZONE_QR_FUNCTIONS = new Set([
  'START',
  'STOP',
  'STOP0',
  'STOP5',
  'STOP10',
  'STOP15',
  'CLEAN',
  'STREFA_SPECJALNA',
])
const DEFAULT_FUNCTION_OPTIONS = [
  ...GENERATED_ZONE_QR_FUNCTIONS,
  'STOPO',
  'Strefa specjalna',
]
const PAGE_SIZE_OPTIONS = [50, 100, 200]
const DEFAULT_ZONE_TYPE = 'Biuro'
const FALLBACK_ZONE_TYPE = 'Inne'
export const DEFAULT_ZONE_TYPE_OPTIONS = [
  DEFAULT_ZONE_TYPE,
  'Aneks kuchenny',
  'WC / Prysznic',
  'Szatnia',
  'Ciąg komunikacyjny',
  'Sala konferencyjna',
  'Recepcja',
  'Pomieszczenie gospodarcze',
  'Showroom',
  'Pokój odpoczynku',
  'Piwnica',
  'Magazyn',
  'Serwerownia',
  'Kotłownia',
  'Archiwum',
  FALLBACK_ZONE_TYPE,
]
const CLIENT_TONE_CLASSES = [
  'client-tone-blue',
  'client-tone-pink',
  'client-tone-green',
  'client-tone-amber',
  'client-tone-cyan',
  'client-tone-violet',
  'client-tone-lime',
  'client-tone-orange',
]
const ZONE_FALLBACKS = [
  { className: 'zone-kind-generic-blue', icon: 'building' },
  { className: 'zone-kind-generic-green', icon: 'spark' },
  { className: 'zone-kind-generic-purple', icon: 'box' },
  { className: 'zone-kind-generic-amber', icon: 'utensils' },
  { className: 'zone-kind-generic-cyan', icon: 'monitor' },
]
const ZONE_ICON_HTML = {
  archive:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v11H5z"></path><path d="M4 5h16v3H4z"></path><path d="M9 12h6"></path></svg>',
  building:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21V5h10v16"></path><path d="M4 21h16"></path><path d="M10 9h1"></path><path d="M13 9h1"></path><path d="M10 13h1"></path><path d="M13 13h1"></path></svg>',
  floor:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20h12"></path><path d="M8 16a4 4 0 0 1 8 0"></path><path d="M12 4v8"></path><path d="M9 7l3-3 3 3"></path></svg>',
  monitor:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="10" rx="1.5"></rect><path d="M9 20h6"></path><path d="M12 15v5"></path></svg>',
  spark:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v5"></path><path d="M12 15v5"></path><path d="M4 12h5"></path><path d="M15 12h5"></path><path d="M8 8l-2-2"></path><path d="M16 8l2-2"></path></svg>',
  utensils:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16"></path><path d="M4 4v5a3 3 0 0 0 6 0V4"></path><path d="M17 4v16"></path><path d="M14 4h3a3 3 0 0 1 0 6h-3"></path></svg>',
}

export function createZonesFeature(ctx) {
  const {
    appState,
    createBindingHelpers,
    createZone,
    deleteZone,
    escapeHtml,
    fetchClientsForCurrentSession,
    formatDatePl,
    getZones,
    normalizeSearchText,
    paginate,
    roleLevel,
    setSubwelcomeMetric,
    showTransientNotice,
    toIso,
    updateZone,
  } = ctx

  const zoneComboStates = new Map()
  const deletedZoneIds = new Set()
  let pinnedZoneId = ''
  let zoneModalOriginalQr = ''
  let zoneModalTypeTouched = false
  let zoneQrPreviewBlob = null
  let zoneQrPreviewUrl = ''
  let zoneQrPreviewPage = 1
  let zoneQrPreviewRequest = 0
  let zoneQrPageRenderRequest = 0
  let zoneQrPreviewTimer = 0
  let zoneQrPreviewResizeTimer = 0
  let zoneQrDocumentPages = []
  let zoneQrSavedCodes = []
  let zoneQrGeneratorMode = 'create'
  const zoneQrPdfPreview = createZoneQrPdfPreviewRenderer()
  const zoneQrThumbnailPreview = createZoneQrPdfPreviewRenderer()

  function isTechnicalClientId(value) {
    const text = String(value ?? '').trim()
    return /^CL-\d+$/i.test(text) || /^LK\d+$/i.test(text)
  }

  function clientDisplayName(client = {}) {
    const name = String(client.name ?? client.clientName ?? client.clientLabel ?? '').trim()
    if (name && !isTechnicalClientId(name)) {
      return name
    }
    return ''
  }

  function clientOptionValue(client = {}) {
    return String(client.id ?? client.clientId ?? '').trim()
  }

  function clientNameMap() {
    const map = new Map()
    appState.clients.forEach((client) => {
      const label = clientDisplayName(client)
      if (!label) {
        return
      }

      ;[client.id, client.clientId].forEach((key) => {
        const normalizedKey = String(key ?? '').trim()
        if (normalizedKey) {
          map.set(normalizedKey, label)
        }
      })
    })
    return map
  }

  function zoneRecordId(zone) {
    return String(zone?.id ?? zone?.zoneId ?? zone?.qr ?? zone?.code ?? '').trim()
  }

  function isGeneratedZoneQr(zone) {
    const zoneId = zoneRecordId(zone)
    const functionName = String(zone?.function ?? '').trim().toUpperCase()
    return /^QRC_[a-z0-9_-]+_Z\d+$/i.test(zoneId) && GENERATED_ZONE_QR_FUNCTIONS.has(functionName)
  }

  function canDeleteZones() {
    const roleCode = String(appState.session?.roleCode ?? '').trim().toUpperCase()
    return roleCode === 'ADMIN' || roleCode === 'OWNER' || roleCode === 'PLATFORM_OWNER'
  }

  function canManageZoneQr() {
    return typeof roleLevel === 'function' && roleLevel(appState.session?.role) >= 2
  }

  function setZoneQrEditState() {
    const qrInput = document.getElementById('znEditQr')
    const qrLabel = document.querySelector('label[for="znEditQr"]')
    const canEdit = canManageZoneQr()
    const editedZone = (Array.isArray(appState.zones) ? appState.zones : []).find(
      (zone) => zoneRecordId(zone) === String(appState.zoneModalZoneId ?? '').trim(),
    )
    const generatedStartStop = appState.zoneModalMode === 'edit' && isGeneratedZoneQr(editedZone)

    if (qrInput) {
      qrInput.disabled = !canEdit || generatedStartStop
      qrInput.title = generatedStartStop
        ? 'Identyfikator wygenerowanego kodu QR jest niezmienny.'
        : canEdit
          ? 'ADMIN, Owner lub Manager może zmienić numer QR strefy.'
          : 'Brak uprawnień do edycji numeru QR.'
    }
    if (qrLabel) {
      qrLabel.textContent = generatedStartStop ? 'Numer QR (niezmienny)' : canEdit ? 'Numer QR (A)' : 'Numer QR (A) - blokada'
    }
  }

  function setZoneEditorMutationState() {
    const canEdit = canManageZoneQr()
    const editedZone = (Array.isArray(appState.zones) ? appState.zones : []).find(
      (zone) => zoneRecordId(zone) === String(appState.zoneModalZoneId ?? '').trim(),
    )
    const generatedStartStop = appState.zoneModalMode === 'edit' && isGeneratedZoneQr(editedZone)
    ;['znEditClientText', 'znEditStrefaText', 'znEditLoc'].forEach((id) => {
      const control = document.getElementById(id)
      if (control) control.disabled = !canEdit
    })
    const functionControl = document.getElementById('znEditFunkcjaText')
    if (functionControl) functionControl.disabled = !canEdit || generatedStartStop
    const functionToggle = document.querySelector('[data-zone-combo="znEditFunkcja"] .zones-combo-toggle')
    if (functionToggle) functionToggle.disabled = !canEdit || generatedStartStop
    syncRequiredVisitControl()
    ;['znEditClient', 'znEditStrefa'].forEach((id) => {
      const toggle = document.querySelector(`[data-zone-combo="${id}"] .zones-combo-toggle`)
      if (toggle) toggle.disabled = !canEdit
    })
  }

  function zoneFunctionAllowsRequiredVisit(value) {
    const normalized = String(value ?? '').trim().toUpperCase()
    return Boolean(normalized) && !normalized.startsWith('START') && !normalized.startsWith('STOP')
  }

  function syncRequiredVisitControl(checked) {
    const control = document.getElementById('znEditRequiredVisit')
    if (!(control instanceof HTMLInputElement)) return
    if (typeof checked === 'boolean') control.checked = checked
    const functionName = String(document.getElementById('znEditFunkcja')?.value ?? '').trim()
    const allowed = zoneFunctionAllowsRequiredVisit(functionName)
    if (!allowed) control.checked = false
    control.disabled = !canManageZoneQr() || !allowed
    control.title = allowed
      ? 'Wymagany kod musi zostać zeskanowany przed zakończeniem dnia na obiekcie.'
      : 'Kody START i STOP nie mogą być wymaganymi strefami.'
  }

  function normalizeZoneDate(value) {
    const iso = toIso(value)
    if (iso) {
      return formatDatePl(iso)
    }

    const raw = String(value ?? '').trim()
    return raw || '-'
  }

  function mapZoneForView(zone) {
    const map = clientNameMap()
    const clientId = String(zone.clientId ?? '')
    const resolvedClientName = map.get(clientId) || ''
    const generatedStartStop = isGeneratedZoneQr(zone)
    const unassignedLabel = generatedStartStop ? 'Nieprzypisany' : '-'
    return {
      ...zone,
      qr: zone.qr || zone.id || '-',
      clientId,
      clientName: resolvedClientName || String(zone.clientName ?? '').trim() || unassignedLabel,
      zoneName: zone.name || zone.zone || unassignedLabel,
      location: zone.location || unassignedLabel,
      function: zone.function || '-',
      requiredVisit: zone.requiredVisit === true,
      editedBy: zone.editedBy || '-',
      dateLabel: normalizeZoneDate(zone.date),
    }
  }

  function zoneValueIsEmptyDash(value) {
    const normalized = normalizeSearchText(value)
    return !normalized || normalized === '-'
  }

  function isUnassignedCleanZone(zone) {
    const clientKey = normalizeSearchText(zone.clientName || zone.clientId)
    const functionKey = normalizeSearchText(zone.function)
    return (
      clientKey === 'unassigned' &&
      functionKey === 'clean' &&
      zoneValueIsEmptyDash(zone.zoneName) &&
      zoneValueIsEmptyDash(zone.location)
    )
  }

  function visiblePortalZones() {
    return (Array.isArray(appState.zones) ? appState.zones : [])
      .filter((zone) => !deletedZoneIds.has(zoneRecordId(zone)))
      .map((zone) => mapZoneForView(zone))
      .filter((zone) => !isUnassignedCleanZone(zone))
  }

  function compareZoneText(left, right) {
    return String(left ?? '').localeCompare(String(right ?? ''), 'pl', { numeric: true, sensitivity: 'base' })
  }

  function zoneHasAssignedClient(zone) {
    const clientNameKey = normalizeSearchText(zone.clientName)
    const clientIdKey = normalizeSearchText(zone.clientId)
    return Boolean(
      clientNameKey &&
        clientNameKey !== '-' &&
        !['unassigned', 'nieprzypisany'].includes(clientNameKey) &&
        clientIdKey !== 'unassigned',
    )
  }

  function zoneClientSortRank(zone) {
    return zoneHasAssignedClient(zone) ? 0 : 1
  }

  function zoneClientSortLabel(zone) {
    return zoneHasAssignedClient(zone) ? zone.clientName : ''
  }

  function sortZonesForView(zones) {
    const sorted = [...zones]
    sorted.sort(
      (left, right) =>
        (pinnedZoneId && String(right.id ?? '') === pinnedZoneId ? 1 : 0) -
          (pinnedZoneId && String(left.id ?? '') === pinnedZoneId ? 1 : 0) ||
        zoneClientSortRank(left) - zoneClientSortRank(right) ||
        compareZoneText(zoneClientSortLabel(left), zoneClientSortLabel(right)) ||
        compareZoneText(left.function, right.function) ||
        compareZoneText(left.zoneName, right.zoneName) ||
        compareZoneText(left.qr, right.qr),
    )
    return sorted
  }

  function uniqueClientCount(zones) {
    const keys = new Set()
    zones.forEach((zone) => {
      const key = String(zone.clientId || zone.clientName || '').trim()
      if (key && key !== '-' && normalizeSearchText(key) !== 'nieprzypisany') {
        keys.add(key)
      }
    })
    return keys.size
  }

  function isCleanFunction(zone) {
    return normalizeSearchText(zone.function) === 'clean'
  }

  function isSpecialZone(zone) {
    return [zone.function, zone.zoneName].some((value) => normalizeSearchText(value).includes('specjal'))
  }

  function setText(id, value) {
    const node = document.getElementById(id)
    if (node) {
      node.textContent = String(value)
    }
  }

  function updateZonesKpis() {
    const zones = visiblePortalZones()
    setText('znKpiAll', zones.length)
    setText('znKpiClients', uniqueClientCount(zones))
    setText('znKpiClean', zones.filter(isCleanFunction).length)
    setText('znKpiSpecial', zones.filter(isSpecialZone).length)
  }

  function sortedClientOptions() {
    const map = new Map()
    appState.clients.forEach((client) => {
      const value = clientOptionValue(client)
      const label = clientDisplayName(client)
      if (!value || !label) {
        return
      }
      map.set(value, label)
    })
    visiblePortalZones().forEach((zone) => {
      const value = String(zone.clientId || zone.clientName || '').trim()
      const label = String(zone.clientName || '').trim()
      if (!value || value === '-' || map.has(value) || !label || label === '-' || isTechnicalClientId(label)) {
        return
      }
      map.set(value, label)
    })

    return [...map.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => compareZoneText(left.label, right.label) || compareZoneText(left.value, right.value))
  }

  function comboElements(id) {
    const root = document.querySelector(`#view-zones [data-zone-combo="${id}"]`)
    if (!root) {
      return null
    }

    return {
      hiddenInput: document.getElementById(id),
      list: root.querySelector('.zones-combo-list'),
      root,
      textInput: root.querySelector('.zones-combo-input'),
      toggle: root.querySelector('.zones-combo-toggle'),
    }
  }

  function comboState(id) {
    if (!zoneComboStates.has(id)) {
      zoneComboStates.set(id, {
        activeIndex: -1,
        allowFreeText: false,
        filteredOptions: [],
        open: false,
        options: [],
        placeholder: '',
        query: '',
        selectedValue: '',
      })
    }

    return zoneComboStates.get(id)
  }

  function normalizeComboOptions(options) {
    return options
      .map((optionData) => ({
        label: String(optionData.label ?? optionData.value ?? '').trim(),
        value: String(optionData.value ?? '').trim(),
      }))
      .filter((optionData) => optionData.value || optionData.label)
  }

  function comboOptionMatches(optionData, query) {
    const key = normalizeSearchText(query)
    if (!key) {
      return true
    }

    return [optionData.label, optionData.value].some((value) => normalizeSearchText(value).includes(key))
  }

  function findComboOption(options, value) {
    const selectedValue = String(value ?? '').trim()
    return options.find((optionData) => optionData.value === selectedValue) ?? null
  }

  function getComboFilteredOptions(id) {
    const state = comboState(id)
    return state.options.filter((optionData) => comboOptionMatches(optionData, state.query))
  }

  function readComboValue(id) {
    const elements = comboElements(id)
    return String(elements?.hiddenInput?.value ?? '').trim()
  }

  function readComboText(id) {
    const elements = comboElements(id)
    return String(elements?.textInput?.value ?? '').trim()
  }

  function renderComboOptions(id) {
    const elements = comboElements(id)
    if (!elements?.list) {
      return
    }

    const state = comboState(id)
    const filteredOptions = getComboFilteredOptions(id)
    state.filteredOptions = filteredOptions

    if (!filteredOptions.length) {
      state.activeIndex = -1
      elements.list.innerHTML = '<div class="zones-combo-empty">Brak opcji</div>'
      return
    }

    if (state.activeIndex < 0 || state.activeIndex >= filteredOptions.length) {
      const selectedIndex = filteredOptions.findIndex((optionData) => optionData.value === state.selectedValue)
      state.activeIndex = selectedIndex >= 0 ? selectedIndex : 0
    }

    elements.list.innerHTML = filteredOptions
      .map((optionData, index) => {
        const isSelected = optionData.value === state.selectedValue
        const isActive = index === state.activeIndex
        const classes = ['zones-combo-option']
        if (isSelected) classes.push('is-selected')
        if (isActive) classes.push('is-active')
        return `
          <button
            class="${classes.join(' ')}"
            type="button"
            role="option"
            aria-selected="${isSelected ? 'true' : 'false'}"
            data-combo-value="${escapeHtml(optionData.value)}"
          >${escapeHtml(optionData.label || optionData.value)}</button>
        `
      })
      .join('')
  }

  function closeCombo(id, { restoreText = true } = {}) {
    const elements = comboElements(id)
    if (!elements) {
      return
    }

    const state = comboState(id)
    state.open = false
    elements.root.classList.remove('is-open')
    elements.textInput?.setAttribute('aria-expanded', 'false')

    if (!restoreText || !elements.textInput) {
      return
    }

    const selectedOption = findComboOption(state.options, state.selectedValue)
    if (selectedOption) {
      elements.textInput.value = selectedOption.label || selectedOption.value
      state.query = ''
      return
    }

    if (!state.allowFreeText) {
      elements.textInput.value = ''
      state.query = ''
      return
    }

    state.query = elements.textInput.value
  }

  function closeAllCombos(exceptId = '') {
    zoneComboStates.forEach((_, id) => {
      if (id !== exceptId) {
        closeCombo(id)
      }
    })
  }

  function openCombo(id) {
    const elements = comboElements(id)
    if (!elements) {
      return
    }

    const state = comboState(id)
    closeAllCombos(id)
    state.open = true
    state.query = state.selectedValue ? '' : String(elements.textInput?.value ?? '')
    state.activeIndex = -1
    elements.root.classList.add('is-open')
    elements.textInput?.setAttribute('aria-expanded', 'true')
    renderComboOptions(id)
  }

  function selectComboOption(id, optionData) {
    const elements = comboElements(id)
    if (!elements?.hiddenInput || !elements.textInput || !optionData) {
      return
    }

    if (id === 'znEditStrefa' && appState.zoneModalMode === 'add') {
      zoneModalTypeTouched = true
    }

    const state = comboState(id)
    const value = String(optionData.value ?? '').trim()
    state.selectedValue = value
    state.query = ''
    elements.hiddenInput.value = value
    elements.textInput.value = String(optionData.label || optionData.value || '').trim()
    if (id === 'znEditFunkcja') syncRequiredVisitControl()
    closeCombo(id, { restoreText: false })
    elements.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function clearCombo(id) {
    const elements = comboElements(id)
    if (!elements) {
      return
    }

    const state = comboState(id)
    state.selectedValue = ''
    state.query = ''
    if (elements.hiddenInput) {
      elements.hiddenInput.value = ''
    }
    if (elements.textInput) {
      elements.textInput.value = ''
    }
    closeCombo(id, { restoreText: false })
  }

  function fillCombo(id, options, { allowFreeText = false, displayText = '', fallbackLabel = '', placeholder = '(wybierz)', selected = '' } = {}) {
    const elements = comboElements(id)
    if (!elements?.hiddenInput || !elements.textInput) {
      return
    }

    const selectedValue = String(selected ?? '').trim()
    const normalizedOptions = normalizeComboOptions(options)
    const selectedExists = normalizedOptions.some((optionData) => optionData.value === selectedValue)

    if (selectedValue && !selectedExists) {
      normalizedOptions.push({
        label: fallbackLabel ? `${fallbackLabel} (spoza listy)` : `${selectedValue} (spoza listy)`,
        value: selectedValue,
      })
    }

    const state = comboState(id)
    state.allowFreeText = allowFreeText
    state.options = normalizedOptions
    state.placeholder = placeholder
    state.selectedValue = selectedValue
    elements.hiddenInput.value = selectedValue
    elements.textInput.placeholder = placeholder

    const selectedOption = findComboOption(normalizedOptions, selectedValue)
    if (selectedOption) {
      elements.textInput.value = selectedOption.label || selectedOption.value
      state.query = ''
    } else {
      elements.textInput.value = String(displayText ?? '').trim()
      state.query = allowFreeText ? elements.textInput.value : ''
    }

    renderComboOptions(id)
  }

  function syncClientSelects() {
    const options = sortedClientOptions()
    fillCombo('znClient', options, {
      allowFreeText: true,
      displayText: readComboValue('znClient') ? '' : readComboText('znClient'),
      placeholder: 'np. TS',
      selected: readComboValue('znClient'),
    })
    fillCombo('znEditClient', options, {
      placeholder: '-- wybierz --',
      selected: readComboValue('znEditClient'),
    })
    fillCombo('znQrClient', options, {
      placeholder: 'Nieprzypisany',
      selected: readComboValue('znQrClient'),
    })
  }

  function zoneTypeOptions() {
    return DEFAULT_ZONE_TYPE_OPTIONS.map((value) => ({ value, label: value }))
  }

  function closedZoneTypeValue(value, fallback = '') {
    const key = normalizeSearchText(value)
    if (!key) {
      return fallback
    }

    return DEFAULT_ZONE_TYPE_OPTIONS.find((option) => normalizeSearchText(option) === key) ?? fallback
  }

  function readClosedZoneComboValue(id) {
    return closedZoneTypeValue(readComboValue(id)) || closedZoneTypeValue(readComboText(id))
  }

  function syncZoneSelects() {
    const options = zoneTypeOptions()
    const filterSelected = closedZoneTypeValue(readComboValue('znStrefa')) || closedZoneTypeValue(readComboText('znStrefa'))
    const editSelected = closedZoneTypeValue(readComboValue('znEditStrefa')) || closedZoneTypeValue(readComboText('znEditStrefa'))
    fillCombo('znStrefa', options, {
      allowFreeText: false,
      placeholder: 'Wybierz...',
      selected: filterSelected,
    })
    fillCombo('znEditStrefa', options, {
      allowFreeText: false,
      placeholder: 'Wybierz...',
      selected: editSelected,
    })
    const qrSelected = closedZoneTypeValue(readComboValue('znQrZone')) || closedZoneTypeValue(readComboText('znQrZone'))
    fillCombo('znQrZone', options, {
      allowFreeText: false,
      placeholder: 'Nieprzypisana',
      selected: qrSelected,
    })
  }

  function setModalZoneValue(value = '') {
    const selected = closedZoneTypeValue(value, value ? FALLBACK_ZONE_TYPE : '')
    fillCombo('znEditStrefa', zoneTypeOptions(), {
      allowFreeText: false,
      placeholder: 'Wybierz...',
      selected,
    })
  }

  function functionOptions() {
    const values = new Map()
    DEFAULT_FUNCTION_OPTIONS.forEach((value) => values.set(normalizeSearchText(value), value))
    visiblePortalZones().forEach((zone) => {
      const raw = String(zone.function ?? '').trim()
      const key = normalizeSearchText(raw)
      if (raw && raw !== '-' && !values.has(key)) {
        values.set(key, raw)
      }
    })

    return [...values.values()]
      .map((value) => ({ value, label: value }))
      .sort((left, right) => compareZoneText(left.label, right.label))
  }

  function syncFunctionSelect(selected = '') {
    fillCombo('znEditFunkcja', functionOptions(), {
      placeholder: '-- wybierz --',
      selected,
      fallbackLabel: selected,
    })
  }

  function syncFunctionFilterSelect() {
    fillCombo('znFunkcja', functionOptions(), {
      allowFreeText: true,
      displayText: readComboValue('znFunkcja') ? '' : readComboText('znFunkcja'),
      placeholder: 'np. CLEAN / START',
      selected: readComboValue('znFunkcja'),
    })
  }

  function pageSizeOptions() {
    return PAGE_SIZE_OPTIONS.map((value) => ({ value: String(value), label: String(value) }))
  }

  function readClientFilter() {
    return readComboValue('znClient') || readComboText('znClient')
  }

  function readZoneFilter() {
    return readClosedZoneComboValue('znStrefa')
  }

  function readFunctionFilter() {
    return readComboValue('znFunkcja') || readComboText('znFunkcja')
  }

  function readModalZoneValue() {
    return readClosedZoneComboValue('znEditStrefa')
  }

  function getFilteredZones() {
    const qrFilter = String(document.getElementById('znQr')?.value ?? '').trim().toLowerCase()
    const clientFilter = readClientFilter().toLowerCase()
    const zoneFilter = readZoneFilter().toLowerCase()
    const locationFilter = String(document.getElementById('znLoc')?.value ?? '').trim().toLowerCase()
    const functionFilter = readFunctionFilter().toLowerCase()
    const editedByFilter = String(document.getElementById('znEditedBy')?.value ?? '').trim().toLowerCase()
    const q = String(document.getElementById('znQ')?.value ?? '').trim().toLowerCase()

    return sortZonesForView(
      visiblePortalZones().filter((zone) => {
        if (qrFilter && !String(zone.qr).toLowerCase().includes(qrFilter)) return false
        if (
          clientFilter &&
          String(zone.clientId).toLowerCase() !== clientFilter &&
          !String(zone.clientName).toLowerCase().includes(clientFilter)
        ) {
          return false
        }
        if (zoneFilter && !String(zone.zoneName).toLowerCase().includes(zoneFilter)) return false
        if (locationFilter && !String(zone.location).toLowerCase().includes(locationFilter)) return false
        if (functionFilter && !String(zone.function).toLowerCase().includes(functionFilter)) return false
        if (editedByFilter && !String(zone.editedBy).toLowerCase().includes(editedByFilter)) return false

        if (!q) {
          return true
        }

        const haystack = [zone.qr, zone.clientName, zone.clientId, zone.zoneName, zone.location, zone.function, zone.editedBy, zone.dateLabel]
          .map((value) => String(value ?? '').toLowerCase())
          .join(' ')

        return haystack.includes(q)
      }),
    )
  }

  function zoneInitials(value) {
    const words = String(value ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
    if (!words.length) {
      return 'QR'
    }
    const initials = words.slice(0, 2).map((word) => word[0]).join('')
    return initials.toUpperCase()
  }

  function visualHash(value) {
    const text = normalizeSearchText(value)
    let hash = 0
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) % 1000003
    }
    return hash
  }

  function paletteClass(value, classes) {
    if (!classes.length) {
      return ''
    }
    return classes[visualHash(value) % classes.length]
  }

  function clientVisualMeta(zone) {
    const label = normalizeSearchText(`${zone.clientName} ${zone.clientId}`)
    if (label.includes('best clean') || label.includes('bestclean')) {
      return { className: 'client-tone-blue' }
    }
    if (label.includes('as michal herman') || label.includes('activ space')) {
      return { className: 'client-tone-pink' }
    }
    return { className: paletteClass(zone.clientId || zone.clientName, CLIENT_TONE_CLASSES) }
  }

  function zoneIconHtml(icon) {
    return ZONE_ICON_HTML[icon] || ZONE_ICON_HTML.building
  }

  function zoneVisualMeta(zone) {
    const zoneKey = normalizeSearchText(zone.zoneName)
    if (zoneKey.includes('aneks') || zoneKey.includes('kuchnia') || zoneKey.includes('kuchenny')) {
      return { className: 'zone-kind-kitchen', iconHtml: zoneIconHtml('utensils') }
    }
    if (zoneKey.includes('archiwum')) {
      return { className: 'zone-kind-archive', iconHtml: zoneIconHtml('archive') }
    }
    if (zoneKey.includes('parter')) {
      return { className: 'zone-kind-floor', iconHtml: zoneIconHtml('floor') }
    }
    if (zoneKey.includes('pietro') || zoneKey.includes('piętro')) {
      return { className: 'zone-kind-desk', iconHtml: zoneIconHtml('monitor') }
    }
    if (zoneKey.includes('biuro')) {
      return { className: 'zone-kind-office', iconHtml: zoneIconHtml('building') }
    }

    const fallback = ZONE_FALLBACKS[visualHash(zone.zoneName || zone.qr) % ZONE_FALLBACKS.length]
    return {
      className: fallback.className,
      iconHtml: zoneIconHtml(fallback.icon),
    }
  }

  function zoneToneClass(zone) {
    const functionKey = normalizeSearchText(zone.function)
    if (functionKey === 'clean') return 'is-clean'
    if (functionKey.includes('stop')) return 'is-stop'
    if (functionKey.includes('start')) return 'is-start'
    if (isSpecialZone(zone)) return 'is-special'
    return 'is-neutral'
  }

  function renderEmptyRow(message, tone = '') {
    const root = document.getElementById('znRows')
    if (!root) {
      return
    }

    root.innerHTML = `
      <div class="zones-row zones-row--empty${tone ? ` ${tone}` : ''}">
        <div>${escapeHtml(message)}</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
      </div>
    `
  }

  function renderZonesRows(rows) {
    const root = document.getElementById('znRows')
    if (!root) {
      return
    }

    if (!rows.length) {
      renderEmptyRow('Brak wyników')
      return
    }

    root.innerHTML = rows
      .map((zone) => {
        const toneClass = zoneToneClass(zone)
        const clientVisual = clientVisualMeta(zone)
        const zoneVisual = zoneVisualMeta(zone)
        const clientInitials = normalizeSearchText(zone.clientName) === 'nieprzypisany' ? 'QR' : zoneInitials(zone.clientName)
        const clientIdLabel = zone.clientId || (normalizeSearchText(zone.clientName) === 'nieprzypisany' ? 'Brak klienta' : '-')
        return `
          <div class="zones-row">
            <div class="zones-qr-cell">
              <span class="zones-qr-badge">QR</span>
              <span>
                <strong>${escapeHtml(zone.qr)}</strong>
                <small>Kod QR</small>
              </span>
            </div>
            <div class="zones-client-cell">
              <span class="zones-client-avatar ${clientVisual.className}">${escapeHtml(clientInitials)}</span>
              <span>
                <strong>${escapeHtml(zone.clientName)}</strong>
                <small>${escapeHtml(clientIdLabel)}</small>
              </span>
            </div>
            <div class="zones-zone-cell">
              <span class="zones-zone-icon ${zoneVisual.className}" aria-hidden="true">${zoneVisual.iconHtml}</span>
              <strong title="${escapeHtml(zone.zoneName)}">${escapeHtml(zone.zoneName)}</strong>
            </div>
            <div title="${escapeHtml(zone.location)}"><span class="zones-location-text">${escapeHtml(zone.location)}</span></div>
            <div class="zones-function-cell">
              <span class="zones-function-pill ${toneClass}">${escapeHtml(zone.function)}</span>
              ${zone.requiredVisit ? '<span class="zones-required-visit-pill">Wymagana wizyta</span>' : ''}
            </div>
            <div class="zones-date-cell">${escapeHtml(zone.dateLabel)}</div>
            <div><strong>${escapeHtml(zone.editedBy)}</strong></div>
            <div class="zones-actions">
              <button class="btn2 zones-action-btn" type="button" data-zone-id="${escapeHtml(zone.id)}" aria-label="Podgląd strefy ${escapeHtml(zone.qr)}">&#8942;</button>
            </div>
          </div>
        `
      })
      .join('')
  }

  function syncPageSizeSelect() {
    const elements = comboElements('znPageSize')
    if (!elements?.hiddenInput || !elements.textInput) {
      return
    }

    const normalized = PAGE_SIZE_OPTIONS.includes(Number(appState.zonesPageSize)) ? Number(appState.zonesPageSize) : 50
    appState.zonesPageSize = normalized
    fillCombo('znPageSize', pageSizeOptions(), {
      allowFreeText: false,
      placeholder: '50',
      selected: String(normalized),
    })
  }

  function updateZonesPager(paged) {
    const pageLabel = document.getElementById('znPageLabel')
    const label = document.getElementById('znShownLabel')
    const prevBtn = document.getElementById('znPrevBtn')
    const nextBtn = document.getElementById('znNextBtn')

    if (pageLabel) {
      pageLabel.textContent = `Strona ${paged.page} / ${paged.totalPages}`
    }

    if (label) {
      label.textContent = `Wyświetlono: ${paged.items.length} · Wszystkie: ${paged.total} · Na stronę: ${paged.pageSize}`
    }

    if (prevBtn) {
      prevBtn.disabled = paged.page <= 1
    }

    if (nextBtn) {
      nextBtn.disabled = paged.page >= paged.totalPages
    }
  }

  function clearPinnedZone() {
    pinnedZoneId = ''
  }

  function upsertLocalZone(zone) {
    const zoneId = zoneRecordId(zone)
    if (!zoneId) {
      return
    }

    appState.zones = [
      zone,
      ...(Array.isArray(appState.zones) ? appState.zones : []).filter((item) => zoneRecordId(item) !== zoneId),
    ]
    appState.zonesLoaded = true
  }

  function removeLocalZone(zoneId) {
    const normalized = String(zoneId ?? '').trim()
    if (!normalized) {
      return
    }

    appState.zones = (Array.isArray(appState.zones) ? appState.zones : []).filter((zone) => zoneRecordId(zone) !== normalized)
    appState.zonesLoaded = true
  }

  function zoneQrExists(qr, exceptZoneId = '') {
    const normalizedQr = String(qr ?? '').trim().toLowerCase()
    const normalizedExcept = String(exceptZoneId ?? '').trim().toLowerCase()
    if (!normalizedQr) {
      return false
    }

    return (Array.isArray(appState.zones) ? appState.zones : []).some((zone) => {
      const zoneId = zoneRecordId(zone).toLowerCase()
      return zoneId === normalizedQr && zoneId !== normalizedExcept
    })
  }

  function filterZonesTable({ resetPage = true } = {}) {
    syncClientSelects()
    syncZoneSelects()
    syncFunctionFilterSelect()
    updateZonesKpis()
    syncPageSizeSelect()

    const filtered = getFilteredZones()
    if (resetPage) {
      appState.zonesPage = 1
    }

    const paged = paginate(filtered, appState.zonesPage, appState.zonesPageSize)
    appState.zonesPage = paged.page
    appState.zonesTotal = paged.total
    appState.zonesTotalPages = paged.totalPages

    renderZonesRows(paged.items)
    updateZonesPager(paged)
  }

  async function ensureClientsForZones() {
    if (appState.clientsLoaded && Array.isArray(appState.clients) && appState.clients.length) {
      syncClientSelects()
      return
    }

    try {
      if (typeof fetchClientsForCurrentSession === 'function') {
        try {
          await fetchClientsForCurrentSession(false)
        } catch {
          // The client profile feature can be lazy-loaded after Zones.
        }
      }
      if ((!Array.isArray(appState.clients) || !appState.clients.length) && appState.session?.orgId) {
        appState.clients = await getClients(appState.session.orgId)
        appState.clientsLoaded = true
      }
    } catch {
      // Zones can still render without client labels if the client list is unavailable.
    } finally {
      syncClientSelects()
    }
  }

  async function fetchZonesForCurrentSession(force = false, { fallbackZone = null, preservePinnedZone = false } = {}) {
    const root = document.getElementById('znRows')
    syncPageSizeSelect()

    if (force && !preservePinnedZone) {
      clearPinnedZone()
    }

    if (!appState.session?.orgId) {
      renderEmptyRow('Brak aktywnej sesji.', 'is-error')
      updateZonesKpis()
      return
    }

    if (!force && appState.zonesLoaded) {
      filterZonesTable({ resetPage: false })
      if (!appState.clientsLoaded || !Array.isArray(appState.clients) || !appState.clients.length) {
        void ensureClientsForZones()
          .then(() => filterZonesTable({ resetPage: false }))
          .catch(() => {})
      }
      return
    }

    if (root) {
      renderEmptyRow('Ładowanie danych...')
    }

    const clientsPromise = ensureClientsForZones()
    try {
      const zones = await getZones(appState.session.orgId)
      const backendZoneIds = new Set(zones.map((zone) => zoneRecordId(zone)).filter(Boolean))
      deletedZoneIds.forEach((zoneId) => {
        if (!backendZoneIds.has(zoneId)) {
          deletedZoneIds.delete(zoneId)
        }
      })

      const visibleZones = zones.filter((zone) => !deletedZoneIds.has(zoneRecordId(zone)))
      const fallbackZoneId = zoneRecordId(fallbackZone)
      const nextZones =
        fallbackZoneId && !deletedZoneIds.has(fallbackZoneId) && !visibleZones.some((zone) => zoneRecordId(zone) === fallbackZoneId)
          ? [fallbackZone, ...visibleZones]
          : visibleZones
      appState.zones = nextZones
      appState.zonesLoaded = true
      filterZonesTable({ resetPage: true })
      setSubwelcomeMetric('#view-zones .subwelcome', visiblePortalZones().length)
      void clientsPromise
        .then(() => filterZonesTable({ resetPage: false }))
        .catch(() => {})
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Błąd pobierania stref.'
      renderEmptyRow(message, 'is-error')
      updateZonesKpis()
    }
  }

  function resetZoneFilters() {
    clearPinnedZone()
    ;['znQr', 'znLoc', 'znEditedBy', 'znQ'].forEach((id) => {
      const input = document.getElementById(id)
      if (input) {
        input.value = ''
      }
    })
    clearCombo('znClient')
    clearCombo('znStrefa')
    clearCombo('znFunkcja')
  }

  function closeZoneModal() {
    const overlay = document.getElementById('znEditorOverlay')
    if (overlay) {
      overlay.style.display = 'none'
    }

    appState.zoneModalMode = 'add'
    appState.zoneModalZoneId = ''
    zoneModalOriginalQr = ''
    zoneModalTypeTouched = false
  }

  function nextZoneQrCode() {
    const numbers = appState.zones
      .map((zone) => String(zone.id ?? '').trim().toUpperCase())
      .map((value) => {
        const match = value.match(/^BC(\d{1,6})$/)
        return match ? Number(match[1]) : Number.NaN
      })
      .filter((value) => Number.isFinite(value))

    const next = (numbers.length ? Math.max(...numbers) : 0) + 1
    return `BC${String(next).padStart(4, '0')}`
  }

  function setModalClientValue(value, label = '') {
    fillCombo('znEditClient', sortedClientOptions(), {
      placeholder: '-- wybierz --',
      selected: value,
      fallbackLabel: label || value,
    })
  }

  function zoneQrQuantityValue(id) {
    const rawQuantity = String(document.getElementById(id)?.value ?? '').trim()
    if (!rawQuantity) return 0
    const quantity = Number(rawQuantity)
    return Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 100 ? quantity : 0
  }

  function selectedZoneQrItems() {
    const items = []
    if (document.getElementById('znQrFunctionStart')?.checked) {
      items.push({ function: 'START', quantity: zoneQrQuantityValue('znQrStartQuantity') })
    }
    if (document.getElementById('znQrFunctionStop')?.checked) {
      items.push({
        function: String(document.getElementById('znQrStopVariant')?.value || 'STOP').toUpperCase(),
        quantity: zoneQrQuantityValue('znQrStopQuantity'),
      })
    }
    if (document.getElementById('znQrFunctionClean')?.checked) {
      items.push({ function: 'CLEAN', quantity: zoneQrQuantityValue('znQrCleanQuantity') })
    }
    if (document.getElementById('znQrFunctionSpecial')?.checked) {
      items.push({ function: 'STREFA_SPECJALNA', quantity: zoneQrQuantityValue('znQrSpecialQuantity') })
    }
    return items.filter((item) => GENERATED_ZONE_QR_FUNCTIONS.has(item.function))
  }

  function zoneQrPreviewOrgToken() {
    return String(appState.session?.orgId ?? 'org')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '')
      .slice(0, 42) || 'org'
  }

  function zoneQrSelectedClient() {
    const clientId = readComboValue('znQrClient')
    const client = (Array.isArray(appState.clients) ? appState.clients : []).find(
      (item) => clientOptionValue(item) === clientId,
    )
    return {
      clientId,
      clientName: client ? clientDisplayName(client) : '',
    }
  }

  function zoneQrPreviewCodes() {
    if (zoneQrSavedCodes.length) return zoneQrSavedCodes
    const items = selectedZoneQrItems()
    const client = zoneQrSelectedClient()
    const zoneName = readClosedZoneComboValue('znQrZone')
    if (!items.length || items.some((item) => !item.quantity)) return []
    return items.flatMap((item) => Array.from({ length: item.quantity }, (_, index) => {
      const previewId = `QRC_${zoneQrPreviewOrgToken()}_Z_PREVIEW_${item.function}_${index + 1}`
      return {
        id: previewId,
        zoneId: previewId,
        qr: previewId,
        function: item.function,
        clientId: client.clientId,
        clientName: client.clientName,
        name: zoneName,
        zone: zoneName,
      }
    }))
  }

  function zoneQrPrintOptions() {
    const timePosterFormat = document.querySelector('input[name="znQrTimeFormat"]:checked')?.value || 'A4_HALF'
    const labelSizeMm = Number(document.querySelector('input[name="znQrLabelSize"]:checked')?.value) === 25 ? 25 : 40
    return { timePosterFormat, labelSizeMm }
  }

  function resetZoneQrPrintOptions() {
    const timeFormat = document.querySelector('input[name="znQrTimeFormat"][value="A4_HALF"]')
    const labelSize = document.querySelector('input[name="znQrLabelSize"][value="40"]')
    if (timeFormat instanceof HTMLInputElement) timeFormat.checked = true
    if (labelSize instanceof HTMLInputElement) labelSize.checked = true
  }

  function syncZoneQrFormatSummary(codes = zoneQrPreviewCodes()) {
    const layout = createZoneQrPrintLayout(codes, zoneQrPrintOptions())
    const timeCard = document.getElementById('znQrTimeFormatCard')
    const zoneCard = document.getElementById('znQrZoneFormatCard')
    const timeMeta = document.getElementById('znQrTimeFormatMeta')
    const zoneMeta = document.getElementById('znQrZoneFormatMeta')
    const summary = document.getElementById('znQrFormatSummary')

    timeCard?.classList.toggle('is-active', layout.timeCodeCount > 0)
    zoneCard?.classList.toggle('is-active', layout.zoneCodeCount > 0)
    if (timeMeta) {
      timeMeta.textContent = layout.timeCodeCount
        ? `${layout.timeCodeCount} kodów · ${layout.timeCapacity} na stronie · ${layout.timePageCount} ${layout.timePageCount === 1 ? 'strona' : 'strony'}`
        : 'Aktywuje się dla START lub STOP'
    }
    if (zoneMeta) {
      zoneMeta.textContent = layout.zoneCodeCount
        ? `${layout.zoneCodeCount} kodów · ${layout.labelGrid.capacity} na stronie · ${layout.zonePageCount} ${layout.zonePageCount === 1 ? 'strona' : 'strony'}`
        : 'Aktywuje się dla stref'
    }
    if (summary) {
      summary.textContent = layout.totalCodes
        ? `${layout.totalCodes} kodów · ${layout.totalPages} ${layout.totalPages === 1 ? 'strona PDF' : 'strony PDF'}${layout.isMixed ? ' · układ mieszany' : ''}`
        : 'Wybierz funkcję, aby zobaczyć liczbę stron.'
    }
    return layout
  }

  function setZoneQrStatus(message = '', tone = '') {
    const node = document.getElementById('znQrStatus')
    if (!node) return
    node.textContent = String(message)
    node.dataset.tone = message ? tone : ''
  }

  function setZoneQrOutputButtons(enabled) {
    const ready = Boolean(enabled && zoneQrPreviewBlob && zoneQrPreviewUrl && zoneQrSavedCodes.length)
    ;['znQrDownloadBtn', 'znQrPrintBtn'].forEach((id) => {
      const button = document.getElementById(id)
      if (button) button.disabled = !ready
    })
  }

  function setZoneQrGenerateButtonLabel(label) {
    const button = document.getElementById('znQrGenerateBtn')
    const labelNode = button?.querySelector('span:first-child')
    if (labelNode) labelNode.textContent = String(label)
  }

  function setZoneQrFormLocked(locked) {
    ;['znQrFunctionStart', 'znQrFunctionStop', 'znQrFunctionClean', 'znQrFunctionSpecial', 'znQrClientText', 'znQrZoneText'].forEach((id) => {
      const control = document.getElementById(id)
      if (control) control.disabled = Boolean(locked)
    })
    const stopVariant = document.getElementById('znQrStopVariant')
    if (stopVariant) stopVariant.disabled = Boolean(locked) || !document.getElementById('znQrFunctionStop')?.checked
    ;[
      ['znQrStartQuantity', 'znQrFunctionStart'],
      ['znQrStopQuantity', 'znQrFunctionStop'],
      ['znQrCleanQuantity', 'znQrFunctionClean'],
      ['znQrSpecialQuantity', 'znQrFunctionSpecial'],
    ].forEach(([quantityId, checkboxId]) => {
      const quantity = document.getElementById(quantityId)
      if (quantity) quantity.disabled = Boolean(locked) || !document.getElementById(checkboxId)?.checked
    })
    const quantityCheckboxes = {
      znQrStartQuantity: 'znQrFunctionStart',
      znQrStopQuantity: 'znQrFunctionStop',
      znQrCleanQuantity: 'znQrFunctionClean',
      znQrSpecialQuantity: 'znQrFunctionSpecial',
    }
    document.querySelectorAll('[data-zone-qr-quantity-target]').forEach((button) => {
      const targetId = String(button.dataset.zoneQrQuantityTarget || '')
      const checkboxId = quantityCheckboxes[targetId]
      button.disabled = Boolean(locked) || !document.getElementById(checkboxId)?.checked
    })
    ;['znQrClient', 'znQrZone'].forEach((id) => {
      const toggle = document.querySelector(`[data-zone-combo="${id}"] .zones-combo-toggle`)
      if (toggle) toggle.disabled = Boolean(locked)
    })
  }

  function releaseZoneQrPreview() {
    if (zoneQrPreviewTimer) {
      window.clearTimeout(zoneQrPreviewTimer)
      zoneQrPreviewTimer = 0
    }
    zoneQrPreviewRequest += 1
    zoneQrPageRenderRequest += 1
    if (zoneQrPreviewResizeTimer) {
      window.clearTimeout(zoneQrPreviewResizeTimer)
      zoneQrPreviewResizeTimer = 0
    }
    if (zoneQrPreviewUrl) {
      URL.revokeObjectURL(zoneQrPreviewUrl)
      zoneQrPreviewUrl = ''
    }
    zoneQrPreviewBlob = null
    zoneQrDocumentPages = []
    void zoneQrPdfPreview.destroy()
    void zoneQrThumbnailPreview.destroy()
    const canvas = document.getElementById('znQrPreviewCanvas')
    const host = document.getElementById('znQrPreviewCanvasHost')
    const pageStrip = document.getElementById('znQrPageStrip')
    const pagesOverview = document.getElementById('znQrPreviewPagesOverview')
    if (canvas instanceof HTMLCanvasElement) {
      canvas.hidden = true
      canvas.width = 0
      canvas.height = 0
    }
    pageStrip?.replaceChildren()
    if (pagesOverview) pagesOverview.hidden = true
    host?.setAttribute('aria-busy', 'false')
  }

  function zoneQrPreviewPageLabel(page) {
    const functionNames = [...new Set((Array.isArray(page?.codes) ? page.codes : []).map((code) => {
      const functionName = String(code?.function || '').toUpperCase()
      if (functionName === 'CLEAN') return 'STREFA'
      if (functionName === 'STREFA_SPECJALNA') return 'STREFA SPECJALNA'
      return functionName
    }).filter(Boolean))]
    return functionNames.join(' + ') || 'KODY QR'
  }

  function updateZoneQrPageNavigation() {
    const total = zoneQrDocumentPages.length
    zoneQrPreviewPage = total ? Math.min(Math.max(zoneQrPreviewPage, 1), total) : 1
    const page = total ? zoneQrDocumentPages[zoneQrPreviewPage - 1] : null
    const pageMeta = zoneQrPageMeta(page, total)
    const meta = document.getElementById('znQrPreviewMeta')
    const format = document.getElementById('znQrPreviewFormat')
    const layout = document.getElementById('znQrPreviewLayout')
    const capacity = document.getElementById('znQrPreviewCapacity')
    const pages = document.getElementById('znQrPreviewPages')
    const nav = document.getElementById('znQrPageNav')
    const prev = document.getElementById('znQrPagePrevBtn')
    const next = document.getElementById('znQrPageNextBtn')
    if (meta) meta.textContent = pageMeta.pageLabel
    if (format) format.textContent = pageMeta.formatLabel
    if (layout) layout.textContent = pageMeta.layoutLabel
    if (capacity) capacity.textContent = pageMeta.capacityLabel
    if (pages) pages.textContent = pageMeta.totalPagesLabel
    if (nav) nav.hidden = total <= 1
    if (prev) prev.disabled = zoneQrPreviewPage <= 1
    if (next) next.disabled = zoneQrPreviewPage >= total
    document.querySelectorAll('#znQrPageStrip [data-zone-qr-preview-page]').forEach((button) => {
      const isCurrent = Number(button.dataset.zoneQrPreviewPage) === zoneQrPreviewPage
      button.classList.toggle('is-active', isCurrent)
      button.setAttribute('aria-current', isCurrent ? 'page' : 'false')
    })
  }

  async function renderZoneQrPageStrip(requestId) {
    const pageStrip = document.getElementById('znQrPageStrip')
    const pagesOverview = document.getElementById('znQrPreviewPagesOverview')
    if (!(pageStrip instanceof HTMLElement) || !(pagesOverview instanceof HTMLElement)) return

    pageStrip.replaceChildren()
    pagesOverview.hidden = zoneQrDocumentPages.length <= 1
    if (zoneQrDocumentPages.length <= 1) return

    const thumbnails = zoneQrDocumentPages.map((page, index) => {
      const pageNumber = index + 1
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'zones-qr-page-thumb'
      button.dataset.zoneQrPreviewPage = String(pageNumber)
      button.setAttribute('aria-label', `Pokaż stronę ${pageNumber}: ${zoneQrPreviewPageLabel(page)}`)

      const frame = document.createElement('span')
      frame.className = `zones-qr-page-thumb-frame is-${page?.orientation === 'portrait' ? 'portrait' : 'landscape'}`
      const canvas = document.createElement('canvas')
      canvas.setAttribute('aria-hidden', 'true')
      frame.appendChild(canvas)

      const description = document.createElement('span')
      description.className = 'zones-qr-page-thumb-description'
      const pageLabel = document.createElement('strong')
      pageLabel.textContent = `Strona ${pageNumber}`
      const functionLabel = document.createElement('small')
      functionLabel.textContent = zoneQrPreviewPageLabel(page)
      description.append(pageLabel, functionLabel)
      button.append(frame, description)
      pageStrip.appendChild(button)
      return { canvas, frame, pageNumber }
    })

    updateZoneQrPageNavigation()
    for (const thumbnail of thumbnails) {
      if (requestId !== zoneQrPreviewRequest) return
      await zoneQrThumbnailPreview.renderPage({
        canvas: thumbnail.canvas,
        container: thumbnail.frame,
        pageNumber: thumbnail.pageNumber,
        maxWidth: 84,
        maxHeight: 58,
      })
    }
  }

  async function showZoneQrPreviewPage(page, { showLoading = true } = {}) {
    zoneQrPreviewPage = page
    updateZoneQrPageNavigation()
    const canvas = document.getElementById('znQrPreviewCanvas')
    const host = document.getElementById('znQrPreviewCanvasHost')
    const loading = document.getElementById('znQrPreviewLoading')
    if (!(canvas instanceof HTMLCanvasElement) || !(host instanceof HTMLElement) || !zoneQrPreviewBlob) return
    const renderRequestId = ++zoneQrPageRenderRequest
    host.setAttribute('aria-busy', 'true')
    if (showLoading) {
      canvas.hidden = true
      if (loading) {
        loading.hidden = false
        loading.textContent = `Renderowanie strony ${zoneQrPreviewPage}…`
      }
    }
    try {
      await zoneQrPdfPreview.renderPage({ canvas, container: host, pageNumber: zoneQrPreviewPage })
      if (renderRequestId !== zoneQrPageRenderRequest) return
      canvas.hidden = false
      if (loading) loading.hidden = true
      host.setAttribute('aria-busy', 'false')
    } catch (error) {
      if (renderRequestId !== zoneQrPageRenderRequest) return
      const message = error instanceof Error ? error.message : 'Nie udało się wyrenderować strony PDF.'
      canvas.hidden = true
      if (loading) {
        loading.hidden = false
        loading.textContent = message
      }
      host.setAttribute('aria-busy', 'false')
      throw error
    }
  }

  async function renderZoneQrPreview() {
    const codes = zoneQrPreviewCodes()
    const loading = document.getElementById('znQrPreviewLoading')
    const canvas = document.getElementById('znQrPreviewCanvas')
    const host = document.getElementById('znQrPreviewCanvasHost')
    const requestId = ++zoneQrPreviewRequest
    setZoneQrOutputButtons(false)
    if (!codes.length) {
      releaseZoneQrPreview()
      syncZoneQrFormatSummary([])
      if (loading) {
        const items = selectedZoneQrItems()
        loading.hidden = false
        loading.textContent = items.length
          ? 'Dla każdej wybranej funkcji podaj ilość kodów od 1 do 100.'
          : 'Wybierz co najmniej jedną funkcję kodu QR.'
      }
      updateZoneQrPageNavigation()
      return
    }

    if (loading) {
      loading.hidden = false
      loading.textContent = 'Przygotowywanie podglądu PDF…'
    }
    if (canvas) canvas.hidden = true
    host?.setAttribute('aria-busy', 'true')

    try {
      const documentLayout = syncZoneQrFormatSummary(codes)
      const blob = await createZoneQrPdfBlob(codes, zoneQrPrintOptions())
      if (requestId !== zoneQrPreviewRequest) return
      const nextUrl = URL.createObjectURL(blob)
      if (zoneQrPreviewUrl) URL.revokeObjectURL(zoneQrPreviewUrl)
      zoneQrPreviewBlob = blob
      zoneQrPreviewUrl = nextUrl
      zoneQrDocumentPages = documentLayout.pages
      const [pdfPageCount, thumbnailPageCount] = await Promise.all([
        zoneQrPdfPreview.load(blob),
        zoneQrThumbnailPreview.load(blob),
      ])
      if (requestId !== zoneQrPreviewRequest) return
      if (pdfPageCount !== zoneQrDocumentPages.length || thumbnailPageCount !== zoneQrDocumentPages.length) {
        throw new Error('Liczba stron podglądu nie zgadza się z dokumentem PDF.')
      }
      zoneQrPreviewPage = Math.min(zoneQrPreviewPage, zoneQrDocumentPages.length) || 1
      await showZoneQrPreviewPage(zoneQrPreviewPage)
      await renderZoneQrPageStrip(requestId)
      setZoneQrOutputButtons(true)
    } catch (error) {
      if (requestId !== zoneQrPreviewRequest) return
      const message = error instanceof Error ? error.message : 'Nie udało się przygotować podglądu PDF.'
      if (loading) {
        loading.hidden = false
        loading.textContent = message
      }
      if (canvas) canvas.hidden = true
      host?.setAttribute('aria-busy', 'false')
      setZoneQrStatus(message, 'error')
    }
  }

  function scheduleZoneQrPreview() {
    if (zoneQrPreviewTimer) window.clearTimeout(zoneQrPreviewTimer)
    zoneQrPreviewTimer = window.setTimeout(() => {
      zoneQrPreviewTimer = 0
      void renderZoneQrPreview()
    }, 180)
  }

  function configureZoneQrGeneratorMode(mode) {
    zoneQrGeneratorMode = mode === 'reprint' ? 'reprint' : 'create'
    const generatorView = document.getElementById('znQrGeneratorView')
    const title = document.getElementById('znQrGeneratorTitle')
    const description = document.getElementById('znQrGeneratorDescription')
    const generateButton = document.getElementById('znQrGenerateBtn')
    const reprint = zoneQrGeneratorMode === 'reprint'
    generatorView?.classList.toggle('is-reprint', reprint)
    if (title) title.textContent = reprint ? 'Ponowny wydruk kodu QR' : 'Generowanie kodów QR'
    if (description) {
      description.textContent = reprint
        ? 'Kod i funkcja są niezmienne. Układ wydruku zostanie dobrany automatycznie.'
        : 'Wybierz funkcje i ilość. Format stron oraz paginacja zostaną dobrane automatycznie.'
    }
    if (generateButton) generateButton.hidden = reprint
    setZoneQrFormLocked(reprint)
  }

  function resetZoneQrGenerator() {
    releaseZoneQrPreview()
    zoneQrSavedCodes = []
    zoneQrPreviewPage = 1
    clearCombo('znQrClient')
    clearCombo('znQrZone')
    const start = document.getElementById('znQrFunctionStart')
    const stop = document.getElementById('znQrFunctionStop')
    const clean = document.getElementById('znQrFunctionClean')
    const special = document.getElementById('znQrFunctionSpecial')
    const stopVariant = document.getElementById('znQrStopVariant')
    const quantities = ['znQrStartQuantity', 'znQrStopQuantity', 'znQrCleanQuantity', 'znQrSpecialQuantity']
    if (start) start.checked = true
    if (stop) stop.checked = false
    if (clean) clean.checked = false
    if (special) special.checked = false
    if (stopVariant) stopVariant.value = 'STOP'
    resetZoneQrPrintOptions()
    quantities.forEach((id) => {
      const input = document.getElementById(id)
      if (input) input.value = '1'
    })
    syncZoneQrFormatSummary()
    setZoneQrGenerateButtonLabel('Wygeneruj i zapisz PDF')
    setZoneQrStatus('Podgląd układu używa oznaczenia roboczego. Dokładny numer pojawi się po zapisie.', 'info')
    setZoneQrOutputButtons(false)
    setZoneQrFormLocked(false)
  }

  async function openZoneQrGenerator() {
    if (!canManageZoneQr()) {
      alert('Brak uprawnień do generowania kodów QR.')
      return
    }
    const generatorView = document.getElementById('znQrGeneratorView')
    const zonesView = document.getElementById('view-zones')
    if (!generatorView || !zonesView) return
    configureZoneQrGeneratorMode('create')
    resetZoneQrGenerator()
    generatorView.hidden = false
    zonesView.classList.add('is-qr-generator-active')
    generatorView.scrollIntoView({ block: 'start' })
    await ensureClientsForZones()
    syncClientSelects()
    syncZoneSelects()
    void renderZoneQrPreview()
  }

  function closeZoneQrGenerator() {
    const generatorView = document.getElementById('znQrGeneratorView')
    const zonesView = document.getElementById('view-zones')
    if (generatorView) generatorView.hidden = true
    zonesView?.classList.remove('is-qr-generator-active')
    releaseZoneQrPreview()
    zoneQrSavedCodes = []
    document.getElementById('znQrGeneratorBtn')?.focus()
  }

  function openZoneQrReprint(zone) {
    if (!canManageZoneQr() || !isGeneratedZoneQr(zone)) return
    const generatorView = document.getElementById('znQrGeneratorView')
    const zonesView = document.getElementById('view-zones')
    if (!generatorView || !zonesView) return
    closeZoneModal()
    releaseZoneQrPreview()
    const clientId = String(zone?.clientId ?? '').trim()
    const clientName = clientNameMap().get(clientId) || String(zone?.clientName ?? '').trim()
    const zoneName = String(zone?.name ?? zone?.zone ?? '').trim()
    zoneQrSavedCodes = [{ ...zone, clientId, clientName, name: zoneName, zone: zoneName }]
    const functionName = String(zone?.function ?? '').trim().toUpperCase()
    const start = document.getElementById('znQrFunctionStart')
    const stop = document.getElementById('znQrFunctionStop')
    const clean = document.getElementById('znQrFunctionClean')
    const special = document.getElementById('znQrFunctionSpecial')
    const stopVariant = document.getElementById('znQrStopVariant')
    if (start) start.checked = functionName === 'START'
    if (stop) stop.checked = functionName.startsWith('STOP')
    if (clean) clean.checked = functionName === 'CLEAN'
    if (special) special.checked = functionName === 'STREFA_SPECJALNA'
    if (stopVariant && functionName.startsWith('STOP')) stopVariant.value = functionName
    resetZoneQrPrintOptions()
    ;['znQrStartQuantity', 'znQrStopQuantity', 'znQrCleanQuantity', 'znQrSpecialQuantity'].forEach((id) => {
      const input = document.getElementById(id)
      if (input) input.value = '1'
    })
    fillCombo('znQrClient', sortedClientOptions(), {
      placeholder: 'Nieprzypisany',
      selected: clientId,
      fallbackLabel: clientName || clientId,
    })
    fillCombo('znQrZone', zoneTypeOptions(), {
      placeholder: 'Nieprzypisana',
      selected: closedZoneTypeValue(zoneName),
    })
    syncZoneQrFormatSummary(zoneQrSavedCodes)
    zoneQrPreviewPage = 1
    configureZoneQrGeneratorMode('reprint')
    setZoneQrStatus(`Kod ${zoneRecordId(zone)} jest gotowy do ponownego wydruku.`, 'success')
    generatorView.hidden = false
    zonesView.classList.add('is-qr-generator-active')
    generatorView.scrollIntoView({ block: 'start' })
    void renderZoneQrPreview()
  }

  async function generateAndSaveZoneQrCodes() {
    if (!appState.session?.orgId || !canManageZoneQr() || zoneQrGeneratorMode !== 'create') return
    const items = selectedZoneQrItems()
    if (!items.length) {
      setZoneQrStatus('Wybierz co najmniej jedną funkcję kodu QR.', 'error')
      document.getElementById('znQrFunctionsFieldset')?.classList.add('has-error')
      return
    }
    document.getElementById('znQrFunctionsFieldset')?.classList.remove('has-error')
    if (items.some((item) => !item.quantity)) {
      setZoneQrStatus('Dla każdej wybranej funkcji podaj ilość od 1 do 100.', 'error')
      return
    }

    const clientId = readComboValue('znQrClient')
    if (readComboText('znQrClient') && !clientId) {
      setZoneQrStatus('Wybierz klienta z listy albo pozostaw pole puste.', 'error')
      return
    }
    const zoneName = readClosedZoneComboValue('znQrZone')
    const generateButton = document.getElementById('znQrGenerateBtn')
    if (generateButton) {
      generateButton.disabled = true
      setZoneQrGenerateButtonLabel('Generowanie…')
    }
    setZoneQrOutputButtons(false)
    setZoneQrStatus('Zapisywanie kodów QR…', 'info')

    try {
      const codes = await generateZoneQrCodes(appState.session.orgId, {
        items,
        clientId: clientId || null,
        zone: zoneName || null,
      })
      if (!codes.length) throw new Error('Serwer nie zwrócił wygenerowanych kodów QR.')
      const selectedClient = zoneQrSelectedClient()
      zoneQrSavedCodes = codes.map((code) => ({
        ...code,
        clientName: code.clientName || selectedClient.clientName,
      }))
      zoneQrPreviewPage = 1
      setZoneQrFormLocked(true)
      setZoneQrStatus(`Zapisano ${codes.length} ${codes.length === 1 ? 'kod QR' : 'kodów QR'}.`, 'success')
      zoneQrSavedCodes.forEach((code) => upsertLocalZone(code))
      filterZonesTable({ resetPage: true })
      await renderZoneQrPreview()
      await fetchZonesForCurrentSession(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udało się wygenerować kodów QR.'
      setZoneQrStatus(message, 'error')
    } finally {
      if (generateButton) {
        generateButton.disabled = Boolean(zoneQrSavedCodes.length)
        setZoneQrGenerateButtonLabel(zoneQrSavedCodes.length ? 'Kody zapisane' : 'Wygeneruj i zapisz PDF')
      }
    }
  }

  function downloadCurrentZoneQrPdf() {
    if (!zoneQrPreviewBlob || !zoneQrSavedCodes.length) return
    downloadZoneQrPdfBlob(zoneQrPreviewBlob, zoneQrPdfFilename(zoneQrSavedCodes))
  }

  async function printCurrentZoneQrPdf() {
    if (!zoneQrPreviewUrl || !zoneQrSavedCodes.length) return
    try {
      await printZoneQrPdfUrl(zoneQrPreviewUrl)
    } catch (error) {
      setZoneQrStatus(error instanceof Error ? error.message : 'Nie udało się rozpocząć drukowania.', 'error')
    }
  }

  function openZoneAddModal() {
    if (!canManageZoneQr()) {
      alert('Brak uprawnień do dodawania stref.')
      return
    }
    const overlay = document.getElementById('znEditorOverlay')
    if (!overlay) {
      return
    }

    appState.zoneModalMode = 'add'
    appState.zoneModalZoneId = ''
    zoneModalTypeTouched = false

    const qr = nextZoneQrCode()
    zoneModalOriginalQr = qr
    const qrLabel = document.getElementById('znQrLabel')
    const rowLabel = document.getElementById('znRowNumberLabel')
    const qrInput = document.getElementById('znEditQr')
    const locationInput = document.getElementById('znEditLoc')
    const dateInput = document.getElementById('znEditData')
    const editedByInput = document.getElementById('znEditEdytowal')
    const saveBtn = document.getElementById('znSaveBtn')
    const deleteBtn = document.getElementById('znDeleteBtn')
    const reprintBtn = document.getElementById('znReprintBtn')

    setZoneQrEditState()
    setZoneEditorMutationState()
    setModalClientValue('')
    setModalZoneValue(DEFAULT_ZONE_TYPE)
    syncFunctionSelect('')
    syncRequiredVisitControl(false)

    if (qrLabel) qrLabel.textContent = qr
    if (rowLabel) rowLabel.textContent = 'AUTO'
    if (qrInput) qrInput.value = qr
    if (locationInput) locationInput.value = ''
    if (dateInput) dateInput.value = formatDatePl(new Date().toISOString())
    if (editedByInput) editedByInput.value = appState.session?.name ?? '-'
    if (saveBtn) saveBtn.style.display = canManageZoneQr() ? '' : 'none'
    if (deleteBtn) deleteBtn.style.display = 'none'
    if (reprintBtn) reprintBtn.style.display = 'none'

    overlay.style.display = 'flex'
  }

  function openZonePreviewModal(zoneId) {
    const overlay = document.getElementById('znEditorOverlay')
    if (!overlay) {
      return
    }

    const zone = appState.zones.find((item) => item.id === zoneId)
    if (!zone || deletedZoneIds.has(zoneRecordId(zone))) {
      return
    }

    appState.zoneModalMode = 'edit'
    appState.zoneModalZoneId = String(zoneId)
    zoneModalTypeTouched = false
    const view = mapZoneForView(zone)
    zoneModalOriginalQr = view.qr

    const qrLabel = document.getElementById('znQrLabel')
    const rowLabel = document.getElementById('znRowNumberLabel')
    const qrInput = document.getElementById('znEditQr')
    const locationInput = document.getElementById('znEditLoc')
    const dateInput = document.getElementById('znEditData')
    const editedByInput = document.getElementById('znEditEdytowal')
    const saveBtn = document.getElementById('znSaveBtn')
    const deleteBtn = document.getElementById('znDeleteBtn')
    const reprintBtn = document.getElementById('znReprintBtn')

    setZoneQrEditState()
    setZoneEditorMutationState()
    setModalClientValue(view.clientId, view.clientName)
    setModalZoneValue(['-', 'Nieprzypisany'].includes(view.zoneName) ? '' : view.zoneName)
    syncFunctionSelect(view.function === '-' ? '' : view.function)
    syncRequiredVisitControl(view.requiredVisit)

    if (qrLabel) qrLabel.textContent = view.qr
    if (rowLabel) rowLabel.textContent = '-'
    if (qrInput) qrInput.value = view.qr
    if (locationInput) locationInput.value = ['-', 'Nieprzypisany'].includes(view.location) ? '' : view.location
    if (dateInput) dateInput.value = view.dateLabel
    if (editedByInput) editedByInput.value = view.editedBy
    if (saveBtn) saveBtn.style.display = canManageZoneQr() ? '' : 'none'
    if (deleteBtn) deleteBtn.style.display = canDeleteZones() ? '' : 'none'
    if (reprintBtn) reprintBtn.style.display = canManageZoneQr() && isGeneratedZoneQr(zone) ? '' : 'none'

    overlay.style.display = 'flex'
  }

  function resolveClientIdForZone(value) {
    const normalized = String(value ?? '').trim()
    if (!normalized) {
      return ''
    }

    const byId = appState.clients.find((client) => String(client.id).trim() === normalized)
    if (byId) {
      return String(byId.id)
    }

    const byName = appState.clients.find((client) => String(client.name).trim().toLowerCase() === normalized.toLowerCase())
    if (byName) {
      return String(byName.id)
    }

    return ''
  }

  async function saveZoneData() {
    if (!appState.session?.orgId) {
      return
    }
    if (!canManageZoneQr()) {
      alert('Brak uprawnień do zapisu stref.')
      return
    }

    const qr = String(document.getElementById('znEditQr')?.value ?? '').trim()
    const clientRaw = String(document.getElementById('znEditClient')?.value ?? '').trim()
    const clientText = String(document.getElementById('znEditClientText')?.value ?? '').trim()
    const zoneName = readModalZoneValue()
    const location = String(document.getElementById('znEditLoc')?.value ?? '').trim()
    const functionName = String(document.getElementById('znEditFunkcja')?.value ?? '').trim()
    const requiredVisit = zoneFunctionAllowsRequiredVisit(functionName) && document.getElementById('znEditRequiredVisit')?.checked === true
    const originalZoneId = String(appState.zoneModalZoneId ?? '').trim()
    const isAddMode = appState.zoneModalMode === 'add'
    const originalQrValue = String(zoneModalOriginalQr || originalZoneId).trim()
    const originalZone = (Array.isArray(appState.zones) ? appState.zones : []).find(
      (zone) => zoneRecordId(zone) === originalZoneId,
    )
    const generatedStartStop = !isAddMode && isGeneratedZoneQr(originalZone)
    const immutableFunction = generatedStartStop ? String(originalZone?.function ?? '').trim().toUpperCase() : functionName
    const qrInputChanged = Boolean(originalQrValue && qr !== originalQrValue)
    const qrChanged = !isAddMode && qr !== originalZoneId

    if (!qr || (!generatedStartStop && (!clientRaw || !zoneName))) {
      alert(generatedStartStop ? 'Numer QR jest wymagany.' : 'Uzupełnij Numer QR, Klienta i Strefę.')
      return
    }

    if (generatedStartStop && (qr !== originalZoneId || functionName.toUpperCase() !== immutableFunction)) {
      alert('Identyfikator i funkcja wygenerowanego kodu QR są niezmienne.')
      return
    }

    if (qrInputChanged && !canManageZoneQr()) {
      alert('Brak uprawnień do zmiany numeru QR strefy.')
      return
    }

    if ((isAddMode || qrChanged) && zoneQrExists(qr, originalZoneId)) {
      alert('Taki numer QR juz istnieje.')
      return
    }

    const clientId = resolveClientIdForZone(clientRaw)
    if (clientText && !clientId) {
      alert('Nie znaleziono klienta. Wybierz klienta z listy.')
      return
    }

    try {
      const editedBy = appState.session?.name ?? null
      const date = new Date().toISOString()
      let localCreatedZone = null
      const defaultZoneWasApplied = isAddMode && !zoneModalTypeTouched && zoneName === DEFAULT_ZONE_TYPE
      const payload = {
        id: qr,
        zoneId: qr,
        clientId,
        name: zoneName,
        function: immutableFunction,
        requiredVisit,
        location,
        editedBy,
        date,
      }

      if (appState.zoneModalMode === 'add') {
        const createdZone = await createZone(appState.session.orgId, payload)
        localCreatedZone = {
          ...createdZone,
          ...payload,
          code: qr,
          orgId: appState.session.orgId,
          qr,
          zone: zoneName,
        }
        pinnedZoneId = qr
        upsertLocalZone(localCreatedZone)
      } else if (qrChanged) {
        const createdZone = await createZone(appState.session.orgId, payload)
        await deleteZone(appState.session.orgId, originalZoneId)
        deletedZoneIds.add(originalZoneId)
        removeLocalZone(originalZoneId)
        localCreatedZone = {
          ...createdZone,
          ...payload,
          code: qr,
          orgId: appState.session.orgId,
          qr,
          zone: zoneName,
        }
        pinnedZoneId = qr
        upsertLocalZone(localCreatedZone)
      } else if (appState.zoneModalMode === 'edit') {
        await updateZone(appState.session.orgId, originalZoneId || qr, {
          clientId: clientId || null,
          name: zoneName || null,
          function: immutableFunction,
          requiredVisit,
          location,
          editedBy,
          date,
        })
      }

      closeZoneModal()
      if (localCreatedZone) {
        filterZonesTable({ resetPage: true })
        if (defaultZoneWasApplied && typeof showTransientNotice === 'function') {
          showTransientNotice('Domyślnie dodano strefę: Biuro', 'success')
        }
        await fetchZonesForCurrentSession(true, {
          fallbackZone: localCreatedZone,
          preservePinnedZone: true,
        })
      } else {
        await fetchZonesForCurrentSession(true)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Błąd zapisu strefy.'
      alert(message)
    }
  }

  async function deleteZoneData() {
    if (!appState.session?.orgId || appState.zoneModalMode !== 'edit' || !appState.zoneModalZoneId) {
      return
    }

    if (!canDeleteZones()) {
      if (typeof showTransientNotice === 'function') {
        showTransientNotice('Brak uprawnień do usuwania stref.', 'error')
      } else {
        alert('Brak uprawnień do usuwania stref.')
      }
      return
    }

    const zoneId = String(appState.zoneModalZoneId ?? '').trim()
    const confirmed = window.confirm(`Usunąć strefę ${zoneId}?`)
    if (!confirmed) {
      return
    }

    try {
      await deleteZone(appState.session.orgId, zoneId)
      deletedZoneIds.add(zoneId)
      if (pinnedZoneId === zoneId) {
        clearPinnedZone()
      }
      removeLocalZone(zoneId)
      closeZoneModal()
      filterZonesTable({ resetPage: true })
      if (typeof showTransientNotice === 'function') {
        showTransientNotice('Strefa została usunięta.', 'success')
      }
      await fetchZonesForCurrentSession(true)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Błąd usuwania strefy.'
      alert(message)
    }
  }

  function setComboActiveIndex(id, index) {
    const state = comboState(id)
    if (!state.filteredOptions.length) {
      state.activeIndex = -1
      renderComboOptions(id)
      return
    }

    state.activeIndex = (index + state.filteredOptions.length) % state.filteredOptions.length
    renderComboOptions(id)
  }

  function findExactComboTextOption(id) {
    const text = normalizeSearchText(readComboText(id))
    if (!text) {
      return null
    }

    return (
      comboState(id).options.find((optionData) =>
        [optionData.label, optionData.value].some((value) => normalizeSearchText(value) === text),
      ) ?? null
    )
  }

  function closestComboOption(target) {
    const element = target?.nodeType === 1 ? target : target?.parentElement
    return element?.closest?.('[data-combo-value]') ?? null
  }

  function bindZoneCombo(binding, id) {
    const elements = comboElements(id)
    if (!elements?.textInput || !elements.hiddenInput || !elements.list) {
      return
    }

    binding.add(elements.textInput, 'focus', () => {
      openCombo(id)
    })
    binding.add(elements.textInput, 'click', () => {
      openCombo(id)
    })
    binding.add(elements.textInput, 'input', () => {
      if (id === 'znEditStrefa' && appState.zoneModalMode === 'add') {
        zoneModalTypeTouched = true
      }

      const state = comboState(id)
      state.selectedValue = ''
      state.query = elements.textInput.value
      elements.hiddenInput.value = ''
      if (id === 'znEditFunkcja') syncRequiredVisitControl(false)

      if (!state.open) {
        openCombo(id)
        return
      }

      state.activeIndex = -1
      renderComboOptions(id)
    })
    binding.add(elements.textInput, 'keydown', (event) => {
      const state = comboState(id)
      if (event.key === 'Escape') {
        event.preventDefault()
        closeCombo(id)
        return
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        if (!state.open) {
          openCombo(id)
          return
        }

        const direction = event.key === 'ArrowDown' ? 1 : -1
        setComboActiveIndex(id, state.activeIndex < 0 ? 0 : state.activeIndex + direction)
        return
      }

      if (event.key === 'Enter') {
        const optionData = state.open ? state.filteredOptions[state.activeIndex] ?? state.filteredOptions[0] : findExactComboTextOption(id)
        if (optionData) {
          event.preventDefault()
          selectComboOption(id, optionData)
          return
        }

        if (!state.allowFreeText) {
          event.preventDefault()
          closeCombo(id)
        }
      }
    })
    binding.add(elements.toggle, 'click', (event) => {
      event.preventDefault()
      if (comboState(id).open) {
        closeCombo(id)
      } else {
        openCombo(id)
        elements.textInput.focus()
      }
    })
    binding.add(elements.list, 'mousemove', (event) => {
      const optionButton = closestComboOption(event.target)
      if (!optionButton) {
        return
      }

      const optionButtons = [...elements.list.querySelectorAll('[data-combo-value]')]
      const index = optionButtons.indexOf(optionButton)
      if (index >= 0 && comboState(id).activeIndex !== index) {
        setComboActiveIndex(id, index)
      }
    })
    binding.add(elements.list, 'click', (event) => {
      const optionButton = closestComboOption(event.target)
      if (!optionButton) {
        return
      }

      const value = String(optionButton.getAttribute('data-combo-value') ?? '')
      const optionData = comboState(id).options.find((item) => item.value === value)
      if (optionData) {
        selectComboOption(id, optionData)
      }
    })
  }

  function bindZoneCombos(binding) {
    const comboIds = [
      'znClient',
      'znStrefa',
      'znFunkcja',
      'znPageSize',
      'znEditClient',
      'znEditStrefa',
      'znEditFunkcja',
      'znQrClient',
      'znQrZone',
    ]
    comboIds.forEach((id) => bindZoneCombo(binding, id))
    binding.add(document, 'click', (event) => {
      const isComboClick = comboIds.some((id) => comboElements(id)?.root.contains(event.target))
      if (!isComboClick) {
        closeAllCombos()
      }
    })
  }

  function bindZonesViewFunctions() {
    const binding = createBindingHelpers()
    syncPageSizeSelect()
    syncClientSelects()
    syncZoneSelects()
    syncFunctionFilterSelect()
    syncFunctionSelect('')
    bindZoneCombos(binding)

    binding.add(document.getElementById('znSearchBtn'), 'click', () => {
      clearPinnedZone()
      filterZonesTable({ resetPage: true })
    })
    binding.add(document.getElementById('znResetBtn'), 'click', () => {
      resetZoneFilters()
      filterZonesTable({ resetPage: true })
    })

    ;['znQr', 'znLoc', 'znEditedBy', 'znQ'].forEach((id) => {
      binding.add(document.getElementById(id), 'keydown', (event) => {
        if (event.key === 'Enter') {
          clearPinnedZone()
          filterZonesTable({ resetPage: true })
        }
      })
    })
    binding.add(document.getElementById('znClientText'), 'keydown', (event) => {
      if (event.key === 'Enter' && !event.defaultPrevented) {
        clearPinnedZone()
        filterZonesTable({ resetPage: true })
      }
    })
    binding.add(document.getElementById('znStrefaText'), 'keydown', (event) => {
      if (event.key === 'Enter' && !event.defaultPrevented) {
        clearPinnedZone()
        filterZonesTable({ resetPage: true })
      }
    })
    binding.add(document.getElementById('znFunkcjaText'), 'keydown', (event) => {
      if (event.key === 'Enter' && !event.defaultPrevented) {
        clearPinnedZone()
        filterZonesTable({ resetPage: true })
      }
    })

    binding.add(document.getElementById('znClient'), 'change', () => {
      clearPinnedZone()
      filterZonesTable({ resetPage: true })
    })
    binding.add(document.getElementById('znStrefa'), 'change', () => {
      clearPinnedZone()
      filterZonesTable({ resetPage: true })
    })
    binding.add(document.getElementById('znFunkcja'), 'change', () => {
      clearPinnedZone()
      filterZonesTable({ resetPage: true })
    })
    binding.add(document.getElementById('znPageSize'), 'change', () => {
      const nextSize = Number(readComboValue('znPageSize'))
      appState.zonesPageSize = PAGE_SIZE_OPTIONS.includes(nextSize) ? nextSize : 50
      filterZonesTable({ resetPage: true })
    })

    binding.add(document.getElementById('znPrevBtn'), 'click', () => {
      if (appState.zonesPage <= 1) return
      appState.zonesPage -= 1
      filterZonesTable({ resetPage: false })
    })
    binding.add(document.getElementById('znNextBtn'), 'click', () => {
      if (appState.zonesPage >= appState.zonesTotalPages) return
      appState.zonesPage += 1
      filterZonesTable({ resetPage: false })
    })

    const addButton = document.getElementById('znAddBtn')
    if (addButton instanceof HTMLButtonElement) {
      addButton.disabled = !canManageZoneQr()
      addButton.title = canManageZoneQr() ? 'Dodaj strefę' : 'Brak uprawnień do dodawania stref.'
    }
    binding.add(addButton, 'click', openZoneAddModal)
    const generatorButton = document.getElementById('znQrGeneratorBtn')
    if (generatorButton instanceof HTMLButtonElement) {
      generatorButton.hidden = !canManageZoneQr()
      generatorButton.disabled = !canManageZoneQr()
      generatorButton.title = canManageZoneQr() ? 'Wygeneruj kody QR stref' : 'Brak uprawnień do generowania kodów QR.'
    }
    binding.add(generatorButton, 'click', () => {
      void openZoneQrGenerator()
    })
    binding.add(document.getElementById('znRows'), 'click', (event) => {
      const button = event.target.closest('[data-zone-id]')
      if (!button) return
      const zoneId = String(button.getAttribute('data-zone-id') ?? '').trim()
      if (!zoneId) return
      openZonePreviewModal(zoneId)
    })

    binding.add(document.getElementById('znEditorOverlay'), 'click', (event) => {
      if (event.target?.id === 'znEditorOverlay') closeZoneModal()
    })
    binding.add(document.getElementById('znCancelBtn'), 'click', closeZoneModal)
    binding.add(document.getElementById('znQrCloseBtn'), 'click', closeZoneQrGenerator)
    binding.add(document.getElementById('znQrCancelBtn'), 'click', closeZoneQrGenerator)
    binding.add(document.getElementById('znSaveBtn'), 'click', () => {
      void saveZoneData()
    })
    binding.add(document.getElementById('znDeleteBtn'), 'click', () => {
      void deleteZoneData()
    })
    binding.add(document.getElementById('znReprintBtn'), 'click', () => {
      const zoneId = String(appState.zoneModalZoneId ?? '').trim()
      const zone = (Array.isArray(appState.zones) ? appState.zones : []).find((item) => zoneRecordId(item) === zoneId)
      if (zone) openZoneQrReprint(zone)
    })
    binding.add(document.getElementById('znQrGenerateBtn'), 'click', () => {
      void generateAndSaveZoneQrCodes()
    })
    binding.add(document.getElementById('znQrDownloadBtn'), 'click', downloadCurrentZoneQrPdf)
    binding.add(document.getElementById('znQrPrintBtn'), 'click', () => {
      void printCurrentZoneQrPdf()
    })
    binding.add(document.getElementById('znQrPagePrevBtn'), 'click', () => {
      void showZoneQrPreviewPage(zoneQrPreviewPage - 1)
    })
    binding.add(document.getElementById('znQrPageNextBtn'), 'click', () => {
      void showZoneQrPreviewPage(zoneQrPreviewPage + 1)
    })
    binding.add(document.getElementById('znQrPageStrip'), 'click', (event) => {
      if (!(event.target instanceof Element)) return
      const button = event.target.closest('[data-zone-qr-preview-page]')
      if (!(button instanceof HTMLButtonElement)) return
      void showZoneQrPreviewPage(Number(button.dataset.zoneQrPreviewPage))
    })
    ;['znQrFunctionStart', 'znQrFunctionStop', 'znQrFunctionClean', 'znQrFunctionSpecial'].forEach((id) => {
      binding.add(document.getElementById(id), 'change', () => {
        document.getElementById('znQrFunctionsFieldset')?.classList.remove('has-error')
        setZoneQrFormLocked(false)
        syncZoneQrFormatSummary()
        zoneQrPreviewPage = 1
        scheduleZoneQrPreview()
      })
    })
    ;['znQrStopVariant', 'znQrStartQuantity', 'znQrStopQuantity', 'znQrCleanQuantity', 'znQrSpecialQuantity'].forEach((id) => {
      binding.add(document.getElementById(id), 'change', () => {
        syncZoneQrFormatSummary()
        zoneQrPreviewPage = 1
        scheduleZoneQrPreview()
      })
    })
    document.querySelectorAll('input[name="znQrTimeFormat"], input[name="znQrLabelSize"]').forEach((input) => {
      binding.add(input, 'change', () => {
        syncZoneQrFormatSummary()
        zoneQrPreviewPage = 1
        scheduleZoneQrPreview()
      })
    })
    document.querySelectorAll('[data-zone-qr-quantity-target]').forEach((button) => {
      binding.add(button, 'click', () => {
        const input = document.getElementById(String(button.dataset.zoneQrQuantityTarget || ''))
        if (!input || input.disabled) return
        const delta = Number(button.dataset.zoneQrQuantityDelta || 0)
        const current = Number(input.value || 1)
        input.value = String(Math.min(100, Math.max(1, (Number.isFinite(current) ? current : 1) + delta)))
        input.dispatchEvent(new Event('change', { bubbles: true }))
      })
    })
    ;['znQrClient', 'znQrZone'].forEach((id) => {
      binding.add(document.getElementById(id), 'change', scheduleZoneQrPreview)
    })
    binding.add(window, 'resize', () => {
      if (zoneQrPreviewResizeTimer) window.clearTimeout(zoneQrPreviewResizeTimer)
      zoneQrPreviewResizeTimer = window.setTimeout(() => {
        zoneQrPreviewResizeTimer = 0
        const generatorView = document.getElementById('znQrGeneratorView')
        if (generatorView && !generatorView.hidden && zoneQrPreviewBlob && zoneQrDocumentPages.length) {
          void showZoneQrPreviewPage(zoneQrPreviewPage, { showLoading: false })
        }
      }, 140)
    })
    binding.add(document, 'keydown', (event) => {
      if (event.key !== 'Escape') return
      const generatorView = document.getElementById('znQrGeneratorView')
      if (generatorView && !generatorView.hidden && ![...zoneComboStates.values()].some((state) => state.open)) {
        closeZoneQrGenerator()
      }
    })

    return () => {
      closeZoneQrGenerator()
      binding.done()
    }
  }

  return {
    bind: bindZonesViewFunctions,
    fetch: fetchZonesForCurrentSession,
    filter: filterZonesTable,
    isUnassignedCleanZone,
    mapZoneForView,
    visiblePortalZones,
  }
}
