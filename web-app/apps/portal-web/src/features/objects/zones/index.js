import './style.css'
import template from './template.html?raw'
import { getClients } from '../../../services/clientService'

export const route = 'zones'
export const viewId = 'view-zones'
export { template }

const DEFAULT_FUNCTION_OPTIONS = ['CLEAN', 'START', 'STOP', 'STOPO', 'Strefa specjalna']
const PAGE_SIZE_OPTIONS = [50, 100, 200]
const DEFAULT_ZONE_TYPE = 'Biuro'
const FALLBACK_ZONE_TYPE = 'Inne'
const DEFAULT_ZONE_TYPE_OPTIONS = [
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

    if (qrInput) {
      qrInput.disabled = !canEdit
      qrInput.title = canEdit ? 'ADMIN, Owner lub Manager może zmienić numer QR strefy.' : 'Brak uprawnień do edycji numeru QR.'
    }
    if (qrLabel) {
      qrLabel.textContent = canEdit ? 'Numer QR (A)' : 'Numer QR (A) - blokada'
    }
  }

  function setZoneEditorMutationState() {
    const canEdit = canManageZoneQr()
    ;['znEditClientText', 'znEditStrefaText', 'znEditLoc', 'znEditFunkcjaText'].forEach((id) => {
      const control = document.getElementById(id)
      if (control) control.disabled = !canEdit
    })
    document.querySelectorAll('#znEditorOverlay .zones-combo-toggle').forEach((button) => {
      button.disabled = !canEdit
    })
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
    return {
      ...zone,
      qr: zone.qr || zone.id || '-',
      clientId,
      clientName: resolvedClientName || '-',
      zoneName: zone.name || zone.zone || '-',
      location: zone.location || '-',
      function: zone.function || '-',
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
    return Boolean(clientNameKey && clientNameKey !== '-' && clientNameKey !== 'unassigned' && clientIdKey !== 'unassigned')
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
      if (key && key !== '-') {
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
        const clientInitials = zoneInitials(zone.clientName)
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
                <small>${escapeHtml(zone.clientId || '-')}</small>
              </span>
            </div>
            <div class="zones-zone-cell">
              <span class="zones-zone-icon ${zoneVisual.className}" aria-hidden="true">${zoneVisual.iconHtml}</span>
              <strong title="${escapeHtml(zone.zoneName)}">${escapeHtml(zone.zoneName)}</strong>
            </div>
            <div title="${escapeHtml(zone.location)}"><span class="zones-location-text">${escapeHtml(zone.location)}</span></div>
            <div><span class="zones-function-pill ${toneClass}">${escapeHtml(zone.function)}</span></div>
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

    setZoneQrEditState()
    setZoneEditorMutationState()
    setModalClientValue('')
    setModalZoneValue(DEFAULT_ZONE_TYPE)
    syncFunctionSelect('')

    if (qrLabel) qrLabel.textContent = qr
    if (rowLabel) rowLabel.textContent = 'AUTO'
    if (qrInput) qrInput.value = qr
    if (locationInput) locationInput.value = ''
    if (dateInput) dateInput.value = formatDatePl(new Date().toISOString())
    if (editedByInput) editedByInput.value = appState.session?.name ?? '-'
    if (saveBtn) saveBtn.style.display = canManageZoneQr() ? '' : 'none'
    if (deleteBtn) deleteBtn.style.display = 'none'

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

    setZoneQrEditState()
    setZoneEditorMutationState()
    setModalClientValue(view.clientId, view.clientName)
    setModalZoneValue(view.zoneName === '-' ? '' : view.zoneName)
    syncFunctionSelect(view.function === '-' ? '' : view.function)

    if (qrLabel) qrLabel.textContent = view.qr
    if (rowLabel) rowLabel.textContent = '-'
    if (qrInput) qrInput.value = view.qr
    if (locationInput) locationInput.value = view.location === '-' ? '' : view.location
    if (dateInput) dateInput.value = view.dateLabel
    if (editedByInput) editedByInput.value = view.editedBy
    if (saveBtn) saveBtn.style.display = canManageZoneQr() ? '' : 'none'
    if (deleteBtn) deleteBtn.style.display = canDeleteZones() ? '' : 'none'

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
    const zoneName = readModalZoneValue()
    const location = String(document.getElementById('znEditLoc')?.value ?? '').trim()
    const functionName = String(document.getElementById('znEditFunkcja')?.value ?? '').trim()
    const originalZoneId = String(appState.zoneModalZoneId ?? '').trim()
    const isAddMode = appState.zoneModalMode === 'add'
    const originalQrValue = String(zoneModalOriginalQr || originalZoneId).trim()
    const qrInputChanged = Boolean(originalQrValue && qr !== originalQrValue)
    const qrChanged = !isAddMode && qr !== originalZoneId

    if (!qr || !clientRaw || !zoneName) {
      alert('Uzupełnij Numer QR, Klienta i Strefę.')
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
    if (!clientId) {
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
        function: functionName,
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
          clientId,
          name: zoneName,
          function: functionName,
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
    const comboIds = ['znClient', 'znStrefa', 'znFunkcja', 'znPageSize', 'znEditClient', 'znEditStrefa', 'znEditFunkcja']
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
    binding.add(document.getElementById('znSaveBtn'), 'click', () => {
      void saveZoneData()
    })
    binding.add(document.getElementById('znDeleteBtn'), 'click', () => {
      void deleteZoneData()
    })

    return () => {
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
