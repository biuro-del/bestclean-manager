import { cleanziAdminApi } from './api.js'
import './styles.css'

const OPERATION_DEFINITIONS = {
  UPDATE_ORGANIZATION: {
    title: 'Edytuj organizację',
    fields: [
      ['name', 'Nazwa', 'text'],
      ['status', 'Status organizacji', 'select', ['ACTIVE', 'SUSPENDED', 'EXPIRED']],
      ['onboardingStatus', 'Status onboardingu', 'select', ['PENDING', 'IN_PROGRESS', 'COMPLETED']],
    ],
  },
  TRANSFER_ORGANIZATION_OWNER: {
    title: 'Zmień Ownera organizacji',
    fields: [['newOwnerWorkerId', 'Worker ID nowego Ownera', 'text']],
  },
  SOFT_DELETE_ORGANIZATION: { title: 'Oznacz organizację jako usuniętą', fields: [] },
  RESTORE_ORGANIZATION: { title: 'Przywróć organizację', fields: [] },
  EXTEND_TRIAL_DAYS: { title: 'Przedłuż Trial o liczbę dni', fields: [['days', 'Liczba dni', 'number']] },
  SET_TRIAL_END: { title: 'Ustaw koniec Trial', fields: [['trialEndsAt', 'Koniec Trial', 'datetime-local']] },
  CHANGE_PLAN: {
    title: 'Zmień plan',
    fields: [
      ['planCode', 'Nowy plan', 'select', ['TRIAL', 'GO_PLUS', 'PLUS', 'PRO']],
      ['trialEndsAt', 'Koniec Trial (dla TRIAL)', 'datetime-local'],
      ['currentPeriodStartsAt', 'Początek okresu płatnego', 'datetime-local'],
      ['currentPeriodEndsAt', 'Koniec okresu płatnego', 'datetime-local'],
    ],
  },
  ACTIVATE_SUBSCRIPTION: { title: 'Aktywuj subskrypcję', fields: [] },
  SUSPEND_SUBSCRIPTION: { title: 'Zawieś subskrypcję', fields: [] },
  CANCEL_SUBSCRIPTION: { title: 'Anuluj subskrypcję', fields: [] },
  EXPIRE_SUBSCRIPTION: { title: 'Wygaś subskrypcję', fields: [] },
  RESTART_SUBSCRIPTION: { title: 'Uruchom subskrypcję ponownie', fields: [] },
  ADJUST_BILLING_PERIOD: {
    title: 'Skoryguj okres rozliczeniowy',
    fields: [
      ['currentPeriodStartsAt', 'Początek okresu', 'datetime-local'],
      ['currentPeriodEndsAt', 'Koniec okresu', 'datetime-local'],
    ],
  },
  RECORD_PAYMENT: {
    title: 'Dodaj ręczną płatność',
    fields: [
      ['amountMinor', 'Kwota w najmniejszych jednostkach', 'number'],
      ['currency', 'Waluta', 'text'],
      ['occurredAt', 'Czas płatności', 'datetime-local'],
    ],
    financial: true,
  },
  RECORD_REFUND: {
    title: 'Dodaj zwrot',
    fields: [
      ['amountMinor', 'Kwota zwrotu w najmniejszych jednostkach', 'number'],
      ['currency', 'Waluta', 'text'],
      ['relatedTransactionId', 'ID płatności źródłowej', 'text'],
      ['occurredAt', 'Czas zwrotu', 'datetime-local'],
    ],
    financial: true,
  },
  RECORD_ADJUSTMENT: {
    title: 'Dodaj korektę finansową',
    fields: [
      ['amountMinor', 'Kwota korekty (+/−)', 'number'],
      ['currency', 'Waluta', 'text'],
      ['occurredAt', 'Czas korekty', 'datetime-local'],
    ],
    financial: true,
  },
}

const STATUS_LABELS = {
  ACTIVE: 'Aktywna',
  SUSPENDED: 'Zawieszona',
  EXPIRED: 'Wygasła',
  TRIALING: 'Trial aktywny',
  PENDING_PAYMENT: 'Oczekuje na płatność',
  PAST_DUE: 'Zaległa',
  CANCELED: 'Anulowana',
  PENDING: 'Oczekuje',
  CONFIRMED: 'Potwierdzona',
  FAILED: 'Nieudana',
  COMPLETED: 'Zakończony',
  IN_PROGRESS: 'W toku',
}

const TRANSACTION_LABELS = {
  PAYMENT: 'Płatność',
  REFUND: 'Zwrot',
  ADJUSTMENT: 'Korekta',
}

