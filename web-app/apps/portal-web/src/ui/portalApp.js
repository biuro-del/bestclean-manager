import { ensureSessionContext, login, logout, getSession, requireAuth } from '../auth/authService'
import { getDataSourceLabel } from '../firebase/firebaseClient'
import { createClient, deleteClient, getClients, updateClient } from '../services/clientService'
import {
  createIndividualOrder,
  deleteIndividualOrder,
  getIndividualOrders,
  updateIndividualOrder,
} from '../services/individualOrderService'
import { createWorker, getWorkers } from '../services/workerService'
import { createZone, deleteZone, getZones, updateZone } from '../services/zoneService'
import {
  createEvent,
  createWorkday,
  deleteEvent,
  deleteWorkday,
  getDashboardSummary,
  getTodayActiveWorkers,
  getWorkdays,
  getWorkerTime,
  updateEvent,
  updateWorkday,
} from '../services/workdayService'
import { portalLayoutTemplate } from './layoutTemplate'
import { createRouter } from './router'
import { viewTemplates } from './viewTemplates'

const appState = {
  session: null,
  clients: [],
  clientsLoaded: false,
  clientsPage: 1,
  clientsPageSize: 50,
  clientsTotal: 0,
  clientsTotalPages: 1,
  clientModalMode: 'add',
  clientModalClientId: '',
  zones: [],
  zonesLoaded: false,
  zonesPage: 1,
  zonesPageSize: 50,
  zonesTotal: 0,
  zonesTotalPages: 1,
  workers: [],
  workersLoaded: false,
  workersPage: 1,
  workersPageSize: 50,
  workersTotal: 0,
  workersTotalPages: 1,
  eventsPage: 1,
  eventsPageSize: 50,
  eventsTotal: 0,
  eventsTotalPages: 1,
  eventRows: [],
  workerDetailPage: 1,
  workerDetailPageSize: 50,
  workerDetailRows: [],
  workerDetailSourceRows: [],
  workerDetailViewRows: [],
  workerDetailDayEditorItem: null,
  workerDetailAckMap: {},
  workerProfilePage: 1,
  workerProfilePageSize: 50,
  workerProfileTotal: 0,
  workerProfileTotalPages: 1,
  selectedWorkerLogin: '',
  selectedWorkerName: '',
  zoneModalMode: 'add',
  zoneModalZoneId: '',
  eventEditorMode: 'add',
  eventEditorItem: null,
  workerProfileRows: [],
  workerProfileViewRows: [],
  workerProfileModalMode: 'view',
  workerProfileCurrent: null,
  individualOrdersRows: [],
  individualOrdersPage: 1,
  individualOrdersPageSize: 200,
  individualOrdersTotal: 0,
  individualOrdersTotalPages: 1,
  individualOrderModalMode: 'add',
  individualOrderCurrentId: '',
  individualOrderQrCurrent: '',
  clientProfileRows: [],
  clientProfileCurrent: null,
  clientProfileEditMode: false,
  reportLastCsv: '',
  reportHistoryTab: 'objects',
  reportHistoryRows: [],
  reportHistoryExpanded: {},
  reportHistoryClientOptions: [],
  reportHistoryWorkerOptions: [],
  reportHistoryZoneOptions: [],
  currentRoute: '',
}
let portalNoticeTimer = null
let dashboardRefreshTimer = null
let reportGeoPreviewHideTimer = null
const reportGeoModalState = {
  lat: '',
  lon: '',
  zoom: 18,
}
const DASHBOARD_REFRESH_INTERVAL_MS = 15 * 60 * 1000

function showTransientNotice(message, type = 'success') {
  const text = String(message ?? '').trim()
  if (!text) {
    return
  }

  let notice = document.getElementById('portalNotice')
  if (!notice) {
    notice = document.createElement('div')
    notice.id = 'portalNotice'
    notice.className = 'portal-notice'
    document.body.appendChild(notice)
  }

  notice.textContent = text
  notice.className = `portal-notice show ${type === 'error' ? 'error' : 'success'}`

  if (portalNoticeTimer) {
    window.clearTimeout(portalNoticeTimer)
  }

  portalNoticeTimer = window.setTimeout(() => {
    notice?.classList.remove('show')
  }, 3000)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function toIso(value) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return ''
  }

  const date = new Date(raw)
  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  return date.toISOString()
}

function isoToLocalDateTimeInput(value) {
  const iso = toIso(value)
  if (!iso) {
    return ''
  }

  const date = new Date(iso)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function localDateTimeInputToIso(value) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return ''
  }

  const date = new Date(raw)
  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  return date.toISOString()
}

function formatDatePl(isoValue) {
  const iso = toIso(isoValue)
  if (!iso) {
    return '-'
  }

  const date = new Date(iso)
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`
}

function formatTime(value) {
  const iso = toIso(value)
  if (!iso) {
    return '-'
  }

  const date = new Date(iso)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

function todayYmd() {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

function firstDayOfCurrentMonthYmd() {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`
}

function daysAgoYmd(days) {
  const offset = Number(days)
  const normalized = Number.isFinite(offset) ? Math.max(0, Math.floor(offset)) : 0
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - normalized)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function ymdToIsoRangeStart(ymd) {
  const value = String(ymd ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return ''
  }

  return `${value}T00:00:00.000Z`
}

function ymdToIsoRangeEnd(ymd) {
  const value = String(ymd ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return ''
  }

  return `${value}T23:59:59.999Z`
}

function normalizeClientStatus(status) {
  const value = String(status ?? '').trim().toLowerCase()

  if (value === 'active' || value === 'aktywny') {
    return 'Aktywny'
  }

  if (value === 'inactive' || value === 'nieaktywny') {
    return 'Nieaktywny'
  }

  return 'Aktywny'
}

function statusBadgeClass(statusLabel) {
  return statusLabel === 'Aktywny' ? 'badge badge-active' : 'badge badge-inactive'
}

function roleLevel(role) {
  const normalized = String(role ?? '')
    .trim()
    .toLowerCase()

  if (normalized === 'admin') {
    return 3
  }

  if (normalized === 'kierownik' || normalized === 'manager') {
    return 2
  }

  if (normalized === 'pracownik' || normalized === 'worker') {
    return 1
  }

  return 0
}

function canManageWorkers() {
  return roleLevel(appState.session?.role) >= 2
}

function canDeleteWorkers() {
  return roleLevel(appState.session?.role) >= 3
}

function canManageClients() {
  return roleLevel(appState.session?.role) >= 2
}

function canDeleteClients() {
  return roleLevel(appState.session?.role) >= 3
}

function canManageEvents() {
  return roleLevel(appState.session?.role) >= 2
}

function canManageIndividualOrders() {
  return roleLevel(appState.session?.role) >= 2
}

function mountViewsFromTemplates() {
  Object.entries(viewTemplates).forEach(([route, html]) => {
    const viewId = route === 'clientsList' ? 'view-clientsList' : `view-${route}`
    const section = document.getElementById(viewId)

    if (section) {
      section.innerHTML = html
    }
  })
}

function setUserChip(session) {
  const userName = document.getElementById('userName')
  const userDot = document.getElementById('userDot')

  if (userName) {
    userName.textContent = session?.name ?? '-'
  }

  if (userDot) {
    userDot.style.opacity = session ? '1' : '0.25'
  }
}

function showLoginScreen() {
  const loginScreen = document.getElementById('loginScreen')
  const portalRoot = document.getElementById('portalRoot')

  if (portalRoot) {
    portalRoot.style.display = 'none'
  }

  if (loginScreen) {
    loginScreen.style.display = 'flex'
  }
}

function showPortal() {
  const loginScreen = document.getElementById('loginScreen')
  const portalRoot = document.getElementById('portalRoot')

  if (loginScreen) {
    loginScreen.style.display = 'none'
  }

  if (portalRoot) {
    portalRoot.style.display = ''
    portalRoot.style.removeProperty('display')
  }
}

function setLoginError(message = '') {
  const errorNode = document.getElementById('loginErr')
  if (!errorNode) {
    return
  }

  errorNode.textContent = message
  errorNode.style.display = message ? 'block' : 'none'
}

function renderDashboardEvents(rows) {
  const eventsList = document.getElementById('dashEventsList')
  const eventsPill = document.getElementById('dashEventsPill')

  if (!eventsList) {
    return
  }

  if (eventsPill) {
    eventsPill.textContent = String(rows.length)
  }

  if (!rows.length) {
    eventsList.innerHTML = `
      <div class="list-row dash-events-row">
        <div class="muted">Brak danych</div>
        <div class="muted">-</div>
        <div class="muted">-</div>
        <div class="muted">-</div>
        <div class="muted">-</div>
        <div class="muted ta-right">-</div>
      </div>
    `
    return
  }

  eventsList.innerHTML = rows
    .map(
      (row) => `
      <div class="list-row dash-events-row">
        <div>${escapeHtml(row.workerName || '-')}</div>
        <div>${escapeHtml(String(row.entriesCount ?? 0))}</div>
        <div>${escapeHtml(row.activeClient || '-')}</div>
        <div>${escapeHtml(row.activeZone || '-')}</div>
        <div>${escapeHtml(row.activeLocation || '-')}</div>
        <div class="ta-right">
          <div class="dash-time-stack">
            <div class="dash-start">${escapeHtml(`QR START: ${row.qrStart || '-'}`)}</div>
            ${row.qrStop && row.qrStop !== '-' ? `<div class="dash-stop">${escapeHtml(`QR STOP: ${row.qrStop}`)}</div>` : ''}
            <div class="dash-dur time-duration">${escapeHtml(row.duration || '-')}</div>
          </div>
        </div>
      </div>
    `,
    )
    .join('')
}

function renderDashboardSummary(summary) {
  const openCount = document.getElementById('sumOpenCount')
  const openNames = document.getElementById('sumOpenNames')
  const over9Count = document.getElementById('sumOver9Count')
  const over9Names = document.getElementById('sumOver9Names')

  if (openCount) {
    openCount.textContent = String(summary.openNoStop.count)
  }

  if (openNames) {
    openNames.textContent = summary.openNoStop.workers.join(', ') || '-'
  }

  if (over9Count) {
    over9Count.textContent = String(summary.over9h.count)
  }

  if (over9Names) {
    over9Names.textContent = summary.over9h.workers.join(', ') || '-'
  }
}

function setSubwelcomeMetric(selector, count) {
  const node = document.querySelector(selector)
  if (!node) {
    return
  }

  if (!node.dataset.baseText) {
    node.dataset.baseText = node.textContent
  }

  node.textContent = `${node.dataset.baseText} ${getDataSourceLabel()} rekordy: ${count}.`
}

function renderClientsTable(rows) {
  const tbody = document.getElementById('clientsBody')
  if (!tbody) {
    return
  }

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:40px; color:#64748b;">Brak klientów do wyświetlenia.</td>
      </tr>
    `
    return
  }

  tbody.innerHTML = rows
    .map((client) => {
      const status = normalizeClientStatus(client.status)
      const badgeClass = statusBadgeClass(status)
      const nip = client.nip ?? '-'
      const city = client.city ?? '-'
      const coordinator = client.coordinator ?? '-'
      const canManage = canManageClients()
      const canDelete = canDeleteClients()

      const actions = canManage
        ? `
            <button class="btn2" type="button" data-client-action="edit" data-client-id="${escapeHtml(client.id)}">Edytuj</button>
            ${canDelete ? `<button class="btn-danger" type="button" style="margin-left:10px;" data-client-action="delete" data-client-id="${escapeHtml(client.id)}">Usuń</button>` : ''}
          `
        : `<button class="btn2" type="button" data-client-action="view" data-client-id="${escapeHtml(client.id)}">Podgląd</button>`

      return `
        <tr>
          <td>${escapeHtml(client.id)}</td>
          <td>${escapeHtml(client.name)}</td>
          <td>${escapeHtml(nip)}</td>
          <td>${escapeHtml(city)}</td>
          <td><span class="${badgeClass}">${escapeHtml(status)}</span></td>
          <td>${escapeHtml(coordinator)}</td>
          <td style="text-align:right; white-space:nowrap;">${actions}</td>
        </tr>
      `
    })
    .join('')
}

function getFilteredClients() {
  const searchInput = document.getElementById('clSearchInput')
  const statusSelect = document.getElementById('clSearchStatus')

  const search = String(searchInput?.value ?? '').trim().toLowerCase()
  const statusFilter = String(statusSelect?.value ?? '').trim()

  return appState.clients.filter((client) => {
    const statusLabel = normalizeClientStatus(client.status)

    if (statusFilter && statusLabel !== statusFilter) {
      return false
    }

    if (!search) {
      return true
    }

    const haystack = [client.id, client.name, client.nip, client.city, client.coordinator]
      .map((value) => String(value ?? '').toLowerCase())
      .join(' ')

    return haystack.includes(search)
  })
}

function updateClientsPager(paged) {
  const pageLabel = document.getElementById('clPageLabel')
  const shownLabel = document.getElementById('clShownLabel')
  const prevBtn = document.getElementById('clPrevBtn')
  const nextBtn = document.getElementById('clNextBtn')

  if (pageLabel) {
    pageLabel.textContent = `Strona ${paged.page} / ${paged.totalPages}`
  }

  if (shownLabel) {
    shownLabel.textContent = `Wyświetlono: ${paged.items.length} · Wszystkie: ${paged.total} · Na stronę: ${paged.pageSize}`
  }

  if (prevBtn) {
    prevBtn.disabled = paged.page <= 1
  }

  if (nextBtn) {
    nextBtn.disabled = paged.page >= paged.totalPages
  }
}

function filterClientsTable({ resetPage = true } = {}) {
  const filtered = getFilteredClients()
  if (resetPage) {
    appState.clientsPage = 1
  }

  const paged = paginate(filtered, appState.clientsPage, appState.clientsPageSize)
  appState.clientsPage = paged.page
  appState.clientsTotal = paged.total
  appState.clientsTotalPages = paged.totalPages

  renderClientsTable(paged.items)
  updateClientsPager(paged)
}

function getClientByIdFromState(clientId) {
  const normalizedId = String(clientId ?? '').trim()
  if (!normalizedId) {
    return null
  }

  return appState.clients.find((client) => String(client.id) === normalizedId) ?? null
}

function fillClientsCoordinatorSelect(selected = '') {
  const select = document.getElementById('clKoordynator')
  if (!select) {
    return
  }

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

function setClientModalReadonly(readonly) {
  const isReadonly = Boolean(readonly)
  ;['clNazwa', 'clNip', 'clMiasto', 'clAdres', 'clStatus', 'clKoordynator'].forEach((id) => {
    const input = document.getElementById(id)
    if (!input) return
    input.disabled = isReadonly
  })

  const saveButton = document.querySelector('#clModal .modal-footer .btn-primary')
  if (saveButton) {
    saveButton.style.display = isReadonly ? 'none' : ''
  }
}

function syncClientsPermissions() {
  const addButton = document.querySelector('#view-clientsList .fido-filters .btn-primary')
  if (addButton) {
    addButton.style.display = canManageClients() ? '' : 'none'
  }
}

function openClientModal(mode = 'add', clientId = '') {
  const modal = document.getElementById('clModal')
  if (!modal) {
    return
  }

  const normalizedMode = String(mode ?? 'add').trim().toLowerCase()
  if (normalizedMode !== 'view' && !canManageClients()) {
    alert('Brak uprawnień do zarządzania klientami.')
    return
  }

  const isEdit = normalizedMode === 'edit'
  const isView = normalizedMode === 'view'
  const currentClient = isEdit || isView ? getClientByIdFromState(clientId) : null
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
  const generatedId = `CL-${Date.now()}`

  appState.clientModalMode = isView ? 'view' : isEdit ? 'edit' : 'add'
  appState.clientModalClientId = currentClient ? String(currentClient.id ?? '') : generatedId

  if (modalTitle) {
    modalTitle.textContent = isView ? 'Podgląd Klienta' : isEdit ? 'Edycja Klienta' : 'Nowy Klient'
  }

  if (rowNumberInput) rowNumberInput.value = appState.clientModalClientId
  if (idInput) idInput.value = appState.clientModalClientId
  if (nameInput) nameInput.value = currentClient ? String(currentClient.name ?? '') : ''
  if (nipInput) nipInput.value = currentClient ? String(currentClient.nip ?? '') : ''
  if (cityInput) cityInput.value = currentClient ? String(currentClient.city ?? '') : ''
  if (addressInput) addressInput.value = currentClient ? String(currentClient.address ?? '') : ''
  if (statusInput) statusInput.value = normalizeClientStatus(currentClient?.status)
  fillClientsCoordinatorSelect(currentClient ? String(currentClient.coordinator ?? '') : '')
  setClientModalReadonly(isView)

  modal.style.display = 'flex'
}

function closeClientModal() {
  const modal = document.getElementById('clModal')
  if (modal) {
    modal.style.display = 'none'
  }

  appState.clientModalMode = 'add'
  appState.clientModalClientId = ''
  setClientModalReadonly(false)
}

async function fetchClientsForCurrentSession(force = false) {
  const tbody = document.getElementById('clientsBody')
  syncClientsPermissions()

  if (!appState.session?.orgId) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:40px; color:#ef4444;">Brak aktywnej sesji organizacji.</td>
        </tr>
      `
    }
    return
  }

  if (!force && appState.clientsLoaded) {
    fillClientsCoordinatorSelect()
    filterClientsTable({ resetPage: false })
    return
  }

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding:40px; color:#64748b;">Ładowanie danych...</td>
      </tr>
    `
  }

  try {
    const clients = await getClients(appState.session.orgId)
    appState.clients = clients
    appState.clientsLoaded = true
    fillClientsCoordinatorSelect()
    filterClientsTable({ resetPage: true })
    setSubwelcomeMetric('#view-clientsList .subwelcome', clients.length)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd pobierania klientów.'
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:40px; color:#ef4444;">${escapeHtml(message)}</td>
        </tr>
      `
    }
  }
}

async function saveClientData() {
  if (!appState.session?.orgId) {
    return
  }

  if (!canManageClients()) {
    alert('Brak uprawnień do zapisu klienta.')
    return
  }

  const mode = String(appState.clientModalMode ?? 'add')
  const id = String(document.getElementById('clId')?.value ?? '').trim()
  const name = String(document.getElementById('clNazwa')?.value ?? '').trim()

  if (!id || !name) {
    alert('Uzupełnij ID i Nazwę klienta.')
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
    coordinator: String(document.getElementById('clKoordynator')?.value ?? '').trim(),
  }

  try {
    if (mode === 'edit') {
      await updateClient(appState.session.orgId, id, payload)
      const index = appState.clients.findIndex((client) => String(client.id) === id)
      if (index >= 0) {
        appState.clients[index] = {
          ...appState.clients[index],
          ...payload,
          status: normalizeClientStatus(payload.status),
        }
      }
    } else {
      await createClient(appState.session.orgId, payload)
    }

    closeClientModal()
    await fetchClientsForCurrentSession(true)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd zapisu klienta.'
    alert(message)
  }
}

async function deleteClientData(clientId) {
  if (!appState.session?.orgId) {
    return
  }

  if (!canDeleteClients()) {
    alert('Brak uprawnień do usuwania klientów.')
    return
  }

  const normalizedId = String(clientId ?? '').trim()
  if (!normalizedId) {
    return
  }

  const current = getClientByIdFromState(normalizedId)
  const label = current?.name ? ` (${current.name})` : ''
  const approved = confirm(`Czy na pewno chcesz usunąć klienta ${normalizedId}${label}?`)
  if (!approved) {
    return
  }

  try {
    await deleteClient(appState.session.orgId, normalizedId)
    appState.clients = appState.clients.filter((client) => String(client.id) !== normalizedId)
    filterClientsTable({ resetPage: false })
    await fetchClientsForCurrentSession(true)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd usuwania klienta.'
    alert(message)
  }
}

function profileFieldValue(value, fallback = '-') {
  const raw = String(value ?? '').trim()
  return raw || fallback
}

function mapClientForProfileView(client) {
  return {
    ...client,
    id: String(client.id ?? ''),
    name: String(client.name ?? ''),
    status: normalizeClientStatus(client.status),
    nip: String(client.nip ?? ''),
    coordinator: String(client.coordinator ?? ''),
    contact: String(client.contact ?? client.phone ?? client.email ?? ''),
    city: String(client.city ?? ''),
    address: String(client.address ?? ''),
    frequency: String(client.frequency ?? client.czestotliwosc ?? ''),
    workers: String(client.workers ?? client.osobyWykonujace ?? client.osoby ?? ''),
    chemicals: String(client.chemia ?? ''),
    equipment: String(client.sprzet ?? ''),
    information: String(client.info ?? client.informacje ?? ''),
  }
}

function getFilteredClientProfiles() {
  const nameFilter = String(document.getElementById('cpSearchName')?.value ?? '')
    .trim()
    .toLowerCase()
  const nipFilter = String(document.getElementById('cpSearchNip')?.value ?? '')
    .trim()
    .toLowerCase()

  return appState.clients
    .map((client) => mapClientForProfileView(client))
    .filter((client) => {
      if (nameFilter && !client.name.toLowerCase().includes(nameFilter)) {
        return false
      }

      if (nipFilter && !client.nip.toLowerCase().includes(nipFilter)) {
        return false
      }

      return true
    })
}

function renderClientProfileTable(rows) {
  const tbody = document.getElementById('clientProfileBody')
  if (!tbody) {
    return
  }

  if (!rows.length) {
    tbody.innerHTML = `
      <tr><td colspan="4" style="text-align:center; padding:40px; color:#64748b;">Brak klientów do wyświetlenia.</td></tr>
    `
    return
  }

  tbody.innerHTML = rows
    .map(
      (client) => `
      <tr>
        <td class="mono">${escapeHtml(profileFieldValue(client.id))}</td>
        <td><b>${escapeHtml(profileFieldValue(client.name))}</b></td>
        <td>${escapeHtml(profileFieldValue(client.nip))}</td>
        <td style="text-align:right;">
          <button class="btn2" type="button" data-client-profile-id="${escapeHtml(client.id)}">Podgląd</button>
        </td>
      </tr>
    `,
    )
    .join('')
}

function filterClientProfileTable() {
  const filtered = getFilteredClientProfiles()
  appState.clientProfileRows = filtered
  renderClientProfileTable(filtered)
}

function fillClientProfileCoordinatorOptions() {
  const list = document.getElementById('cpKoordList')
  if (!list) {
    return
  }

  const uniqueNames = [...new Set(appState.workers.map((worker) => String(worker.name ?? '').trim()).filter(Boolean))]
  uniqueNames.sort((left, right) => left.localeCompare(right, 'pl', { sensitivity: 'base' }))

  list.innerHTML = ''
  uniqueNames.forEach((name) => {
    const option = document.createElement('option')
    option.value = name
    list.appendChild(option)
  })
}

