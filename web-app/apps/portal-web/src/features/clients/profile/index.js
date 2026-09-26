import template from './template.html?raw'
import { createClientProfitabilityFeature } from '../profitability/index.js'

export const route = 'clientProfile'
export const viewId = 'view-clientProfile'
export { template }

export function createClientProfileFeature(ctx) {
  const {
    appState,
    calendarEnsureState,
    todayYmd,
    ordersWorkerSelectionLabel,
    ordersTimelineClientLabel,
    ordersTimelineAddressLabel,
    ordersOpenAddEditor,
    ordersNormalizeOrderRows,
    normalizeClientStatus,
    kanbanTaskIsCompleted,
    loadFullCalendar,
    durationSecondsToHm,
    calendarWorkerLabel,
    calendarWorkerId,
    calendarToneLabel,
    calendarSelectionText,
    calendarOpenEditor,
    calendarDateToYmd,
    calendarNormalizeSelectionList,
    calendarTaskToneValue,
    canEditProfitability,
    canManageClients,
    canReadProfitability,
    canDeleteClients,
    createBindingHelpers,
    createClient,
    deleteClient,
    escapeHtml,
    fetchWorkersForCurrentSession,
    getClients,
    normalizeSearchText,
    ordersListSourceOrders,
    setSubwelcomeMetric,
    showTransientNotice,
    updateClient,
    ordersSelectCreatedClientInEditor,
  } = ctx

  function profileFieldValue(value, fallback = '-') {
    const raw = String(value ?? '').trim()
    return raw || fallback
  }

  const CLIENT_PROFILE_STATUS_OPTIONS = ['Aktywny', 'Nieaktywny', 'Wstrzymany', 'Archiwalny']
  const CLIENT_PROFILE_CLIENT_TYPE_OPTIONS = [
    { value: 'CYKLICZNY', label: 'Cykliczny' },
    { value: 'DETALICZNY', label: 'Detaliczny' },
  ]
  const CLIENT_PROFILE_COOPERATION_MODELS = new Set(['all', 'regular', 'oneoff'])
  const CLIENT_PROFILE_DETAIL_TABS = ['profile', 'operations', 'documents', 'profitability']
  const CLIENT_PROFILE_OPERATION_TABS = ['orders', 'calendar', 'locations', 'reports']
  const CLIENT_PROFILE_DOCUMENT_TABS = ['contacts', 'messages', 'additional', 'offers', 'files']
  const CLIENT_PROFILE_AVATAR_CLASSES = ['violet', 'blue', 'green', 'cyan', 'amber', 'rose']
  let clientProfileDeleteConfirmResolve = null
  const profitabilityFeature = createClientProfitabilityFeature({
    appState,
    canEditProfitability,
    canReadProfitability,
    escapeHtml,
    showTransientNotice,
  })
  if (import.meta.env.DEV) {
    window.ClientProfitabilityModule = profitabilityFeature
  }
  const CLIENT_PROFILE_ACTION_ICONS = {
    profile:
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" stroke-width="1.8"/></svg>',
    edit:
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 10v7M14 10v7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  }
  const CLIENT_PROFILE_WEEKDAY_OPTIONS = [
    { value: 'Pon', aliases: ['pon', 'poniedzialek', 'poniedziałek'] },
    { value: 'Wt', aliases: ['wt', 'wtorek'] },
    { value: 'Sr', aliases: ['sr', 'śr', 'sroda', 'środa'] },
    { value: 'Czw', aliases: ['czw', 'czwartek'] },
    { value: 'Pt', aliases: ['pt', 'piatek', 'piątek'] },
    { value: 'Sob', aliases: ['sob', 'sobota'] },
    { value: 'Nd', aliases: ['nd', 'niedz', 'niedziela'] },
  ]
  const CLIENT_PROFILE_EDIT_FIELDS = [
    { id: 'cpdFieldStatus', field: 'status', type: 'select', options: CLIENT_PROFILE_STATUS_OPTIONS },
    { id: 'cpdFieldClientType', field: 'clientType', type: 'select', options: CLIENT_PROFILE_CLIENT_TYPE_OPTIONS },
    { id: 'cpdFieldName', field: 'name', required: true },
    { id: 'cpdFieldNip', field: 'nip' },
    { id: 'cpdFieldObjectType', field: 'objectType' },
    { id: 'cpdFieldCooperationStart', field: 'cooperationStartAt', endField: 'cooperationEndAt', type: 'date-range' },
    { id: 'cpdFieldCoordinator', field: 'coordinator', type: 'worker-single' },
    { id: 'cpdFieldContactPerson', field: 'contactPerson' },
    { id: 'cpdFieldPhone', field: 'phone' },
    { id: 'cpdFieldEmail', field: 'email' },
    { id: 'cpdFieldEmergencyContact', field: 'emergencyContact' },
    { id: 'cpdFieldContactPosition', field: 'contactPosition' },
    { id: 'cpdFieldCity', field: 'city' },
    { id: 'cpdFieldAddress', field: 'address', multiline: true },
    { id: 'cpdFieldPostalCode', field: 'postalCode' },
    { id: 'cpdFieldAccessHours', field: 'accessHours', type: 'time-range' },
    { id: 'cpdFieldAccessMethod', field: 'accessMethod', multiline: true },
    { id: 'cpdFieldServiceEntry', field: 'serviceEntry', multiline: true },
    { id: 'cpdFieldServiceType', field: 'serviceType' },
    { id: 'cpdFieldFrequency', field: 'serviceFrequency' },
    { id: 'cpdFieldServiceDays', field: 'serviceDays', type: 'weekdays' },
    { id: 'cpdFieldPreferredHours', field: 'preferredHours', type: 'time-range' },
    { id: 'cpdFieldWorkMode', field: 'workMode', type: 'time-range' },
    { id: 'cpdFieldSla', field: 'sla' },
    { id: 'cpdFieldRbhAmount', field: 'rbhAmount', type: 'number', step: '0.25' },
    { id: 'cpdFieldPermissions', field: 'requiredPermissions', multiline: true },
    { id: 'cpdFieldBhp', field: 'bhpRequirements', multiline: true },
    { id: 'cpdFieldRestrictions', field: 'workRestrictions', multiline: true },
    { id: 'cpdFieldExcludedZones', field: 'excludedZones', multiline: true },
    { id: 'cpdFieldOperationalRisks', field: 'operationalRisks', multiline: true },
    { id: 'cpdFieldSpecialInstructions', field: 'specialInstructions', multiline: true },
    { id: 'cpdFieldChemicals', field: 'chemistry', multiline: true },
    { id: 'cpdFieldEquipment', field: 'equipment', multiline: true },
    { id: 'cpdFieldSpecialEquipment', field: 'specialEquipment', multiline: true },
    { id: 'cpdFieldStorage', field: 'storagePlace' },
    { id: 'cpdFieldBackroomAccess', field: 'backroomAccess' },
    { id: 'cpdFieldTechnicalNotes', field: 'technicalNotes', multiline: true },
    { id: 'cpdFieldInternalNotes', field: 'internalNotes', multiline: true },
  ]
  const CLIENT_PROFILE_ZONE_FALLBACKS = [
    { className: 'zone-kind-generic-blue', icon: 'building' },
    { className: 'zone-kind-generic-green', icon: 'spark' },
    { className: 'zone-kind-generic-purple', icon: 'box' },
    { className: 'zone-kind-generic-amber', icon: 'utensils' },
    { className: 'zone-kind-generic-cyan', icon: 'monitor' },
  ]
  const CLIENT_PROFILE_ZONE_CLIENT_TONES = [
    'client-tone-blue',
    'client-tone-pink',
    'client-tone-green',
    'client-tone-amber',
    'client-tone-cyan',
    'client-tone-violet',
    'client-tone-lime',
    'client-tone-orange',
  ]
  const CLIENT_PROFILE_ZONE_ICON_HTML = {
    archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v11H5z"></path><path d="M4 5h16v3H4z"></path><path d="M9 12h6"></path></svg>',
    building: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21V5h10v16"></path><path d="M4 21h16"></path><path d="M10 9h1"></path><path d="M13 9h1"></path><path d="M10 13h1"></path><path d="M13 13h1"></path></svg>',
    floor: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20h12"></path><path d="M8 16a4 4 0 0 1 8 0"></path><path d="M12 4v8"></path><path d="M9 7l3-3 3 3"></path></svg>',
    monitor: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="10" rx="1.5"></rect><path d="M9 20h6"></path><path d="M12 15v5"></path></svg>',
    spark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v5"></path><path d="M12 15v5"></path><path d="M4 12h5"></path><path d="M15 12h5"></path><path d="M8 8l-2-2"></path><path d="M16 8l2-2"></path></svg>',
    utensils: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16"></path><path d="M4 4v5a3 3 0 0 0 6 0V4"></path><path d="M17 4v16"></path><path d="M14 4h3a3 3 0 0 1 0 6h-3"></path></svg>',
  }

  function clientProfileText(value, fallback = '') {
    const raw = String(value ?? '').trim()
    return raw || fallback
  }

  function clientProfileVisualHash(value) {
    return String(value ?? '').split('').reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 2147483647, 0)
  }

  function clientProfileZoneIconHtml(icon) {
    return CLIENT_PROFILE_ZONE_ICON_HTML[icon] || CLIENT_PROFILE_ZONE_ICON_HTML.building
  }

  function clientProfileZoneVisualMeta(zone = {}) {
    const zoneName = zone.zoneName || zone.zone || zone.name || ''
    const zoneKey = normalizeSearchText(zoneName)
    if (zoneKey.includes('aneks') || zoneKey.includes('kuchnia') || zoneKey.includes('kuchenny')) {
      return { className: 'zone-kind-kitchen', iconHtml: clientProfileZoneIconHtml('utensils') }
    }
    if (zoneKey.includes('archiwum')) {
      return { className: 'zone-kind-archive', iconHtml: clientProfileZoneIconHtml('archive') }
    }
    if (zoneKey.includes('parter')) {
      return { className: 'zone-kind-floor', iconHtml: clientProfileZoneIconHtml('floor') }
    }
    if (zoneKey.includes('pietro') || zoneKey.includes('piętro')) {
      return { className: 'zone-kind-desk', iconHtml: clientProfileZoneIconHtml('monitor') }
    }
    if (zoneKey.includes('biuro')) {
      return { className: 'zone-kind-office', iconHtml: clientProfileZoneIconHtml('building') }
    }

    const fallback = CLIENT_PROFILE_ZONE_FALLBACKS[clientProfileVisualHash(zoneName || zone.qr || zone.zoneId) % CLIENT_PROFILE_ZONE_FALLBACKS.length]
    return {
      className: fallback.className,
      iconHtml: clientProfileZoneIconHtml(fallback.icon),
    }
  }

  function clientProfileZoneToneClass(value) {
    const functionKey = normalizeSearchText(value)
    if (functionKey === 'clean') return 'is-clean'
    if (functionKey.includes('stop')) return 'is-stop'
    if (functionKey.includes('start')) return 'is-start'
    if (functionKey.includes('specjal') || functionKey.includes('special')) return 'is-special'
    return 'is-neutral'
  }

  function clientProfileZoneClientToneClass(client = {}) {
    const label = normalizeSearchText(`${client.name ?? client.clientName ?? ''} ${client.id ?? client.clientId ?? ''}`)
    if (label.includes('best clean') || label.includes('bestclean')) return 'client-tone-blue'
    if (label.includes('as michal herman') || label.includes('activ space')) return 'client-tone-pink'
    return CLIENT_PROFILE_ZONE_CLIENT_TONES[clientProfileVisualHash(client.id || client.clientId || client.name || client.clientName) % CLIENT_PROFILE_ZONE_CLIENT_TONES.length]
  }

  function clientProfileZoneDateLabel(zone = {}) {
    const raw = clientProfileText(zone.dateLabel || zone.date || zone.updatedAt || zone.createdAt)
    if (!raw) return '-'
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) return raw
    return clientProfileDateLabel(raw) || raw
  }

  function clientProfileDateInputValue(value) {
    const raw = String(value ?? '').trim()
    if (!raw) return ''
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/)
    if (match) return match[1]
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) return ''
    return calendarDateToYmd(date)
  }

  function clientProfileDateLabel(value) {
    const raw = clientProfileDateInputValue(value)
    if (!raw) return ''
    return raw.split('-').reverse().join('.')
  }

  function clientProfileCooperationPeriodLabel(client = {}) {
    const start = clientProfileDateLabel(client.cooperationStartAt)
    const end = clientProfileDateLabel(client.cooperationEndAt)
    if (start && end) return `${start} do ${end}`
    if (start) return `od ${start}`
    if (end) return `do ${end}`
    return ''
  }

  function clientProfileNumberInputValue(value) {
    const raw = String(value ?? '').trim().replace(',', '.')
    if (!raw) return ''
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? String(parsed) : raw
  }

  function clientProfileNumberLabel(value) {
    const raw = String(value ?? '').trim()
    if (!raw) return ''
    const parsed = Number(raw.replace(',', '.'))
    if (!Number.isFinite(parsed)) return raw
    return parsed.toLocaleString('pl-PL', { maximumFractionDigits: 2 })
  }

  function clientProfileDateTimeLabel(value) {
    const raw = String(value ?? '').trim()
    if (!raw) return ''
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) {
      return clientProfileDateLabel(raw)
    }
    const dateLabel = calendarDateToYmd(date).split('-').reverse().join('.')
    const timeLabel = date.toLocaleTimeString('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    return `${dateLabel}\n${timeLabel}`
  }

  function clientProfileClientTypeValue(value) {
    const key = normalizeSearchText(value).replace(/[\s_-]+/g, '')
    if (key.includes('detal') || key.includes('jednoraz') || key === 'oneoff' || key === 'single') {
      return 'DETALICZNY'
    }
    return 'CYKLICZNY'
  }

  function clientProfileClientTypeLabel(value) {
    return clientProfileClientTypeValue(value) === 'DETALICZNY' ? 'Detaliczny' : 'Cykliczny'
  }

  function clientProfileClientTypeSource(client = {}) {
    return [
      client.clientTypeRaw,
      client.client_type,
      client.typKlienta,
      client.clientType,
    ]
      .map((value) => String(value ?? '').trim())
      .find(Boolean) ?? ''
  }

  function clientProfileClientKey(client = {}) {
    return String(client?.id ?? client?.clientId ?? '').trim()
  }

  function clientProfileEscapeRegExp(value) {
    return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  function clientProfileContainsWord(value, word) {
    const normalizedValue = normalizeSearchText(value)
    const normalizedWord = normalizeSearchText(word)
    if (!normalizedValue || !normalizedWord) return false
    const pattern = new RegExp(`(^|[^a-z0-9])${clientProfileEscapeRegExp(normalizedWord)}([^a-z0-9]|$)`)
    return pattern.test(normalizedValue)
  }

  function clientProfileSelectedWeekdays(value) {
    const selected = new Set()
    CLIENT_PROFILE_WEEKDAY_OPTIONS.forEach((day) => {
      if (day.aliases.some((alias) => clientProfileContainsWord(value, alias))) {
        selected.add(day.value)
      }
    })
    return selected
  }

  function renderClientProfileWeekdayPicker(definition, value) {
    const selected = clientProfileSelectedWeekdays(value)
    const original = clientProfileText(value)
    return `
      <div class="cpd-day-picker" data-client-profile-days-field="${escapeHtml(definition.field)}" data-cpd-days-original="${escapeHtml(original)}" data-cpd-days-had-selection="${selected.size ? 'true' : 'false'}">
        ${CLIENT_PROFILE_WEEKDAY_OPTIONS.map((day) => `
          <label class="cpd-day-option">
            <input type="checkbox" value="${escapeHtml(day.value)}" data-client-profile-edit-day="${escapeHtml(definition.field)}"${selected.has(day.value) ? ' checked' : ''} />
            <span>${escapeHtml(day.value)}</span>
          </label>
        `).join('')}
      </div>
    `
  }

  function clientProfileNormalizeTimePart(hour, minute = '00') {
    const parsedHour = Number(hour)
    const parsedMinute = Number(minute || '00')
    if (!Number.isInteger(parsedHour) || !Number.isInteger(parsedMinute)) return ''
    if (parsedHour < 0 || parsedHour > 23 || parsedMinute < 0 || parsedMinute > 59) return ''
    return `${String(parsedHour).padStart(2, '0')}:${String(parsedMinute).padStart(2, '0')}`
  }

  function clientProfileParseTimeRange(value) {
    const raw = clientProfileText(value)
    const rawNormalized = normalizeSearchText(raw)
    if (rawNormalized.includes('calodob') || rawNormalized.includes('non stop') || rawNormalized.includes('24h') || /(^|[^\d])24\s*\/\s*7(?=$|[^\d])/.test(raw)) {
      return {
        from: '',
        to: '',
        hadTime: false,
      }
    }
    const normalized = raw.replace(/[–—]/g, '-').replace(/\./g, ':')
    const matches = [...normalized.matchAll(/(?:^|[^\d])(\d{1,2})(?::?(\d{2}))?(?=$|[^\d])/g)]
      .map((match) => clientProfileNormalizeTimePart(match[1], match[2]))
      .filter(Boolean)
    return {
      from: matches[0] ?? '',
      to: matches[1] ?? '',
      hadTime: matches.length > 0,
    }
  }

  function renderClientProfileTimeRange(definition, value) {
    const original = clientProfileText(value)
    const range = clientProfileParseTimeRange(original)
    return `
      <div class="cpd-time-range" data-client-profile-time-field="${escapeHtml(definition.field)}" data-cpd-time-original="${escapeHtml(original)}" data-cpd-time-had-range="${range.hadTime ? 'true' : 'false'}">
        <label class="cpd-time-part">
          <span>Od</span>
          <input class="cpd-edit-input" type="time" data-client-profile-time-part="from" value="${escapeHtml(range.from)}" />
        </label>
        <label class="cpd-time-part">
          <span>Do</span>
          <input class="cpd-edit-input" type="time" data-client-profile-time-part="to" value="${escapeHtml(range.to)}" />
        </label>
      </div>
    `
  }

  function renderClientProfileDateRange(definition, client = appState.clientProfileCurrent) {
    const start = clientProfileDateInputValue(client?.[definition.field])
    const end = clientProfileDateInputValue(client?.[definition.endField])
    return `
      <div class="cpd-date-range" data-client-profile-date-range="${escapeHtml(definition.field)}">
        <label class="cpd-date-part">
          <span>Od</span>
          <input class="cpd-edit-input" type="date" data-client-profile-date-range-part="start" value="${escapeHtml(start)}" />
        </label>
        <label class="cpd-date-part">
          <span>Do</span>
          <input class="cpd-edit-input" type="date" data-client-profile-date-range-part="end" value="${escapeHtml(end)}" />
        </label>
      </div>
    `
  }

  function clientProfileWorkerSubLabel(worker = {}) {
    return String(worker.email ?? worker.workerEmail ?? worker.mail ?? worker.login ?? worker.workerLogin ?? worker.authUid ?? '').trim()
  }

  function clientProfileWorkerOption(worker = {}) {
    const label = calendarWorkerLabel(worker)
    const id = calendarWorkerId(worker)
    const subLabel = clientProfileWorkerSubLabel(worker)
    const key = normalizeSearchText(id || subLabel || label)
    if (!label || !key) return null
    return {
      key,
      id,
      label,
      subLabel,
      searchText: normalizeSearchText([label, subLabel, id].join(' ')),
      worker,
    }
  }

  function clientProfileWorkerOptions() {
    const seen = new Set()
    return (Array.isArray(appState.workers) ? appState.workers : [])
      .map((worker) => clientProfileWorkerOption(worker))
      .filter((option) => {
        if (!option || seen.has(option.key)) return false
        seen.add(option.key)
        return true
      })
      .sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))
  }

  function clientProfileWorkerOptionInitials(option = {}) {
    const source = clientProfileText(option.label, option.subLabel || option.id)
    const words = source.split(/\s+/).filter(Boolean)
    return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : source.slice(0, 2)).toUpperCase()
  }

  function clientProfileWorkerOptionAvatarClass(option = {}) {
    const key = String(option.key ?? option.id ?? option.label ?? '')
    const sum = [...key].reduce((total, char) => total + char.charCodeAt(0), 0)
    return CLIENT_PROFILE_AVATAR_CLASSES[sum % CLIENT_PROFILE_AVATAR_CLASSES.length]
  }

  function clientProfileFindWorkerOptionByText(value) {
    const normalized = normalizeSearchText(value)
    if (!normalized) return null
    return clientProfileWorkerOptions().find((option) => (
      normalizeSearchText(option.label) === normalized ||
      normalizeSearchText(option.subLabel) === normalized ||
      normalizeSearchText(option.id) === normalized
    )) ?? null
  }

  function renderClientProfileWorkerSelect(definition, value) {
    const selected = clientProfileFindWorkerOptionByText(value)
    const label = selected?.label || clientProfileText(value, 'Wybierz koordynatora')
    const subLabel = selected?.subLabel || (selected ? selected.id : 'Lista pracowników')
    const avatarClass = selected ? clientProfileWorkerOptionAvatarClass(selected) : 'violet'
    const initials = selected ? clientProfileWorkerOptionInitials(selected) : '--'
    return `
      <input type="hidden" data-client-profile-edit-field="${escapeHtml(definition.field)}" value="${escapeHtml(clientProfileText(value))}" />
      <button class="cpd-worker-picker-btn" id="cpdCoordinatorPickerBtn" type="button">
        <span class="cpd-worker-avatar cpd-worker-avatar--${escapeHtml(avatarClass)}">${escapeHtml(initials)}</span>
        <span class="cpd-worker-picker-copy">
          <strong id="cpdCoordinatorPickerLabel">${escapeHtml(label)}</strong>
          <small id="cpdCoordinatorPickerSubLabel">${escapeHtml(subLabel)}</small>
        </span>
        <span class="cpd-worker-picker-chevron" aria-hidden="true">⌄</span>
      </button>
    `
  }

  function clientProfileAssignedWorkerItems(client = appState.clientProfileCurrent) {
    const options = clientProfileWorkerOptions()
    const values = clientProfileText(client?.assignees)
      .split(/[,;\n]+/)
      .map((item) => item.trim())
      .filter(Boolean)
    const seen = new Set()
    return values
      .map((value) => {
        const normalized = normalizeSearchText(value)
        const matched = options.find((option) => (
          normalizeSearchText(option.label) === normalized ||
          normalizeSearchText(option.subLabel) === normalized ||
          normalizeSearchText(option.id) === normalized
        ))
        if (matched) return matched
        return {
          key: `custom:${normalized || value}`,
          id: '',
          label: value,
          subLabel: '',
          searchText: normalized,
          custom: true,
        }
      })
      .filter((item) => {
        if (!item.label || seen.has(item.key)) return false
        seen.add(item.key)
        return true
      })
  }

  function clientProfileAssignedWorkerKeys(client = appState.clientProfileCurrent) {
    return new Set(clientProfileAssignedWorkerItems(client).filter((item) => !item.custom).map((item) => item.key))
  }

  function clientProfileFormatWorkerAssignmentsFromKeys(keys = new Set()) {
    return clientProfileWorkerOptions()
      .filter((option) => keys.has(option.key))
      .map((option) => option.label)
      .join(', ')
  }

  function readClientProfileWeekdays(definition) {
    const inputs = [...document.querySelectorAll(`[data-client-profile-edit-day="${definition.field}"]`)]
    if (!inputs.length) return ''
    const root = inputs[0].closest('[data-client-profile-days-field]')
    const selected = inputs
      .filter((input) => input.checked)
      .map((input) => String(input.value ?? '').trim())
      .filter(Boolean)
    if (selected.length) return selected.join(', ')
    const original = String(root?.dataset?.cpdDaysOriginal ?? '').trim()
    return original && root?.dataset?.cpdDaysHadSelection !== 'true' ? original : ''
  }

  function readClientProfileTimeRange(definition) {
    const root = document.querySelector(`[data-client-profile-time-field="${definition.field}"]`)
    if (!root) return ''
    const from = String(root.querySelector('[data-client-profile-time-part="from"]')?.value ?? '').trim()
    const to = String(root.querySelector('[data-client-profile-time-part="to"]')?.value ?? '').trim()
    if (from && to) return `${from} - ${to}`
    if (from) return `od ${from}`
    if (to) return `do ${to}`
    const original = String(root.dataset?.cpdTimeOriginal ?? '').trim()
    return original && root.dataset?.cpdTimeHadRange !== 'true' ? original : ''
  }

  function mapClientForProfileView(client = {}) {
    const rawClientType = clientProfileClientTypeSource(client)
    const mapped = {
      ...client,
      id: String(client.id ?? client.clientId ?? ''),
      clientId: String(client.clientId ?? client.id ?? ''),
      name: String(client.name ?? ''),
      status: normalizeClientStatus(client.status),
      nip: String(client.nip ?? ''),
      city: String(client.city ?? ''),
      address: String(client.address ?? ''),
      contact: String(client.contact ?? client.phone ?? client.email ?? ''),
      coordinator: String(client.coordinator ?? ''),
      clientType: clientProfileClientTypeValue(rawClientType),
      clientTypeRaw: String(rawClientType ?? ''),
      serviceFrequency: String(client.serviceFrequency ?? client.frequency ?? client.czestotliwosc ?? ''),
      assignees: String(client.assignees ?? client.workers ?? client.osobyWykonujace ?? client.osoby ?? ''),
      chemistry: String(client.chemistry ?? client.chemia ?? ''),
      equipment: String(client.equipment ?? client.sprzet ?? ''),
      clientInfo: String(client.clientInfo ?? client.info ?? client.informacje ?? ''),
    }

    ;[
      'objectType',
      'cooperationStartAt',
      'cooperationEndAt',
      'contactPerson',
      'phone',
      'email',
      'emergencyContact',
      'contactPosition',
      'postalCode',
      'accessHours',
      'accessMethod',
      'serviceEntry',
      'serviceType',
      'serviceDays',
      'preferredHours',
      'workMode',
      'sla',
      'rbhAmount',
      'requiredPermissions',
      'bhpRequirements',
      'workRestrictions',
      'excludedZones',
      'operationalRisks',
      'specialInstructions',
      'specialEquipment',
      'storagePlace',
      'backroomAccess',
      'technicalNotes',
      'internalNotes',
      'coordinatorChangedAt',
      'lastExecutionAt',
      'lastWorkerAssignmentAt',
      'createdAt',
      'updatedAt',
    ].forEach((field) => {
      mapped[field] = client[field] ?? ''
    })

    return {
      ...mapped,
      frequency: mapped.serviceFrequency,
      workers: mapped.assignees,
      chemicals: mapped.chemistry,
      information: mapped.clientInfo,
    }
  }

  function upsertClientProfileClient(client = {}) {
    const mappedClient = mapClientForProfileView(client)
    const clientKey = clientProfileClientKey(mappedClient)
    if (!clientKey) {
      return mappedClient
    }

    const clients = Array.isArray(appState.clients) ? appState.clients : []
    const existingIndex = clients.findIndex((item) => clientProfileClientKey(item) === clientKey)
    if (existingIndex >= 0) {
      const nextClients = [...clients]
      nextClients[existingIndex] = mapClientForProfileView({
        ...clients[existingIndex],
        ...mappedClient,
      })
      appState.clients = nextClients
      return nextClients[existingIndex]
    }

    appState.clients = [mappedClient, ...clients]
    return mappedClient
  }

  function clientProfileWithClientTypeFallback(client = {}, fallback = {}) {
    const rawClientType = clientProfileClientTypeSource(client)
    const fallbackType = clientProfileClientTypeSource(fallback)
    if (!fallbackType) {
      return client
    }

    const normalizedType = clientProfileClientTypeValue(fallbackType)
    const hasBlankRawClientType =
      Object.prototype.hasOwnProperty.call(client, 'clientTypeRaw') &&
      !String(client.clientTypeRaw ?? '').trim()
    if (rawClientType && !(hasBlankRawClientType && normalizedType === 'DETALICZNY')) {
      return client
    }

    return {
      ...client,
      clientType: normalizedType,
      clientTypeRaw: normalizedType,
    }
  }

  function getFilteredClientProfiles() {
    const nameFilter = normalizeSearchText(document.getElementById('cpSearchName')?.value)
    const nipFilter = clientProfileNormalizeNip(document.getElementById('cpSearchNip')?.value)
    const cityFilter = normalizeSearchText(document.getElementById('cpSearchCity')?.value)
    const coordinatorFilter = normalizeSearchText(document.getElementById('cpSearchCoordinator')?.value)
    const statusFilter = normalizeSearchText(document.getElementById('cpSearchStatus')?.value)
    const cooperationFilter = getClientProfileCooperationFilter()
    const limit = Number(document.getElementById('cpPageSize')?.value) || 50

    return appState.clients
      .map((client) => mapClientForProfileView(client))
      .filter((client) => {
        const haystack = normalizeSearchText([client.id, client.name, client.nip].join(' '))
        const clientNip = clientProfileNormalizeNip(client.nip)
        if (nameFilter && !haystack.includes(nameFilter)) return false
        if (nipFilter && !clientNip.includes(nipFilter)) return false
        if (cityFilter && !normalizeSearchText(client.city).includes(cityFilter)) return false
        if (coordinatorFilter && !normalizeSearchText(client.coordinator).includes(coordinatorFilter)) return false
        if (statusFilter && normalizeSearchText(client.status) !== statusFilter) return false
        if (cooperationFilter !== 'all' && clientProfileCooperationModel(client) !== cooperationFilter) return false
        return true
      })
      .slice(0, Math.max(1, limit))
  }

  function getClientProfileCooperationFilter() {
    const current = String(appState.clientProfileCooperationFilter ?? 'all').trim()
    return CLIENT_PROFILE_COOPERATION_MODELS.has(current) ? current : 'all'
  }

  function setClientProfileCooperationFilter(value) {
    const next = CLIENT_PROFILE_COOPERATION_MODELS.has(value) ? value : 'all'
    appState.clientProfileCooperationFilter = next
    renderClientProfileCooperationFilter()
    filterClientProfileTable()
  }

  function renderClientProfileCooperationFilter() {
    const current = getClientProfileCooperationFilter()
    document.querySelectorAll('#cpCooperationModel [data-client-profile-model]').forEach((button) => {
      const isActive = button.getAttribute('data-client-profile-model') === current
      button.classList.toggle('is-active', isActive)
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false')
    })
  }

  function clientProfileCooperationModel(client = {}) {
    const rawClientType = clientProfileClientTypeSource(client)
    if (rawClientType) {
      return clientProfileClientTypeValue(rawClientType) === 'DETALICZNY' ? 'oneoff' : 'regular'
    }

    const source = normalizeSearchText([client.serviceFrequency, client.workMode].join(' '))
    if (
      source.includes('jednoraz') ||
      source.includes('oneoff') ||
      source.includes('one off') ||
      source.includes('single')
    ) {
      return 'oneoff'
    }
    return 'regular'
  }

  function clientProfileInitials(client) {
    const source = clientProfileText(client?.name, client?.id)
    const words = source.split(/\s+/).filter(Boolean)
    return (words.length > 1 ? `${words[0][0]}${words[1][0]}` : source.slice(0, 2)).toUpperCase()
  }

  function clientProfileAvatarClass(client) {
    const key = String(client?.id ?? client?.name ?? '')
    const sum = [...key].reduce((total, char) => total + char.charCodeAt(0), 0)
    return CLIENT_PROFILE_AVATAR_CLASSES[sum % CLIENT_PROFILE_AVATAR_CLASSES.length]
  }

  function clientProfileStatusClass(status) {
    const normalized = normalizeSearchText(status)
    if (normalized.includes('nieaktywn')) return 'inactive'
    if (normalized.includes('wstrzym') || normalized.includes('suspend')) return 'suspended'
    if (normalized.includes('archiw')) return 'archived'
    return 'active'
  }

  function clientProfileNormalizeNip(value) {
    return normalizeSearchText(value).replace(/[\s-]+/g, '')
  }

  function clientProfileHasCooperationModel(model) {
    if (model === 'all') return (appState.clients || []).length > 0
    return (appState.clients || [])
      .map((client) => mapClientForProfileView(client))
      .some((client) => clientProfileCooperationModel(client) === model)
  }

  function clientProfileEmptyMessage() {
    const cooperationFilter = getClientProfileCooperationFilter()
    if (cooperationFilter === 'oneoff' && !clientProfileHasCooperationModel('oneoff')) {
      return 'Brak klienta detalicznego.'
    }
    if (cooperationFilter === 'regular' && !clientProfileHasCooperationModel('regular')) {
      return 'Brak klienta cyklicznego.'
    }
    return 'Brak klientów do wyświetlenia.'
  }

  function renderClientProfileTable(rows) {
    const body = document.getElementById('clientProfileBody')
    if (!body) return

    if (!rows.length) {
      body.innerHTML = `<div class="cp-row cp-row-empty"><div>${escapeHtml(clientProfileEmptyMessage())}</div><div></div><div></div></div>`
      return
    }

    body.innerHTML = rows
      .map((client) => {
        const avatarClass = clientProfileAvatarClass(client)
        const subline = client.clientId || client.id
        const status = normalizeClientStatus(client.status)
        const statusClass = clientProfileStatusClass(status)
        const editAction = canManageClients()
          ? `<button class="cp-action-icon" type="button" data-client-profile-action="edit" data-client-profile-id="${escapeHtml(client.id)}" aria-label="Szybka edycja klienta" title="Szybka edycja">${CLIENT_PROFILE_ACTION_ICONS.edit}</button>`
          : ''
        const deleteAction = canDeleteClients()
          ? `<button class="cp-action-icon cp-action-icon--danger" type="button" data-client-profile-action="delete" data-client-profile-id="${escapeHtml(client.id)}" aria-label="Usun klienta" title="Usun">${CLIENT_PROFILE_ACTION_ICONS.trash}</button>`
          : ''
        return `
          <div class="cp-row" data-client-profile-row="${escapeHtml(client.id)}">
            <div class="cp-client-cell">
              <span class="cp-client-avatar cp-client-avatar--${avatarClass}">${escapeHtml(clientProfileInitials(client))}</span>
              <span class="cp-client-copy">
                <strong class="cp-client-name">${escapeHtml(profileFieldValue(client.name))}</strong>
                <span class="cp-client-sub">${escapeHtml(profileFieldValue(subline))}</span>
              </span>
            </div>
            <div class="cp-status-cell">
              <span class="cp-status-badge cp-status-badge--${statusClass}">${escapeHtml(status)}</span>
            </div>
            <div class="cp-actions">
              <button class="cp-action-icon" type="button" data-client-profile-action="profile" data-client-profile-id="${escapeHtml(client.id)}" aria-label="Zobacz profil" title="Zobacz profil">${CLIENT_PROFILE_ACTION_ICONS.profile}</button>
              ${editAction}
              ${deleteAction}
            </div>
          </div>
        `
      })
      .join('')
  }

  function filterClientProfileTable() {
    const filtered = getFilteredClientProfiles()
    appState.clientProfileRows = filtered
    renderClientProfileTable(filtered)
  }

  function clientProfileFindById(clientId) {
    const normalizedId = String(clientId ?? '').trim()
    return appState.clients.find((client) => String(client.id ?? client.clientId ?? '').trim() === normalizedId) ?? null
  }

  function getNextClientProfileId() {
    const usedNumbers = new Set()
    const usedIds = new Set()

    ;(appState.clients || []).forEach((client) => {
      const raw = String(client?.clientId ?? client?.id ?? '').trim()
      if (!raw) return
      usedIds.add(raw.toUpperCase())
      const match = raw.match(/^LK(\d+)$/i)
      if (match) {
        usedNumbers.add(Number(match[1]))
      }
    })

    let nextNumber = 1
    while (usedNumbers.has(nextNumber) || usedIds.has(`LK${String(nextNumber).padStart(3, '0')}`)) {
      nextNumber += 1
    }

    return `LK${String(nextNumber).padStart(3, '0')}`
  }

  function setClientModalReadonly(readonly) {
    const isReadonly = Boolean(readonly)
    ;['clNazwa', 'clNip', 'clMiasto', 'clAdres', 'clStatus', 'clClientType', 'clKoordynator'].forEach((id) => {
      const input = document.getElementById(id)
      if (!input) return
      input.disabled = isReadonly
    })

    const saveButton = document.getElementById('clSaveBtn')
    if (saveButton) {
      saveButton.style.display = isReadonly ? 'none' : ''
    }
  }

  function syncClientProfilePermissions() {
    const addButton = document.getElementById('cpAddClientBtn')
    if (addButton) {
      addButton.style.display = canManageClients() ? '' : 'none'
    }
  }

  function ensureClientModalLayer() {
    const modal = document.getElementById('clModal')
    if (!(modal instanceof HTMLElement)) {
      return null
    }

    let host = document.getElementById('portalModalRoot')
    if (!(host instanceof HTMLElement)) {
      host = document.createElement('div')
      host.id = 'portalModalRoot'
      const portalRoot = document.getElementById('portalRoot')
      ;(portalRoot || document.body).appendChild(host)
    }

    if (modal.parentElement !== host) {
      host.appendChild(modal)
    }
    return modal
  }

  function openClientModal(mode = 'add', clientId = '', options = {}) {
    const modal = ensureClientModalLayer()
    if (!modal) return

    const normalizedMode = String(mode ?? 'add').trim().toLowerCase()
    if (normalizedMode !== 'view' && !canManageClients()) {
      alert('Brak uprawnien do zarzadzania klientami.')
      return
    }

    const isEdit = normalizedMode === 'edit'
    const isView = normalizedMode === 'view'
    const currentClient = isEdit || isView ? clientProfileFindById(clientId) : null
    const addDefaults = !isEdit && !isView && options && typeof options === 'object' ? options : {}
    if ((isEdit || isView) && !currentClient) {
      alert('Nie znaleziono klienta.')
      return
    }

    const modalTitle = document.getElementById('clModalTitle')
    const rowNumberInput = document.getElementById('clRowNumber')
    const idInput = document.getElementById('clId')
    const nameInput = document.getElementById('clNazwa')
    const nipInput = document.getElementById('clNip')
    const cityInput = document.getElementById('clMiasto')
    const addressInput = document.getElementById('clAdres')
    const statusInput = document.getElementById('clStatus')
    const clientTypeInput = document.getElementById('clClientType')
    const saveButton = document.getElementById('clSaveBtn')
    const generatedId = getNextClientProfileId()

    appState.clientModalMode = isView ? 'view' : isEdit ? 'edit' : 'add'
    appState.clientModalClientId = currentClient ? String(currentClient.id ?? currentClient.clientId ?? '') : generatedId

    if (modalTitle) {
      modalTitle.textContent = isView ? 'Podglad klienta' : isEdit ? 'Szybka edycja klienta' : 'Dodaj klienta'
    }
    if (saveButton) saveButton.textContent = isEdit ? 'Zapisz zmiany' : 'Dodaj klienta'
    if (rowNumberInput) rowNumberInput.value = appState.clientModalClientId
    if (idInput) idInput.value = appState.clientModalClientId
    if (nameInput) nameInput.value = currentClient ? String(currentClient.name ?? '') : String(addDefaults.name ?? '')
    if (nipInput) nipInput.value = currentClient ? String(currentClient.nip ?? '') : String(addDefaults.nip ?? '')
    if (cityInput) cityInput.value = currentClient ? String(currentClient.city ?? '') : String(addDefaults.city ?? '')
    if (addressInput) addressInput.value = currentClient ? String(currentClient.address ?? '') : String(addDefaults.address ?? '')
    if (statusInput) statusInput.value = normalizeClientStatus(currentClient?.status ?? addDefaults.status)
    if (clientTypeInput) clientTypeInput.value = clientProfileClientTypeValue(currentClient?.clientType ?? addDefaults.clientType)
    fillClientProfileCoordinatorOptions(currentClient ? String(currentClient.coordinator ?? '') : String(addDefaults.coordinator ?? ''))
    setClientModalReadonly(isView)

    modal.hidden = false
    modal.style.display = 'flex'
    modal.setAttribute('aria-hidden', 'false')
    setTimeout(() => nameInput?.focus?.(), 0)
  }

  function closeClientModal() {
    const modal = document.getElementById('clModal')
    if (modal) {
      modal.style.display = 'none'
      modal.setAttribute('aria-hidden', 'true')
      modal.hidden = true
    }

    appState.ordersClientCreateReturnOrderId = ''
    appState.clientModalMode = 'add'
    appState.clientModalClientId = ''
    setClientModalReadonly(false)
  }

  async function saveClientData() {
    if (!appState.session?.orgId) return
    if (!canManageClients()) {
      alert('Brak uprawnien do zapisu klienta.')
      return
    }

    const saveButton = document.getElementById('clSaveBtn')
    if (saveButton?.disabled) return

    const mode = String(appState.clientModalMode ?? 'add')
    const id = String(document.getElementById('clId')?.value ?? '').trim()
    const name = String(document.getElementById('clNazwa')?.value ?? '').trim()
    const ordersReturnOrderId = mode === 'add' ? String(appState.ordersClientCreateReturnOrderId ?? '').trim() : ''

    if (!id) {
      alert('Uzupelnij ID klienta.')
      return
    }

    if (!name) {
      alert('Nazwa klienta jest wymagana.')
      return
    }

    const payload = {
      id,
      clientId: id,
      name,
      nip: String(document.getElementById('clNip')?.value ?? '').trim(),
      city: String(document.getElementById('clMiasto')?.value ?? '').trim(),
      address: String(document.getElementById('clAdres')?.value ?? '').trim(),
      status: String(document.getElementById('clStatus')?.value ?? 'Aktywny').trim(),
      clientType: clientProfileClientTypeValue(document.getElementById('clClientType')?.value),
      coordinator: String(document.getElementById('clKoordynator')?.value ?? '').trim(),
    }

    if (saveButton) saveButton.disabled = true
    let savedClientForRefresh = null
    try {
      if (mode === 'edit') {
        const savedClient = await updateClient(appState.session.orgId, id, payload)
        const updatedClient = upsertClientProfileClient(clientProfileWithClientTypeFallback(
          {
            ...(clientProfileFindById(id) ?? {}),
            ...payload,
            ...savedClient,
            status: normalizeClientStatus(savedClient.status ?? payload.status),
          },
          payload,
        ))
        savedClientForRefresh = updatedClient
        if (String(appState.clientProfileCurrent?.id ?? '') === id) {
          appState.clientProfileCurrent = updatedClient
        }
        showTransientNotice('Zapisano klienta.')
      } else {
        const createdClient = await createClient(appState.session.orgId, payload)
        const mappedClient = upsertClientProfileClient(clientProfileWithClientTypeFallback(
          {
            ...payload,
            ...createdClient,
            status: normalizeClientStatus(createdClient.status ?? payload.status),
          },
          payload,
        ))
        savedClientForRefresh = mappedClient
        showTransientNotice(`Dodano klienta: ${mappedClient.name || mappedClient.id}.`)
      }

      appState.clientsLoaded = true
      closeClientModal()
      filterClientProfileTable()
      setSubwelcomeMetric('#view-clientProfile .subwelcome', appState.clients.length)
      if (ordersReturnOrderId) {
        const createdOrUpdatedClient = appState.clients.find((client) => String(client.id ?? client.clientId ?? '') === id) ?? payload
        ordersSelectCreatedClientInEditor(createdOrUpdatedClient, ordersReturnOrderId)
      }
      void fetchClientProfileForCurrentSession(true)
        .then(() => {
          if (!savedClientForRefresh) {
            return
          }
          const refreshedClient = clientProfileFindById(id)
          const retainedClient = upsertClientProfileClient(clientProfileWithClientTypeFallback(
            {
              ...(refreshedClient ?? savedClientForRefresh),
            },
            savedClientForRefresh,
          ))
          if (String(appState.clientProfileCurrent?.id ?? '') === id) {
            appState.clientProfileCurrent = retainedClient
          }
          filterClientProfileTable()
          setSubwelcomeMetric('#view-clientProfile .subwelcome', appState.clients.length)
        })
        .catch((error) => {
          console.warn('[client-profile] refresh after save failed', error)
        })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Blad zapisu klienta.'
      alert(message)
    } finally {
      if (saveButton) saveButton.disabled = false
    }
  }

  function closeClientProfileDeleteConfirm(confirmed = false) {
    const overlay = document.getElementById('cpDeleteConfirmOverlay')
    if (overlay) {
      overlay.style.display = 'none'
      overlay.setAttribute('aria-hidden', 'true')
      overlay.hidden = true
    }

    const resolve = clientProfileDeleteConfirmResolve
    clientProfileDeleteConfirmResolve = null
    if (resolve) resolve(Boolean(confirmed))
  }

  function confirmClientProfileDelete(client) {
    const overlay = document.getElementById('cpDeleteConfirmOverlay')
    const text = document.getElementById('cpDeleteConfirmText')
    const confirmButton = document.getElementById('cpDeleteConfirmConfirmBtn')
    if (!overlay) {
      return Promise.resolve(false)
    }

    if (clientProfileDeleteConfirmResolve) {
      closeClientProfileDeleteConfirm(false)
    }

    const name = profileFieldValue(client?.name, 'tego klienta')
    const id = profileFieldValue(client?.id ?? client?.clientId, '-')
    if (text) {
      text.textContent = `Usuniesz klienta "${name}" (${id}) oraz wszystkie rekordy z nim zwiazane.`
    }

    overlay.hidden = false
    overlay.style.display = 'flex'
    overlay.setAttribute('aria-hidden', 'false')
    setTimeout(() => confirmButton?.focus?.(), 0)
    return new Promise((resolve) => {
      clientProfileDeleteConfirmResolve = resolve
    })
  }

  async function deleteClientProfileData(clientId) {
    if (!appState.session?.orgId) return
    if (!canDeleteClients()) {
      showTransientNotice('Klienta moze usunac tylko Admin.', 'error')
      return
    }

    const client = clientProfileFindById(clientId)
    if (!client) {
      showTransientNotice('Nie znaleziono klienta.', 'error')
      return
    }

    const confirmed = await confirmClientProfileDelete(client)
    if (!confirmed) return

    const normalizedId = String(client.id ?? client.clientId ?? clientId).trim()
    try {
      await deleteClient(appState.session.orgId, normalizedId)
      appState.clients = appState.clients.filter((item) => String(item.id ?? item.clientId ?? '') !== normalizedId)
      appState.clientProfileRows = appState.clientProfileRows.filter((item) => String(item.id ?? item.clientId ?? '') !== normalizedId)
      if (String(appState.clientProfileCurrent?.id ?? appState.clientProfileCurrent?.clientId ?? '') === normalizedId) {
        appState.clientProfileCurrent = null
        appState.clientProfileEditMode = false
        if (typeof window.go === 'function') {
          window.go('clientProfile')
        }
      }
      filterClientProfileTable()
      setSubwelcomeMetric('#view-clientProfile .subwelcome', appState.clients.length)
      showTransientNotice(`Usunieto klienta: ${client.name || normalizedId}.`)
      void fetchClientProfileForCurrentSession(true).catch((error) => {
        console.warn('[client-profile] refresh after delete failed', error)
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie usunac klienta.'
      alert(message)
    }
  }

  function clientProfileSetText(id, value, fallback = 'Brak danych') {
    const node = document.getElementById(id)
    if (node) {
      const empty = !clientProfileText(value)
      node.textContent = profileFieldValue(value, fallback)
      node.classList.toggle('is-empty', empty)
    }
  }

  function renderClientProfileInternalNotesInline(client = appState.clientProfileCurrent) {
    const node = document.getElementById('cpdFieldInternalNotes')
    if (!node || appState.clientProfileEditMode || !canManageClients()) return
    const value = clientProfileText(client?.internalNotes)
    node.classList.remove('is-empty')
    node.classList.add('cpd-notes-inline-editor')
    node.innerHTML = `
      <textarea
        class="cpd-edit-input cpd-inline-notes-input"
        id="cpdInternalNotesInput"
        rows="5"
        placeholder="Brak notatek"
      >${escapeHtml(value)}</textarea>
      <div class="cpd-inline-notes-actions">
        <button class="cpd-inline-notes-save" id="cpdInternalNotesSaveBtn" type="button">Zapisz notatkę</button>
      </div>
    `
  }

  function clientProfileZones(client = appState.clientProfileCurrent) {
    const clientId = String(client?.id ?? client?.clientId ?? '').trim()
    if (!clientId) return []
    return appState.zones.filter((zone) => String(zone.clientId ?? '').trim() === clientId)
  }

  function clientProfileTaskMatchesClient(task = {}, client = appState.clientProfileCurrent) {
    const clientId = normalizeSearchText(client?.id ?? client?.clientId)
    const clientName = normalizeSearchText(client?.name)
    const directValues = [
      task.clientId,
      task.clientName,
      task.place,
      task.title,
      ...(calendarNormalizeSelectionList(task.objects ?? task.clients ?? task.sites, task.place).flatMap((selection) => [
        selection.id,
        selection.label,
      ])),
    ].map((value) => normalizeSearchText(value))

    return directValues.some((value) => value && ((clientId && value.includes(clientId)) || (clientName && value.includes(clientName))))
  }

  function clientProfileTasks(client = appState.clientProfileCurrent) {
    calendarEnsureState()
    return appState.calendarTasks.filter((task) => clientProfileTaskMatchesClient(task, client))
  }

  function clientProfileOrders(client = appState.clientProfileCurrent) {
    const clientId = normalizeSearchText(client?.id ?? client?.clientId)
    const clientName = normalizeSearchText(client?.name)
    return ordersListSourceOrders().filter((order) => {
      const values = [order.clientId, order.clientLabel, order.client, order.title, order.addressLabel, order.location]
        .map((value) => normalizeSearchText(value))
        .filter(Boolean)
      return values.some((value) => (clientId && value.includes(clientId)) || (clientName && value.includes(clientName)))
    })
  }

  function clientProfileWorkerCount(client = appState.clientProfileCurrent) {
    return clientProfileText(client?.assignees)
      .split(/[,;\n]+/)
      .map((item) => item.trim())
      .filter(Boolean).length
  }

  function clientProfileActivePanelForGroup(group) {
    if (group === 'operations') {
      return CLIENT_PROFILE_OPERATION_TABS.includes(appState.clientProfileOperationsTab)
        ? appState.clientProfileOperationsTab
        : 'orders'
    }
    if (group === 'documents') {
      return CLIENT_PROFILE_DOCUMENT_TABS.includes(appState.clientProfileDocumentsTab)
        ? appState.clientProfileDocumentsTab
        : 'contacts'
    }
    return group
  }

  function clientProfileSetActiveSubtab(group, tab) {
    if (group === 'operations' && CLIENT_PROFILE_OPERATION_TABS.includes(tab)) {
      appState.clientProfileOperationsTab = tab
    } else if (group === 'documents' && CLIENT_PROFILE_DOCUMENT_TABS.includes(tab)) {
      appState.clientProfileDocumentsTab = tab
    } else {
      return
    }
    clientProfileSetActiveTab(group)
  }

  function clientProfileSetActiveTab(tab = 'profile') {
    const nextTab = CLIENT_PROFILE_DETAIL_TABS.includes(tab) ? tab : 'profile'
    const activePanel = clientProfileActivePanelForGroup(nextTab)
    appState.clientProfileActiveTab = nextTab

    document.querySelectorAll('[data-client-profile-tab]').forEach((button) => {
      const active = button.getAttribute('data-client-profile-tab') === nextTab
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-selected', active ? 'true' : 'false')
      button.setAttribute('tabindex', active ? '0' : '-1')
    })
    const subtabs = document.getElementById('cpdSubtabs')
    if (subtabs) {
      subtabs.hidden = !['operations', 'documents'].includes(nextTab)
    }
    document.querySelectorAll('[data-client-profile-subtabs]').forEach((groupNode) => {
      const active = groupNode.getAttribute('data-client-profile-subtabs') === nextTab
      groupNode.hidden = !active
    })
    document.querySelectorAll('[data-client-profile-subtab]').forEach((button) => {
      const group = button.getAttribute('data-client-profile-subtab-group')
      const active = group === nextTab && button.getAttribute('data-client-profile-subtab') === activePanel
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-selected', active ? 'true' : 'false')
      button.setAttribute('tabindex', active ? '0' : '-1')
    })
    document.querySelectorAll('[data-client-profile-panel]').forEach((panel) => {
      const active = panel.getAttribute('data-client-profile-panel') === activePanel
      panel.classList.toggle('is-active', active)
      panel.hidden = !active
    })
    const editToolbar = document.querySelector('#view-clientProfileDetails .cpd-content-toolbar')
    if (editToolbar) {
      editToolbar.hidden = nextTab !== 'profile'
    }

    if (activePanel === 'calendar') {
      void (async () => {
        await clientProfileCalendarEnsureInitialized()
        clientProfileCalendarRenderEvents()
      })()
    }
    if (activePanel === 'profitability') {
      void profitabilityFeature.open(appState.clientProfileCurrent)
    }
  }

  function renderClientProfileSummary(client) {
    const zones = clientProfileZones(client)
    const tasks = clientProfileTasks(client)
    const activeTasks = tasks.filter((task) => !kanbanTaskIsCompleted(task))
    const statusClass = clientProfileStatusClass(client.status)

    clientProfileSetText('cpdAvatar', clientProfileInitials(client), '--')
    const avatar = document.getElementById('cpdAvatar')
    if (avatar) {
      avatar.className = `cpd-avatar cpd-avatar--${clientProfileAvatarClass(client)}`
    }
    clientProfileSetText('cpdClientName', client.name)
    clientProfileSetText('cpdClientId', `ID: ${client.id}`)
    clientProfileSetText('cpdHeroClientId', client.id)
    const heroClientType = document.querySelector('[data-cpd-hero-client-type]')
    const inlineHeroClientType = document.querySelector('[data-cpd-hero-client-type-inline]')
    if (heroClientType) {
      const clientType = clientProfileClientTypeLabel(client.clientType)
      heroClientType.textContent = clientType || 'Brak danych'
      heroClientType.classList.toggle('is-empty', !clientType)
      if (inlineHeroClientType) {
        inlineHeroClientType.textContent = clientType || 'Brak danych'
        inlineHeroClientType.classList.toggle('is-empty', !clientType)
      }
    }
    const badge = document.getElementById('cpdStatusBadge')
    const inlineBadge = document.getElementById('cpdHeroStatusBadge')
    if (badge) {
      badge.textContent = normalizeClientStatus(client.status)
      badge.className = `BadgeStatus cpd-status-badge is-${statusClass}`
    }
    if (inlineBadge) {
      inlineBadge.textContent = normalizeClientStatus(client.status)
      inlineBadge.className = `BadgeStatus cpd-status-badge is-${statusClass}`
    }
    clientProfileSetText('cpdStatZones', zones.length, '0')
    clientProfileSetText('cpdStatActiveTasks', activeTasks.length, '0')
    clientProfileSetText('cpdStatWorkers', clientProfileWorkerCount(client), '0')
    clientProfileSetText('cpdStatLastExecution', clientProfileDateTimeLabel(client.lastExecutionAt))
    clientProfileSetText('cpdQuickCoordinator', client.coordinator)
    clientProfileSetText('cpdHeroCoordinator', client.coordinator)
    clientProfileSetText('cpdQuickContact', client.contactPerson || client.phone || client.email || client.contact)
    clientProfileSetText('cpdQuickCity', client.city)
    clientProfileSetText('cpdHeroCity', client.city)
    clientProfileSetText('cpdQuickFrequency', client.serviceFrequency)
  }

  function renderClientProfileFields(client) {
    const values = {
      cpdFieldId: client.id,
      cpdFieldStatus: client.status,
      cpdFieldClientType: clientProfileClientTypeLabel(client.clientType),
      cpdFieldName: client.name,
      cpdFieldNip: client.nip,
      cpdFieldObjectType: client.objectType,
      cpdFieldCooperationStart: clientProfileCooperationPeriodLabel(client),
      cpdFieldCoordinator: client.coordinator,
      cpdFieldContactPerson: client.contactPerson,
      cpdFieldPhone: client.phone,
      cpdFieldEmail: client.email,
      cpdFieldEmergencyContact: client.emergencyContact,
      cpdFieldContactPosition: client.contactPosition,
      cpdFieldCity: client.city,
      cpdFieldAddress: client.address,
      cpdFieldPostalCode: client.postalCode,
      cpdFieldAccessHours: client.accessHours,
      cpdFieldAccessMethod: client.accessMethod,
      cpdFieldServiceEntry: client.serviceEntry,
      cpdFieldServiceType: client.serviceType,
      cpdFieldFrequency: client.serviceFrequency,
      cpdFieldServiceDays: client.serviceDays,
      cpdFieldPreferredHours: client.preferredHours,
      cpdFieldWorkMode: client.workMode,
      cpdFieldSla: client.sla,
      cpdFieldRbhAmount: clientProfileNumberLabel(client.rbhAmount),
      cpdFieldPermissions: client.requiredPermissions,
      cpdFieldBhp: client.bhpRequirements,
      cpdFieldRestrictions: client.workRestrictions,
      cpdFieldExcludedZones: client.excludedZones,
      cpdFieldOperationalRisks: client.operationalRisks,
      cpdFieldSpecialInstructions: client.specialInstructions,
      cpdFieldChemicals: client.chemistry,
      cpdFieldEquipment: client.equipment,
      cpdFieldSpecialEquipment: client.specialEquipment,
      cpdFieldStorage: client.storagePlace,
      cpdFieldBackroomAccess: client.backroomAccess,
      cpdFieldTechnicalNotes: client.technicalNotes,
      cpdFieldInternalNotes: client.internalNotes,
    }

    Object.entries(values).forEach(([id, value]) => {
      document.getElementById(id)?.classList.remove('is-editing-control', 'cpd-notes-inline-editor')
      clientProfileSetText(id, value, id === 'cpdFieldInternalNotes' ? 'Brak notatek' : 'Brak danych')
    })
    renderClientProfileInternalNotesInline(client)

    const statusField = document.getElementById('cpdFieldStatus')
    if (statusField) {
      const status = normalizeClientStatus(client.status)
      statusField.classList.remove('is-empty')
      statusField.innerHTML = `<span class="cpd-status-badge is-${clientProfileStatusClass(status)}">${escapeHtml(status)}</span>`
    }
  }

  function clientProfileDataRow(columns = []) {
    return `<div class="cpd-data-row">${columns.map((column) => `<div>${column}</div>`).join('')}</div>`
  }

  function clientProfileEmptyDataRow(text, columns = 1) {
    return `<div class="cpd-data-row cpd-data-row--empty">${Array.from({ length: Math.max(1, columns) }, (_, index) => `<div>${index === 0 ? escapeHtml(text) : ''}</div>`).join('')}</div>`
  }

  function renderClientProfileOrders(client) {
    const orders = clientProfileOrders(client)
    const tasks = clientProfileTasks(client)
    clientProfileSetText('cpdOrdersTotal', orders.length + tasks.length, '0')
    clientProfileSetText('cpdOrdersActive', tasks.filter((task) => !kanbanTaskIsCompleted(task)).length, '0')
    clientProfileSetText('cpdOrdersDone', tasks.filter((task) => kanbanTaskIsCompleted(task)).length, '0')
    const rows = document.getElementById('cpdOrdersRows')
    if (!rows) return
    const items = [
      ...orders.map((order) => ({
        title: ordersTimelineClientLabel(order) || order.title || 'Zlecenie',
        date: order.date || order.dateYmd || order.dayKey || '',
        status: order.completed ? 'Ukończone' : 'Aktywne',
        worker: ordersWorkerSelectionLabel(ordersNormalizeOrderRows(order)) || '-',
        place: ordersTimelineAddressLabel(order) || '-',
        type: order.orderType || order.type || 'Zlecenie',
        priority: order.priority || order.priorytet || 'Normalny',
      })),
      ...tasks.map((task) => ({
        title: task.title || 'Zadanie',
        date: task.dateYmd || task.dueDate || '',
        status: kanbanTaskIsCompleted(task) ? 'Ukończone' : 'Aktywne',
        worker: calendarSelectionText(task.workers) || '-',
        place: calendarSelectionText(task.objects) || '-',
        type: calendarToneLabel(calendarTaskToneValue(task)),
        priority: task.priority || task.priorytet || '-',
      })),
    ]

    rows.innerHTML = items.length
      ? items
          .map((item) =>
            clientProfileDataRow([
              `<strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.type)}</span>`,
              `<span class="cpd-data-badge">${escapeHtml(item.status)}</span>`,
              escapeHtml(clientProfileDateLabel(item.date) || item.date || '-'),
              escapeHtml(item.worker),
              escapeHtml(item.place),
              escapeHtml(item.priority),
            ]),
          )
          .join('')
      : clientProfileEmptyDataRow('Brak zleceń dla wybranych filtrów.', 6)
  }

  function renderClientProfileContacts(client) {
    const rows = [
      { person: client.contactPerson || client.name, position: client.contactPosition, phone: client.phone || client.contact, email: client.email, note: 'Kontakt główny' },
      { person: 'Kontakt awaryjny', position: '', phone: client.emergencyContact, email: '', note: 'Pilne zgłoszenia' },
    ].filter((item) => [item.person, item.phone, item.email].some((value) => clientProfileText(value)))
    clientProfileSetText('cpdContactsCount', `${rows.length} kontaktów`, '0 kontaktów')
    const root = document.getElementById('cpdContactsRows')
    if (!root) return
    root.innerHTML = rows.length
      ? rows
          .map((item) =>
            clientProfileDataRow([
              `<strong>${escapeHtml(item.person)}</strong><span>${escapeHtml(item.note)}</span>`,
              escapeHtml(profileFieldValue(item.position)),
              escapeHtml(profileFieldValue(item.phone)),
              escapeHtml(profileFieldValue(item.email)),
              escapeHtml(profileFieldValue(client.address)),
            ]),
          )
          .join('')
      : clientProfileEmptyDataRow('Brak zapisanych kontaktów.', 5)
  }

  function renderClientProfileMessages(client) {
    const rows = clientProfileTasks(client).filter((task) => calendarTaskToneValue(task) === 'message' || task.generatedFromComment)
    const root = document.getElementById('cpdMessagesRows')
    if (!root) return
    root.innerHTML = rows.length
      ? rows
          .map((task) =>
            clientProfileDataRow([
              escapeHtml(task.dateYmd || task.createdAt || '-'),
              `<strong>${escapeHtml(task.title || 'Wiadomość')}</strong><span>${escapeHtml(task.description || task.note || '')}</span>`,
              escapeHtml(calendarSelectionText(task.workers) || '-'),
              `<span class="cpd-data-badge">${kanbanTaskIsCompleted(task) ? 'Zamknięte' : 'Otwarte'}</span>`,
            ]),
          )
          .join('')
      : clientProfileEmptyDataRow('Brak wiadomości powiązanych z tym klientem.', 4)
  }

  function renderClientProfileAdditional(client) {
    const root = document.getElementById('cpdAdditionalGrid')
    if (!root) return
    const groups = [
      ['Warunki obsługi', [['Rodzaj usługi', client.serviceType], ['Częstotliwość', client.serviceFrequency], ['Dni', client.serviceDays], ['Preferowane godziny', client.preferredHours], ['Tryb pracy', client.workMode], ['SLA', client.sla], ['Ilość RBH', clientProfileNumberLabel(client.rbhAmount)]]],
      ['Operacyjne', [['Uprawnienia', client.requiredPermissions], ['BHP', client.bhpRequirements], ['Ograniczenia', client.workRestrictions], ['Strefy wyłączone', client.excludedZones], ['Ryzyka', client.operationalRisks], ['Instrukcje specjalne', client.specialInstructions]]],
      ['Chemia i sprzęt', [['Chemia', client.chemistry], ['Sprzęt', client.equipment], ['Sprzęt specjalny', client.specialEquipment], ['Miejsce przechowywania', client.storagePlace], ['Dostęp do zaplecza', client.backroomAccess], ['Uwagi techniczne', client.technicalNotes]]],
      ['Notatki', [['Informacje klienta', client.clientInfo], ['Notatki wewnętrzne', client.internalNotes]]],
    ]
    root.innerHTML = groups
      .map(
        ([title, items]) => {
          const visibleItems = items.filter(([, value]) => clientProfileText(value))
          return `
            <article class="cpd-additional-card">
              <h4>${escapeHtml(title)}</h4>
              ${
                visibleItems.length
                  ? visibleItems.map(([label, value]) => `<div class="cpd-additional-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(profileFieldValue(value))}</strong></div>`).join('')
                  : '<div class="cpd-additional-empty">Brak danych w tej sekcji.</div>'
              }
            </article>
          `
        },
      )
      .join('')
  }

  function renderClientProfileSimpleRows(rootId, emptyText, columns = 4) {
    const root = document.getElementById(rootId)
    if (root) {
      root.innerHTML = clientProfileEmptyDataRow(emptyText, columns)
    }
  }

  function renderClientProfileZones(client) {
    const zones = clientProfileZones(client)
    clientProfileSetText('cpdZonesCount', `Strefy klienta: ${zones.length}`)
    const root = document.getElementById('cpdZonesRows')
    if (!root) return
    root.innerHTML = zones.length
      ? zones
          .map((zone) => {
            const code = profileFieldValue(zone.zoneId || zone.qrCode || zone.qr)
            const name = profileFieldValue(zone.zone || zone.name || zone.zoneName, 'Strefa')
            const location = profileFieldValue(zone.location || zone.address)
            const zoneFunction = profileFieldValue(zone.function || zone.type)
            const clientName = profileFieldValue(client.name || zone.clientName || zone.client, 'Klient')
            const clientId = profileFieldValue(client.id || client.clientId || zone.clientId)
            const dateLabel = clientProfileZoneDateLabel(zone)
            const editedBy = profileFieldValue(zone.editedBy || zone.updatedBy)
            const zoneVisual = clientProfileZoneVisualMeta({ ...zone, zoneName: name, qr: code })
            const toneClass = clientProfileZoneToneClass(zoneFunction)
            const clientToneClass = clientProfileZoneClientToneClass({ ...client, clientName, clientId })
            const actionId = profileFieldValue(zone.id || zone.zoneId || zone.qr || code)
            return `
              <div class="zones-row cpd-zones-row">
                <div class="zones-qr-cell">
                  <span class="zones-qr-badge">QR</span>
                  <span>
                    <strong>${escapeHtml(code)}</strong>
                    <small>Kod QR</small>
                  </span>
                </div>
                <div class="zones-client-cell">
                  <span class="zones-client-avatar ${clientToneClass}">${escapeHtml(clientProfileInitials({ name: clientName, id: clientId }))}</span>
                  <span>
                    <strong title="${escapeHtml(clientName)}">${escapeHtml(clientName)}</strong>
                    <small>${escapeHtml(clientId)}</small>
                  </span>
                </div>
                <div class="zones-zone-cell">
                  <span class="zones-zone-icon ${zoneVisual.className}" aria-hidden="true">${zoneVisual.iconHtml}</span>
                  <strong title="${escapeHtml(name)}">${escapeHtml(name)}</strong>
                </div>
                <div title="${escapeHtml(location)}"><span class="zones-location-text">${escapeHtml(location)}</span></div>
                <div><span class="zones-function-pill ${toneClass}">${escapeHtml(zoneFunction)}</span></div>
                <div class="zones-date-cell">${escapeHtml(dateLabel)}</div>
                <div><strong>${escapeHtml(editedBy)}</strong></div>
                <div class="zones-actions">
                  <button class="btn2 zones-action-btn" type="button" data-zone-id="${escapeHtml(actionId)}" aria-label="Podgląd strefy ${escapeHtml(code)}">&#8942;</button>
                </div>
              </div>
            `
          })
          .join('')
      : '<div class="zones-row cpd-zones-row cpd-zones-row-empty"><div>Brak stref przypisanych do tego klienta.</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>'
  }

  function renderClientProfileReports(client) {
    const zones = clientProfileZones(client)
    const tasks = clientProfileTasks(client)
    const clientId = String(client?.id ?? '').trim()
    const zoneIds = new Set(zones.map((zone) => String(zone.zoneId ?? '').trim()).filter(Boolean))
    const events = appState.eventRows.filter((event) => {
      const eventClientId = String(event?.clientId ?? event?.zone?.client?.clientId ?? '').trim()
      const zoneId = String(event?.zoneId ?? event?.zone?.zoneId ?? '').trim()
      return eventClientId === clientId || (zoneId && zoneIds.has(zoneId))
    })
    const seconds = events.reduce((sum, event) => sum + Number(event.durationSec ?? 0), 0)
    clientProfileSetText('cpdReportsEvents', events.length, '0')
    clientProfileSetText('cpdReportsTime', durationSecondsToHm(seconds), '0 min')
    clientProfileSetText('cpdReportsTasks', tasks.length, '0')
    clientProfileSetText('cpdReportsZones', zones.length, '0')
    const root = document.getElementById('cpdReportsRows')
    if (root) {
      root.innerHTML = `
        <div class="cpd-report-row">
          <div><strong>Aktywność klienta</strong><span>Zdarzenia, strefy i zadania z obecnych danych portalu</span></div>
          <b>${escapeHtml(events.length)} zdarzeń</b>
        </div>
        <div class="cpd-report-row">
          <div><strong>Czas realizacji</strong><span>Suma czasu zdarzeń dla stref klienta</span></div>
          <b>${escapeHtml(durationSecondsToHm(seconds))}</b>
        </div>
      `
    }
  }

  function renderClientProfileTimeline(client) {
    const root = document.getElementById('cpdTimelineList')
    if (!root) return
    const items = [
      ['Utworzono profil', clientProfileDateLabel(client.createdAt)],
      ['Okres współpracy', clientProfileCooperationPeriodLabel(client)],
      ['Zmiana koordynatora', clientProfileDateLabel(client.coordinatorChangedAt)],
      ['Ostatnia realizacja', clientProfileDateLabel(client.lastExecutionAt)],
      ['Ostatnie przypisanie pracownika', clientProfileDateLabel(client.lastWorkerAssignmentAt)],
      ['Ostatnia aktualizacja', clientProfileDateLabel(client.updatedAt)],
    ].filter(([, value]) => clientProfileText(value))
    root.innerHTML = items.length
      ? items.map(([label, value]) => `<li><strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span></li>`).join('')
      : '<li><strong>Brak danych timeline</strong><span>Uzupełnij daty w profilu klienta.</span></li>'
  }

  function renderClientProfileEmployees(client) {
    const root = document.getElementById('cpdEmployeeList')
    const addButton = document.getElementById('cpdEmployeeAssignOpenBtn')
    if (addButton) {
      addButton.hidden = !canManageClients()
    }
    if (!root) return
    const sourceClient = appState.clientProfileEditMode
      ? { ...client, assignees: appState.clientProfileEditAssignees }
      : client
    const assigned = clientProfileAssignedWorkerItems(sourceClient)
    root.innerHTML = assigned.length
      ? assigned
          .map((worker) => {
            const avatarClass = worker.custom ? 'violet' : clientProfileWorkerOptionAvatarClass(worker)
            const removeButton = canManageClients()
              ? `<button class="cpd-employee-remove-btn" type="button" data-cpd-employee-remove="${escapeHtml(worker.key)}" aria-label="Usuń przypisanego pracownika">×</button>`
              : ''
            return `
              <div class="cpd-employee-item">
                <div class="cpd-employee-copy">
                  <span class="cpd-worker-avatar cpd-worker-avatar--${escapeHtml(avatarClass)}">${escapeHtml(clientProfileWorkerOptionInitials(worker))}</span>
                  <div>
                    <strong>${escapeHtml(worker.label)}</strong>
                    ${worker.subLabel ? `<small>${escapeHtml(worker.subLabel)}</small>` : ''}
                  </div>
                </div>
                ${removeButton}
              </div>
            `
          })
          .join('')
      : '<div class="cpd-employee-empty">Brak przypisanych pracowników.</div>'
  }

  function fillClientProfileCoordinatorOptions(selected = '') {
    const select = document.getElementById('clKoordynator')
    if (!select) return

    const selectedValue = String(selected ?? '').trim()
    const uniqueNames = [...new Set(appState.workers.map((worker) => String(worker.name ?? '').trim()).filter(Boolean))]
    uniqueNames.sort((left, right) => left.localeCompare(right, 'pl', { sensitivity: 'base' }))

    select.innerHTML = '<option value="">-- wybierz --</option>'
    if (selectedValue && !uniqueNames.includes(selectedValue)) {
      uniqueNames.unshift(selectedValue)
    }
    uniqueNames.forEach((name) => {
      const option = document.createElement('option')
      option.value = name
      option.textContent = name
      select.appendChild(option)
    })

    select.value = selectedValue
  }

  async function ensureClientProfileWorkersLoaded() {
    if (appState.workersLoaded) return true
    if (!appState.session?.orgId) return false
    await fetchWorkersForCurrentSession()
    return appState.workersLoaded
  }

  function clientProfileSetAssignOverlayOpen(id, open) {
    const overlay = document.getElementById(id)
    if (overlay) {
      overlay.style.display = open ? 'flex' : 'none'
    }
  }

  function renderClientProfileWorkerPickerList(mode) {
    const isCoordinator = mode === 'coordinator'
    const list = document.getElementById(isCoordinator ? 'cpdCoordinatorWorkerList' : 'cpdAssignWorkerList')
    const input = document.getElementById(isCoordinator ? 'cpdCoordinatorSearchInput' : 'cpdAssignSearchInput')
    const confirm = document.getElementById(isCoordinator ? 'cpdCoordinatorConfirmBtn' : 'cpdAssignConfirmBtn')
    if (!list) return

    const query = normalizeSearchText(input?.value)
    const selectedKeys = isCoordinator
      ? new Set(appState.clientProfileCoordinatorSelectedKey ? [appState.clientProfileCoordinatorSelectedKey] : [])
      : appState.clientProfileAssignSelectedKeys
    const options = clientProfileWorkerOptions().filter((option) => !query || option.searchText.includes(query))

    if (confirm) {
      confirm.disabled = isCoordinator
        ? !appState.clientProfileCoordinatorSelectedKey
        : appState.clientProfileAssignSelectedKeys.size === 0
    }

    list.innerHTML = options.length
      ? options
          .map((option) => {
            const checked = selectedKeys.has(option.key)
            return `
              <label class="cpd-assign-row${checked ? ' is-selected' : ''}">
                <input
                  type="${isCoordinator ? 'radio' : 'checkbox'}"
                  name="${isCoordinator ? 'cpdCoordinatorWorker' : 'cpdAssignWorker'}"
                  value="${escapeHtml(option.key)}"
                  data-cpd-${isCoordinator ? 'coordinator' : 'assign'}-option
                  ${checked ? 'checked' : ''}
                />
                <span class="cpd-worker-avatar cpd-worker-avatar--${escapeHtml(clientProfileWorkerOptionAvatarClass(option))}">${escapeHtml(clientProfileWorkerOptionInitials(option))}</span>
                <span class="cpd-assign-copy">
                  <strong>${escapeHtml(option.label)}</strong>
                  ${option.subLabel ? `<small>${escapeHtml(option.subLabel)}</small>` : ''}
                </span>
                <span class="cpd-assign-choice" aria-hidden="true"></span>
              </label>
            `
          })
          .join('')
      : '<div class="cpd-assign-empty">Brak pracowników dla wybranego wyszukiwania.</div>'
  }

  async function openClientProfileCoordinatorPicker() {
    if (!appState.clientProfileEditMode) return
    const loaded = await ensureClientProfileWorkersLoaded()
    if (!loaded) {
      showTransientNotice('Nie udało się wczytać listy pracowników.', 'error')
      return
    }
    const input = document.getElementById('cpdCoordinatorSearchInput')
    if (input) input.value = ''
    const selected = clientProfileFindWorkerOptionByText(document.querySelector('[data-client-profile-edit-field="coordinator"]')?.value ?? appState.clientProfileCurrent?.coordinator)
    appState.clientProfileCoordinatorSelectedKey = selected?.key ?? ''
    renderClientProfileWorkerPickerList('coordinator')
    const list = document.getElementById('cpdCoordinatorWorkerList')
    if (list) list.scrollTop = 0
    clientProfileSetAssignOverlayOpen('cpdCoordinatorOverlay', true)
    window.setTimeout(() => input?.focus(), 0)
  }

  async function openClientProfileAssignPicker() {
    const loaded = await ensureClientProfileWorkersLoaded()
    if (!loaded) {
      showTransientNotice('Nie udało się wczytać listy pracowników.', 'error')
      return
    }
    const input = document.getElementById('cpdAssignSearchInput')
    if (input) input.value = ''
    const currentAssignees = appState.clientProfileEditMode
      ? appState.clientProfileEditAssignees
      : appState.clientProfileCurrent?.assignees
    appState.clientProfileAssignSelectedKeys = clientProfileAssignedWorkerKeys({
      ...appState.clientProfileCurrent,
      assignees: currentAssignees,
    })
    renderClientProfileWorkerPickerList('assign')
    const list = document.getElementById('cpdAssignWorkerList')
    if (list) list.scrollTop = 0
    clientProfileSetAssignOverlayOpen('cpdAssignOverlay', true)
    window.setTimeout(() => input?.focus(), 0)
  }

  function closeClientProfileCoordinatorPicker() {
    appState.clientProfileCoordinatorSelectedKey = ''
    clientProfileSetAssignOverlayOpen('cpdCoordinatorOverlay', false)
  }

  function closeClientProfileAssignPicker() {
    appState.clientProfileAssignSelectedKeys = new Set()
    clientProfileSetAssignOverlayOpen('cpdAssignOverlay', false)
  }

  function setClientProfileCoordinatorEditValue(value) {
    const normalizedValue = clientProfileText(value)
    const node = document.getElementById('cpdFieldCoordinator')
    if (node) {
      node.innerHTML = renderClientProfileWorkerSelect({ field: 'coordinator' }, normalizedValue)
      return
    }
    const hiddenInput = document.querySelector('[data-client-profile-edit-field="coordinator"]')
    if (hiddenInput) hiddenInput.value = normalizedValue
    const option = clientProfileFindWorkerOptionByText(normalizedValue)
    const labelNode = document.getElementById('cpdCoordinatorPickerLabel')
    const subLabelNode = document.getElementById('cpdCoordinatorPickerSubLabel')
    if (labelNode) labelNode.textContent = normalizedValue || 'Wybierz koordynatora'
    if (subLabelNode) subLabelNode.textContent = option?.subLabel || (option ? option.id : 'Lista pracowników')
  }

  function confirmClientProfileCoordinatorPicker() {
    const option = clientProfileWorkerOptions().find((item) => item.key === appState.clientProfileCoordinatorSelectedKey)
    if (!option || !appState.clientProfileCurrent) return
    setClientProfileCoordinatorEditValue(option.label)
    closeClientProfileCoordinatorPicker()
  }

  async function saveClientProfileAssignees(assignees) {
    if (!appState.session?.orgId || !appState.clientProfileCurrent) return false
    const payload = { assignees: clientProfileText(assignees) }

    try {
      await updateClient(appState.session.orgId, appState.clientProfileCurrent.id, payload)
      const updatedClient = mapClientForProfileView({
        ...appState.clientProfileCurrent,
        ...payload,
      })
      appState.clientProfileCurrent = updatedClient
      const index = appState.clients.findIndex((client) => String(client.id ?? client.clientId ?? '') === String(updatedClient.id))
      if (index >= 0) {
        appState.clients[index] = {
          ...appState.clients[index],
          ...updatedClient,
        }
      }
      filterClientProfileTable()
      renderClientProfileSummary(updatedClient)
      renderClientProfileEmployees(updatedClient)
      renderClientProfileTimeline(updatedClient)
      showTransientNotice('Zapisano przypisanych pracowników.')
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udało się zapisać przypisanych pracowników.'
      alert(message)
      return false
    }
  }

  async function confirmClientProfileAssignPicker() {
    if (!appState.clientProfileCurrent) return
    const assignees = clientProfileFormatWorkerAssignmentsFromKeys(appState.clientProfileAssignSelectedKeys)
    if (appState.clientProfileEditMode) {
      appState.clientProfileEditAssignees = assignees
      renderClientProfileEmployees(appState.clientProfileCurrent)
      clientProfileSetText('cpdStatWorkers', clientProfileWorkerCount({ ...appState.clientProfileCurrent, assignees }), '0')
      closeClientProfileAssignPicker()
      return
    }

    const saved = await saveClientProfileAssignees(assignees)
    if (saved) {
      closeClientProfileAssignPicker()
    }
  }

  async function removeClientProfileAssignedWorker(key) {
    if (!appState.clientProfileCurrent) return
    const currentAssignees = appState.clientProfileEditMode
      ? appState.clientProfileEditAssignees
      : appState.clientProfileCurrent.assignees
    const nextAssignees = clientProfileAssignedWorkerItems({
      ...appState.clientProfileCurrent,
      assignees: currentAssignees,
    })
      .filter((worker) => worker.key !== key)
      .map((worker) => worker.label)
      .join(', ')

    if (appState.clientProfileEditMode) {
      appState.clientProfileEditAssignees = nextAssignees
      renderClientProfileEmployees(appState.clientProfileCurrent)
      clientProfileSetText('cpdStatWorkers', clientProfileWorkerCount({ ...appState.clientProfileCurrent, assignees: nextAssignees }), '0')
      return
    }

    await saveClientProfileAssignees(nextAssignees)
  }

  async function saveClientProfileInternalNotesInline() {
    if (!appState.session?.orgId || !appState.clientProfileCurrent) return
    const input = document.getElementById('cpdInternalNotesInput')
    if (!input) return
    const saveButton = document.getElementById('cpdInternalNotesSaveBtn')
    const payload = { internalNotes: String(input.value ?? '').trim() }

    if (saveButton) saveButton.disabled = true
    try {
      await updateClient(appState.session.orgId, appState.clientProfileCurrent.id, payload)
      const updatedClient = mapClientForProfileView({
        ...appState.clientProfileCurrent,
        ...payload,
      })
      appState.clientProfileCurrent = updatedClient
      const index = appState.clients.findIndex((client) => String(client.id ?? client.clientId ?? '') === String(updatedClient.id))
      if (index >= 0) {
        appState.clients[index] = {
          ...appState.clients[index],
          ...updatedClient,
        }
      }
      filterClientProfileTable()
      renderClientProfileFields(updatedClient)
      renderClientProfileAdditional(updatedClient)
      showTransientNotice('Zapisano notatki wewnętrzne.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udało się zapisać notatek wewnętrznych.'
      alert(message)
      if (saveButton) saveButton.disabled = false
    }
  }

  function renderClientProfilePanels(client) {
    renderClientProfileOrders(client)
    renderClientProfileContacts(client)
    renderClientProfileMessages(client)
    renderClientProfileAdditional(client)
    renderClientProfileSimpleRows('cpdOffersRows', 'Brak ofert. Dodanie ofert wymaga rozszerzenia danych.', 4)
    renderClientProfileSimpleRows('cpdFilesRows', 'Brak plików. Upload plików nie zapisuje danych w tej wersji.', 4)
    renderClientProfileZones(client)
    renderClientProfileReports(client)
    renderClientProfileTimeline(client)
    renderClientProfileEmployees(client)
  }

  function setClientProfileEditMode(editMode) {
    const wasEditing = appState.clientProfileEditMode
    appState.clientProfileEditMode = Boolean(editMode)
    if (appState.clientProfileEditMode && !wasEditing) {
      appState.clientProfileEditAssignees = clientProfileText(appState.clientProfileCurrent?.assignees)
    }
    if (!appState.clientProfileEditMode) {
      appState.clientProfileEditAssignees = ''
    }
    const actions = document.getElementById('cpdEditActions')
    const editButton = document.getElementById('cpdEditMenuBtn')
    const heroEditButton = document.getElementById('cpdHeroEditBtn')
    if (actions) actions.hidden = !appState.clientProfileEditMode
    if (editButton) editButton.hidden = appState.clientProfileEditMode || !canManageClients()
    if (heroEditButton) heroEditButton.hidden = appState.clientProfileEditMode || !canManageClients()

    if (!appState.clientProfileCurrent) return

    if (!appState.clientProfileEditMode) {
      renderClientProfileFields(appState.clientProfileCurrent)
      renderClientProfileEmployees(appState.clientProfileCurrent)
      return
    }

    CLIENT_PROFILE_EDIT_FIELDS.forEach((definition) => {
      const node = document.getElementById(definition.id)
      if (!node) return
      const rawValue = definition.type === 'date'
        ? clientProfileDateInputValue(appState.clientProfileCurrent[definition.field])
        : definition.type === 'number'
          ? clientProfileNumberInputValue(appState.clientProfileCurrent[definition.field])
          : clientProfileText(appState.clientProfileCurrent[definition.field])
      const value = definition.field === 'clientType' ? clientProfileClientTypeValue(rawValue) : rawValue
      const name = escapeHtml(definition.field)
      node.classList.remove('is-empty', 'cpd-notes-inline-editor')
      node.classList.add('is-editing-control')
      if (definition.type === 'select') {
        node.innerHTML = `
          <select class="cpd-edit-input" data-client-profile-edit-field="${name}">
            ${definition.options.map((option) => {
              const optionValue = typeof option === 'object' ? option.value : option
              const optionLabel = typeof option === 'object' ? option.label : option
              return `<option value="${escapeHtml(optionValue)}"${optionValue === value ? ' selected' : ''}>${escapeHtml(optionLabel)}</option>`
            }).join('')}
          </select>
        `
        return
      }
      if (definition.type === 'worker-single') {
        node.innerHTML = renderClientProfileWorkerSelect(definition, value)
        return
      }
      if (definition.type === 'date-range') {
        node.innerHTML = renderClientProfileDateRange(definition, appState.clientProfileCurrent)
        return
      }
      if (definition.type === 'weekdays') {
        node.innerHTML = renderClientProfileWeekdayPicker(definition, value)
        return
      }
      if (definition.type === 'time-range') {
        node.innerHTML = renderClientProfileTimeRange(definition, value)
        return
      }
      if (definition.type === 'number') {
        node.innerHTML = `<input class="cpd-edit-input" data-client-profile-edit-field="${name}" type="number" min="0" step="${escapeHtml(definition.step ?? 'any')}" inputmode="decimal" value="${escapeHtml(value)}" />`
        return
      }
      if (definition.multiline) {
        node.innerHTML = `<textarea class="cpd-edit-input" data-client-profile-edit-field="${name}" rows="3">${escapeHtml(value)}</textarea>`
        return
      }
      node.innerHTML = `<input class="cpd-edit-input" data-client-profile-edit-field="${name}" type="${definition.type === 'date' ? 'date' : 'text'}" value="${escapeHtml(value)}" />`
    })
    renderClientProfileEmployees(appState.clientProfileCurrent)
  }

  function readClientProfileEditPayload() {
    const payload = {}
    CLIENT_PROFILE_EDIT_FIELDS.forEach((definition) => {
      if (definition.type === 'weekdays') {
        payload[definition.field] = readClientProfileWeekdays(definition)
        return
      }
      if (definition.type === 'date-range') {
        const root = document.querySelector(`[data-client-profile-date-range="${definition.field}"]`)
        payload[definition.field] = String(root?.querySelector('[data-client-profile-date-range-part="start"]')?.value ?? '').trim()
        payload[definition.endField] = String(root?.querySelector('[data-client-profile-date-range-part="end"]')?.value ?? '').trim()
        return
      }
      if (definition.type === 'time-range') {
        payload[definition.field] = readClientProfileTimeRange(definition)
        return
      }
      const input = document.querySelector(`[data-client-profile-edit-field="${definition.field}"]`)
      if (!input) return
      if (definition.type === 'number') {
        payload[definition.field] = String(input.value ?? '').trim().replace(',', '.')
        return
      }
      payload[definition.field] = String(input.value ?? '').trim()
    })
    payload.assignees = clientProfileText(appState.clientProfileEditAssignees)
    return payload
  }

  function renderClientProfileDetailView() {
    const empty = document.getElementById('cpdEmptyState')
    const layout = document.getElementById('cpdLayout')
    const client = appState.clientProfileCurrent

    if (!client) {
      if (empty) empty.hidden = false
      if (layout) layout.hidden = true
      return
    }

    if (empty) empty.hidden = true
    if (layout) layout.hidden = false
    renderClientProfileSummary(client)
    renderClientProfileFields(client)
    renderClientProfilePanels(client)
    setClientProfileEditMode(appState.clientProfileEditMode)
    clientProfileSetActiveTab(appState.clientProfileActiveTab)
  }

  function openClientProfileDetails(clientId) {
    const client = clientProfileFindById(clientId)
    if (!client) {
      showTransientNotice('Nie znaleziono klienta.', 'error')
      return
    }

    appState.clientProfileCurrent = mapClientForProfileView(client)
    appState.clientProfileEditMode = false
    appState.clientProfileActiveTab = 'profile'
    appState.clientProfileOperationsTab = 'orders'
    appState.clientProfileDocumentsTab = 'contacts'
    if (typeof window.go === 'function') {
      window.go('clientProfileDetails')
    } else {
      renderClientProfileDetailView()
    }
  }

  async function fetchClientProfileDetailForCurrentSession(force = false) {
    if (!appState.session?.orgId) return
    if (!force && appState.clientsLoaded) {
      renderClientProfileDetailView()
      return
    }
    await fetchClientProfileForCurrentSession(force)
    if (appState.clientProfileCurrent?.id) {
      const refreshed = clientProfileFindById(appState.clientProfileCurrent.id)
      appState.clientProfileCurrent = refreshed ? mapClientForProfileView(refreshed) : appState.clientProfileCurrent
    }
    renderClientProfileDetailView()
  }

  async function saveClientProfileEdit() {
    if (!appState.session?.orgId || !appState.clientProfileCurrent) {
      return
    }

    const payload = readClientProfileEditPayload()
    if (!clientProfileText(payload.name)) {
      alert('Nazwa klienta nie moze byc pusta.')
      return
    }

    try {
      const savedClient = await updateClient(appState.session.orgId, appState.clientProfileCurrent.id, payload)
      const updatedClient = mapClientForProfileView({
        ...appState.clientProfileCurrent,
        ...savedClient,
        status: normalizeClientStatus(savedClient.status ?? payload.status),
      })
      appState.clientProfileCurrent = updatedClient
      const index = appState.clients.findIndex((client) => String(client.id ?? client.clientId ?? '') === String(updatedClient.id))
      if (index >= 0) {
        appState.clients[index] = {
          ...appState.clients[index],
          ...updatedClient,
        }
      }
      appState.clientProfileEditMode = false
      appState.clientProfileEditAssignees = ''
      filterClientProfileTable()
      renderClientProfileDetailView()
      const endDatePendingDeploy = clientProfileText(payload.cooperationEndAt) && !clientProfileText(savedClient.cooperationEndAt)
      showTransientNotice(endDatePendingDeploy
        ? 'Zapisano profil. Data końca okresu wymaga jeszcze wdrożenia Data Connect.'
        : 'Zapisano profil klienta.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Blad zapisu profilu klienta.'
      alert(message)
    }
  }

  function clientProfileCalendarEvents(client = appState.clientProfileCurrent) {
    const taskEvents = clientProfileTasks(client).map((task) => ({
      id: task.id,
      title: task.title || 'Zadanie',
      start: task.dateYmd || task.dueDate || todayYmd(),
      allDay: !clientProfileText(task.startTime || task.time),
      backgroundColor: kanbanTaskIsCompleted(task) ? '#71dd37' : '#696cff',
      borderColor: kanbanTaskIsCompleted(task) ? '#71dd37' : '#696cff',
      extendedProps: { type: 'task' },
    }))
    const orderEvents = clientProfileOrders(client).map((order) => ({
      id: `order:${order.id ?? order.orderId ?? Math.random()}`,
      title: ordersTimelineClientLabel(order) || order.title || 'Zlecenie',
      start: order.date || order.dateYmd || order.dayKey || todayYmd(),
      allDay: true,
      backgroundColor: order.completed ? '#71dd37' : '#03c3ec',
      borderColor: order.completed ? '#71dd37' : '#03c3ec',
      extendedProps: { type: 'order' },
    }))
    return [...taskEvents, ...orderEvents]
  }

  function clientProfileCalendarInstanceReady(instance) {
    return Boolean(
      instance &&
        typeof instance.updateSize === 'function' &&
        typeof instance.removeAllEvents === 'function' &&
        typeof instance.addEventSource === 'function',
    )
  }

  function clientProfileCalendarRenderEvents() {
    if (!clientProfileCalendarInstanceReady(appState.clientProfileCalendarInstance)) return
    const events = clientProfileCalendarEvents()
    appState.clientProfileCalendarRows = events
    appState.clientProfileCalendarInstance.removeAllEvents()
    appState.clientProfileCalendarInstance.addEventSource(events)
    const empty = document.getElementById('cpdCalendarEmpty')
    if (empty) empty.hidden = events.length > 0
    clientProfileSetText('cpdCalendarSyncMeta', `Wydarzenia klienta: ${events.length}`)
  }

  async function clientProfileCalendarEnsureInitialized() {
    const mount = document.getElementById('cpdCalendarMount')
    if (!mount) return

    const {
      Calendar,
      dayGridPlugin,
      timeGridPlugin,
      listPlugin,
      interactionPlugin,
      plLocale,
    } = await loadFullCalendar()

    if (appState.clientProfileCalendarInstance instanceof Calendar) {
      appState.clientProfileCalendarInstance.updateSize()
      return
    }

    appState.clientProfileCalendarInstance = new Calendar(mount, {
      plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
      locale: plLocale,
      initialView: 'dayGridMonth',
      height: 'auto',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,listWeek',
      },
      eventClick: (info) => {
        const type = info?.event?.extendedProps?.type
        if (type === 'task' && info?.event?.id) {
          calendarOpenEditor(info.event.id)
        }
      },
    })
    appState.clientProfileCalendarInstance.render()
  }

  async function fetchClientProfileForCurrentSession(force = false) {
    const body = document.getElementById('clientProfileBody')
    syncClientProfilePermissions()

    if (!appState.session?.orgId) {
      if (body) {
        body.innerHTML = '<div class="cp-row cp-row-empty cp-row-empty--error"><div>Brak aktywnej sesji organizacji.</div><div></div><div></div></div>'
      }
      return
    }

    if (!force && appState.clientsLoaded) {
      filterClientProfileTable()
      return
    }

    if (body) {
      body.innerHTML = '<div class="cp-row cp-row-empty"><div>Ladowanie danych...</div><div></div><div></div></div>'
    }

    try {
      const clients = await getClients(appState.session.orgId)
      appState.clients = clients
      appState.clientsLoaded = true
      filterClientProfileTable()
      setSubwelcomeMetric('#view-clientProfile .subwelcome', clients.length)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Błąd pobierania profilu klientów.'
      if (body) {
        body.innerHTML = `<div class="cp-row cp-row-empty cp-row-empty--error"><div>${escapeHtml(message)}</div><div></div><div></div></div>`
      }
    }
  }

  function bindClientProfileViewFunctions() {
    const binding = createBindingHelpers()
    ensureClientModalLayer()
    syncClientProfilePermissions()
    renderClientProfileCooperationFilter()

    window.ClientProfileModule = {
      fetch: () => fetchClientProfileForCurrentSession(true),
    }
    window.openClientModal = openClientModal
    window.openClientEditModal = (clientId) => openClientModal('edit', clientId)
    window.closeClModal = closeClientModal
    window.saveClientData = saveClientData

    binding.add(document.getElementById('cpSearchName'), 'input', filterClientProfileTable)
    binding.add(document.getElementById('cpSearchNip'), 'input', filterClientProfileTable)
    binding.add(document.getElementById('cpSearchCity'), 'input', filterClientProfileTable)
    binding.add(document.getElementById('cpSearchCoordinator'), 'input', filterClientProfileTable)
    binding.add(document.getElementById('cpSearchStatus'), 'change', filterClientProfileTable)
    binding.add(document.getElementById('cpPageSize'), 'change', filterClientProfileTable)
    binding.add(document.getElementById('cpSearchBtn'), 'click', filterClientProfileTable)
    binding.add(document.getElementById('cpCooperationModel'), 'click', (event) => {
      const button = event.target.closest('[data-client-profile-model]')
      if (!button) return
      setClientProfileCooperationFilter(button.getAttribute('data-client-profile-model'))
    })
    binding.add(document.getElementById('cpRefreshBtn'), 'click', () => {
      void fetchClientProfileForCurrentSession(true)
    })
    binding.add(document.getElementById('cpAddClientBtn'), 'click', () => openClientModal('add'))
    binding.add(document.getElementById('clSaveBtn'), 'click', () => {
      void saveClientData()
    })
    ;['clModalCloseBtn', 'clCancelBtn'].forEach((id) => {
      binding.add(document.getElementById(id), 'click', closeClientModal)
    })
    binding.add(document.getElementById('clModal'), 'click', (event) => {
      if (event.target?.id === 'clModal') {
        closeClientModal()
      }
    })
    ;['cpDeleteConfirmCloseBtn', 'cpDeleteConfirmCancelBtn'].forEach((id) => {
      binding.add(document.getElementById(id), 'click', () => closeClientProfileDeleteConfirm(false))
    })
    binding.add(document.getElementById('cpDeleteConfirmConfirmBtn'), 'click', () => closeClientProfileDeleteConfirm(true))
    binding.add(document.getElementById('cpDeleteConfirmOverlay'), 'click', (event) => {
      if (event.target?.id === 'cpDeleteConfirmOverlay') {
        closeClientProfileDeleteConfirm(false)
      }
    })

    ;['cpSearchName', 'cpSearchNip', 'cpSearchCity', 'cpSearchCoordinator'].forEach((id) => {
      binding.add(document.getElementById(id), 'keydown', (event) => {
        if (event.key !== 'Enter') return
        filterClientProfileTable()
      })
    })

    binding.add(document.getElementById('clientProfileBody'), 'click', (event) => {
      const button = event.target.closest('[data-client-profile-action][data-client-profile-id]')
      if (!button) {
        return
      }

      const clientId = String(button.getAttribute('data-client-profile-id') ?? '').trim()
      if (!clientId) {
        return
      }

      const action = String(button.getAttribute('data-client-profile-action') ?? 'profile')
      if (action === 'edit') {
        openClientModal('edit', clientId)
        return
      }
      if (action === 'delete') {
        void deleteClientProfileData(clientId)
        return
      }
      openClientProfileDetails(clientId)
    })

    return () => {
      delete window.ClientProfileModule
      delete window.openClientModal
      delete window.openClientEditModal
      delete window.closeClModal
      delete window.saveClientData
      binding.done()
    }
  }

  function bindClientProfileDetailsViewFunctions() {
    const binding = createBindingHelpers()

    binding.add(document.getElementById('cpdTabs'), 'click', (event) => {
      const button = event.target.closest('[data-client-profile-tab]')
      if (!button) return
      clientProfileSetActiveTab(button.getAttribute('data-client-profile-tab'))
    })
    binding.add(document.getElementById('cpdSubtabs'), 'click', (event) => {
      const button = event.target.closest('[data-client-profile-subtab]')
      if (!button) return
      clientProfileSetActiveSubtab(
        button.getAttribute('data-client-profile-subtab-group'),
        button.getAttribute('data-client-profile-subtab'),
      )
    })
    binding.add(document.getElementById('cpdEditMenuBtn'), 'click', () => setClientProfileEditMode(true))
    binding.add(document.getElementById('cpdHeroEditBtn'), 'click', () => setClientProfileEditMode(true))
    binding.add(document.getElementById('cpdHeroMessageBtn'), 'click', () => clientProfileSetActiveSubtab('documents', 'messages'))
    binding.add(document.getElementById('cpdHeroExportBtn'), 'click', () => clientProfileSetActiveSubtab('operations', 'reports'))
    binding.add(document.getElementById('cpdInlineCancelBtn'), 'click', () => {
      appState.clientProfileEditMode = false
      renderClientProfileDetailView()
    })
    binding.add(document.getElementById('cpdInlineSaveBtn'), 'click', () => {
      void saveClientProfileEdit()
    })
    binding.add(document.getElementById('cpdOrdersAddBtn'), 'click', () => {
      if (typeof window.go === 'function') {
        window.go('orders')
      }
      ordersOpenAddEditor()
    })
    binding.add(document.getElementById('view-clientProfileDetails'), 'click', (event) => {
      if (event.target.closest('#cpdCoordinatorPickerBtn')) {
        void openClientProfileCoordinatorPicker()
        return
      }
      if (event.target.closest('#cpdEmployeeAssignOpenBtn')) {
        void openClientProfileAssignPicker()
        return
      }
      if (event.target.closest('#cpdInternalNotesSaveBtn')) {
        void saveClientProfileInternalNotesInline()
        return
      }
      const removeButton = event.target.closest('[data-cpd-employee-remove]')
      if (removeButton) {
        void removeClientProfileAssignedWorker(removeButton.getAttribute('data-cpd-employee-remove'))
      }
    })
    binding.add(document.getElementById('cpdCoordinatorSearchInput'), 'input', () => renderClientProfileWorkerPickerList('coordinator'))
    binding.add(document.getElementById('cpdAssignSearchInput'), 'input', () => renderClientProfileWorkerPickerList('assign'))
    binding.add(document.getElementById('cpdCoordinatorWorkerList'), 'change', (event) => {
      const input = event.target.closest('[data-cpd-coordinator-option]')
      if (!input) return
      appState.clientProfileCoordinatorSelectedKey = String(input.value ?? '')
      renderClientProfileWorkerPickerList('coordinator')
    })
    binding.add(document.getElementById('cpdAssignWorkerList'), 'change', (event) => {
      const input = event.target.closest('[data-cpd-assign-option]')
      if (!input) return
      const key = String(input.value ?? '')
      if (input.checked) {
        appState.clientProfileAssignSelectedKeys.add(key)
      } else {
        appState.clientProfileAssignSelectedKeys.delete(key)
      }
      renderClientProfileWorkerPickerList('assign')
    })
    ;['cpdCoordinatorCloseBtn', 'cpdCoordinatorCancelBtn'].forEach((id) => {
      binding.add(document.getElementById(id), 'click', closeClientProfileCoordinatorPicker)
    })
    ;['cpdAssignCloseBtn', 'cpdAssignCancelBtn'].forEach((id) => {
      binding.add(document.getElementById(id), 'click', closeClientProfileAssignPicker)
    })
    binding.add(document.getElementById('cpdCoordinatorConfirmBtn'), 'click', confirmClientProfileCoordinatorPicker)
    binding.add(document.getElementById('cpdAssignConfirmBtn'), 'click', () => {
      void confirmClientProfileAssignPicker()
    })
    binding.add(document.getElementById('cpdCoordinatorOverlay'), 'click', (event) => {
      if (event.target?.id === 'cpdCoordinatorOverlay') closeClientProfileCoordinatorPicker()
    })
    binding.add(document.getElementById('cpdAssignOverlay'), 'click', (event) => {
      if (event.target?.id === 'cpdAssignOverlay') closeClientProfileAssignPicker()
    })

    return () => {
      profitabilityFeature.destroy()
      if (!import.meta.env.DEV) delete window.ClientProfitabilityModule
      binding.done()
    }
  }

  return {
    bind: bindClientProfileViewFunctions,
    bindDetails: bindClientProfileDetailsViewFunctions,
    fetch: fetchClientProfileForCurrentSession,
    fetchDetail: fetchClientProfileDetailForCurrentSession,
    fillCoordinatorOptions: fillClientProfileCoordinatorOptions,
    findById: clientProfileFindById,
    openDetails: openClientProfileDetails,
    openModal: openClientModal,
    renderDetail: renderClientProfileDetailView,
    resetSession: () => profitabilityFeature.resetSession(),
  }
}
