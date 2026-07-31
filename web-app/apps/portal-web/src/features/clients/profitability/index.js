import template from './template.html?raw'
import './style.css'
import {
  createProfitabilityCost,
  createProfitabilityRevenue,
  fetchProfitabilityHistory,
  fetchProfitabilitySummary,
  saveProfitabilityAsset,
  saveProfitabilityContract,
  saveProfitabilityWorkerRate,
} from '../../../services/profitabilityService'

const DEFAULT_CURRENCY = 'PLN'
const CURRENCY_DIGITS = new Map([
  ['BHD', 3],
  ['CLP', 0],
  ['HUF', 2],
  ['ISK', 0],
  ['JPY', 0],
  ['KWD', 3],
  ['PLN', 2],
])

function text(value) {
  return String(value ?? '').trim()
}

function monthKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function integerString(value) {
  const raw = text(value)
  return /^-?\d+$/.test(raw) ? raw : ''
}

function safeBigInt(value) {
  const normalized = integerString(value)
  if (!normalized) return null
  try {
    return BigInt(normalized)
  } catch {
    return null
  }
}

function currencyDigits(currency) {
  return CURRENCY_DIGITS.get(text(currency).toUpperCase()) ?? 2
}

function formatMinor(value, currency = DEFAULT_CURRENCY) {
  const amount = safeBigInt(value)
  if (amount === null) return '—'
  const normalizedCurrency = text(currency).toUpperCase() || DEFAULT_CURRENCY
  const digits = currencyDigits(normalizedCurrency)
  const scale = 10n ** BigInt(digits)
  const negative = amount < 0n
  const absolute = negative ? -amount : amount
  const major = absolute / scale
  const remainder = absolute % scale
  const integer = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(major)
  const fraction = digits ? `,${remainder.toString().padStart(digits, '0')}` : ''
  const symbol = normalizedCurrency === 'PLN' ? 'zł' : normalizedCurrency
  return `${negative ? '−' : ''}${integer}${fraction}\u00a0${symbol}`
}

function formatBps(value) {
  const bps = safeBigInt(value)
  if (bps === null) return '—'
  const negative = bps < 0n
  const absolute = negative ? -bps : bps
  const whole = absolute / 100n
  const fraction = absolute % 100n
  return `${negative ? '−' : ''}${whole.toString()},${fraction.toString().padStart(2, '0')}%`
}

function decimalToScaledInteger(value, digits = 2, label = 'Kwota') {
  const normalized = text(value).replace(/\s+/g, '').replace(',', '.')
  if (!normalized) return ''
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d+))?$/)
  if (!match) throw new Error(`${label} ma niepoprawny format.`)
  const fraction = String(match[3] ?? '')
  if (fraction.length > digits) {
    throw new Error(`${label} może mieć maksymalnie ${digits} miejsca po przecinku.`)
  }
  const scale = 10n ** BigInt(digits)
  const major = BigInt(match[2]) * scale
  const minor = BigInt((fraction || '').padEnd(digits, '0') || '0')
  const result = major + minor
  return `${match[1] === '-' ? '-' : ''}${result.toString()}`
}

function nonNegativeMinor(value, currency, label, { required = false } = {}) {
  const raw = text(value)
  if (!raw) {
    if (required) throw new Error(`${label} jest wymagana.`)
    return ''
  }
  const minor = decimalToScaledInteger(raw, currencyDigits(currency), label)
  if (safeBigInt(minor) < 0n) throw new Error(`${label} nie może być ujemna.`)
  return minor
}

function minorToDecimalInput(value, currency = DEFAULT_CURRENCY) {
  const amount = safeBigInt(value)
  if (amount === null) return ''
  const digits = currencyDigits(currency)
  if (!digits) return amount.toString()
  const scale = 10n ** BigInt(digits)
  const negative = amount < 0n
  const absolute = negative ? -amount : amount
  const major = absolute / scale
  const fraction = (absolute % scale).toString().padStart(digits, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${major.toString()}${fraction ? `,${fraction}` : ''}`
}

function percentToBps(value, label, { min = -1000, max = 100 } = {}) {
  const raw = text(value)
  if (!raw) return ''
  const bps = decimalToScaledInteger(raw, 2, label)
  const numeric = Number(raw.replace(',', '.'))
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new Error(`${label} musi mieścić się w zakresie od ${min}% do ${max}%.`)
  }
  return bps
}

function normalizeCurrency(value) {
  const currency = text(value).toUpperCase() || DEFAULT_CURRENCY
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Waluta musi być zgodna z ISO 4217.')
  return currency
}

function formatDuration(value) {
  const seconds = safeBigInt(value)
  if (seconds === null) return '—'
  const negative = seconds < 0n
  const absolute = negative ? -seconds : seconds
  const hours = absolute / 3600n
  const minutes = (absolute % 3600n) / 60n
  return `${negative ? '−' : ''}${hours.toString()} godz. ${minutes.toString().padStart(2, '0')} min`
}

function formatDate(value) {
  const raw = text(value)
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return raw || '—'
  return `${match[3]}.${match[2]}.${match[1]}`
}

function formatMonthLabel(value) {
  const raw = text(value)
  const match = raw.match(/^(\d{4})-(\d{2})$/)
  if (!match) return raw || '—'
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
  return new Intl.DateTimeFormat('pl-PL', { month: 'short' }).format(date).replace('.', '')
}

function polishPlural(value, one, few, many) {
  const count = Math.abs(Math.trunc(Number(value) || 0))
  const lastTwo = count % 100
  const last = count % 10
  if (count === 1) return one
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few
  return many
}

const COST_CATEGORY_LABELS = Object.freeze({
  COORDINATION: 'Koordynacja',
  DELIVERIES: 'Dostawy',
  MATERIALS: 'Materiały i środki',
  OBJECT_TRAINING: 'Szkolenie obiektowe',
  OTHER_DIRECT: 'Pozostałe koszty',
  SHARED_COST: 'Koszty wspólne',
  SUBCONTRACTORS: 'Podwykonawcy',
  TRANSPORT: 'Transport',
})

const RECURRENCE_LABELS = Object.freeze({
  ACTUAL_USAGE: 'Zużycie rzeczywiste',
  MONTHLY: 'Miesięczny',
  ONE_TIME: 'Jednorazowy',
})

const PERIODIC_STATUS_LABELS = Object.freeze({
  CANCELLED: 'Anulowana',
  COMPLETED: 'Wykonana',
  IN_PROGRESS: 'W realizacji',
  PLANNED: 'Zaplanowana',
})

function normalizeObjects(payload = {}) {
  const rows = Array.isArray(payload.objects)
    ? payload.objects
    : Array.isArray(payload.objectSummaries)
      ? payload.objectSummaries
      : []
  return rows.map((row) => ({
    ...row,
    objectId: text(row.objectId || row.id),
    name: text(row.name || row.objectName || row.label) || 'Obiekt bez nazwy',
    currency: text(row.currency || payload.currency).toUpperCase() || DEFAULT_CURRENCY,
  })).filter((row) => row.objectId)
}

function normalizePayload(payload = {}) {
  const summary = payload.summary && typeof payload.summary === 'object' ? payload.summary : {}
  const objects = normalizeObjects(payload)
  return {
    ...payload,
    currency: text(payload.currency || summary.currency).toUpperCase() || DEFAULT_CURRENCY,
    period: text(payload.period),
    summary,
    objects,
    warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    history: Array.isArray(payload.history) ? payload.history : [],
    capability: payload.capability && typeof payload.capability === 'object' ? payload.capability : {},
  }
}

function completenessState(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return { className: 'is-incomplete', label: 'Niepełne dane' }
  if (numeric >= 100) return { className: 'is-complete', label: 'Dane kompletne' }
  return { className: 'is-incomplete', label: `${Math.max(0, Math.min(100, Math.round(numeric)))}% danych kompletnych` }
}

function fieldHtml(escapeHtml, {
  name,
  label,
  type = 'text',
  value = '',
  required = false,
  wide = false,
  options = [],
  help = '',
  min = '',
  step = '',
  billingModels = '',
  requiredForModels = '',
}) {
  const className = `cpf-form-field${wide ? ' cpf-form-field--wide' : ''}`
  const requiredAttribute = required ? ' required' : ''
  const helpHtml = help ? `<small class="cpf-form-help">${escapeHtml(help)}</small>` : ''
  const billingAttributes = billingModels
    ? ` data-cpf-billing-models="${escapeHtml(billingModels)}" data-cpf-required-models="${escapeHtml(requiredForModels)}"`
    : ''
  let control = ''
  if (type === 'select') {
    control = `<select name="${escapeHtml(name)}"${requiredAttribute}>${options.map((option) => {
      const optionValue = typeof option === 'string' ? option : option.value
      const optionLabel = typeof option === 'string' ? option : option.label
      return `<option value="${escapeHtml(optionValue)}"${text(optionValue) === text(value) ? ' selected' : ''}>${escapeHtml(optionLabel)}</option>`
    }).join('')}</select>`
  } else if (type === 'textarea') {
    control = `<textarea name="${escapeHtml(name)}"${requiredAttribute}>${escapeHtml(value)}</textarea>`
  } else {
    control = `<input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}"${requiredAttribute}${min !== '' ? ` min="${escapeHtml(min)}"` : ''}${step !== '' ? ` step="${escapeHtml(step)}"` : ''} />`
  }
  return `<label class="${className}"${billingAttributes}><span>${escapeHtml(label)}</span>${control}${helpHtml}</label>`
}