function setClientProfileFieldValues(client) {
  const mapped = mapClientForProfileView(client)
  const title = document.getElementById('cpModalTitle')
  if (title) {
    title.textContent = `Szczegóły Klienta: ${profileFieldValue(mapped.name)}`
  }

  const viewMap = {
    'view-id': mapped.id,
    'view-status': mapped.status,
    'view-nazwa': mapped.name,
    'view-nip': mapped.nip,
    'view-koordynator': mapped.coordinator,
    'view-kontakt': mapped.contact,
    'view-miasto': mapped.city,
    'view-adres': mapped.address,
    'view-czestotliwosc': mapped.frequency,
    'view-osoby': mapped.workers,
    'view-chemia': mapped.chemicals,
    'view-sprzet': mapped.equipment,
    'view-informacje': mapped.information,
  }

  Object.entries(viewMap).forEach(([id, value]) => {
    const node = document.getElementById(id)
    if (node) {
      node.textContent = profileFieldValue(value)
    }
  })

  const editMap = {
    'edit-status': mapped.status,
    'edit-nazwa': mapped.name,
    'edit-nip': mapped.nip,
    'edit-koordynator': mapped.coordinator,
    'edit-kontakt': mapped.contact,
    'edit-miasto': mapped.city,
    'edit-adres': mapped.address,
    'edit-czestotliwosc': mapped.frequency,
    'edit-osoby': mapped.workers,
    'edit-chemia': mapped.chemicals,
    'edit-sprzet': mapped.equipment,
    'edit-informacje': mapped.information,
  }

  Object.entries(editMap).forEach(([id, value]) => {
    const input = document.getElementById(id)
    if (input) {
      input.value = String(value ?? '')
    }
  })
}

function setClientProfileEditMode(editMode) {
  appState.clientProfileEditMode = Boolean(editMode)

  const pairs = [
    ['view-status', 'edit-status'],
    ['view-nazwa', 'edit-nazwa'],
    ['view-nip', 'edit-nip'],
    ['view-koordynator', 'edit-koordynator'],
    ['view-kontakt', 'edit-kontakt'],
    ['view-miasto', 'edit-miasto'],
    ['view-adres', 'edit-adres'],
    ['view-czestotliwosc', 'edit-czestotliwosc'],
    ['view-osoby', 'edit-osoby'],
    ['view-chemia', 'edit-chemia'],
    ['view-sprzet', 'edit-sprzet'],
    ['view-informacje', 'edit-informacje'],
  ]

  pairs.forEach(([viewId, editId]) => {
    const viewNode = document.getElementById(viewId)
    const editNode = document.getElementById(editId)
    if (viewNode) viewNode.style.display = appState.clientProfileEditMode ? 'none' : ''
    if (editNode) editNode.style.display = appState.clientProfileEditMode ? '' : 'none'
  })

  const editButton = document.getElementById('cpBtnEdit')
  const saveButton = document.getElementById('cpBtnSave')
  const cancelButton = document.getElementById('cpBtnCancel')
  const closeButton = document.getElementById('cpBtnClose')

  if (editButton) editButton.style.display = appState.clientProfileEditMode ? 'none' : ''
  if (saveButton) saveButton.style.display = appState.clientProfileEditMode ? '' : 'none'
  if (cancelButton) cancelButton.style.display = appState.clientProfileEditMode ? '' : 'none'
  if (closeButton) closeButton.style.display = appState.clientProfileEditMode ? 'none' : ''
}

function openClientProfileModal(clientId) {
  const modal = document.getElementById('cpModal')
  if (!modal) {
    return
  }

  const normalizedId = String(clientId ?? '').trim()
  const client = appState.clients.find((item) => String(item.id) === normalizedId)
  if (!client) {
    return
  }

  appState.clientProfileCurrent = mapClientForProfileView(client)
  setClientProfileFieldValues(appState.clientProfileCurrent)
  setClientProfileEditMode(false)
  modal.style.display = 'flex'
}

function closeClientProfileModal() {
  const modal = document.getElementById('cpModal')
  if (modal) {
    modal.style.display = 'none'
  }

  appState.clientProfileCurrent = null
  setClientProfileEditMode(false)
}

function enterClientProfileEdit() {
  if (!appState.clientProfileCurrent) {
    return
  }

  setClientProfileEditMode(true)
}

function cancelClientProfileEdit() {
  if (!appState.clientProfileCurrent) {
    return
  }

  setClientProfileFieldValues(appState.clientProfileCurrent)
  setClientProfileEditMode(false)
}

async function saveClientProfileEdit() {
  if (!appState.session?.orgId || !appState.clientProfileCurrent) {
    return
  }

  const payload = {
    name: String(document.getElementById('edit-nazwa')?.value ?? '').trim(),
    status: String(document.getElementById('edit-status')?.value ?? 'Aktywny').trim(),
    nip: String(document.getElementById('edit-nip')?.value ?? '').trim(),
    coordinator: String(document.getElementById('edit-koordynator')?.value ?? '').trim(),
    contact: String(document.getElementById('edit-kontakt')?.value ?? '').trim(),
    city: String(document.getElementById('edit-miasto')?.value ?? '').trim(),
    address: String(document.getElementById('edit-adres')?.value ?? '').trim(),
    frequency: String(document.getElementById('edit-czestotliwosc')?.value ?? '').trim(),
    workers: String(document.getElementById('edit-osoby')?.value ?? '').trim(),
    chemia: String(document.getElementById('edit-chemia')?.value ?? '').trim(),
    sprzet: String(document.getElementById('edit-sprzet')?.value ?? '').trim(),
    informacje: String(document.getElementById('edit-informacje')?.value ?? '').trim(),
  }

  if (!payload.name) {
    alert('Nazwa klienta nie może być pusta.')
    return
  }

  try {
    await updateClient(appState.session.orgId, appState.clientProfileCurrent.id, payload)

    const updatedClient = {
      ...appState.clientProfileCurrent,
      ...payload,
      status: normalizeClientStatus(payload.status),
    }
    appState.clientProfileCurrent = updatedClient

    const index = appState.clients.findIndex((client) => String(client.id) === String(updatedClient.id))
    if (index >= 0) {
      appState.clients[index] = {
        ...appState.clients[index],
        ...updatedClient,
      }
    }

    filterClientProfileTable()
    setClientProfileFieldValues(updatedClient)
    setClientProfileEditMode(false)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd zapisu profilu klienta.'
    alert(message)
  }
}

async function fetchClientProfileForCurrentSession(force = false) {
  const tbody = document.getElementById('clientProfileBody')

  if (!appState.session?.orgId) {
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px; color:#ef4444;">Brak aktywnej sesji organizacji.</td></tr>'
    }
    return
  }

  if (!force && appState.clientsLoaded) {
    fillClientProfileCoordinatorOptions()
    filterClientProfileTable()
    return
  }

  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:40px; color:#64748b;">Ładowanie danych...</td></tr>'
  }

  try {
    const clients = await getClients(appState.session.orgId)
    appState.clients = clients
    appState.clientsLoaded = true
    fillClientProfileCoordinatorOptions()
    filterClientProfileTable()
    setSubwelcomeMetric('#view-clientProfile .subwelcome', clients.length)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd pobierania profilu klientów.'
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:40px; color:#ef4444;">${escapeHtml(message)}</td></tr>`
    }
  }
}

let individualOrdersSearchDebounceHandle = null

function individualOrderQrUrl(qrCode, size = 260) {
  const code = String(qrCode ?? '').trim()
  if (!code) {
    return ''
  }

  const normalizedSize = Number.isFinite(Number(size)) ? Math.max(Math.floor(Number(size)), 120) : 260
  return `https://quickchart.io/qr?text=${encodeURIComponent(code)}&size=${normalizedSize}&margin=10&format=png`
}

function individualOrdersSetStatus(message = 'gotowe', isError = false) {
  const node = document.getElementById('ioStatus')
  if (!node) {
    return
  }

  node.textContent = `Status: ${message}`
  node.style.color = isError ? '#b42318' : ''
}

function individualOrdersSetFooter(shown = 0, total = 0) {
  const node = document.getElementById('ioFooter')
  if (!node) {
    return
  }

  node.textContent = `Wyświetlono: ${shown} (max ${appState.individualOrdersPageSize}) · Wszystkie: ${total}`
}

function individualOrdersSyncPermissions() {
  const addButton = document.getElementById('ioAdd')
  if (addButton) {
    addButton.style.display = canManageIndividualOrders() ? '' : 'none'
  }
}

function individualOrdersCloseModal() {
  const overlay = document.getElementById('ioModal')
  if (overlay) {
    overlay.style.display = 'none'
  }

  appState.individualOrderModalMode = 'add'
  appState.individualOrderCurrentId = ''
}

function individualOrdersOpenModal(mode = 'add', item = null) {
  const overlay = document.getElementById('ioModal')
  if (!overlay) {
    return
  }

  const isEdit = mode === 'edit'
  appState.individualOrderModalMode = isEdit ? 'edit' : 'add'
  appState.individualOrderCurrentId = isEdit ? String(item?.clientIndId ?? '').trim() : ''

  const title = document.getElementById('ioModalTitle')
  const idInput = document.getElementById('ioFormId')
  const dateInput = document.getElementById('ioFormDate')
  const nameInput = document.getElementById('ioFormName')
  const nipInput = document.getElementById('ioFormNip')
  const cityInput = document.getElementById('ioFormCity')
  const addressInput = document.getElementById('ioFormAddr')
  const contactInput = document.getElementById('ioFormContact')
  const infoInput = document.getElementById('ioFormInfo')
  const qrCodeInput = document.getElementById('ioFormQrCode')
  const hiddenRow = document.getElementById('ioFormRow')
  const saveButton = document.getElementById('ioModalSave')

  if (title) {
    title.textContent = isEdit ? 'Edytuj zlecenie' : 'Dodaj zlecenie'
  }

  if (hiddenRow) {
    hiddenRow.value = ''
  }

  if (idInput) {
    idInput.value = isEdit ? String(item?.clientIndId ?? '') : ''
    idInput.disabled = isEdit && !canManageIndividualOrders()
  }
  if (dateInput) {
    dateInput.value = isEdit ? String(item?.dateYmd ?? '') : todayYmd()
  }
  if (nameInput) nameInput.value = isEdit ? String(item?.name ?? '') : ''
  if (nipInput) nipInput.value = isEdit ? String(item?.nip ?? '') : ''
  if (cityInput) cityInput.value = isEdit ? String(item?.city ?? '') : ''
  if (addressInput) addressInput.value = isEdit ? String(item?.address ?? '') : ''
  if (contactInput) contactInput.value = isEdit ? String(item?.contact ?? '') : ''
  if (infoInput) infoInput.value = isEdit ? String(item?.clientInfo ?? '') : ''
  if (qrCodeInput) qrCodeInput.value = isEdit ? String(item?.qrCode ?? '') : ''
  if (saveButton) {
    saveButton.disabled = false
    saveButton.textContent = 'Zapisz'
  }

  overlay.style.display = 'flex'
}

function individualOrdersReadFormPayload() {
  return {
    clientIndId: String(document.getElementById('ioFormId')?.value ?? '').trim(),
    dateYmd: String(document.getElementById('ioFormDate')?.value ?? '').trim(),
    name: String(document.getElementById('ioFormName')?.value ?? '').trim(),
    nip: String(document.getElementById('ioFormNip')?.value ?? '').trim(),
    city: String(document.getElementById('ioFormCity')?.value ?? '').trim(),
    address: String(document.getElementById('ioFormAddr')?.value ?? '').trim(),
    contact: String(document.getElementById('ioFormContact')?.value ?? '').trim(),
    clientInfo: String(document.getElementById('ioFormInfo')?.value ?? '').trim(),
    qrCode: String(document.getElementById('ioFormQrCode')?.value ?? '').trim(),
  }
}

function renderIndividualOrdersRows(rows) {
  const root = document.getElementById('ioRows')
  if (!root) {
    return
  }

  appState.individualOrdersRows = rows
  const canManage = canManageIndividualOrders()

  if (!rows.length) {
    root.innerHTML = `
      <div class="io-row io-empty">
        <div>—</div><div>—</div><div>Brak wyników</div><div>—</div><div>—</div><div>—</div><div>—</div><div>—</div><div>—</div><div class="io-actions"></div>
      </div>
    `
    return
  }

  root.innerHTML = rows
    .map((item, index) => {
      const actionButtons = canManage
        ? `
            <button class="mini-btn qr" data-io-act="qr" data-io-index="${index}" type="button" title="Pobierz QR">QR</button>
            <button class="mini-btn edit" data-io-act="edit" data-io-index="${index}" type="button">Edytuj</button>
            <button class="mini-btn danger" data-io-act="del" data-io-index="${index}" type="button">Usuń</button>
          `
        : `
            <button class="mini-btn qr" data-io-act="qr" data-io-index="${index}" type="button" title="Pobierz QR">QR</button>
          `

      return `
        <div class="io-row">
          <div>${escapeHtml(item.clientIndId || '—')}</div>
          <div>${escapeHtml(item.dateLabel || '—')}</div>
          <div title="${escapeHtml(item.name || '')}">${escapeHtml(item.name || '—')}</div>
          <div>${escapeHtml(item.nip || '')}</div>
          <div>${escapeHtml(item.city || '')}</div>
          <div>${escapeHtml(item.address || '')}</div>
          <div>${escapeHtml(item.contact || '')}</div>
          <div title="${escapeHtml(item.clientInfo || '')}">${escapeHtml(item.clientInfo || '')}</div>
          <div class="mono">${escapeHtml(item.qrCode || '')}</div>
          <div class="io-actions">${actionButtons}</div>
        </div>
      `
    })
    .join('')
}

async function fetchIndividualOrdersForCurrentSession({ resetPage = false } = {}) {
  individualOrdersSyncPermissions()

  if (!appState.session?.orgId) {
    renderIndividualOrdersRows([])
    individualOrdersSetFooter(0, 0)
    individualOrdersSetStatus('brak aktywnej sesji', true)
    return
  }

  if (resetPage) {
    appState.individualOrdersPage = 1
  }

  individualOrdersSetStatus('pobieram dane...')

  try {
    const q = String(document.getElementById('ioQ')?.value ?? '').trim()
    const response = await getIndividualOrders(appState.session.orgId, {
      q,
      page: appState.individualOrdersPage,
      pageSize: appState.individualOrdersPageSize,
    })

    appState.individualOrdersPage = response.page
    appState.individualOrdersPageSize = response.pageSize
    appState.individualOrdersTotal = response.total
    appState.individualOrdersTotalPages = response.totalPages

    renderIndividualOrdersRows(response.items)
    individualOrdersSetFooter(response.items.length, response.total)
    individualOrdersSetStatus(`OK · rekordów: ${response.items.length}`)
    setSubwelcomeMetric('#view-individualOrders .subwelcome', response.total)
  } catch (error) {
    renderIndividualOrdersRows([])
    individualOrdersSetFooter(0, 0)
    const message = error instanceof Error ? error.message : 'Błąd pobierania zleceń.'
    individualOrdersSetStatus(message, true)
  }
}

async function saveIndividualOrderFromModal() {
  if (!appState.session?.orgId) {
    return
  }

  if (!canManageIndividualOrders()) {
    alert('Brak uprawnień do zapisu zleceń indywidualnych.')
    return
  }

  const payload = individualOrdersReadFormPayload()
  if (!payload.name) {
    alert('Pole Nazwa jest wymagane.')
    return
  }

  const saveButton = document.getElementById('ioModalSave')
  if (saveButton) {
    saveButton.disabled = true
    saveButton.textContent = 'Zapisywanie...'
  }

  try {
    if (appState.individualOrderModalMode === 'add') {
      await createIndividualOrder(appState.session.orgId, payload)
    } else {
      await updateIndividualOrder(appState.session.orgId, appState.individualOrderCurrentId, payload)
    }

    individualOrdersCloseModal()
    await fetchIndividualOrdersForCurrentSession()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd zapisu zlecenia.'
    alert(message)
  } finally {
    if (saveButton) {
      saveButton.disabled = false
      saveButton.textContent = 'Zapisz'
    }
  }
}

async function deleteIndividualOrderFromRow(item) {
  if (!appState.session?.orgId || !item?.clientIndId) {
    return
  }

  if (!canManageIndividualOrders()) {
    alert('Brak uprawnień do usuwania zleceń indywidualnych.')
    return
  }

  const confirmed = window.confirm(`Usunąć rekord ${item.clientIndId}?`)
  if (!confirmed) {
    return
  }

  try {
    await deleteIndividualOrder(appState.session.orgId, item.clientIndId)
    await fetchIndividualOrdersForCurrentSession()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd usuwania zlecenia.'
    alert(message)
  }
}

function openIndividualOrderQrModal(qrCode) {
  const normalizedCode = String(qrCode ?? '').trim()
  if (!normalizedCode) {
    individualOrdersSetStatus('Brak kodu QR w tym rekordzie.', true)
    return
  }

  appState.individualOrderQrCurrent = normalizedCode

  const overlay = document.getElementById('ioQrModal')
  const image = document.getElementById('ioQrModalImg')
  const code = document.getElementById('ioQrModalCode')
  if (image) {
    image.src = individualOrderQrUrl(normalizedCode, 260)
    image.alt = `QR ${normalizedCode}`
  }
  if (code) {
    code.textContent = normalizedCode
  }
  if (overlay) {
    overlay.style.display = 'flex'
  }
}

function closeIndividualOrderQrModal() {
  const overlay = document.getElementById('ioQrModal')
  const image = document.getElementById('ioQrModalImg')
  if (overlay) {
    overlay.style.display = 'none'
  }
  if (image) {
    image.src = ''
  }
  appState.individualOrderQrCurrent = ''
}

async function ensureJsPdfLoaded() {
  if (window.jspdf?.jsPDF) {
    return window.jspdf.jsPDF
  }

  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-io-jspdf="1"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Nie udało się załadować jsPDF.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.dataset.ioJspdf = '1'
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
    script.async = true
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('Nie udało się załadować jsPDF.')), { once: true })
    document.head.appendChild(script)
  })

  if (!window.jspdf?.jsPDF) {
    throw new Error('Biblioteka jsPDF nie jest dostępna.')
  }

  return window.jspdf.jsPDF
}

