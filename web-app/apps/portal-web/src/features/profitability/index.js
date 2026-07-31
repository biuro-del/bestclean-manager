import './style.css'
import template from './template.html?raw'

export const route = 'contractProfitability'
export const viewId = 'view-contractProfitability'
export { template }

const STATUS_META = Object.freeze({
  ABOVE_TARGET: Object.freeze({ label: 'Powyżej celu', tone: 'is-positive', icon: '↑' }),
  BELOW_TARGET: Object.freeze({ label: 'Poniżej celu', tone: 'is-warning', icon: '↓' }),
  NEGATIVE: Object.freeze({ label: 'Wynik ujemny', tone: 'is-negative', icon: '!' }),
  INCOMPLETE: Object.freeze({ label: 'Niepełne dane', tone: 'is-incomplete', icon: '?' }),
  NOT_CALCULABLE: Object.freeze({ label: 'Nie można obliczyć', tone: 'is-incomplete', icon: '?' }),
})

const ATTENTION_PRIORITY = Object.freeze({
  NEGATIVE: 0,
  INCOMPLETE: 1,
  NOT_CALCULABLE: 2,
  BELOW_TARGET: 3,
  ABOVE_TARGET: 4,
})

function numericValue(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizedText(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('pl')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function sumValues(rows, field) {
  return rows.reduce((sum, row) => {
    const value = numericValue(row?.[field])
    return value === null ? sum : sum + value
  }, 0)
}

function localPreviewHost() {
  if (typeof window === 'undefined') {
    return false
  }
  return ['localhost', '127.0.0.1', '::1'].includes(String(window.location.hostname ?? '').toLowerCase())
}

export function createContractProfitabilityFeature(ctx) {
  const {
    canReadProfitability,
    createBindingHelpers,
    escapeHtml,
  } = ctx

  let payload = null
  let previewMode = false
  let previewPromise = null
  let selectedContractId = ''
  let chartMetric = 'profitabilityBps'
  let resizeObserver = null

  const byId = (id) => document.getElementById(id)

  function setHidden(node, hidden) {
    if (node instanceof HTMLElement) {
      node.hidden = hidden
    }
  }

  function moneyLabel(minorValue, currency = 'PLN') {
    const minor = numericValue(minorValue)
    if (minor === null) {
      return '—'
    }
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: String(currency || 'PLN').toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(minor / 100)
  }

  function percentLabel(basisPoints, digits = 1) {
    const value = numericValue(basisPoints)
    if (value === null) {
      return '—'
    }
    return `${new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value / 100)}%`
  }

  function hoursLabel(minutesValue, signed = false) {
    const minutes = numericValue(minutesValue)
    if (minutes === null) {
      return '—'
    }
    const hours = minutes / 60
    const prefix = signed && hours > 0 ? '+' : ''
    return `${prefix}${new Intl.NumberFormat('pl-PL', {
      minimumFractionDigits: Number.isInteger(hours) ? 0 : 1,
      maximumFractionDigits: 1,
    }).format(hours)} godz.`
  }

  function monthLabel(period) {
    const match = String(period ?? '').match(/^(\d{4})-(\d{2})$/)
    if (!match) {
      return String(period ?? '')
    }
    const date = new Date(Number(match[1]), Number(match[2]) - 1, 1)
    return new Intl.DateTimeFormat('pl-PL', { month: 'short', year: 'numeric' })
      .format(date)
      .replace('.', '')
  }

  function statusMeta(status) {
    return STATUS_META[String(status ?? '').toUpperCase()] || STATUS_META.NOT_CALCULABLE
  }

  async function loadPreviewPayload() {
    if (!(import.meta.env.DEV && localPreviewHost())) {
      return null
    }
    if (!previewPromise) {
      previewPromise = import('./previewFixture.js').then((module) => module.createContractProfitabilityPreviewPayload())
    }
    return previewPromise
  }

  function renderUnavailableState() {
    const demoBadge = byId('contractProfitabilityDemoBadge')
    const demoNote = byId('contractProfitabilityDemoNote')
    const access = byId('contractProfitabilityAccess')
    const workspace = byId('contractProfitabilityWorkspace')
    const hasAccess = canReadProfitability?.() === true

    setHidden(demoBadge, true)
    setHidden(demoNote, true)
    setHidden(workspace, true)
    setHidden(access, false)

    if (access) {
      access.innerHTML = hasAccess
        ? `
          <strong>Moduł jest przygotowany do podłączenia danych portfela.</strong>
          <span>Widok produkcyjny nie używa danych demonstracyjnych. Kolejny etap wymaga bezpiecznego endpointu organizacji i ukończonego modelu finansowego.</span>
        `
        : `
          <strong>Brak dostępu do danych finansowych.</strong>
          <span>Moduł rentowności wymaga centralnego uprawnienia profitabilityModule w pakiecie PRO.</span>
        `
    }
  }

  function currentFilters() {
    return {
      search: normalizedText(byId('contractProfitabilitySearch')?.value),
      period: String(byId('contractProfitabilityPeriod')?.value ?? '').trim(),
      clientId: String(byId('contractProfitabilityClient')?.value ?? '').trim(),
      status: String(byId('contractProfitabilityStatus')?.value ?? '').trim().toUpperCase(),
      quality: String(byId('contractProfitabilityQuality')?.value ?? '').trim(),
    }
  }

  function contractsForPeriod(period) {
    const contracts = Array.isArray(payload?.contracts) ? payload.contracts : []
    const selectedPeriod = String(period || payload?.period || '')
    if (!selectedPeriod || selectedPeriod === payload?.period) {
      return contracts
    }

    const trend = Array.isArray(payload?.trend) ? payload.trend : []
    const currentPoint = trend.find((point) => String(point.period) === String(payload?.period))
    const selectedPoint = trend.find((point) => String(point.period) === selectedPeriod)
    const currentRevenue = numericValue(currentPoint?.revenueMinor)
    const selectedRevenue = numericValue(selectedPoint?.revenueMinor)
    const currentCost = numericValue(currentPoint?.totalCostMinor)
    const selectedCost = numericValue(selectedPoint?.totalCostMinor)
    if (!currentPoint || !selectedPoint || !currentRevenue || !currentCost || selectedRevenue === null || selectedCost === null) {
      return []
    }

    const revenueFactor = selectedRevenue / currentRevenue
    const costFactor = selectedCost / currentCost
    const scaleMinor = (value, factor) => {
      const numeric = numericValue(value)
      return numeric === null ? null : String(Math.round(numeric * factor))
    }

    return contracts.map((contract) => {
      const revenueMinor = scaleMinor(contract.revenueMinor, revenueFactor)
      const laborCostMinor = scaleMinor(contract.laborCostMinor, costFactor)
      const materialCostMinor = scaleMinor(contract.materialCostMinor, costFactor)
      const equipmentCostMinor = scaleMinor(contract.equipmentCostMinor, costFactor)
      const otherCostMinor = scaleMinor(contract.otherCostMinor, costFactor)
      const totalCostMinor = scaleMinor(contract.totalCostMinor, costFactor)
      const revenue = numericValue(revenueMinor)
      const totalCost = numericValue(totalCostMinor)
      const marginMinor = revenue === null || totalCost === null ? null : String(revenue - totalCost)
      const margin = numericValue(marginMinor)
      const profitabilityBps = revenue !== null && revenue > 0 && margin !== null
        ? String(Math.round((margin / revenue) * 10000))
        : null
      const target = numericValue(contract.targetProfitabilityBps)
      let status = contract.status
      if (status !== 'INCOMPLETE') {
        status = revenue === null || revenue <= 0 || margin === null
          ? 'NOT_CALCULABLE'
          : margin < 0
            ? 'NEGATIVE'
            : target !== null && Number(profitabilityBps) >= target
              ? 'ABOVE_TARGET'
              : 'BELOW_TARGET'
      }
      return {
        ...contract,
        revenueMinor,
        laborCostMinor,
        materialCostMinor,
        equipmentCostMinor,
        otherCostMinor,
        totalCostMinor,
        marginMinor,
        profitabilityBps,
        status,
      }
    })
  }

  function filteredContracts() {
    const filters = currentFilters()
    const contracts = contractsForPeriod(filters.period)

    return contracts.filter((contract) => {
      if (filters.clientId && String(contract.clientId) !== filters.clientId) {
        return false
      }
      if (filters.status && String(contract.status).toUpperCase() !== filters.status) {
        return false
      }
      const completeness = numericValue(contract.completenessPercent)
      if (filters.quality === 'complete' && (completeness === null || completeness < 100)) {
        return false
      }
      if (filters.quality === 'incomplete' && completeness !== null && completeness >= 100) {
        return false
      }
      if (!filters.search) {
        return true
      }
      return normalizedText([
        contract.clientName,
        contract.contractName,
        contract.objectName,
        contract.city,
        contract.coordinator,
      ].join(' ')).includes(filters.search)
    })
  }

  function syncClientOptions() {
    const select = byId('contractProfitabilityClient')
    if (!(select instanceof HTMLSelectElement)) {
      return
    }
    const previous = select.value
    const clients = [...new Map(
      (payload?.contracts || []).map((contract) => [
        String(contract.clientId ?? ''),
        String(contract.clientName ?? 'Bez nazwy'),
      ]),
    ).entries()]
      .filter(([id]) => id)
      .sort((left, right) => left[1].localeCompare(right[1], 'pl'))

    select.innerHTML = `
      <option value="">Wszyscy klienci</option>
      ${clients.map(([id, label]) => `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`).join('')}
    `
    if (clients.some(([id]) => id === previous)) {
      select.value = previous
    }
  }

  function setMetric(id, value, meta, tone = '') {
    const valueNode = byId(id)
    const metaNode = byId(`${id}Meta`)
    if (valueNode) {
      valueNode.textContent = value
      valueNode.classList.remove('is-positive', 'is-negative', 'is-warning')
      if (tone) {
        valueNode.classList.add(tone)
      }
    }
    if (metaNode) {
      metaNode.textContent = meta
    }
  }

  function renderMetrics(contracts) {
    const currency = payload?.currency || contracts[0]?.currency || 'PLN'
    const financiallyComplete = contracts.filter((contract) => {
      const revenue = numericValue(contract.revenueMinor)
      return revenue !== null
        && numericValue(contract.totalCostMinor) !== null
        && numericValue(contract.marginMinor) !== null
    })
    const revenueMinor = sumValues(contracts, 'revenueMinor')
    const totalCostMinor = sumValues(financiallyComplete, 'totalCostMinor')
    const marginMinor = sumValues(financiallyComplete, 'marginMinor')
    const coveredRevenueMinor = sumValues(financiallyComplete, 'revenueMinor')
    const laborKnown = contracts.filter((contract) =>
      numericValue(contract.laborCostMinor) !== null
      && numericValue(contract.revenueMinor) !== null,
    )
    const laborCostMinor = sumValues(laborKnown, 'laborCostMinor')
    const laborCoveredRevenueMinor = sumValues(laborKnown, 'revenueMinor')
    const weightedProfitabilityBps = coveredRevenueMinor > 0
      ? Math.round((marginMinor / coveredRevenueMinor) * 10000)
      : null
    const laborShareBps = laborCoveredRevenueMinor > 0 && laborKnown.length
      ? Math.round((laborCostMinor / laborCoveredRevenueMinor) * 10000)
      : null
    const completenessValues = contracts
      .map((contract) => numericValue(contract.completenessPercent))
      .filter((value) => value !== null)
    const completeness = completenessValues.length
      ? Math.round(completenessValues.reduce((sum, value) => sum + value, 0) / completenessValues.length)
      : null
    const coverage = `${financiallyComplete.length} z ${contracts.length} kontraktów z pełnym wynikiem`

    setMetric(
      'contractProfitabilityMetricRevenue',
      contracts.length ? moneyLabel(revenueMinor, currency) : '—',
      contracts.length ? `${contracts.length} kontraktów w okresie` : 'Brak kontraktów w okresie',
    )
    setMetric(
      'contractProfitabilityMetricCost',
      financiallyComplete.length ? moneyLabel(totalCostMinor, currency) : '—',
      coverage,
    )
    setMetric(
      'contractProfitabilityMetricMargin',
      financiallyComplete.length ? moneyLabel(marginMinor, currency) : '—',
      coverage,
      marginMinor < 0 ? 'is-negative' : marginMinor > 0 ? 'is-positive' : '',
    )
    setMetric(
      'contractProfitabilityMetricProfitability',
      percentLabel(weightedProfitabilityBps),
      `Ważona przychodem · ${coverage}`,
      weightedProfitabilityBps === null
        ? 'is-warning'
        : weightedProfitabilityBps < 0
          ? 'is-negative'
          : 'is-positive',
    )
    setMetric(
      'contractProfitabilityMetricLaborShare',
      laborKnown.length ? moneyLabel(laborCostMinor, currency) : '—',
      laborKnown.length
        ? `${percentLabel(laborShareBps)} przychodu · ${laborKnown.length} z ${contracts.length} kontraktów`
        : 'Brak kompletnych stawek kosztu pracy',
      laborKnown.length === contracts.length ? '' : 'is-warning',
    )
    setMetric(
      'contractProfitabilityMetricCompleteness',
      completeness === null ? '—' : `${completeness}%`,
      completeness === null
        ? 'Brak wskaźnika kompletności'
        : completenessValues.length < contracts.length
          ? `Wskaźnik dla ${completenessValues.length} z ${contracts.length} kontraktów`
          : completeness === 100
          ? 'Wszystkie dane kompletne'
          : 'Wymaga uzupełnienia',
      completeness === null || completeness < 90 ? 'is-warning' : 'is-positive',
    )
  }

  function renderAttention(contracts) {
    const root = byId('contractProfitabilityAttention')
    if (!root) {
      return
    }
    const rows = contracts
      .filter((contract) => String(contract.status).toUpperCase() !== 'ABOVE_TARGET')
      .sort((left, right) => {
        const priority = (ATTENTION_PRIORITY[left.status] ?? 10) - (ATTENTION_PRIORITY[right.status] ?? 10)
        return priority || Number(left.profitabilityBps ?? Number.POSITIVE_INFINITY) - Number(right.profitabilityBps ?? Number.POSITIVE_INFINITY)
      })
      .slice(0, 5)

    if (!rows.length) {
      root.innerHTML = `
        <div class="contract-profitability__attention-item">
          <i aria-hidden="true"></i>
          <div><strong>Brak ostrzeżeń dla wybranych filtrów</strong><span>Wyniki są powyżej celu i dane są kompletne.</span></div>
          <b>OK</b>
        </div>
      `
      return
    }

    root.innerHTML = rows.map((contract) => {
      const meta = statusMeta(contract.status)
      const issue = contract.issues?.[0] || contract.note || meta.label
      const result = numericValue(contract.profitabilityBps) === null
        ? meta.label
        : percentLabel(contract.profitabilityBps)
      const tone = contract.status === 'NEGATIVE'
        ? 'is-negative'
        : ['INCOMPLETE', 'NOT_CALCULABLE'].includes(contract.status)
          ? 'is-incomplete'
          : ''
      return `
        <button
          class="contract-profitability__attention-item ${tone}"
          type="button"
          data-profitability-contract-id="${escapeHtml(contract.id)}"
        >
          <i aria-hidden="true"></i>
          <span>
            <strong>${escapeHtml(contract.objectName || contract.clientName)}</strong>
            <span>${escapeHtml(issue)}</span>
          </span>
          <b>${escapeHtml(result)}</b>
        </button>
      `
    }).join('')
  }

  function executionMarkup(contract) {
    const planned = numericValue(contract.plannedMinutes)
    const actual = numericValue(contract.actualMinutes)
    const delta = planned === null || actual === null ? null : actual - planned
    const ratio = planned && actual !== null ? Math.round((actual / planned) * 100) : null
    return {
      ratio,
      label: planned === null || actual === null
        ? 'Brak planu lub wykonania'
        : `${hoursLabel(actual)} / ${hoursLabel(planned)}`,
      delta,
    }
  }

  function renderTable(contracts) {
    const body = byId('contractProfitabilityRows')
    const empty = byId('contractProfitabilityEmpty')
    const tableWrap = document.querySelector('#view-contractProfitability .contract-profitability__table-wrap')
    const metaNode = byId('contractProfitabilityTableMeta')
    if (!body) {
      return
    }

    if (!contracts.some((contract) => String(contract.id) === selectedContractId)) {
      selectedContractId = contracts[0]?.id || ''
    }

    setHidden(empty, contracts.length > 0)
    setHidden(tableWrap, contracts.length === 0)
    if (metaNode) {
      metaNode.textContent = `Porównanie ${contracts.length} z ${payload?.contracts?.length || 0} kontraktów w wybranym okresie.`
    }

    body.innerHTML = contracts.map((contract) => {
      const meta = statusMeta(contract.status)
      const execution = executionMarkup(contract)
      const progress = execution.ratio === null ? 0 : Math.min(100, Math.max(0, execution.ratio))
      const completeness = numericValue(contract.completenessPercent)
      const complete = completeness !== null && completeness >= 100
      const selected = String(contract.id) === String(selectedContractId)
      return `
        <tr
          tabindex="0"
          data-profitability-contract-id="${escapeHtml(contract.id)}"
          aria-selected="${selected ? 'true' : 'false'}"
          class="${selected ? 'is-selected' : ''}"
        >
          <td class="contract-profitability__contract-cell">
            <strong>${escapeHtml(contract.objectName || contract.clientName || 'Bez nazwy')}</strong>
            <span>${escapeHtml(contract.clientName || '—')} · ${escapeHtml(contract.contractName || 'Brak numeru')} · ${escapeHtml(contract.city || '—')}</span>
          </td>
          <td>${escapeHtml(moneyLabel(contract.revenueMinor, contract.currency))}</td>
          <td>${escapeHtml(moneyLabel(contract.laborCostMinor, contract.currency))}</td>
          <td>${escapeHtml(moneyLabel(contract.totalCostMinor, contract.currency))}</td>
          <td>${escapeHtml(moneyLabel(contract.marginMinor, contract.currency))}</td>
          <td><strong>${escapeHtml(percentLabel(contract.profitabilityBps))}</strong></td>
          <td>
            <div class="contract-profitability__delta">
              <span>${escapeHtml(execution.label)}</span>
              <span class="contract-profitability__delta-track" aria-hidden="true"><i style="width:${progress}%"></i></span>
            </div>
          </td>
          <td>
            <span class="contract-profitability__quality ${complete ? '' : 'is-incomplete'}">
              ${complete ? '✓' : completeness === null ? '?' : '!'}
              ${escapeHtml(completeness === null ? '—' : `${completeness}%`)}
            </span>
          </td>
          <td>
            <span class="contract-profitability__status ${meta.tone}">
              ${meta.icon} ${escapeHtml(meta.label)}
            </span>
          </td>
          <td>
            <button
              class="contract-profitability__row-action"
              type="button"
              data-profitability-contract-id="${escapeHtml(contract.id)}"
              aria-label="Pokaż analizę: ${escapeHtml(contract.objectName || contract.clientName)}"
            >Analiza</button>
          </td>
        </tr>
      `
    }).join('')
  }

  function breakdownMarkup(contract) {
    const rows = [
      ['Koszt pracy', contract.laborCostMinor],
      ['Materiały i środki', contract.materialCostMinor],
      ['Sprzęt i maszyny', contract.equipmentCostMinor],
      ['Pozostałe koszty', contract.otherCostMinor],
    ]
    const knownTotal = rows.reduce((sum, [, value]) => sum + (numericValue(value) ?? 0), 0)
    return rows.map(([label, value]) => {
      const numeric = numericValue(value)
      const width = numeric === null || knownTotal <= 0 ? 0 : Math.round((numeric / knownTotal) * 100)
      return `
        <div class="contract-profitability__breakdown-row">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(moneyLabel(value, contract.currency))}</strong>
          <span class="contract-profitability__breakdown-bar" aria-hidden="true"><i style="width:${width}%"></i></span>
        </div>
      `
    }).join('')
  }

  function renderDetails(contracts, options = {}) {
    const details = byId('contractProfitabilityDetails')
    const contract = contracts.find((item) => String(item.id) === String(selectedContractId))
    if (!details || !contract) {
      setHidden(details, true)
      return
    }
    const execution = executionMarkup(contract)
    const differenceTone = execution.delta === null
      ? 'Brak danych do oceny'
      : execution.delta > 0
        ? 'Przekroczenie planu'
        : 'W granicach planu'

    setHidden(details, false)
    byId('contractProfitabilityDetailsTitle').textContent = contract.objectName || contract.clientName || 'Kontrakt'
    byId('contractProfitabilityDetailsMeta').textContent =
      `${contract.clientName || '—'} · ${contract.contractName || 'Brak numeru'} · Koordynator: ${contract.coordinator || '—'}`
    byId('contractProfitabilityBreakdown').innerHTML = breakdownMarkup(contract)
    byId('contractProfitabilityExecution').innerHTML = `
      <div class="contract-profitability__execution-card">
        <div><span>Plan</span><strong>${escapeHtml(hoursLabel(contract.plannedMinutes))}</strong></div>
        <div><span>Wykonanie</span><strong>${escapeHtml(hoursLabel(contract.actualMinutes))}</strong></div>
      </div>
      <div class="contract-profitability__execution-card">
        <div><span>Różnica</span><strong>${escapeHtml(hoursLabel(execution.delta, true))}</strong></div>
        <div><span>Ocena</span><strong>${escapeHtml(differenceTone)}</strong></div>
      </div>
      <div class="contract-profitability__execution-card">
        <div><span>Cel rentowności</span><strong>${escapeHtml(percentLabel(contract.targetProfitabilityBps))}</strong></div>
        <div><span>Wynik</span><strong>${escapeHtml(percentLabel(contract.profitabilityBps))}</strong></div>
      </div>
    `
    const issues = Array.isArray(contract.issues) ? contract.issues.filter(Boolean) : []
    byId('contractProfitabilityIssues').innerHTML = `
      ${issues.length
        ? issues.map((issue) => `<div class="contract-profitability__issue">${escapeHtml(issue)}</div>`).join('')
        : '<div class="contract-profitability__issue is-ok">Brak krytycznych braków danych dla tego kontraktu.</div>'}
      ${contract.note ? `<p class="contract-profitability__issue-note">${escapeHtml(contract.note)}</p>` : ''}
    `

    if (options.scroll === true) {
      details.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  function metricTrendValue(point) {
    const raw = numericValue(point?.[chartMetric])
    if (raw === null) {
      return null
    }
    return chartMetric === 'profitabilityBps' ? raw / 100 : raw / 100
  }

  function trendValueLabel(value) {
    if (value === null) {
      return '—'
    }
    if (chartMetric === 'profitabilityBps') {
      return `${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 }).format(value)}%`
    }
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: payload?.currency || 'PLN',
      maximumFractionDigits: 0,
    }).format(value)
  }

  function trendDeltaLabel(value) {
    if (value === null) {
      return '—'
    }
    if (chartMetric === 'profitabilityBps') {
      const prefix = value > 0 ? '+' : ''
      return `${prefix}${new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 1 }).format(value)} p.p.`
    }
    const prefix = value > 0 ? '+' : ''
    return `${prefix}${trendValueLabel(value)}`
  }

  function drawTrend() {
    const canvas = byId('contractProfitabilityTrendCanvas')
    if (!(canvas instanceof HTMLCanvasElement)) {
      return
    }
    const context = canvas.getContext('2d')
    if (!context) {
      return
    }
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(320, Math.round(rect.width || 720))
    const height = Math.max(160, Math.round(rect.height || 230))
    const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1))
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)

    const selectedPeriod = currentFilters().period
    const points = (payload?.trend || [])
      .filter((point) => !selectedPeriod || String(point.period ?? '') <= selectedPeriod)
      .slice(-12)
      .map((point) => ({ ...point, value: metricTrendValue(point) }))
      .filter((point) => point.value !== null)
    if (!points.length) {
      canvas.setAttribute('aria-label', 'Brak danych trendu dla wybranego okresu.')
      const foot = byId('contractProfitabilityTrendFoot')
      if (foot) {
        foot.textContent = 'Brak danych trendu dla wybranego okresu.'
      }
      return
    }

    const values = points.map((point) => point.value)
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)
    const spread = Math.max(1, rawMax - rawMin)
    const min = rawMin - spread * 0.2
    const max = rawMax + spread * 0.2
    const padding = { top: 18, right: 14, bottom: 18, left: 14 }
    const plotWidth = width - padding.left - padding.right
    const plotHeight = height - padding.top - padding.bottom
    const coords = points.map((point, index) => ({
      ...point,
      x: padding.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth),
      y: padding.top + ((max - point.value) / Math.max(1, max - min)) * plotHeight,
    }))

    context.strokeStyle = '#e8ebf2'
    context.lineWidth = 1
    for (let step = 0; step < 4; step += 1) {
      const y = padding.top + (step / 3) * plotHeight
      context.beginPath()
      context.moveTo(padding.left, y)
      context.lineTo(width - padding.right, y)
      context.stroke()
    }

    const gradient = context.createLinearGradient(0, padding.top, 0, height)
    gradient.addColorStop(0, 'rgba(102, 105, 229, 0.24)')
    gradient.addColorStop(1, 'rgba(102, 105, 229, 0)')
    context.beginPath()
    coords.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y)
      else context.lineTo(point.x, point.y)
    })
    context.lineTo(coords.at(-1).x, height - padding.bottom)
    context.lineTo(coords[0].x, height - padding.bottom)
    context.closePath()
    context.fillStyle = gradient
    context.fill()

    context.beginPath()
    coords.forEach((point, index) => {
      if (index === 0) context.moveTo(point.x, point.y)
      else context.lineTo(point.x, point.y)
    })
    context.strokeStyle = '#6266df'
    context.lineWidth = 2.5
    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.stroke()

    coords.forEach((point) => {
      context.beginPath()
      context.arc(point.x, point.y, 3.2, 0, Math.PI * 2)
      context.fillStyle = '#ffffff'
      context.fill()
      context.strokeStyle = '#6266df'
      context.lineWidth = 2
      context.stroke()
    })

    const metricName = chartMetric === 'profitabilityBps'
      ? 'rentowności'
      : chartMetric === 'marginMinor'
        ? 'marży'
        : 'przychodu'
    canvas.setAttribute(
      'aria-label',
      `Trend ${metricName}: ${points.map((point) => `${monthLabel(point.period)} ${trendValueLabel(point.value)}`).join(', ')}`,
    )

    const first = points[0]
    const last = points.at(-1)
    const delta = last.value - first.value
    const foot = byId('contractProfitabilityTrendFoot')
    if (foot) {
      foot.innerHTML = `
        <span>${escapeHtml(monthLabel(first.period))}: <strong>${escapeHtml(trendValueLabel(first.value))}</strong></span>
        <span>Zmiana: <strong>${escapeHtml(trendDeltaLabel(delta))}</strong></span>
        <span>${escapeHtml(monthLabel(last.period))}: <strong>${escapeHtml(trendValueLabel(last.value))}</strong></span>
      `
    }
  }

  function renderFilteredView(options = {}) {
    if (!payload) {
      return
    }
    const contracts = filteredContracts()
    const summary = byId('contractProfitabilityFilterSummary')
    if (summary) {
      summary.textContent =
        `Wyświetlono ${contracts.length} z ${payload.contracts?.length || 0} kontraktów · okres ${monthLabel(currentFilters().period || payload.period)}.`
    }
    renderMetrics(contracts)
    renderAttention(contracts)
    renderTable(contracts)
    renderDetails(contracts, options)
    drawTrend()
  }

  async function render({ force = false } = {}) {
    let loadedNow = false
    if (force) {
      payload = null
      previewPromise = null
    }
    if (!payload) {
      payload = await loadPreviewPayload()
      previewMode = Boolean(payload)
      loadedNow = Boolean(payload)
    }

    if (!payload) {
      renderUnavailableState()
      return
    }

    const access = byId('contractProfitabilityAccess')
    const workspace = byId('contractProfitabilityWorkspace')
    const demoBadge = byId('contractProfitabilityDemoBadge')
    const demoNote = byId('contractProfitabilityDemoNote')
    setHidden(access, true)
    setHidden(workspace, false)
    setHidden(demoBadge, !previewMode)
    setHidden(demoNote, !previewMode)

    const periodInput = byId('contractProfitabilityPeriod')
    if (periodInput instanceof HTMLInputElement && (loadedNow || !periodInput.value)) {
      periodInput.value = payload.period || ''
    }
    syncClientOptions()
    renderFilteredView()
  }

  function resetFilters() {
    const search = byId('contractProfitabilitySearch')
    const period = byId('contractProfitabilityPeriod')
    const client = byId('contractProfitabilityClient')
    const status = byId('contractProfitabilityStatus')
    const quality = byId('contractProfitabilityQuality')
    if (search) search.value = ''
    if (period) period.value = payload?.period || ''
    if (client) client.value = ''
    if (status) status.value = ''
    if (quality) quality.value = ''
    selectedContractId = ''
    renderFilteredView()
  }

  function selectContract(contractId, options = {}) {
    selectedContractId = String(contractId ?? '')
    renderFilteredView({ scroll: options.scroll === true })
  }

  function bind() {
    const root = byId(viewId)
    if (!root) {
      return () => {}
    }
    const binding = createBindingHelpers()

    binding.add(byId('contractProfitabilitySearch'), 'input', () => renderFilteredView())
    ;[
      'contractProfitabilityPeriod',
      'contractProfitabilityClient',
      'contractProfitabilityStatus',
      'contractProfitabilityQuality',
    ].forEach((id) => binding.add(byId(id), 'change', () => renderFilteredView()))
    binding.add(byId('contractProfitabilityResetBtn'), 'click', resetFilters)

    root.querySelectorAll('[data-profitability-metric]').forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.profitabilityMetric === chartMetric ? 'true' : 'false')
      binding.add(button, 'click', () => {
        chartMetric = String(button.dataset.profitabilityMetric || 'profitabilityBps')
        root.querySelectorAll('[data-profitability-metric]').forEach((item) => {
          const active = item === button
          item.classList.toggle('is-active', active)
          item.setAttribute('aria-pressed', active ? 'true' : 'false')
        })
        drawTrend()
      })
    })

    binding.add(root, 'click', (event) => {
      const trigger = event.target instanceof Element
        ? event.target.closest('[data-profitability-contract-id]')
        : null
      if (!trigger || !root.contains(trigger)) {
        return
      }
      selectContract(trigger.getAttribute('data-profitability-contract-id'), { scroll: true })
    })
    binding.add(root, 'keydown', (event) => {
      if (!['Enter', ' '].includes(event.key)) {
        return
      }
      const row = event.target instanceof Element
        ? event.target.closest('tr[data-profitability-contract-id]')
        : null
      if (!row || !root.contains(row)) {
        return
      }
      event.preventDefault()
      selectContract(row.getAttribute('data-profitability-contract-id'), { scroll: true })
    })

    const canvas = byId('contractProfitabilityTrendCanvas')
    if (typeof ResizeObserver === 'function' && canvas) {
      resizeObserver = new ResizeObserver(() => drawTrend())
      resizeObserver.observe(canvas)
    }

    return () => {
      binding.done()
      resizeObserver?.disconnect()
      resizeObserver = null
    }
  }

  return {
    bind,
    render,
  }
}