export function createClientProfitabilityFeature(ctx) {
  const {
    appState,
    canEditProfitability = () => false,
    canReadProfitability = () => false,
    escapeHtml = (value) => String(value ?? ''),
    showTransientNotice = () => {},
  } = ctx

  let mounted = false
  let requestSequence = 0
  let currentClient = null
  let currentPeriod = monthKey()
  let currentObjectId = ''
  let currentPayload = normalizePayload()
  let modalType = ''
  let modalTrigger = null
  const listeners = []

  function byId(id) {
    return document.getElementById(id)
  }

  function addListener(node, type, handler) {
    if (!node) return
    node.addEventListener(type, handler)
    listeners.push(() => node.removeEventListener(type, handler))
  }

  function setHidden(id, hidden) {
    const node = byId(id)
    if (node) node.hidden = Boolean(hidden)
  }

  function setText(id, value) {
    const node = byId(id)
    if (node) node.textContent = text(value)
  }

  function setMetric(id, value, { className = '', metaId = '', meta = '' } = {}) {
    const node = byId(id)
    if (node) {
      node.textContent = value
      node.classList.remove('is-positive', 'is-negative', 'is-incomplete')
      if (className) node.classList.add(className)
    }
    if (metaId) setText(metaId, meta)
  }

  function selectedObject() {
    return currentPayload.objects.find((row) => row.objectId === currentObjectId) || null
  }

  function editable() {
    return Boolean(canEditProfitability() && currentPayload.capability?.canEdit !== false)
  }

  function readable() {
    return Boolean(canReadProfitability() && currentPayload.capability?.canRead !== false)
  }

  function renderAccessState() {
    const access = byId('cpfAccessState')
    const workspace = byId('cpfWorkspace')
    if (!access || !workspace) return false
    if (readable()) {
      access.hidden = true
      workspace.hidden = false
      return true
    }
    const planCode = text(appState.session?.planCode) || 'obecnego pakietu'
    access.innerHTML = `
      <strong>Moduł finansów nie jest dostępny.</strong>
      <span>„Koszty i rentowność” wymagają pakietu PRO oraz uprawnienia finansowego. Aktywny pakiet: ${escapeHtml(planCode)}.</span>
    `
    access.hidden = false
    workspace.hidden = true
    return false
  }

  function setLoading(loading) {
    setHidden('cpfLoadingState', !loading)
    setHidden('cpfContent', loading)
    setHidden('cpfErrorState', true)
  }

  function showError(error) {
    setHidden('cpfLoadingState', true)
    setHidden('cpfContent', true)
    setHidden('cpfErrorState', false)
    const code = text(error?.code)
    const prefix = code === 'PROFITABILITY_SCHEMA_NOT_READY'
      ? 'Schemat modułu finansowego nie został jeszcze aktywowany. '
      : ''
    setText('cpfErrorMessage', `${prefix}${text(error?.message) || 'Nieznany błąd.'}`)
  }

  function renderObjectFilter() {
    const select = byId('cpfObjectFilter')
    if (!select) return
    const options = ['<option value="">Wszystkie obiekty</option>']
    currentPayload.objects.forEach((row) => {
      options.push(`<option value="${escapeHtml(row.objectId)}"${row.objectId === currentObjectId ? ' selected' : ''}>${escapeHtml(row.name)}</option>`)
    })
    select.innerHTML = options.join('')
    select.value = currentObjectId
  }

  function renderMetrics() {
    const summary = currentPayload.summary || {}
    const currency = text(summary.currency || currentPayload.currency) || DEFAULT_CURRENCY
    const incomplete = Boolean(summary.incomplete || currentPayload.status === 'INCOMPLETE' || currentPayload.warnings.length)
    const margin = safeBigInt(summary.marginMinor)
    const profitability = safeBigInt(summary.profitabilityBps)
    setMetric('cpfMetricRevenue', formatMinor(summary.revenueMinor, currency), {
      metaId: 'cpfMetricRevenueMeta',
      meta: summary.revenueMinor === null || summary.revenueMinor === undefined ? 'Brak wartości kontraktu' : 'Kwoty netto',
    })
    setMetric('cpfMetricCost', incomplete && !integerString(summary.totalCostMinor) ? '—' : formatMinor(summary.totalCostMinor, currency), {
      className: incomplete ? 'is-incomplete' : '',
      metaId: 'cpfMetricCostMeta',
      meta: incomplete ? 'Niepełne dane kosztowe' : 'Wszystkie kategorie',
    })
    setMetric('cpfMetricLabor', formatMinor(summary.laborCostMinor, currency), {
      className: summary.laborIncomplete ? 'is-incomplete' : '',
      metaId: 'cpfMetricLaborMeta',
      meta: summary.laborIncomplete ? 'Brak stawki lub STOP' : 'Na podstawie START/STOP',
    })
    setMetric('cpfMetricMargin', incomplete && margin === null ? '—' : formatMinor(summary.marginMinor, currency), {
      className: margin !== null ? (margin < 0n ? 'is-negative' : 'is-positive') : incomplete ? 'is-incomplete' : '',
      metaId: 'cpfMetricMarginMeta',
      meta: incomplete ? 'Wynik wymaga uzupełnienia' : 'Przychód minus koszty',
    })
    setMetric('cpfMetricProfitability', incomplete || profitability === null ? '—' : formatBps(summary.profitabilityBps), {
      className: incomplete ? 'is-incomplete' : profitability !== null && profitability < 0n ? 'is-negative' : 'is-positive',
      metaId: 'cpfMetricProfitabilityMeta',
      meta: incomplete ? 'Nie można obliczyć' : 'Marża / przychód',
    })
    const quality = completenessState(summary.completenessPercent)
    setMetric('cpfMetricCompleteness', Number.isFinite(Number(summary.completenessPercent)) ? `${Math.round(Number(summary.completenessPercent))}%` : '—', {
      className: quality.className,
      metaId: 'cpfMetricCompletenessMeta',
      meta: quality.label,
    })
    const badge = byId('cpfQualityBadge')
    if (badge) {
      badge.className = `cpf-quality-badge ${quality.className}`
      badge.textContent = quality.label
    }
    setText('cpfContextNote', currentPayload.period ? `Okres rozliczeniowy: ${currentPayload.period}` : 'Wybierz okres rozliczeniowy')
  }

  function objectStatus(row) {
    if (row.incomplete || Number(row.completenessPercent) < 100) {
      return { className: 'is-incomplete', label: 'Niepełne dane' }
    }
    const status = text(row.status).toUpperCase()
    if (status === 'NOT_CALCULABLE') return { className: 'is-incomplete', label: 'Nie można obliczyć' }
    if (status === 'NEGATIVE') return { className: 'is-blocked', label: 'Wynik ujemny' }
    if (status === 'BELOW_TARGET') return { className: 'is-incomplete', label: 'Poniżej celu' }
    if (status === 'ABOVE_TARGET') return { className: 'is-complete', label: 'Powyżej celu' }
    const margin = safeBigInt(row.marginMinor)
    if (margin !== null && margin < 0n) return { className: 'is-blocked', label: 'Wynik ujemny' }
    return { className: 'is-complete', label: 'Rentowny' }
  }

  function renderObjects() {
    const tbody = byId('cpfObjectRows')
    const tfoot = byId('cpfObjectTotals')
    const empty = byId('cpfObjectsEmpty')
    const wrap = document.querySelector('#view-clientProfileDetails .cpf-table-wrap')
    if (!tbody || !tfoot || !empty) return
    const rows = currentPayload.objects
    setText('cpfObjectCount', `${rows.length} ${polishPlural(rows.length, 'obiekt', 'obiekty', 'obiektów')}`)
    empty.hidden = rows.length > 0
    if (wrap) wrap.hidden = rows.length === 0
    tbody.innerHTML = rows.map((row) => {
      const currency = row.currency || currentPayload.currency
      const status = objectStatus(row)
      const marginText = integerString(row.marginMinor) ? formatMinor(row.marginMinor, currency) : '—'
      const profitabilityText = row.incomplete || !integerString(row.profitabilityBps) ? '' : formatBps(row.profitabilityBps)
      return `
        <tr class="${row.objectId === currentObjectId ? 'is-selected' : ''}" data-cpf-object-row="${escapeHtml(row.objectId)}">
          <td><button class="cpf-object-button" type="button" data-cpf-select-object="${escapeHtml(row.objectId)}">${escapeHtml(row.name)}</button></td>
          <td>${formatMinor(row.revenueMinor, currency)}</td>
          <td>${formatMinor(row.laborCostMinor, currency)}</td>
          <td>${formatMinor(row.materialCostMinor, currency)}</td>
          <td>${formatMinor(row.otherCostMinor, currency)}</td>
          <td>${marginText}${profitabilityText ? `<span class="cpf-money-note">${profitabilityText}</span>` : ''}</td>
          <td><span class="cpf-data-badge ${status.className}">${escapeHtml(status.label)}</span></td>
        </tr>
      `
    }).join('')

    const summary = currentPayload.summary || {}
    const currency = currentPayload.currency
    tfoot.innerHTML = rows.length ? `
      <tr>
        <td>Razem</td>
        <td>${formatMinor(summary.revenueMinor, currency)}</td>
        <td>${formatMinor(summary.laborCostMinor, currency)}</td>
        <td>${formatMinor(summary.materialCostMinor, currency)}</td>
        <td>${formatMinor(summary.otherCostMinor, currency)}</td>
        <td>${formatMinor(summary.marginMinor, currency)}${integerString(summary.profitabilityBps) && !summary.incomplete ? `<span class="cpf-money-note">${formatBps(summary.profitabilityBps)}</span>` : ''}</td>
        <td></td>
      </tr>
    ` : ''
  }

  function breakdownRows(row) {
    if (!row) return []
    const explicit = Array.isArray(row.costBreakdown) ? row.costBreakdown : []
    if (explicit.length) return explicit
    return [
      { key: 'labor', label: 'Praca', amountMinor: row.laborCostMinor },
      { key: 'materials', label: 'Materiały i środki', amountMinor: row.materialCostMinor },
      { key: 'equipment', label: 'Sprzęt i maszyny', amountMinor: row.equipmentCostMinor },
      { key: 'periodic', label: 'Prace okresowe', amountMinor: row.periodicCostMinor },
      { key: 'other', label: 'Transport i pozostałe', amountMinor: row.otherCostMinor },
    ]
  }

  function renderBreakdown() {
    const row = selectedObject()
    const list = byId('cpfBreakdownRows')
    const empty = byId('cpfBreakdownEmpty')
    if (!list || !empty) return
    const actionIds = [
      'cpfContractBtn',
      'cpfAddCostBtn',
      'cpfAddRevenueBtn',
      'cpfWorkerRateBtn',
      'cpfAssetBtn',
      'cpfHistoryBtn',
      'cpfObjectDetailsBtn',
    ]
    const editActionIds = new Set(['cpfContractBtn', 'cpfAddCostBtn', 'cpfAddRevenueBtn', 'cpfWorkerRateBtn', 'cpfAssetBtn'])
    actionIds.forEach((id) => {
      const button = byId(id)
      if (button) button.disabled = !row || (editActionIds.has(id) && !editable())
    })
    if (!row) {
      list.innerHTML = ''
      empty.hidden = false
      setText('cpfBreakdownTitle', 'Szczegóły obiektu')
      setText('cpfSelectedObjectMeta', 'Wybierz obiekt z tabeli.')
      return
    }
    empty.hidden = true
    setText('cpfBreakdownTitle', row.name)
    const quality = objectStatus(row)
    setText('cpfSelectedObjectMeta', `${quality.label}${row.contractName ? ` · ${row.contractName}` : ''}`)
    const currency = row.currency || currentPayload.currency
    const total = safeBigInt(row.totalCostMinor)
    list.innerHTML = breakdownRows(row).map((item) => {
      const amount = safeBigInt(item.amountMinor)
      let percentage = '—'
      if (amount !== null && total !== null && total > 0n) {
        percentage = formatBps((amount * 10000n) / total)
      }
      return `<div class="cpf-breakdown-row"><span>${escapeHtml(item.label || item.category || 'Koszt')}</span><strong>${formatMinor(item.amountMinor, currency)}</strong><small>${percentage}</small></div>`
    }).join('')
    list.insertAdjacentHTML('beforeend', `<div class="cpf-breakdown-row"><span>Razem koszty</span><strong>${formatMinor(row.totalCostMinor, currency)}</strong><small>100%</small></div>`)
  }

  function laborWorkerRows(row) {
    const breakdown = row?.laborCostBreakdown
    if (Array.isArray(breakdown)) {
      return breakdown.map((item) => ({
        amountMinor: item.costMinor ?? item.amountMinor,
        label: text(item.workerName || item.workerLogin) || 'Pracownik',
      }))
    }
    return Object.entries(breakdown?.byWorker ?? {}).map(([workerLogin, amountMinor]) => ({
      amountMinor,
      label: workerLogin,
    }))
  }

  function renderPlanExecution() {
    const target = byId('cpfPlanExecution')
    if (!target) return
    const row = selectedObject()
    const comparison = row?.laborComparison || (!row ? currentPayload.summary?.laborComparison : null)
    setText('cpfPlanMeta', row ? `${row.name} · czas i koszt pracy` : 'Wybierz obiekt, aby zobaczyć plan i wykonanie')
    if (!comparison || (safeBigInt(comparison.plannedSeconds) === null && safeBigInt(comparison.plannedCostMinor) === null)) {
      target.innerHTML = '<div class="cpf-table-empty">Brak kompletnego planu lub danych START/STOP dla wybranego zakresu.</div>'
      return
    }

    const currency = row?.currency || currentPayload.currency
    const secondsDelta = safeBigInt(comparison.secondsDelta)
    const costDelta = safeBigInt(comparison.costDeltaMinor)
    const isOverPlan = (secondsDelta !== null && secondsDelta > 0n) || (costDelta !== null && costDelta > 0n)
    const isUnderPlan = (secondsDelta !== null && secondsDelta < 0n) || (costDelta !== null && costDelta < 0n)
    const deltaClass = isOverPlan ? 'is-negative' : isUnderPlan ? 'is-positive' : 'is-neutral'
    const deltaLabel = isOverPlan ? 'Przekroczenie planu' : isUnderPlan ? 'Poniżej planu' : 'Zgodnie z planem'
    const workers = laborWorkerRows(row)
      .filter((item) => safeBigInt(item.amountMinor) !== null)
      .sort((left, right) => {
        const leftAmount = safeBigInt(left.amountMinor) ?? 0n
        const rightAmount = safeBigInt(right.amountMinor) ?? 0n
        return leftAmount === rightAmount ? 0 : leftAmount > rightAmount ? -1 : 1
      })
      .slice(0, 3)

    target.innerHTML = `
      <div class="cpf-plan-grid">
        <div class="cpf-plan-stat"><span>Planowany czas</span><strong>${formatDuration(comparison.plannedSeconds)}</strong></div>
        <div class="cpf-plan-stat"><span>Rzeczywisty czas</span><strong>${formatDuration(comparison.actualSeconds)}</strong></div>
        <div class="cpf-plan-stat"><span>Planowany koszt</span><strong>${formatMinor(comparison.plannedCostMinor, currency)}</strong></div>
        <div class="cpf-plan-stat"><span>Rzeczywisty koszt</span><strong>${formatMinor(comparison.actualCostMinor, currency)}</strong></div>
        <div class="cpf-plan-delta ${deltaClass}"><span>${deltaLabel}</span><strong>${formatDuration(comparison.secondsDelta)} · ${formatMinor(comparison.costDeltaMinor, currency)}</strong></div>
      </div>
      ${workers.length ? `<div class="cpf-labor-split"><span>Najwyższy koszt pracy według pracowników</span>${workers.map((item) => `<div><strong>${escapeHtml(item.label)}</strong><b>${formatMinor(item.amountMinor, currency)}</b></div>`).join('')}</div>` : ''}
    `
  }

  function trendPoints() {
    if (Array.isArray(currentPayload.trend)) return currentPayload.trend
    return Array.isArray(currentPayload.trend?.points) ? currentPayload.trend.points : []
  }

  function renderTrend() {
    const target = byId('cpfTrendContent')
    if (!target) return
    const points = trendPoints().slice(-12)
    if (!points.length) {
      const reason = text(currentPayload.trend?.emptyReason) || 'Trend pojawi się po zapisaniu pierwszego snapshotu okresu finansowego.'
      target.innerHTML = `<div class="cpf-table-empty">${escapeHtml(reason)}</div>`
      return
    }
    const values = points.map((point) => safeBigInt(point.profitabilityBps)).filter((value) => value !== null)
    const maximum = values.reduce((max, value) => {
      const absolute = value < 0n ? -value : value
      return absolute > max ? absolute : max
    }, 1n)
    const firstValue = safeBigInt(points.find((point) => safeBigInt(point.profitabilityBps) !== null)?.profitabilityBps)
    const lastValue = safeBigInt([...points].reverse().find((point) => safeBigInt(point.profitabilityBps) !== null)?.profitabilityBps)
    target.innerHTML = `
      <div class="cpf-trend-chart" role="img" aria-label="Trend rentowności z ostatnich ${points.length} okresów">
        ${points.map((point) => {
          const value = safeBigInt(point.profitabilityBps)
          const absolute = value === null ? 0n : value < 0n ? -value : value
          const height = value === null ? 3 : Math.max(8, Math.min(100, Number((absolute * 100n) / maximum)))
          const status = value === null || point.incomplete ? 'Nie można obliczyć' : value < 0n ? 'Wynik ujemny' : 'Wynik dodatni'
          return `<div class="cpf-trend-column" title="${escapeHtml(`${point.period}: ${value === null ? 'nie można obliczyć' : formatBps(value)} · ${status}`)}"><div class="cpf-trend-bar${value !== null && value < 0n ? ' is-negative' : ''}" style="height:${height}%"></div><span class="cpf-trend-label">${escapeHtml(formatMonthLabel(point.period))}</span></div>`
        }).join('')}
      </div>
      <div class="cpf-trend-legend">${firstValue === null || lastValue === null ? 'Nie wszystkie okresy można obliczyć.' : `Zmiana w pokazanym oknie: ${formatBps(firstValue)} → ${formatBps(lastValue)}.`} Źródło: zamknięte snapshoty okresów.</div>
    `
  }

  function renderRanking() {
    const target = byId('cpfRankingContent')
    if (!target) return
    const rows = [...currentPayload.objects].sort((left, right) => {
      const leftValue = left.incomplete ? null : safeBigInt(left.profitabilityBps)
      const rightValue = right.incomplete ? null : safeBigInt(right.profitabilityBps)
      if (leftValue === null && rightValue === null) return left.name.localeCompare(right.name, 'pl')
      if (leftValue === null) return 1
      if (rightValue === null) return -1
      return leftValue === rightValue ? left.name.localeCompare(right.name, 'pl') : leftValue > rightValue ? -1 : 1
    })
    const summary = currentPayload.summary || {}
    const profitable = Number.isFinite(Number(summary.profitableObjects))
      ? Number(summary.profitableObjects)
      : rows.filter((row) => !row.incomplete && (safeBigInt(row.marginMinor) ?? -1n) >= 0n).length
    const unprofitable = Number.isFinite(Number(summary.unprofitableObjects))
      ? Number(summary.unprofitableObjects)
      : rows.filter((row) => !row.incomplete && (safeBigInt(row.marginMinor) ?? 0n) < 0n).length
    const notCalculable = Number.isFinite(Number(summary.notCalculableObjects))
      ? Number(summary.notCalculableObjects)
      : rows.length - profitable - unprofitable
    setText('cpfRankingMeta', `${profitable} ${polishPlural(profitable, 'rentowny', 'rentowne', 'rentownych')} · ${unprofitable} ${polishPlural(unprofitable, 'nierentowny', 'nierentowne', 'nierentownych')} · ${notCalculable} ${polishPlural(notCalculable, 'niepoliczalny', 'niepoliczalne', 'niepoliczalnych')}`)
    target.innerHTML = rows.length ? `<ol class="cpf-ranking-list">${rows.map((row) => {
      const status = objectStatus(row)
      const profitability = !row.incomplete ? safeBigInt(row.profitabilityBps) : null
      return `<li class="cpf-ranking-item"><div><span class="cpf-ranking-name">${escapeHtml(row.name)}</span><span class="cpf-ranking-meta">${escapeHtml(status.label)}</span></div><strong class="cpf-ranking-value${profitability !== null && profitability < 0n ? ' is-negative' : ''}">${profitability === null ? '—' : formatBps(profitability)}</strong></li>`
    }).join('')}</ol>` : '<div class="cpf-table-empty">Brak obiektów do porównania.</div>'
  }

  function renderCostsTable() {
    const target = byId('cpfCostsContent')
    if (!target) return
    const row = selectedObject()
    const entries = Array.isArray(row?.costEntries) ? row.costEntries : []
    if (!row || !entries.length) {
      target.innerHTML = `<div class="cpf-table-empty">${row ? 'Brak ręcznych wpisów kosztowych w wybranym okresie.' : 'Wybierz obiekt, aby zobaczyć wpisy kosztowe.'}</div>`
      return
    }
    target.innerHTML = `<table class="cpf-data-table"><thead><tr><th>Data</th><th>Kategoria</th><th>Nazwa</th><th>Charakter</th><th>Kwota netto</th></tr></thead><tbody>${entries.map((entry) => {
      const category = COST_CATEGORY_LABELS[text(entry.category).toUpperCase()] || text(entry.category) || 'Pozostałe'
      const recurrence = RECURRENCE_LABELS[text(entry.recurrence).toUpperCase()] || text(entry.recurrence) || '—'
      const date = entry.date || entry.occurredOn || entry.activeFrom
      return `<tr><td>${escapeHtml(formatDate(date))}</td><td>${escapeHtml(category)}</td><td><strong>${escapeHtml(entry.name || 'Koszt')}</strong></td><td>${escapeHtml(recurrence)}</td><td><strong>${formatMinor(entry.amountMinor, entry.currency || row.currency)}</strong></td></tr>`
    }).join('')}</tbody></table>`
  }

  function renderPeriodicTable() {
    const target = byId('cpfPeriodicContent')
    if (!target) return
    const row = selectedObject()
    const entries = Array.isArray(row?.periodicBreakdown) ? row.periodicBreakdown : []
    if (!row || !entries.length) {
      target.innerHTML = `<div class="cpf-table-empty">${row ? 'Brak prac okresowych w wybranym okresie.' : 'Wybierz obiekt, aby zobaczyć prace okresowe.'}</div>`
      return
    }
    target.innerHTML = `<table class="cpf-data-table"><thead><tr><th>Praca</th><th>Plan</th><th>Wykonanie</th><th>Status</th><th>Przychód</th><th>Koszt</th><th>Marża</th></tr></thead><tbody>${entries.map((entry) => {
      const status = PERIODIC_STATUS_LABELS[text(entry.status).toUpperCase()] || text(entry.status) || 'Brak statusu'
      return `<tr><td><strong>${escapeHtml(entry.name || entry.id || 'Praca okresowa')}</strong></td><td>${escapeHtml(formatDate(entry.plannedAt))}</td><td>${escapeHtml(formatDate(entry.performedAt))}</td><td>${escapeHtml(status)}</td><td>${formatMinor(entry.revenueMinor, row.currency)}</td><td>${formatMinor(entry.totalCostMinor, row.currency)}</td><td><strong>${formatMinor(entry.marginMinor, row.currency)}</strong></td></tr>`
    }).join('')}</tbody></table>`
  }

  function renderAnalytics() {
    renderPlanExecution()
    renderTrend()
    renderRanking()
    renderCostsTable()
    renderPeriodicTable()
  }

  function warningLabel(warning) {
    return text(warning?.message || warning?.label || warning?.code) || 'Brakujące dane'
  }

  function renderWarnings() {
    const panel = byId('cpfWarningPanel')
    if (!panel) return
    const warnings = currentPayload.warnings
    panel.hidden = warnings.length === 0
    setText('cpfWarningSummary', warnings.length
      ? `${warnings.length} ${warnings.length === 1 ? 'problem wpływa' : 'problemy wpływają'} na wiarygodność wyniku. ${warnings.slice(0, 2).map(warningLabel).join(' · ')}`
      : '')
  }

  function renderPayload(payload, options = {}) {
    currentPayload = normalizePayload(payload)
    if (currentPayload.period) currentPeriod = currentPayload.period
    const preferredObjectId = text(options.objectId || currentObjectId)
    currentObjectId = currentPayload.objects.some((row) => row.objectId === preferredObjectId)
      ? preferredObjectId
      : currentPayload.objects[0]?.objectId || ''
    const periodInput = byId('cpfPeriod')
    if (periodInput) periodInput.value = currentPeriod
    renderAccessState()
    renderObjectFilter()
    renderMetrics()
    renderWarnings()
    renderObjects()
    renderBreakdown()
    renderAnalytics()
    setHidden('cpfLoadingState', true)
    setHidden('cpfErrorState', true)
    setHidden('cpfContent', false)
    setText('cpfFootnote', `Kwoty netto${currentPayload.currency ? ` w ${currentPayload.currency}` : ''}. Obliczenia i kontrolę kompletności wykonuje backend.`)
  }

  async function load(force = false) {
    if (!currentClient || !appState.session?.orgId || !renderAccessState()) return
    const sequence = ++requestSequence
    setLoading(true)
    try {
      const payload = await fetchProfitabilitySummary(appState.session.orgId, currentClient.id || currentClient.clientId, {
        period: currentPeriod,
        objectId: currentObjectId,
        force,
      })
      if (sequence !== requestSequence) return
      renderPayload(payload, { objectId: currentObjectId })
    } catch (error) {
      if (sequence !== requestSequence) return
      if (error?.status === 403 || ['PROFITABILITY_NOT_ENTITLED', 'PROFITABILITY_FORBIDDEN'].includes(text(error?.code))) {
        currentPayload = normalizePayload({ capability: { canRead: false } })
        renderAccessState()
        return
      }
      showError(error)
    }
  }

  function selectObject(objectId) {
    currentObjectId = text(objectId)
    renderObjectFilter()
    renderObjects()
    renderBreakdown()
    renderAnalytics()
  }

  function modalElements() {
    return {
      layer: byId('cpfModalLayer'),
      title: byId('cpfModalTitle'),
      description: byId('cpfModalDescription'),
      body: byId('cpfModalBody'),
      form: byId('cpfModalForm'),
      error: byId('cpfModalError'),
      submit: byId('cpfModalSubmitBtn'),
    }
  }

  function closeModal() {
    const { layer, form, error } = modalElements()
    if (layer) layer.hidden = true
    if (form) form.reset()
    if (error) error.hidden = true
    modalType = ''
    document.body.classList.remove('cpf-modal-open')
    modalTrigger?.focus?.()
    modalTrigger = null
  }

  function syncContractBillingFields() {
    const body = byId('cpfModalBody')
    if (!body || modalType !== 'contract') return
    const model = text(body.querySelector('[name="billingModel"]')?.value).toUpperCase()
    body.querySelectorAll('[data-cpf-billing-models]').forEach((field) => {
      const models = text(field.getAttribute('data-cpf-billing-models')).split(/\s+/).filter(Boolean)
      const requiredModels = text(field.getAttribute('data-cpf-required-models')).split(/\s+/).filter(Boolean)
      const visible = models.includes(model)
      field.hidden = !visible
      field.style.display = visible ? '' : 'none'
      const control = field.querySelector('input, select, textarea')
      if (control) {
        control.disabled = !visible
        control.required = visible && requiredModels.includes(model)
      }
    })
  }

  function openModal(type, trigger = null) {
    const object = selectedObject()
    if (!object && type !== 'warnings') {
      showTransientNotice('Najpierw wybierz obiekt.', 'error')
      return
    }
    if (['contract', 'cost', 'revenue', 'worker-rate', 'asset'].includes(type) && !editable()) {
      showTransientNotice('Nie masz uprawnienia do edycji danych finansowych.', 'error')
      return
    }
    const elements = modalElements()
    if (!elements.layer || !elements.body) return
    modalType = type
    modalTrigger = trigger || document.activeElement
    elements.error.hidden = true
    elements.submit.hidden = ['history', 'warnings', 'details'].includes(type)
    elements.submit.disabled = false
    const currency = object?.currency || currentPayload.currency || DEFAULT_CURRENCY

    if (type === 'contract') {
      elements.title.textContent = 'Umowa i model rozliczenia'
      elements.description.textContent = object.name
      const contract = object.contract || {}
      const billingModel = text(contract.billingModel || object.billingModel).toUpperCase() || 'MONTHLY_FIXED'
      elements.body.innerHTML = [
        fieldHtml(escapeHtml, { name: 'contractName', label: 'Numer lub nazwa kontraktu', value: contract.contractName || object.contractName, required: true, wide: true }),
        fieldHtml(escapeHtml, { name: 'validFrom', label: 'Obowiązuje od', type: 'date', value: contract.validFrom || contract.effectiveFrom || `${currentPeriod}-01`, required: true }),
        fieldHtml(escapeHtml, { name: 'validTo', label: 'Obowiązuje do', type: 'date', value: contract.validTo || contract.effectiveTo }),
        fieldHtml(escapeHtml, { name: 'billingModel', label: 'Model rozliczenia', type: 'select', value: billingModel, options: [
          { value: 'MONTHLY_FIXED', label: 'Stała kwota miesięczna' },
          { value: 'HOURLY', label: 'Stawka godzinowa' },
          { value: 'PER_SERVICE', label: 'Stawka za usługę' },
          { value: 'MIXED', label: 'Model mieszany' },
        ], required: true }),
        fieldHtml(escapeHtml, { name: 'currency', label: 'Waluta ISO 4217', value: contract.currency || currency, required: true }),
        fieldHtml(escapeHtml, {
          name: 'monthlyValue',
          label: 'Stały przychód miesięczny netto',
          value: minorToDecimalInput(contract.monthlyValueMinor ?? contract.revenueMinor, contract.currency || currency),
          help: `Kwota w ${contract.currency || currency}`,
          billingModels: 'MONTHLY_FIXED MIXED',
          requiredForModels: 'MONTHLY_FIXED',
        }),
        fieldHtml(escapeHtml, {
          name: 'hourlyRate',
          label: 'Stawka netto za godzinę',
          value: minorToDecimalInput(contract.hourlyRateMinor, contract.currency || currency),
          help: `Kwota w ${contract.currency || currency}`,
          billingModels: 'HOURLY MIXED',
          requiredForModels: 'HOURLY',
        }),
        fieldHtml(escapeHtml, {
          name: 'serviceRate',
          label: 'Stawka netto za usługę',
          value: minorToDecimalInput(contract.serviceRateMinor, contract.currency || currency),
          help: `Kwota w ${contract.currency || currency}`,
          billingModels: 'PER_SERVICE MIXED',
          requiredForModels: 'PER_SERVICE',
        }),
        fieldHtml(escapeHtml, { name: 'vatRate', label: 'VAT (%) – informacyjnie', value: contract.vatRate ?? (integerString(contract.vatRateBps) ? Number(contract.vatRateBps) / 100 : ''), step: '0.01' }),
        fieldHtml(escapeHtml, { name: 'targetMargin', label: 'Minimalna rentowność (%)', value: contract.targetMargin ?? (integerString(contract.targetProfitabilityBps ?? contract.targetMarginBps) ? Number(contract.targetProfitabilityBps ?? contract.targetMarginBps) / 100 : '') }),
        fieldHtml(escapeHtml, { name: 'source', label: 'Źródło danych', type: 'select', value: contract.source || 'MANUAL', options: [
          { value: 'MANUAL', label: 'Ręczne' },
          { value: 'IMPORT', label: 'Import' },
          { value: 'INTEGRATION', label: 'Integracja' },
          { value: 'CORRECTION', label: 'Korekta' },
        ], required: true }),
        fieldHtml(escapeHtml, { name: 'reason', label: 'Powód zmiany', type: 'textarea', wide: true, help: 'Wymagany przy korekcie wartości użytej w rozliczeniu.' }),
      ].join('')
      syncContractBillingFields()
    } else if (type === 'revenue') {
      elements.title.textContent = 'Dodaj przychód zmienny'
      elements.description.textContent = object.name
      elements.body.innerHTML = [
        fieldHtml(escapeHtml, { name: 'category', label: 'Rodzaj przychodu', type: 'select', required: true, options: [
          { value: 'ADDITIONAL_SERVICE', label: 'Usługa dodatkowa' },
          { value: 'PERIODIC_SERVICE', label: 'Praca okresowa' },
          { value: 'SURCHARGE', label: 'Dopłata' },
          { value: 'OTHER_REVENUE', label: 'Pozostały przychód' },
        ] }),
        fieldHtml(escapeHtml, { name: 'name', label: 'Nazwa przychodu', required: true }),
        fieldHtml(escapeHtml, { name: 'amount', label: 'Kwota netto', required: true, help: `Kwota w ${currency}` }),
        fieldHtml(escapeHtml, { name: 'currency', label: 'Waluta ISO 4217', value: currency, required: true }),
        fieldHtml(escapeHtml, { name: 'occurredOn', label: 'Data ujęcia przychodu', type: 'date', value: `${currentPeriod}-01`, required: true }),
        fieldHtml(escapeHtml, { name: 'recurrence', label: 'Charakter przychodu', type: 'select', options: [
          { value: 'ONE_TIME', label: 'Jednorazowy' },
          { value: 'MONTHLY', label: 'Miesięczny' },
          { value: 'ACTUAL_USAGE', label: 'Według wykonania' },
        ], required: true }),
        fieldHtml(escapeHtml, { name: 'source', label: 'Źródło danych', type: 'select', options: [
          { value: 'MANUAL', label: 'Ręczne' },
          { value: 'IMPORT', label: 'Import' },
          { value: 'INTEGRATION', label: 'Integracja' },
          { value: 'CORRECTION', label: 'Korekta' },
        ], required: true }),
        fieldHtml(escapeHtml, { name: 'description', label: 'Opis lub dokument', type: 'textarea', wide: true }),
        fieldHtml(escapeHtml, { name: 'reason', label: 'Powód korekty', type: 'textarea', wide: true, help: 'Uzupełnij przy wpisie korygującym.' }),
      ].join('')
    } else if (type === 'cost') {
      elements.title.textContent = 'Dodaj koszt'
      elements.description.textContent = object.name
      elements.body.innerHTML = [
        fieldHtml(escapeHtml, { name: 'category', label: 'Kategoria', type: 'select', required: true, options: [
          { value: 'MATERIALS', label: 'Materiały i środki' },
          { value: 'TRANSPORT', label: 'Transport' },
          { value: 'COORDINATION', label: 'Koordynacja' },
          { value: 'SUBCONTRACTORS', label: 'Podwykonawcy' },
          { value: 'DELIVERIES', label: 'Dostawy' },
          { value: 'OBJECT_TRAINING', label: 'Szkolenia obiektowe' },
          { value: 'SHARED_COST', label: 'Udział kosztów wspólnych' },
          { value: 'OTHER_DIRECT', label: 'Pozostałe koszty bezpośrednie' },
        ] }),
        fieldHtml(escapeHtml, { name: 'name', label: 'Nazwa kosztu', required: true }),
        fieldHtml(escapeHtml, { name: 'amount', label: 'Kwota netto', required: true, help: `Kwota w ${currency}` }),
        fieldHtml(escapeHtml, { name: 'currency', label: 'Waluta ISO 4217', value: currency, required: true }),
        fieldHtml(escapeHtml, { name: 'costDate', label: 'Data kosztu', type: 'date', value: `${currentPeriod}-01`, required: true }),
        fieldHtml(escapeHtml, { name: 'recurrence', label: 'Charakter kosztu', type: 'select', options: [
          { value: 'ONE_TIME', label: 'Jednorazowy' },
          { value: 'MONTHLY', label: 'Miesięczny' },
          { value: 'ACTUAL_USAGE', label: 'Rzeczywiste zużycie' },
        ], required: true }),
        fieldHtml(escapeHtml, { name: 'source', label: 'Źródło danych', type: 'select', options: [
          { value: 'MANUAL', label: 'Ręczne' },
          { value: 'WAREHOUSE', label: 'Magazyn' },
          { value: 'IMPORT', label: 'Import' },
          { value: 'INTEGRATION', label: 'Integracja' },
        ], required: true }),
        fieldHtml(escapeHtml, { name: 'description', label: 'Opis lub dokument', type: 'textarea', wide: true }),
      ].join('')
    } else if (type === 'worker-rate') {
      elements.title.textContent = 'Stawka kosztowa pracownika'
      elements.description.textContent = object.name
      elements.body.innerHTML = [
        fieldHtml(escapeHtml, { name: 'workerLogin', label: 'Login lub e-mail pracownika', required: true, wide: true, help: 'Podaj login używany przy zdarzeniach START/STOP.' }),
        fieldHtml(escapeHtml, { name: 'hourlyCost', label: 'Koszt jednej godziny pracy', required: true, help: `Kwota w ${currency}` }),
        fieldHtml(escapeHtml, { name: 'currency', label: 'Waluta ISO 4217', value: currency, required: true }),
        fieldHtml(escapeHtml, { name: 'effectiveFrom', label: 'Stawka obowiązuje od', type: 'date', value: `${currentPeriod}-01`, required: true }),
        fieldHtml(escapeHtml, { name: 'effectiveTo', label: 'Stawka obowiązuje do', type: 'date', help: 'Pozostaw puste, jeśli stawka obowiązuje bezterminowo.' }),
        fieldHtml(escapeHtml, { name: 'source', label: 'Źródło danych', type: 'select', options: [
          { value: 'MANUAL', label: 'Ręczne' },
          { value: 'IMPORT', label: 'Import' },
          { value: 'INTEGRATION', label: 'Integracja' },
          { value: 'CORRECTION', label: 'Korekta' },
        ], required: true }),
        fieldHtml(escapeHtml, { name: 'reason', label: 'Powód zmiany', type: 'textarea', wide: true, help: 'Wymagany przy zastąpieniu stawki od tej samej daty.' }),
      ].join('')
    } else if (type === 'asset') {
      elements.title.textContent = 'Sprzęt i maszyny'
      elements.description.textContent = object.name
      elements.body.innerHTML = [
        fieldHtml(escapeHtml, { name: 'name', label: 'Nazwa sprzętu', required: true }),
        fieldHtml(escapeHtml, { name: 'category', label: 'Kategoria', required: true }),
        fieldHtml(escapeHtml, { name: 'inventoryNumber', label: 'Numer ewidencyjny' }),
        fieldHtml(escapeHtml, { name: 'usageStart', label: 'Początek użytkowania', type: 'date', required: true }),
        fieldHtml(escapeHtml, { name: 'financing', label: 'Sposób finansowania', type: 'select', options: [
          { value: 'PURCHASE', label: 'Zakup' },
          { value: 'LEASE', label: 'Leasing' },
          { value: 'RENTAL', label: 'Wynajem' },
        ], required: true }),
        fieldHtml(escapeHtml, { name: 'settlementMethod', label: 'Sposób rozliczania kosztu', type: 'select', options: [
          { value: 'AMORTIZATION', label: 'Amortyzacja miesięczna' },
          { value: 'ONE_TIME', label: 'Pełny koszt jednorazowy' },
          { value: 'MONTHLY_PAYMENT', label: 'Rata leasingu lub wynajmu' },
        ], required: true, help: 'System nie policzy zakupu i amortyzacji jednocześnie.' }),
        fieldHtml(escapeHtml, { name: 'purchaseAmount', label: 'Wartość zakupu netto', help: `Kwota w ${currency}` }),
        fieldHtml(escapeHtml, { name: 'amortizationMonths', label: 'Liczba miesięcy amortyzacji', type: 'number', min: '1', step: '1' }),
        fieldHtml(escapeHtml, { name: 'monthlyPayment', label: 'Miesięczna rata / wynajem', help: `Kwota w ${currency}` }),
        fieldHtml(escapeHtml, { name: 'serviceCost', label: 'Koszty serwisu i napraw', help: `Kwota w ${currency}` }),
        fieldHtml(escapeHtml, { name: 'currency', label: 'Waluta ISO 4217', value: currency, required: true }),
        fieldHtml(escapeHtml, { name: 'costEnd', label: 'Koniec naliczania', type: 'date' }),
      ].join('')
    } else if (type === 'warnings') {
      elements.title.textContent = 'Brakujące dane'
      elements.description.textContent = 'Te pozycje wpływają na wiarygodność wyniku.'
      elements.body.innerHTML = `<div class="cpf-warning-list">${currentPayload.warnings.length
        ? currentPayload.warnings.map((warning) => `<article class="cpf-warning-item"><strong>${escapeHtml(warningLabel(warning))}</strong><span>${escapeHtml(warning.details || warning.hint || 'Uzupełnij dane źródłowe, aby wynik mógł zostać obliczony.')}</span></article>`).join('')
        : '<article class="cpf-warning-item"><strong>Brak ostrzeżeń</strong><span>Dane są kompletne dla wybranego zakresu.</span></article>'}</div>`
    } else if (type === 'details') {
      const status = objectStatus(object)
      elements.title.textContent = 'Szczegóły obiektu'
      elements.description.textContent = object.name
      elements.body.innerHTML = `<div class="cpf-history-list">
        <article class="cpf-history-item"><strong>Identyfikator obiektu</strong><span>${escapeHtml(object.objectId)}</span></article>
        <article class="cpf-history-item"><strong>Strefa czasowa</strong><span>${escapeHtml(object.timeZone || 'Brak danych')}</span></article>
        <article class="cpf-history-item"><strong>Status danych</strong><span>${escapeHtml(status.label)}</span></article>
        <article class="cpf-history-item"><strong>Plan a wykonanie</strong><span>${escapeHtml(object.laborComparisonLabel || 'Brak kompletnego planu lub danych START/STOP.')}</span></article>
      </div>`
    }

    elements.layer.hidden = false
    document.body.classList.add('cpf-modal-open')
    setTimeout(() => elements.body.querySelector('input, select, textarea, button')?.focus(), 0)
  }

  async function openHistory(trigger) {
    const object = selectedObject()
    if (!object) return
    const elements = modalElements()
    openModal('history', trigger)
    elements.title.textContent = 'Historia zmian'
    elements.description.textContent = object.name
    elements.body.innerHTML = '<div class="cpf-loading">Ładowanie historii…</div>'
    try {
      const payload = await fetchProfitabilityHistory(appState.session.orgId, currentClient.id || currentClient.clientId, {
        period: currentPeriod,
        objectId: object.objectId,
      })
      const rows = Array.isArray(payload?.history) ? payload.history : []
      elements.body.innerHTML = `<div class="cpf-history-list">${rows.length
        ? rows.map((entry) => `<article class="cpf-history-item"><strong>${escapeHtml(entry.actionLabel || entry.action || 'Zmiana danych')}</strong><span>${escapeHtml(entry.changedAt || entry.createdAt || '')} · ${escapeHtml(entry.actorName || entry.actorId || 'Nieznany autor')}</span><span>${escapeHtml(entry.summary || entry.reason || 'Brak opisu')}</span></article>`).join('')
        : '<article class="cpf-history-item"><strong>Brak zmian</strong><span>Nie zapisano jeszcze historii dla tego obiektu i okresu.</span></article>'}</div>`
    } catch (error) {
      elements.body.innerHTML = `<div class="cpf-error"><strong>Nie udało się pobrać historii.</strong><span>${escapeHtml(error?.message || 'Nieznany błąd.')}</span></div>`
    }
  }

  function formValues(form) {
    return Object.fromEntries(new FormData(form).entries())
  }

  async function submitModal(event) {
    event.preventDefault()
    const object = selectedObject()
    const elements = modalElements()
    if (!object || !elements.form || !['contract', 'cost', 'revenue', 'worker-rate', 'asset'].includes(modalType)) return
    elements.error.hidden = true
    elements.submit.disabled = true
    try {
      if (!elements.form.reportValidity()) return
      const values = formValues(elements.form)
      const currency = normalizeCurrency(values.currency)
      if (modalType === 'contract') {
        if (values.validTo && values.validFrom && values.validTo <= values.validFrom) {
          throw new Error('Data zakończenia musi być późniejsza niż data rozpoczęcia.')
        }
        const billingModel = text(values.billingModel).toUpperCase()
        if (!['MONTHLY_FIXED', 'HOURLY', 'PER_SERVICE', 'MIXED'].includes(billingModel)) {
          throw new Error('Wybierz prawidłowy model rozliczenia.')
        }
        const monthlyValueMinor = nonNegativeMinor(values.monthlyValue, currency, 'Stały przychód miesięczny')
        const hourlyRateMinor = nonNegativeMinor(values.hourlyRate, currency, 'Stawka godzinowa')
        const serviceRateMinor = nonNegativeMinor(values.serviceRate, currency, 'Stawka za usługę')
        if (billingModel === 'MONTHLY_FIXED' && !monthlyValueMinor) {
          throw new Error('Dla stałej kwoty miesięcznej podaj przychód miesięczny.')
        }
        if (billingModel === 'HOURLY' && !hourlyRateMinor) {
          throw new Error('Dla rozliczenia godzinowego podaj stawkę za godzinę.')
        }
        if (billingModel === 'PER_SERVICE' && !serviceRateMinor) {
          throw new Error('Dla rozliczenia za usługę podaj stawkę za usługę.')
        }
        if (billingModel === 'MIXED' && !monthlyValueMinor && !hourlyRateMinor && !serviceRateMinor) {
          throw new Error('Dla modelu mieszanego podaj co najmniej jedną stawkę przychodu.')
        }
        await saveProfitabilityContract(appState.session.orgId, currentClient.id || currentClient.clientId, object.objectId, currentPeriod, {
          contractName: text(values.contractName),
          validFrom: text(values.validFrom),
          validTo: text(values.validTo),
          monthlyValueMinor,
          hourlyRateMinor,
          serviceRateMinor,
          currency,
          vatRateBps: percentToBps(values.vatRate, 'Stawka VAT', { min: 0, max: 100 }),
          billingModel,
          targetMarginBps: percentToBps(values.targetMargin, 'Próg rentowności'),
          source: text(values.source),
          reason: text(values.reason),
        })
      } else if (modalType === 'revenue') {
        const occurredOn = text(values.occurredOn)
        const recurrence = text(values.recurrence).toUpperCase()
        await createProfitabilityRevenue(appState.session.orgId, currentClient.id || currentClient.clientId, object.objectId, currentPeriod, {
          category: text(values.category),
          name: text(values.name),
          amountMinor: nonNegativeMinor(values.amount, currency, 'Kwota przychodu', { required: true }),
          currency,
          occurredOn,
          periodStart: recurrence === 'MONTHLY' ? occurredOn : '',
          recurrence,
          source: text(values.source),
          description: text(values.description),
          reason: text(values.reason),
        })
      } else if (modalType === 'cost') {
        await createProfitabilityCost(appState.session.orgId, currentClient.id || currentClient.clientId, object.objectId, currentPeriod, {
          category: text(values.category),
          name: text(values.name),
          amountMinor: nonNegativeMinor(values.amount, currency, 'Kwota kosztu', { required: true }),
          currency,
          costDate: text(values.costDate),
          recurrence: text(values.recurrence),
          source: text(values.source),
          description: text(values.description),
        })
      } else if (modalType === 'worker-rate') {
        if (values.effectiveTo && values.effectiveFrom && values.effectiveTo <= values.effectiveFrom) {
          throw new Error('Data końcowa stawki musi być późniejsza niż data początkowa.')
        }
        await saveProfitabilityWorkerRate(appState.session.orgId, currentClient.id || currentClient.clientId, object.objectId, currentPeriod, {
          workerLogin: text(values.workerLogin),
          hourlyCostMinor: nonNegativeMinor(values.hourlyCost, currency, 'Koszt godziny pracy', { required: true }),
          currency,
          effectiveFrom: text(values.effectiveFrom),
          effectiveTo: text(values.effectiveTo),
          source: text(values.source),
          reason: text(values.reason),
        })
      } else {
        const settlementMethod = text(values.settlementMethod)
        const purchaseAmountMinor = nonNegativeMinor(values.purchaseAmount, currency, 'Wartość zakupu')
        const monthlyPaymentMinor = nonNegativeMinor(values.monthlyPayment, currency, 'Miesięczna rata')
        if (settlementMethod === 'AMORTIZATION' && (!purchaseAmountMinor || Number(values.amortizationMonths) < 1)) {
          throw new Error('Dla amortyzacji podaj wartość zakupu i liczbę miesięcy.')
        }
        if (settlementMethod === 'ONE_TIME' && !purchaseAmountMinor) {
          throw new Error('Dla kosztu jednorazowego podaj wartość zakupu.')
        }
        if (settlementMethod === 'MONTHLY_PAYMENT' && !monthlyPaymentMinor) {
          throw new Error('Dla leasingu lub wynajmu podaj miesięczną ratę.')
        }
        await saveProfitabilityAsset(appState.session.orgId, currentClient.id || currentClient.clientId, object.objectId, currentPeriod, {
          name: text(values.name),
          category: text(values.category),
          inventoryNumber: text(values.inventoryNumber),
          usageStart: text(values.usageStart),
          financing: text(values.financing),
          settlementMethod,
          purchaseAmountMinor,
          amortizationMonths: text(values.amortizationMonths),
          monthlyPaymentMinor,
          serviceCostMinor: nonNegativeMinor(values.serviceCost, currency, 'Koszt serwisu'),
          currency,
          costEnd: text(values.costEnd),
        })
      }
      closeModal()
      showTransientNotice('Zapisano dane finansowe.')
      await load(true)
    } catch (error) {
      elements.error.textContent = text(error?.message) || 'Nie udało się zapisać danych.'
      elements.error.hidden = false
    } finally {
      elements.submit.disabled = false
    }
  }

  function handleKeydown(event) {
    const layer = byId('cpfModalLayer')
    if (!layer || layer.hidden) return
    if (event.key === 'Escape') {
      event.preventDefault()
      closeModal()
    }
  }

  function bind() {
    addListener(byId('cpfPeriod'), 'change', (event) => {
      currentPeriod = text(event.target.value) || monthKey()
      void load(true)
    })
    addListener(byId('cpfObjectFilter'), 'change', (event) => selectObject(event.target.value))
    addListener(byId('cpfRefreshBtn'), 'click', () => void load(true))
    addListener(byId('cpfErrorRetryBtn'), 'click', () => void load(true))
    addListener(byId('cpfObjectRows'), 'click', (event) => {
      const button = event.target.closest('[data-cpf-select-object]')
      if (button) selectObject(button.getAttribute('data-cpf-select-object'))
    })
    addListener(byId('cpfContractBtn'), 'click', (event) => openModal('contract', event.currentTarget))
    addListener(byId('cpfAddCostBtn'), 'click', (event) => openModal('cost', event.currentTarget))
    addListener(byId('cpfAddRevenueBtn'), 'click', (event) => openModal('revenue', event.currentTarget))
    addListener(byId('cpfWorkerRateBtn'), 'click', (event) => openModal('worker-rate', event.currentTarget))
    addListener(byId('cpfAssetBtn'), 'click', (event) => openModal('asset', event.currentTarget))
    addListener(byId('cpfHistoryBtn'), 'click', (event) => void openHistory(event.currentTarget))
    addListener(byId('cpfObjectDetailsBtn'), 'click', (event) => openModal('details', event.currentTarget))
    addListener(byId('cpfWarningDetailsBtn'), 'click', (event) => openModal('warnings', event.currentTarget))
    addListener(byId('cpfModalLayer'), 'click', (event) => {
      if (event.target.closest('[data-cpf-close-modal]')) closeModal()
    })
    addListener(byId('cpfModalBody'), 'change', (event) => {
      if (event.target.matches('[name="billingModel"]')) syncContractBillingFields()
    })
    addListener(byId('cpfModalForm'), 'submit', submitModal)
    addListener(document, 'keydown', handleKeydown)
  }

  function ensureMounted() {
    if (mounted) return true
    const mount = byId('cpdProfitabilityMount')
    if (!mount) return false
    mount.innerHTML = template
    mounted = true
    bind()
    return true
  }

  async function open(client = appState.clientProfileCurrent, options = {}) {
    if (!ensureMounted()) return
    const nextClientId = text(client?.id || client?.clientId)
    const clientChanged = nextClientId !== text(currentClient?.id || currentClient?.clientId)
    currentClient = client || null
    if (clientChanged) {
      currentObjectId = ''
      currentPayload = normalizePayload()
    }
    const previewHost = ['127.0.0.1', 'localhost'].includes(window.location.hostname)
    if (import.meta.env.DEV && previewHost && new URLSearchParams(window.location.search).get('profitabilityPreview') === '1') {
      const { createProfitabilityPreviewPayload } = await import('./previewFixture.js')
      renderPayload(createProfitabilityPreviewPayload(), { objectId: options.objectId })
      const badge = byId('cpfQualityBadge')
      if (badge) {
        badge.className = 'cpf-quality-badge is-preview'
        badge.textContent = 'Dane przykładowe · podgląd lokalny'
      }
      return
    }
    if (!renderAccessState()) return
    if (options.payload) {
      renderPayload(options.payload, { objectId: options.objectId })
      return
    }
    await load(Boolean(options.force || clientChanged))
  }

  function destroy() {
    requestSequence += 1
    listeners.splice(0).forEach((remove) => remove())
    mounted = false
  }

  return {
    destroy,
    formatMinor,
    open,
    refresh: () => load(true),
    renderPayload,
  }
}