async function downloadCurrentIndividualOrderQrPng() {
  const code = String(appState.individualOrderQrCurrent ?? '').trim()
  if (!code) {
    return
  }

  closeIndividualOrderQrModal()
  individualOrdersSetStatus('generuję PNG...')

  try {
    const response = await fetch(individualOrderQrUrl(code, 800), { method: 'GET', mode: 'cors' })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const blob = await response.blob()
    const link = document.createElement('a')
    const objectUrl = URL.createObjectURL(blob)
    link.href = objectUrl
    link.download = `${code}.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500)
    individualOrdersSetStatus(`OK · pobrano ${code}.png`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd pobierania QR PNG.'
    individualOrdersSetStatus(message, true)
    alert(message)
  }
}

async function downloadCurrentIndividualOrderQrPdf() {
  const code = String(appState.individualOrderQrCurrent ?? '').trim()
  if (!code) {
    return
  }

  closeIndividualOrderQrModal()
  individualOrdersSetStatus('generuję PDF...')

  try {
    const response = await fetch(individualOrderQrUrl(code, 800), { method: 'GET', mode: 'cors' })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const blob = await response.blob()
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(new Error('Błąd odczytu obrazu QR.'))
      reader.readAsDataURL(blob)
    })

    const JsPdf = await ensureJsPdfLoaded()
    const pdf = new JsPdf({ orientation: 'p', unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const qrSize = Math.min(160, pageWidth - 40)
    const startX = (pageWidth - qrSize) / 2

    pdf.setFontSize(14)
    pdf.text(`Kod QR: ${code}`, pageWidth / 2, 20, { align: 'center' })
    pdf.addImage(dataUrl, 'PNG', startX, 40, qrSize, qrSize)
    pdf.setFontSize(10)
    pdf.text('Wygenerowano w iClean Portal', pageWidth / 2, pageHeight - 15, { align: 'center' })
    pdf.save(`${code}.pdf`)
    individualOrdersSetStatus(`OK · pobrano ${code}.pdf`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd pobierania QR PDF.'
    individualOrdersSetStatus(message, true)
    alert(message)
  }
}

function renderEventsRows(rows) {
  const root = document.getElementById('evRows')
  if (!root) {
    return
  }

  const normalizeLookup = (value) => String(value ?? '').trim().toLowerCase()
  const normalizePersonValue = (value) => {
    const raw = String(value ?? '').trim()
    if (!raw) {
      return ''
    }
    try {
      return raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
    } catch {
      return raw.toLowerCase().replace(/\s+/g, ' ').trim()
    }
  }
  const toLoginLocalPart = (value) => {
    const text = String(value ?? '').trim()
    const atIndex = text.indexOf('@')
    return atIndex > 0 ? text.slice(0, atIndex).trim() : ''
  }
  const workerDisplayName = (worker) =>
    String(
      worker?.workerName ??
        worker?.workername ??
        worker?.worker_name ??
        worker?.name ??
        worker?.displayName ??
        worker?.fullName ??
        '',
    ).trim()
  const findWorkerByLogin = (loginText) => {
    const variants = [normalizeLookup(loginText), normalizeLookup(toLoginLocalPart(loginText))].filter(Boolean)
    if (!variants.length) {
      return null
    }

    return (
      appState.workers.find((worker) => {
        const workerKeys = [
          worker?.login,
          worker?.workerLogin,
          worker?.id,
          worker?.workerId,
          worker?.email,
          worker?.loginEmail,
        ]
          .map((value) => String(value ?? '').trim())
          .filter(Boolean)
        const normalizedKeys = new Set([
          ...workerKeys.map((value) => normalizeLookup(value)),
          ...workerKeys.map((value) => normalizeLookup(toLoginLocalPart(value))),
        ])
        return variants.some((variant) => normalizedKeys.has(variant))
      }) ?? null
    )
  }
  const findWorkerByName = (nameText) => {
    const normalized = normalizePersonValue(nameText)
    if (!normalized) {
      return null
    }

    const parts = normalized.split(' ').filter(Boolean)
    if (!parts.length) {
      return null
    }

    const exactMatch =
      appState.workers.find((worker) => normalizePersonValue(workerDisplayName(worker)) === normalized) ?? null
    if (exactMatch) {
      return exactMatch
    }

    const surname = parts[parts.length - 1]
    const surnameMatches = appState.workers.filter((worker) => {
      const workerParts = normalizePersonValue(workerDisplayName(worker)).split(' ').filter(Boolean)
      if (!workerParts.length) {
        return false
      }
      return workerParts[workerParts.length - 1] === surname
    })
    return surnameMatches.length === 1 ? surnameMatches[0] : null
  }
  const resolveWorkerNameFromWorkers = (workerLoginCandidate, workerNameCandidate) => {
    const loginText = String(workerLoginCandidate ?? '').trim()
    const directName = String(workerNameCandidate ?? '').trim()

    const workerByLogin = loginText ? findWorkerByLogin(loginText) : null
    if (workerByLogin) {
      const resolved = workerDisplayName(workerByLogin)
      if (resolved) {
        return resolved
      }
    }

    const workerByName = directName ? findWorkerByName(directName) : null
    if (workerByName) {
      const resolved = workerDisplayName(workerByName)
      if (resolved) {
        return resolved
      }
    }
    return directName || loginText || ''
  }

  const isErrorLikeCell = (value) => {
    const text = String(value ?? '').trim().toLowerCase()
    if (!text) {
      return false
    }

    return (
      (text.includes('"error"') && text.includes('"code"')) ||
      (text.includes('operation "') && text.includes('not found')) ||
      text.includes('"status":"not_found"') ||
      text.includes('"code":404')
    )
  }

  const safeRows = (rows || []).filter((row) => {
    const candidates = [
      row?.workerLogin,
      row?.workerName,
      row?.klient,
      row?.clientName,
      row?.strefa,
      row?.zoneName,
      row?.lokalizacja,
      row?.roomId,
      row?.zoneId,
    ]
    return !candidates.some((value) => isErrorLikeCell(value))
  })

  appState.eventRows = safeRows

  if (!safeRows.length) {
    root.innerHTML = `
      <div class="events-row">
        <div>Brak wyników</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
      </div>
    `
    return
  }

  root.innerHTML = safeRows
    .map((row, index) => {
      const comment = String(row.comment ?? '').trim()
      const commentCell = comment
        ? `<button class="btn2" type="button" data-event-comment="${index}" title="Pokaż komentarz">💬</button>`
        : '—'
      const workerLogin = String(row.workerLogin ?? '').trim()
      const workerName = resolveWorkerNameFromWorkers(workerLogin, row.workerName)
      const workerPrimary = workerName || workerLogin || '-'
      const workerSecondary =
        workerLogin && workerName && workerLogin !== workerName ? workerLogin : ''
      const workerCell = `
        <div class="events-worker-cell">
          <div class="events-worker-name">${escapeHtml(workerPrimary)}</div>
          <div class="events-worker-login mono">${escapeHtml(workerSecondary || '')}</div>
        </div>
      `

      return `
        <div class="events-row">
          <div>${workerCell}</div>
          <div>${escapeHtml(row.klient || '-')}</div>
          <div>${escapeHtml(row.strefa || '-')}</div>
          <div>${escapeHtml(row.lokalizacja || '-')}</div>
          <div class="mono">${escapeHtml(row.date || '-')}</div>
          <div class="mono time-start">${escapeHtml(row.start || '-')}</div>
          <div class="mono time-stop">${escapeHtml(row.stop || '-')}</div>
          <div class="mono time-duration">${escapeHtml(row.duration || '-')}</div>
          <div>${commentCell}</div>
          <div>${escapeHtml(row.editedBy || '-')}</div>
          <div><button class="btn2" type="button" data-event-edit="${index}">Edytuj</button></div>
        </div>
      `
    })
    .join('')
}

function parseDurationHms(value) {
  const match = String(value ?? '')
    .trim()
    .match(/^(\d{1,3}):([0-5]\d):([0-5]\d)$/)
  if (!match) {
    return 0
  }

  const hours = Number(match[1]) || 0
  const minutes = Number(match[2]) || 0
  const seconds = Number(match[3]) || 0
  return hours * 3600 + minutes * 60 + seconds
}

function durationSecondsToHms(value) {
  const seconds = Number(value ?? 0)
  const normalized = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
  const hours = Math.floor(normalized / 3600)
  const minutes = Math.floor((normalized % 3600) / 60)
  const secondsRemainder = normalized % 60
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(secondsRemainder)}`
}

function setSelectOptions(selectNode, options, placeholderLabel = '(wybierz)') {
  if (!selectNode) {
    return
  }

  selectNode.innerHTML = ''

  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = placeholderLabel
  selectNode.appendChild(placeholder)

  options.forEach((optionData) => {
    const option = document.createElement('option')
    option.value = String(optionData.value ?? '').trim()
    option.textContent = String(optionData.label ?? option.value)
    selectNode.appendChild(option)
  })
}

function ensureSelectValue(selectNode, value, fallbackLabel) {
  if (!selectNode) {
    return
  }

  const normalized = String(value ?? '').trim()
  if (!normalized) {
    selectNode.value = ''
    return
  }

  const exists = Array.from(selectNode.options).some((option) => String(option.value) === normalized)
  if (!exists) {
    const option = document.createElement('option')
    option.value = normalized
    option.textContent = fallbackLabel ? `${fallbackLabel} (spoza listy)` : `${normalized} (spoza listy)`
    selectNode.appendChild(option)
  }

  selectNode.value = normalized
}

function normalizeEventStatus(value, hasEndAt = false) {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (normalized === 'CLOSED') {
    return 'CLOSED'
  }

  if (normalized === 'OPEN' || normalized === 'RUNNING') {
    return 'RUNNING'
  }

  return hasEndAt ? 'CLOSED' : 'RUNNING'
}

function applyEventStatusColor() {
  const statusSelect = document.getElementById('evEditStatus')
  if (!statusSelect) {
    return
  }

  const status = normalizeEventStatus(statusSelect.value)

  statusSelect.style.backgroundColor = ''
  statusSelect.style.color = ''

  if (status === 'CLOSED') {
    statusSelect.style.backgroundColor = '#ffe5e5'
    statusSelect.style.color = '#7a0000'
    return
  }

  statusSelect.style.backgroundColor = '#e6ffe6'
  statusSelect.style.color = '#0b4f0b'
}

function syncEventModalLogo() {
  const modalLogo = document.getElementById('evLogo')
  if (!modalLogo) {
    return
  }

  const headerLogo = document.querySelector('.header .logo-block img')
  const src = headerLogo?.getAttribute('src') || '/vite.svg'
  modalLogo.setAttribute('src', src)
}

function getZoneById(zoneId) {
  const id = String(zoneId ?? '').trim()
  return appState.zones.find((zone) => String(zone.id) === id) ?? null
}

function populateEventEditorOptions(selectedWorkerLogin, selectedClientId, selectedZoneId) {
  const workerSelect = document.getElementById('evEditWorker')
  const clientSelect = document.getElementById('evEditPom')
  const zoneSelect = document.getElementById('evEditStrefa')

  if (!workerSelect || !clientSelect || !zoneSelect) {
    return
  }

  const workerOptions = appState.workers
    .map((worker) => {
      const login = String(worker.login ?? worker.id ?? '').trim()
      if (!login) {
        return null
      }

      return {
        value: login,
        label: worker.name || login,
      }
    })
    .filter(Boolean)

  const clientOptions = appState.clients.map((client) => ({
    value: String(client.id),
    label: client.name || client.id,
  }))
  clientOptions.sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))

  setSelectOptions(workerSelect, workerOptions)
  setSelectOptions(clientSelect, clientOptions)

  const normalizedClientId = String(selectedClientId ?? '').trim()
  if (normalizedClientId) {
    clientSelect.value = normalizedClientId
  }

  const availableZones = normalizedClientId
    ? appState.zones.filter((zone) => String(zone.clientId ?? '').trim() === normalizedClientId)
    : appState.zones

  const zoneOptions = availableZones
    .map((zone) => {
      const zoneId = String(zone.id ?? '').trim()
      if (!zoneId) {
        return null
      }

      return {
        value: zoneId,
        label: zone.name || zone.zone || zoneId,
      }
    })
    .filter(Boolean)

  setSelectOptions(zoneSelect, zoneOptions)

  const normalizedWorkerLogin = String(selectedWorkerLogin ?? '').trim()
  const normalizedZoneId = String(selectedZoneId ?? '').trim()
  const fallbackWorkerLabel =
    appState.workers.find((worker) => String(worker.login ?? worker.id ?? '').trim() === normalizedWorkerLogin)?.name ??
    normalizedWorkerLogin
  const fallbackClientLabel =
    appState.clients.find((client) => String(client.id).trim() === normalizedClientId)?.name ?? normalizedClientId
  const fallbackZoneLabel =
    appState.zones.find((zone) => String(zone.id ?? '').trim() === normalizedZoneId)?.name ?? normalizedZoneId

  ensureSelectValue(workerSelect, normalizedWorkerLogin, fallbackWorkerLabel)
  ensureSelectValue(clientSelect, normalizedClientId, fallbackClientLabel)
  ensureSelectValue(zoneSelect, normalizedZoneId, fallbackZoneLabel)
}

function fillEventsClientFilterDatalist() {
  const list = document.getElementById('evPomList')
  if (!list) {
    return
  }

  const uniqueNames = [
    ...new Set(
      appState.clients
        .map((client) => String(client.name ?? '').trim())
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right, 'pl', { sensitivity: 'base' }))

  list.innerHTML = ''
  uniqueNames.forEach((name) => {
    const option = document.createElement('option')
    option.value = name
    list.appendChild(option)
  })
}

