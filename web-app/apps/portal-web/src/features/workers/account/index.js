import './style.css'
import template from './template.html?raw'
import {
  buildWorkTimeEvidencePdf,
  createWorkTimeEvidenceColumns,
  sanitizeWorkTimeEvidenceFilePart,
  validateWorkTimeEvidenceDateRange,
  workTimeEvidenceCsvContent,
  workTimeEvidenceWorkTotal,
} from '../work_time_evidence_export.js'
import {
  OWN_WORKDAY_EDIT_DENIED_MESSAGE,
  isOwnWorkdayEditBlocked,
} from '../workdayEditAccess.js'
import {
  workIntervalCodes,
  workIntervalGpsCoordinates,
  workIntervalsFromRow,
  workIntervalsTotalSeconds,
} from '../workIntervals.js'
import {
  findPendingTimeEditorItem,
  preciseTimeInputValue,
  timeEditorSourceRows,
} from './workdayTimeEditorModel.js'

export const route = 'workerAccount'
export const viewId = 'view-workerAccount'
export { template }

const WORKER_ACCOUNT_TABS = new Set(['account', 'security', 'roles', 'orders', 'activity', 'time', 'files'])
const WORKER_ACCOUNT_EDITABLE_TABS = new Set(['account', 'security', 'roles'])
const WORKER_ACCOUNT_PAGE_SIZES = [5, 10, 25, 50]
const WORKER_ACCOUNT_TIME_PAGE_SIZE = 50
const WORKER_ACCOUNT_TIME_FETCH_PAGE_SIZE = 1000
const WORKER_ACCOUNT_ACTIVITY_FETCH_PAGE_SIZE = 200
const WORKER_ACCOUNT_MONTH_NAMES_PL = [
  'styczen',
  'luty',
  'marzec',
  'kwiecien',
  'maj',
  'czerwiec',
  'lipiec',
  'sierpien',
  'wrzesien',
  'pazdziernik',
  'listopad',
  'grudzien',
]
const WORKER_ROLE_COPY = {
  OWNER: {
    title: 'Owner',
    description: 'Pełny dostęp. Rola wyłącznie dla założyciela organizacji i nie można jej zmienić.',
  },
  ADMIN: {
    title: 'Administrator',
    description: 'Pełny dostęp: podgląd, dodawanie, edycja i usuwanie.',
  },
  MANAGER: {
    title: 'Manager',
    description: 'Może przeglądać, dodawać i edytować, ale nie może usuwać.',
  },
  COORDINATOR: {
    title: 'Koordynator',
    description: 'Może logować się do portalu wyłącznie w trybie podglądu.',
  },
  WORKER: {
    title: 'Worker',
    description: 'Dostęp wyłącznie do aplikacji mobilnej; bez dostępu do portalu.',
  },
}
const WORKER_TYPE_DEFAULT = 'Stały personel na obiekcie'
const WORKER_TYPE_OPTIONS = [
  'Administrator',
  'Pracownik Biurowy',
  WORKER_TYPE_DEFAULT,
  'Zespół Mobilny',
]
const DASHBOARD_LOCAL_CACHE_PREFIX = 'portal.dashboard.snapshot.'
const WORKER_TRAINING_OPTIONS = [
  'Szkolenie BHP',
  'Instruktaz stanowiskowy',
  'Srodki czystosci',
  'Maszyny czyszczace',
  'Praca na wysokosci',
  'Ochrona danych',
]
const PASSWORD_EYE_OPEN_ICON = `
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
    <circle cx="12" cy="12" r="2.8" stroke="currentColor" stroke-width="1.8"></circle>
  </svg>`
const PASSWORD_EYE_CLOSED_ICON = `
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M3 3l18 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
    <path d="M10.6 5.2A9.5 9.5 0 0 1 12 5c6 0 9.5 7 9.5 7a15.4 15.4 0 0 1-3.2 3.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
    <path d="M6.7 6.8A16.4 16.4 0 0 0 2.5 12s3.5 7 9.5 7c1.7 0 3.2-.4 4.5-1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
    <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
  </svg>`
const WORKER_ACCOUNT_AVATAR_ICON = `
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 12a4.4 4.4 0 1 0 0-8.8 4.4 4.4 0 0 0 0 8.8Z" stroke="currentColor" stroke-width="1.8"></path>
    <path d="M4 21a8 8 0 0 1 16 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
  </svg>`