function text(value) {
  return String(value ?? '').trim()
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatDateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'medium' }).format(date)
}

function formatMoney(amountMinor, currency) {
  if (!/^-?\d+$/.test(text(amountMinor)) || !text(currency)) return '—'
  const value = Number(amountMinor) / 100
  if (!Number.isSafeInteger(Number(amountMinor))) return `${amountMinor} ${currency} (jedn. najmniejsze)`
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency }).format(value)
}

function toLocalDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function toIsoDateTime(value) {
  if (!text(value)) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function errorMessage(error, fallback = 'Operacja nie powiodła się.') {
  if (error?.code === 'PLATFORM_REAUTH_REQUIRED') {
    return 'Ta zmiana wymaga świeżego uwierzytelnienia z MFA (maksymalnie sprzed 5 minut). Wyloguj się i zaloguj ponownie.'
  }
  if (error?.code === 'CLEANZI_ADMIN_SCHEMA_NOT_READY') {
    return 'Moduł rozliczeń nie jest jeszcze gotowy. Administrator bazy musi uruchomić lokalnie zweryfikowaną migrację.'
  }
  return error instanceof Error ? error.message : fallback
}

function statusLabel(value) {
  const normalized = text(value).toUpperCase()
  return STATUS_LABELS[normalized] || normalized || 'Brak'
}

function operationLabel(value) {
  return OPERATION_DEFINITIONS[text(value).toUpperCase()]?.title || text(value) || 'Operacja'
}

function operationButton(operation, label, tone = '') {
  return `<button class="btn2 ${escapeHtml(tone)}" type="button" data-platform-operation="${escapeHtml(operation)}"><i class="ph ph-gear" aria-hidden="true"></i>${escapeHtml(label)}</button>`
}

export function createCleanziAdminPanel({
  router,
  acceptPlatformContext,
  clearPlatformContextSession,
  getSession,
  logout,
  resetPortalState,
  setUserChip,
  activatePortalSession,
  showPortal,
  showLoginScreen,
  showLoginCredentials,
}) {
  const state = {
    bound: false,
    view: 'dashboard',
    page: 1,
    totalPages: 1,
    sortBy: 'name',
    sortDirection: 'ASC',
    loading: false,
    selectedOrgId: '',
    details: null,
    history: [],
    transactions: [],
    documents: [],
    audit: [],
    plans: [],
    dashboard: null,
    organizations: null,
    operation: '',
    preview: null,
    idempotencyKey: '',
    lastFocused: null,
    searchTimer: 0,
  }

  const byId = (id) => document.getElementById(id)

  function message(value = '', tone = 'error') {
    const node = byId('platformCenterMessage')
    if (!node) return
    node.textContent = text(value)
    node.dataset.tone = value ? tone : ''
  }

  function setVisible(visible) {
    const center = byId('platformCenter')
    const shell = document.querySelector('#portalRoot > .app-shell')
    if (center) center.hidden = !visible
    if (shell) visible ? shell.setAttribute('inert', '') : shell.removeAttribute('inert')
  }

  function setView(view) {
    state.view = view === 'organizations' ? 'organizations' : 'dashboard'
    byId('platformAdminDashboard').hidden = state.view !== 'dashboard'
    byId('platformAdminOrganizations').hidden = state.view !== 'organizations'
    document.querySelectorAll('[data-platform-view]').forEach((button) => {
      const active = button.dataset.platformView === state.view
      button.classList.toggle('is-active', active)
      if (active) button.setAttribute('aria-current', 'page')
      else button.removeAttribute('aria-current')
    })
  }

  function filterValues() {
    return {
      search: byId('platformOrganizationSearch')?.value,
      status: byId('platformOrganizationStatus')?.value,
      onboardingStatus: byId('platformOrganizationOnboarding')?.value,
      planCode: byId('platformOrganizationPlan')?.value,
      subscriptionStatus: byId('platformOrganizationSubscriptionStatus')?.value,
      endingWithinDays: byId('platformOrganizationTrialWindow')?.value,
      deletion: byId('platformOrganizationDeletion')?.value,
      pageSize: byId('platformOrganizationPageSize')?.value || 25,
      page: state.page,
      sortBy: state.sortBy,
      sortDirection: state.sortDirection,
    }
  }

  function renderDashboard(data) {
    state.dashboard = data
    const metrics = [
      ['Wszystkie organizacje', data.organizations?.total],
      ['Aktywne', data.organizations?.active],
      ['Zawieszone', data.organizations?.suspended],
      ['Wygasłe', data.organizations?.expired],
      ['Usunięte', data.organizations?.deleted],
      ['Aktywne Trial', data.trials?.active],
      ['Trial ≤ 3 dni', data.trials?.endingWithinDays?.[3]],
      ['Trial ≤ 7 dni', data.trials?.endingWithinDays?.[7]],
      ['Trial ≤ 14 dni', data.trials?.endingWithinDays?.[14]],
      ['Trial ≤ 30 dni', data.trials?.endingWithinDays?.[30]],
      ['Aktywne START', data.plans?.START],
      ['Aktywne PRO', data.plans?.PRO],
      ['Zaległe', data.subscriptions?.pastDue],
      ['Anulowane', data.subscriptions?.canceled],
      ['Wygasłe subskrypcje', data.subscriptions?.expired],
    ]
    const paymentCards = (data.confirmedPayments || []).map((item) => [
      `Potwierdzone płatności (${item.currency})`, formatMoney(item.amountMinor, item.currency),
    ])
    const mrrCards = data.mrr?.available
      ? (data.mrr.totals || []).map((item) => [`MRR (${item.currency})`, formatMoney(item.amountMinor, item.currency)])
      : [['MRR', 'Niedostępny — uzupełnij miesięczne ceny planów płatnych']]
    byId('platformAdminMetrics').innerHTML = [...metrics, ...paymentCards, ...mrrCards].map(([label, value]) => `
      <article class="cleanzi-admin__metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value ?? 0)}</strong></article>
    `).join('')
    byId('platformAdminDashboardTimestamp').textContent = `Stan na ${formatDateTime(data.generatedAt)}`
    renderOrganizationSummary()
  }

  async function loadDashboard() {
    byId('platformAdminMetrics').innerHTML = '<p>Ładowanie danych dashboardu…</p>'
    try {
      renderDashboard(await cleanziAdminApi.dashboard())
    } catch (error) {
      byId('platformAdminMetrics').innerHTML = `<p class="cleanzi-admin__empty">${escapeHtml(errorMessage(error, 'Nie udało się pobrać dashboardu.'))}</p>`
    }
  }

  function statusBadge(value, deletedAt = null) {
    const status = deletedAt ? 'USUNIĘTA' : (text(value).toUpperCase() || 'BRAK')
    const label = deletedAt ? 'Usunięta' : statusLabel(status)
    return `<span class="cleanzi-admin__badge" data-status="${escapeHtml(status)}">${escapeHtml(label)}</span>`
  }

  function renderOrganizationSummary() {
    const target = byId('platformOrganizationSummary')
    if (!target) return
    const dashboard = state.dashboard || {}
    const organizations = state.organizations || {}
    const items = Array.isArray(organizations.items) ? organizations.items : []
    const activeOnPage = items.filter((item) => !item.deletedAt && text(item.status).toUpperCase() === 'ACTIVE').length
    const withoutSubscriptionOnPage = items.filter((item) => !text(item.planCode)).length
    const stats = [
      ['Wszystkie organizacje', organizations.total ?? dashboard.organizations?.total ?? 0, 'ph-folder-user', 'violet'],
      ['Aktywne', dashboard.organizations?.active ?? activeOnPage, 'ph-check-circle', 'green'],
      ['Trial aktywny', dashboard.trials?.active ?? 0, 'ph-calendar-blank', 'cyan'],
      ['Bez subskrypcji', dashboard.subscriptions?.withoutSubscription ?? withoutSubscriptionOnPage, 'ph-file-dashed', 'neutral'],
      ['Pro', dashboard.plans?.PRO ?? 0, 'ph-crown', 'blue'],
      ['Trial', dashboard.plans?.TRIAL ?? dashboard.trials?.active ?? 0, 'ph-flask', 'cyan'],
    ]
    target.innerHTML = stats.map(([label, value, icon, tone]) => `
      <article class="cleanzi-admin__summary-stat" data-tone="${tone}">
        <span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><i class="ph ${icon}" aria-hidden="true"></i>
      </article>
    `).join('')
  }

  function renderOrganizations(data) {
    state.organizations = data
    const list = byId('platformOrganizationList')
    const items = Array.isArray(data?.items) ? data.items : []
    list.innerHTML = items.length ? items.map((org) => `
      <tr>
        <td><strong>${escapeHtml(org.name || org.orgId)}</strong><small>${escapeHtml(org.orgId)}</small></td>
        <td>${escapeHtml(formatDateTime(org.createdAt))}</td>
        <td>${escapeHtml(org.owner?.name || org.owner?.workerId || '—')}<small>${escapeHtml(org.owner?.email || '')}</small></td>
        <td>${statusBadge(org.status, org.deletedAt)}<small>${escapeHtml(statusLabel(org.onboardingStatus))}</small></td>
        <td><strong>${escapeHtml(org.planCode || '—')}</strong></td>
        <td>${statusBadge(org.subscriptionStatus)}</td>
        <td>${escapeHtml(formatDateTime(org.endsAt))}<small>${org.daysRemaining === null ? '—' : `${escapeHtml(org.daysRemaining)} dni`}</small></td>
        <td>${escapeHtml(formatDateTime(org.lastPaymentAt))}</td>
        <td class="cleanzi-admin__row-actions">
          <button class="btn2" type="button" data-platform-manage="${escapeHtml(org.orgId)}"><i class="ph ph-gear" aria-hidden="true"></i>Zarządzaj</button>
          <button class="btn2 primary" type="button" data-platform-enter="${escapeHtml(org.orgId)}"><i class="ph ph-sign-in" aria-hidden="true"></i>Wejdź</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="9" class="cleanzi-admin__empty">Brak organizacji dla wybranych filtrów.</td></tr>'
    state.page = Number(data?.page) || 1
    state.totalPages = Number(data?.totalPages) || 1
    byId('platformOrganizationsPage').textContent = `Strona ${state.page} z ${state.totalPages} · ${Number(data?.total || 0)} wyników`
    byId('platformOrganizationsPrev').disabled = state.page <= 1
    byId('platformOrganizationsNext').disabled = state.page >= state.totalPages
    document.querySelectorAll('[data-platform-sort]').forEach((button) => {
      const active = button.dataset.platformSort === state.sortBy
      button.dataset.direction = active ? state.sortDirection : ''
      button.setAttribute('aria-sort', active ? (state.sortDirection === 'ASC' ? 'ascending' : 'descending') : 'none')
    })
    renderOrganizationSummary()
  }

  async function loadOrganizations() {
    if (state.loading) return
    state.loading = true
    byId('platformOrganizationList').innerHTML = '<tr><td colspan="9">Ładowanie organizacji…</td></tr>'
    try {
      renderOrganizations(await cleanziAdminApi.organizations(filterValues()))
      message('')
    } catch (error) {
      byId('platformOrganizationList').innerHTML = '<tr><td colspan="9" class="cleanzi-admin__empty">Nie udało się pobrać listy.</td></tr>'
      message(errorMessage(error, 'Nie udało się pobrać organizacji.'))
    } finally {
      state.loading = false
    }
  }

  async function establishContext(orgId) {
    if (state.selectedOrgId === orgId && getSession()?.platformContextId) return getSession()
    if (getSession()?.platformContextId) await closeContext({ silent: true })
    const reason = text(byId('platformAccessReason')?.value)
    if (reason.length < 3) {
      byId('platformAccessReason')?.focus()
      throw new Error('Podaj powód wejścia do organizacji (minimum 3 znaki).')
    }
    const result = await cleanziAdminApi.openContext(orgId, reason)
    if (result?.status !== 'READY' || !result?.context) throw new Error('Backend nie zwrócił kontekstu organizacji.')
    const accepted = await acceptPlatformContext(result.context)
    if (accepted?.status !== 'READY' || !accepted.session) throw new Error('Nie udało się zapisać kontekstu platformowego.')
    resetPortalState({ session: accepted.session })
    setUserChip(accepted.session)
    state.selectedOrgId = orgId
    return accepted.session
  }

  function renderSummary() {
    const org = state.details?.organization || {}
    const subscription = state.details?.subscription || {}
    byId('platformTabSummary').innerHTML = `
      <div class="cleanzi-admin__summary-grid">
        <dl><dt>Nazwa</dt><dd>${escapeHtml(org.name || '—')}</dd><dt>orgId</dt><dd>${escapeHtml(org.orgId || '—')}</dd><dt>Rejestracja</dt><dd>${escapeHtml(formatDateTime(org.createdAt))}</dd></dl>
        <dl><dt>Owner</dt><dd>${escapeHtml(org.owner?.name || org.owner?.workerId || '—')}</dd><dt>Email Ownera</dt><dd>${escapeHtml(org.owner?.email || '—')}</dd><dt>Status onboardingu</dt><dd>${escapeHtml(statusLabel(org.onboardingStatus))}</dd></dl>
        <dl><dt>Status organizacji</dt><dd>${statusBadge(org.status, org.deletedAt)}</dd><dt>Plan</dt><dd>${escapeHtml(subscription.planCode || '—')}</dd><dt>Status subskrypcji</dt><dd>${escapeHtml(statusLabel(subscription.status))}</dd></dl>
      </div>
      <div class="cleanzi-admin__actions">
        ${operationButton('UPDATE_ORGANIZATION', 'Edytuj organizację')}
        ${operationButton('TRANSFER_ORGANIZATION_OWNER', 'Zmień Ownera')}
        ${org.deletedAt
          ? operationButton('RESTORE_ORGANIZATION', 'Przywróć organizację')
          : operationButton('SOFT_DELETE_ORGANIZATION', 'Usuń organizację', 'danger')}
      </div>
    `
  }

  function renderSubscription() {
    const s = state.details?.subscription
    byId('platformTabSubscription').innerHTML = s ? `
      <div class="cleanzi-admin__summary-grid">
        <dl><dt>Plan</dt><dd>${escapeHtml(s.planCode)}</dd><dt>Status</dt><dd>${escapeHtml(statusLabel(s.status))}</dd><dt>Wersja</dt><dd>${escapeHtml(s.version)}</dd></dl>
        <dl><dt>Aktywacja Trial</dt><dd>${escapeHtml(formatDateTime(s.trialStartedAt))}</dd><dt>Koniec Trial</dt><dd>${escapeHtml(formatDateTime(s.trialEndsAt))}</dd><dt>Aktywacja</dt><dd>${escapeHtml(formatDateTime(s.activatedAt))}</dd></dl>
        <dl><dt>Początek okresu</dt><dd>${escapeHtml(formatDateTime(s.currentPeriodStartsAt))}</dd><dt>Koniec okresu</dt><dd>${escapeHtml(formatDateTime(s.currentPeriodEndsAt))}</dd><dt>Ostatnia zmiana</dt><dd>${escapeHtml(formatDateTime(s.updatedAt))}</dd></dl>
      </div>
      <div class="cleanzi-admin__actions">
        ${operationButton('EXTEND_TRIAL_DAYS', 'Przedłuż Trial')}
        ${operationButton('SET_TRIAL_END', 'Ustaw datę Trial')}
        ${operationButton('CHANGE_PLAN', 'Zmień plan')}
        ${operationButton('ADJUST_BILLING_PERIOD', 'Skoryguj okres')}
        ${s.planCode === 'TRIAL' ? operationButton('ACTIVATE_SUBSCRIPTION', 'Aktywuj Trial') : ''}
        ${operationButton('SUSPEND_SUBSCRIPTION', 'Zawieś')}
        ${operationButton('CANCEL_SUBSCRIPTION', 'Anuluj', 'danger')}
        ${operationButton('EXPIRE_SUBSCRIPTION', 'Wygaś', 'danger')}
        ${s.planCode === 'TRIAL' ? operationButton('RESTART_SUBSCRIPTION', 'Uruchom Trial ponownie') : ''}
      </div>
    ` : '<p class="cleanzi-admin__empty">Brak bieżącej subskrypcji.</p>'
  }

  function renderBilling() {
    const transactions = state.transactions.length ? state.transactions.map((item) => `
      <tr><td>${escapeHtml(TRANSACTION_LABELS[item.type] || item.type)}</td><td>${escapeHtml(formatMoney(item.amountMinor, item.currency))}</td><td>${escapeHtml(statusLabel(item.status))}</td><td>${escapeHtml(formatDateTime(item.occurredAt))}</td><td>${escapeHtml(item.reason || '—')}</td><td><code>${escapeHtml(item.transactionId)}</code></td></tr>
    `).join('') : '<tr><td colspan="6" class="cleanzi-admin__empty">Brak płatności, zwrotów i korekt.</td></tr>'
    const documents = state.documents.length ? state.documents.map((item) => `
      <tr><td>${escapeHtml(item.type)}</td><td>${escapeHtml(item.number || '—')}</td><td>${escapeHtml(formatMoney(item.amountMinor, item.currency))}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(formatDateTime(item.issuedAt))}</td></tr>
    `).join('') : '<tr><td colspan="5" class="cleanzi-admin__empty">Brak dokumentów rozliczeniowych.</td></tr>'
    byId('platformTabBilling').innerHTML = `
      <div class="cleanzi-admin__actions">
        ${operationButton('RECORD_PAYMENT', 'Dodaj płatność')}
        ${operationButton('RECORD_REFUND', 'Dodaj zwrot')}
        ${operationButton('RECORD_ADJUSTMENT', 'Dodaj korektę')}
      </div>
      <h3>Transakcje</h3><div class="cleanzi-admin__table-wrap"><table class="cleanzi-admin__table"><thead><tr><th>Typ</th><th>Kwota</th><th>Status</th><th>Czas</th><th>Powód</th><th>ID</th></tr></thead><tbody>${transactions}</tbody></table></div>
      <h3>Faktury i dokumenty</h3><div class="cleanzi-admin__table-wrap"><table class="cleanzi-admin__table"><thead><tr><th>Typ</th><th>Numer</th><th>Kwota</th><th>Status</th><th>Wystawienie</th></tr></thead><tbody>${documents}</tbody></table></div>
    `
  }

  function renderHistory() {
    byId('platformTabHistory').innerHTML = state.history.length ? `<ol class="cleanzi-admin__timeline">${state.history.map((item) => `
      <li><strong>${escapeHtml(operationLabel(item.operation))}</strong><time>${escapeHtml(formatDateTime(item.createdAt))}</time><p>${escapeHtml(item.reason || '—')}</p><details><summary>Podgląd danych przed i po</summary><pre>${escapeHtml(JSON.stringify({ before: item.before, after: item.after }, null, 2))}</pre></details></li>
    `).join('')}</ol>` : '<p class="cleanzi-admin__empty">Brak historii zmian subskrypcji.</p>'
  }

  function renderAudit() {
    byId('platformTabAudit').innerHTML = state.audit.length ? `<ol class="cleanzi-admin__timeline">${state.audit.map((item) => `
      <li><strong>${escapeHtml(item.operation || item.action || 'Operacja')}</strong><time>${escapeHtml(formatDateTime(item.createdAt || item.created_at))}</time><p>${escapeHtml(item.phase || item.status || '')}</p></li>
    `).join('')}</ol>` : '<p class="cleanzi-admin__empty">Brak wpisów prywatnego audytu dla organizacji.</p>'
  }

  async function loadDetails(orgId) {
    const [details, history, transactions, documents, audit] = await Promise.all([
      cleanziAdminApi.details(orgId),
      cleanziAdminApi.history(orgId, { pageSize: 100 }),
      cleanziAdminApi.transactions(orgId, { pageSize: 100 }),
      cleanziAdminApi.documents(orgId, { pageSize: 100 }),
      cleanziAdminApi.audit(orgId, 100),
    ])
    state.details = details
    state.history = history?.items || []
    state.transactions = transactions?.items || []
    state.documents = documents?.items || []
    state.audit = audit?.items || []
    byId('platformOrganizationEditorSubtitle').textContent = `${details.organization?.name || orgId} · ${orgId}`
    byId('platformOrganizationEditor').hidden = false
    renderSummary()
    renderSubscription()
    renderBilling()
    renderHistory()
    renderAudit()
    selectTab('summary')
    byId('platformOrganizationEditor').scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function manageOrganization(orgId) {
    message('Otwieranie prywatnego kontekstu organizacji…', 'success')
    try {
      await establishContext(orgId)
      await loadDetails(orgId)
      message('Kontekst organizacji został otwarty.', 'success')
    } catch (error) {
      message(errorMessage(error, 'Nie udało się otworzyć organizacji.'))
    }
  }

  async function enterOrganization(orgId) {
    try {
      const session = await establishContext(orgId)
      setVisible(false)
      await activatePortalSession(session, router)
    } catch (error) {
      message(errorMessage(error, 'Nie udało się wejść do organizacji.'))
    }
  }

  async function closeContext({ silent = false } = {}) {
    if (!getSession()?.platformContextId) return
    await cleanziAdminApi.closeContext()
    clearPlatformContextSession()
    resetPortalState()
    setUserChip(null)
    state.selectedOrgId = ''
    state.details = null
    byId('platformOrganizationEditor').hidden = true
    if (!silent) message('Kontekst organizacji został zamknięty.', 'success')
  }

  function selectTab(tabName, focus = false) {
    const tabs = [...document.querySelectorAll('[data-platform-tab]')]
    tabs.forEach((tab) => {
      const selected = tab.dataset.platformTab === tabName
      tab.setAttribute('aria-selected', String(selected))
      tab.tabIndex = selected ? 0 : -1
      byId(tab.getAttribute('aria-controls')).hidden = !selected
      if (selected && focus) tab.focus()
    })
  }

  function fieldDefault(name) {
    const org = state.details?.organization || {}
    const subscription = state.details?.subscription || {}
    const values = {
      name: org.name,
      status: org.status,
      onboardingStatus: org.onboardingStatus,
      planCode: subscription.planCode,
      trialEndsAt: toLocalDateTime(subscription.trialEndsAt),
      currentPeriodStartsAt: toLocalDateTime(subscription.currentPeriodStartsAt),
      currentPeriodEndsAt: toLocalDateTime(subscription.currentPeriodEndsAt),
      currency: 'PLN',
      newOwnerWorkerId: org.owner?.workerId,
      occurredAt: toLocalDateTime(new Date().toISOString()),
    }
    return values[name] ?? ''
  }

  function renderOperationFields(definition) {
    byId('platformOperationFields').innerHTML = definition.fields.map(([name, label, type, options]) => {
      const value = fieldDefault(name)
      if (type === 'select') {
        return `<label class="cleanzi-admin__field"><span>${escapeHtml(label)}</span><select name="${escapeHtml(name)}">${options.map((option) => `<option value="${escapeHtml(option)}"${option === value ? ' selected' : ''}>${escapeHtml(name === 'planCode' ? option : statusLabel(option))}</option>`).join('')}</select></label>`
      }
      return `<label class="cleanzi-admin__field"><span>${escapeHtml(label)}</span><input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" ${type === 'number' ? 'step="1"' : ''} /></label>`
    }).join('')
  }

  function openOperation(operation, trigger) {
    const definition = OPERATION_DEFINITIONS[operation]
    if (!definition || !state.selectedOrgId) return
    state.operation = operation
    state.preview = null
    state.idempotencyKey = definition.financial ? crypto.randomUUID() : ''
    state.lastFocused = trigger || document.activeElement
    byId('platformOperationDialogTitle').textContent = definition.title
    byId('platformOperationDialogDescription').textContent = 'Najpierw wyświetlimy dokładne dane przed i po. Zapis wymaga osobnego potwierdzenia.'
    byId('platformOperationReason').value = ''
    byId('platformOperationPreview').replaceChildren()
    byId('platformOperationConfirmButton').hidden = true
    renderOperationFields(definition)
    byId('platformOperationDialog').hidden = false
    document.body.classList.add('has-cleanzi-admin-dialog')
    const firstField = byId('platformOperationFields').querySelector('input, select')
    ;(firstField || byId('platformOperationReason')).focus()
  }

  function closeOperation() {
    byId('platformOperationDialog').hidden = true
    document.body.classList.remove('has-cleanzi-admin-dialog')
    state.operation = ''
    state.preview = null
    state.lastFocused?.focus?.()
  }

  function operationPayload() {
    const form = new FormData(byId('platformOperationForm'))
    const payload = {}
    for (const [key, value] of form.entries()) {
      if (key === 'reason' || !text(value)) continue
      payload[key] = key.endsWith('At') ? toIsoDateTime(value) : text(value)
    }
    if (OPERATION_DEFINITIONS[state.operation]?.financial) payload.idempotencyKey = state.idempotencyKey
    return payload
  }

  async function previewOperation(event) {
    event.preventDefault()
    const reason = text(byId('platformOperationReason').value)
    if (reason.length < 3) {
      byId('platformOperationReason').focus()
      byId('platformOperationPreview').textContent = 'Podaj powód operacji (minimum 3 znaki).'
      return
    }
    const button = byId('platformOperationPreviewButton')
    button.disabled = true
    try {
      state.preview = await cleanziAdminApi.preview(state.selectedOrgId, state.operation, reason, operationPayload())
      byId('platformOperationPreview').innerHTML = `<h3>Podgląd zmian</h3><pre>${escapeHtml(JSON.stringify({ before: state.preview.before, after: state.preview.after }, null, 2))}</pre>`
      byId('platformOperationConfirmButton').hidden = false
      byId('platformOperationConfirmButton').focus()
    } catch (error) {
      byId('platformOperationPreview').textContent = errorMessage(error, 'Nie udało się przygotować podglądu.')
      byId('platformOperationConfirmButton').hidden = true
    } finally {
      button.disabled = false
    }
  }

  async function confirmOperation() {
    if (!state.preview) return
    const button = byId('platformOperationConfirmButton')
    button.disabled = true
    try {
      const result = await cleanziAdminApi.execute(
        state.selectedOrgId,
        state.operation,
        text(byId('platformOperationReason').value),
        operationPayload(),
        state.preview.expectedVersion,
      )
      closeOperation()
      await Promise.all([loadDetails(state.selectedOrgId), loadOrganizations(), loadDashboard()])
      message(result?.replayed ? 'Żądanie było już wykonane; zwrócono istniejący zapis.' : 'Operacja została zapisana.', 'success')
    } catch (error) {
      byId('platformOperationPreview').textContent = errorMessage(error)
      state.preview = null
      button.hidden = true
    } finally {
      button.disabled = false
    }
  }

  function handleDialogKeyboard(event) {
    if (byId('platformOperationDialog')?.hidden) return
    if (event.key === 'Escape') closeOperation()
    if (event.key !== 'Tab') return
    const focusable = [...byId('platformOperationDialog').querySelectorAll('button:not([hidden]):not(:disabled), input, select, textarea')]
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus()
    }
  }

  function bind() {
    if (state.bound) return () => {}
    state.bound = true
    document.querySelectorAll('[data-platform-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.platformView)))
    byId('platformAdminRefresh')?.addEventListener('click', () => void Promise.all([loadDashboard(), loadOrganizations()]))
    byId('platformAdminFilters')?.addEventListener('submit', (event) => event.preventDefault())
    byId('platformAdminFilters')?.addEventListener('input', (event) => {
      if (event.target.id !== 'platformOrganizationSearch') return
      window.clearTimeout(state.searchTimer)
      state.searchTimer = window.setTimeout(() => { state.page = 1; void loadOrganizations() }, 250)
    })
    byId('platformAdminFilters')?.addEventListener('change', () => { state.page = 1; void loadOrganizations() })
    byId('platformAdminClearFilters')?.addEventListener('click', () => {
      byId('platformAdminFilters').reset(); state.page = 1; state.sortBy = 'name'; state.sortDirection = 'ASC'; void loadOrganizations()
    })
    document.querySelectorAll('[data-platform-sort]').forEach((button) => button.addEventListener('click', () => {
      const sort = button.dataset.platformSort
      state.sortDirection = state.sortBy === sort && state.sortDirection === 'ASC' ? 'DESC' : 'ASC'
      state.sortBy = sort; state.page = 1; void loadOrganizations()
    }))
    byId('platformOrganizationsPrev')?.addEventListener('click', () => { if (state.page > 1) { state.page -= 1; void loadOrganizations() } })
    byId('platformOrganizationsNext')?.addEventListener('click', () => { if (state.page < state.totalPages) { state.page += 1; void loadOrganizations() } })
    byId('platformOrganizationList')?.addEventListener('click', (event) => {
      const manage = event.target.closest('[data-platform-manage]')
      const enter = event.target.closest('[data-platform-enter]')
      if (manage) void manageOrganization(manage.dataset.platformManage)
      if (enter) void enterOrganization(enter.dataset.platformEnter)
    })
    byId('platformOrganizationEditor')?.addEventListener('click', (event) => {
      const operation = event.target.closest('[data-platform-operation]')
      if (operation) openOperation(operation.dataset.platformOperation, operation)
    })
    document.querySelectorAll('[data-platform-tab]').forEach((tab, index, tabs) => {
      tab.addEventListener('click', () => selectTab(tab.dataset.platformTab))
      tab.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        let next = index
        if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
        if (event.key === 'Home') next = 0
        if (event.key === 'End') next = tabs.length - 1
        selectTab(tabs[next].dataset.platformTab, true)
      })
    })
    byId('platformOperationForm')?.addEventListener('submit', previewOperation)
    byId('platformOperationConfirmButton')?.addEventListener('click', confirmOperation)
    byId('platformOperationDialogClose')?.addEventListener('click', closeOperation)
    byId('platformOperationCancel')?.addEventListener('click', closeOperation)
    byId('platformOrganizationEditorClose')?.addEventListener('click', () => void closeContext().catch((error) => message(errorMessage(error))))
    byId('platformEditorEnter')?.addEventListener('click', () => { if (state.selectedOrgId) void enterOrganization(state.selectedOrgId) })
    byId('platformCenterLogout')?.addEventListener('click', async () => {
      if (getSession()?.platformContextId) await closeContext({ silent: true }).catch(() => {})
      logout(); resetPortalState(); setVisible(false); showLoginScreen(); showLoginCredentials(); setUserChip(null)
    })
    byId('organizationChip')?.addEventListener('click', () => {
      if (text(getSession()?.roleCode).toUpperCase() === 'PLATFORM_OWNER') void show({ closeCurrent: true })
    })
    document.addEventListener('keydown', handleDialogKeyboard)
    return () => window.clearTimeout(state.searchTimer)
  }

  async function show({ closeCurrent = false } = {}) {
    if (closeCurrent && getSession()?.platformContextId) await closeContext({ silent: true })
    showPortal()
    setVisible(true)
    setView(state.view)
    message('')
    state.page = 1
    await Promise.all([loadDashboard(), loadOrganizations(), cleanziAdminApi.plans().then((data) => { state.plans = data?.items || [] }).catch(() => {})])
  }

  return { bind, show, closeContext }
}
