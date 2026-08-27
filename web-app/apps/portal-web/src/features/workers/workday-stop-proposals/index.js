import './style.css'
import template from './template.html?raw'
import {
  decideWorkdayStopProposal,
  fetchWorkdayStopProposalDetail,
  fetchWorkdayStopProposals,
} from '../../../services/workdayStopProposalService'

export const route = 'workdayStopProposals'
export const viewId = 'view-workdayStopProposals'
export { template }

function text(value) {
  return String(value ?? '').trim()
}

const WORKDAY_STOP_PROPOSAL_STATUS_LABELS = {
  PENDING: 'Weryfikacja',
  APPROVED: 'Zatwierdzone',
  CORRECTED: 'Poprawione',
  REJECTED: 'Odrzucone',
  SUPERSEDED: 'Nieaktualne',
}

function workdayStopProposalStatusLabel(value) {
  const status = text(value).toUpperCase()
  return WORKDAY_STOP_PROPOSAL_STATUS_LABELS[status] || status || '—'
}

function dateTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Warsaw' }).format(date)
}

function duration(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0) return '—'
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  return `${hours} h ${String(minutes).padStart(2, '0')} min`
}

function datetimeLocal(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`
}

function newClientActionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `wsp-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function createWorkdayStopProposalsFeature(ctx) {
  const { appState, createBindingHelpers, escapeHtml, showTransientNotice } = ctx
  let rows = []
  let selected = null
  let capability = { canApprove: false }
  const byId = (id) => document.getElementById(id)
  const orgId = () => text(appState.session?.orgId)

  function filters() {
    return {
      workerId: text(byId('wspWorkerId')?.value),
      from: text(byId('wspFrom')?.value),
      to: text(byId('wspTo')?.value),
      status: text(byId('wspStatus')?.value) || 'PENDING',
      limit: 100,
    }
  }

  function renderAccess() {
    const root = byId('wspAccess')
    if (!root) return
    root.classList.toggle('is-denied', !capability.canApprove)
    root.textContent = capability.canApprove
      ? 'Masz aktywny dostęp portalowy do decyzji. Każda decyzja jest audytowana.'
      : 'Masz dostęp do odczytu. Decyzje są dostępne tylko dla aktywnego dostępu portalowego.'
  }

  function renderQueue() {
    const root = byId('wspQueue')
    const count = byId('wspCount')
    if (count) count.textContent = `${rows.length} / 100`
    if (!root) return
    if (!rows.length) {
      root.innerHTML = '<p style="padding:16px;margin:0;color:#64748b;">Brak zgłoszeń dla wybranych filtrów.</p>'
      return
    }
    root.innerHTML = rows.map((row) => `
      <button type="button" data-wsp-proposal-id="${escapeHtml(row.proposalId || row.id)}" aria-current="${selected?.proposal?.proposalId === (row.proposalId || row.id) ? 'true' : 'false'}">
        <strong>${escapeHtml(row.workerName || row.workerLogin || row.workerId)}</strong>
        <small>START: ${escapeHtml(dateTime(row.startAt))} · propozycja: ${escapeHtml(row.proposedStopLocal || dateTime(row.proposedStopAt))}</small>
        <small>Status: ${escapeHtml(workdayStopProposalStatusLabel(row.status))}</small>
      </button>
    `).join('')
  }

  function renderDetail() {
    const root = byId('wspDetail')
    if (!root) return
    const proposal = selected?.proposal
    if (!proposal) {
      root.textContent = 'Wybierz zgłoszenie z listy.'
      return
    }
    const canDecide = Boolean(capability.canApprove && proposal.status === 'PENDING')
    root.innerHTML = `
      <div class="workday-stop-proposals__facts">
        <div><span>Pracownik</span><strong>${escapeHtml(proposal.workerName || proposal.workerLogin || proposal.workerId)}</strong></div>
        <div><span>Status</span><strong>${escapeHtml(workdayStopProposalStatusLabel(proposal.status))}</strong></div>
        <div><span>START</span><strong>${escapeHtml(dateTime(proposal.startAt))}</strong></div>
        <div><span>Proponowany STOP</span><strong>${escapeHtml(proposal.proposedStopLocal || dateTime(proposal.proposedStopAt))}</strong></div>
        <div><span>Wyliczony czas</span><strong>${escapeHtml(duration(proposal.proposedDurationSec))}</strong></div>
        <div><span>Wersja</span><strong>${escapeHtml(proposal.version)}</strong></div>
      </div>
      <p><strong>Komentarz pracownika:</strong> ${escapeHtml(proposal.employeeNote || 'Brak komentarza.')}</p>
      <p class="workday-stop-proposals__warning">${canDecide ? 'Zatwierdzenie albo korekta zapisze oficjalny czas STOP w ewidencji Workday.' : 'Ta pozycja jest tylko do odczytu albo nie wymaga już decyzji.'}</p>
      ${canDecide ? `
        <div class="workday-stop-proposals__decision">
          <label><span>Godzina biura przy korekcie</span><input id="wspCorrectStopAt" type="datetime-local" value="${escapeHtml(datetimeLocal(proposal.proposedStopAt))}" /></label>
          <label><span>Komentarz decyzji (wymagany przy odrzuceniu)</span><textarea id="wspDecisionNote" maxlength="2000" placeholder="Uzasadnienie dla pracownika i audytu"></textarea></label>
          <div class="workday-stop-proposals__actions">
            <button class="workday-stop-proposals__action workday-stop-proposals__action--approve" type="button" data-wsp-action="APPROVE">Zatwierdź propozycję</button>
            <button class="workday-stop-proposals__action workday-stop-proposals__action--correct" type="button" data-wsp-action="CORRECT">Popraw i zatwierdź</button>
            <button class="workday-stop-proposals__action workday-stop-proposals__action--reject" type="button" data-wsp-action="REJECT">Odrzuć</button>
          </div>
        </div>
      ` : ''}
      <h3>Historia decyzji</h3>
      <ol class="workday-stop-proposals__history">
        ${(selected.history || []).map((entry) => `<li><strong>${escapeHtml(entry.action)}</strong> · ${escapeHtml(dateTime(entry.occurredAt))}${entry.note ? ` — ${escapeHtml(entry.note)}` : ''}</li>`).join('') || '<li>Brak wpisów historii.</li>'}
      </ol>
    `
  }

  async function refresh({ preserveDetail = true } = {}) {
    if (!orgId()) return
    const organizationInput = byId('wspOrganization')
    if (organizationInput) organizationInput.value = orgId()
    const payload = await fetchWorkdayStopProposals(orgId(), filters())
    rows = Array.isArray(payload.proposals) ? payload.proposals : []
    capability = payload.capability || { canApprove: false }
    if (preserveDetail && selected?.proposal?.proposalId && !rows.some((row) => (row.proposalId || row.id) === selected.proposal.proposalId)) selected = null
    renderAccess()
    renderQueue()
    renderDetail()
  }

  async function openDetail(proposalId) {
    selected = await fetchWorkdayStopProposalDetail(orgId(), proposalId)
    capability = selected.capability || capability
    renderAccess()
    renderQueue()
    renderDetail()
  }

  async function decide(action) {
    const proposal = selected?.proposal
    if (!proposal) return
    const decisionNote = text(byId('wspDecisionNote')?.value)
    if (action === 'REJECT' && !decisionNote) {
      showTransientNotice?.('Podaj obowiązkowy powód odrzucenia.', 'error')
      return
    }
    const correctValue = text(byId('wspCorrectStopAt')?.value)
    const result = await decideWorkdayStopProposal(orgId(), {
      action,
      proposalId: proposal.proposalId || proposal.id,
      expectedVersion: proposal.version,
      clientActionId: newClientActionId(),
      decisionNote,
      ...(action === 'CORRECT' && correctValue ? { officialStopAt: new Date(correctValue).toISOString() } : {}),
    })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('portal:workday-updated', {
        detail: {
          source: 'workday-stop-proposal-decision',
          action,
          proposalId: proposal.proposalId || proposal.id,
          workdayId: proposal.workdayId || '',
        },
      }))
    }
    showTransientNotice?.('Decyzja została zapisana w audycie i ewidencji czasu pracy.', 'success')
    await refresh({ preserveDetail: false })
    if (result?.proposal?.proposalId || result?.proposal?.id) await openDetail(result.proposal.proposalId || result.proposal.id)
  }

  function bind() {
    const binding = createBindingHelpers()
    binding.add(byId('wspRefresh'), 'click', () => void refresh())
    binding.add(byId('wspApplyFilters'), 'click', () => void refresh({ preserveDetail: false }))
    binding.add(byId('wspQueue'), 'click', (event) => {
      const button = event.target?.closest?.('[data-wsp-proposal-id]')
      if (button) void openDetail(text(button.getAttribute('data-wsp-proposal-id')))
    })
    binding.add(byId('wspDetail'), 'click', (event) => {
      const button = event.target?.closest?.('[data-wsp-action]')
      if (button) void decide(text(button.getAttribute('data-wsp-action')))
    })
    return () => binding.done()
  }

  return { bind, refresh }
}