export function createWorkerAccountFeature(ctx) {
  const {
    appState,
    canAdministerWorkers,
    canManageWorkers,
    canResetWorkerPasswords,
    createBindingHelpers,
    durationSecondsToHm,
    durationSecondsToHms,
    ensureJsPdfLoaded,
    ensurePdfUnicodeFont,
    escapeHtml,
    getWorkdays,
    getWorkers,
    getWorkerTime,
    normalizeSearchText,
    openEventEditor,
    ordersListSourceOrders,
    ordersSyncRemoteTimelineOrders,
    paginate,
    setPdfUnicodeFont,
    setWorkerPassword,
    showTransientNotice,
    todayYmd,
    toIso,
    updateEvent,
    updateWorkday,
    updateWorker,
    ymdToIsoRangeEnd,
    ymdToIsoRangeStart,
  } = ctx

  function setText(id, value) {
    const node = document.getElementById(id)
    if (node) node.textContent = String(value ?? '-')
  }

  function setInputValue(id, value) {
    const input = document.getElementById(id)
    if (input) input.value = String(value ?? '')
  }

  function workerPhotoUrl(worker = {}) {
    const raw = String(
      worker.photoUrl ??
        worker.profilePhotoUrl ??
        worker.avatarUrl ??
        worker.imageUrl ??
        '',
    ).trim()
    return /^(https?:\/\/|data:image\/(?:png|jpe?g|webp);base64,)/i.test(raw) ? raw : ''
  }

  function workerPhotoMarkup(photoUrl = '') {
    const safeUrl = String(photoUrl ?? '').trim()
    if (!safeUrl) return WORKER_ACCOUNT_AVATAR_ICON
    return `<img src="${escapeHtml(safeUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
  }

  function renderWorkerAvatar(worker = {}, overridePhotoUrl) {
    const avatar = document.getElementById('waAvatar')
    if (!avatar) return
    const photoUrl = overridePhotoUrl === undefined ? workerPhotoUrl(worker) : String(overridePhotoUrl ?? '').trim()
    avatar.innerHTML = workerPhotoMarkup(photoUrl)
    avatar.classList.toggle('is-photo', Boolean(photoUrl))
  }

  function setWorkerAccountPhotoState({ photoUrl = '', photoDataUrl = '', removePhoto = false } = {}) {
    appState.workerAccountPhotoUrl = String(photoUrl ?? '').trim()
    appState.workerAccountPhotoDataUrl = String(photoDataUrl ?? '').trim()
    appState.workerAccountRemovePhoto = Boolean(removePhoto)
    syncWorkerAccountPhotoUi()
  }

  function syncWorkerAccountPhotoUi() {
    const worker = resolveCurrentWorker() ?? {}
    const storedPhotoUrl = workerPhotoUrl(worker)
    const previewUrl = appState.workerAccountRemovePhoto
      ? ''
      : String(appState.workerAccountPhotoDataUrl || appState.workerAccountPhotoUrl || storedPhotoUrl).trim()
    const preview = document.getElementById('waPhotoPreview')
    if (preview) preview.innerHTML = workerPhotoMarkup(previewUrl)
    renderWorkerAvatar(worker, previewUrl)

    const editing = isEditingTab('account') && canManageWorkers()
    const selectButton = document.getElementById('waSelectPhotoBtn')
    const removeButton = document.getElementById('waRemovePhotoBtn')
    const quickButton = document.getElementById('waPhotoQuickBtn')
    const fileInput = document.getElementById('waPhotoInput')
    if (selectButton instanceof HTMLButtonElement) selectButton.disabled = !editing
    if (removeButton instanceof HTMLButtonElement) {
      removeButton.disabled = !editing || (!previewUrl && !storedPhotoUrl)
    }
    if (quickButton instanceof HTMLButtonElement) {
      quickButton.disabled = !canManageWorkers()
      quickButton.title = canManageWorkers()
        ? 'Dodaj lub zmien zdjecie profilowe'
        : 'Brak uprawnien do zmiany zdjecia'
    }
    if (fileInput instanceof HTMLInputElement) fileInput.disabled = !editing
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(reader.error || new Error('Nie udalo sie odczytac zdjecia.'))
      reader.readAsDataURL(file)
    })
  }

  function loadImageForWorkerPhoto(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Nie udalo sie wczytac zdjecia.'))
      image.src = dataUrl
    })
  }

  async function compressWorkerProfilePhoto(file) {
    if (!file || !/^image\/(?:png|jpe?g|webp)$/i.test(String(file.type ?? ''))) {
      throw new Error('Wybierz zdjecie PNG, JPG albo WEBP.')
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new Error('Plik jest zbyt duzy. Wybierz zdjecie do 8 MB.')
    }
    const dataUrl = await readFileAsDataUrl(file)
    const image = await loadImageForWorkerPhoto(dataUrl)
    const size = 320
    const sourceSize = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height)
    const sourceX = Math.max(0, ((image.naturalWidth || image.width) - sourceSize) / 2)
    const sourceY = Math.max(0, ((image.naturalHeight || image.height) - sourceSize) / 2)
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Przegladarka nie moze przygotowac miniatury.')
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size)
    return canvas.toDataURL('image/webp', 0.82)
  }

  function ensureSelectOption(select, value) {
    if (!(select instanceof HTMLSelectElement)) return
    const optionValue = String(value ?? '').trim()
    if (!optionValue || Array.from(select.options).some((option) => option.value === optionValue)) return
    const option = document.createElement('option')
    option.value = optionValue
    option.textContent = optionValue
    select.appendChild(option)
  }

  function normalizeKey(value) {
    return normalizeSearchText(value).toLowerCase()
  }

  function addIdentityKey(keys, value) {
    const raw = String(value ?? '').trim()
    if (!raw) return
    const addVariant = (variant) => {
      const normalized = normalizeKey(variant)
      if (!normalized) return
      keys.add(normalized)
      const spaced = normalized.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim()
      if (spaced) {
        keys.add(spaced)
        const parts = spaced.split(' ').filter(Boolean)
        if (parts.length > 1) {
          keys.add(parts.slice().reverse().join(' '))
        }
      }
      const compact = normalized.replace(/[\s._-]+/g, '')
      if (compact) keys.add(compact)
    }
    addVariant(raw)
    const localPart = raw.includes('@') ? raw.split('@')[0] : ''
    if (localPart) {
      addVariant(localPart)
    }
  }

  function workerIdentityKeys(worker = {}) {
    const keys = new Set()
    ;[
      worker.login,
      worker.workerLogin,
      worker.id,
      worker.workerId,
      worker.email,
      worker.loginEmail,
      worker.name,
      worker.workerName,
      worker.workername,
      worker.worker_name,
      worker.fullName,
      worker.displayName,
    ].forEach((value) => addIdentityKey(keys, value))
    return keys
  }

  function selectedWorkerKeys() {
    const keys = new Set()
    ;[
      appState.workerAccountTargetKey,
      appState.selectedWorkerLogin,
      appState.selectedWorkerName,
    ].forEach((value) => addIdentityKey(keys, value))
    if (keys.size) return keys

    ;[
      appState.workerAccountCurrent?.login,
      appState.workerAccountCurrent?.workerLogin,
      appState.workerAccountCurrent?.id,
      appState.workerAccountCurrent?.workerId,
      appState.workerAccountCurrent?.email,
      appState.workerAccountCurrent?.loginEmail,
      appState.workerAccountCurrent?.name,
      appState.workerAccountCurrent?.workerName,
      appState.workerAccountCurrent?.workername,
      appState.workerAccountCurrent?.worker_name,
      appState.workerAccountCurrent?.fullName,
      appState.workerAccountCurrent?.displayName,
    ].forEach((value) => addIdentityKey(keys, value))
    return keys
  }

  function workerLogin(worker = {}) {
    return String(worker.login ?? worker.workerLogin ?? '').trim()
  }

  function workerId(worker = {}) {
    return String(worker.workerId ?? worker.id ?? workerLogin(worker)).trim()
  }

  function workerName(worker = {}) {
    return String(worker.name ?? worker.workerName ?? worker.fullName ?? workerLogin(worker) ?? '').trim()
  }

  function workerRelatedRows(worker = {}) {
    const baseKeys = workerIdentityKeys(worker)
    const rows = [
      worker,
      appState.workerAccountCurrent,
      ...(Array.isArray(appState.workerProfileRows) ? appState.workerProfileRows : []),
      ...(Array.isArray(appState.workerProfileViewRows) ? appState.workerProfileViewRows : []),
      ...(Array.isArray(appState.workers) ? appState.workers : []),
      ...(Array.isArray(appState.workerTimeRows) ? appState.workerTimeRows : []),
      ...(Array.isArray(appState.workerTimeViewRows) ? appState.workerTimeViewRows : []),
    ].filter(Boolean)
    const seen = new Set()
    return rows.filter((row) => {
      const keys = workerIdentityKeys(row)
      if (baseKeys.size && ![...keys].some((key) => baseKeys.has(key))) return false
      const uniqueKey = [...keys].sort().join('|')
      if (uniqueKey && seen.has(uniqueKey)) return false
      if (uniqueKey) seen.add(uniqueKey)
      return true
    })
  }

  function workerFetchCandidates(worker = {}) {
    const values = [
      appState.selectedWorkerLogin,
      appState.selectedWorkerName,
    ]
    workerRelatedRows(worker).forEach((row) => {
      values.push(
        row.login,
        row.workerLogin,
        row.worker_login,
        row.id,
        row.workerId,
        row.worker_id,
        row.employeeId,
        row.employee_id,
        row.email,
        row.loginEmail,
        row.name,
        row.workerName,
        row.workername,
        row.worker_name,
        row.fullName,
        row.displayName,
      )
    })

    const seen = new Set()
    const candidates = []
    values.forEach((value) => {
      const raw = String(value ?? '').trim()
      if (!raw) return
      ;[raw, raw.includes('@') ? raw.split('@')[0] : ''].forEach((candidate) => {
        const normalized = normalizeKey(candidate)
        if (!normalized || seen.has(normalized)) return
        seen.add(normalized)
        candidates.push(String(candidate).trim())
      })
    })
    return candidates
  }

  function workerRole(worker = {}) {
    return String(worker.role ?? worker.type ?? worker.workerType ?? 'WORKER').trim() || 'WORKER'
  }

  function roleValue(value) {
    const normalized = normalizeKey(value)
    if (normalized.includes('owner') || normalized.includes('wlasciciel')) return 'OWNER'
    if (normalized.includes('admin') || normalized.includes('superadmin')) return 'ADMIN'
    if (normalized.includes('manager') || normalized.includes('menager') || normalized.includes('kierownik')) return 'MANAGER'
    if (normalized.includes('koordynator') || normalized.includes('coordinator') || normalized.includes('coordynator')) return 'COORDINATOR'
    return 'WORKER'
  }

  function roleLabel(value) {
    const key = roleValue(value)
    return WORKER_ROLE_COPY[key]?.title ?? String(value ?? 'Pracownik').trim()
  }

  function isOwnerWorker(worker = {}) {
    return Boolean(worker?.isOwner || roleValue(workerRole(worker)) === 'OWNER')
  }

  function workerTypeValue(value) {
    const raw = value && typeof value === 'object'
      ? value.workerType ?? value.profileType ?? value.employeeType ?? value.staffType ?? value.role ?? ''
      : value
    const normalized = normalizeKey(raw)
    if (normalized.includes('admin') || normalized.includes('owner') || normalized.includes('superadmin')) return 'Administrator'
    if (
      normalized.includes('biurow') ||
      normalized.includes('koordynator') ||
      normalized.includes('coordinator') ||
      normalized.includes('coordynator') ||
      normalized.includes('manager') ||
      normalized.includes('menager') ||
      normalized.includes('kierownik')
    ) {
      return 'Pracownik Biurowy'
    }
    if (normalized.includes('mobil') || normalized.includes('zespol')) return 'Zespół Mobilny'
    if (normalized.includes('staly') || normalized.includes('personel') || normalized.includes('obiekt')) {
      return WORKER_TYPE_DEFAULT
    }
    if (normalized.includes('pracownik') || normalized === 'worker') return WORKER_TYPE_DEFAULT
    return WORKER_TYPE_OPTIONS.includes(String(raw ?? '').trim()) ? String(raw ?? '').trim() : WORKER_TYPE_DEFAULT
  }

  function workerField(worker = {}, keys = [], fallback = '') {
    for (const key of keys) {
      const value = worker?.[key]
      if (value !== undefined && value !== null && String(value).trim()) return value
    }
    return fallback
  }

  function dateInputValue(value) {
    const raw = String(value ?? '').trim()
    if (!raw) return ''
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
    const plMatch = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})/)
    if (plMatch) return `${plMatch[3]}-${plMatch[2]}-${plMatch[1]}`
    const date = new Date(raw)
    if (!Number.isFinite(date.getTime())) return ''
    return date.toISOString().slice(0, 10)
  }

  function workerTrainingValues(worker = {}) {
    const raw = worker.trainings ?? worker.trainingList ?? worker.workerTrainings ?? worker.training ?? []
    const values = Array.isArray(raw)
      ? raw
      : String(raw ?? '').split(/[,;\n]+/)
    return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))]
  }

  function trainingOptions(values = []) {
    const byKey = new Map()
    ;[...WORKER_TRAINING_OPTIONS, ...values].forEach((value) => {
      const label = String(value ?? '').trim()
      if (!label) return
      const key = normalizeKey(label)
      if (!byKey.has(key)) byKey.set(key, label)
    })
    return Array.from(byKey.values())
  }

  function selectedTrainingValues() {
    return Array.from(document.querySelectorAll('#waTrainingMenu [data-wa-training-option]:checked'))
      .map((input) => String(input.value ?? '').trim())
      .filter(Boolean)
  }

  function updateTrainingToggleLabel(values = selectedTrainingValues()) {
    const label = document.getElementById('waTrainingValue')
    if (!label) return
    if (!values.length) {
      label.textContent = 'Kliknij, aby wybrac przeszkolenia'
      return
    }
    label.textContent = values.length === 1 ? values[0] : `${values.length} wybrane: ${values.join(', ')}`
  }

  function renderTrainingMenu(values = []) {
    const menu = document.getElementById('waTrainingMenu')
    if (!menu) return
    const selected = new Set(values.map((value) => normalizeKey(value)))
    const disabled = !canAdministerWorkers()
    menu.innerHTML = trainingOptions(values).map((option) => {
      const id = `waTraining-${normalizeKey(option).replace(/[^a-z0-9]+/g, '-') || 'option'}`
      const checked = selected.has(normalizeKey(option))
      return `
        <label class="worker-account-training-option" for="${escapeHtml(id)}" role="option" aria-selected="${checked ? 'true' : 'false'}">
          <input id="${escapeHtml(id)}" type="checkbox" value="${escapeHtml(option)}" data-wa-training-option ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
          <span>${escapeHtml(option)}</span>
        </label>
      `
    }).join('')
    updateTrainingToggleLabel(values)
  }

  function setTrainingValues(values = []) {
    renderTrainingMenu(values)
    renderTrainingPreview(values)
  }

  function positionTrainingDropdown(field, menu, toggle) {
    field.classList.remove('is-drop-up')
    menu.style.removeProperty('--wa-training-menu-max')

    const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0
    const toggleRect = toggle.getBoundingClientRect()
    const cardRect = field.closest('.worker-account-form-card')?.getBoundingClientRect()
    const computed = window.getComputedStyle(menu)
    const maxHeight = Number.parseFloat(computed.maxHeight) || 156
    const desiredHeight = Math.min(menu.scrollHeight || maxHeight, maxHeight)
    const softBottom = cardRect ? Math.min(cardRect.bottom, viewportHeight) : viewportHeight
    const softTop = cardRect ? Math.max(cardRect.top, 0) : 0
    const spaceBelow = softBottom - toggleRect.bottom - 8
    const spaceAbove = toggleRect.top - softTop - 8
    const shouldDropUp = spaceBelow < desiredHeight && spaceAbove > spaceBelow
    const availableSpace = shouldDropUp ? spaceAbove : spaceBelow
    const nextMaxHeight = Math.max(96, Math.min(maxHeight, Math.floor(availableSpace)))

    field.classList.toggle('is-drop-up', shouldDropUp)
    menu.style.setProperty('--wa-training-menu-max', `${nextMaxHeight}px`)
  }

  function setTrainingDropdownOpen(open) {
    const field = document.getElementById('waTrainingField')
    const menu = document.getElementById('waTrainingMenu')
    const toggle = document.getElementById('waTrainingToggle')
    if (!field || !menu || !toggle || (toggle.disabled && open)) return
    if (!open) {
      menu.hidden = true
      field.classList.remove('is-open', 'is-drop-up')
      menu.style.removeProperty('--wa-training-menu-max')
      toggle.setAttribute('aria-expanded', 'false')
      return
    }

    menu.hidden = false
    field.classList.toggle('is-open', open)
    toggle.setAttribute('aria-expanded', 'true')
    positionTrainingDropdown(field, menu, toggle)
  }

  function toggleTrainingDropdown() {
    const menu = document.getElementById('waTrainingMenu')
    if (menu && !menu.querySelector('[data-wa-training-option]')) {
      renderTrainingMenu(workerTrainingValues(resolveCurrentWorker() || {}))
    }
    setTrainingDropdownOpen(Boolean(menu?.hidden))
  }

  function syncTrainingControlsDisabled(disabled) {
    const toggle = document.getElementById('waTrainingToggle')
    if (toggle) toggle.disabled = disabled
    document.querySelectorAll('#waTrainingMenu [data-wa-training-option]').forEach((input) => {
      input.disabled = disabled
    })
    if (disabled) setTrainingDropdownOpen(false)
  }

  function renderTrainingPreview(values = selectedTrainingValues()) {
    const root = document.getElementById('waTrainingPreview')
    if (!root) return
    const rows = values.map((value) => String(value ?? '').trim()).filter(Boolean)
    root.innerHTML = rows.length
      ? rows.map((value) => `<li>${escapeHtml(value)}</li>`).join('')
      : '<li>Brak wybranych przeszkolen</li>'
  }

  function isWorkerActive(worker = {}) {
    if (worker.active === undefined || worker.active === null) return true
    return Boolean(worker.active)
  }

  function isWorkerOnline(worker = {}) {
    return Boolean(worker.online)
  }

  function _workerInitials(worker = {}) {
    const source = workerName(worker) || workerLogin(worker)
    const parts = String(source).trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return '--'
    return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  }

  function formatDateTime(value) {
    const raw = typeof toIso === 'function' ? toIso(value) : String(value ?? '')
    if (!raw) return '-'
    const date = new Date(raw)
    if (!Number.isFinite(date.getTime())) return String(value ?? '-').trim() || '-'
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${day}.${month}.${year}, ${hour}:${minute}`
  }

  function profileCompleteness(worker = {}) {
    const values = [
      workerName(worker),
      workerLogin(worker),
      worker.email || worker.loginEmail,
      worker.phone,
      workerId(worker),
      workerRole(worker),
    ]
    const filled = values.filter((value) => String(value ?? '').trim()).length
    return Math.round((filled / values.length) * 100)
  }

  function _renderCompleteness(worker) {
    const percent = profileCompleteness(worker)
    setText('waCompletenessText', `${percent}%`)
    const bar = document.getElementById('waCompletenessBar')
    if (bar) bar.style.width = `${percent}%`
    const hint = document.getElementById('waCompletenessHint')
    if (hint) {
      hint.textContent = percent >= 100
        ? 'Profil pracownika jest kompletny.'
        : 'Uzupelnij telefon, email lub identyfikator, aby zwiekszyc kompletnosc.'
    }
  }

  function roleItemHtml(key, primary = false) {
    const copy = WORKER_ROLE_COPY[key] ?? WORKER_ROLE_COPY.WORKER
    return `
      <div class="worker-account-role-item">
        <i aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4.6-2.8 8.2-7 10-4.2-1.8-7-5.4-7-10V6l7-3Z" stroke="currentColor" stroke-width="1.8"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </i>
        <div>
          <strong>${escapeHtml(copy.title)}</strong>
          <span>${escapeHtml(copy.description)}</span>
          ${primary ? '<em class="badge">Glowna</em>' : ''}
        </div>
      </div>
    `
  }

  function renderRolePreview(worker) {
    const primaryRole = roleValue(workerRole(worker))
    const roles = primaryRole === 'WORKER' ? ['WORKER'] : [primaryRole, 'WORKER']
    const html = roles.map((role, index) => roleItemHtml(role, index === 0)).join('')
    ;['waRolePreviewList', 'waRolePanelPreviewList'].forEach((id) => {
      const root = document.getElementById(id)
      if (root) root.innerHTML = html
    })
  }

  function renderSecuritySummary(worker) {
    const lastChange = worker.passwordUpdatedAt || worker.passwordChangedAt || worker.passwordSetAt || ''
    const suffix = lastChange ? formatDateTime(lastChange) : 'brak danych'
    setText('waSecuritySummaryText', `Konto zabezpieczone. Ostatnia zmiana hasla: ${suffix}.`)
  }

  function renderRecentActivityPreview() {
    const root = document.getElementById('waRecentActivityList')
    if (!root) return
    const rows = Array.isArray(appState.workerAccountEventsRows) ? appState.workerAccountEventsRows.slice(0, 4) : []
    if (!rows.length) {
      root.innerHTML = '<div class="worker-account-empty-mini"><strong>Brak aktywnosci</strong><p>Nie znaleziono zdarzen dla tego pracownika.</p></div>'
      return
    }
    root.innerHTML = rows.map((row) => {
      const title = row.eventType || row.endReason || row.comment || row.workdayId || row.eventId || 'Zdarzenie uzytkownika'
      const date = formatDateTime(row.startAt ?? row.createdAt ?? row.updatedAt)
      const object = [row.clientName, row.zoneName, row.roomName, row.utilityRoomId].filter(Boolean).join(' / ') || 'Brak obiektu'
      return `
        <div class="worker-account-timeline-item">
          <span class="worker-account-timeline-icon" aria-hidden="true">A</span>
          <div>
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(date)} - ${escapeHtml(object)}</span>
          </div>
        </div>
      `
    }).join('')
  }

  function syncTopActions(worker) {
    const deactivate = document.getElementById('waTopDeactivateBtn')
    if (deactivate) {
      deactivate.disabled = !canAdministerWorkers() || !isWorkerActive(worker)
      deactivate.title = canAdministerWorkers()
        ? isWorkerActive(worker) ? 'Dezaktywuj konto pracownika' : 'Konto jest juz nieaktywne'
        : 'Dezaktywacja konta jest dostepna tylko dla Admina'
    }
  }

  function resolveCurrentWorker() {
    const keys = selectedWorkerKeys()
    const rows = [
      appState.workerAccountCurrent,
      ...(Array.isArray(appState.workerProfileRows) ? appState.workerProfileRows : []),
      ...(Array.isArray(appState.workers) ? appState.workers : []),
      ...(Array.isArray(appState.workerTimeRows) ? appState.workerTimeRows : []),
    ].filter(Boolean)

    if (!keys.size && rows[0]) return rows[0]
    return rows.find((worker) => [...workerIdentityKeys(worker)].some((key) => keys.has(key))) ?? null
  }

  function updateCurrentWorker(worker) {
    if (!worker) return
    appState.workerAccountCurrent = { ...worker }
    appState.selectedWorkerLogin = workerLogin(worker)
    appState.selectedWorkerName = workerName(worker)
    appState.workerAccountTargetKey = workerAccountIdentityKey(worker)
  }

  function workerAccountIdentityKey(worker = {}) {
    return [
      workerLogin(worker),
      workerId(worker),
      workerName(worker),
      worker.email,
      worker.loginEmail,
    ].map((value) => normalizeKey(value)).find(Boolean)
  }

  function workerAccountKey(worker = {}) {
    const orgKey = normalizeKey(appState.session?.orgId)
    const identity = workerAccountIdentityKey(worker)
    return [orgKey, identity].filter(Boolean).join('|')
  }

  function currentWorkerAccountKey() {
    const worker = resolveCurrentWorker()
    return worker ? workerAccountKey(worker) : ''
  }

  function clearWorkerAccountLoadKeys() {
    appState.workerAccountDataLoadingKey = ''
    appState.workerAccountSummaryLoadingKey = ''
    appState.workerAccountOrdersLoadingKey = ''
    appState.workerAccountActivityLoadingKey = ''
    appState.workerAccountTimeLoadingKey = ''
  }

  function clearWorkerAccountLoadedKeys() {
    appState.workerAccountLoadedWorkerKey = ''
    appState.workerAccountSummaryLoadedKey = ''
    appState.workerAccountOrdersLoadedKey = ''
    appState.workerAccountActivityLoadedKey = ''
    appState.workerAccountTimeLoadedKey = ''
  }

  function resetWorkerAccountRuntimeState({ clearLoadedKey = true, clearLoadingKeys = false } = {}) {
    appState.workerAccountOrderRows = []
    appState.workerAccountEventsRows = []
    appState.workerAccountDaysRows = []
    appState.workerAccountAllTimeRows = []
    appState.workerAccountTimeRows = []
    appState.workerAccountEventsPage = 1
    appState.workerAccountOrdersPage = 1
    appState.workerAccountTimePage = 1
    appState.workerAccountTimeSelectedKeys = new Set()
    appState.workerAccountTimeCurrentPageKeys = []
    appState.workerAccountDayEditorItem = null
    appState.workerAccountTimeCodeEditorItem = null
    appState.workerAccountEditTab = ''
    if (clearLoadedKey) clearWorkerAccountLoadedKeys()
    if (clearLoadingKeys) clearWorkerAccountLoadKeys()
  }

  function renderWorkerAccountSummaryFromState() {
    const monthRange = currentMonthRange()
    const weekRange = currentWeekRange()
    const timeRows = Array.isArray(appState.workerAccountAllTimeRows) ? appState.workerAccountAllTimeRows : []
    const eventRows = Array.isArray(appState.workerAccountEventsRows) ? appState.workerAccountEventsRows : []
    const orderRows = Array.isArray(appState.workerAccountOrderRows) ? appState.workerAccountOrderRows : []
    renderKpis({
      completedOrders: orderRows.filter((order) => orderCompleted(order)).length,
      monthSeconds: sumRowsInRange(timeRows, monthRange),
      weekSeconds: sumRowsInRange(timeRows, weekRange),
      eventCount: countEventsInRange(eventRows, monthRange),
    })
  }

  function beginWorkerAccountSession(worker) {
    const accountKey = workerAccountKey(worker)
    appState.workerAccountRequestSeq = Number(appState.workerAccountRequestSeq ?? 0) + 1
    appState.workerAccountCurrentKey = accountKey
    resetWorkerAccountRuntimeState({ clearLoadedKey: true, clearLoadingKeys: true })
    resetTimeFiltersToCurrentMonth()
    renderKpis()
    setTimeMonthCard([])
    renderRecentActivityPreview()
    renderAllTables()
    return {
      accountKey,
      requestSeq: Number(appState.workerAccountRequestSeq ?? 0),
    }
  }

  function ensureWorkerAccountSession(worker) {
    const accountKey = workerAccountKey(worker)
    if (
      accountKey &&
      appState.workerAccountCurrentKey === accountKey &&
      Number(appState.workerAccountRequestSeq ?? 0) > 0
    ) {
      return {
        accountKey,
        requestSeq: Number(appState.workerAccountRequestSeq ?? 0),
      }
    }
    updateCurrentWorker(worker)
    setShellVisible(true)
    renderWorkerCard(worker)
    renderForms(worker)
    return beginWorkerAccountSession(worker)
  }

  function makeWorkerAccountLoadContext(worker, section, options = {}) {
    return {
      section,
      accountKey: String(options.accountKey ?? workerAccountKey(worker)).trim(),
      requestSeq: Number(options.requestSeq ?? appState.workerAccountRequestSeq ?? 0),
      rangeKey: String(options.rangeKey ?? '').trim(),
    }
  }

  function isWorkerAccountLoadContextCurrent(context = {}) {
    return Boolean(
      context.accountKey &&
      appState.workerAccountCurrentKey === context.accountKey &&
      Number(appState.workerAccountRequestSeq ?? 0) === Number(context.requestSeq ?? -1),
    )
  }

  function resetTimeFiltersToCurrentMonth() {
    const month = currentMonthRange()
    const from = document.getElementById('waTimeFrom')
    const to = document.getElementById('waTimeTo')
    if (from) from.value = month.from
    if (to) to.value = month.to
    syncTimeMonthPickFromRange()
  }

  function _renderEmptyWorkerAccountData(accountKey = '') {
    resetWorkerAccountRuntimeState({ clearLoadedKey: false })
    appState.workerAccountLoadedWorkerKey = accountKey
    appState.workerAccountSummaryLoadedKey = accountKey
    appState.workerAccountOrdersLoadedKey = accountKey
    appState.workerAccountActivityLoadedKey = accountKey
    appState.workerAccountDataLoadingKey = ''
    renderKpis()
    setTimeMonthCard([])
    renderRecentActivityPreview()
    renderAllTables()
  }

  function applyWorkerToCachedRows(previousLogin, worker) {
    const previousKey = normalizeKey(previousLogin)
    const nextLogin = workerLogin(worker)
    ;['workers', 'workerProfileRows', 'workerProfileViewRows', 'workerTimeRows', 'workerTimeViewRows'].forEach((stateKey) => {
      const rows = Array.isArray(appState[stateKey]) ? appState[stateKey] : []
      const index = rows.findIndex((row) => {
        const keys = workerIdentityKeys(row)
        return keys.has(previousKey) || keys.has(normalizeKey(nextLogin)) || keys.has(normalizeKey(workerId(worker)))
      })
      if (index >= 0) rows.splice(index, 1, { ...rows[index], ...worker })
    })
  }

  function clearDashboardWorkerSnapshotCache() {
    if (typeof window === 'undefined' || !window.localStorage) return
    try {
      for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
        const key = window.localStorage.key(index)
        if (String(key ?? '').startsWith(DASHBOARD_LOCAL_CACHE_PREFIX)) {
          window.localStorage.removeItem(key)
        }
      }
    } catch {
      // Local storage can be unavailable in hardened browser profiles.
    }
  }

  function guardWorkerAccountOwnTimeEdit(worker = resolveCurrentWorker()) {
    const blocked = isOwnWorkdayEditBlocked({
      session: appState.session,
      workers: [appState.workerAccountCurrent, ...(appState.workers ?? [])].filter(Boolean),
      targetWorker: worker,
    })
    if (!blocked) return true

    showTransientNotice(OWN_WORKDAY_EDIT_DENIED_MESSAGE, 'error')
    return false
  }

  function notifyWorkerAccountWorkdayChanged(updatedRows = [], worker = resolveCurrentWorker()) {
    clearDashboardWorkerSnapshotCache()
    appState.dashboardBackgroundDataLoaded = false
    if (typeof window === 'undefined') return
    const rows = Array.isArray(updatedRows) ? updatedRows : []
    window.dispatchEvent(new CustomEvent('portal:workday-updated', {
      detail: {
        workerLogin: workerLogin(worker),
        workerName: workerName(worker),
        dayKeys: [...new Set(rows.map((row) => String(row?.dayKey ?? '').trim()).filter(Boolean))],
        workdayIds: rows
          .map((row) => String(row?.workdayId ?? row?.id ?? '').trim())
          .filter(Boolean),
      },
    }))
  }

  function findWorkerInFreshRows(rows, previousLogin, worker) {
    const expectedLogin = normalizeKey(worker?.login ?? worker?.workerLogin)
    const previousKey = normalizeKey(previousLogin)
    const loginChanged = Boolean(expectedLogin && previousKey && expectedLogin !== previousKey)
    const lookupKeys = new Set()
    ;[
      worker?.login,
      worker?.workerLogin,
      worker?.workerId,
      worker?.id,
      worker?.email,
      worker?.loginEmail,
    ].forEach((value) => addIdentityKey(lookupKeys, value))
    if (!loginChanged) {
      addIdentityKey(lookupKeys, previousLogin)
    }

    return (Array.isArray(rows) ? rows : []).find((row) => {
      if (loginChanged) {
        return normalizeKey(row?.login ?? row?.workerLogin) === expectedLogin
      }
      const rowKeys = workerIdentityKeys(row)
      return [...lookupKeys].some((key) => rowKeys.has(key))
    }) ?? null
  }

  function workerAccountSavedText(value) {
    return String(value ?? '').trim().toLowerCase()
  }

  function workerAccountFreshMatchesSaved(freshWorker, savedWorker) {
    if (!freshWorker || !savedWorker) return false
    const freshLogin = workerAccountSavedText(freshWorker.login ?? freshWorker.workerLogin)
    const savedLogin = workerAccountSavedText(savedWorker.login ?? savedWorker.workerLogin)
    const freshName = workerAccountSavedText(freshWorker.name ?? freshWorker.workerName)
    const savedName = workerAccountSavedText(savedWorker.name ?? savedWorker.workerName)
    const freshEmail = workerAccountSavedText(freshWorker.email ?? freshWorker.loginEmail)
    const savedEmail = workerAccountSavedText(savedWorker.email ?? savedWorker.loginEmail)
    const freshPhone = workerAccountSavedText(freshWorker.phone)
    const savedPhone = workerAccountSavedText(savedWorker.phone)
    const freshType = workerAccountSavedText(workerTypeValue(freshWorker))
    const savedType = workerAccountSavedText(workerTypeValue(savedWorker))

    return (
      (!savedLogin || freshLogin === savedLogin) &&
      (!savedName || freshName === savedName) &&
      (!savedEmail || freshEmail === savedEmail) &&
      freshPhone === savedPhone &&
      freshType === savedType &&
      isWorkerActive(freshWorker) === isWorkerActive(savedWorker)
    )
  }

  async function refreshWorkerDirectoryAfterSave(previousLogin, savedWorker) {
    if (!appState.session?.orgId) return savedWorker
    clearDashboardWorkerSnapshotCache()
    appState.workersLoaded = false
    const rows = await getWorkers(appState.session.orgId, { force: true, fetchPolicy: 'SERVER_ONLY' })
    const freshRows = Array.isArray(rows) ? rows : []
    appState.workers = freshRows.map((item) => ({ ...item }))
    appState.workerProfileRows = freshRows.map((item) => ({ ...item }))
    appState.workerProfileViewRows = freshRows.map((item) => ({ ...item }))
    appState.workersLoaded = true

    const freshWorker = findWorkerInFreshRows(freshRows, previousLogin, savedWorker)
    if (!freshWorker || !workerAccountFreshMatchesSaved(freshWorker, savedWorker)) {
      console.warn('[worker-account] server-only refresh did not include matching backend-confirmed worker', {
        previousLogin,
        login: savedWorker?.login ?? savedWorker?.workerLogin,
      })
      const fallbackWorker = { ...savedWorker }
      applyWorkerToCachedRows(previousLogin, fallbackWorker)
      return fallbackWorker
    }
    return {
      ...freshWorker,
      authUpdated: Boolean(savedWorker?.authUpdated),
      authWarning: String(savedWorker?.authWarning ?? '').trim(),
      loginChangeSkipped: Boolean(savedWorker?.loginChangeSkipped),
      storage: String(savedWorker?.storage ?? '').trim(),
    }
  }

  function setShellVisible(hasWorker) {
    const shell = document.getElementById('waShell')
    const empty = document.getElementById('waEmpty')
    if (shell) shell.hidden = !hasWorker
    if (empty) empty.hidden = hasWorker
  }

  function renderWorkerCard(worker) {
    const name = workerName(worker) || '-'
    const role = workerRole(worker)
    const active = isWorkerActive(worker)
    const online = isWorkerOnline(worker)
    setText('waTitle', name)
    setText('waCardName', name)
    setText('waCardRole', roleLabel(role))
    setText('waCardId', workerId(worker) || '-')
    setText('waCardEmail', worker.email || worker.loginEmail || '-')
    setText('waCardPhone', worker.phone || '-')
    setText('waCardAdded', formatDateTime(worker.addedAt || worker.createdAt))
    setText('waCardEdited', formatDateTime(worker.editedAt || worker.updatedAt))
    renderWorkerAvatar(worker)

    const status = document.getElementById('waCardStatus')
    if (status) {
      status.textContent = active ? 'Aktywny' : 'Nieaktywny'
      status.classList.toggle('is-active', active)
      status.classList.toggle('is-inactive', !active)
    }
    const onlineNode = document.getElementById('waCardOnline')
    if (onlineNode) {
      onlineNode.textContent = online ? 'Online' : 'Offline'
      onlineNode.classList.toggle('is-online', online)
      onlineNode.classList.toggle('is-offline', !online)
    }
    renderRolePreview(worker)
    renderSecuritySummary(worker)
    syncTopActions(worker)
  }

  function setPasswordEyeButtonState(inputId, buttonId) {
    const input = document.getElementById(inputId)
    const button = document.getElementById(buttonId)
    if (!(input instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement)) return
    const visible = input.type === 'text'
    button.innerHTML = visible ? PASSWORD_EYE_CLOSED_ICON : PASSWORD_EYE_OPEN_ICON
    button.classList.toggle('is-visible', visible)
    button.setAttribute('aria-pressed', visible ? 'true' : 'false')
    button.setAttribute('aria-label', visible ? 'Ukryj haslo' : 'Pokaz haslo')
    button.title = visible ? 'Ukryj haslo' : 'Pokaz haslo'
  }

  function resetPasswordFieldVisibility(inputId, buttonId) {
    const input = document.getElementById(inputId)
    if (input instanceof HTMLInputElement) input.type = 'password'
    setPasswordEyeButtonState(inputId, buttonId)
  }

  function resetNewPasswordVisibility() {
    resetPasswordFieldVisibility('waNewPassword', 'waNewPasswordEyeBtn')
    resetPasswordFieldVisibility('waNewPassword2', 'waNewPassword2EyeBtn')
  }

  function togglePasswordField(inputId, buttonId) {
    const input = document.getElementById(inputId)
    const button = document.getElementById(buttonId)
    if (!(input instanceof HTMLInputElement) || !(button instanceof HTMLButtonElement) || input.disabled || button.disabled) return
    input.type = input.type === 'password' ? 'text' : 'password'
    setPasswordEyeButtonState(inputId, buttonId)
    input.focus()
  }

  function isWorkerAccountEditableTab(tab) {
    return WORKER_ACCOUNT_EDITABLE_TABS.has(String(tab ?? '').trim())
  }

  function isEditingTab(tab) {
    return appState.workerAccountEditTab === tab
  }

  function canEditWorkerAccountTab(tab) {
    if (tab === 'account') return canManageWorkers()
    if (tab === 'security' || tab === 'roles') return canAdministerWorkers()
    return false
  }

  function editableTabTitle(tab) {
    if (tab === 'account') return 'dane uzytkownika'
    if (tab === 'security') return 'bezpieczenstwo'
    if (tab === 'roles') return 'role i dostep'
    return 'zakladke'
  }

  function setControlDisabled(id, disabled) {
    const control = document.getElementById(id)
    if (control) control.disabled = Boolean(disabled)
  }

  function syncEditModeControls(worker = resolveCurrentWorker()) {
    const editTab = isWorkerAccountEditableTab(appState.workerAccountEditTab) ? appState.workerAccountEditTab : ''
    if (appState.workerAccountEditTab !== editTab) appState.workerAccountEditTab = editTab

    WORKER_ACCOUNT_EDITABLE_TABS.forEach((tab) => {
      const editing = editTab === tab
      const canEdit = Boolean(worker) && canEditWorkerAccountTab(tab)
      const panel = document.querySelector(`[data-wa-panel="${tab}"]`)
      const editButton = document.querySelector(`[data-wa-edit-tab="${tab}"]`)
      const saveButton = document.querySelector(`[data-wa-save-tab="${tab}"]`)
      const cancelButton = document.querySelector(`[data-wa-cancel-tab="${tab}"]`)

      if (panel) panel.classList.toggle('is-editing', editing)
      if (editButton) {
        editButton.hidden = editing
        editButton.disabled = !canEdit
        editButton.title = canEdit ? `Edytuj ${editableTabTitle(tab)}` : 'Brak uprawnien do edycji'
      }
      if (saveButton) {
        saveButton.hidden = !editing
        saveButton.disabled = !editing || !canEdit
      }
      if (cancelButton) {
        cancelButton.hidden = !editing
        cancelButton.disabled = !editing || !canEdit
      }
    })

    const accountManagerEdit = isEditingTab('account') && canManageWorkers()
    const accountAdminEdit = isEditingTab('account') && canAdministerWorkers()
    ;['waName', 'waEmail', 'waPhone'].forEach((id) => setControlDisabled(id, !accountManagerEdit))
    ;[
      'waActive',
      'waContractType',
      'waContractFrom',
      'waContractTo',
      'waBhpFrom',
      'waBhpTo',
      'waMedicalFrom',
      'waMedicalTo',
    ].forEach((id) => setControlDisabled(id, !accountAdminEdit))
    syncWorkerAccountPhotoUi()
    syncTrainingControlsDisabled(!accountAdminEdit)
    const workerIdInput = document.getElementById('waWorkerId')
    if (workerIdInput) {
      workerIdInput.readOnly = true
      workerIdInput.disabled = false
    }

    const securityPasswordEdit = isEditingTab('security') && canResetWorkerPasswords()
    ;['waNewPassword', 'waNewPassword2'].forEach((id) => setControlDisabled(id, !securityPasswordEdit))
    ;['waNewPasswordEyeBtn', 'waNewPassword2EyeBtn'].forEach((id) => setControlDisabled(id, !securityPasswordEdit))

    const rolesAdminEdit = isEditingTab('roles') && canAdministerWorkers()
    setControlDisabled('waRole', !rolesAdminEdit || isOwnerWorker(worker))
    setControlDisabled('waWorkerType', !rolesAdminEdit)
  }

  function enterEditMode(tab) {
    if (!isWorkerAccountEditableTab(tab)) return
    const worker = resolveCurrentWorker()
    if (!worker) return
    if (!canEditWorkerAccountTab(tab)) {
      showTransientNotice('Brak uprawnien do edycji tej zakladki.', 'warning')
      return
    }
    if (appState.workerAccountEditTab && appState.workerAccountEditTab !== tab) {
      cancelEditMode(appState.workerAccountEditTab, { silent: true })
    }
    appState.workerAccountEditTab = tab
    syncEditModeControls(worker)
    const firstFieldByTab = {
      account: 'waName',
      security: 'waNewPassword',
      roles: 'waRole',
    }
    focusField(firstFieldByTab[tab])
  }

  function exitEditMode(tab) {
    if (!tab || appState.workerAccountEditTab === tab) {
      appState.workerAccountEditTab = ''
      syncEditModeControls()
    }
  }

  function cancelEditMode(tab, options = {}) {
    if (!isWorkerAccountEditableTab(tab)) return
    const worker = resolveCurrentWorker()
    if (appState.workerAccountEditTab === tab) appState.workerAccountEditTab = ''
    if (worker) renderForms(worker)
    if (options.silent !== true) showTransientNotice('Anulowano edycje.', 'info')
  }

  function renderForms(worker) {
    setInputValue('waName', workerName(worker))
    setInputValue('waEmail', worker.email || worker.loginEmail || '')
    setInputValue('waPhone', worker.phone || '')
    setInputValue('waWorkerId', workerId(worker))
    setInputValue('waEditedBy', worker.editedBy || worker.updatedBy || '')
    setWorkerAccountPhotoState({ photoUrl: workerPhotoUrl(worker) })
    const contractTypeValue = String(workerField(worker, ['contractType', 'agreementType', 'employmentContractType'], '') ?? '').trim()
    const contractType = document.getElementById('waContractType')
    if (contractType) {
      ensureSelectOption(contractType, contractTypeValue)
      contractType.value = contractTypeValue
    }
    setInputValue('waContractFrom', dateInputValue(workerField(worker, ['contractFrom', 'agreementFrom', 'contractStart', 'contractStartDate'])))
    setInputValue('waContractTo', dateInputValue(workerField(worker, ['contractTo', 'agreementTo', 'contractEnd', 'contractEndDate', 'contractValidTo'])))
    setInputValue('waBhpFrom', dateInputValue(workerField(worker, ['bhpFrom', 'bhpStart', 'bhpStartDate', 'safetyTrainingFrom'])))
    setInputValue('waBhpTo', dateInputValue(workerField(worker, ['bhpTo', 'bhpUntil', 'bhpValidTo', 'bhpEnd', 'bhpEndDate', 'safetyTrainingTo'])))
    setInputValue('waMedicalFrom', dateInputValue(workerField(worker, ['medicalExamFrom', 'occupationalMedicineFrom', 'medicalFrom', 'medicalStartDate'])))
    setInputValue('waMedicalTo', dateInputValue(workerField(worker, ['medicalExamTo', 'occupationalMedicineTo', 'medicalTo', 'medicalExamValidTo', 'medicalEndDate'])))
    const trainingValues = workerTrainingValues(worker)
    setTrainingValues(trainingValues)
    setInputValue('waNewPassword', '')
    setInputValue('waNewPassword2', '')
    resetNewPasswordVisibility()

    const active = document.getElementById('waActive')
    if (active) active.value = isWorkerActive(worker) ? '1' : '0'
    const role = document.getElementById('waRole')
    if (role) {
      role.value = isOwnerWorker(worker) ? 'OWNER' : roleValue(workerRole(worker))
      role.title = WORKER_ROLE_COPY[role.value]?.description ?? ''
    }
    const workerType = document.getElementById('waWorkerType')
    if (workerType) workerType.value = workerTypeValue(worker)

    syncEditModeControls(worker)
    resetNewPasswordVisibility()
    syncTopActions(worker)
  }

  function parseJsonArray(value) {
    if (Array.isArray(value)) return value
    if (typeof value !== 'string') return []
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function collectOrderWorkerKeys(order = {}) {
    const keys = new Set()
    ;[
      order.workerId,
      order.workerLogin,
      order.login,
      order.workerName,
      order.workerLabel,
      order.worker,
      ...(Array.isArray(order.workerIds) ? order.workerIds : parseJsonArray(order.workerIds)),
    ].forEach((value) => addIdentityKey(keys, value))

    const assignments = [
      ...(Array.isArray(order.workerAssignments) ? order.workerAssignments : parseJsonArray(order.workerAssignments)),
      ...(Array.isArray(order.workAllocations) ? order.workAllocations : parseJsonArray(order.workAllocations)),
      ...(Array.isArray(order.assignedWorkers) ? order.assignedWorkers : parseJsonArray(order.assignedWorkers)),
      ...(Array.isArray(order.workers) ? order.workers : parseJsonArray(order.workers)),
    ]

    assignments.forEach((assignment) => {
      if (typeof assignment === 'string') {
        addIdentityKey(keys, assignment)
        return
      }
      ;[
        assignment?.workerId,
        assignment?.worker_id,
        assignment?.employeeId,
        assignment?.workerLogin,
        assignment?.login,
        assignment?.workerName,
        assignment?.name,
        assignment?.label,
        assignment?.workerLabel,
        assignment?.key,
        assignment?.workerKey,
      ].forEach((value) => addIdentityKey(keys, value))
    })
    return keys
  }

  function orderCompleted(order = {}) {
    const status = normalizeKey(order.status ?? order.completionStatus ?? order.taskStatus ?? '')
    return Boolean(order.completed ?? order.kanbanCompleted ?? order.done) ||
      ['closed', 'done', 'completed', 'finished', 'complete', 'zakonczone'].includes(status)
  }

  function orderMatchesWorker(order, worker) {
    const keys = workerIdentityKeys(worker)
    const orderKeys = collectOrderWorkerKeys(order)
    for (const key of keys) {
      if (orderKeys.has(key)) return true
    }
    const name = normalizeKey(workerName(worker))
    const label = normalizeKey(order.workerLabel ?? order.workerName ?? '')
    return Boolean(name && name.length > 2 && label.includes(name))
  }

  function orderDateLabel(order = {}) {
    return String(
      order.dateYmd ??
      order.dayKey ??
      order.dueDateYmd ??
      toDayKey(order.startAt ?? order.deadlineAt ?? order.completedAt ?? order.updatedAt ?? order.createdAt) ??
      '',
    ).trim() || '-'
  }

  function orderTitle(order = {}) {
    return String(
      order.title ??
      order.name ??
      order.taskTitle ??
      order.orderTitle ??
      order.description ??
      order.notes ??
      order.id ??
      '',
    ).trim() || 'Zlecenie'
  }

  function orderClientLabel(order = {}) {
    const objects = Array.isArray(order.objects) ? order.objects : parseJsonArray(order.objects)
    const objectLabel = objects.map((item) => String(item?.label ?? item?.name ?? item?.clientName ?? item ?? '').trim()).filter(Boolean).join(', ')
    return String(
      order.clientName ??
      order.clientLabel ??
      order.klient ??
      order.client?.name ??
      objectLabel ??
      '',
    ).trim() || '-'
  }

  function orderZoneLabel(order = {}) {
    return String(
      order.zoneName ??
      order.zoneLabel ??
      order.strefa ??
      order.zone?.label ??
      order.zone?.name ??
      order.zone?.zone ??
      order.place ??
      '',
    ).trim() || '-'
  }

  function orderStatusLabel(order = {}) {
    if (orderCompleted(order)) return 'Zakonczone'
    const raw = String(order.completionStatus ?? order.kanbanStatus ?? order.status ?? order.taskStatus ?? '').trim()
    return raw || 'Aktywne'
  }

  function orderLatestTime(order = {}) {
    const candidates = [
      order.updatedAt,
      order.completedAt,
      order.deadlineAt,
      order.startAt,
      order.dateYmd,
      order.dueDateYmd,
      order.createdAt,
    ]
    for (const candidate of candidates) {
      const time = Date.parse(String(candidate ?? ''))
      if (Number.isFinite(time)) return time
    }
    return 0
  }

  function sortOrdersByLatest(orders = []) {
    return [...orders].sort((left, right) => orderLatestTime(right) - orderLatestTime(left))
  }

  function rowWorkerIdentityKeys(row = {}) {
    const rowKeys = new Set()
    ;[
      row.workerLogin,
      row.login,
      row.workerId,
      row.worker_id,
      row.employeeId,
      row.employee_id,
      row.workerName,
      row.workername,
      row.worker_name,
      row.name,
      row.fullName,
      row.displayName,
      row.email,
      row.loginEmail,
    ].forEach((value) => addIdentityKey(rowKeys, value))
    return rowKeys
  }

  function rowHasStrongWorkerIdentity(row = {}) {
    const keys = new Set()
    ;[
      row.workerLogin,
      row.login,
      row.workerId,
      row.worker_id,
      row.employeeId,
      row.employee_id,
      row.email,
      row.loginEmail,
    ].forEach((value) => addIdentityKey(keys, value))
    return keys.size > 0
  }

  function nameKeyVariants(value) {
    const normalized = normalizeKey(value).replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim()
    if (!normalized) return []
    const variants = new Set([normalized])
    const parts = normalized.split(' ').filter(Boolean)
    if (parts.length > 1) {
      variants.add(parts.slice().reverse().join(' '))
    }
    return [...variants]
  }

  function looseNameMatch(left, right) {
    const leftVariants = nameKeyVariants(left)
    const rightVariants = nameKeyVariants(right)
    return leftVariants.some((leftValue) => rightVariants.some((rightValue) => {
      if (!leftValue || !rightValue) return false
      if (leftValue === rightValue) return true
      const [shorter, longer] = leftValue.length <= rightValue.length
        ? [leftValue, rightValue]
        : [rightValue, leftValue]
      return shorter.length >= 5 && longer.includes(shorter)
    }))
  }

  function rowNameMatchesRelatedWorker(row = {}, worker = {}) {
    const rowNames = [
      row.workerName,
      row.workername,
      row.worker_name,
      row.name,
      row.fullName,
      row.displayName,
    ].filter((value) => String(value ?? '').trim())
    if (!rowNames.length) return false

    const workerNames = workerRelatedRows(worker)
      .flatMap((relatedWorker) => [
        relatedWorker.name,
        relatedWorker.workerName,
        relatedWorker.workername,
        relatedWorker.worker_name,
        relatedWorker.fullName,
        relatedWorker.displayName,
      ])
      .filter((value) => String(value ?? '').trim())

    return rowNames.some((rowName) => workerNames.some((name) => looseNameMatch(rowName, name)))
  }

  function _rowMatchesWorker(row, worker) {
    const keys = workerIdentityKeys(worker)
    const rowKeys = rowWorkerIdentityKeys(row)
    for (const key of keys) {
      if (rowKeys.has(key)) return true
    }
    return false
  }

  function rowHasWorkerIdentity(row = {}) {
    return rowWorkerIdentityKeys(row).size > 0
  }

  function rowMatchesRelatedWorker(row = {}, worker = {}, options = {}) {
    const rowKeys = rowWorkerIdentityKeys(row)
    if (!rowKeys.size) return false
    const relatedKeys = new Set()
    workerRelatedRows(worker).forEach((relatedWorker) => {
      workerIdentityKeys(relatedWorker).forEach((key) => relatedKeys.add(key))
    })
    for (const key of relatedKeys) {
      if (rowKeys.has(key)) return true
    }
    if (options.allowLooseName && !rowHasStrongWorkerIdentity(row)) {
      return rowNameMatchesRelatedWorker(row, worker)
    }
    return false
  }

  function eventRowBelongsToQueriedWorker(row = {}, worker = {}, options = {}) {
    return !rowHasWorkerIdentity(row) || rowMatchesRelatedWorker(row, worker, options)
  }

  function stampWorkerIdentity(row = {}, worker = {}) {
    return {
      ...row,
      workerLogin: String(row.workerLogin ?? row.login ?? row.worker_login ?? workerLogin(worker)).trim(),
      workerName: String(row.workerName ?? row.workername ?? row.worker_name ?? row.name ?? row.fullName ?? row.displayName ?? workerName(worker)).trim(),
      workerId: String(row.workerId ?? row.worker_id ?? row.employeeId ?? row.employee_id ?? workerId(worker)).trim(),
    }
  }

  function toDayKey(value) {
    const iso = typeof toIso === 'function' ? toIso(value) : String(value ?? '')
    if (!iso) return ''
    const date = new Date(iso)
    if (!Number.isFinite(date.getTime())) return String(iso).slice(0, 10)
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${date.getFullYear()}-${month}-${day}`
  }

  function dayKeyFromValue(value) {
    const raw = String(value ?? '').trim()
    if (!raw) return ''
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
    const polishMatch = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
    if (polishMatch) return `${polishMatch[3]}-${polishMatch[2]}-${polishMatch[1]}`
    return toDayKey(value)
  }

  function eventDayKey(row = {}) {
    return dayKeyFromValue(row.dayKey ?? row.dateYmd ?? row.date ?? row.startAt ?? row.endAt ?? row.createdAt ?? row.updatedAt)
  }

  function rowStartIso(row = {}) {
    return typeof toIso === 'function' ? toIso(row.startAt ?? row.dayStartAt ?? row.startIso) : String(row.startAt ?? row.startIso ?? '')
  }

  function rowEndIso(row = {}) {
    return typeof toIso === 'function' ? toIso(row.endAt ?? row.dayEndAt ?? row.endIso ?? row.stopAt) : String(row.endAt ?? row.endIso ?? '')
  }

  function secondsFromRow(row = {}) {
    const value = Number(row.netSec ?? row.workSec ?? row.durationSec ?? row.durationSeconds ?? 0)
    if (Number.isFinite(value) && value > 0) return Math.floor(value)
    return timeRangeSeconds(rowStartIso(row), rowEndIso(row))
  }

  function formatSeconds(seconds) {
    const value = Number(seconds) || 0
    if (typeof durationSecondsToHm === 'function') return durationSecondsToHm(value)
    const hours = Math.floor(value / 3600)
    const minutes = Math.floor((value % 3600) / 60)
    return `${hours}h ${String(minutes).padStart(2, '0')}m`
  }

  function _formatHms(seconds) {
    const value = Number(seconds) || 0
    if (typeof durationSecondsToHms === 'function') return durationSecondsToHms(value)
    const hours = Math.floor(value / 3600)
    const minutes = Math.floor((value % 3600) / 60)
    const rest = Math.floor(value % 60)
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
  }

  function formatEventDuration(seconds) {
    const value = Math.max(0, Number(seconds) || 0)
    const hours = Math.floor(value / 3600)
    const minutes = Math.floor((value % 3600) / 60)
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  function formatTimeFromIso(value) {
    const iso = typeof toIso === 'function' ? toIso(value) : String(value ?? '')
    if (!iso) return '-'
    const date = new Date(iso)
    if (!Number.isFinite(date.getTime())) return '-'
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }

  function pad2(value) {
    return String(value).padStart(2, '0')
  }

  function dateKeyToLabel(dayKey) {
    const value = String(dayKey ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '-'
    return `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`
  }

  function monthLabelFromValue(monthValue) {
    const value = String(monthValue ?? '').trim()
    if (!/^\d{4}-\d{2}$/.test(value)) return value || '-'
    const month = Number(value.slice(5, 7))
    const year = value.slice(0, 4)
    return `${WORKER_ACCOUNT_MONTH_NAMES_PL[month - 1] ?? value.slice(5, 7)} ${year}`
  }

  function isoToHm(value) {
    const iso = typeof toIso === 'function' ? toIso(value) : String(value ?? '')
    if (!iso) return '-'
    const date = new Date(iso)
    if (!Number.isFinite(date.getTime())) return '-'
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  }

  function isoToDateInput(value) {
    const raw = String(value ?? '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
    const iso = typeof toIso === 'function' ? toIso(raw) : raw
    if (!iso) return ''
    const date = new Date(iso)
    if (!Number.isFinite(date.getTime())) return ''
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
  }

  function isoToTimeInput(value) {
    const iso = typeof toIso === 'function' ? toIso(value) : String(value ?? '')
    return iso ? preciseTimeInputValue(iso) : ''
  }

  function localDateTimeToIso(dateValue, timeValue) {
    const dateText = String(dateValue ?? '').trim()
    const timeText = String(timeValue ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(timeText)) return ''
    const [year, month, day] = dateText.split('-').map(Number)
    const [hour, minute, second = 0] = timeText.split(':').map(Number)
    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return ''
    const date = new Date(year, month - 1, day, hour, minute, second, 0)
    if (!Number.isFinite(date.getTime())) return ''
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return ''
    return date.toISOString()
  }

  function timeRangeSeconds(startAt, endAt) {
    const startIso = typeof toIso === 'function' ? toIso(startAt) : String(startAt ?? '')
    const endIso = typeof toIso === 'function' ? toIso(endAt) : String(endAt ?? '')
    if (!startIso || !endIso) return 0
    const startMs = new Date(startIso).getTime()
    const endMs = new Date(endIso).getTime()
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0
    return Math.floor((endMs - startMs) / 1000)
  }

  function monthValueFromDate(value) {
    const raw = String(value ?? '').trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.slice(0, 7) : `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}`
  }

  function currentWeekRange() {
    const now = new Date()
    const day = now.getDay() || 7
    const start = new Date(now)
    start.setDate(now.getDate() - day + 1)
    const ymd = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return { from: ymd(start), to: ymd(now) }
  }

  function currentMonthRange() {
    const now = new Date()
    return {
      from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
      to: typeof todayYmd === 'function' ? todayYmd() : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    }
  }

  function timeRowDayKey(row = {}) {
    return dayKeyFromValue(row.dayKey ?? row.dateYmd ?? row.date ?? row.startAt ?? row.endAt ?? row.createdAt ?? row.updatedAt)
  }

  function timeFilterRangeFromControls() {
    return {
      from: String(document.getElementById('waTimeFrom')?.value ?? '').trim(),
      to: String(document.getElementById('waTimeTo')?.value ?? '').trim(),
    }
  }

  function timeRowOverlapsRange(row = {}, range = {}) {
    const from = String(range.from ?? '').trim()
    const to = String(range.to ?? '').trim()
    if (!from && !to) return true

    const day = timeRowDayKey(row)
    const startDay = dayKeyFromValue(row.startAt ?? row.dayStartAt ?? row.startIso) || day
    const endDay = dayKeyFromValue(row.endAt ?? row.dayEndAt ?? row.endIso ?? row.stopAt) || day || startDay
    const days = [day, startDay, endDay].filter(Boolean).sort()
    const firstDay = days[0] || ''
    const lastDay = days[days.length - 1] || firstDay
    if (!firstDay) return false
    if (from && lastDay < from) return false
    if (to && firstDay > to) return false
    return true
  }

  function filterTimeRowsForRange(rows = [], range = timeFilterRangeFromControls()) {
    return (Array.isArray(rows) ? rows : []).filter((row) => timeRowOverlapsRange(row, range))
  }

  function sumRowsInRange(rows, range) {
    return (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
      const day = timeRowDayKey(row)
      if (!day || day < range.from || day > range.to) return sum
      return sum + secondsFromRow(row)
    }, 0)
  }

  function countEventsInRange(rows, range) {
    return (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
      const day = eventDayKey(row)
      if (!day || day < range.from || day > range.to) return sum
      return sum + 1
    }, 0)
  }

  function timeIntervalFromRow(row = {}) {
    const startIso = rowStartIso(row)
    const endIso = rowEndIso(row)
    const durationSec = Number(row.durationSec ?? row.closedSec ?? row.workSec ?? 0)
    let startTs = startIso ? new Date(startIso).getTime() : 0
    let endTs = endIso ? new Date(endIso).getTime() : 0

    if (!Number.isFinite(startTs)) startTs = 0
    if (!Number.isFinite(endTs)) endTs = 0
    if (endTs <= startTs && startTs > 0 && Number.isFinite(durationSec) && durationSec > 0) {
      endTs = startTs + Math.floor(durationSec) * 1000
    }
    if (!startTs || !endTs || endTs <= startTs) return null
    return { startTs, endTs }
  }

  function mergeTimeIntervals(intervals = []) {
    const sorted = intervals
      .filter(Boolean)
      .map((interval) => ({ startTs: Number(interval.startTs), endTs: Number(interval.endTs) }))
      .filter((interval) => Number.isFinite(interval.startTs) && Number.isFinite(interval.endTs) && interval.endTs > interval.startTs)
      .sort((left, right) => left.startTs - right.startTs || left.endTs - right.endTs)
    const merged = []
    sorted.forEach((interval) => {
      const last = merged[merged.length - 1]
      if (!last || interval.startTs > last.endTs) {
        merged.push({ ...interval })
        return
      }
      last.endTs = Math.max(last.endTs, interval.endTs)
    })
    return merged
  }

  function timeRowsTotalSeconds(rows = []) {
    const intervals = rows.flatMap((row) => {
      if (Array.isArray(row?.workIntervals) && row.workIntervals.length) {
        return workIntervalsFromRow(row)
      }
      const interval = timeIntervalFromRow(row)
      return interval ? [interval] : []
    })
    const totalMs = mergeTimeIntervals(intervals).reduce(
      (sum, interval) => sum + Math.max(0, interval.endTs - interval.startTs),
      0,
    )
    return Math.floor(totalMs / 1000)
  }

  function aggregateTimeRows(rows = [], worker = {}) {
    const groups = new Map()
    ;(Array.isArray(rows) ? rows : []).forEach((row) => {
      const dayKey = timeRowDayKey(row)
      if (!dayKey) return
      const startIso = rowStartIso(row)
      const endIso = rowEndIso(row)
      const updatedAtIso = typeof toIso === 'function' ? toIso(row.updatedAt) : String(row.updatedAt ?? '')
      const breakSec = Math.max(0, Number(row.breakSec ?? row.pauseTotalSec ?? 0) || 0)
      const bucket = groups.get(dayKey) ?? {
        dayKey,
        workerName: String(row.workerName ?? workerName(worker) ?? '').trim(),
        workerType: String(row.workerType ?? row.type ?? roleLabel(workerRole(worker)) ?? '').trim(),
        startAt: '',
        endAt: '',
        breakSec: 0,
        updatedBy: '',
        comment: '',
        latestUpdatedAt: '',
        sourceRows: [],
      }
      bucket.sourceRows.push(row)
      bucket.breakSec += breakSec
      if (startIso && (!bucket.startAt || new Date(startIso).getTime() < new Date(bucket.startAt).getTime())) bucket.startAt = startIso
      if (endIso && (!bucket.endAt || new Date(endIso).getTime() > new Date(bucket.endAt).getTime())) bucket.endAt = endIso
      if (updatedAtIso && (!bucket.latestUpdatedAt || new Date(updatedAtIso).getTime() >= new Date(bucket.latestUpdatedAt).getTime())) {
        bucket.latestUpdatedAt = updatedAtIso
        bucket.updatedBy = String(row.editedBy ?? row.updatedBy ?? '').trim() || bucket.updatedBy
        bucket.comment = String(row.comment ?? '').trim() || bucket.comment
      } else {
        bucket.updatedBy = bucket.updatedBy || String(row.editedBy ?? row.updatedBy ?? '').trim()
        bucket.comment = bucket.comment || String(row.comment ?? '').trim()
      }
      groups.set(dayKey, bucket)
    })

    return [...groups.values()]
      .map((bucket) => {
        const mergedWorkSec = timeRowsTotalSeconds(bucket.sourceRows)
        const workSec = mergedWorkSec || timeRangeSeconds(bucket.startAt, bucket.endAt)
        const breakSec = Math.min(workSec, Math.max(0, Math.floor(Number(bucket.breakSec ?? 0))))
        const netSec = Math.max(0, workSec - breakSec)
        return {
          dayKey: bucket.dayKey,
          workerName: bucket.workerName || workerName(worker) || workerLogin(worker) || '-',
          workerType: bucket.workerType || roleLabel(workerRole(worker)) || '-',
          startAt: bucket.startAt,
          endAt: bucket.endAt,
          workSec,
          breakSec,
          netSec,
          updatedBy: bucket.updatedBy || '-',
          comment: bucket.comment || '',
          sourceRows: bucket.sourceRows,
        }
      })
      .sort((left, right) => String(right.dayKey).localeCompare(String(left.dayKey)))
  }

  function sortRowsByLatest(rows = []) {
    return [...rows].sort((left, right) => {
      const leftTs = new Date(rowStartIso(left) || rowEndIso(left) || left.updatedAt || left.createdAt || 0).getTime()
      const rightTs = new Date(rowStartIso(right) || rowEndIso(right) || right.updatedAt || right.createdAt || 0).getTime()
      return (Number.isFinite(rightTs) ? rightTs : 0) - (Number.isFinite(leftTs) ? leftTs : 0)
    })
  }

  function rowStableKey(row = {}) {
    const explicit = [
      row.workdayId,
      row.eventId,
      row.id,
      row.rowId,
      row.startEventId,
      row.endEventId,
    ].map((value) => String(value ?? '').trim()).find(Boolean)
    if (explicit) return normalizeKey(explicit)
    const parts = [
      timeRowDayKey(row) || eventDayKey(row),
      rowStartIso(row),
      rowEndIso(row),
      row.workerLogin,
      row.workerId,
      row.workerName,
      row.clientId,
      row.clientName,
      row.zoneId,
      row.zoneName,
      row.roomId,
      row.roomName,
      row.eventType,
      row.comment,
    ].map((value) => normalizeKey(value)).filter(Boolean)
    return parts.join('|')
  }

  function mergeUniqueRows(collections = []) {
    const seen = new Set()
    const rows = []
    collections.flat().forEach((row) => {
      if (!row || typeof row !== 'object') return
      const key = rowStableKey(row)
      if (key) {
        if (seen.has(key)) return
        seen.add(key)
      }
      rows.push(row)
    })
    return rows
  }

  function responseItems(response) {
    return Array.isArray(response?.items) ? response.items : []
  }

  function hasMeaningfulTimePayload(row = {}) {
    return [
      row.workdayId,
      row.id,
      row.dayKey,
      row.dateYmd,
      row.date,
      row.startAt,
      row.endAt,
      row.dayStartAt,
      row.dayEndAt,
      row.startIso,
      row.endIso,
      row.durationSec,
      row.workSec,
      row.netSec,
    ].some((value) => {
      if (typeof value === 'number') return Number.isFinite(value) && value > 0
      const text = String(value ?? '').trim()
      return Boolean(text && text !== '-')
    })
  }

  function hasMeaningfulEventPayload(row = {}) {
    return [
      row.eventId,
      row.workdayId,
      row.id,
      row.dayKey,
      row.dateYmd,
      row.date,
      row.startAt,
      row.endAt,
      row.start,
      row.stop,
      row.durationSec,
      row.duration,
      row.clientName,
      row.klient,
      row.clientId,
      row.zoneName,
      row.strefa,
      row.zoneId,
      row.roomName,
      row.roomId,
      row.utilityRoomId,
      row.comment,
      row.endReason,
    ].some((value) => {
      if (typeof value === 'number') return Number.isFinite(value) && value > 0
      const text = String(value ?? '').trim()
      return Boolean(text && text !== '-')
    })
  }

  function prioritizedWorkerFetchCandidates(worker = {}) {
    const preferred = [
      workerLogin(worker),
      worker.workerLogin,
      worker.login,
      workerId(worker),
      worker.workerId,
      worker.id,
    ]
    const candidates = [...preferred, ...workerFetchCandidates(worker)]
    const seen = new Set()
    return candidates
      .map((value) => String(value ?? '').trim())
      .filter((value) => {
        const key = normalizeKey(value)
        if (!key || seen.has(key)) return false
        seen.add(key)
        return true
      })
  }

  async function fetchWorkerTimeCandidateRows(orgId, worker, candidates = [], range = {}) {
    const pageSize = Number(range.pageSize) || WORKER_ACCOUNT_TIME_FETCH_PAGE_SIZE
    const responses = await Promise.all(
      candidates.flatMap((candidate) => [
        getWorkerTime(orgId, candidate, { ...range, page: 1, pageSize }).catch(() => ({ items: [] })),
        getWorkdays(orgId, {
          source: 'workdays',
          workerLogin: candidate,
          ...range,
          page: 1,
          pageSize,
        }).catch(() => ({ items: [] })),
      ]),
    )
    return mergeUniqueRows(responses.map(responseItems))
      .filter(hasMeaningfulTimePayload)
      .filter((row) => !rowHasWorkerIdentity(row) || rowMatchesRelatedWorker(row, worker))
  }

  async function fetchWorkerTimeRows(orgId, worker, range = {}, options = {}) {
    const candidates = prioritizedWorkerFetchCandidates(worker)
    const pageSize = Number(range.pageSize) || WORKER_ACCOUNT_TIME_FETCH_PAGE_SIZE
    const primaryRows = await fetchWorkerTimeCandidateRows(orgId, worker, candidates.slice(0, 1), { ...range, pageSize })
    let directRows = primaryRows

    if (!directRows.length) {
      const fallbackResponses = await Promise.all([
        fetchWorkerTimeCandidateRows(orgId, worker, candidates.slice(1), { ...range, pageSize }),
        workerName(worker)
          ? getWorkdays(orgId, {
            source: 'workdays',
            worker: workerName(worker),
            ...range,
            page: 1,
            pageSize,
          }).catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] }),
      ])
      const nameRows = responseItems(fallbackResponses[1])
        .filter(hasMeaningfulTimePayload)
        .filter((row) => !rowHasWorkerIdentity(row) || rowMatchesRelatedWorker(row, worker, { allowLooseName: true }))
      directRows = mergeUniqueRows([fallbackResponses[0], nameRows])
    }

    if (directRows.length || options.allowBroadFallback === false) {
      return directRows
    }

    const broadResponse = await getWorkdays(orgId, {
      source: 'workdays',
      ...range,
      page: 1,
      pageSize,
    }).catch(() => ({ items: [] }))
    const broadRows = responseItems(broadResponse)
      .filter(hasMeaningfulTimePayload)
      .filter((row) => rowHasWorkerIdentity(row) && rowMatchesRelatedWorker(row, worker))

    return mergeUniqueRows([directRows, broadRows])
  }

  async function fetchWorkerEventCandidateRows(orgId, worker, candidates = [], options = {}) {
    const source = String(options.source ?? 'workdays').trim() || 'workdays'
    const pageSize = Number(options.pageSize) || WORKER_ACCOUNT_ACTIVITY_FETCH_PAGE_SIZE
    const responses = await Promise.all(
      candidates.map((candidate) => getWorkdays(orgId, {
        source,
        workerLogin: candidate,
        page: 1,
        pageSize,
      }).catch(() => ({ items: [] }))),
    )
    return mergeUniqueRows(responses.map(responseItems))
      .filter(hasMeaningfulEventPayload)
      .filter((row) => eventRowBelongsToQueriedWorker(row, worker, { allowLooseName: true }))
  }

  async function fetchWorkerEventRows(orgId, worker, options = {}) {
    const pageSize = Number(options.pageSize) || 100
    const candidates = prioritizedWorkerFetchCandidates(worker)
    let directRows = await fetchWorkerEventCandidateRows(orgId, worker, candidates.slice(0, 1), { source: 'workdays', pageSize })

    if (!directRows.length) {
      const fallbackResponses = await Promise.all([
        fetchWorkerEventCandidateRows(orgId, worker, candidates.slice(0, 1), { source: 'events', pageSize }),
        fetchWorkerEventCandidateRows(orgId, worker, candidates.slice(1), { source: 'workdays', pageSize }),
        workerName(worker)
          ? getWorkdays(orgId, {
            source: 'workdays',
            worker: workerName(worker),
            page: 1,
            pageSize,
          }).catch(() => ({ items: [] }))
          : Promise.resolve({ items: [] }),
      ])
      const nameRows = responseItems(fallbackResponses[2])
        .filter(hasMeaningfulEventPayload)
        .filter((row) => eventRowBelongsToQueriedWorker(row, worker, { allowLooseName: true }))
      directRows = mergeUniqueRows([fallbackResponses[0], fallbackResponses[1], nameRows])
    }

    if (directRows.length || options.allowBroadFallback === false) {
      return directRows
    }

    const broadResponses = await Promise.all([
      getWorkdays(orgId, {
        source: 'events',
        page: 1,
        pageSize,
      }).catch(() => ({ items: [] })),
      getWorkdays(orgId, {
        source: 'workdays',
        page: 1,
        pageSize,
      }).catch(() => ({ items: [] })),
    ])
    const broadRows = mergeUniqueRows(broadResponses.map(responseItems))
      .filter(hasMeaningfulEventPayload)
      .filter((row) => rowHasWorkerIdentity(row) && rowMatchesRelatedWorker(row, worker))

    return mergeUniqueRows([directRows, broadRows])
  }

  function renderKpis({ completedOrders = 0, monthSeconds = 0, weekSeconds = 0, eventCount = 0 } = {}) {
    const month = formatSeconds(monthSeconds)
    const week = formatSeconds(weekSeconds)
    setText('waKpiOrders', completedOrders)
    setText('waKpiMonth', month)
    setText('waKpiWeek', week)
    setText('waActivityOrders', completedOrders)
    setText('waActivityMonth', month)
    setText('waActivityWeek', week)
    setText('waActivityEvents', eventCount)
  }

  function fillTimeMonthPick(year, selectedValue) {
    const select = document.getElementById('waTimeMonthPick')
    if (!select || !Number.isFinite(year) || year < 2000 || year > 2100) return
    select.innerHTML = ''
    for (let month = 1; month <= 12; month += 1) {
      const option = document.createElement('option')
      option.value = `${year}-${pad2(month)}`
      option.textContent = `${WORKER_ACCOUNT_MONTH_NAMES_PL[month - 1]} ${year}`
      select.appendChild(option)
    }
    const fallback = `${year}-${pad2(new Date().getMonth() + 1)}`
    select.value = selectedValue && select.querySelector(`option[value="${selectedValue}"]`) ? selectedValue : fallback
  }

  function syncTimeMonthPickFromRange() {
    const to = String(document.getElementById('waTimeTo')?.value ?? '').trim()
    const from = String(document.getElementById('waTimeFrom')?.value ?? '').trim()
    const selectedMonth = monthValueFromDate(to || from)
    const year = Number(selectedMonth.slice(0, 4)) || new Date().getFullYear()
    fillTimeMonthPick(year, selectedMonth)
  }

  function normalizeWorkerAccountTimeEditorIntent(intent = {}) {
    const dayKey = String(intent?.dayKey ?? intent?.date ?? '').trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null
    return {
      dayKey,
      workdayId: String(intent?.workdayId ?? intent?.id ?? '').trim(),
      source: String(intent?.source ?? '').trim(),
    }
  }

  function applyWorkerAccountTimeEditorRange(intent = {}) {
    const normalized = normalizeWorkerAccountTimeEditorIntent(intent)
    if (!normalized) return null
    setInputValue('waTimeFrom', normalized.dayKey)
    setInputValue('waTimeTo', normalized.dayKey)
    syncTimeMonthPickFromRange()
    return normalized
  }

  function setTimeMonthCard(rows = appState.workerAccountTimeRows) {
    const sourceRows = Array.isArray(rows) ? rows : []
    const totalWorkSec = sourceRows.reduce((sum, row) => sum + Math.max(0, Number(row.workSec ?? 0) || 0), 0)
    const totalBreakSec = sourceRows.reduce((sum, row) => sum + Math.max(0, Number(row.breakSec ?? 0) || 0), 0)
    const totalNetSec = sourceRows.reduce((sum, row) => sum + Math.max(0, Number(row.netSec ?? 0) || 0), 0)
    const fallbackRange = currentMonthRange()
    const from = String(document.getElementById('waTimeFrom')?.value ?? '').trim() || fallbackRange.from
    const to = String(document.getElementById('waTimeTo')?.value ?? '').trim() || fallbackRange.to
    const select = document.getElementById('waTimeMonthPick')
    const selectedLabel = select?.selectedOptions?.[0]?.textContent?.trim()
    const selectedMonth = monthValueFromDate(to || from)

    setText('waTimeMonthLabel', selectedLabel || monthLabelFromValue(selectedMonth))
    setText('waTimeMonthRange', from && to ? `${dateKeyToLabel(from)} - ${dateKeyToLabel(to)}` : '-')
    setText('waTimeMonthWork', formatSeconds(totalWorkSec))
    setText('waTimeMonthBreak', formatSeconds(totalBreakSec))
    setText('waTimeMonthNet', formatSeconds(totalNetSec || Math.max(0, totalWorkSec - totalBreakSec)))
  }

  function applyTimeMonthPick(monthValue) {
    const from = document.getElementById('waTimeFrom')
    const to = document.getElementById('waTimeTo')
    const value = String(monthValue ?? '').trim()
    if (!from || !to || !/^\d{4}-\d{2}$/.test(value)) return
    const year = Number(value.slice(0, 4))
    const month = Number(value.slice(5, 7))
    const now = new Date()
    const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month
    const lastDay = isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate()
    from.value = `${value}-01`
    to.value = `${value}-${pad2(lastDay)}`
  }

  function timeSelectionKey(row = {}) {
    return String(row.dayKey ?? row.workdayId ?? '').trim()
  }

  function ensureTimeSelectionState() {
    if (!(appState.workerAccountTimeSelectedKeys instanceof Set)) appState.workerAccountTimeSelectedKeys = new Set()
    if (!Array.isArray(appState.workerAccountTimeCurrentPageKeys)) appState.workerAccountTimeCurrentPageKeys = []
  }

  function syncTimeSelectionUi() {
    ensureTimeSelectionState()
    const selectAll = document.getElementById('waTimeSelectAll')
    if (!(selectAll instanceof HTMLInputElement)) return
    const pageKeys = appState.workerAccountTimeCurrentPageKeys
    if (!pageKeys.length) {
      selectAll.checked = false
      selectAll.indeterminate = false
      return
    }
    const selected = pageKeys.filter((key) => appState.workerAccountTimeSelectedKeys.has(key)).length
    selectAll.checked = selected > 0 && selected === pageKeys.length
    selectAll.indeterminate = selected > 0 && selected < pageKeys.length
  }

  function setTimeRowsSelected(checked) {
    ensureTimeSelectionState()
    appState.workerAccountTimeCurrentPageKeys.forEach((key) => {
      if (checked) appState.workerAccountTimeSelectedKeys.add(key)
      else appState.workerAccountTimeSelectedKeys.delete(key)
    })
    syncTimeSelectionUi()
  }

  function _escapeCsvCell(value) {
    const text = String(value ?? '').replace(/\r?\n/g, ' ')
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }

  function _sanitizeFilePart(value) {
    return String(value ?? '')
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'pracownik'
  }

  function surnameFirstLabel(value) {
    const raw = String(value ?? '').trim().replace(/\s+/g, ' ')
    if (!raw) return '-'
    if (raw.includes(',')) {
      return raw
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' ')
    }
    const parts = raw.split(' ').filter(Boolean)
    if (parts.length < 2) return raw
    const surname = parts[parts.length - 1]
    return [surname, ...parts.slice(0, -1)].join(' ')
  }

  function timeEvidenceWorkerLabel(row = {}, worker = resolveCurrentWorker() || {}) {
    return surnameFirstLabel(row.workerName || workerName(worker) || workerLogin(worker) || '-')
  }

  function compareTimeEvidenceRows(left = {}, right = {}) {
    const leftWorker = normalizeKey(timeEvidenceWorkerLabel(left))
    const rightWorker = normalizeKey(timeEvidenceWorkerLabel(right))
    const workerCompare = leftWorker.localeCompare(rightWorker, 'pl')
    if (workerCompare) return workerCompare
    return String(left.dayKey).localeCompare(String(right.dayKey))
  }

  function timeEvidenceWorkTotal(rows = []) {
    return workTimeEvidenceWorkTotal(rows)
  }

  function timeExportSourceRows(row = {}) {
    return Array.isArray(row.sourceRows) ? row.sourceRows : []
  }

  function _timeExportAlertValue(row = {}) {
    const levels = [
      Number(row.alertLevel ?? 0) || 0,
      ...timeExportSourceRows(row).map((source) => Number(source.alertLevel ?? source.alert ?? 0) || 0),
    ]
    return Math.max(0, ...levels)
  }

  function _timeExportAckValue(row = {}) {
    const ack = Boolean(row.alertAck ?? row.ack ?? timeExportSourceRows(row).some((source) => source.alertAck || source.ack))
    return ack ? 'TAK' : 'NIE'
  }

  function workerAccountEvidenceDeps() {
    return {
      dateKeyToLabel,
      durationSecondsToHm,
      ensureJsPdfLoaded,
      ensurePdfUnicodeFont,
      escapeHtml,
      formatSeconds,
      isoToHm,
      normalizeSearchText,
      roleLabel,
      setPdfUnicodeFont,
      toIso,
      workerLabel: timeEvidenceWorkerLabel,
    }
  }

  function timeEvidenceExportColumns(worker = resolveCurrentWorker() || {}) {
    return createWorkTimeEvidenceColumns(workerAccountEvidenceDeps(), worker)
  }

  function timeEvidenceRowsForExport() {
    const rows = Array.isArray(appState.workerAccountTimeRows) ? appState.workerAccountTimeRows : []
    return [...rows].sort(compareTimeEvidenceRows)
  }

  function timeEvidenceFilenameBase() {
    const worker = resolveCurrentWorker() || {}
    const from = String(document.getElementById('waExportFrom')?.value ?? document.getElementById('waTimeFrom')?.value ?? '').trim()
    const to = String(document.getElementById('waExportTo')?.value ?? document.getElementById('waTimeTo')?.value ?? '').trim()
    return `ewidencja-pracy-${sanitizeWorkTimeEvidenceFilePart(workerName(worker) || workerLogin(worker))}-${from || 'od'}-${to || 'do'}`
  }

  function syncTimeEvidenceExportRangeFromTimeFilters() {
    const exportFrom = document.getElementById('waExportFrom')
    const exportTo = document.getElementById('waExportTo')
    const fallback = currentMonthRange()
    const from = String(document.getElementById('waTimeFrom')?.value ?? fallback.from).trim() || fallback.from
    const to = String(document.getElementById('waTimeTo')?.value ?? fallback.to).trim() || fallback.to
    if (exportFrom instanceof HTMLInputElement) exportFrom.value = from
    if (exportTo instanceof HTMLInputElement) exportTo.value = to
  }

  function resetTimeEvidenceExportOptions() {
    document.querySelectorAll('[data-wa-export-col]').forEach((checkbox) => {
      checkbox.checked = checkbox.defaultChecked
    })
    const landscape = document.querySelector('input[name="waExportOrientation"][value="l"]')
    if (landscape) landscape.checked = true
    syncTimeEvidenceExportRangeFromTimeFilters()
  }

  function readTimeEvidenceExportOptions({ validate = true } = {}) {
    const worker = resolveCurrentWorker() || {}
    const rawRange = {
      fromYmd: document.getElementById('waExportFrom')?.value,
      toYmd: document.getElementById('waExportTo')?.value,
    }
    const range = validate
      ? validateWorkTimeEvidenceDateRange(rawRange, alert)
      : {
          fromYmd: String(rawRange.fromYmd ?? '').trim(),
          toYmd: String(rawRange.toYmd ?? '').trim(),
        }
    if (!range) return null
    const selectedIds = new Set(
      [...document.querySelectorAll('[data-wa-export-col]')]
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => String(checkbox.value ?? '').trim()),
    )
    const columns = timeEvidenceExportColumns(worker).filter((column) => selectedIds.has(column.id))
    const orientationRaw = String(document.querySelector('input[name="waExportOrientation"]:checked')?.value ?? 'l').trim()
    const orientation = orientationRaw === 'p' ? 'p' : 'l'
    return { ...range, columns, orientation }
  }

  async function ensureTimeEvidenceRowsForExportOptions(exportOptions) {
    if (!exportOptions) return null
    const fromInput = document.getElementById('waTimeFrom')
    const toInput = document.getElementById('waTimeTo')
    const currentFrom = String(fromInput?.value ?? '').trim()
    const currentTo = String(toInput?.value ?? '').trim()
    const nextFrom = String(exportOptions.fromYmd ?? '').trim()
    const nextTo = String(exportOptions.toYmd ?? '').trim()
    const changed = nextFrom && nextTo && (currentFrom !== nextFrom || currentTo !== nextTo)
    if (changed) {
      if (fromInput instanceof HTMLInputElement) fromInput.value = nextFrom
      if (toInput instanceof HTMLInputElement) toInput.value = nextTo
      appState.workerAccountTimePage = 1
      syncTimeMonthPickFromRange()
      await refreshTimeTab()
    }
    return timeEvidenceRowsForExport()
  }

  function timeEvidenceCsvContent(rows, columns) {
    return workTimeEvidenceCsvContent({ rows, columns, deps: workerAccountEvidenceDeps() })
  }

  function revokeTimeEvidencePreviewUrl() {
    const url = String(appState.workerAccountTimePreviewUrl ?? '').trim()
    if (url) URL.revokeObjectURL(url)
    appState.workerAccountTimePreviewUrl = ''
  }

  function syncTimeEvidenceExportButtons(rows = timeEvidenceRowsForExport(), columns = readTimeEvidenceExportOptions().columns) {
    const canDownload = rows.length > 0 && columns.length > 0
    const csvButton = document.getElementById('waExportCsvBtn')
    const pdfButton = document.getElementById('waExportPdfBtn')
    const previewButton = document.getElementById('waExportPreviewBtn')
    if (csvButton) csvButton.disabled = false
    if (pdfButton) pdfButton.disabled = false
    if (previewButton) previewButton.disabled = false
    return canDownload
  }

  function setTimeEvidencePreviewPlaceholder(message = 'Kliknij "Podgląd pliku", aby zobaczyć podgląd PDF') {
    revokeTimeEvidencePreviewUrl()
    const preview = document.getElementById('waExportPreview')
    const meta = document.getElementById('waExportPreviewMeta')
    if (!preview) return

    const rows = timeEvidenceRowsForExport()
    const { columns, orientation } = readTimeEvidenceExportOptions({ validate: false }) ?? { columns: [], orientation: 'l' }
    syncTimeEvidenceExportButtons(rows, columns)
    if (meta) {
      const orientationLabel = orientation === 'l' ? 'PDF poziom' : 'PDF pion'
      meta.textContent = `${rows.length} rekordow - ${columns.length} kolumn - ${orientationLabel} - suma: ${formatSeconds(timeEvidenceWorkTotal(rows))}`
    }
    preview.innerHTML = `<div class="wa-export-empty">${escapeHtml(message)}</div>`
  }

  async function buildTimeEvidencePdf(exportOptions, rows = timeEvidenceRowsForExport()) {
    const exportWorker = resolveCurrentWorker() || {}
    const exportFromYmd = String(exportOptions.fromYmd ?? document.getElementById('waTimeFrom')?.value ?? '').trim()
    const exportToYmd = String(exportOptions.toYmd ?? document.getElementById('waTimeTo')?.value ?? '').trim()
    return buildWorkTimeEvidencePdf({
      deps: workerAccountEvidenceDeps(),
      rows,
      columns: exportOptions.columns,
      orientation: exportOptions.orientation,
      fromYmd: exportFromYmd,
      toYmd: exportToYmd,
      worker: exportWorker,
      groupByWorker: false,
    })
  }

  async function renderTimeEvidencePreview() {
    const preview = document.getElementById('waExportPreview')
    const button = document.getElementById('waExportPreviewBtn')
    const exportOptions = readTimeEvidenceExportOptions()
    if (!preview) return
    if (!exportOptions) return
    if (!exportOptions.columns.length) {
      alert('Wybierz co najmniej jedna kolumne do eksportu.')
      setTimeEvidencePreviewPlaceholder('Wybierz co najmniej jedna kolumne do podgladu.')
      return
    }

    if (button) {
      button.disabled = true
      button.textContent = 'Generowanie...'
    }
    preview.innerHTML = '<div class="wa-export-empty">Ladowanie danych dla zakresu...</div>'
    let rows = []
    try {
      rows = await ensureTimeEvidenceRowsForExportOptions(exportOptions) ?? []
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie pobrac danych dla zakresu.'
      preview.innerHTML = `<div class="wa-export-empty">${escapeHtml(message)}</div>`
      showTransientNotice(message, 'error')
      if (button) {
        button.textContent = 'Podglad pliku'
        button.disabled = false
      }
      return
    }
    syncTimeEvidenceExportButtons(rows, exportOptions.columns)
    if (!rows.length) {
      showTransientNotice('Brak danych ewidencji do pobrania', 'error')
      setTimeEvidencePreviewPlaceholder('Brak danych ewidencji do pobrania')
      if (button) {
        button.textContent = 'Podglad pliku'
        button.disabled = false
      }
      return
    }

    preview.innerHTML = '<div class="wa-export-empty">Generowanie podgladu PDF...</div>'
    try {
      const pdf = await buildTimeEvidencePdf(exportOptions, rows)
      revokeTimeEvidencePreviewUrl()
      const blob = pdf.output('blob')
      const url = URL.createObjectURL(blob)
      appState.workerAccountTimePreviewUrl = url
      preview.innerHTML = `<iframe class="wa-export-preview-frame" src="${escapeHtml(url)}" title="Podglad PDF ewidencji pracy"></iframe>`
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie wygenerowac podgladu PDF.'
      preview.innerHTML = `<div class="wa-export-empty">${escapeHtml(message)}</div>`
      showTransientNotice(message, 'error')
    } finally {
      if (button) {
        button.textContent = 'Podgląd pliku'
        button.disabled = false
      }
    }
  }

  function downloadTimeEvidenceCsv(options) {
    const rows = timeEvidenceRowsForExport()
    if (!rows.length) {
      showTransientNotice('Brak danych ewidencji do pobrania', 'error')
      return
    }
    const exportOptions = options ?? readTimeEvidenceExportOptions()
    if (!exportOptions.columns.length) {
      alert('Wybierz co najmniej jedna kolumne do eksportu.')
      return
    }
    const blob = new Blob([`\ufeff${timeEvidenceCsvContent(rows, exportOptions.columns)}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${timeEvidenceFilenameBase()}.csv`
    document.body.appendChild(link)
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    window.setTimeout(() => {
      URL.revokeObjectURL(url)
      link.remove()
    }, 1000)
    showTransientNotice(`Pobrano CSV ewidencji. Rekordy: ${rows.length}.`, 'success')
  }

  async function downloadTimeEvidencePdf(options) {
    const rows = timeEvidenceRowsForExport()
    if (!rows.length) {
      showTransientNotice('Brak danych ewidencji do pobrania', 'error')
      return
    }
    const exportOptions = options ?? readTimeEvidenceExportOptions()
    if (!exportOptions.columns.length) {
      alert('Wybierz co najmniej jedna kolumne do eksportu.')
      return
    }
    const pdf = await buildTimeEvidencePdf(exportOptions, rows)
    pdf.save(`${timeEvidenceFilenameBase()}.pdf`)
    showTransientNotice(`Pobrano PDF ewidencji. Rekordy: ${rows.length}.`, 'success')
  }

  function openTimeEvidenceExportModal() {
    resetTimeEvidenceExportOptions()
    setTimeEvidencePreviewPlaceholder()
    const overlay = document.getElementById('waExportOverlay')
    if (overlay) {
      overlay.hidden = false
      overlay.style.display = 'flex'
    }
  }

  function closeTimeEvidenceExportModal() {
    revokeTimeEvidencePreviewUrl()
    const overlay = document.getElementById('waExportOverlay')
    if (overlay) {
      overlay.hidden = true
      overlay.style.display = 'none'
    }
  }

  async function downloadTimeEvidence(format = 'csv') {
    const exportOptions = readTimeEvidenceExportOptions()
    if (!exportOptions) return
    if (!exportOptions.columns.length) {
      alert('Wybierz co najmniej jedna kolumne do eksportu.')
      setTimeEvidencePreviewPlaceholder('Wybierz co najmniej jedna kolumne do eksportu.')
      return
    }
    let rows = []
    try {
      rows = await ensureTimeEvidenceRowsForExportOptions(exportOptions) ?? []
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie pobrac danych dla zakresu.'
      alert(message)
      return
    }
    if (!rows.length) {
      showTransientNotice('Brak danych ewidencji do pobrania', 'error')
      setTimeEvidencePreviewPlaceholder('Brak danych ewidencji do pobrania')
      return
    }

    closeTimeEvidenceExportModal()
    try {
      if (format === 'pdf') {
        await downloadTimeEvidencePdf(exportOptions)
        return
      }
      downloadTimeEvidenceCsv(exportOptions)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udalo sie pobrac ewidencji pracy.'
      alert(message)
    }
  }

  function tableEmptyRow(columns, message, className = 'worker-account-muted', options = {}) {
    const normalizedMessage = String(message ?? '').replace(/^Brak rekord.*w$/i, 'Brak rekordow')
    if (options.withoutSelect) {
      return `<div class="events-row ${className} worker-account-table-empty-row"><div>${escapeHtml(normalizedMessage)}</div></div>`
    }
    return `<div class="events-row ${className}"><div class="events-select-col"></div><div>${escapeHtml(normalizedMessage)}</div>${'<div></div>'.repeat(Math.max(0, columns - 2))}</div>`
  }

  function eventTimePill(label, type = 'duration') {
    const value = String(label ?? '').trim() || '-'
    return `<span class="event-time-pill event-time-pill--${escapeHtml(type)}${value === '-' ? ' is-empty' : ''}">${escapeHtml(value)}</span>`
  }

  function eventCommentText(row = {}) {
    return String(row.comment ?? row.comments ?? row.commentText ?? row.note ?? row.endReason ?? '').trim()
  }

  function eventCommentButton(index, hasComment) {
    const label = hasComment ? 'Pokaz komentarz' : 'Brak komentarza'
    return `
      <button class="event-comment-icon-btn${hasComment ? '' : ' is-empty'}" type="button" data-wa-event-comment="${index}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 6.8A3.8 3.8 0 0 1 8.8 3h6.4A3.8 3.8 0 0 1 19 6.8v4.4a3.8 3.8 0 0 1-3.8 3.8h-3.7L7 19v-4.1a3.8 3.8 0 0 1-2-3.3V6.8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M8.5 8.5h7M8.5 11.5h4.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    `
  }

  function workerAccountTimeIntervals(row = {}) {
    const sourceRows = Array.isArray(row?.sourceRows) && row.sourceRows.length ? row.sourceRows : [row]
    return sourceRows.flatMap((sourceRow) => workIntervalsFromRow(sourceRow))
  }

  function workerAccountTimeCodes(row = {}) {
    return workIntervalCodes(workerAccountTimeIntervals(row))
  }

  function workerAccountTimeIntervalClient(interval = {}) {
    return String(
      interval?.clientName ?? interval?.klient ?? interval?.clientLabel ?? interval?.clientId ?? '',
    ).trim() || 'Brak klienta'
  }

  function workerAccountTimeIntervalZone(interval = {}) {
    return String(
      interval?.zoneName ?? interval?.strefa ?? interval?.zoneLabel ?? interval?.zoneId ??
      interval?.utilityRoomId ?? interval?.roomId ?? '',
    ).trim() || 'Brak strefy'
  }

  function workerAccountTimeIntervalInfoValue(...values) {
    const value = values
      .map((entry) => String(entry ?? '').trim())
      .find((entry) => entry && entry !== '-')
    return value || 'Brak danych'
  }

  function workerAccountTimeIntervalQrCode(interval = {}) {
    return workerAccountTimeIntervalInfoValue(
      interval?.qrCode,
      interval?.scannedQrCode,
      interval?.zoneQrCode,
      interval?.zoneId,
      interval?.utilityRoomId,
      interval?.roomId,
    )
  }

  function workerAccountTimeIntervalFunction(interval = {}, codeType = '') {
    const rawValue = workerAccountTimeIntervalInfoValue(
      interval?.functionName,
      interval?.zoneFunction,
      interval?.function,
      interval?.qrFunction,
      codeType,
    )
    const normalized = rawValue.toUpperCase().replace(/[\s_-]+/g, ' ').trim()
    const isSpecial = interval?.isSpecialZone === true || /SPECJAL|SPECIAL/.test(normalized)
    if (isSpecial) return { label: 'STREFA SPECJALNA', className: 'is-special' }
    if (/^START$/.test(normalized)) return { label: 'START', className: 'is-start' }
    if (/^STOP$/.test(normalized)) return { label: 'STOP', className: 'is-stop' }
    if (/CLEAN|SPRZ/.test(normalized)) return { label: 'CLEAN', className: 'is-clean' }
    if (/STREFA|ZONE/.test(normalized)) return { label: 'STREFA', className: 'is-zone' }
    return { label: rawValue, className: 'is-default' }
  }

  function workerAccountTimeCodeZoneIndicator(code = {}, index = 0) {
    const interval = code?.interval ?? {}
    const clientLabel = workerAccountTimeIntervalClient(interval)
    const zoneLabel = workerAccountTimeIntervalZone(interval)
    const qrCode = workerAccountTimeIntervalQrCode(interval)
    const functionInfo = workerAccountTimeIntervalFunction(interval, code?.type)
    const locationLabel = workerAccountTimeIntervalInfoValue(
      interval?.lokalizacja,
      interval?.location,
      interval?.zoneLocation,
    )
    const tooltipId = `waTimeCodeZoneTooltip-${Math.max(0, Number(index) || 0)}`
    const label = `Informacje o strefie ${zoneLabel}`
    return `
      <span class="wa-time-code-zone-wrap">
        <button class="wa-time-code-zone-trigger" type="button" aria-label="${escapeHtml(label)}" aria-describedby="${escapeHtml(tooltipId)}">
          <span>${escapeHtml(zoneLabel)}</span>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8"/><path d="M12 10.7v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1" fill="currentColor"/></svg>
        </button>
        <span class="wa-time-code-zone-tooltip" id="${escapeHtml(tooltipId)}" role="tooltip">
          <span class="wa-time-code-zone-tooltip-heading">
            <span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 21s6-5.1 6-11a6 6 0 0 0-12 0c0 5.9 6 11 6 11Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.2" stroke="currentColor" stroke-width="1.8"/></svg></span>
            <strong>Informacje o strefie</strong>
          </span>
          <span class="wa-time-code-zone-details">
            <span><small>Klient</small><b>${escapeHtml(clientLabel)}</b></span>
            <span><small>Nazwa strefy</small><b>${escapeHtml(zoneLabel)}</b></span>
            <span><small>Kod QR</small><b class="mono">${escapeHtml(qrCode)}</b></span>
            <span><small>Funkcja</small><b class="wa-time-code-zone-function ${escapeHtml(functionInfo.className)}">${escapeHtml(functionInfo.label)}</b></span>
            <span class="is-wide"><small>Lokalizacja</small><b>${escapeHtml(locationLabel)}</b></span>
          </span>
        </span>
      </span>
    `
  }

  function workerAccountTimeCodeEditButton(code = {}, index = 0, dayKey = '') {
    if (!canAdministerWorkers()) return ''
    const label = `Edytuj godzinę ${code.type} sesji ${code.session}`
    return `
      <button class="wa-time-code-edit-btn" type="button" data-wa-time-code-edit="${index}" data-wa-time-code-day="${escapeHtml(dayKey)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h8M16 17.5h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="15" cy="6.5" r="2" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="12" r="2" stroke="currentColor" stroke-width="1.8"/><circle cx="14" cy="17.5" r="2" stroke="currentColor" stroke-width="1.8"/></svg>
      </button>
    `
  }

  function workerAccountTimeCodeGpsIndicator(code = {}) {
    const interval = code?.interval ?? {}
    const coords = workIntervalGpsCoordinates(interval, code.type)
    const locationRaw = String(interval?.lokalizacja ?? interval?.location ?? '').trim()
    const locationLabel = locationRaw && locationRaw !== '-' ? locationRaw : ''
    const hasGps = Boolean(coords)
    const stateClass = hasGps ? 'has-gps' : 'no-gps'
    const mapQuery = hasGps ? `${coords.lat},${coords.lon}` : ''
    const googleMapsUrl = hasGps
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
      : ''
    const googleMapsEmbedUrl = hasGps
      ? `https://maps.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=17&hl=pl&output=embed`
      : ''
    const ariaLabel = hasGps
      ? `Lokalizacja GPS ${code.type}: ${locationLabel || `${coords.lat}, ${coords.lon}`}`
      : `Brak lokalizacji GPS dla ${code.type}`
    const icon = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s6-5.1 6-11a6 6 0 0 0-12 0c0 5.9 6 11 6 11Z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.2" stroke="currentColor" stroke-width="1.9"/></svg>`
    return `
      <span class="wa-time-code-gps-wrap ${stateClass}">
        ${hasGps
          ? `<a class="wa-time-code-gps-icon" href="${escapeHtml(googleMapsUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(`${ariaLabel}. Otwórz w Google Maps`)}">${icon}</a>`
          : `<span class="wa-time-code-gps-icon" tabindex="0" role="img" aria-label="${escapeHtml(ariaLabel)}">${icon}</span>`}
        <span class="wa-time-code-gps-tooltip" role="tooltip">
          <strong>${hasGps ? 'Lokalizacja GPS' : 'Brak lokalizacji GPS'}</strong>
          ${hasGps && locationLabel ? `<span>${escapeHtml(locationLabel)}</span>` : ''}
          ${hasGps ? `<iframe class="wa-time-code-gps-map" src="${escapeHtml(googleMapsEmbedUrl)}" title="${escapeHtml(`Mapa lokalizacji ${code.type}`)}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>` : ''}
          <small>${hasGps ? `${escapeHtml(coords.lat)}, ${escapeHtml(coords.lon)}` : 'Zdarzenie nie zawiera współrzędnych.'}</small>
          ${hasGps ? `<a class="wa-time-code-gps-map-link" href="${escapeHtml(googleMapsUrl)}" target="_blank" rel="noopener noreferrer">Otwórz w Google Maps <span aria-hidden="true">↗</span></a>` : ''}
        </span>
      </span>
    `
  }

  function workerAccountTimeCodeCountLabel(count) {
    const value = Math.max(0, Number(count) || 0)
    const lastTwo = value % 100
    const last = value % 10
    if (value === 1) return '1 kod'
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `${value} kody`
    return `${value} kodów`
  }

  function workerAccountTimeCodesButton(row = {}) {
    const codes = workerAccountTimeCodes(row)
    if (!codes.length) return ''
    const dayKey = String(row?.dayKey ?? '').trim()
    const dayLabel = dateKeyToLabel(dayKey)
    const label = `Pokaż kody START i STOP z dnia ${dayLabel}`
    return `
      <button class="wa-time-codes-btn" type="button" data-wa-time-codes="${escapeHtml(dayKey)}" aria-haspopup="dialog" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 5h10M7 12h10M7 19h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <circle cx="4" cy="5" r="1.2" fill="currentColor"/><circle cx="4" cy="12" r="1.2" fill="currentColor"/><circle cx="4" cy="19" r="1.2" fill="currentColor"/>
        </svg>
        <span aria-hidden="true">${codes.length}</span>
      </button>
    `
  }

  function eventMenuButton(index, label) {
    const disabled = canAdministerWorkers() ? '' : ' disabled'
    return `
      <button class="event-menu-icon-btn" type="button" data-wa-event-edit="${index}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${disabled}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="5" r="1.7" fill="currentColor"/>
          <circle cx="12" cy="12" r="1.7" fill="currentColor"/>
          <circle cx="12" cy="19" r="1.7" fill="currentColor"/>
        </svg>
      </button>
    `
  }

  function _editIconButton(attribute, index, label) {
    const disabled = canAdministerWorkers() ? '' : ' disabled'
    return `
      <button class="event-edit-icon-btn" type="button" ${attribute}="${index}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${disabled}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 20h4l10-10-4-4L4 16v4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M13 7l4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>
    `
  }

  function renderPagedTable(kind, rows, renderer, columns, options = {}) {
    const pageKey = `workerAccount${kind}Page`
    const sizeKey = `workerAccount${kind}PageSize`
    const tableIds = {
      Events: ['waEventRows', 'waEventsLabel', 'waEventsPrev', 'waEventsNext'],
      Orders: ['waOrderRows', 'waOrdersLabel', 'waOrdersPrev', 'waOrdersNext'],
    }
    const [rootId, labelId, prevId, nextId] = tableIds[kind] ?? tableIds.Events
    const root = document.getElementById(rootId)
    const sourceRows = Array.isArray(rows) ? rows : []
    const paged = paginate(sourceRows, appState[pageKey], appState[sizeKey])
    appState[pageKey] = paged.page
    appState[sizeKey] = paged.pageSize

    if (root) {
      root.innerHTML = paged.items.length
        ? paged.items.map((row, index) => renderer(row, index, paged)).join('')
        : tableEmptyRow(columns, 'Brak rekordów', 'worker-account-muted', options)
    }
    setText(labelId, `Wyswietlono: ${paged.items.length} / ${paged.total} | Strona ${paged.page} z ${paged.totalPages}`)
    const prev = document.getElementById(prevId)
    const next = document.getElementById(nextId)
    if (prev) prev.disabled = paged.page <= 1
    if (next) next.disabled = paged.page >= paged.totalPages
  }

  function renderEventsTable() {
    renderPagedTable(
      'Events',
      appState.workerAccountEventsRows,
      (row, index, paged) => {
        const sourceIndex = (paged.page - 1) * paged.pageSize + index
        const date = row.date || toDayKey(row.startAt ?? row.createdAt ?? row.updatedAt) || '-'
        const client = row.clientName || row.klient || row.clientLabel || row.clientId || '-'
        const zone = row.zoneName || row.strefa || row.zoneLabel || row.zoneId || '-'
        const location = row.location || row.lokalizacja || row.roomName || row.roomId || row.utilityRoomId || '-'
        const start = row.start || row.startTime || formatTimeFromIso(row.startAt)
        const stop = row.stop || row.stopTime || row.endTime || formatTimeFromIso(row.endAt)
        const duration = row.durationLabel || row.timeLabel || formatEventDuration(row.durationSec ?? row.netSec ?? row.workSec ?? 0)
        const comment = eventCommentText(row)
        const editor = row.editedBy || row.updatedBy || row.createdBy || row.authorName || row.modifiedBy || '-'
        return `<div class="events-row worker-account-event-row"><div>${escapeHtml(client)}</div><div>${escapeHtml(zone)}</div><div>${escapeHtml(location)}</div><div class="mono">${escapeHtml(date)}</div><div>${eventTimePill(start, 'start')}</div><div>${eventTimePill(stop, 'stop')}</div><div>${eventTimePill(duration, 'duration')}</div><div>${eventCommentButton(sourceIndex, Boolean(comment))}</div><div>${escapeHtml(editor)}</div><div>${eventMenuButton(sourceIndex, 'Edytuj zdarzenie')}</div></div>`
      },
      10,
      { withoutSelect: true },
    )
  }

  function renderOrdersTable() {
    renderPagedTable(
      'Orders',
      appState.workerAccountOrderRows,
      (order) => {
        const date = orderDateLabel(order)
        const status = orderStatusLabel(order)
        return `<div class="events-row"><div class="events-select-col"><input type="checkbox" disabled aria-label="Zlecenie ${escapeHtml(date)}" /></div><div class="mono">${escapeHtml(date)}</div><div>${escapeHtml(orderClientLabel(order))}</div><div>${escapeHtml(orderTitle(order))}</div><div>${escapeHtml(orderZoneLabel(order))}</div><div>${eventTimePill(status, orderCompleted(order) ? 'start' : 'duration')}</div><div>-</div></div>`
      },
      7,
    )
  }

  function renderTimeTable() {
    ensureTimeSelectionState()
    const root = document.getElementById('waTimeRows')
    const rows = Array.isArray(appState.workerAccountTimeRows) ? appState.workerAccountTimeRows : []
    const paged = paginate(rows, appState.workerAccountTimePage, WORKER_ACCOUNT_TIME_PAGE_SIZE)
    appState.workerAccountTimePage = paged.page
    appState.workerAccountTimePageSize = paged.pageSize
    appState.workerAccountTimeCurrentPageKeys = paged.items.map((row) => timeSelectionKey(row)).filter(Boolean)

    if (root) {
      root.innerHTML = paged.items.length
        ? paged.items.map((row) => {
            const key = timeSelectionKey(row)
            const selected = key && appState.workerAccountTimeSelectedKeys.has(key)
            return `
              <div class="events-row worker-account-time-row${selected ? ' is-selected' : ''}">
                <div class="events-select-col"><input type="checkbox" data-wa-time-select="${escapeHtml(key)}" ${selected ? 'checked' : ''} aria-label="Zaznacz rekord dnia ${escapeHtml(dateKeyToLabel(row.dayKey))}" /></div>
                <div class="mono">${escapeHtml(dateKeyToLabel(row.dayKey))}</div>
                <div>${escapeHtml(row.workerType || '-')}</div>
                <div class="mono time-start">${escapeHtml(isoToHm(row.startAt))}</div>
                <div class="mono time-stop">${escapeHtml(isoToHm(row.endAt))}</div>
                <div class="wa-time-work-cell"><span class="mono work-brutto">${escapeHtml(formatSeconds(row.workSec))}</span>${workerAccountTimeCodesButton(row)}</div>
                <div class="mono work-bold">${escapeHtml(formatSeconds(row.netSec))}</div>
                <div class="mono time-break">${escapeHtml(formatSeconds(row.breakSec))}</div>
                <div>${escapeHtml(row.updatedBy || '-')}</div>
              </div>
            `
          }).join('')
        : tableEmptyRow(9, 'Brak rekordów')
    }

    setText('waTimePageLabel', `Strona ${paged.page} / ${paged.totalPages}`)
    setText('waTimeShownLabel', `Wyswietlono: ${paged.items.length} - Wszystkie: ${paged.total} - Na strone: ${paged.pageSize}`)
    const prev = document.getElementById('waTimePrev')
    const next = document.getElementById('waTimeNext')
    if (prev) prev.disabled = paged.page <= 1
    if (next) next.disabled = paged.page >= paged.totalPages
    syncTimeSelectionUi()
  }

  function renderAllTables() {
    renderOrdersTable()
    renderEventsTable()
    renderTimeTable()
  }

  function setOrdersLoading() {
    const orders = document.getElementById('waOrderRows')
    if (orders) orders.innerHTML = tableEmptyRow(7, 'Ladowanie danych...', 'worker-account-loading')
    setText('waOrdersLabel', 'Ladowanie danych...')
    ;['waOrdersPrev', 'waOrdersNext'].forEach((id) => {
      const button = document.getElementById(id)
      if (button) button.disabled = true
    })
  }

  function setActivityLoading() {
    const events = document.getElementById('waEventRows')
    if (events) events.innerHTML = tableEmptyRow(10, 'Ladowanie danych...', 'worker-account-loading', { withoutSelect: true })
    setText('waEventsLabel', 'Ladowanie danych...')
    ;['waEventsPrev', 'waEventsNext'].forEach((id) => {
      const button = document.getElementById(id)
      if (button) button.disabled = true
    })
  }

  function setTimeLoading() {
    const time = document.getElementById('waTimeRows')
    if (time) time.innerHTML = tableEmptyRow(9, 'Ladowanie danych...', 'worker-account-loading')
    setText('waTimePageLabel', 'Ladowanie danych...')
    setText('waTimeShownLabel', `Wyswietlono: 0 - Wszystkie: 0 - Na strone: ${WORKER_ACCOUNT_TIME_PAGE_SIZE}`)
    ;['waTimePrev', 'waTimeNext'].forEach((id) => {
      const button = document.getElementById(id)
      if (button) button.disabled = true
    })
  }

  function _setTablesLoading() {
    setOrdersLoading()
    setActivityLoading()
    setTimeLoading()
  }

  function workerAccountSectionLoadKey(context = {}) {
    return [context.accountKey, context.rangeKey].filter(Boolean).join('|')
  }

  function workerAccountTimeRangeKey(range = buildTimeFetchRange()) {
    return [range.fromIso ?? '', range.toIso ?? ''].join('|')
  }

  function workerOrdersFromCache(worker) {
    const orders = typeof ordersListSourceOrders === 'function' && Array.isArray(ordersListSourceOrders())
      ? ordersListSourceOrders()
      : []
    return sortOrdersByLatest(orders.filter((order) => orderMatchesWorker(order, worker)))
  }

  function applyWorkerAccountOrders(worker, context, orders = workerOrdersFromCache(worker)) {
    if (!isWorkerAccountLoadContextCurrent(context)) return false
    appState.workerAccountOrderRows = Array.isArray(orders) ? orders : []
    appState.workerAccountOrdersLoadedKey = context.accountKey
    appState.workerAccountLoadedWorkerKey = context.accountKey
    renderOrdersTable()
    renderWorkerAccountSummaryFromState()
    return true
  }

  function renderWorkerAccountSectionError(section, error, context = {}) {
    if (context.accountKey && !isWorkerAccountLoadContextCurrent(context)) return
    const message = error instanceof Error ? error.message : String(error ?? 'Nie udalo sie pobrac danych konta.')
    if (section === 'orders') {
      const orders = document.getElementById('waOrderRows')
      if (orders) orders.innerHTML = tableEmptyRow(7, message, 'worker-account-error')
      setText('waOrdersLabel', 'Blad pobierania danych')
    } else if (section === 'activity') {
      const events = document.getElementById('waEventRows')
      if (events) events.innerHTML = tableEmptyRow(10, message, 'worker-account-error', { withoutSelect: true })
      setText('waEventsLabel', 'Blad pobierania danych')
      renderRecentActivityPreview()
    } else if (section === 'time') {
      const time = document.getElementById('waTimeRows')
      if (time) time.innerHTML = tableEmptyRow(9, message, 'worker-account-error')
      appState.workerAccountTimeRows = []
      appState.workerAccountTimeSelectedKeys = new Set()
      appState.workerAccountTimeCurrentPageKeys = []
      appState.workerAccountTimePage = 1
      setTimeMonthCard([])
      setText('waTimePageLabel', 'Strona 1 / 1')
      setText('waTimeShownLabel', `Wyswietlono: 0 - Wszystkie: 0 - Na strone: ${WORKER_ACCOUNT_TIME_PAGE_SIZE}`)
      syncTimeSelectionUi()
    }
    showTransientNotice(message, 'error')
  }

  async function loadWorkerAccountSummary(worker, options = {}) {
    const context = makeWorkerAccountLoadContext(worker, 'summary', options)
    if (!isWorkerAccountLoadContextCurrent(context)) return false
    appState.workerAccountSummaryLoadingKey = context.accountKey
    appState.workerAccountDataLoadingKey = context.accountKey
    applyWorkerAccountOrders(worker, context)
    appState.workerAccountSummaryLoadedKey = context.accountKey
    if (appState.workerAccountSummaryLoadingKey === context.accountKey) appState.workerAccountSummaryLoadingKey = ''
    if (appState.workerAccountDataLoadingKey === context.accountKey) appState.workerAccountDataLoadingKey = ''
    return true
  }

  async function loadWorkerAccountOrders(worker, options = {}) {
    const context = makeWorkerAccountLoadContext(worker, 'orders', options)
    if (!isWorkerAccountLoadContextCurrent(context)) return false
    if (appState.workerAccountOrdersLoadedKey === context.accountKey && options.force !== true) {
      renderOrdersTable()
      return true
    }

    appState.workerAccountOrdersLoadingKey = context.accountKey
    if (!appState.workerAccountOrderRows.length) setOrdersLoading()
    applyWorkerAccountOrders(worker, context)

    if (options.refreshRemote === true && typeof ordersSyncRemoteTimelineOrders === 'function') {
      void ordersSyncRemoteTimelineOrders({ render: false })
        .then(() => {
          applyWorkerAccountOrders(worker, context)
        })
        .catch((error) => {
          if (isWorkerAccountLoadContextCurrent(context)) console.warn('[worker-account/orders] remote refresh failed', error)
        })
        .finally(() => {
          if (appState.workerAccountOrdersLoadingKey === context.accountKey && isWorkerAccountLoadContextCurrent(context)) {
            appState.workerAccountOrdersLoadingKey = ''
          }
        })
    } else if (appState.workerAccountOrdersLoadingKey === context.accountKey) {
      appState.workerAccountOrdersLoadingKey = ''
    }

    return true
  }

  async function loadWorkerAccountTime(worker, options = {}) {
    const range = options.range ?? buildTimeFetchRange()
    const rangeKey = workerAccountTimeRangeKey(range)
    const context = makeWorkerAccountLoadContext(worker, 'time', { ...options, rangeKey })
    const loadKey = workerAccountSectionLoadKey(context)
    if (!isWorkerAccountLoadContextCurrent(context)) return false
    if (appState.workerAccountTimeLoadedKey === loadKey && options.force !== true) {
      setTimeMonthCard(appState.workerAccountTimeRows)
      renderTimeTable()
      renderWorkerAccountSummaryFromState()
      maybeOpenWorkerAccountPendingTimeEditor()
      return true
    }

    appState.workerAccountTimeLoadingKey = loadKey
    setTimeLoading()
    try {
      const sourceRows = sortRowsByLatest(
        await fetchWorkerTimeRows(appState.session.orgId, worker, range, { allowBroadFallback: options.allowBroadFallback }),
      ).map((row) => stampWorkerIdentity(row, worker))
      if (!isWorkerAccountLoadContextCurrent(context) || appState.workerAccountTimeLoadingKey !== loadKey) return false

      const filteredRows = filterTimeRowsForRange(sourceRows, { from: range.from, to: range.to })
      appState.workerAccountAllTimeRows = filteredRows
      appState.workerAccountTimeRows = aggregateTimeRows(filteredRows, worker)
      appState.workerAccountTimeSelectedKeys = new Set()
      appState.workerAccountTimeCurrentPageKeys = []
      appState.workerAccountTimePage = 1
      appState.workerAccountTimeLoadedKey = loadKey
      appState.workerAccountLoadedWorkerKey = context.accountKey
      setTimeMonthCard(appState.workerAccountTimeRows)
      renderTimeTable()
      renderWorkerAccountSummaryFromState()
      maybeOpenWorkerAccountPendingTimeEditor()
      return true
    } catch (error) {
      renderWorkerAccountSectionError('time', error, context)
      return false
    } finally {
      if (appState.workerAccountTimeLoadingKey === loadKey && isWorkerAccountLoadContextCurrent(context)) {
        appState.workerAccountTimeLoadingKey = ''
      }
    }
  }

  async function loadWorkerAccountEvents(worker, options = {}) {
    const context = makeWorkerAccountLoadContext(worker, 'activity', options)
    if (!isWorkerAccountLoadContextCurrent(context)) return false
    if (appState.workerAccountActivityLoadedKey === context.accountKey && options.force !== true) {
      renderEventsTable()
      renderRecentActivityPreview()
      return true
    }

    appState.workerAccountActivityLoadingKey = context.accountKey
    setActivityLoading()
    try {
      const eventRows = sortRowsByLatest(
        await fetchWorkerEventRows(appState.session.orgId, worker, { pageSize: options.pageSize ?? WORKER_ACCOUNT_ACTIVITY_FETCH_PAGE_SIZE }),
      ).map((row) => stampWorkerIdentity(row, worker))
      if (!isWorkerAccountLoadContextCurrent(context) || appState.workerAccountActivityLoadingKey !== context.accountKey) return false
      appState.workerAccountEventsRows = eventRows
      appState.workerAccountActivityLoadedKey = context.accountKey
      appState.workerAccountLoadedWorkerKey = context.accountKey
      renderEventsTable()
      renderRecentActivityPreview()
      renderWorkerAccountSummaryFromState()
      return true
    } catch (error) {
      renderWorkerAccountSectionError('activity', error, context)
      return false
    } finally {
      if (appState.workerAccountActivityLoadingKey === context.accountKey && isWorkerAccountLoadContextCurrent(context)) {
        appState.workerAccountActivityLoadingKey = ''
      }
    }
  }

  async function _loadWorkerAccountData(worker, options = {}) {
    const context = makeWorkerAccountLoadContext(worker, 'all', options)
    if (!isWorkerAccountLoadContextCurrent(context)) return false
    await Promise.allSettled([
      loadWorkerAccountSummary(worker, context),
      loadWorkerAccountOrders(worker, { ...context, refreshRemote: options.refreshRemote === true }),
      loadWorkerAccountTime(worker, context),
      loadWorkerAccountEvents(worker, context),
    ])
    return isWorkerAccountLoadContextCurrent(context)
  }

  function initializeTimeFilters(options = {}) {
    if (options.forceDefault) {
      resetTimeFiltersToCurrentMonth()
      return
    }
    const month = currentMonthRange()
    const from = document.getElementById('waTimeFrom')
    const to = document.getElementById('waTimeTo')
    if (from && !from.value) from.value = month.from
    if (to && !to.value) to.value = month.to
    syncTimeMonthPickFromRange()
  }

  function buildTimeFetchRange() {
    const from = String(document.getElementById('waTimeFrom')?.value ?? '').trim()
    const to = String(document.getElementById('waTimeTo')?.value ?? '').trim()
    return {
      page: 1,
      pageSize: WORKER_ACCOUNT_TIME_FETCH_PAGE_SIZE,
      from,
      to,
      fromIso: from && typeof ymdToIsoRangeStart === 'function' ? ymdToIsoRangeStart(from) : undefined,
      toIso: to && typeof ymdToIsoRangeEnd === 'function' ? ymdToIsoRangeEnd(to) : undefined,
    }
  }

  async function refreshTimeTab() {
    const worker = resolveCurrentWorker()
    if (!worker || !appState.session?.orgId) return
    const sessionContext = ensureWorkerAccountSession(worker)
    syncTimeMonthPickFromRange()
    await loadWorkerAccountTime(worker, { ...sessionContext, force: true })
  }

  async function refreshTimeAfterWorkdayChange(options = {}) {
    const changedWorkerLogin = String(options?.workerLogin ?? options?.login ?? '').trim().toLowerCase()
    const worker = resolveCurrentWorker()
    if (!worker || !appState.session?.orgId) return false

    const currentLogin = String(workerLogin(worker) ?? '').trim().toLowerCase()
    if (changedWorkerLogin && currentLogin && changedWorkerLogin !== currentLogin) {
      return false
    }

    appState.workerAccountTimeLoadedKey = ''
    appState.workerAccountTimeLoadingKey = ''

    if (appState.workerAccountActiveTab !== 'time') {
      return true
    }

    const sessionContext = ensureWorkerAccountSession(worker)
    syncTimeMonthPickFromRange()
    await loadWorkerAccountTime(worker, { ...sessionContext, force: true })
    return true
  }

  function _renderWorkerAccountLoadError(error, accountKey = '') {
    const currentKey = currentWorkerAccountKey()
    if (accountKey && currentKey && currentKey !== accountKey) return
    const message = error instanceof Error ? error.message : String(error ?? 'Nie udalo sie pobrac danych konta.')
    resetWorkerAccountRuntimeState({ clearLoadingKeys: true })
    const events = document.getElementById('waEventRows')
    const orders = document.getElementById('waOrderRows')
    const time = document.getElementById('waTimeRows')
    if (events) events.innerHTML = tableEmptyRow(10, message, 'worker-account-error', { withoutSelect: true })
    if (orders) orders.innerHTML = tableEmptyRow(7, message, 'worker-account-error')
    if (time) time.innerHTML = tableEmptyRow(9, message, 'worker-account-error')
    setText('waEventsLabel', 'Blad pobierania danych')
    setText('waOrdersLabel', 'Blad pobierania danych')
    setText('waTimePageLabel', 'Strona 1 / 1')
    setText('waTimeShownLabel', `Wyswietlono: 0 - Wszystkie: 0 - Na strone: ${WORKER_ACCOUNT_TIME_PAGE_SIZE}`)
    setTimeMonthCard([])
    renderRecentActivityPreview()
    syncTimeSelectionUi()
    showTransientNotice(message, 'error')
  }

  function ensureWorkerAccountTabData(tab) {
    if (tab !== 'account' && tab !== 'activity' && tab !== 'time' && tab !== 'orders') return
    const worker = resolveCurrentWorker()
    const accountKey = worker ? workerAccountKey(worker) : ''
    if (!worker || !accountKey) return
    const sessionContext = ensureWorkerAccountSession(worker)
    if (tab === 'time') syncTimeMonthPickFromRange()
    startWorkerAccountSectionLoads(worker, sessionContext, { tab })
  }

  function activateTab(tab, options = {}) {
    const nextTab = WORKER_ACCOUNT_TABS.has(tab) ? tab : 'account'
    const previousEditTab = appState.workerAccountEditTab
    if (previousEditTab && previousEditTab !== nextTab) {
      cancelEditMode(previousEditTab, { silent: true })
    }
    appState.workerAccountActiveTab = nextTab
    document.querySelectorAll('[data-wa-tab]').forEach((button) => {
      button.classList.toggle('is-active', button.getAttribute('data-wa-tab') === nextTab)
    })
    document.querySelectorAll('[data-wa-panel]').forEach((panel) => {
      panel.classList.toggle('is-active', panel.getAttribute('data-wa-panel') === nextTab)
    })
    if (options.refresh !== false) ensureWorkerAccountTabData(nextTab)
  }

  function focusField(id) {
    window.requestAnimationFrame(() => {
      const input = document.getElementById(id)
      if (input && typeof input.focus === 'function' && !input.disabled) {
        input.focus()
        if (typeof input.select === 'function') input.select()
      }
    })
  }

  function readAccountPayload(worker) {
    const admin = canAdministerWorkers()
    const nextWorkerId = workerId(worker)
    const nextRole = isOwnerWorker(worker)
      ? 'OWNER'
      : admin
        ? String(document.getElementById('waRole')?.value ?? workerRole(worker)).trim()
        : workerRole(worker)
    const nextWorkerType = admin
      ? workerTypeValue(document.getElementById('waWorkerType')?.value ?? worker)
      : workerTypeValue(worker)
    const contractType = admin
      ? String(document.getElementById('waContractType')?.value ?? '').trim()
      : String(workerField(worker, ['contractType', 'agreementType', 'employmentContractType'], '') ?? '').trim()
    const contractFrom = admin
      ? String(document.getElementById('waContractFrom')?.value ?? '').trim()
      : dateInputValue(workerField(worker, ['contractFrom', 'agreementFrom', 'contractStart', 'contractStartDate']))
    const contractTo = admin
      ? String(document.getElementById('waContractTo')?.value ?? '').trim()
      : dateInputValue(workerField(worker, ['contractTo', 'agreementTo', 'contractEnd', 'contractEndDate', 'contractValidTo']))
    const bhpFrom = admin
      ? String(document.getElementById('waBhpFrom')?.value ?? '').trim()
      : dateInputValue(workerField(worker, ['bhpFrom', 'bhpStart', 'bhpStartDate', 'safetyTrainingFrom']))
    const bhpTo = admin
      ? String(document.getElementById('waBhpTo')?.value ?? '').trim()
      : dateInputValue(workerField(worker, ['bhpTo', 'bhpUntil', 'bhpValidTo', 'bhpEnd', 'bhpEndDate', 'safetyTrainingTo']))
    const medicalFrom = admin
      ? String(document.getElementById('waMedicalFrom')?.value ?? '').trim()
      : dateInputValue(workerField(worker, ['medicalExamFrom', 'occupationalMedicineFrom', 'medicalFrom', 'medicalStartDate']))
    const medicalTo = admin
      ? String(document.getElementById('waMedicalTo')?.value ?? '').trim()
      : dateInputValue(workerField(worker, ['medicalExamTo', 'occupationalMedicineTo', 'medicalTo', 'medicalExamValidTo', 'medicalEndDate']))
    const trainings = admin ? selectedTrainingValues() : workerTrainingValues(worker)
    const photoDataUrl = String(appState.workerAccountPhotoDataUrl ?? '').trim()
    const removePhoto = Boolean(appState.workerAccountRemovePhoto)
    const photoUrl = removePhoto
      ? ''
      : photoDataUrl
        ? ''
        : String(appState.workerAccountPhotoUrl || workerPhotoUrl(worker)).trim()
    return {
      workerId: nextWorkerId,
      name: String(document.getElementById('waName')?.value ?? '').trim(),
      workerName: String(document.getElementById('waName')?.value ?? '').trim(),
      login: workerLogin(worker),
      email: String(document.getElementById('waEmail')?.value ?? '').trim(),
      loginEmail: String(document.getElementById('waEmail')?.value ?? '').trim(),
      phone: String(document.getElementById('waPhone')?.value ?? '').trim(),
      role: nextRole,
      workerType: nextWorkerType,
      contractType,
      agreementType: contractType,
      contractFrom,
      contractTo,
      bhpFrom,
      bhpTo,
      medicalExamFrom: medicalFrom,
      medicalExamTo: medicalTo,
      occupationalMedicineFrom: medicalFrom,
      occupationalMedicineTo: medicalTo,
      trainings,
      trainingList: trainings,
      active: admin ? String(document.getElementById('waActive')?.value ?? '1') === '1' : isWorkerActive(worker),
      editedBy: String(appState.session?.name ?? appState.session?.email ?? '').trim(),
      authUid: worker.authUid ?? '',
      photoUrl,
      photoDataUrl,
      removePhoto,
    }
  }

  async function saveWorkerPatch(payload, successMessage, options = {}) {
    const worker = resolveCurrentWorker()
    if (!worker || !appState.session?.orgId) return null
    const currentLogin = workerLogin(worker)
    if (!payload.name || !payload.email) {
      alert('Uzupelnij imie i email pracownika.')
      return null
    }
    let updated
    try {
      updated = await updateWorker(appState.session.orgId, currentLogin, payload)
    } catch (error) {
      console.error('[worker-account] save failed', error)
      if (options.silent !== true) {
        showTransientNotice('Nie udało się zapisać zmian.', 'error')
      }
      return null
    }
    const persisted = updated
    const updatedLogin = persisted?.loginChangeSkipped
      ? currentLogin
      : String(persisted?.login ?? currentLogin).trim() || currentLogin
    const nextPhotoUrl = String(
      persisted?.photoUrl ??
        persisted?.profilePhotoUrl ??
        (payload.removePhoto ? '' : payload.photoUrl || workerPhotoUrl(worker)),
    ).trim()
    const nextWorker = {
      ...worker,
      ...persisted,
      login: updatedLogin,
      workerLogin: updatedLogin,
      id: String(persisted?.workerId ?? persisted?.id ?? workerId(worker)).trim() || updatedLogin,
      workerId: String(persisted?.workerId ?? persisted?.id ?? workerId(worker)).trim() || updatedLogin,
      name: persisted?.name ?? persisted?.workerName ?? workerName(worker),
      workerName: persisted?.workerName ?? persisted?.name ?? workerName(worker),
      role: persisted?.role ?? worker.role,
      workerType: workerTypeValue(persisted?.workerType ?? persisted?.type ?? persisted?.role ?? worker),
      active: persisted?.active,
      email: persisted?.email ?? persisted?.loginEmail ?? worker.email,
      loginEmail: persisted?.loginEmail ?? persisted?.email ?? worker.loginEmail,
      phone: persisted?.phone ?? worker.phone,
      editedBy: persisted?.editedBy ?? payload.editedBy,
      photoUrl: nextPhotoUrl,
      profilePhotoUrl: nextPhotoUrl,
    }
    nextWorker.type = nextWorker.workerType
    updateCurrentWorker(nextWorker)
    applyWorkerToCachedRows(currentLogin, nextWorker)
    renderWorkerCard(nextWorker)
    renderForms(nextWorker)
    void refreshWorkerDirectoryAfterSave(currentLogin, nextWorker).catch((error) => {
      console.warn('[worker-account] background WorkersForOrg refresh failed after successful save', error)
    })
    if (successMessage && options.silent !== true) {
      showTransientNotice(successMessage, 'success')
    }
    return nextWorker
  }

  async function saveAccount() {
    if (!canManageWorkers()) {
      alert('Brak uprawnien do edycji danych pracownika.')
      return
    }
    const worker = resolveCurrentWorker()
    if (!worker) return
    const updated = await saveWorkerPatch(readAccountPayload(worker), 'Zmiany zapisano.')
    if (updated) exitEditMode('account')
    return updated
  }

  async function deactivateWorkerAccount() {
    if (!canAdministerWorkers()) {
      alert('Dezaktywacja konta jest dostepna tylko dla Admina.')
      return
    }
    const worker = resolveCurrentWorker()
    if (!worker) return
    if (!isWorkerActive(worker)) {
      showTransientNotice('Konto pracownika jest juz nieaktywne.', 'info')
      return
    }
    const confirmed = window.confirm(`Dezaktywowac konto pracownika ${workerName(worker) || workerLogin(worker)}?`)
    if (!confirmed) return
    await saveWorkerPatch(
      {
        ...readAccountPayload(worker),
        active: false,
      },
      'Konto pracownika zostalo dezaktywowane.',
    )
  }

  async function saveSecurity() {
    if (!canResetWorkerPasswords()) {
      alert('Brak uprawnien do resetu hasla pracownika.')
      return
    }
    const worker = resolveCurrentWorker()
    if (!worker || !appState.session?.orgId) return
    const button = document.getElementById('waSaveSecurityBtn')
    const currentLogin = workerLogin(worker)
    const newPassword = String(document.getElementById('waNewPassword')?.value ?? '').trim()
    const repeatPassword = String(document.getElementById('waNewPassword2')?.value ?? '').trim()
    if (!newPassword && !repeatPassword) {
      showTransientNotice('Brak zmian w sekcji bezpieczenstwa.', 'info')
      exitEditMode('security')
      return true
    }
    if (newPassword !== repeatPassword) {
      alert('Hasla nie sa takie same.')
      return
    }
    if (newPassword.length < 6) {
      alert('Haslo musi miec co najmniej 6 znakow.')
      return
    }

    if (button) button.disabled = true
    try {
      await setWorkerPassword(appState.session.orgId, currentLogin, newPassword)
      setInputValue('waNewPassword', '')
      setInputValue('waNewPassword2', '')
      resetNewPasswordVisibility()
      showTransientNotice('Zapisano nowe haslo pracownika.', 'success')
      exitEditMode('security')
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'Nie udalo sie zapisac ustawien bezpieczenstwa.')
      showTransientNotice(message, 'error')
      return false
    } finally {
      syncEditModeControls(resolveCurrentWorker())
    }
  }

  async function saveRole() {
    if (!canAdministerWorkers()) {
      alert('Role moze zmienic tylko Admin.')
      return
    }
    const worker = resolveCurrentWorker()
    if (!worker) return
    const nextRole = isOwnerWorker(worker)
      ? 'OWNER'
      : String(document.getElementById('waRole')?.value ?? 'WORKER').trim()
    const nextWorkerType = workerTypeValue(document.getElementById('waWorkerType')?.value ?? worker)
    const updated = await saveWorkerPatch(
      {
        ...readAccountPayload(worker),
        role: nextRole,
        workerType: nextWorkerType,
      },
      'Zmiany zapisano.',
    )
    if (updated) exitEditMode('roles')
    return updated
  }

  function workerAccountCurrentUserName() {
    return String(appState.session?.name ?? appState.session?.login ?? appState.session?.email ?? '').trim()
  }

  function findWorkerAccountTimeRow(dayKey) {
    const key = String(dayKey ?? '').trim()
    if (!key) return null
    const rows = Array.isArray(appState.workerAccountTimeRows) ? appState.workerAccountTimeRows : []
    return rows.find((row) => String(row.dayKey ?? '').trim() === key) ?? null
  }

  function setWorkerAccountTimeCodesOpen(open) {
    const overlay = document.getElementById('waTimeCodesOverlay')
    if (!overlay) return
    overlay.hidden = !open
    overlay.style.display = open ? 'flex' : 'none'
  }

  function positionWorkerAccountTimeCodeTooltip(trigger) {
    if (!(trigger instanceof Element)) return
    const isZoneTooltip = trigger.classList.contains('wa-time-code-zone-wrap')
    const tooltip = trigger.querySelector(
      isZoneTooltip ? '.wa-time-code-zone-tooltip' : '.wa-time-code-gps-tooltip',
    )
    if (!tooltip) return

    tooltip.style.visibility = 'hidden'
    tooltip.style.left = '0px'
    tooltip.style.top = '0px'
    tooltip.classList.remove('is-above')

    const triggerRect = trigger.getBoundingClientRect()
    const tooltipRect = tooltip.getBoundingClientRect()
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight
    const viewportGap = 12
    const triggerGap = 10
    const tooltipWidth = tooltipRect.width || (isZoneTooltip ? 340 : 290)
    const tooltipHeight = tooltipRect.height || (isZoneTooltip ? 260 : 220)
    const maxLeft = Math.max(viewportGap, viewportWidth - tooltipWidth - viewportGap)
    const left = Math.min(
      Math.max(viewportGap, triggerRect.left + (triggerRect.width / 2) - (tooltipWidth / 2)),
      maxLeft,
    )
    const roomBelow = viewportHeight - triggerRect.bottom - viewportGap
    const showAbove = roomBelow < tooltipHeight + triggerGap && triggerRect.top > roomBelow
    const preferredTop = showAbove
      ? triggerRect.top - tooltipHeight - triggerGap
      : triggerRect.bottom + triggerGap
    const maxTop = Math.max(viewportGap, viewportHeight - tooltipHeight - viewportGap)
    const top = Math.min(Math.max(viewportGap, preferredTop), maxTop)
    const arrowLeft = Math.min(
      Math.max(12, triggerRect.left + (triggerRect.width / 2) - left - 5),
      Math.max(12, tooltipWidth - 22),
    )

    tooltip.style.left = `${Math.round(left)}px`
    tooltip.style.top = `${Math.round(top)}px`
    tooltip.style.setProperty(
      isZoneTooltip ? '--wa-time-code-zone-arrow-left' : '--wa-time-code-gps-arrow-left',
      `${Math.round(arrowLeft)}px`,
    )
    tooltip.classList.toggle('is-above', showAbove)
    tooltip.style.removeProperty('visibility')
  }

  function setWorkerAccountTimeCodeEditorOpen(open) {
    const editor = document.getElementById('waTimeCodeEditor')
    if (!editor) return
    editor.hidden = !open
  }

  function closeWorkerAccountTimeCodeEditor() {
    appState.workerAccountTimeCodeEditorItem = null
    setWorkerAccountTimeCodeEditorOpen(false)
    const saveButton = document.getElementById('waTimeCodeSave')
    if (saveButton) {
      saveButton.disabled = false
      saveButton.textContent = 'Zapisz godzinę'
    }
  }

  function closeWorkerAccountTimeCodes() {
    closeWorkerAccountTimeCodeEditor()
    setWorkerAccountTimeCodesOpen(false)
  }

  function openWorkerAccountTimeCodes(dayKey) {
    const row = findWorkerAccountTimeRow(dayKey)
    const intervals = workerAccountTimeIntervals(row)
    const codes = workIntervalCodes(intervals)
    if (!row || !codes.length) {
      showTransientNotice('Brak kodów START/STOP dla wybranego dnia.', 'error')
      return
    }

    closeWorkerAccountTimeCodeEditor()

    const dateLabel = dateKeyToLabel(row.dayKey)
    const title = document.getElementById('waTimeCodesTitle')
    const meta = document.getElementById('waTimeCodesMeta')
    const list = document.getElementById('waTimeCodesList')
    const total = document.getElementById('waTimeCodesTotal')
    if (title) title.textContent = `Start i stop - ${dateLabel}`
    if (meta) meta.textContent = `${workerAccountTimeCodeCountLabel(codes.length)} START/STOP`
    if (total) total.textContent = formatSeconds(workIntervalsTotalSeconds(intervals))
    if (list) {
      list.innerHTML = codes.map((code, index) => {
        const isStart = code.type === 'START'
        const typeClass = isStart ? 'is-start' : 'is-stop'
        const timeLabel = isoToHm(code.at)
        const clientLabel = workerAccountTimeIntervalClient(code.interval)
        return `
          <div class="wa-time-code-item ${typeClass}">
            <span class="wa-time-code-index" aria-hidden="true">${index + 1}</span>
            <span class="wa-time-code-marker" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="${isStart ? 'M7 12h10M13 8l4 4-4 4' : 'M17 12H7m4-4-4 4 4 4'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </span>
            <span class="wa-time-code-copy">
              <strong>${code.type}</strong>
              <small>Sesja ${code.session}</small>
              <span class="wa-time-code-location"><span><b>Klient:</b> ${escapeHtml(clientLabel)}</span><span><b>Strefa:</b> ${workerAccountTimeCodeZoneIndicator(code, index)}</span></span>
            </span>
            <span class="wa-time-code-controls">
              <time class="mono" datetime="${escapeHtml(code.at)}">${escapeHtml(timeLabel)}</time>
              ${workerAccountTimeCodeGpsIndicator(code)}
              ${workerAccountTimeCodeEditButton(code, index, row.dayKey)}
            </span>
          </div>
        `
      }).join('')
    }

    setWorkerAccountTimeCodesOpen(true)
    window.requestAnimationFrame(() => document.getElementById('waTimeCodesClose')?.focus?.())
  }

  function openWorkerAccountTimeCodeEditor(dayKey, codeIndex) {
    if (!canAdministerWorkers()) return
    const worker = resolveCurrentWorker()
    if (!worker || !guardWorkerAccountOwnTimeEdit(worker)) return

    const row = findWorkerAccountTimeRow(dayKey)
    const codes = workerAccountTimeCodes(row)
    const index = Number(codeIndex)
    const code = Number.isInteger(index) ? codes[index] : null
    const interval = code?.interval ?? null
    const workdayId = String(interval?.linkedWorkdayId ?? interval?.workdayId ?? interval?.id ?? '').trim()
    if (!row || !code || !interval || !workdayId) {
      showTransientNotice('Nie znaleziono zapisu, który można edytować.', 'error')
      return
    }

    appState.workerAccountTimeCodeEditorItem = {
      dayKey: String(row.dayKey ?? dayKey ?? '').trim(),
      code,
      interval,
      workdayId,
    }
    setText('waTimeCodeEditorTitle', `Edytuj ${code.type} - sesja ${code.session}`)
    setText(
      'waTimeCodeEditorContext',
      `${workerAccountTimeIntervalClient(interval)} / ${workerAccountTimeIntervalZone(interval)}`,
    )
    setInputValue('waTimeCodeTimeInput', isoToTimeInput(code.at))
    setWorkerAccountTimeCodeEditorOpen(true)
    window.requestAnimationFrame(() => document.getElementById('waTimeCodeTimeInput')?.focus?.())
  }

  async function saveWorkerAccountTimeCodeEditor() {
    const item = appState.workerAccountTimeCodeEditorItem
    const worker = resolveCurrentWorker()
    if (!item || !worker || !appState.session?.orgId) return
    if (!guardWorkerAccountOwnTimeEdit(worker)) return

    const timeValue = String(document.getElementById('waTimeCodeTimeInput')?.value ?? '').trim()
    const dateValue = isoToDateInput(item.code.at)
    const editedAt = localDateTimeToIso(dateValue, timeValue)
    if (!timeValue || !editedAt) {
      showTransientNotice('Podaj poprawną godzinę.', 'error')
      return
    }

    const interval = item.interval
    const originalStartAt = typeof toIso === 'function' ? toIso(interval.startAt) : String(interval.startAt ?? '')
    const originalEndAt = interval.isOpen
      ? ''
      : (typeof toIso === 'function' ? toIso(interval.endAt) : String(interval.endAt ?? ''))
    const startAt = item.code.type === 'START' ? editedAt : originalStartAt
    const endAt = item.code.type === 'STOP' ? editedAt : originalEndAt
    if (!startAt || (endAt && timeRangeSeconds(startAt, endAt) <= 0)) {
      showTransientNotice('Godzina STOP musi być późniejsza niż godzina START.', 'error')
      return
    }

    const durationSec = endAt ? timeRangeSeconds(startAt, endAt) : 0
    const eventId = String(interval.eventId ?? '').trim()
    const workdayId = String(item.workdayId ?? '').trim()
    const editorName = workerAccountCurrentUserName()
    const payload = {
      workdayId,
      linkedWorkdayId: String(interval.linkedWorkdayId ?? '').trim() || workdayId,
      zoneId: interval.zoneId ?? interval.utilityRoomId ?? interval.roomId ?? null,
      clientId: interval.clientId ?? null,
      workerLogin: String(interval.workerLogin ?? workerLogin(worker)).trim(),
      workerName: String(interval.workerName ?? workerName(worker) ?? workerLogin(worker)).trim(),
      startAt,
      endAt: endAt || null,
      durationSec,
      status: endAt ? 'CLOSED' : (String(interval.status ?? 'RUNNING').trim() || 'RUNNING'),
      closeMarkedAt: endAt
        ? (item.code.type === 'STOP' ? endAt : (interval.closeMarkedAt ?? endAt))
        : null,
      endReason: interval.endReason ?? null,
      comment: interval.comment ?? null,
      deviceId: interval.deviceId ?? null,
      startEventId: interval.startEventId ?? null,
      endEventId: interval.endEventId ?? null,
      updatedBy: editorName,
      editedBy: editorName,
    }

    const saveButton = document.getElementById('waTimeCodeSave')
    if (saveButton) {
      saveButton.disabled = true
      saveButton.textContent = 'Zapisywanie...'
    }

    try {
      let updated
      if (eventId && typeof updateEvent === 'function') {
        updated = await updateEvent(appState.session.orgId, eventId, payload)
      } else if (typeof updateWorkday === 'function') {
        updated = await updateWorkday(appState.session.orgId, workdayId, {
          workerLogin: payload.workerLogin,
          workerName: payload.workerName,
          utilityRoomId: payload.zoneId,
          startAt,
          endAt: endAt || null,
          durationSec,
          status: payload.status,
          comment: payload.comment,
          updatedBy: editorName,
        })
      } else {
        throw new Error('Brak funkcji zapisu czasu pracy.')
      }

      closeWorkerAccountTimeCodeEditor()
      notifyWorkerAccountWorkdayChanged([updated ?? { workdayId, startAt, endAt }], worker)
      const refreshed = await loadWorkerAccountTime(worker, {
        force: true,
        range: buildTimeFetchRange(),
        allowBroadFallback: true,
      })
      if (refreshed) openWorkerAccountTimeCodes(item.dayKey)
      else closeWorkerAccountTimeCodes()
      showTransientNotice(`Zapisano godzinę ${item.code.type}.`, 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'Nie udało się zapisać godziny.')
      showTransientNotice(message, 'error')
    } finally {
      if (saveButton) {
        saveButton.disabled = false
        saveButton.textContent = 'Zapisz godzinę'
      }
    }
  }

  function setWorkerAccountDayEditorOpen(open) {
    const overlay = document.getElementById('waDayEditorOverlay')
    if (!overlay) return
    overlay.hidden = !open
    overlay.style.display = open ? 'flex' : 'none'
  }

  function updateWorkerAccountDayPreview() {
    const dateValue = String(document.getElementById('waDayDateInput')?.value ?? '').trim()
    const startValue = String(document.getElementById('waDayStartTime')?.value ?? '').trim()
    const endValue = String(document.getElementById('waDayEndTime')?.value ?? '').trim()
    const workInput = document.getElementById('waDayWork')
    const startAt = localDateTimeToIso(dateValue, startValue)
    const endAt = localDateTimeToIso(dateValue, endValue)
    const durationSec = startAt && endAt ? timeRangeSeconds(startAt, endAt) : 0
    if (workInput) workInput.value = durationSec > 0 ? formatEventDuration(durationSec) : '00:00'
    return { dateValue, startValue, endValue, startAt, endAt, durationSec }
  }

  function closeWorkerAccountDayEditor() {
    appState.workerAccountDayEditorItem = null
    setWorkerAccountDayEditorOpen(false)
    const saveButton = document.getElementById('waDaySaveBtn')
    if (saveButton) {
      saveButton.disabled = false
      saveButton.textContent = 'Zapisz'
    }
  }

  function openWorkerAccountDayEditor(dayKey, options = {}) {
    if (!canAdministerWorkers()) return
    const worker = resolveCurrentWorker()
    if (!worker) return
    if (!guardWorkerAccountOwnTimeEdit(worker)) return
    const item = findWorkerAccountTimeRow(dayKey)
    const requestedWorkdayId = String(options?.workdayId ?? '').trim()
    const sourceRows = timeEditorSourceRows(item, requestedWorkdayId)
    if (!item || !sourceRows.length) {
      showTransientNotice('Nie znaleziono rekordow Workday dla tego dnia.', 'error')
      return
    }

    const editorItem = requestedWorkdayId
      ? aggregateTimeRows(sourceRows, worker)[0] ?? item
      : item
    appState.workerAccountDayEditorItem = {
      ...editorItem,
      mode: 'edit',
      requestedWorkdayId,
      sourceRows,
    }
    setInputValue('waDayDateInput', isoToDateInput(editorItem.dayKey || editorItem.startAt || editorItem.endAt))
    setInputValue('waDayStartTime', isoToTimeInput(editorItem.startAt) || '00:00')
    setInputValue('waDayEndTime', isoToTimeInput(editorItem.endAt))
    setInputValue('waDayComment', editorItem.comment || '')
    updateWorkerAccountDayPreview()
    setWorkerAccountDayEditorOpen(true)
    setTimeout(() => document.getElementById('waDayDateInput')?.focus?.(), 0)
  }

  function maybeOpenWorkerAccountPendingTimeEditor() {
    const intent = normalizeWorkerAccountTimeEditorIntent(appState.workerAccountPendingTimeEditor)
    if (!intent || appState.workerAccountActiveTab !== 'time') return false

    const rows = Array.isArray(appState.workerAccountTimeRows) ? appState.workerAccountTimeRows : []
    const item = findPendingTimeEditorItem(rows, intent)

    appState.workerAccountPendingTimeEditor = null
    if (!item) {
      showTransientNotice('Nie znaleziono dnia pracy do ręcznej korekty.', 'error')
      return false
    }

    openWorkerAccountDayEditor(item.dayKey, { workdayId: intent.workdayId })
    return true
  }

  function workerAccountWorkdayId(row = {}) {
    return String(row?.workdayId ?? row?.id ?? '').trim()
  }

  function workerAccountUpdatedWorkdayRow(source = {}, updated = {}, worker = {}) {
    const startAt = typeof toIso === 'function'
      ? toIso(updated?.startAt ?? source?.startAt ?? source?.dayStartAt ?? source?.startIso)
      : String(updated?.startAt ?? source?.startAt ?? source?.dayStartAt ?? source?.startIso ?? '')
    const endAt = typeof toIso === 'function'
      ? toIso(updated?.endAt ?? source?.endAt ?? source?.dayEndAt ?? source?.endIso ?? source?.stopAt)
      : String(updated?.endAt ?? source?.endAt ?? source?.dayEndAt ?? source?.endIso ?? source?.stopAt ?? '')
    const dayKey = dayKeyFromValue(updated?.dayKey || updated?.dateYmd || updated?.date || startAt || endAt || source?.dayKey || source?.dateYmd || source?.date)
    const workdayId = String(updated?.workdayId ?? source?.workdayId ?? source?.id ?? '').trim()
    const durationSec = Math.max(
      0,
      Number(updated?.durationSec ?? updated?.durationSeconds ?? source?.durationSec ?? source?.durationSeconds ?? timeRangeSeconds(startAt, endAt)) || 0,
    )
    const updatedBy = String(updated?.editedBy ?? updated?.updatedBy ?? source?.editedBy ?? source?.updatedBy ?? workerAccountCurrentUserName()).trim()
    return stampWorkerIdentity({
      ...source,
      ...updated,
      id: String(source?.id ?? updated?.id ?? workdayId).trim(),
      workdayId,
      dayKey,
      dateYmd: dayKey,
      date: dayKey,
      startAt,
      dayStartAt: startAt,
      startIso: startAt,
      endAt,
      dayEndAt: endAt,
      endIso: endAt,
      durationSec,
      durationSeconds: durationSec,
      status: String(updated?.status ?? source?.status ?? 'CLOSED').trim() || 'CLOSED',
      comment: String(updated?.comment ?? source?.comment ?? '').trim(),
      editedBy: updatedBy,
      updatedBy,
      updatedAt: new Date().toISOString(),
      workerType: String(source?.workerType ?? source?.type ?? roleLabel(workerRole(worker)) ?? '').trim(),
    }, worker)
  }

  function applyWorkerAccountLocalWorkdayUpdates(updatedRows = [], worker = resolveCurrentWorker()) {
    const cleanUpdates = (Array.isArray(updatedRows) ? updatedRows : []).filter((row) => row && typeof row === 'object')
    if (!cleanUpdates.length || !worker) return false

    const baseRows = Array.isArray(appState.workerAccountAllTimeRows) && appState.workerAccountAllTimeRows.length
      ? appState.workerAccountAllTimeRows
      : (Array.isArray(appState.workerAccountTimeRows) ? appState.workerAccountTimeRows : [])
        .flatMap((row) => (Array.isArray(row?.sourceRows) ? row.sourceRows : []))

    const updatesById = new Map()
    cleanUpdates.forEach((row) => {
      const id = workerAccountWorkdayId(row)
      if (id) updatesById.set(id, row)
    })

    const appliedIds = new Set()
    const nextRows = baseRows.map((row) => {
      const id = workerAccountWorkdayId(row)
      if (id && updatesById.has(id)) {
        appliedIds.add(id)
        return updatesById.get(id)
      }
      return row
    })

    cleanUpdates.forEach((row) => {
      const id = workerAccountWorkdayId(row)
      if (id && appliedIds.has(id)) return
      nextRows.push(row)
    })

    const range = buildTimeFetchRange()
    const filteredRows = filterTimeRowsForRange(sortRowsByLatest(nextRows), { from: range.from, to: range.to })
    appState.workerAccountAllTimeRows = filteredRows
    appState.workerAccountTimeRows = aggregateTimeRows(filteredRows, worker)
    appState.workerAccountTimeSelectedKeys = new Set()
    appState.workerAccountTimeCurrentPageKeys = []
    appState.workerAccountTimePage = 1
    appState.workerAccountTimeLoadedKey = ''
    appState.workerAccountTimeLoadingKey = ''
    setTimeMonthCard(appState.workerAccountTimeRows)
    renderTimeTable()
    renderWorkerAccountSummaryFromState()
    return true
  }

  async function saveWorkerAccountDayEditor() {
    const item = appState.workerAccountDayEditorItem
    const worker = resolveCurrentWorker()
    if (!item || !worker || !appState.session?.orgId) {
      showTransientNotice('Brak aktywnego dnia pracy do zapisania.', 'error')
      return
    }
    if (!guardWorkerAccountOwnTimeEdit(worker)) return
    if (typeof updateWorkday !== 'function') {
      showTransientNotice('Brak funkcji zapisu Workday w kontekscie portalu.', 'error')
      return
    }

    const sourceRows = Array.isArray(item.sourceRows) ? item.sourceRows : []
    if (!sourceRows.length) {
      showTransientNotice('Nie znaleziono rekordow Workday do aktualizacji.', 'error')
      return
    }

    const rowsWithIds = sourceRows.map((source) => ({
      source,
      workdayId: String(source?.workdayId ?? source?.id ?? '').trim(),
    }))
    if (rowsWithIds.some((entry) => !entry.workdayId)) {
      showTransientNotice('Nie znaleziono poprawnego WorkdayID do aktualizacji.', 'error')
      return
    }

    const { dateValue, startAt, endAt, durationSec } = updateWorkerAccountDayPreview()
    if (!dateValue || !startAt || !endAt) {
      showTransientNotice('Uzupelnij date oraz godzine startu i konca pracy.', 'error')
      return
    }
    if (durationSec <= 0) {
      showTransientNotice('Koniec pracy musi byc pozniejszy niz start pracy.', 'error')
      return
    }
    if (durationSec > 24 * 60 * 60) {
      showTransientNotice('Zakres dnia pracy nie moze przekraczac 24 godzin.', 'error')
      return
    }

    const comment = String(document.getElementById('waDayComment')?.value ?? '').trim()
    const saveButton = document.getElementById('waDaySaveBtn')
    if (saveButton) {
      saveButton.disabled = true
      saveButton.textContent = 'Zapisywanie...'
    }

    try {
      const editorName = workerAccountCurrentUserName()
      const updatedRows = []
      for (const { source, workdayId } of rowsWithIds) {
        const updated = await updateWorkday(appState.session.orgId, workdayId, {
          workerLogin: workerLogin(worker),
          workerName: workerName(worker) || workerLogin(worker),
          utilityRoomId: source.utilityRoomId || source.roomId || null,
          startAt,
          endAt,
          durationSec,
          status: 'CLOSED',
          comment,
          updatedBy: editorName,
        })
        updatedRows.push(workerAccountUpdatedWorkdayRow(source, updated, worker))
      }
      closeWorkerAccountDayEditor()
      applyWorkerAccountLocalWorkdayUpdates(updatedRows, worker)
      notifyWorkerAccountWorkdayChanged(updatedRows, worker)
      showTransientNotice('Zapisano dzien pracy. Widok zaktualizowany.', 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? 'Nie udalo sie zapisac dnia pracy.')
      showTransientNotice(message, 'error')
    } finally {
      if (saveButton) {
        saveButton.disabled = false
        saveButton.textContent = 'Zapisz'
      }
    }
  }

  function startWorkerAccountSectionLoads(worker, sessionContext, options = {}) {
    const accountKey = String(sessionContext?.accountKey ?? workerAccountKey(worker)).trim()
    const requestSeq = Number(sessionContext?.requestSeq ?? appState.workerAccountRequestSeq ?? 0)
    const baseContext = { accountKey, requestSeq }
    if (!accountKey || !isWorkerAccountLoadContextCurrent(baseContext)) return

    const activeTab = WORKER_ACCOUNT_TABS.has(options.tab) ? options.tab : appState.workerAccountActiveTab
    const range = options.range ?? buildTimeFetchRange()
    const timeLoadKey = workerAccountSectionLoadKey({
      accountKey,
      rangeKey: workerAccountTimeRangeKey(range),
    })

    if (
      appState.workerAccountSummaryLoadedKey !== accountKey &&
      appState.workerAccountSummaryLoadingKey !== accountKey
    ) {
      void loadWorkerAccountSummary(worker, baseContext)
    } else {
      renderWorkerAccountSummaryFromState()
    }

    if (appState.workerAccountTimeLoadedKey === timeLoadKey && options.forceTime !== true) {
      if (activeTab === 'time') {
        setTimeMonthCard(appState.workerAccountTimeRows)
        renderTimeTable()
        maybeOpenWorkerAccountPendingTimeEditor()
      }
      renderWorkerAccountSummaryFromState()
    } else if (appState.workerAccountTimeLoadingKey !== timeLoadKey) {
      void loadWorkerAccountTime(worker, {
        ...baseContext,
        range,
        force: options.forceTime === true,
      })
    }

    if (activeTab === 'account' || activeTab === 'activity') {
      if (appState.workerAccountActivityLoadedKey === accountKey && options.forceActivity !== true) {
        if (activeTab === 'activity') renderEventsTable()
        renderRecentActivityPreview()
        renderWorkerAccountSummaryFromState()
      } else if (appState.workerAccountActivityLoadingKey !== accountKey) {
        void loadWorkerAccountEvents(worker, {
          ...baseContext,
          force: options.forceActivity === true,
        })
      }
    }

    if (activeTab === 'orders') {
      if (appState.workerAccountOrdersLoadedKey === accountKey && options.forceOrders !== true) {
        renderOrdersTable()
      } else if (appState.workerAccountOrdersLoadingKey !== accountKey) {
        void loadWorkerAccountOrders(worker, {
          ...baseContext,
          force: options.forceOrders === true,
          refreshRemote: true,
        })
      }
    }
  }

  function renderWorkerAccountForWorker(worker, options = {}) {
    if (!worker) return null
    const timeEditorIntent = normalizeWorkerAccountTimeEditorIntent(options.timeEditorIntent ?? appState.workerAccountPendingTimeEditor)
    updateCurrentWorker(worker)
    const accountKey = workerAccountKey(worker)
    const canReuseSession = Boolean(
      accountKey &&
      appState.workerAccountCurrentKey === accountKey &&
      Number(appState.workerAccountRequestSeq ?? 0) > 0 &&
      options.forceSession !== true,
    )
    const sessionContext = canReuseSession
      ? {
          accountKey,
          requestSeq: Number(appState.workerAccountRequestSeq ?? 0),
        }
      : beginWorkerAccountSession(worker)

    setShellVisible(true)
    renderWorkerCard(worker)
    renderForms(worker)
    initializeTimeFilters()
    if (timeEditorIntent) {
      appState.workerAccountPendingTimeEditor = timeEditorIntent
      appState.workerAccountActiveTab = 'time'
      applyWorkerAccountTimeEditorRange(timeEditorIntent)
    }
    activateTab(appState.workerAccountActiveTab, { refresh: false })
    startWorkerAccountSectionLoads(worker, sessionContext, {
      ...options,
      tab: appState.workerAccountActiveTab,
      range: timeEditorIntent ? buildTimeFetchRange() : options.range,
      forceTime: options.forceTime === true || Boolean(timeEditorIntent),
    })
    return sessionContext
  }

  async function fetchWorkerAccountForCurrentSession(force = false) {
    if (!appState.session?.orgId) {
      appState.workerAccountCurrentKey = ''
      appState.workerAccountRequestSeq = Number(appState.workerAccountRequestSeq ?? 0) + 1
      resetWorkerAccountRuntimeState({ clearLoadingKeys: true })
      setShellVisible(false)
      return
    }

    let worker = resolveCurrentWorker()
    if (force || !worker) {
      const rows = await getWorkers(appState.session.orgId, force ? { force: true, fetchPolicy: 'SERVER_ONLY' } : {}).catch(() => [])
      if (Array.isArray(rows) && rows.length) {
        appState.workers = rows
        appState.workersLoaded = true
        worker = resolveCurrentWorker()
      }
    }

    if (!worker) {
      appState.workerAccountCurrentKey = ''
      appState.workerAccountRequestSeq = Number(appState.workerAccountRequestSeq ?? 0) + 1
      resetWorkerAccountRuntimeState({ clearLoadingKeys: true })
      setShellVisible(false)
      return
    }

    renderWorkerAccountForWorker(worker, { forceSession: force })
  }

  function bindWorkerAccountViewFunctions(router) {
    const binding = createBindingHelpers()
    binding.add(window, 'worker-account-select', (event) => {
      const worker = event?.detail?.worker
      if (!worker) return
      appState.workerAccountActiveTab = String(event?.detail?.tab ?? 'account').trim() || 'account'
      const timeEditorIntent = normalizeWorkerAccountTimeEditorIntent(event?.detail?.timeEditorIntent)
      if (timeEditorIntent) {
        appState.workerAccountPendingTimeEditor = timeEditorIntent
        appState.workerAccountActiveTab = 'time'
      }
      renderWorkerAccountForWorker(worker, { forceSession: true, timeEditorIntent })
    })
    binding.add(document.getElementById('waBackBtn'), 'click', () => router?.go?.('workerProfile'))
    binding.add(document.getElementById('waEmptyBackBtn'), 'click', () => router?.go?.('workerProfile'))
    binding.add(document.querySelector('#view-workerAccount .worker-account-tabs'), 'click', (event) => {
      const button = event.target?.closest?.('[data-wa-tab]')
      if (!button) return
      activateTab(button.getAttribute('data-wa-tab'))
    })
    binding.add(document.getElementById('waEditAccountBtn'), 'click', () => enterEditMode('account'))
    binding.add(document.getElementById('waEditSecurityBtn'), 'click', () => enterEditMode('security'))
    binding.add(document.getElementById('waEditRolesBtn'), 'click', () => enterEditMode('roles'))
    binding.add(document.getElementById('waCancelAccountBtn'), 'click', () => cancelEditMode('account'))
    binding.add(document.getElementById('waCancelSecurityBtn'), 'click', () => cancelEditMode('security'))
    binding.add(document.getElementById('waCancelRoleBtn'), 'click', () => cancelEditMode('roles'))
    binding.add(document.getElementById('waSaveAccountBtn'), 'click', () => {
      void saveAccount()
    })
    binding.add(document.getElementById('waSaveSecurityBtn'), 'click', () => {
      void saveSecurity()
    })
    binding.add(document.getElementById('waSaveRoleBtn'), 'click', () => {
      void saveRole()
    })
    binding.add(document.getElementById('waPhotoQuickBtn'), 'click', () => {
      if (!canManageWorkers()) {
        showTransientNotice('Brak uprawnien do zmiany zdjecia.', 'warning')
        return
      }
      activateTab('account')
      enterEditMode('account')
      const input = document.getElementById('waPhotoInput')
      if (input instanceof HTMLInputElement && !input.disabled) {
        input.value = ''
        input.click()
      }
    })
    binding.add(document.getElementById('waSelectPhotoBtn'), 'click', () => {
      const input = document.getElementById('waPhotoInput')
      if (!(input instanceof HTMLInputElement) || input.disabled) return
      input.value = ''
      input.click()
    })
    binding.add(document.getElementById('waPhotoInput'), 'change', (event) => {
      const input = event.currentTarget
      const file = input instanceof HTMLInputElement ? input.files?.[0] : null
      if (!file) return
      void compressWorkerProfilePhoto(file)
        .then((photoDataUrl) => {
          setWorkerAccountPhotoState({ photoDataUrl, removePhoto: false })
        })
        .catch((error) => {
          console.error('[worker-account] profile photo preparation failed', error)
          showTransientNotice(error?.message || 'Nie udalo sie przygotowac zdjecia.', 'error')
          if (input instanceof HTMLInputElement) input.value = ''
        })
    })
    binding.add(document.getElementById('waRemovePhotoBtn'), 'click', () => {
      if (!isEditingTab('account') || !canManageWorkers()) return
      setWorkerAccountPhotoState({ removePhoto: true })
      const input = document.getElementById('waPhotoInput')
      if (input instanceof HTMLInputElement) input.value = ''
    })
    binding.add(document.getElementById('waRole'), 'change', (event) => {
      const role = roleValue(event.currentTarget?.value)
      if (event.currentTarget) event.currentTarget.title = WORKER_ROLE_COPY[role]?.description ?? ''
      renderRolePreview({ ...(resolveCurrentWorker() ?? {}), role })
    })
    binding.add(document.getElementById('waTopDeactivateBtn'), 'click', () => {
      void deactivateWorkerAccount()
    })
    binding.add(document.getElementById('waNewPasswordEyeBtn'), 'click', () => {
      togglePasswordField('waNewPassword', 'waNewPasswordEyeBtn')
    })
    binding.add(document.getElementById('waNewPassword2EyeBtn'), 'click', () => {
      togglePasswordField('waNewPassword2', 'waNewPassword2EyeBtn')
    })
    binding.add(document.getElementById('waTrainingToggle'), 'click', toggleTrainingDropdown)
    binding.add(document.getElementById('waTrainingMenu'), 'change', (event) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target?.matches?.('[data-wa-training-option]')) return
      const values = selectedTrainingValues()
      updateTrainingToggleLabel(values)
      renderTrainingPreview(values)
      const option = target.closest('.worker-account-training-option')
      if (option) option.setAttribute('aria-selected', target.checked ? 'true' : 'false')
    })
    binding.add(document, 'click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target || target.closest('#waTrainingField')) return
      setTrainingDropdownOpen(false)
    })
    binding.add(document, 'keydown', (event) => {
      if (event.key !== 'Escape') return
      const timeCodesOverlay = document.getElementById('waTimeCodesOverlay')
      if (timeCodesOverlay && !timeCodesOverlay.hidden) {
        const timeCodeEditor = document.getElementById('waTimeCodeEditor')
        if (timeCodeEditor && !timeCodeEditor.hidden) {
          closeWorkerAccountTimeCodeEditor()
          return
        }
        closeWorkerAccountTimeCodes()
        return
      }
      const dayOverlay = document.getElementById('waDayEditorOverlay')
      if (dayOverlay && !dayOverlay.hidden) {
        closeWorkerAccountDayEditor()
        return
      }
      setTrainingDropdownOpen(false)
    })
    binding.add(document.getElementById('waRefreshTimeBtn'), 'click', () => {
      void refreshTimeTab()
    })
    binding.add(document.getElementById('waApplyTimeBtn'), 'click', () => {
      appState.workerAccountTimePage = 1
      void refreshTimeTab()
    })
    binding.add(document.getElementById('waDownloadTimeBtn'), 'click', openTimeEvidenceExportModal)
    binding.add(document.getElementById('waExportCloseBtn'), 'click', closeTimeEvidenceExportModal)
    binding.add(document.getElementById('waExportCancelBtn'), 'click', closeTimeEvidenceExportModal)
    binding.add(document.getElementById('waExportPreviewBtn'), 'click', () => {
      void renderTimeEvidencePreview()
    })
    binding.add(document.getElementById('waExportCsvBtn'), 'click', () => {
      void downloadTimeEvidence('csv')
    })
    binding.add(document.getElementById('waExportPdfBtn'), 'click', () => {
      void downloadTimeEvidence('pdf')
    })
    binding.add(document.getElementById('waExportOverlay'), 'click', (event) => {
      if (event.target === event.currentTarget) closeTimeEvidenceExportModal()
    })
    binding.add(document.getElementById('waExportOverlay'), 'change', (event) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target?.matches?.('[data-wa-export-col], input[name="waExportOrientation"], #waExportFrom, #waExportTo')) return
      setTimeEvidencePreviewPlaceholder('Zmieniono ustawienia. Kliknij "Podgląd pliku", aby odswiezyc podglad PDF.')
    })
    binding.add(document.getElementById('waDayEditorOverlay'), 'click', (event) => {
      if (event.target === event.currentTarget) closeWorkerAccountDayEditor()
    })
    binding.add(document.getElementById('waDayEditorClose'), 'click', closeWorkerAccountDayEditor)
    binding.add(document.getElementById('waDayCancelBtn'), 'click', closeWorkerAccountDayEditor)
    binding.add(document.getElementById('waDaySaveBtn'), 'click', () => {
      void saveWorkerAccountDayEditor()
    })
    binding.add(document.getElementById('waTimeCodesOverlay'), 'click', (event) => {
      if (event.target === event.currentTarget) closeWorkerAccountTimeCodes()
    })
    binding.add(document.getElementById('waTimeCodesClose'), 'click', closeWorkerAccountTimeCodes)
    binding.add(document.getElementById('waTimeCodesDone'), 'click', closeWorkerAccountTimeCodes)
    binding.add(document.getElementById('waTimeCodeCancel'), 'click', closeWorkerAccountTimeCodeEditor)
    binding.add(document.getElementById('waTimeCodeSave'), 'click', () => {
      void saveWorkerAccountTimeCodeEditor()
    })
    binding.add(document.getElementById('waTimeCodeTimeInput'), 'keydown', (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      void saveWorkerAccountTimeCodeEditor()
    })
    binding.add(document.getElementById('waTimeCodesList'), 'click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      const editButton = target?.closest('[data-wa-time-code-edit]')
      if (!editButton) return
      openWorkerAccountTimeCodeEditor(
        editButton.getAttribute('data-wa-time-code-day'),
        editButton.getAttribute('data-wa-time-code-edit'),
      )
    })
    binding.add(document.getElementById('waTimeCodesList'), 'pointerover', (event) => {
      const target = event.target instanceof Element ? event.target : null
      const trigger = target?.closest('.wa-time-code-gps-wrap, .wa-time-code-zone-wrap')
      if (!trigger || trigger.contains(event.relatedTarget)) return
      positionWorkerAccountTimeCodeTooltip(trigger)
    })
    binding.add(document.getElementById('waTimeCodesList'), 'focusin', (event) => {
      const target = event.target instanceof Element ? event.target : null
      const trigger = target?.closest('.wa-time-code-gps-wrap, .wa-time-code-zone-wrap')
      if (trigger) positionWorkerAccountTimeCodeTooltip(trigger)
    })
    ;['waDayDateInput', 'waDayStartTime', 'waDayEndTime'].forEach((id) => {
      binding.add(document.getElementById(id), 'input', updateWorkerAccountDayPreview)
      binding.add(document.getElementById(id), 'change', updateWorkerAccountDayPreview)
    })
    binding.add(document.getElementById('waTimeMonthPick'), 'change', (event) => {
      applyTimeMonthPick(event.target?.value)
      appState.workerAccountTimePage = 1
      void refreshTimeTab()
    })
    binding.add(document.getElementById('waTimeSelectAll'), 'change', (event) => {
      setTimeRowsSelected(Boolean(event.target?.checked))
      renderTimeTable()
    })
    binding.add(document.getElementById('waShell'), 'click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      const button = target?.closest('[data-wa-tab-shortcut]')
      if (!button || button.disabled) return
      activateTab(button.getAttribute('data-wa-tab-shortcut'))
    })
    binding.add(document.getElementById('waEventRows'), 'click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      const commentButton = target?.closest('[data-wa-event-comment]')
      if (commentButton) {
        const index = Number(commentButton.getAttribute('data-wa-event-comment'))
        const row = Number.isInteger(index) ? appState.workerAccountEventsRows[index] : null
        const comment = eventCommentText(row)
        alert(comment || 'Brak komentarza dla tego zdarzenia.')
        return
      }
      const button = target?.closest('[data-wa-event-edit]')
      if (!button || !canAdministerWorkers()) return
      const index = Number(button.getAttribute('data-wa-event-edit'))
      const row = Number.isInteger(index) ? appState.workerAccountEventsRows[index] : null
      if (row && typeof openEventEditor === 'function') {
        void openEventEditor(row)
      }
    })
    binding.add(document.getElementById('waTimeRows'), 'change', (event) => {
      const checkbox = event.target?.closest?.('[data-wa-time-select]')
      if (!(checkbox instanceof HTMLInputElement)) return
      ensureTimeSelectionState()
      const key = String(checkbox.getAttribute('data-wa-time-select') ?? '').trim()
      if (!key) return
      if (checkbox.checked) appState.workerAccountTimeSelectedKeys.add(key)
      else appState.workerAccountTimeSelectedKeys.delete(key)
      syncTimeSelectionUi()
    })
    binding.add(document.getElementById('waTimeRows'), 'click', (event) => {
      const target = event.target instanceof Element ? event.target : null
      const codesButton = target?.closest('[data-wa-time-codes]')
      if (codesButton) {
        openWorkerAccountTimeCodes(codesButton.getAttribute('data-wa-time-codes'))
      }
    })
    ;[
      ['waEventsPageSize', 'Events'],
      ['waOrdersPageSize', 'Orders'],
    ].forEach(([id, kind]) => {
      binding.add(document.getElementById(id), 'change', (event) => {
        const nextSize = Number(event.target?.value)
        appState[`workerAccount${kind}PageSize`] = WORKER_ACCOUNT_PAGE_SIZES.includes(nextSize) ? nextSize : 5
        appState[`workerAccount${kind}Page`] = 1
        renderAllTables()
      })
    })
    ;[
      ['waEventsPrev', 'Events', -1],
      ['waEventsNext', 'Events', 1],
      ['waOrdersPrev', 'Orders', -1],
      ['waOrdersNext', 'Orders', 1],
      ['waTimePrev', 'Time', -1],
      ['waTimeNext', 'Time', 1],
    ].forEach(([id, kind, delta]) => {
      binding.add(document.getElementById(id), 'click', () => {
        appState[`workerAccount${kind}Page`] = Math.max(1, Number(appState[`workerAccount${kind}Page`] ?? 1) + delta)
        renderAllTables()
      })
    })
    ;['waTimeFrom', 'waTimeTo'].forEach((id) => {
      binding.add(document.getElementById(id), 'keydown', (event) => {
        if (event.key !== 'Enter') return
        appState.workerAccountTimePage = 1
        void refreshTimeTab()
      })
    })

    return () => binding.done()
  }

  return {
    fetch: fetchWorkerAccountForCurrentSession,
    bind: bindWorkerAccountViewFunctions,
    activateTab,
    refreshTimeAfterWorkdayChange,
  }
}