function recalcEventDurationFromTimes() {
  const startAt = localDateTimeInputToIso(document.getElementById('evEditStart')?.value)
  const endAt = localDateTimeInputToIso(document.getElementById('evEditStop')?.value)
  const durationInput = document.getElementById('evEditDuration')

  if (!durationInput || !startAt || !endAt) {
    alert('Uzupełnij Start i Stop.')
    return
  }

  const durationSec = Math.max(0, Math.floor((new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000))
  durationInput.value = durationSecondsToHms(durationSec)
}

function recalcEventStopFromDuration() {
  const startAt = localDateTimeInputToIso(document.getElementById('evEditStart')?.value)
  const durationSec = parseDurationHms(document.getElementById('evEditDuration')?.value)
  const endInput = document.getElementById('evEditStop')

  if (!endInput || !startAt || durationSec <= 0) {
    alert('Uzupełnij Start i poprawny Czas (HH:MM:SS).')
    return
  }

  const endAt = new Date(new Date(startAt).getTime() + durationSec * 1000).toISOString()
  endInput.value = isoToLocalDateTimeInput(endAt)
}

function setEventStopNow() {
  const endInput = document.getElementById('evEditStop')
  if (!endInput) {
    return
  }

  endInput.value = isoToLocalDateTimeInput(new Date().toISOString())
}

function syncEventRoomAndClientFromZone() {
  const zoneSelect = document.getElementById('evEditStrefa')
  const roomInput = document.getElementById('evEditRoomId')
  const clientSelect = document.getElementById('evEditPom')
  if (!zoneSelect) {
    return
  }

  const zone = getZoneById(zoneSelect.value)
  if (!zone) {
    return
  }

  if (roomInput) {
    roomInput.value = String(zone.id)
  }

  if (clientSelect) {
    clientSelect.value = String(zone.clientId ?? '')
  }
}

function refreshEventZoneOptionsForClient() {
  const clientId = String(document.getElementById('evEditPom')?.value ?? '').trim()
  const selectedWorker = String(document.getElementById('evEditWorker')?.value ?? '').trim()
  populateEventEditorOptions(selectedWorker, clientId, '')
}

async function openEventEditor(item) {
  const overlay = document.getElementById('evEditorOverlay')
  if (!overlay) {
    return
  }

  await ensureEventReferenceDataLoaded()
  syncEventModalLogo()

  appState.eventEditorMode = 'edit'
  appState.eventEditorItem = item

  const title = document.getElementById('evEditorTitle')
  const cycleId = document.getElementById('evCycleId')
  const rowNumber = document.getElementById('evRowNumber')
  const editedBy = document.getElementById('evEditedBy')
  const roomInput = document.getElementById('evEditRoomId')
  const startInput = document.getElementById('evEditStart')
  const stopInput = document.getElementById('evEditStop')
  const durationInput = document.getElementById('evEditDuration')
  const statusInput = document.getElementById('evEditStatus')
  const commentInput = document.getElementById('evEditComment')
  const deleteButton = document.getElementById('evDeleteBtn')
  const saveButton = document.getElementById('evSaveBtn')

  const zone = getZoneById(item.roomId || item.utilityRoomId)
  const selectedClientId = zone?.clientId ?? item.clientId
  const selectedZoneId = zone?.id ?? item.roomId ?? item.utilityRoomId

  populateEventEditorOptions(item.workerLogin, selectedClientId, selectedZoneId)

  if (title) title.textContent = 'Edytuj zdarzenie'
  if (cycleId) cycleId.textContent = String(item.eventId ?? item.workdayId ?? '-')
  if (rowNumber) rowNumber.textContent = '-'
  if (editedBy) editedBy.textContent = item.editedBy || appState.session?.name || '-'
  if (roomInput) roomInput.value = String(item.roomId ?? item.utilityRoomId ?? '')
  if (startInput) startInput.value = isoToLocalDateTimeInput(item.startAt)
  if (stopInput) stopInput.value = isoToLocalDateTimeInput(item.endAt)
  if (durationInput) durationInput.value = durationSecondsToHms(item.durationSec)
  if (statusInput) statusInput.value = normalizeEventStatus(item.status, Boolean(item.endAt))
  if (commentInput) commentInput.value = String(item.comment ?? '')
  if (saveButton) {
    saveButton.disabled = false
    saveButton.textContent = 'Zapisz'
  }
  if (deleteButton) {
    deleteButton.style.display = canManageEvents() ? '' : 'none'
    deleteButton.disabled = false
    deleteButton.textContent = 'Usuń'
  }

  applyEventStatusColor()

  overlay.style.display = 'flex'
}

async function openCreateEventEditor() {
  const overlay = document.getElementById('evEditorOverlay')
  if (!overlay) {
    return
  }

  if (!canManageEvents()) {
    alert('Brak uprawnień do dodawania zdarzeń.')
    return
  }

  await ensureEventReferenceDataLoaded()
  syncEventModalLogo()

  appState.eventEditorMode = 'add'
  appState.eventEditorItem = null

  const title = document.getElementById('evEditorTitle')
  const cycleId = document.getElementById('evCycleId')
  const rowNumber = document.getElementById('evRowNumber')
  const editedBy = document.getElementById('evEditedBy')
  const roomInput = document.getElementById('evEditRoomId')
  const startInput = document.getElementById('evEditStart')
  const stopInput = document.getElementById('evEditStop')
  const durationInput = document.getElementById('evEditDuration')
  const statusInput = document.getElementById('evEditStatus')
  const commentInput = document.getElementById('evEditComment')
  const deleteButton = document.getElementById('evDeleteBtn')
  const saveButton = document.getElementById('evSaveBtn')

  populateEventEditorOptions('', '', '')

  if (title) title.textContent = 'Dodaj zdarzenie'
  if (cycleId) cycleId.textContent = '-'
  if (rowNumber) rowNumber.textContent = '-'
  if (editedBy) editedBy.textContent = appState.session?.name || '-'
  if (roomInput) roomInput.value = ''
  if (startInput) startInput.value = isoToLocalDateTimeInput(new Date().toISOString())
  if (stopInput) stopInput.value = ''
  if (durationInput) durationInput.value = '00:00:00'
  if (statusInput) statusInput.value = 'RUNNING'
  if (commentInput) commentInput.value = ''
  if (saveButton) {
    saveButton.disabled = false
    saveButton.textContent = 'Zapisz'
  }
  if (deleteButton) {
    deleteButton.style.display = 'none'
    deleteButton.disabled = false
    deleteButton.textContent = 'Usuń'
  }

  applyEventStatusColor()

  overlay.style.display = 'flex'
}

function closeEventEditor() {
  const overlay = document.getElementById('evEditorOverlay')
  if (overlay) {
    overlay.style.display = 'none'
  }

  appState.eventEditorMode = 'add'
  appState.eventEditorItem = null
}

function readEventEditorPayload() {
  const workerSelect = document.getElementById('evEditWorker')
  const roomInput = document.getElementById('evEditRoomId')
  const clientSelect = document.getElementById('evEditPom')
  const zoneSelect = document.getElementById('evEditStrefa')
  const startInput = document.getElementById('evEditStart')
  const stopInput = document.getElementById('evEditStop')
  const durationInput = document.getElementById('evEditDuration')
  const statusInput = document.getElementById('evEditStatus')
  const commentInput = document.getElementById('evEditComment')

  const workerLogin = String(workerSelect?.value ?? '').trim()
  const workerName = workerSelect?.selectedOptions?.[0]?.textContent?.trim() || workerLogin
  const clientId = String(clientSelect?.value ?? '').trim()
  const zoneId = String(zoneSelect?.value ?? '').trim()
  const utilityRoomId = zoneId || String(roomInput?.value ?? '').trim()
  const startAt = localDateTimeInputToIso(startInput?.value)
  let endAt = localDateTimeInputToIso(stopInput?.value)
  let status = String(statusInput?.value ?? 'RUNNING').trim().toUpperCase()
  const comment = String(commentInput?.value ?? '').trim()

  let durationSec = parseDurationHms(durationInput?.value)
  if ((!durationSec || durationSec <= 0) && startAt && endAt) {
    durationSec = Math.max(0, Math.floor((new Date(endAt).getTime() - new Date(startAt).getTime()) / 1000))
  }

  if (startAt && durationSec > 0 && !endAt) {
    endAt = new Date(new Date(startAt).getTime() + durationSec * 1000).toISOString()
  }

  status = normalizeEventStatus(status, Boolean(endAt))

  return {
    workerLogin,
    workerName,
    clientId: clientId || null,
    zoneId: utilityRoomId || null,
    utilityRoomId: utilityRoomId || null,
    roomId: utilityRoomId || null,
    startAt: startAt || null,
    endAt: endAt || null,
    durationSec,
    status: status || 'RUNNING',
    closeMarkedAt: status === 'CLOSED' ? endAt || null : null,
    clientStatus: clientId ? 'CLIENT' : null,
    comment,
    updatedBy: appState.session?.name ?? null,
  }
}

async function refreshDashboardWidgets() {
  if (!appState.session?.orgId) {
    return
  }

  const [todayActive, summary] = await Promise.all([
    getTodayActiveWorkers(appState.session.orgId),
    getDashboardSummary(appState.session.orgId),
  ])
  renderDashboardEvents(todayActive.items ?? [])
  renderDashboardSummary(summary)
  setDashboardLastRefresh(new Date())
}

function setDashboardLastRefresh(dateValue) {
  const node = document.getElementById('dashLastRefresh')
  if (!node) {
    return
  }
  const autoRefreshLabel = ' (autoodświeżenie co 15 min)'

  const iso = toIso(dateValue)
  if (!iso) {
    node.textContent = `Ostatnie odświeżenie: -${autoRefreshLabel}`
    return
  }

  node.textContent = `Ostatnie odświeżenie: ${formatDatePl(iso)} ${formatTime(iso)}${autoRefreshLabel}`
}

function canAutoRefreshDashboard() {
  if (!appState.session?.orgId) {
    return false
  }

  if (document.visibilityState !== 'visible') {
    return false
  }

  return appState.currentRoute === 'dashboard'
}

function triggerDashboardRefreshIfAllowed() {
  if (!canAutoRefreshDashboard()) {
    return
  }

  void refreshDashboardWidgets().catch(() => {})
}

function stopDashboardAutoRefresh() {
  if (dashboardRefreshTimer) {
    window.clearInterval(dashboardRefreshTimer)
    dashboardRefreshTimer = null
  }
}

function startDashboardAutoRefresh() {
  stopDashboardAutoRefresh()
  dashboardRefreshTimer = window.setInterval(() => {
    triggerDashboardRefreshIfAllowed()
  }, DASHBOARD_REFRESH_INTERVAL_MS)
}

async function saveEventEditor() {
  if (!appState.session?.orgId) {
    return
  }

  if (appState.eventEditorMode === 'add' && !canManageEvents()) {
    alert('Brak uprawnień do dodawania zdarzeń.')
    return
  }

  const payload = readEventEditorPayload()
  if (!payload.workerLogin) {
    alert('Wybierz pracownika.')
    return
  }

  const saveButton = document.getElementById('evSaveBtn')
  if (saveButton) {
    saveButton.disabled = true
    saveButton.textContent = 'Zapisywanie...'
  }

  try {
    if (appState.eventEditorMode === 'add') {
      await createEvent(appState.session.orgId, {
        eventId: `EV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        ...payload,
      })
    } else {
      const eventId = String(appState.eventEditorItem?.eventId ?? appState.eventEditorItem?.workdayId ?? '').trim()
      if (!eventId) {
        throw new Error('Brak eventId dla edycji zdarzenia.')
      }

      await updateEvent(appState.session.orgId, eventId, {
        ...appState.eventEditorItem,
        ...payload,
      })
    }

    closeEventEditor()
    await fetchEventsForCurrentSession({ resetPage: false })
    await refreshDashboardWidgets()
    showTransientNotice('Zmiany zostały zapisane.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd zapisu zdarzenia.'
    alert(message)
  } finally {
    if (saveButton) {
      saveButton.disabled = false
      saveButton.textContent = 'Zapisz'
    }
  }
}

async function deleteEventEditorItem() {
  if (!appState.session?.orgId || appState.eventEditorMode !== 'edit') {
    return
  }

  if (!canManageEvents()) {
    alert('Brak uprawnień do usuwania zdarzeń.')
    return
  }

  const eventId = String(appState.eventEditorItem?.eventId ?? appState.eventEditorItem?.workdayId ?? '').trim()
  if (!eventId) {
    return
  }

  const confirmed = window.confirm(`Usunąć zdarzenie ${eventId}?`)
  if (!confirmed) {
    return
  }

  const deleteButton = document.getElementById('evDeleteBtn')
  if (deleteButton) {
    deleteButton.disabled = true
    deleteButton.textContent = 'Usuwanie...'
  }

  try {
    await deleteEvent(appState.session.orgId, eventId)
    closeEventEditor()
    await fetchEventsForCurrentSession({ resetPage: false })
    await refreshDashboardWidgets()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd usuwania zdarzenia.'
    alert(message)
  } finally {
    if (deleteButton) {
      deleteButton.disabled = false
      deleteButton.textContent = 'Usuń'
    }
  }
}

function openEventCommentModal(message) {
  const overlay = document.getElementById('evCommentOverlay')
  const text = document.getElementById('evCommentText')

  if (!overlay || !text) {
    return
  }

  text.textContent = String(message ?? '').trim() || '-'
  overlay.style.display = 'flex'
}

function closeEventCommentModal() {
  const overlay = document.getElementById('evCommentOverlay')
  const text = document.getElementById('evCommentText')

  if (overlay) {
    overlay.style.display = 'none'
  }

  if (text) {
    text.textContent = '-'
  }
}

function syncEventsActionPermissions() {
  const addButton = document.getElementById('evAddBtn')
  if (addButton) {
    addButton.style.display = canManageEvents() ? '' : 'none'
  }
}

function ensureEventsDefaultDates() {
  const from = document.getElementById('evFrom')
  const to = document.getElementById('evTo')
  if (!from || !to) {
    return
  }

  if (!String(from.value ?? '').trim()) {
    from.value = firstDayOfCurrentMonthYmd()
  }

  if (!String(to.value ?? '').trim()) {
    to.value = todayYmd()
  }
}

function resetEventsFilters() {
  const from = document.getElementById('evFrom')
  const to = document.getElementById('evTo')
  const worker = document.getElementById('evWorker')
  const zone = document.getElementById('evStrefa')
  const client = document.getElementById('evPom')
  const room = document.getElementById('evRoomId')
  const status = document.getElementById('evStatus')
  const q = document.getElementById('evQ')

  if (from) from.value = firstDayOfCurrentMonthYmd()
  if (to) to.value = todayYmd()
  if (worker) worker.value = ''
  if (zone) zone.value = ''
  if (client) client.value = ''
  if (room) room.value = ''
  if (status) status.value = ''
  if (q) q.value = ''
}

function readEventsFilters() {
  const from = document.getElementById('evFrom')
  const to = document.getElementById('evTo')
  const worker = document.getElementById('evWorker')
  const zone = document.getElementById('evStrefa')
  const client = document.getElementById('evPom')
  const room = document.getElementById('evRoomId')
  const status = document.getElementById('evStatus')
  const q = document.getElementById('evQ')

  return {
    source: 'events',
    fromIso: ymdToIsoRangeStart(from?.value),
    toIso: ymdToIsoRangeEnd(to?.value),
    worker: String(worker?.value ?? '').trim(),
    strefa: String(zone?.value ?? '').trim(),
    pomieszczenie: String(client?.value ?? '').trim(),
    roomId: String(room?.value ?? '').trim(),
    status: String(status?.value ?? '').trim(),
    q: String(q?.value ?? '').trim(),
    page: appState.eventsPage,
    pageSize: appState.eventsPageSize,
  }
}

function updateEventsPager(shown) {
  const pageLabel = document.getElementById('evPageLabel')
  const shownLabel = document.getElementById('evShownLabel')
  const prevBtn = document.getElementById('evPrevBtn')
  const nextBtn = document.getElementById('evNextBtn')

  if (pageLabel) {
    pageLabel.textContent = `Strona ${appState.eventsPage} / ${appState.eventsTotalPages}`
  }

  if (shownLabel) {
    shownLabel.textContent = `Wyświetlono: ${shown} · Wszystkie: ${appState.eventsTotal} · Na stronę: ${appState.eventsPageSize}`
  }

  if (prevBtn) {
    prevBtn.disabled = appState.eventsPage <= 1
  }

  if (nextBtn) {
    nextBtn.disabled = appState.eventsPage >= appState.eventsTotalPages
  }
}

async function fetchEventsForCurrentSession({ resetPage = false } = {}) {
  const root = document.getElementById('evRows')

  if (!appState.session?.orgId) {
    if (root) {
      root.innerHTML = `
        <div class="events-row">
          <div>Brak aktywnej sesji.</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
        </div>
      `
    }
    return
  }

  ensureEventsDefaultDates()
  syncEventsActionPermissions()

  if (resetPage) {
    appState.eventsPage = 1
  }

  if (root) {
    root.innerHTML = `
      <div class="events-row">
        <div>Ładowanie danych...</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
      </div>
    `
  }

  try {
    await ensureEventReferenceDataLoaded()
    const filters = readEventsFilters()
    const response = await getWorkdays(appState.session.orgId, filters)

    appState.eventsPage = response.page
    appState.eventsPageSize = response.pageSize
    appState.eventsTotal = response.total
    appState.eventsTotalPages = response.totalPages

    renderEventsRows(response.items)
    updateEventsPager(response.items.length)
    setSubwelcomeMetric('#view-events .subwelcome', response.total)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd pobierania zdarzeń.'
    if (root) {
      root.innerHTML = `
        <div class="events-row">
          <div style="color:#ef4444;">${escapeHtml(message)}</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
        </div>
      `
    }
  }
}

async function ensureEventReferenceDataLoaded() {
  if (!appState.session?.orgId) {
    return
  }

  const loaders = []

  if (!appState.workersLoaded) {
    loaders.push(
      getWorkers(appState.session.orgId).then((workers) => {
        appState.workers = workers
        appState.workersLoaded = true
      }),
    )
  }

  if (!appState.clientsLoaded) {
    loaders.push(
      getClients(appState.session.orgId).then((clients) => {
        appState.clients = clients
        appState.clientsLoaded = true
      }),
    )
  }

  if (!appState.zonesLoaded) {
    loaders.push(
      getZones(appState.session.orgId).then((zones) => {
        appState.zones = zones
        appState.zonesLoaded = true
      }),
    )
  }

  if (!loaders.length) {
    fillEventsClientFilterDatalist()
    return
  }

  await Promise.all(loaders)
  fillEventsClientFilterDatalist()
}

function clientNameMap() {
  return new Map(appState.clients.map((client) => [String(client.id), client.name]))
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
  return {
    ...zone,
    qr: zone.qr || zone.id || '-',
    clientName: map.get(clientId) || clientId || '-',
    zoneName: zone.name || zone.zone || '-',
    location: zone.location || '-',
    function: zone.function || '-',
    editedBy: zone.editedBy || '-',
    dateLabel: normalizeZoneDate(zone.date),
  }
}

function getFilteredZones() {
  const qrFilter = String(document.getElementById('znQr')?.value ?? '').trim().toLowerCase()
  const clientFilter = String(document.getElementById('znClient')?.value ?? '').trim().toLowerCase()
  const zoneFilter = String(document.getElementById('znStrefa')?.value ?? '').trim().toLowerCase()
  const locationFilter = String(document.getElementById('znLoc')?.value ?? '').trim().toLowerCase()
  const functionFilter = String(document.getElementById('znFunkcja')?.value ?? '').trim().toLowerCase()
  const editedByFilter = String(document.getElementById('znEditedBy')?.value ?? '').trim().toLowerCase()
  const q = String(document.getElementById('znQ')?.value ?? '').trim().toLowerCase()

  return appState.zones
    .map((zone) => mapZoneForView(zone))
    .filter((zone) => {
      if (qrFilter && !String(zone.qr).toLowerCase().includes(qrFilter)) return false
      if (clientFilter && !String(zone.clientName).toLowerCase().includes(clientFilter)) return false
      if (zoneFilter && !String(zone.zoneName).toLowerCase().includes(zoneFilter)) return false
      if (locationFilter && !String(zone.location).toLowerCase().includes(locationFilter)) return false
      if (functionFilter && !String(zone.function).toLowerCase().includes(functionFilter)) return false
      if (editedByFilter && !String(zone.editedBy).toLowerCase().includes(editedByFilter)) return false

      if (!q) {
        return true
      }

      const haystack = [zone.qr, zone.clientName, zone.zoneName, zone.location, zone.function, zone.editedBy, zone.dateLabel]
        .map((value) => String(value ?? '').toLowerCase())
        .join(' ')

      return haystack.includes(q)
    })
}

function renderZonesRows(rows) {
  const root = document.getElementById('znRows')
  if (!root) {
    return
  }

  if (!rows.length) {
    root.innerHTML = `
      <div class="zones-row">
        <div>Brak wyników</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
      </div>
    `
    return
  }

  root.innerHTML = rows
    .map(
      (zone) => `
      <div class="zones-row">
        <div class="mono">${escapeHtml(zone.qr)}</div>
        <div>${escapeHtml(zone.clientName)}</div>
        <div>${escapeHtml(zone.zoneName)}</div>
        <div>${escapeHtml(zone.location)}</div>
        <div>${escapeHtml(zone.function)}</div>
        <div class="mono">${escapeHtml(zone.dateLabel)}</div>
        <div>${escapeHtml(zone.editedBy)}</div>
        <div class="zones-actions"><button class="btn2" type="button" data-zone-id="${escapeHtml(zone.id)}">Podgląd</button></div>
      </div>
    `,
    )
    .join('')
}

function updateZonesPager(paged) {
  const pageLabel = document.getElementById('znPageLabel')
  const label = document.getElementById('znShownLabel')
  const prevBtn = document.getElementById('znPrevBtn')
  const nextBtn = document.getElementById('znNextBtn')

  if (pageLabel) {
    pageLabel.textContent = `Strona ${paged.page} / ${paged.totalPages}`
  }

  if (!label) {
    return
  }

  label.textContent = `Wyświetlono: ${paged.items.length} · Wszystkie: ${paged.total} · Na stronę: ${paged.pageSize}`

  if (prevBtn) {
    prevBtn.disabled = paged.page <= 1
  }

  if (nextBtn) {
    nextBtn.disabled = paged.page >= paged.totalPages
  }
}

function filterZonesTable({ resetPage = true } = {}) {
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

async function fetchZonesForCurrentSession(force = false) {
  const root = document.getElementById('znRows')

  if (!appState.session?.orgId) {
    if (root) {
      root.innerHTML = `
        <div class="zones-row">
          <div style="color:#ef4444;">Brak aktywnej sesji.</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
        </div>
      `
    }
    return
  }

  if (!force && appState.zonesLoaded) {
    filterZonesTable({ resetPage: false })
    return
  }

  if (root) {
    root.innerHTML = `
      <div class="zones-row">
        <div>Ładowanie danych...</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
      </div>
    `
  }

  try {
    const zones = await getZones(appState.session.orgId)
    appState.zones = zones
    appState.zonesLoaded = true
    filterZonesTable({ resetPage: true })
    setSubwelcomeMetric('#view-zones .subwelcome', zones.length)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd pobierania stref.'
    if (root) {
      root.innerHTML = `
        <div class="zones-row">
          <div style="color:#ef4444;">${escapeHtml(message)}</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
        </div>
      `
    }
  }
}

function resetZoneFilters() {
  ;['znQr', 'znClient', 'znStrefa', 'znLoc', 'znFunkcja', 'znEditedBy', 'znQ'].forEach((id) => {
    const input = document.getElementById(id)
    if (input) {
      input.value = ''
    }
  })
}

function closeZoneModal() {
  const overlay = document.getElementById('znEditorOverlay')
  if (overlay) {
    overlay.style.display = 'none'
  }

  appState.zoneModalMode = 'add'
  appState.zoneModalZoneId = ''
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

function openZoneAddModal() {
  const overlay = document.getElementById('znEditorOverlay')
  if (!overlay) {
    return
  }

  appState.zoneModalMode = 'add'
  appState.zoneModalZoneId = ''

  const qr = nextZoneQrCode()
  const qrLabel = document.getElementById('znQrLabel')
  const rowLabel = document.getElementById('znRowNumberLabel')
  const qrInput = document.getElementById('znEditQr')
  const clientInput = document.getElementById('znEditClient')
  const zoneInput = document.getElementById('znEditStrefa')
  const locationInput = document.getElementById('znEditLoc')
  const functionInput = document.getElementById('znEditFunkcja')
  const dateInput = document.getElementById('znEditData')
  const editedByInput = document.getElementById('znEditEdytowal')
  const saveBtn = document.getElementById('znSaveBtn')
  const deleteBtn = document.getElementById('znDeleteBtn')

  if (qrLabel) qrLabel.textContent = qr
  if (rowLabel) rowLabel.textContent = 'AUTO'
  if (qrInput) qrInput.value = qr
  if (clientInput) clientInput.value = ''
  if (zoneInput) zoneInput.value = ''
  if (locationInput) locationInput.value = ''
  if (functionInput) functionInput.value = ''
  if (dateInput) dateInput.value = formatDatePl(new Date().toISOString())
  if (editedByInput) editedByInput.value = appState.session?.name ?? '-'
  if (saveBtn) saveBtn.style.display = ''
  if (deleteBtn) deleteBtn.style.display = 'none'

  overlay.style.display = 'flex'
}

function openZonePreviewModal(zoneId) {
  const overlay = document.getElementById('znEditorOverlay')
  if (!overlay) {
    return
  }

  const zone = appState.zones.find((item) => item.id === zoneId)
  if (!zone) {
    return
  }

  appState.zoneModalMode = 'edit'
  appState.zoneModalZoneId = String(zoneId)
  const view = mapZoneForView(zone)

  const qrLabel = document.getElementById('znQrLabel')
  const rowLabel = document.getElementById('znRowNumberLabel')
  const qrInput = document.getElementById('znEditQr')
  const clientInput = document.getElementById('znEditClient')
  const zoneInput = document.getElementById('znEditStrefa')
  const locationInput = document.getElementById('znEditLoc')
  const functionInput = document.getElementById('znEditFunkcja')
  const dateInput = document.getElementById('znEditData')
  const editedByInput = document.getElementById('znEditEdytowal')
  const saveBtn = document.getElementById('znSaveBtn')
  const deleteBtn = document.getElementById('znDeleteBtn')

  if (qrLabel) qrLabel.textContent = view.qr
  if (rowLabel) rowLabel.textContent = '-'
  if (qrInput) qrInput.value = view.qr
  if (clientInput) clientInput.value = view.clientName
  if (zoneInput) zoneInput.value = view.zoneName
  if (locationInput) locationInput.value = view.location
  if (functionInput) functionInput.value = view.function
  if (dateInput) dateInput.value = view.dateLabel
  if (editedByInput) editedByInput.value = view.editedBy
  if (saveBtn) saveBtn.style.display = ''
  if (deleteBtn) deleteBtn.style.display = ''

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

  const qr = String(document.getElementById('znEditQr')?.value ?? '').trim()
  const clientRaw = String(document.getElementById('znEditClient')?.value ?? '').trim()
  const zoneName = String(document.getElementById('znEditStrefa')?.value ?? '').trim()
  const location = String(document.getElementById('znEditLoc')?.value ?? '').trim()
  const functionName = String(document.getElementById('znEditFunkcja')?.value ?? '').trim()

  if (!qr || !clientRaw || !zoneName) {
    alert('Uzupełnij Numer QR, Klienta i Strefę.')
    return
  }

  const clientId = resolveClientIdForZone(clientRaw)
  if (!clientId) {
    alert('Nie znaleziono klienta. Wpisz ID klienta lub dokładną nazwę.')
    return
  }

  try {
    if (appState.zoneModalMode === 'add') {
      await createZone(appState.session.orgId, {
        id: qr,
        zoneId: qr,
        clientId,
        name: zoneName,
        function: functionName,
        location,
        editedBy: appState.session?.name ?? null,
        date: new Date().toISOString(),
      })
    } else if (appState.zoneModalMode === 'edit') {
      await updateZone(appState.session.orgId, appState.zoneModalZoneId || qr, {
        clientId,
        name: zoneName,
        function: functionName,
        location,
        editedBy: appState.session?.name ?? null,
        date: new Date().toISOString(),
      })
    }

    closeZoneModal()
    await fetchZonesForCurrentSession(true)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd zapisu strefy.'
    alert(message)
  }
}

async function deleteZoneData() {
  if (!appState.session?.orgId || appState.zoneModalMode !== 'edit' || !appState.zoneModalZoneId) {
    return
  }

  const confirmed = window.confirm(`Usunąć strefę ${appState.zoneModalZoneId}?`)
  if (!confirmed) {
    return
  }

  try {
    await deleteZone(appState.session.orgId, appState.zoneModalZoneId)
    closeZoneModal()
    await fetchZonesForCurrentSession(true)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd usuwania strefy.'
    alert(message)
  }
}

function workerBooleanValue(rawValue) {
  const value = String(rawValue ?? '')
    .trim()
    .toLowerCase()

  if (!value) {
    return null
  }

  if (value === '1' || value === 'true' || value === 'tak' || value === 'yes') {
    return true
  }

  if (value === '0' || value === 'false' || value === 'nie' || value === 'no') {
    return false
  }

  return null
}

function workerBoolLabel(value) {
  return value ? 'TAK' : 'NIE'
}

function updateWorkerProfilePager(paged) {
  const pageLabel = document.getElementById('wkPageLabel')
  const label = document.getElementById('wkShownLabel')
  const prevBtn = document.getElementById('wkPrevBtn')
  const nextBtn = document.getElementById('wkNextBtn')

  if (pageLabel) {
    pageLabel.textContent = `Strona ${paged.page} / ${paged.totalPages}`
  }

  if (!label) {
    return
  }

  label.textContent = `Wyświetlono: ${paged.items.length} · Wszystkie: ${paged.total} · Na stronę: ${paged.pageSize}`

  if (prevBtn) {
    prevBtn.disabled = paged.page <= 1
  }

  if (nextBtn) {
    nextBtn.disabled = paged.page >= paged.totalPages
  }
}

function getFilteredWorkerProfiles() {
  const q = String(document.getElementById('wkQ')?.value ?? '')
    .trim()
    .toLowerCase()
  const typeFilter = String(document.getElementById('wkType')?.value ?? '')
    .trim()
    .toLowerCase()
  const activeFilter = workerBooleanValue(document.getElementById('wkActive')?.value)
  const onlineFilter = workerBooleanValue(document.getElementById('wkOnline')?.value)

  return appState.workerProfileRows.filter((worker) => {
    const workerType = String(worker.type ?? worker.role ?? '')
      .trim()
      .toLowerCase()
    if (typeFilter && !workerType.includes(typeFilter)) {
      return false
    }

    if (activeFilter !== null && Boolean(worker.active) !== activeFilter) {
      return false
    }

    const online = Boolean(worker.online)
    if (onlineFilter !== null && online !== onlineFilter) {
      return false
    }

    if (!q) {
      return true
    }

    const haystack = [
      worker.workerId,
      worker.id,
      worker.name,
      worker.login,
      worker.type,
      worker.role,
      worker.phone,
      worker.email,
      worker.qrText,
    ]
      .map((value) => String(value ?? '').toLowerCase())
      .join(' ')

    return haystack.includes(q)
  })
}

function renderWorkerProfileRows(rows) {
  const root = document.getElementById('wkRows')
  if (!root) {
    return
  }

  appState.workerProfileViewRows = rows

  if (!rows.length) {
    root.innerHTML = `
      <div class="workers-row">
        <div>Brak wyników</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
      </div>
    `
    return
  }

  const actionLabel = 'Podgląd'
  root.innerHTML = rows
    .map(
      (worker, index) => `
      <div class="workers-row">
        <div class="mono">${escapeHtml(worker.workerId || worker.id || '-')}</div>
        <div>${escapeHtml(worker.name || '-')}</div>
        <div class="mono">${escapeHtml(worker.login || '-')}</div>
        <div>${escapeHtml(worker.type || worker.role || '-')}</div>
        <div><span class="pill ${worker.active ? 'pill-true' : 'pill-false'}">${escapeHtml(worker.active ? 'TRUE' : 'FALSE')}</span></div>
        <div><span class="pill ${worker.online ? 'pill-yes' : 'pill-no'}">${escapeHtml(workerBoolLabel(Boolean(worker.online)))}</span></div>
        <div>${escapeHtml(worker.phone || '-')}</div>
        <div>${escapeHtml(worker.email || '-')}</div>
        <div class="workers-actions">
          <button class="btn2" type="button" data-worker-profile-index="${index}">${actionLabel}</button>
        </div>
      </div>
    `,
    )
    .join('')
}

function setWorkerProfileModalReadOnly(readOnly) {
  const hint = document.getElementById('wkReadOnlyHint')
  if (hint) {
    hint.style.display = readOnly ? 'block' : 'none'
  }

  ;['wkEditName', 'wkEditLogin', 'wkEditType', 'wkEditActive', 'wkEditEmail', 'wkEditPhone', 'wkEditQr', 'wkNewPass', 'wkNewPass2'].forEach(
    (id) => {
      const input = document.getElementById(id)
      if (input) {
        input.disabled = readOnly
      }
    },
  )

  const saveButton = document.getElementById('wkSaveBtn')
  if (saveButton) {
    saveButton.style.display = readOnly ? 'none' : ''
  }

  const fillQrButton = document.getElementById('wkFillQrBtn')
  if (fillQrButton) {
    fillQrButton.style.display = readOnly ? 'none' : ''
  }
}

function openWorkerProfileModal(worker = null, mode = 'view') {
  const overlay = document.getElementById('wkEditorOverlay')
  if (!overlay) {
    return
  }

  appState.workerProfileCurrent = worker
  appState.workerProfileModalMode = mode

  const modalTitle = document.getElementById('wkModalTitle')
  const idLabel = document.getElementById('wkIdLabel')
  const addedAtLabel = document.getElementById('wkAddedAt')
  const editedAtLabel = document.getElementById('wkEditedAt')
  const editedByLabel = document.getElementById('wkEditedBy')
  const idInput = document.getElementById('wkEditId')
  const nameInput = document.getElementById('wkEditName')
  const loginInput = document.getElementById('wkEditLogin')
  const typeInput = document.getElementById('wkEditType')
  const activeInput = document.getElementById('wkEditActive')
  const onlineInput = document.getElementById('wkOnlineNow')
  const emailInput = document.getElementById('wkEditEmail')
  const phoneInput = document.getElementById('wkEditPhone')
  const qrInput = document.getElementById('wkEditQr')
  const newPassInput = document.getElementById('wkNewPass')
  const newPass2Input = document.getElementById('wkNewPass2')
  const deleteButton = document.getElementById('wkDeleteBtn')
  const passWrap = document.getElementById('wkCurrentPassWrap')
  const currentPass = document.getElementById('wkCurrentPass')
  const showPassButton = document.getElementById('wkShowPassBtn')

  const headerLogo = document.querySelector('.header .logo-block img')
  const modalLogo = document.getElementById('wkLogo')
  if (modalLogo && headerLogo?.getAttribute('src')) {
    modalLogo.setAttribute('src', headerLogo.getAttribute('src'))
  }

  if (mode === 'add') {
    if (modalTitle) modalTitle.textContent = 'Dodaj pracownika'
    if (idLabel) idLabel.textContent = 'AUTO'
    if (addedAtLabel) addedAtLabel.textContent = '-'
    if (editedAtLabel) editedAtLabel.textContent = '-'
    if (editedByLabel) editedByLabel.textContent = appState.session?.name ?? '-'
    if (idInput) idInput.value = 'AUTO'
    if (nameInput) nameInput.value = ''
    if (loginInput) loginInput.value = ''
    if (typeInput) typeInput.value = 'Pracownik'
    if (activeInput) activeInput.value = '1'
    if (onlineInput) onlineInput.value = 'NIE'
    if (emailInput) emailInput.value = ''
    if (phoneInput) phoneInput.value = ''
    if (qrInput) qrInput.value = ''
  } else {
    if (modalTitle) modalTitle.textContent = canManageWorkers() ? 'Edytuj pracownika' : 'Podgląd pracownika'
    if (idLabel) idLabel.textContent = worker?.workerId || worker?.id || '-'
    if (addedAtLabel) addedAtLabel.textContent = worker?.addedAt || '-'
    if (editedAtLabel) editedAtLabel.textContent = worker?.editedAt || '-'
    if (editedByLabel) editedByLabel.textContent = worker?.editedBy || '-'
    if (idInput) idInput.value = worker?.workerId || worker?.id || '-'
    if (nameInput) nameInput.value = worker?.name || ''
    if (loginInput) loginInput.value = worker?.login || ''
    if (typeInput) typeInput.value = worker?.type || worker?.role || 'Pracownik'
    if (activeInput) activeInput.value = worker?.active ? '1' : '0'
    if (onlineInput) onlineInput.value = workerBoolLabel(Boolean(worker?.online))
    if (emailInput) emailInput.value = worker?.email || ''
    if (phoneInput) phoneInput.value = worker?.phone || ''
    if (qrInput) qrInput.value = worker?.qrText || ''
  }

  if (newPassInput) newPassInput.value = ''
  if (newPass2Input) newPass2Input.value = ''

  if (passWrap) {
    passWrap.style.display = 'none'
  }
  if (currentPass) {
    currentPass.value = ''
    currentPass.type = 'password'
  }
  if (showPassButton) {
    showPassButton.textContent = 'Pokaż'
  }

  if (deleteButton) {
    deleteButton.style.display = mode === 'edit' && canDeleteWorkers() ? '' : 'none'
  }

  setWorkerProfileModalReadOnly(mode === 'view' || !canManageWorkers())
  overlay.style.display = 'flex'
}

function closeWorkerProfileModal() {
  const overlay = document.getElementById('wkEditorOverlay')
  if (overlay) {
    overlay.style.display = 'none'
  }

  appState.workerProfileCurrent = null
  appState.workerProfileModalMode = 'view'
}

function fillWorkerQrFromCredentials() {
  const login = String(document.getElementById('wkEditLogin')?.value ?? '').trim()
  const password = String(document.getElementById('wkNewPass')?.value ?? '').trim()
  if (!login || !password) {
    alert('Wpisz Login i Nowe hasło, aby uzupełnić QR.')
    return
  }

  const qrInput = document.getElementById('wkEditQr')
  if (qrInput) {
    qrInput.value = `login=${login};haslo=${password}`
  }
}

function resetWorkerProfileFilters() {
  const qInput = document.getElementById('wkQ')
  const typeInput = document.getElementById('wkType')
  const activeInput = document.getElementById('wkActive')
  const onlineInput = document.getElementById('wkOnline')
  if (qInput) qInput.value = ''
  if (typeInput) typeInput.value = ''
  if (activeInput) activeInput.value = ''
  if (onlineInput) onlineInput.value = ''
}

function filterWorkerProfileTable({ resetPage = true } = {}) {
  const filtered = getFilteredWorkerProfiles()
  if (resetPage) {
    appState.workerProfilePage = 1
  }

  const paged = paginate(filtered, appState.workerProfilePage, appState.workerProfilePageSize)
  appState.workerProfilePage = paged.page
  appState.workerProfileTotal = paged.total
  appState.workerProfileTotalPages = paged.totalPages

  renderWorkerProfileRows(paged.items)
  updateWorkerProfilePager(paged)
}

async function fetchWorkerProfilesForCurrentSession(force = false) {
  const root = document.getElementById('wkRows')

  if (!appState.session?.orgId) {
    if (root) {
      root.innerHTML = `
        <div class="workers-row">
          <div style="color:#ef4444;">Brak aktywnej sesji.</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
        </div>
      `
    }
    return
  }

  if (!force && appState.workerProfileRows.length) {
    filterWorkerProfileTable({ resetPage: false })
    return
  }

  if (root) {
    root.innerHTML = `
      <div class="workers-row">
        <div>Ładowanie danych...</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
      </div>
    `
  }

  try {
    const workers = await getWorkers(appState.session.orgId, {
      q: String(document.getElementById('wkQ')?.value ?? '').trim(),
      type: String(document.getElementById('wkType')?.value ?? '').trim(),
    })

    appState.workerProfileRows = workers.map((worker) => ({
      ...worker,
      online: Boolean(worker.online ?? false),
      phone: String(worker.phone ?? ''),
      email: String(worker.email ?? ''),
      qrText: String(worker.qrText ?? ''),
    }))

    appState.workers = appState.workerProfileRows
    appState.workersLoaded = true
    filterWorkerProfileTable({ resetPage: true })
    setSubwelcomeMetric('#view-workerProfile .subwelcome', appState.workerProfileRows.length)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd pobierania pracowników.'
    if (root) {
      root.innerHTML = `
        <div class="workers-row">
          <div style="color:#ef4444;">${escapeHtml(message)}</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
        </div>
      `
    }
  }
}

async function saveWorkerProfileData() {
  if (!appState.session?.orgId) {
    return
  }

  if (!canManageWorkers()) {
    alert('Brak uprawnień do zapisu pracownika.')
    return
  }

  const payload = {
    name: String(document.getElementById('wkEditName')?.value ?? '').trim(),
    login: String(document.getElementById('wkEditLogin')?.value ?? '').trim(),
    role: String(document.getElementById('wkEditType')?.value ?? 'Pracownik').trim(),
    active: String(document.getElementById('wkEditActive')?.value ?? '1').trim() === '1',
    email: String(document.getElementById('wkEditEmail')?.value ?? '').trim(),
    phone: String(document.getElementById('wkEditPhone')?.value ?? '').trim(),
    qrText: String(document.getElementById('wkEditQr')?.value ?? '').trim(),
  }

  if (!payload.name || !payload.login) {
    alert('Uzupełnij imię i login.')
    return
  }

  const newPass = String(document.getElementById('wkNewPass')?.value ?? '').trim()
  const repeatPass = String(document.getElementById('wkNewPass2')?.value ?? '').trim()
  if (newPass || repeatPass) {
    if (newPass !== repeatPass) {
      alert('Hasła nie są takie same.')
      return
    }
  }

  try {
    if (appState.workerProfileModalMode === 'add') {
      await createWorker(appState.session.orgId, payload)
    } else {
      alert('Edycja pracownika będzie podpięta po dodaniu operacji UpdateWorkerForOrg w Data Connect.')
      return
    }

    closeWorkerProfileModal()
    await fetchWorkerProfilesForCurrentSession(true)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd zapisu pracownika.'
    alert(message)
  }
}

async function deleteWorkerProfileData() {
  if (!canDeleteWorkers()) {
    alert('Brak uprawnień do usuwania pracownika.')
    return
  }

  alert('Usuwanie pracownika będzie podpięte po dodaniu operacji DeleteWorkerForOrg w Data Connect.')
}

function renderWorkerRows(rows) {
  const root = document.getElementById('wtRows')
  if (!root) {
    return
  }

  if (!rows.length) {
    root.innerHTML = `
      <div class="events-row" style="grid-template-columns: 140px 260px 220px 140px;">
        <div>Brak wyników</div><div></div><div></div><div></div>
      </div>
    `
    return
  }

  root.innerHTML = rows
    .map(
      (worker) => `
      <div class="events-row" style="grid-template-columns: 140px 260px 220px 140px;">
        <div class="mono">${escapeHtml(worker.workerId || worker.id || '-')}</div>
        <div>${escapeHtml(worker.name || '-')}</div>
        <div>${escapeHtml(worker.type || '-')}</div>
        <div><button class="btn2" type="button" data-worker-login="${escapeHtml(worker.login || worker.id || '')}" data-worker-name="${escapeHtml(worker.name || '')}">Pokaż</button></div>
      </div>
    `,
    )
    .join('')
}

function updateWorkersPager(paged) {
  const pageLabel = document.getElementById('wtPageLabel')
  const shownLabel = document.getElementById('wtShownLabel')
  const prevBtn = document.getElementById('wtPrevBtn')
  const nextBtn = document.getElementById('wtNextBtn')

  if (pageLabel) {
    pageLabel.textContent = `Strona ${paged.page} / ${paged.totalPages}`
  }

  if (shownLabel) {
    shownLabel.textContent = `Wyświetlono: ${paged.items.length} · Wszystkie: ${paged.total} · Na stronę: ${paged.pageSize}`
  }

  if (prevBtn) {
    prevBtn.disabled = paged.page <= 1
  }

  if (nextBtn) {
    nextBtn.disabled = paged.page >= paged.totalPages
  }
}

function renderWorkersPaged(rows, { resetPage = true } = {}) {
  if (resetPage) {
    appState.workersPage = 1
  }

  const paged = paginate(rows, appState.workersPage, appState.workersPageSize)
  appState.workersPage = paged.page
  appState.workersTotal = paged.total
  appState.workersTotalPages = paged.totalPages

  renderWorkerRows(paged.items)
  updateWorkersPager(paged)
}

async function fetchWorkersForCurrentSession() {
  const root = document.getElementById('wtRows')

  if (!appState.session?.orgId) {
    if (root) {
      root.innerHTML = `
        <div class="events-row" style="grid-template-columns: 140px 260px 220px 140px;">
          <div style="color:#ef4444;">Brak aktywnej sesji.</div><div></div><div></div><div></div>
        </div>
      `
    }
    return
  }

  if (root) {
    root.innerHTML = `
      <div class="events-row" style="grid-template-columns: 140px 260px 220px 140px;">
        <div>Ładowanie danych...</div><div></div><div></div><div></div>
      </div>
    `
  }

  try {
    const filters = {
      q: String(document.getElementById('wtQ')?.value ?? '').trim(),
      type: String(document.getElementById('wtType')?.value ?? '').trim(),
    }

    const workers = await getWorkers(appState.session.orgId, filters)
    appState.workers = workers
    appState.workersLoaded = true
    renderWorkersPaged(workers, { resetPage: true })
    setSubwelcomeMetric('#view-workerTime .subwelcome', workers.length)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd pobierania pracowników.'
    if (root) {
      root.innerHTML = `
        <div class="events-row" style="grid-template-columns: 140px 260px 220px 140px;">
          <div style="color:#ef4444;">${escapeHtml(message)}</div><div></div><div></div><div></div>
        </div>
      `
    }
  }
}

const WORKER_DETAIL_MONTH_NAMES_PL = [
  'styczeń',
  'luty',
  'marzec',
  'kwiecień',
  'maj',
  'czerwiec',
  'lipiec',
  'sierpień',
  'wrzesień',
  'październik',
  'listopad',
  'grudzień',
]

function workerDetailCanEdit() {
  return canManageWorkers()
}

function workerDetailDateKeyFromIso(value) {
  const iso = toIso(value)
  return iso ? iso.slice(0, 10) : ''
}

function workerDetailDateKeyToLabel(dayKey) {
  const value = String(dayKey ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return '-'
  }

  return `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`
}

function workerDetailIsoToTime(isoValue) {
  const iso = toIso(isoValue)
  if (!iso) {
    return '-'
  }

  const date = new Date(iso)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

function workerDetailIsoToDateInput(isoValue) {
  const iso = toIso(isoValue)
  if (!iso) {
    return ''
  }

  return iso.slice(0, 10)
}

function workerDetailIsoToTimeInput(isoValue) {
  const iso = toIso(isoValue)
  if (!iso) {
    return ''
  }

  const date = new Date(iso)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

function workerDetailLocalDateAndTimeToIso(dateValue, timeValue) {
  const dateRaw = String(dateValue ?? '').trim()
  let timeRaw = String(timeValue ?? '').trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return ''
  }

  if (/^\d{2}:\d{2}$/.test(timeRaw)) {
    timeRaw = `${timeRaw}:00`
  }

  if (!/^\d{2}:\d{2}:\d{2}$/.test(timeRaw)) {
    return ''
  }

  const date = new Date(`${dateRaw}T${timeRaw}`)
  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  return date.toISOString()
}

function workerDetailComputeRangeSeconds(startAt, endAt) {
  const startIso = toIso(startAt)
  const endIso = toIso(endAt)
  if (!startIso || !endIso) {
    return 0
  }

  const startMs = new Date(startIso).getTime()
  const endMs = new Date(endIso).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0
  }

  return Math.floor((endMs - startMs) / 1000)
}

function workerDetailAlertLevelFromWorkSec(workSec) {
  const seconds = Number(workSec ?? 0)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 0
  }

  if (seconds > 10 * 3600) {
    return 2
  }

  if (seconds > 9 * 3600) {
    return 1
  }

  return 0
}

function workerDetailAckKey(dayKey) {
  return `${appState.selectedWorkerLogin}::${String(dayKey ?? '').trim()}`
}

function workerDetailIsAcked(dayKey) {
  const key = workerDetailAckKey(dayKey)
  return Boolean(appState.workerDetailAckMap[key])
}

function workerDetailSetAck(dayKey, ack = true) {
  const key = workerDetailAckKey(dayKey)
  appState.workerDetailAckMap[key] = Boolean(ack)
}

function workerDetailCurrentUserName() {
  return String(appState.session?.name ?? appState.session?.login ?? '').trim()
}

function workerDetailFindSelectedWorker() {
  const login = String(appState.selectedWorkerLogin ?? '').trim()
  if (!login) {
    return null
  }

  return (
    appState.workers.find((worker) => String(worker.login ?? worker.id ?? '').trim() === login) ??
    appState.workers.find((worker) => String(worker.workerId ?? '').trim() === login) ??
    null
  )
}

function setWorkerDetailHeadings() {
  const title = document.getElementById('wtdTitle')
  const sub = document.getElementById('wtdSub')

  if (!title || !sub) {
    return
  }

  if (!appState.selectedWorkerLogin) {
    title.textContent = 'Czas pracy - pracownik'
    sub.textContent = 'Wybierz pracownika z listy Czas pracy pracownika.'
    return
  }

  const worker = workerDetailFindSelectedWorker()
  const workerName = appState.selectedWorkerName || worker?.name || appState.selectedWorkerLogin
  const workerType = String(worker?.type ?? '').trim() || '—'
  const role = String(appState.session?.role ?? '').trim() || '—'
  const canEditLabel = workerDetailCanEdit() ? 'TAK' : 'NIE'

  title.textContent = `Czas pracy - ${workerName}`
  sub.textContent = `Typ pracownika: ${workerType} · Uprawnienia: ${role} · Edycja: ${canEditLabel}.`
}

function setWorkerDetailMonthCard(items) {
  const monthLabel = document.getElementById('wtdMonthLabel')
  const monthRange = document.getElementById('wtdMonthRange')
  const monthWork = document.getElementById('wtdMonthWork')
  const monthBreak = document.getElementById('wtdMonthBreak')
  const monthNet = document.getElementById('wtdMonthNet')
  const monthPick = document.getElementById('wtdMonthPick')
  const from = String(document.getElementById('wtdFrom')?.value ?? '').trim()
  const to = String(document.getElementById('wtdTo')?.value ?? '').trim()

  const totalWorkSec = items.reduce((sum, row) => sum + Math.max(0, Number(row.workSec ?? 0) || 0), 0)
  const totalBreakSec = items.reduce((sum, row) => sum + Math.max(0, Number(row.breakSec ?? 0) || 0), 0)
  const totalNetSec = Math.max(0, totalWorkSec - totalBreakSec)

  const pickedOption = monthPick?.selectedOptions?.[0]?.textContent?.trim()
  const fallbackMonth = from ? from.slice(0, 7) : '—'

  if (monthLabel) monthLabel.textContent = pickedOption || fallbackMonth
  if (monthRange) monthRange.textContent = from && to ? `${workerDetailDateKeyToLabel(from)} - ${workerDetailDateKeyToLabel(to)}` : '—'
  if (monthWork) monthWork.textContent = durationSecondsToHms(totalWorkSec)
  if (monthBreak) monthBreak.textContent = durationSecondsToHms(totalBreakSec)
  if (monthNet) monthNet.textContent = durationSecondsToHms(totalNetSec)
}

function workerDetailAggregateRows(rows) {
  const groups = new Map()
  const selectedWorker = workerDetailFindSelectedWorker()

  rows.forEach((row) => {
    const dayKey = String(row.dayKey ?? '').trim() || workerDetailDateKeyFromIso(row.startAt || row.endAt)
    if (!dayKey) {
      return
    }

    const startIso = toIso(row.startAt)
    const endIso = toIso(row.endAt)
    const updatedAtIso = toIso(row.updatedAt)
    const breakSec = Math.max(0, Number(row.breakSec ?? row.pauseTotalSec ?? 0) || 0)

    if (!groups.has(dayKey)) {
      groups.set(dayKey, {
        dayKey,
        workerName: String(row.workerName ?? appState.selectedWorkerName ?? selectedWorker?.name ?? appState.selectedWorkerLogin ?? '').trim(),
        workerType: String(row.workerType ?? selectedWorker?.type ?? '').trim(),
        workdayId: String(row.workdayId ?? row.id ?? '').trim(),
        startAt: startIso || '',
        endAt: endIso || '',
        breakSec,
        updatedBy: String(row.editedBy ?? '').trim(),
        comment: String(row.comment ?? '').trim(),
        latestUpdatedAt: updatedAtIso || '',
        sourceRows: [],
      })
    }

    const bucket = groups.get(dayKey)
    bucket.sourceRows.push(row)
    if (bucket.sourceRows.length > 1) {
      bucket.breakSec += breakSec
    }

    if (startIso) {
      if (!bucket.startAt || new Date(startIso).getTime() < new Date(bucket.startAt).getTime()) {
        bucket.startAt = startIso
        bucket.workdayId = String(row.workdayId ?? row.id ?? '').trim() || bucket.workdayId
      }
    }

    if (endIso) {
      if (!bucket.endAt || new Date(endIso).getTime() > new Date(bucket.endAt).getTime()) {
        bucket.endAt = endIso
      }
    }

    if (updatedAtIso) {
      if (!bucket.latestUpdatedAt || new Date(updatedAtIso).getTime() >= new Date(bucket.latestUpdatedAt).getTime()) {
        bucket.latestUpdatedAt = updatedAtIso
        bucket.updatedBy = String(row.editedBy ?? '').trim() || bucket.updatedBy
        bucket.comment = String(row.comment ?? '').trim() || bucket.comment
      }
    } else {
      bucket.updatedBy = bucket.updatedBy || String(row.editedBy ?? '').trim()
      bucket.comment = bucket.comment || String(row.comment ?? '').trim()
    }
  })

  return [...groups.values()]
    .map((bucket) => {
      const workSec = workerDetailComputeRangeSeconds(bucket.startAt, bucket.endAt)
      const breakSec = Math.max(0, Math.floor(Number(bucket.breakSec ?? 0)))
      const netSec = Math.max(0, workSec - breakSec)
      const alertLevel = workerDetailAlertLevelFromWorkSec(workSec)
      const alertAck = workerDetailIsAcked(bucket.dayKey)

      return {
        dayKey: bucket.dayKey,
        workdayId: bucket.workdayId,
        workerName: bucket.workerName || appState.selectedWorkerName || appState.selectedWorkerLogin || '-',
        workerType: bucket.workerType || String(selectedWorker?.type ?? '').trim(),
        startAt: bucket.startAt,
        endAt: bucket.endAt,
        workSec,
        breakSec,
        netSec,
        updatedBy: bucket.updatedBy || '-',
        comment: bucket.comment || '',
        alertLevel,
        alertAck,
        sourceRows: bucket.sourceRows,
      }
    })
    .sort((left, right) => {
      if (left.dayKey !== right.dayKey) {
        return left.dayKey < right.dayKey ? 1 : -1
      }

      const leftStart = new Date(toIso(left.startAt) || 0).getTime()
      const rightStart = new Date(toIso(right.startAt) || 0).getTime()
      return rightStart - leftStart
    })
}

function renderWorkerDetailRows(rows) {
  const root = document.getElementById('wtdSumRows')
  if (!root) {
    return
  }

  if (!rows.length) {
    root.innerHTML = `
      <div class="events-row">
        <div>Brak wyników</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
      </div>
    `
    return
  }

  const canEdit = workerDetailCanEdit()

  root.innerHTML = rows
    .map((row) => {
      const alertClass = !row.alertAck && row.alertLevel === 2 ? ' wt-alert-level-2' : !row.alertAck && row.alertLevel === 1 ? ' wt-alert-level-1' : ''
      const actionCell = canEdit
        ? `<button class="btn2" type="button" data-worker-detail-edit="${escapeHtml(row.dayKey)}">Edytuj</button>`
        : '<span class="muted">—</span>'

      return `
        <div class="events-row${alertClass}">
          <div class="mono">${escapeHtml(workerDetailDateKeyToLabel(row.dayKey))}</div>
          <div>${escapeHtml(row.workerName || appState.selectedWorkerName || appState.selectedWorkerLogin || '-')}</div>
          <div>${escapeHtml(row.workerType || '-')}</div>
          <div class="mono time-start">${escapeHtml(workerDetailIsoToTime(row.startAt))}</div>
          <div class="mono time-stop">${escapeHtml(workerDetailIsoToTime(row.endAt))}</div>
          <div class="mono work-brutto time-duration">${escapeHtml(durationSecondsToHms(row.workSec))}</div>
          <div class="mono work-bold time-duration">${escapeHtml(durationSecondsToHms(row.netSec))}</div>
          <div class="mono time-break">${escapeHtml(durationSecondsToHms(row.breakSec))}</div>
          <div>${escapeHtml(row.updatedBy || '-')}</div>
          <div>${actionCell}</div>
        </div>
      `
    })
    .join('')
}

function renderWorkerDetailCurrentPage() {
  const paged = paginate(appState.workerDetailRows, appState.workerDetailPage, appState.workerDetailPageSize)
  appState.workerDetailPage = paged.page
  renderWorkerDetailRows(paged.items)
  updateWorkerDetailPager(paged)
}

function paginate(items, page, pageSize) {
  const size = Math.max(Number(pageSize) || 50, 1)
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / size))
  const normalizedPage = Math.min(Math.max(Number(page) || 1, 1), totalPages)
  const start = (normalizedPage - 1) * size

  return {
    page: normalizedPage,
    pageSize: size,
    total,
    totalPages,
    items: items.slice(start, start + size),
  }
}

function updateWorkerDetailPager(paged) {
  const pageLabel = document.getElementById('wtdSumPageLabel')
  const shownLabel = document.getElementById('wtdSumShownLabel')
  const prevBtn = document.getElementById('wtdSumPrevBtn')
  const nextBtn = document.getElementById('wtdSumNextBtn')

  if (pageLabel) pageLabel.textContent = `Strona ${paged.page} / ${paged.totalPages}`
  if (shownLabel) shownLabel.textContent = `Wyświetlono: ${paged.items.length} · Wszystkie: ${paged.total} · Na stronę: ${paged.pageSize}`
  if (prevBtn) prevBtn.disabled = paged.page <= 1
  if (nextBtn) nextBtn.disabled = paged.page >= paged.totalPages
}

function fillWorkerDetailMonthPickForYear(year, selectedValue) {
  const monthPick = document.getElementById('wtdMonthPick')
  if (!monthPick || !Number.isFinite(year) || year < 2000 || year > 2100) {
    return
  }

  monthPick.innerHTML = ''
  for (let month = 1; month <= 12; month += 1) {
    const option = document.createElement('option')
    option.value = `${year}-${pad2(month)}`
    option.textContent = `${WORKER_DETAIL_MONTH_NAMES_PL[month - 1]} ${year}`
    monthPick.appendChild(option)
  }

  const fallback = `${year}-${pad2(new Date().getMonth() + 1)}`
  monthPick.value = selectedValue && monthPick.querySelector(`option[value="${selectedValue}"]`) ? selectedValue : fallback
}

function ensureWorkerDetailDefaults() {
  const from = document.getElementById('wtdFrom')
  const to = document.getElementById('wtdTo')

  if (from && !String(from.value ?? '').trim()) from.value = firstDayOfCurrentMonthYmd()
  if (to && !String(to.value ?? '').trim()) to.value = todayYmd()

  const toValue = String(to?.value ?? '').trim()
  const year = /^\d{4}-\d{2}-\d{2}$/.test(toValue) ? Number(toValue.slice(0, 4)) : new Date().getFullYear()
  const selectedMonth = /^\d{4}-\d{2}-\d{2}$/.test(toValue)
    ? toValue.slice(0, 7)
    : `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}`
  fillWorkerDetailMonthPickForYear(year, selectedMonth)
}

function applyMonthPickToWorkerDetail(monthValue) {
  const from = document.getElementById('wtdFrom')
  const to = document.getElementById('wtdTo')
  const value = String(monthValue ?? '').trim()

  if (!from || !to || !/^\d{4}-\d{2}$/.test(value)) {
    return
  }

  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const now = new Date()
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month
  const lastDay = isCurrentMonth ? now.getDate() : new Date(year, month, 0).getDate()

  from.value = `${value}-01`
  to.value = `${value}-${pad2(lastDay)}`
}

function ensureWorkerDetailModalLogo() {
  const logo = document.getElementById('wtdLogo')
  if (!logo) {
    return
  }

  if (String(logo.getAttribute('src') ?? '').trim()) {
    return
  }

  const source = document.querySelector('.header .logo-block img')
  const src = String(source?.getAttribute('src') ?? '').trim()
  if (src) {
    logo.setAttribute('src', src)
    return
  }

  logo.style.display = 'none'
}

function openWorkerDetailDayEditor(item) {
  if (!workerDetailCanEdit()) {
    alert('Brak uprawnień do edycji (ADMIN/Kierownik).')
    return
  }

  ensureWorkerDetailModalLogo()

  const dayItem = item ? { ...item, mode: 'edit' } : null
  if (!dayItem) {
    return
  }

  appState.workerDetailDayEditorItem = dayItem

  const dateInput = document.getElementById('wtdDayDateInput')
  const startInput = document.getElementById('wtdDayStartTime')
  const endInput = document.getElementById('wtdDayEndTime')
  const commentInput = document.getElementById('wtdDayComment')
  const title = document.getElementById('wtdDayTitle')
  const ackButton = document.getElementById('wtdDayAckBtn')
  const overlay = document.getElementById('wtdDayEditorOverlay')

  if (title) title.textContent = 'Edycja dnia pracy'
  if (dateInput) dateInput.value = dayItem.dayKey || workerDetailIsoToDateInput(dayItem.startAt || dayItem.endAt)
  if (startInput) startInput.value = workerDetailIsoToTimeInput(dayItem.startAt)
  if (endInput) endInput.value = workerDetailIsoToTimeInput(dayItem.endAt)
  if (commentInput) commentInput.value = String(dayItem.comment ?? '')

  if (ackButton) {
    const showAck = Number(dayItem.alertLevel ?? 0) > 0 && !dayItem.alertAck
    ackButton.style.display = showAck ? '' : 'none'
    ackButton.disabled = false
    ackButton.textContent = 'Zatwierdź przekroczenie normy'
  }

  updateWorkerDetailDayPreview()
  if (overlay) overlay.style.display = 'flex'
}

function openWorkerDetailDayEditorNew() {
  if (!workerDetailCanEdit()) {
    alert('Brak uprawnień do edycji (ADMIN/Kierownik).')
    return
  }

  ensureWorkerDetailModalLogo()

  const dateInput = document.getElementById('wtdDayDateInput')
  const startInput = document.getElementById('wtdDayStartTime')
  const endInput = document.getElementById('wtdDayEndTime')
  const commentInput = document.getElementById('wtdDayComment')
  const title = document.getElementById('wtdDayTitle')
  const ackButton = document.getElementById('wtdDayAckBtn')
  const overlay = document.getElementById('wtdDayEditorOverlay')

  appState.workerDetailDayEditorItem = { mode: 'add' }

  if (title) title.textContent = 'Dodaj dzień pracy'
  if (dateInput) dateInput.value = String(document.getElementById('wtdTo')?.value ?? '').trim() || todayYmd()
  if (startInput) startInput.value = ''
  if (endInput) endInput.value = ''
  if (commentInput) commentInput.value = ''
  if (ackButton) ackButton.style.display = 'none'

  updateWorkerDetailDayPreview()
  if (overlay) overlay.style.display = 'flex'
}

function closeWorkerDetailDayEditor() {
  const overlay = document.getElementById('wtdDayEditorOverlay')
  if (overlay) {
    overlay.style.display = 'none'
  }

  appState.workerDetailDayEditorItem = null
}

function updateWorkerDetailDayPreview() {
  const workInput = document.getElementById('wtdDayWork')
  if (!workInput) {
    return
  }

  const dateValue = String(document.getElementById('wtdDayDateInput')?.value ?? '').trim()
  const startValue = String(document.getElementById('wtdDayStartTime')?.value ?? '').trim()
  const endValue = String(document.getElementById('wtdDayEndTime')?.value ?? '').trim()

  const startAt = workerDetailLocalDateAndTimeToIso(dateValue, startValue)
  const endAt = workerDetailLocalDateAndTimeToIso(dateValue, endValue)
  const seconds = workerDetailComputeRangeSeconds(startAt, endAt)

  workInput.value = durationSecondsToHms(seconds)
}

async function saveWorkerDetailDayEditor() {
  if (!appState.session?.orgId || !appState.selectedWorkerLogin) {
    return
  }

  const mode = String(appState.workerDetailDayEditorItem?.mode ?? 'edit').trim()
  const dateValue = String(document.getElementById('wtdDayDateInput')?.value ?? '').trim()
  const startValue = String(document.getElementById('wtdDayStartTime')?.value ?? '').trim()
  const endValue = String(document.getElementById('wtdDayEndTime')?.value ?? '').trim()
  const comment = String(document.getElementById('wtdDayComment')?.value ?? '').trim()

  if (!dateValue || !startValue || !endValue) {
    alert('Uzupełnij datę, start i koniec.')
    return
  }

  const startAt = workerDetailLocalDateAndTimeToIso(dateValue, startValue)
  const endAt = workerDetailLocalDateAndTimeToIso(dateValue, endValue)
  if (!startAt || !endAt) {
    alert('Niepoprawny format daty lub czasu.')
    return
  }

  const durationSec = workerDetailComputeRangeSeconds(startAt, endAt)
  if (durationSec <= 0) {
    alert('Koniec pracy musi być późniejszy niż start.')
    return
  }

  if (durationSec > 24 * 3600) {
    alert('Czas pracy > 24h - sprawdź dane.')
    return
  }

  const saveButton = document.getElementById('wtdDaySaveBtn')
  if (saveButton) {
    saveButton.disabled = true
    saveButton.textContent = 'Zapisywanie...'
  }

  try {
    const editorName = workerDetailCurrentUserName()

    if (mode === 'add') {
      const dayAlreadyExists = appState.workerDetailRows.some((row) => row.dayKey === dateValue)
      if (dayAlreadyExists) {
        throw new Error(`Dzień ${dateValue} już istnieje. Użyj edycji.`)
      }

      await createWorkday(appState.session.orgId, {
        workerLogin: appState.selectedWorkerLogin,
        workerName: appState.selectedWorkerName || appState.selectedWorkerLogin,
        startAt,
        endAt,
        durationSec,
        status: 'CLOSED',
        comment,
        updatedBy: editorName,
      })
    } else {
      const dayKey = String(appState.workerDetailDayEditorItem?.dayKey ?? '').trim()
      const sourceRows =
        appState.workerDetailDayEditorItem?.sourceRows?.length > 0
          ? appState.workerDetailDayEditorItem.sourceRows
          : appState.workerDetailSourceRows.filter((row) => {
              const rowDayKey = String(row.dayKey ?? '').trim() || workerDetailDateKeyFromIso(row.startAt || row.endAt)
              return rowDayKey === dayKey
            })

      if (!sourceRows.length) {
        throw new Error('Nie znaleziono rekordów do aktualizacji dnia.')
      }

      let updatedCount = 0
      for (const source of sourceRows) {
        const workdayId = String(source.workdayId ?? source.id ?? '').trim()
        if (!workdayId) {
          continue
        }

        await updateWorkday(appState.session.orgId, workdayId, {
          workerLogin: appState.selectedWorkerLogin,
          workerName: appState.selectedWorkerName || appState.selectedWorkerLogin,
          utilityRoomId: source.utilityRoomId || source.roomId || null,
          startAt,
          endAt,
          durationSec,
          status: 'CLOSED',
          comment,
          updatedBy: editorName,
        })
        updatedCount += 1
      }

      if (!updatedCount) {
        throw new Error('Nie znaleziono poprawnego WorkdayID do aktualizacji.')
      }
    }

    closeWorkerDetailDayEditor()
    await fetchWorkerDetailForCurrentSession()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Błąd zapisu dnia pracy.'
    alert(message)
  } finally {
    if (saveButton) {
      saveButton.disabled = false
      saveButton.textContent = 'Zapisz'
    }
  }
}

function ackWorkerDetailDay() {
  const item = appState.workerDetailDayEditorItem
  if (!item?.dayKey) {
    return
  }

  workerDetailSetAck(item.dayKey, true)
  appState.workerDetailRows = appState.workerDetailRows.map((row) =>
    row.dayKey === item.dayKey ? { ...row, alertAck: true } : row,
  )

  const ackButton = document.getElementById('wtdDayAckBtn')
  if (ackButton) {
    ackButton.style.display = 'none'
    ackButton.disabled = false
    ackButton.textContent = 'Zatwierdź przekroczenie normy'
  }

  renderWorkerDetailCurrentPage()
}

function workerDetailToCsvLine(values) {
  return values
    .map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`)
    .join(',')
}

function workerDetailSanitizeFilename(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
}

function downloadWorkerDetailEwidencja() {
  if (!appState.workerDetailRows.length) {
    alert('Brak danych do eksportu.')
    return
  }

  const lines = []
  lines.push(
    workerDetailToCsvLine([
      'Data',
      'Pracownik',
      'Typ',
      'Start pracy',
      'Koniec pracy',
      'Czas pracy',
      'Realny czas pracy',
      'Przerwa',
      'Edytował',
      'Komentarz',
      'Alert',
      'ACK',
    ]),
  )

  ;[...appState.workerDetailRows]
    .sort((left, right) => (left.dayKey > right.dayKey ? 1 : -1))
    .forEach((row) => {
      lines.push(
        workerDetailToCsvLine([
          workerDetailDateKeyToLabel(row.dayKey),
          row.workerName || '-',
          row.workerType || '-',
          workerDetailIsoToTime(row.startAt),
          workerDetailIsoToTime(row.endAt),
          durationSecondsToHms(row.workSec),
          durationSecondsToHms(row.netSec),
          durationSecondsToHms(row.breakSec),
          row.updatedBy || '-',
          row.comment || '',
          row.alertLevel || 0,
          row.alertAck ? 'TAK' : 'NIE',
        ]),
      )
    })

  const csv = lines.join('\n')
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const month = String(document.getElementById('wtdMonthPick')?.value ?? todayYmd().slice(0, 7)).trim()
  const workerLabel = workerDetailSanitizeFilename(appState.selectedWorkerName || appState.selectedWorkerLogin || 'pracownik')

  link.href = url
  link.download = `ewidencja-pracy-${month}-${workerLabel || 'pracownik'}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function fetchWorkerDetailForCurrentSession({ resetPage = false } = {}) {
  const root = document.getElementById('wtdSumRows')
  setWorkerDetailHeadings()

  if (!appState.session?.orgId || !appState.selectedWorkerLogin) {
    if (root) {
      root.innerHTML = `
        <div class="events-row">
          <div>Wybierz pracownika na widoku Czas pracy pracownika.</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
        </div>
      `
    }
    return
  }

  ensureWorkerDetailDefaults()
  if (resetPage) appState.workerDetailPage = 1

  if (root) {
    root.innerHTML = `
      <div class="events-row">
        <div>Ładowanie danych...</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
      </div>
    `
  }

  try {
    const response = await getWorkerTime(appState.session.orgId, appState.selectedWorkerLogin, {
      fromIso: ymdToIsoRangeStart(document.getElementById('wtdFrom')?.value),
      toIso: ymdToIsoRangeEnd(document.getElementById('wtdTo')?.value),
      page: 1,
      pageSize: 5000,
    })

    appState.workerDetailSourceRows = response.items ?? []
    appState.workerDetailViewRows = workerDetailAggregateRows(appState.workerDetailSourceRows)
    appState.workerDetailRows = appState.workerDetailViewRows

    renderWorkerDetailCurrentPage()
    setWorkerDetailMonthCard(appState.workerDetailRows)
  } catch (error) {
    appState.workerDetailSourceRows = []
    appState.workerDetailViewRows = []
    appState.workerDetailRows = []
    const message = error instanceof Error ? error.message : 'Błąd pobierania czasu pracy.'
    if (root) {
      root.innerHTML = `
        <div class="events-row">
          <div style="color:#ef4444;">${escapeHtml(message)}</div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>
        </div>
      `
    }
    updateWorkerDetailPager(paginate([], 1, appState.workerDetailPageSize))
    setWorkerDetailMonthCard([])
  }
}

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

function normalizeSearchText(value) {
  const lowered = String(value ?? '')
    .trim()
    .toLocaleLowerCase('pl')
  const normalized = typeof lowered.normalize === 'function' ? lowered.normalize('NFD') : lowered
  return normalized.replace(/[\u0300-\u036f]/g, '')
}

function reportHistoryFilterOptions(options, query) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) {
    return [...options]
  }

  return options.filter((option) => {
    const label = normalizeSearchText(option.label)
    const value = normalizeSearchText(option.value)
    return label.includes(normalizedQuery) || value.includes(normalizedQuery)
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

  const clientOptions = appState.clients.map((client) => ({
    value: String(client.id ?? ''),
    label: client.name ? `${client.name} (${client.id})` : String(client.id ?? ''),
  }))
  clientOptions.sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))
  const workerOptions = appState.workers.map((worker) => ({
    value: String(worker.login ?? worker.id ?? ''),
    label: worker.name || worker.login || worker.id,
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
  reportHistorySetStatus('Wybierz filtr i kliknij "Pokaz historie".')
  reportSetKpiValues()
  reportResetCharts()
  reportSetStatus('Wybierz klienta w panelu A i B, a nastepnie uruchom porownanie.')
}

function reportHistoryNormalizeTab(value) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'workers' || normalized === 'zones') {
    return normalized
  }

  return 'objects'
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
  const workerLine = isWorkersTab ? `<div><b>Osoba:</b> ${escapeHtml(selectedWorkerLabel || '-')}</div>` : ''

  summary.innerHTML = `
    <div class="rep-summary-card">
      ${workerLine}
      <div><b>Dni:</b> ${days}</div>
      <div><b>Wpisy:</b> ${events} · <b>RUNNING:</b> ${running}</div>
      <div><b>Czas CLOSED:</b> ${durationSecondsToHms(closedSec)}</div>
    </div>
  `
  reportSetVisible('repHistorySummary', true)
}

function reportHistoryRenderDetails(row, tab) {
  const details = Array.isArray(row.details) ? row.details : []
  if (!details.length) {
    return '<div class="rep-history-empty">Brak szczegolow.</div>'
  }

  if (tab === 'zones') {
    const body = details
      .map(
        (detail) => `
          <tr>
            <td>${escapeHtml(detail.zoneLabel || '-')}</td>
            <td>${escapeHtml(detail.locationLabel || '-')}</td>
            <td>${escapeHtml(detail.workerLabel || '-')}</td>
            <td class="time-start">${escapeHtml(detail.startLabel || '-')}</td>
            <td class="time-stop">${escapeHtml(detail.stopLabel || '-')}</td>
            <td class="ta-right">${escapeHtml(detail.durationLabel || '-')}</td>
            <td class="ta-right">${escapeHtml(detail.statusLabel || '-')}</td>
          </tr>
        `,
      )
      .join('')

    return `
      <div class="rep-history-detail">
        <table class="rep-history-detail-table">
          <thead>
            <tr><th>Strefa</th><th>Lokalizacja strefy</th><th>Osoba</th><th class="time-start">Godzina start</th><th class="time-stop">Godzina stop</th><th class="ta-right">Czas</th><th class="ta-right">Status</th></tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `
  }

  if (tab === 'workers') {
    const detailsBody = details
      .map(
        (detail) => `
          <tr>
            <td>${escapeHtml(detail.clientLabel || '-')}</td>
            <td>${escapeHtml(detail.zoneLabel || '-')}</td>
            <td>${escapeHtml(detail.locationLabel || '-')}</td>
            <td class="time-start">${escapeHtml(detail.startLabel || '-')}</td>
            <td class="time-stop">${escapeHtml(detail.stopLabel || '-')}</td>
            <td class="ta-right">${escapeHtml(detail.durationLabel || '-')}</td>
            <td class="ta-right">${escapeHtml(detail.statusLabel || '-')}</td>
          </tr>
        `,
      )
      .join('')
    const qrStartRow = `
      <tr class="rep-history-marker-row">
        <td>${escapeHtml(row.qrStartClientLabel || '-')}</td>
        <td>${escapeHtml(row.qrStartZoneCode || '-')}</td>
        <td>${reportHistoryGeoCellHtml(row.qrStartGeoLabel || '-')}</td>
        <td class="time-start">${escapeHtml(row.qrStartLabel || '-')}</td>
        <td class="time-stop">-</td>
        <td class="ta-right">-</td>
        <td class="ta-right">QR START</td>
      </tr>
    `
    const qrStopRow = `
      <tr class="rep-history-marker-row">
        <td>${escapeHtml(row.qrStopClientLabel || '-')}</td>
        <td>${escapeHtml(row.qrStopZoneCode || '-')}</td>
        <td>${reportHistoryGeoCellHtml(row.qrStopGeoLabel || '-')}</td>
        <td class="time-start">-</td>
        <td class="time-stop">${escapeHtml(row.qrStopLabel || '-')}</td>
        <td class="ta-right">-</td>
        <td class="ta-right">QR STOP</td>
      </tr>
    `
    const body = `${qrStopRow}${detailsBody}${qrStartRow}`

    return `
      <div class="rep-history-detail">
        <table class="rep-history-detail-table">
          <thead>
            <tr><th>Klient</th><th>Strefa</th><th>Lokalizacja strefy</th><th class="time-start">Godzina start</th><th class="time-stop">Godzina stop</th><th class="ta-right">Czas</th><th class="ta-right">Status</th></tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `
  }

  const body = details
    .map(
      (detail) => `
        <tr>
          <td>${escapeHtml(detail.zoneLabel || '-')}</td>
          <td>${escapeHtml(detail.locationLabel || '-')}</td>
          <td>${escapeHtml(detail.workerLabel || '-')}</td>
          <td class="time-start">${escapeHtml(detail.startLabel || '-')}</td>
          <td class="time-stop">${escapeHtml(detail.stopLabel || '-')}</td>
          <td class="ta-right">${escapeHtml(detail.durationLabel || '-')}</td>
          <td class="ta-right">${escapeHtml(detail.statusLabel || '-')}</td>
        </tr>
      `,
    )
    .join('')

  return `
    <div class="rep-history-detail">
      <table class="rep-history-detail-table">
        <thead>
          <tr><th>Strefa</th><th>Lokalizacja strefy</th><th>Osoba</th><th class="time-start">Godzina start</th><th class="time-stop">Godzina stop</th><th class="ta-right">Czas</th><th class="ta-right">Status</th></tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `
}

function reportHistoryRenderTable() {
  const table = document.getElementById('repHistoryTable')
  if (!table) {
    return
  }

  const tab = reportHistoryNormalizeTab(appState.reportHistoryTab)
  const rows = Array.isArray(appState.reportHistoryRows) ? appState.reportHistoryRows : []
  const detailLabel = 'Szczegoly'
  const headHtml = `
    <thead>
      <tr>
        <th></th>
        <th>Data</th>
        <th class="ta-right">Wpisy</th>
        <th class="ta-right">Czas CLOSED</th>
        <th class="ta-right">RUNNING</th>
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
      const actionLabel = expanded ? 'Zwin' : 'Rozwin'
      const dayLabel = formatDatePl(`${dayKey}T00:00:00.000Z`)
      const detailHtml = reportHistoryRenderDetails(row, tab)

      return `
        <tr class="rep-history-main-row">
          <td><button class="btn2 rep-history-toggle" type="button" data-rep-history-toggle="${escapeHtml(dayKey)}">${actionLabel}</button></td>
          <td>${escapeHtml(dayLabel)}</td>
          <td class="ta-right">${escapeHtml(String(row.countAll ?? 0))}</td>
          <td class="ta-right">${escapeHtml(durationSecondsToHms(row.closedSec || 0))}</td>
          <td class="ta-right">${escapeHtml(String(row.runningCount ?? 0))}</td>
          <td class="ta-right">${escapeHtml(String((row.details || []).length))}</td>
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
  const regex = /(CLEAN_START_GPS|CLEAN_STOP_GPS|START_GPS|STOP_GPS)[^|]*?lat\s*=\s*(-?\d+(?:\.\d+)?)\s*lon\s*=\s*(-?\d+(?:\.\d+)?)/gi
  let match = regex.exec(raw)
  while (match) {
    entries.push({
      label: String(match[1] ?? '').toUpperCase(),
      lat: String(match[2] ?? '').trim(),
      lon: String(match[3] ?? '').trim(),
    })
    match = regex.exec(raw)
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

  if (entries[0]?.lat && entries[0]?.lon) {
    return `${entries[0].lat}, ${entries[0].lon}`
  }

  const fallback = raw.match(/lat\s*=\s*(-?\d+(?:\.\d+)?)\s*lon\s*=\s*(-?\d+(?:\.\d+)?)/i)
  if (fallback?.[1] && fallback?.[2]) {
    return `${fallback[1]}, ${fallback[2]}`
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
  if (roomCode) {
    return roomCode
  }

  const zoneCode = reportHistoryNormalizeQrCode(item?.zoneId ?? item?.utilityRoomId ?? item?.roomId)
  return zoneCode || '-'
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
  if (roomCode) {
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
  const fallbackLabel = String(fallback ?? '').trim() || '-'
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
  return clientLabel || fallbackLabel
}

function reportHistoryResolveDayGpsCoords(item, phase) {
  const normalizedPhase = String(phase ?? '').trim().toLowerCase() === 'start' ? 'start' : 'stop'
  const fromGps = reportHistoryExtractGpsCoords(item?.dayGps ?? item?.gps, normalizedPhase)
  if (fromGps) {
    return fromGps
  }

  const fromComment = reportHistoryExtractGpsCoords(item?.dayComment ?? item?.comment, normalizedPhase)
  return fromComment || '-'
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
        details: [],
      })
    }

    const bucket = groups.get(dayKey)
    const status = reportHistoryResolveStatus(item)
    const closedSec = reportHistoryClosedDurationSec(item)
    const startIso = toIso(item?.startAt)
    const endIso = toIso(item?.endAt)
    const sortStartTs = reportHistoryToTimestamp(startIso)
    const sortEndTs = reportHistoryToTimestamp(endIso) || sortStartTs
    const dayStartIso = toIso(item?.dayStartAt) || startIso || endIso
    const dayEndIso = toIso(item?.dayEndAt) || endIso
    const dayStartTs = reportHistoryToTimestamp(dayStartIso)
    const dayEndTs = reportHistoryToTimestamp(dayEndIso)
    const clientLabel = String(item.clientName ?? item.klient ?? '-').trim() || '-'
    const qrStartCandidate = reportHistoryResolveDayQrCandidate(item, 'start')
    const qrStopCandidate = reportHistoryResolveDayQrCandidate(item, 'stop')
    const qrStartZoneCode = qrStartCandidate.code
    const qrStopZoneCode = qrStopCandidate.code
    const qrStartClientLabel = reportHistoryResolveClientByZoneCode(qrStartZoneCode, clientLabel)
    const qrStopClientLabel = reportHistoryResolveClientByZoneCode(qrStopZoneCode, clientLabel)
    const qrStartGeoLabel = reportHistoryResolveDayGpsCoords(item, 'start')
    const qrStopGeoLabel = reportHistoryResolveDayGpsCoords(item, 'stop')

    bucket.countAll += 1
    bucket.closedSec += closedSec
    if (status === 'RUNNING') {
      bucket.runningCount += 1
    }
    if (dayStartTs && (!bucket.dayStartTs || dayStartTs < bucket.dayStartTs)) {
      bucket.dayStartTs = dayStartTs
      bucket.dayStartIso = dayStartIso
      bucket.dayStartClientLabel = qrStartClientLabel
      bucket.dayStartZoneCode = qrStartZoneCode
      bucket.dayStartGeoLabel = qrStartGeoLabel
      bucket.dayStartQrScore = qrStartCandidate.score
      bucket.dayStartEventTs = sortStartTs
    } else if (dayStartTs && dayStartTs === bucket.dayStartTs) {
      const replaceByScore = qrStartCandidate.score > Number(bucket.dayStartQrScore ?? 0)
      const replaceByEventTs =
        qrStartCandidate.score === Number(bucket.dayStartQrScore ?? 0) &&
        sortStartTs > 0 &&
        (Number(bucket.dayStartEventTs ?? 0) <= 0 || sortStartTs < Number(bucket.dayStartEventTs ?? 0))
      const replaceByMissing = (bucket.dayStartZoneCode === '-' || !bucket.dayStartZoneCode) && qrStartZoneCode !== '-'
      if (replaceByScore || replaceByEventTs || replaceByMissing) {
        bucket.dayStartZoneCode = qrStartZoneCode
        bucket.dayStartClientLabel = qrStartClientLabel
        bucket.dayStartQrScore = qrStartCandidate.score
        bucket.dayStartEventTs = sortStartTs
      }
      if ((bucket.dayStartGeoLabel === '-' || !bucket.dayStartGeoLabel) && qrStartGeoLabel !== '-') {
        bucket.dayStartGeoLabel = qrStartGeoLabel
      }
    }
    if (dayEndTs && dayEndTs > bucket.dayEndTs) {
      bucket.dayEndTs = dayEndTs
      bucket.dayEndIso = dayEndIso
      bucket.dayEndClientLabel = qrStopClientLabel
      bucket.dayEndZoneCode = qrStopZoneCode
      bucket.dayEndGeoLabel = qrStopGeoLabel
      bucket.dayEndQrScore = qrStopCandidate.score
      bucket.dayEndEventTs = sortEndTs
    } else if (dayEndTs && dayEndTs === bucket.dayEndTs) {
      const replaceByScore = qrStopCandidate.score > Number(bucket.dayEndQrScore ?? 0)
      const replaceByEventTs =
        qrStopCandidate.score === Number(bucket.dayEndQrScore ?? 0) &&
        sortEndTs > 0 &&
        (Number(bucket.dayEndEventTs ?? 0) <= 0 || sortEndTs > Number(bucket.dayEndEventTs ?? 0))
      const replaceByMissing = (bucket.dayEndZoneCode === '-' || !bucket.dayEndZoneCode) && qrStopZoneCode !== '-'
      if (replaceByScore || replaceByEventTs || replaceByMissing) {
        bucket.dayEndZoneCode = qrStopZoneCode
        bucket.dayEndClientLabel = qrStopClientLabel
        bucket.dayEndQrScore = qrStopCandidate.score
        bucket.dayEndEventTs = sortEndTs
      }
      if ((bucket.dayEndGeoLabel === '-' || !bucket.dayEndGeoLabel) && qrStopGeoLabel !== '-') {
        bucket.dayEndGeoLabel = qrStopGeoLabel
      }
    }

    if (normalizedTab === 'workers') {
      bucket.details.push({
        clientLabel: String(item.clientName ?? item.klient ?? '-').trim() || '-',
        zoneLabel: String(item.zoneName ?? item.strefa ?? '-').trim() || '-',
        locationLabel: String(item.lokalizacja ?? item.location ?? '-').trim() || '-',
        startLabel: formatTime(startIso),
        stopLabel: status === 'RUNNING' ? '-' : formatTime(endIso),
        durationLabel: reportHistoryDurationLabel(item),
        statusLabel: status,
        sortStartTs,
        sortEndTs,
      })
      return
    }

    bucket.details.push({
      zoneLabel: String(item.zoneName ?? item.strefa ?? '-').trim() || '-',
      locationLabel: String(item.lokalizacja ?? item.location ?? '-').trim() || '-',
      workerLabel: String(item.workerName ?? item.workerLogin ?? '-').trim() || '-',
      startLabel: formatTime(startIso),
      stopLabel: status === 'RUNNING' ? '-' : formatTime(endIso),
      durationLabel: reportHistoryDurationLabel(item),
      statusLabel: status,
      sortStartTs,
      sortEndTs,
    })
  })

  return [...groups.values()]
    .map((bucket) => {
      const dayRangeSec =
        bucket.dayStartTs && bucket.dayEndTs && bucket.dayEndTs > bucket.dayStartTs
          ? Math.floor((bucket.dayEndTs - bucket.dayStartTs) / 1000)
          : 0
      return {
        ...bucket,
        closedSec: normalizedTab === 'workers' ? dayRangeSec : bucket.closedSec,
        qrStartLabel: formatTime(bucket.dayStartIso),
        qrStopLabel: formatTime(bucket.dayEndIso),
        qrStartClientLabel: bucket.dayStartClientLabel || '-',
        qrStopClientLabel: bucket.dayEndClientLabel || '-',
        qrStartZoneCode: bucket.dayStartZoneCode || '-',
        qrStopZoneCode: bucket.dayEndZoneCode || '-',
        qrStartGeoLabel: bucket.dayStartGeoLabel || '-',
        qrStopGeoLabel: bucket.dayEndGeoLabel || '-',
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
  reportHistorySetStatus('Ladowanie historii...')

  try {
    const items = await reportFetchEventsPaged(appState.session.orgId, {
      source: 'events',
      fromIso: ymdToIsoRangeStart(filters.from),
      toIso: ymdToIsoRangeEnd(filters.to),
    })

    let filtered = items
    if (filters.tab === 'objects') {
      filtered = items.filter((item) =>
        reportMatchesPanelSelection(item, { clientId: filters.clientId, zoneId: '', workerLogin: '' }),
      )
    } else if (filters.tab === 'workers') {
      filtered = items.filter((item) =>
        reportMatchesPanelSelection(item, { clientId: '', zoneId: '', workerLogin: filters.workerLogin }),
      )
    } else if (filters.tab === 'zones') {
      filtered = items.filter((item) =>
        reportMatchesPanelSelection(item, { clientId: '', zoneId: filters.zoneId, workerLogin: '' }),
      )
    }

    appState.reportHistoryRows = reportHistoryBuildRows(filtered, filters.tab)
    appState.reportHistoryExpanded = {}
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
  reportSetVisible('repHome', false)
  reportSetVisible('repBuilder', true)
  reportResetResults()

  if (kind === 'events') {
    if (title) title.textContent = 'Zestawienie zdarzeń'
    if (subtitle) subtitle.textContent = 'Porównanie panelu A i B dla zamkniętych zdarzeń (strefa i pracownik opcjonalne).'
    reportSetVisible('repEvents', true)
    reportSetVisible('repHistory', false)
    reportSetVisible('repSoon', false)
    reportSetStatus('Wybierz klienta w panelu A i B, strefa i pracownik sa opcjonalne.')
    return
  }

  if (kind === 'history') {
    if (title) title.textContent = 'Historia'
    if (subtitle) subtitle.textContent = 'Historia dnia dla obiektu, osoby lub strefy.'
    reportSetVisible('repEvents', false)
    reportSetVisible('repHistory', true)
    reportSetVisible('repSoon', false)
    reportHistoryApplyAllSelectFilters()
    reportHistorySetTab(appState.reportHistoryTab)
    reportHistoryApplyRangeMode(reportHistoryReadRangeMode(), { force: false })
    reportHistoryResetResults({ clearStatus: false })
    reportHistorySetStatus('Wybierz filtr i kliknij "Pokaz historie".')
    return
  }

  if (title) title.textContent = 'Wkrótce'
  if (subtitle) subtitle.textContent = 'Ten typ zestawienia dodamy w kolejnym etapie.'
  reportSetVisible('repEvents', false)
  reportSetVisible('repHistory', false)
  reportSetVisible('repSoon', true)
}

function closeReportBuilder() {
  reportSetVisible('repBuilder', false)
  reportSetVisible('repHome', true)
  reportSetVisible('repEvents', false)
  reportSetVisible('repHistory', false)
  reportSetVisible('repSoon', false)
  reportGeoHidePreview()
  reportGeoCloseModal()
  reportResetResults()
}

async function reportFetchEventsPaged(orgId, filters = {}) {
  const pageSize = Math.max(Number(filters.pageSize ?? 1000) || 1000, 1)
  const maxPages = Math.max(Number(filters.maxPages ?? 200) || 200, 1)
  const baseFilters = {
    ...filters,
    pageSize,
  }
  delete baseFilters.maxPages

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

function reportNormalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function reportMatchesPanelSelection(item, panel) {
  if (panel.clientId) {
    const itemClientId = String(item.clientId ?? '').trim()
    if (itemClientId === panel.clientId) {
      // pass
    } else {
      const selectedClient = appState.clients.find((client) => String(client.id ?? '').trim() === panel.clientId)
      const selectedClientName = reportNormalizeText(selectedClient?.name)
      const itemClientName = reportNormalizeText(item.clientName ?? item.klient)
      if (!selectedClientName || !itemClientName || itemClientName !== selectedClientName) {
        return false
      }
    }
  }

  if (panel.zoneId) {
    const itemZoneId = String(item.zoneId ?? item.utilityRoomId ?? item.roomId ?? '').trim()
    if (itemZoneId === panel.zoneId) {
      // pass
    } else {
      const selectedZone = appState.zones.find((zone) => String(zone.id ?? '').trim() === panel.zoneId)
      const selectedZoneName = reportNormalizeText(selectedZone?.name ?? selectedZone?.zone)
      const itemZoneName = reportNormalizeText(item.zoneName ?? item.strefa)
      if (!selectedZoneName || !itemZoneName || itemZoneName !== selectedZoneName) {
        return false
      }
    }
  }

  if (panel.workerLogin) {
    const itemWorkerLogin = String(item.workerLogin ?? '').trim()
    if (itemWorkerLogin === panel.workerLogin) {
      // pass
    } else {
      const selectedWorker = appState.workers.find(
        (worker) => String(worker.login ?? worker.id ?? '').trim() === panel.workerLogin,
      )
      const selectedWorkerName = reportNormalizeText(selectedWorker?.name)
      const itemWorkerName = reportNormalizeText(item.workerName)
      if (!selectedWorkerName || !itemWorkerName || itemWorkerName !== selectedWorkerName) {
        return false
      }
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
            return `<td${style}>${escapeHtml(value)}</td>`
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

async function runEventsReportComparison() {
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
        client: row.clientName || row.klient || '-',
        zone: row.zoneName || row.strefa || '-',
        duration: durationSecondsToHms(Number(row.durationSec ?? 0)),
      }))
      const mappedB = rowsB.map((row) => ({
        date: row.date || formatDatePl(row.startAt),
        worker: row.workerName || row.workerLogin || '-',
        client: row.clientName || row.klient || '-',
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

function bindClientsViewFunctions() {
  const binding = createBindingHelpers()
  syncClientsPermissions()

  window.filterClientsTable = () => {
    filterClientsTable({ resetPage: true })
  }
  window.ClientsModule = {
    fetch: () => fetchClientsForCurrentSession(true),
  }
  window.openClientModal = () => openClientModal('add')
  window.openClientEditModal = (clientId) => openClientModal('edit', clientId)
  window.closeClModal = closeClientModal
  window.saveClientData = () => {
    void saveClientData()
  }
  window.deleteClientData = (clientId) => {
    void deleteClientData(clientId)
  }

  binding.add(document.getElementById('clSearchInput'), 'input', () => {
    filterClientsTable({ resetPage: true })
  })
  binding.add(document.getElementById('clSearchStatus'), 'change', () => {
    filterClientsTable({ resetPage: true })
  })
  ;['clSearchInput', 'clSearchStatus'].forEach((id) => {
    binding.add(document.getElementById(id), 'keydown', (event) => {
      if (event.key !== 'Enter') return
      filterClientsTable({ resetPage: true })
    })
  })

  binding.add(document.getElementById('clPrevBtn'), 'click', () => {
    if (appState.clientsPage <= 1) return
    appState.clientsPage -= 1
    filterClientsTable({ resetPage: false })
  })
  binding.add(document.getElementById('clNextBtn'), 'click', () => {
    if (appState.clientsPage >= appState.clientsTotalPages) return
    appState.clientsPage += 1
    filterClientsTable({ resetPage: false })
  })

  binding.add(document.getElementById('clientsBody'), 'click', (event) => {
    const button = event.target.closest('[data-client-action][data-client-id]')
    if (!button) {
      return
    }

    const action = String(button.getAttribute('data-client-action') ?? '').trim()
    const clientId = String(button.getAttribute('data-client-id') ?? '').trim()
    if (!clientId) {
      return
    }

    if (action === 'delete') {
      void deleteClientData(clientId)
      return
    }

    if (action === 'edit') {
      openClientModal('edit', clientId)
      return
    }

    openClientModal('view', clientId)
  })

  binding.add(document.getElementById('clModal'), 'click', (event) => {
    if (event.target?.id === 'clModal') {
      closeClientModal()
    }
  })

  return () => {
    delete window.filterClientsTable
    delete window.ClientsModule
    delete window.openClientModal
    delete window.openClientEditModal
    delete window.closeClModal
    delete window.saveClientData
    delete window.deleteClientData
    binding.done()
  }
}

function bindClientProfileViewFunctions() {
  const binding = createBindingHelpers()

  window.ClientProfileModule = {
    fetch: () => fetchClientProfileForCurrentSession(true),
  }
  window.closeCpModal = closeClientProfileModal
  window.cpEnterEdit = enterClientProfileEdit
  window.cpCancelEdit = cancelClientProfileEdit
  window.cpSaveEdit = () => {
    void saveClientProfileEdit()
  }

  binding.add(document.getElementById('cpSearchName'), 'input', filterClientProfileTable)
  binding.add(document.getElementById('cpSearchNip'), 'input', filterClientProfileTable)

  ;['cpSearchName', 'cpSearchNip'].forEach((id) => {
    binding.add(document.getElementById(id), 'keydown', (event) => {
      if (event.key !== 'Enter') return
      filterClientProfileTable()
    })
  })

  binding.add(document.getElementById('clientProfileBody'), 'click', (event) => {
    const button = event.target.closest('[data-client-profile-id]')
    if (!button) {
      return
    }

    const clientId = String(button.getAttribute('data-client-profile-id') ?? '').trim()
    if (!clientId) {
      return
    }

    openClientProfileModal(clientId)
  })

  binding.add(document.getElementById('cpModal'), 'click', (event) => {
    if (event.target?.id === 'cpModal') {
      closeClientProfileModal()
    }
  })

  return () => {
    delete window.ClientProfileModule
    delete window.closeCpModal
    delete window.cpEnterEdit
    delete window.cpCancelEdit
    delete window.cpSaveEdit
    binding.done()
  }
}

function bindSubmenuToggles() {
  const cleanups = []

  document.querySelectorAll('[data-toggle]').forEach((button) => {
    const handleClick = () => {
      const key = button.dataset.toggle
      const submenu = document.getElementById(`submenu-${key}`)
      if (submenu) {
        submenu.classList.toggle('open')
      }
    }

    button.addEventListener('click', handleClick)
    cleanups.push(() => button.removeEventListener('click', handleClick))
  })

  return () => {
    cleanups.forEach((cleanup) => cleanup())
  }
}

function bindRouteButtons(router) {
  const handleRouteClick = (event) => {
    const button = event.target.closest('[data-route]')
    if (!button) {
      return
    }

    const route = button.getAttribute('data-route')
    if (route) {
      router.go(route)
    }
  }

  document.addEventListener('click', handleRouteClick)

  return () => {
    document.removeEventListener('click', handleRouteClick)
  }
}

function createBindingHelpers() {
  const cleanups = []
  const add = (node, event, handler) => {
    if (!node) return
    node.addEventListener(event, handler)
    cleanups.push(() => node.removeEventListener(event, handler))
  }
  return { add, done: () => cleanups.forEach((cleanup) => cleanup()) }
}

function bindDashboardViewFunctions() {
  const binding = createBindingHelpers()

  binding.add(document.getElementById('dashRefreshBtn'), 'click', (event) => {
    void (async () => {
      if (!appState.session?.orgId) {
        return
      }

      const button =
        event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : document.getElementById('dashRefreshBtn')
      if (!button || button.disabled) {
        return
      }

      const defaultLabel = 'Odśwież'
      button.disabled = true
      button.textContent = 'Odświeżam...'

      try {
        await refreshDashboardWidgets()
        showTransientNotice('Lista aktywnych została odświeżona.')
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Nie udało się odświeżyć listy.'
        showTransientNotice(message, 'error')
      } finally {
        button.disabled = false
        button.textContent = defaultLabel
      }
    })()
  })

  return binding.done
}

function bindIndividualOrdersViewFunctions() {
  const binding = createBindingHelpers()
  individualOrdersSyncPermissions()

  binding.add(document.getElementById('ioRefresh'), 'click', () => {
    void fetchIndividualOrdersForCurrentSession({ resetPage: true })
  })

  binding.add(document.getElementById('ioAdd'), 'click', () => {
    if (!canManageIndividualOrders()) {
      alert('Brak uprawnień do dodawania zleceń indywidualnych.')
      return
    }

    individualOrdersOpenModal('add')
  })

  binding.add(document.getElementById('ioQ'), 'keydown', (event) => {
    if (event.key !== 'Enter') {
      return
    }

    void fetchIndividualOrdersForCurrentSession({ resetPage: true })
  })

  binding.add(document.getElementById('ioQ'), 'input', () => {
    if (individualOrdersSearchDebounceHandle) {
      clearTimeout(individualOrdersSearchDebounceHandle)
      individualOrdersSearchDebounceHandle = null
    }

    individualOrdersSearchDebounceHandle = setTimeout(() => {
      void fetchIndividualOrdersForCurrentSession({ resetPage: true })
      individualOrdersSearchDebounceHandle = null
    }, 300)
  })

  binding.add(document.getElementById('ioRows'), 'click', (event) => {
    const button = event.target?.closest?.('[data-io-act][data-io-index]')
    if (!button) {
      return
    }

    const index = Number(button.getAttribute('data-io-index'))
    const item = Number.isInteger(index) ? appState.individualOrdersRows[index] : null
    if (!item) {
      return
    }

    const action = String(button.getAttribute('data-io-act') ?? '').trim()
    if (action === 'qr') {
      openIndividualOrderQrModal(item.qrCode)
      return
    }

    if (action === 'edit') {
      if (!canManageIndividualOrders()) {
        alert('Brak uprawnień do edycji zleceń indywidualnych.')
        return
      }

      individualOrdersOpenModal('edit', item)
      return
    }

    if (action === 'del') {
      void deleteIndividualOrderFromRow(item)
    }
  })

  binding.add(document.getElementById('ioModalClose'), 'click', individualOrdersCloseModal)
  binding.add(document.getElementById('ioModalCancel'), 'click', individualOrdersCloseModal)
  binding.add(document.getElementById('ioModal'), 'click', (event) => {
    if (event.target?.id === 'ioModal') {
      individualOrdersCloseModal()
    }
  })

  binding.add(document.getElementById('ioModalSave'), 'click', () => {
    void saveIndividualOrderFromModal()
  })

  binding.add(document.getElementById('ioQrModalClose'), 'click', closeIndividualOrderQrModal)
  binding.add(document.getElementById('ioQrModalCancel'), 'click', closeIndividualOrderQrModal)
  binding.add(document.getElementById('ioQrModal'), 'click', (event) => {
    if (event.target?.id === 'ioQrModal') {
      closeIndividualOrderQrModal()
    }
  })
  binding.add(document.getElementById('ioQrModalPng'), 'click', () => {
    void downloadCurrentIndividualOrderQrPng()
  })
  binding.add(document.getElementById('ioQrModalPdf'), 'click', () => {
    void downloadCurrentIndividualOrderQrPdf()
  })

  return () => {
    if (individualOrdersSearchDebounceHandle) {
      clearTimeout(individualOrdersSearchDebounceHandle)
      individualOrdersSearchDebounceHandle = null
    }

    binding.done()
  }
}

function bindEventsViewFunctions() {
  const binding = createBindingHelpers()
  syncEventsActionPermissions()

  binding.add(document.getElementById('evSearchBtn'), 'click', () => {
    appState.eventsPage = 1
    void fetchEventsForCurrentSession()
  })

  binding.add(document.getElementById('evResetBtn'), 'click', () => {
    resetEventsFilters()
    appState.eventsPage = 1
    void fetchEventsForCurrentSession()
  })

  binding.add(document.getElementById('evPrevBtn'), 'click', () => {
    if (appState.eventsPage <= 1) return
    appState.eventsPage -= 1
    void fetchEventsForCurrentSession()
  })

  binding.add(document.getElementById('evNextBtn'), 'click', () => {
    if (appState.eventsPage >= appState.eventsTotalPages) return
    appState.eventsPage += 1
    void fetchEventsForCurrentSession()
  })

  binding.add(document.getElementById('evStatus'), 'change', () => {
    appState.eventsPage = 1
    void fetchEventsForCurrentSession()
  })

  binding.add(document.getElementById('evAddBtn'), 'click', () => {
    void openCreateEventEditor()
  })

  ;['evFrom', 'evTo', 'evWorker', 'evStrefa', 'evPom', 'evRoomId', 'evQ'].forEach((id) => {
    binding.add(document.getElementById(id), 'keydown', (event) => {
      if (event.key !== 'Enter') return
      appState.eventsPage = 1
      void fetchEventsForCurrentSession()
    })
  })

  binding.add(document.getElementById('evRows'), 'click', (event) => {
    const commentButton = event.target.closest('[data-event-comment]')
    if (commentButton) {
      const index = Number(commentButton.getAttribute('data-event-comment'))
      const row = Number.isInteger(index) ? appState.eventRows[index] : null
      if (row) {
        openEventCommentModal(row.comment)
      }
      return
    }

    const editButton = event.target.closest('[data-event-edit]')
    if (!editButton) {
      return
    }

    const index = Number(editButton.getAttribute('data-event-edit'))
    const row = Number.isInteger(index) ? appState.eventRows[index] : null
    if (!row) {
      return
    }

    void openEventEditor(row)
  })

  binding.add(document.getElementById('evCommentCloseBtn'), 'click', closeEventCommentModal)
  binding.add(document.getElementById('evCommentOverlay'), 'click', (event) => {
    if (event.target?.id === 'evCommentOverlay') closeEventCommentModal()
  })
  binding.add(document.getElementById('evEditorOverlay'), 'click', (event) => {
    if (event.target?.id === 'evEditorOverlay') closeEventEditor()
  })
  binding.add(document.getElementById('evCancelBtn'), 'click', closeEventEditor)
  binding.add(document.getElementById('evSaveBtn'), 'click', () => {
    void saveEventEditor()
  })
  binding.add(document.getElementById('evDeleteBtn'), 'click', () => {
    void deleteEventEditorItem()
  })
  binding.add(document.getElementById('evCalcFromTimesBtn'), 'click', recalcEventDurationFromTimes)
  binding.add(document.getElementById('evCalcFromDurationBtn'), 'click', recalcEventStopFromDuration)
  binding.add(document.getElementById('evStopNowBtn'), 'click', setEventStopNow)
  binding.add(document.getElementById('evEditStatus'), 'change', applyEventStatusColor)
  binding.add(document.getElementById('evEditPom'), 'change', refreshEventZoneOptionsForClient)
  binding.add(document.getElementById('evEditStrefa'), 'change', syncEventRoomAndClientFromZone)

  return binding.done
}

function bindZonesViewFunctions() {
  const binding = createBindingHelpers()

  binding.add(document.getElementById('znSearchBtn'), 'click', () => {
    filterZonesTable({ resetPage: true })
  })
  binding.add(document.getElementById('znResetBtn'), 'click', () => {
    resetZoneFilters()
    filterZonesTable({ resetPage: true })
  })

  ;['znQr', 'znClient', 'znStrefa', 'znLoc', 'znFunkcja', 'znEditedBy', 'znQ'].forEach((id) => {
    binding.add(document.getElementById(id), 'keydown', (event) => {
      if (event.key === 'Enter') filterZonesTable({ resetPage: true })
    })
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

  binding.add(document.getElementById('znAddBtn'), 'click', openZoneAddModal)
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

  return binding.done
}
function bindWorkerTimeViewFunctions(router) {
  const binding = createBindingHelpers()

  binding.add(document.getElementById('wtSearchBtn'), 'click', () => {
    void fetchWorkersForCurrentSession()
  })

  binding.add(document.getElementById('wtRefreshBtn'), 'click', () => {
    const qInput = document.getElementById('wtQ')
    const typeInput = document.getElementById('wtType')
    if (qInput) qInput.value = ''
    if (typeInput) typeInput.value = ''
    void fetchWorkersForCurrentSession()
  })

  binding.add(document.getElementById('wtQ'), 'keydown', (event) => {
    if (event.key === 'Enter') void fetchWorkersForCurrentSession()
  })

  binding.add(document.getElementById('wtType'), 'keydown', (event) => {
    if (event.key === 'Enter') void fetchWorkersForCurrentSession()
  })

  binding.add(document.getElementById('wtPrevBtn'), 'click', () => {
    if (appState.workersPage <= 1) return
    appState.workersPage -= 1
    renderWorkersPaged(appState.workers, { resetPage: false })
  })

  binding.add(document.getElementById('wtNextBtn'), 'click', () => {
    if (appState.workersPage >= appState.workersTotalPages) return
    appState.workersPage += 1
    renderWorkersPaged(appState.workers, { resetPage: false })
  })

  binding.add(document.getElementById('wtRows'), 'click', (event) => {
    const button = event.target.closest('[data-worker-login]')
    if (!button) return

    appState.selectedWorkerLogin = String(button.getAttribute('data-worker-login') ?? '').trim()
    appState.selectedWorkerName = String(button.getAttribute('data-worker-name') ?? '').trim()
    appState.workerDetailPage = 1
    router.go('workerTimeDetail')
  })

  return binding.done
}

function bindWorkerTimeDetailViewFunctions() {
  const binding = createBindingHelpers()

  const addDayButton = document.getElementById('wtdAddDayBtn')
  if (addDayButton) {
    addDayButton.style.display = workerDetailCanEdit() ? '' : 'none'
  }

  const downloadButton = document.getElementById('wtdDownloadEwidencjaBtn')
  if (downloadButton) {
    downloadButton.disabled = false
    downloadButton.title = 'Eksport CSV ewidencji pracy.'
  }

  binding.add(document.getElementById('wtdRefreshBtn'), 'click', () => {
    appState.workerDetailPage = 1
    void fetchWorkerDetailForCurrentSession()
  })

  binding.add(document.getElementById('wtdSearchBtn'), 'click', () => {
    appState.workerDetailPage = 1
    void fetchWorkerDetailForCurrentSession()
  })

  binding.add(document.getElementById('wtdSumPrevBtn'), 'click', () => {
    if (appState.workerDetailPage <= 1) return
    appState.workerDetailPage -= 1
    renderWorkerDetailCurrentPage()
  })

  binding.add(document.getElementById('wtdSumNextBtn'), 'click', () => {
    const paged = paginate(appState.workerDetailRows, appState.workerDetailPage, appState.workerDetailPageSize)
    if (appState.workerDetailPage >= paged.totalPages) return
    appState.workerDetailPage += 1
    renderWorkerDetailCurrentPage()
  })

  binding.add(document.getElementById('wtdMonthPick'), 'change', (event) => {
    applyMonthPickToWorkerDetail(event.target?.value)
    appState.workerDetailPage = 1
    void fetchWorkerDetailForCurrentSession()
  })

  ;['wtdFrom', 'wtdTo'].forEach((id) => {
    binding.add(document.getElementById(id), 'keydown', (event) => {
      if (event.key !== 'Enter') return
      appState.workerDetailPage = 1
      void fetchWorkerDetailForCurrentSession()
    })
  })

  binding.add(document.getElementById('wtdAddDayBtn'), 'click', () => {
    openWorkerDetailDayEditorNew()
  })

  binding.add(document.getElementById('wtdDownloadEwidencjaBtn'), 'click', downloadWorkerDetailEwidencja)

  binding.add(document.getElementById('wtdSumRows'), 'click', (event) => {
    const button = event.target.closest('[data-worker-detail-edit]')
    if (!button) {
      return
    }

    const dayKey = String(button.getAttribute('data-worker-detail-edit') ?? '').trim()
    if (!dayKey) {
      return
    }

    const item = appState.workerDetailRows.find((row) => row.dayKey === dayKey)
    if (!item) {
      return
    }

    openWorkerDetailDayEditor(item)
  })

  binding.add(document.getElementById('wtdDayEditorOverlay'), 'click', (event) => {
    if (event.target?.id === 'wtdDayEditorOverlay') {
      closeWorkerDetailDayEditor()
    }
  })
  binding.add(document.getElementById('wtdDayEditorClose'), 'click', closeWorkerDetailDayEditor)
  binding.add(document.getElementById('wtdDayCancelBtn'), 'click', closeWorkerDetailDayEditor)
  binding.add(document.getElementById('wtdDaySaveBtn'), 'click', () => {
    void saveWorkerDetailDayEditor()
  })
  binding.add(document.getElementById('wtdDayAckBtn'), 'click', ackWorkerDetailDay)

  ;['wtdDayDateInput', 'wtdDayStartTime', 'wtdDayEndTime'].forEach((id) => {
    ;['input', 'change', 'keyup'].forEach((eventName) => {
      binding.add(document.getElementById(id), eventName, updateWorkerDetailDayPreview)
    })
  })

  return binding.done
}

function bindWorkerProfileViewFunctions() {
  const binding = createBindingHelpers()

  const addButton = document.getElementById('wkAddBtn')
  if (addButton) {
    addButton.style.display = canManageWorkers() ? '' : 'none'
  }

  binding.add(document.getElementById('wkSearchBtn'), 'click', () => {
    void fetchWorkerProfilesForCurrentSession(true)
  })

  binding.add(document.getElementById('wkResetBtn'), 'click', () => {
    resetWorkerProfileFilters()
    void fetchWorkerProfilesForCurrentSession(true)
  })

  ;['wkQ', 'wkType', 'wkActive', 'wkOnline'].forEach((id) => {
    binding.add(document.getElementById(id), 'keydown', (event) => {
      if (event.key !== 'Enter') return
      void fetchWorkerProfilesForCurrentSession(true)
    })
  })

  ;['wkType', 'wkActive', 'wkOnline'].forEach((id) => {
    binding.add(document.getElementById(id), 'change', () => {
      filterWorkerProfileTable({ resetPage: true })
    })
  })

  binding.add(document.getElementById('wkPrevBtn'), 'click', () => {
    if (appState.workerProfilePage <= 1) return
    appState.workerProfilePage -= 1
    filterWorkerProfileTable({ resetPage: false })
  })
  binding.add(document.getElementById('wkNextBtn'), 'click', () => {
    if (appState.workerProfilePage >= appState.workerProfileTotalPages) return
    appState.workerProfilePage += 1
    filterWorkerProfileTable({ resetPage: false })
  })

  binding.add(document.getElementById('wkAddBtn'), 'click', () => {
    if (!canManageWorkers()) {
      alert('Brak uprawnień do dodawania pracownika.')
      return
    }

    openWorkerProfileModal(null, 'add')
  })

  binding.add(document.getElementById('wkRows'), 'click', (event) => {
    const button = event.target.closest('[data-worker-profile-index]')
    if (!button) {
      return
    }

    const index = Number(button.getAttribute('data-worker-profile-index'))
    const worker = Number.isInteger(index) ? appState.workerProfileViewRows[index] : null
    if (!worker) {
      return
    }

    openWorkerProfileModal(worker, 'view')
  })

  binding.add(document.getElementById('wkEditorOverlay'), 'click', (event) => {
    if (event.target?.id === 'wkEditorOverlay') {
      closeWorkerProfileModal()
    }
  })
  binding.add(document.getElementById('wkCancelBtn'), 'click', closeWorkerProfileModal)
  binding.add(document.getElementById('wkSaveBtn'), 'click', () => {
    void saveWorkerProfileData()
  })
  binding.add(document.getElementById('wkDeleteBtn'), 'click', () => {
    void deleteWorkerProfileData()
  })
  binding.add(document.getElementById('wkFillQrBtn'), 'click', fillWorkerQrFromCredentials)
  binding.add(document.getElementById('wkShowPassBtn'), 'click', () => {
    const passInput = document.getElementById('wkCurrentPass')
    const showButton = document.getElementById('wkShowPassBtn')
    if (!passInput || !showButton) {
      return
    }

    const show = passInput.type === 'password'
    passInput.type = show ? 'text' : 'password'
    showButton.textContent = show ? 'Ukryj' : 'Pokaż'
  })
  binding.add(document.getElementById('wkCopyPassBtn'), 'click', async () => {
    const passInput = document.getElementById('wkCurrentPass')
    if (!passInput?.value) {
      alert('Brak hasła do skopiowania.')
      return
    }

    try {
      await navigator.clipboard.writeText(passInput.value)
      alert('Skopiowano hasło do schowka.')
    } catch {
      alert('Nie udało się skopiować hasła.')
    }
  })

  return binding.done
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

    const historyTabButton = event.target.closest('[data-rep-history-tab]')
    if (historyTabButton) {
      const tab = String(historyTabButton.getAttribute('data-rep-history-tab') ?? '').trim()
      if (tab) {
        reportHistorySetTab(tab)
        reportHistorySetStatus('Wybierz filtr i kliknij "Pokaz historie".')
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
    void runEventsReportComparison()
  })
  binding.add(document.getElementById('repDownloadCsv'), 'click', reportDownloadCsv)
  binding.add(document.getElementById('repA_client'), 'change', () => reportRefreshZoneOptions('A'))
  binding.add(document.getElementById('repB_client'), 'change', () => reportRefreshZoneOptions('B'))
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

  return binding.done
}

async function hydrateSections(orgId) {
  const [clients, workers, zones, todayActive, summary] = await Promise.all([
    getClients(orgId),
    getWorkers(orgId),
    getZones(orgId),
    getTodayActiveWorkers(orgId),
    getDashboardSummary(orgId),
  ])

  appState.clients = clients
  appState.clientsLoaded = true
  appState.workers = workers
  appState.workersLoaded = true
  appState.zones = zones
  appState.zonesLoaded = true

  renderDashboardEvents(todayActive.items ?? [])
  renderDashboardSummary(summary)
  filterClientsTable()
  filterZonesTable()
  fillClientProfileCoordinatorOptions()

  setSubwelcomeMetric('#view-clientsList .subwelcome', clients.length)
  setSubwelcomeMetric('#view-clientProfile .subwelcome', clients.length)
  setSubwelcomeMetric('#view-workerTime .subwelcome', workers.length)
  setSubwelcomeMetric('#view-workerProfile .subwelcome', workers.length)
  setSubwelcomeMetric('#view-zones .subwelcome', zones.length)
}

function bindLogin(router) {
  const loginButton = document.getElementById('loginBtn')
  const loginInput = document.getElementById('loginLogin')
  const passwordInput = document.getElementById('loginPass')

  if (!loginButton || !loginInput || !passwordInput) {
    return () => {}
  }

  const handleLogin = async () => {
    stopDashboardAutoRefresh()
    loginButton.disabled = true
    loginButton.textContent = 'Logowanie...'
    setLoginError('')

    try {
      const session = await login({
        login: loginInput.value,
        password: passwordInput.value,
      })
      const normalizedSession = await ensureSessionContext(session)

      if (!normalizedSession?.orgId) {
        throw new Error('Brak orgId w sesji. Sprawdź OrganizationMember w Data Connect.')
      }

      appState.session = normalizedSession
      appState.clientsLoaded = false
      appState.clientModalMode = 'add'
      appState.clientModalClientId = ''
      appState.zonesLoaded = false
      appState.workersLoaded = false
      appState.workerProfileRows = []
      appState.workerProfileViewRows = []
      appState.workerProfileCurrent = null
      appState.workerProfileModalMode = 'view'
      appState.clientProfileRows = []
      appState.clientProfileCurrent = null
      appState.clientProfileEditMode = false
      appState.workerDetailRows = []
      appState.workerDetailSourceRows = []
      appState.workerDetailViewRows = []
      appState.workerDetailDayEditorItem = null
      appState.workerDetailAckMap = {}
      appState.individualOrdersRows = []
      appState.individualOrdersPage = 1
      appState.individualOrdersTotal = 0
      appState.individualOrdersTotalPages = 1
      appState.individualOrderModalMode = 'add'
      appState.individualOrderCurrentId = ''
      appState.individualOrderQrCurrent = ''
      appState.selectedWorkerLogin = ''
      appState.selectedWorkerName = ''
      appState.reportLastCsv = ''
      appState.reportHistoryTab = 'objects'
      appState.reportHistoryRows = []
      appState.reportHistoryExpanded = {}
      appState.reportHistoryClientOptions = []
      appState.reportHistoryWorkerOptions = []
      appState.reportHistoryZoneOptions = []

      showPortal()
      setUserChip(normalizedSession)
      await hydrateSections(normalizedSession.orgId)
      startDashboardAutoRefresh()
      router.go('dashboard')
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Błąd logowania.')
    } finally {
      loginButton.disabled = false
      loginButton.textContent = 'Zaloguj'
    }
  }

  const handlePasswordKeydown = (event) => {
    if (event.key === 'Enter') {
      handleLogin()
    }
  }

  loginButton.addEventListener('click', handleLogin)
  passwordInput.addEventListener('keydown', handlePasswordKeydown)

  return () => {
    loginButton.removeEventListener('click', handleLogin)
    passwordInput.removeEventListener('keydown', handlePasswordKeydown)
  }
}

function bindLogout() {
  const logoutButton = document.getElementById('logoutBtn')
  if (!logoutButton) {
    return () => {}
  }

  const handleLogout = () => {
    stopDashboardAutoRefresh()
    appState.currentRoute = ''
    appState.session = null
    appState.clients = []
    appState.clientsLoaded = false
    appState.clientModalMode = 'add'
    appState.clientModalClientId = ''
    appState.zones = []
    appState.zonesLoaded = false
    appState.workers = []
    appState.workersLoaded = false
    appState.workerProfileRows = []
    appState.workerProfileViewRows = []
    appState.workerProfileCurrent = null
    appState.workerProfileModalMode = 'view'
    appState.clientProfileRows = []
    appState.clientProfileCurrent = null
    appState.clientProfileEditMode = false
    appState.eventRows = []
    appState.workerDetailRows = []
    appState.workerDetailSourceRows = []
    appState.workerDetailViewRows = []
    appState.workerDetailDayEditorItem = null
    appState.workerDetailAckMap = {}
    appState.individualOrdersRows = []
    appState.individualOrdersPage = 1
    appState.individualOrdersTotal = 0
    appState.individualOrdersTotalPages = 1
    appState.individualOrderModalMode = 'add'
    appState.individualOrderCurrentId = ''
    appState.individualOrderQrCurrent = ''
    appState.selectedWorkerLogin = ''
    appState.selectedWorkerName = ''
    appState.reportLastCsv = ''
    appState.reportHistoryTab = 'objects'
    appState.reportHistoryRows = []
    appState.reportHistoryExpanded = {}
    appState.reportHistoryClientOptions = []
    appState.reportHistoryWorkerOptions = []
    appState.reportHistoryZoneOptions = []

    logout()
    setUserChip(null)
    showLoginScreen()
  }

  logoutButton.addEventListener('click', handleLogout)

  return () => {
    logoutButton.removeEventListener('click', handleLogout)
  }
}

export function mountPortalApp() {
  const host = document.getElementById('portalAppRoot')
  if (!host) {
    return () => {}
  }

  host.innerHTML = portalLayoutTemplate
  mountViewsFromTemplates()

  const router = createRouter((route) => {
    appState.currentRoute = String(route ?? '').trim()

    if (appState.currentRoute === 'dashboard') {
      triggerDashboardRefreshIfAllowed()
    }

    if (route === 'clientsList') {
      void fetchClientsForCurrentSession(false)
      return
    }

    if (route === 'events') {
      void fetchEventsForCurrentSession()
      return
    }

    if (route === 'zones') {
      void fetchZonesForCurrentSession(false)
      return
    }

    if (route === 'workerTime') {
      void fetchWorkersForCurrentSession()
      return
    }

    if (route === 'workerProfile') {
      void fetchWorkerProfilesForCurrentSession(false)
      return
    }

    if (route === 'clientProfile') {
      void fetchClientProfileForCurrentSession(false)
      return
    }

    if (route === 'individualOrders') {
      void fetchIndividualOrdersForCurrentSession({ resetPage: false })
      return
    }

    if (route === 'workerTimeDetail') {
      void fetchWorkerDetailForCurrentSession()
      return
    }

    if (route === 'reports') {
      void initializeReportsView()
    }
  })

  const handleVisibilityChange = () => {
    triggerDashboardRefreshIfAllowed()
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)

  const cleanups = [
    bindSubmenuToggles(),
    bindRouteButtons(router),
    bindDashboardViewFunctions(),
    bindLogin(router),
    bindLogout(),
    bindClientsViewFunctions(),
    bindClientProfileViewFunctions(),
    bindIndividualOrdersViewFunctions(),
    bindEventsViewFunctions(),
    bindZonesViewFunctions(),
    bindWorkerTimeViewFunctions(router),
    bindWorkerTimeDetailViewFunctions(),
    bindWorkerProfileViewFunctions(),
    bindReportsViewFunctions(),
    () => document.removeEventListener('visibilitychange', handleVisibilityChange),
  ]

  const session = requireAuth() ?? getSession()

  if (session) {
    appState.session = session

    showPortal()
    setUserChip(session)

    void (async () => {
      try {
        const normalizedSession = await ensureSessionContext(session)
        if (!normalizedSession?.orgId) {
          throw new Error('Brak orgId w sesji. Zaloguj się ponownie.')
        }

        appState.session = normalizedSession
        setUserChip(normalizedSession)
        await hydrateSections(normalizedSession.orgId)
        startDashboardAutoRefresh()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Błąd inicjalizacji sesji.'
        console.error(message)
        stopDashboardAutoRefresh()
        appState.currentRoute = ''
        logout()
        appState.session = null
        appState.clients = []
        appState.clientsLoaded = false
        appState.clientModalMode = 'add'
        appState.clientModalClientId = ''
        appState.zones = []
        appState.zonesLoaded = false
        appState.workers = []
        appState.workersLoaded = false
        appState.workerProfileRows = []
        appState.workerProfileViewRows = []
        appState.workerProfileCurrent = null
        appState.workerProfileModalMode = 'view'
        appState.clientProfileRows = []
        appState.clientProfileCurrent = null
        appState.clientProfileEditMode = false
        appState.workerDetailRows = []
        appState.workerDetailSourceRows = []
        appState.workerDetailViewRows = []
        appState.workerDetailDayEditorItem = null
        appState.workerDetailAckMap = {}
        appState.individualOrdersRows = []
        appState.individualOrdersPage = 1
        appState.individualOrdersTotal = 0
        appState.individualOrdersTotalPages = 1
        appState.individualOrderModalMode = 'add'
        appState.individualOrderCurrentId = ''
        appState.individualOrderQrCurrent = ''
        appState.reportLastCsv = ''
        appState.reportHistoryTab = 'objects'
        appState.reportHistoryRows = []
        appState.reportHistoryExpanded = {}
        appState.reportHistoryClientOptions = []
        appState.reportHistoryWorkerOptions = []
        appState.reportHistoryZoneOptions = []
        showLoginScreen()
        setUserChip(null)
        setLoginError(message)
      }
    })()

    router.go('dashboard')
  } else {
    stopDashboardAutoRefresh()
    appState.currentRoute = ''
    showLoginScreen()
    setUserChip(null)
  }

  window.go = router.go

  return () => {
    stopDashboardAutoRefresh()
    cleanups.forEach((cleanup) => {
      try {
        cleanup()
      } catch {
        // No-op cleanup safety for dev remounts.
      }
    })

    if (portalNoticeTimer) {
      window.clearTimeout(portalNoticeTimer)
      portalNoticeTimer = null
    }
    document.getElementById('portalNotice')?.remove()

    host.innerHTML = ''
    delete window.go
  }
}
