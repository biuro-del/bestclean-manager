import template from './template.html?raw'

export const route = 'clientsList'
export const viewId = 'view-clientsList'
export { template }

export function createClientsListFeature(ctx) {
  const {
    appState,
    createBindingHelpers,
    createClient,
    escapeHtml,
    getClients,
    normalizeClientStatus,
    ordersSelectCreatedClientInEditor,
    paginate,
    setSubwelcomeMetric,
    showTransientNotice,
    statusBadgeClass,
    updateClient,
    workerTimeSyncSelectionUi,
    canManageClients,
  } = ctx

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

        const actions = canManage
          ? `
              <button class="btn2" type="button" data-client-action="edit" data-client-id="${escapeHtml(client.id)}">Edytuj</button>
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

    workerTimeSyncSelectionUi()
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

    appState.ordersClientCreateReturnOrderId = ''
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
    const ordersReturnOrderId = mode === 'add' ? String(appState.ordersClientCreateReturnOrderId ?? '').trim() : ''

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
      if (ordersReturnOrderId) {
        ordersSelectCreatedClientInEditor(payload, ordersReturnOrderId)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Błąd zapisu klienta.'
      alert(message)
    }
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
        showTransientNotice('Usuwanie klientów jest wyłączone.', 'error')
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
      binding.done()
    }
  }

  return {
    bind: bindClientsViewFunctions,
    closeModal: closeClientModal,
    fetch: fetchClientsForCurrentSession,
    fillCoordinatorSelect: fillClientsCoordinatorSelect,
    filter: filterClientsTable,
    openModal: openClientModal,
    syncPermissions: syncClientsPermissions,
  }
}
