import template from './template.html?raw'

export const route = 'kanban'
export const viewId = 'view-kanban'
export { template }

export function createKanbanFeature(ctx) {
  const {
    appState,
    CALENDAR_TONE_OPTIONS,
    calendarAddDays,
    calendarAppendTaskActivity,
    calendarCompletionActivityDetails,
    calendarCompletionNoteForTask,
    calendarDateLabelFromYmd,
    calendarDirectoryOptions,
    calendarLoadTasks,
    calendarMarkTaskRead,
    calendarNormalizeActivityLog,
    calendarNormalizeTask,
    calendarNormalizeTimeValue,
    calendarOpenEditor,
    calendarSaveTasks,
    calendarSelectionLabels,
    calendarSortTasks,
    calendarTaskIsVisibleForCurrentUser,
    calendarTaskToneValue,
    calendarZoneDisplayLabel,
    createBindingHelpers,
    escapeHtml,
    formatDatePl,
    formatTime,
    isUnassignedCleanZone,
    mapZoneForView,
    normalizeSearchText,
    renderCalendarView,
    renderDashboardKanbanTasks,
    showTransientNotice,
    todayYmd,
  } = ctx

const KANBAN_COLUMNS_STORAGE_PREFIX = 'portal.kanban.columns'
const KANBAN_STANDARD_NEW_TASK_COLUMN = { id: 'newTask', label: 'Nowe zadanie', color: 'red' }
const KANBAN_COLUMNS = [
  KANBAN_STANDARD_NEW_TASK_COLUMN,
  { id: 'inProgress', label: 'W trakcie', color: 'blue' },
  { id: 'inReview', label: 'Do sprawdzenia', color: 'amber' },
  { id: 'done', label: 'Gotowe', color: 'green' },
]
const KANBAN_NEW_PERSON_TASK_COLUMN_LABELS = ['nowe zadania', 'nowe zadanie']
const KANBAN_COLUMN_COLORS = [
  { value: 'blue', label: 'Niebieski', accent: '#2563eb', soft: '#eef5ff', border: '#c7dcff' },
  { value: 'amber', label: 'Pomarańczowy', accent: '#f59e0b', soft: '#fff7e6', border: '#fde5ad' },
  { value: 'green', label: 'Zielony', accent: '#16a34a', soft: '#edfdf4', border: '#bbf7d0' },
  { value: 'red', label: 'Czerwony', accent: '#e11d48', soft: '#fff0f3', border: '#fecdd3' },
  { value: 'violet', label: 'Fioletowy', accent: '#7c3aed', soft: '#f3efff', border: '#ddd6fe' },
  { value: 'cyan', label: 'Turkusowy', accent: '#0891b2', soft: '#ecfeff', border: '#a5f3fc' },
  { value: 'slate', label: 'Grafitowy', accent: '#475569', soft: '#f1f5f9', border: '#cbd5e1' },
]
const KANBAN_COLUMN_SCOPES = [
  { value: 'global', label: 'Ogólna', targetLabel: '', optionKind: '' },
  { value: 'user', label: 'Użytkownik', targetLabel: 'Użytkownik', optionKind: 'workers' },
  { value: 'person', label: 'Inny projekt', targetLabel: 'Osoba', optionKind: 'workers' },
  { value: 'object', label: 'Obiekt', targetLabel: 'Obiekt', optionKind: 'zones' },
]

function kanbanColumnsStorageKey() {
  const orgId = String(appState.session?.orgId ?? '').trim() || 'local'
  return `${KANBAN_COLUMNS_STORAGE_PREFIX}:${orgId}`
}

function kanbanDefaultColumns() {
  return KANBAN_COLUMNS.map((column) => ({ ...column }))
}

function kanbanIsNewTaskColumn(column = {}) {
  const label = normalizeSearchText(column.label)
  return column.id === KANBAN_STANDARD_NEW_TASK_COLUMN.id || KANBAN_NEW_PERSON_TASK_COLUMN_LABELS.includes(label)
}

function kanbanColumnColorMeta(color = '') {
  const value = String(color ?? '').trim()
  return KANBAN_COLUMN_COLORS.find((item) => item.value === value) ?? KANBAN_COLUMN_COLORS[0]
}

function kanbanColumnStyle(column = {}) {
  const color = kanbanColumnColorMeta(column.color)
  return `--column-accent:${color.accent};--column-soft:${color.soft};--column-border:${color.border};`
}

function kanbanNormalizeColumnScope(scope = '') {
  const value = String(scope ?? '').trim()
  const normalized = value === 'client' ? 'object' : value
  return KANBAN_COLUMN_SCOPES.some((item) => item.value === normalized) ? normalized : 'global'
}

function kanbanColumnScopeMeta(scope = '') {
  const value = kanbanNormalizeColumnScope(scope)
  return KANBAN_COLUMN_SCOPES.find((item) => item.value === value) ?? KANBAN_COLUMN_SCOPES[0]
}

function kanbanVisibleColumnScope(scope = '') {
  const value = kanbanNormalizeColumnScope(scope)
  return value === 'person' ? 'project' : value
}

function kanbanCurrentUserOption() {
  const label =
    String(appState.session?.name ?? '').trim() ||
    String(appState.session?.login ?? '').trim() ||
    String(appState.session?.email ?? '').trim()
  const id =
    String(appState.session?.uid ?? '').trim() ||
    String(appState.session?.userId ?? '').trim() ||
    String(appState.session?.login ?? '').trim() ||
    String(appState.session?.email ?? '').trim() ||
    label
  return label ? { id: `user:${id}`, label } : null
}

function kanbanColumnScopeOptionsHtml(selectedScope = '') {
  const selected = kanbanNormalizeColumnScope(selectedScope)
  return KANBAN_COLUMN_SCOPES.map(
    (scope) => `<option value="${escapeHtml(scope.value)}"${scope.value === selected ? ' selected' : ''}>${escapeHtml(scope.label)}</option>`,
  ).join('')
}

function kanbanZoneOptions() {
  const seen = new Set()
  return (Array.isArray(appState.zones) ? appState.zones : [])
    .map((zone) => mapZoneForView(zone))
    .filter((zone) => !isUnassignedCleanZone(zone))
    .map((zone) => {
      const label = [zone.clientName, zone.zoneName].filter((value) => value && value !== '-').join(' / ') || String(zone.qr ?? '').trim()
      const id = String(zone.id ?? zone.qr ?? zone.zoneId ?? label).trim()
      return { id: `zone:${id || label}`, label }
    })
    .filter((option) => {
      if (!option.label) {
        return false
      }
      const key = normalizeSearchText(option.id || option.label)
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))
}

function kanbanColumnOwnerOptions(scope = '') {
  const meta = kanbanColumnScopeMeta(scope)
  if (!meta.optionKind) {
    return []
  }
  const options = meta.optionKind === 'zones' ? kanbanZoneOptions() : calendarDirectoryOptions(meta.optionKind)
  const currentUser = meta.value === 'user' ? kanbanCurrentUserOption() : null
  const seen = new Set()
  return [currentUser, ...options]
    .filter(Boolean)
    .filter((option) => {
      const key = normalizeSearchText(option.id || option.label)
      if (!key || seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
}

function kanbanColumnOwnerOptionsHtml(scope = '') {
  return kanbanColumnOwnerOptions(scope)
    .map((option) => `<option value="${escapeHtml(option.label)}"></option>`)
    .join('')
}

function kanbanResolveColumnOwner(scope = '', rawOwner = '') {
  const normalizedScope = kanbanNormalizeColumnScope(scope)
  if (normalizedScope === 'global') {
    return { ownerId: '', ownerLabel: '' }
  }
  const value = String(rawOwner ?? '').trim()
  if (!value) {
    return { ownerId: '', ownerLabel: '' }
  }
  const valueKey = normalizeSearchText(value)
  const match = kanbanColumnOwnerOptions(normalizedScope).find(
    (option) => normalizeSearchText(option.label) === valueKey || normalizeSearchText(option.id) === valueKey,
  )
  return {
    ownerId: match?.id || `${normalizedScope}:${value}`,
    ownerLabel: match?.label || value,
  }
}

function kanbanNormalizeColumn(rawColumn = {}, index = 0) {
  const rawId = String(rawColumn.id ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '')
  const id = rawId || `custom-${Date.now().toString(36)}-${index}`
  const label = String(rawColumn.label ?? rawColumn.name ?? '').trim() || `Kolumna ${index + 1}`
  const color = kanbanColumnColorMeta(rawColumn.color).value
  const scope = kanbanNormalizeColumnScope(rawColumn.scope)
  const ownerLabel = scope === 'global' ? '' : String(rawColumn.ownerLabel ?? rawColumn.ownerName ?? '').trim()
  const ownerId = scope === 'global' ? '' : String(rawColumn.ownerId ?? '').trim() || (ownerLabel ? `${scope}:${ownerLabel}` : '')
  return { id, label, color, scope, ownerId, ownerLabel }
}

function kanbanNormalizeColumns(rawColumns = []) {
  const source = Array.isArray(rawColumns) && rawColumns.length ? rawColumns : kanbanDefaultColumns()
  const seen = new Set()
  const columns = source
    .map((column, index) => kanbanNormalizeColumn(column, index))
    .filter((column) => {
      if (!column.id || seen.has(column.id)) {
        return false
      }
      seen.add(column.id)
      return true
    })
  const normalizedColumns = kanbanIsNewTaskColumn(columns[0] ?? {})
    ? columns
    : columns.some((column) => kanbanIsNewTaskColumn(column))
      ? columns
      : [kanbanNormalizeColumn(KANBAN_STANDARD_NEW_TASK_COLUMN, -1), ...columns]
  return normalizedColumns.length ? normalizedColumns : kanbanDefaultColumns()
}

function kanbanLoadColumns() {
  try {
    const raw = window.localStorage.getItem(kanbanColumnsStorageKey())
    const parsed = raw ? JSON.parse(raw) : null
    return kanbanNormalizeColumns(Array.isArray(parsed) ? parsed : kanbanDefaultColumns())
  } catch {
    return kanbanDefaultColumns()
  }
}

function kanbanSaveColumns(columns = appState.kanbanColumns) {
  const normalized = kanbanNormalizeColumns(columns)
  appState.kanbanColumns = normalized
  try {
    window.localStorage.setItem(kanbanColumnsStorageKey(), JSON.stringify(normalized))
  } catch {
    showTransientNotice('Nie udało się zapisać kolumn Centrum zadań w przeglądarce.', 'error')
  }
  return normalized
}

function kanbanColumnsForStatus() {
  if (Array.isArray(appState.kanbanColumns) && appState.kanbanColumns.length) {
    return appState.kanbanColumns
  }
  return kanbanLoadColumns()
}

function kanbanDefaultStatus() {
  return kanbanColumnsForStatus()[0]?.id || KANBAN_COLUMNS[0]?.id || 'inProgress'
}

function kanbanNewPersonTaskStatus() {
  const targetLabels = new Set(KANBAN_NEW_PERSON_TASK_COLUMN_LABELS.map((label) => normalizeSearchText(label)))
  const column = kanbanColumnsForStatus().find((item) => targetLabels.has(normalizeSearchText(item.label)))
  return column?.id || kanbanDefaultStatus()
}

function kanbanNewTaskStatus() {
  const columns = kanbanColumnsForStatus()
  const standardColumn = columns.find((column) => kanbanIsNewTaskColumn(column))
  return standardColumn?.id || kanbanDefaultStatus()
}

function calendarHasAssignedWorkers(workers = []) {
  return calendarSelectionLabels(workers).length > 0
}

function kanbanDefaultStatusForTask(workers = [], preferredStatus = '') {
  const status = String(preferredStatus ?? '').trim()
  if (status) {
    return kanbanNormalizeStatus(status)
  }
  return calendarHasAssignedWorkers(workers) ? kanbanNewPersonTaskStatus() : kanbanNewTaskStatus()
}

function kanbanColumnLabel(status = '') {
  const value = kanbanNormalizeStatus(status)
  return kanbanColumnsForStatus().find((column) => column.id === value)?.label ?? value
}

function kanbanNormalizeStatus(status = '') {
  const value = String(status ?? '').trim()
  return kanbanColumnsForStatus().some((column) => column.id === value) ? value : kanbanDefaultStatus()
}

function kanbanEnsureState() {
  appState.kanbanColumns = kanbanLoadColumns()
  appState.calendarTasks = calendarLoadTasks()
  appState.kanbanSearch = String(appState.kanbanSearch ?? '').trim()
}

function kanbanTaskSearchText(task = {}) {
  const people = calendarSelectionLabels(task.workers).join(' ')
  const objects = calendarSelectionLabels(task.objects).join(' ')
  const zone = String(task.zone?.label ?? task.zoneName ?? '').trim()
  const zoneLocation = String(task.zone?.location ?? task.zoneLocation ?? '').trim()
  return normalizeSearchText([task.title, task.notes, task.place, people, objects, zone, zoneLocation].filter(Boolean).join(' '))
}

function kanbanVisibleTasks() {
  kanbanEnsureState()
  const query = normalizeSearchText(appState.kanbanSearch)
  const activeTasks = appState.calendarTasks.filter((task) => !kanbanTaskIsCompleted(task))
  const tasks = query ? activeTasks.filter((task) => kanbanTaskSearchText(task).includes(query)) : activeTasks
  return calendarSortTasks(tasks)
}

function kanbanNewColumnId() {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function kanbanColorOptionsHtml(selectedColor = '') {
  const selected = kanbanColumnColorMeta(selectedColor).value
  return KANBAN_COLUMN_COLORS.map(
    (color) => `<option value="${escapeHtml(color.value)}"${color.value === selected ? ' selected' : ''}>${escapeHtml(color.label)}</option>`,
  ).join('')
}

function kanbanSyncScopeChoiceState() {
  const scopeSelect = document.getElementById('kanbanColumnScope')
  const scope = kanbanVisibleColumnScope(scopeSelect?.value)
  document.querySelectorAll('input[name="kanbanColumnScopeChoice"]').forEach((input) => {
    if (input instanceof HTMLInputElement) {
      input.checked = input.value === scope
    }
  })
}

function kanbanSyncColumnScopeFields({ clearOwner = false } = {}) {
  const scopeSelect = document.getElementById('kanbanColumnScope')
  const ownerWrap = document.getElementById('kanbanColumnOwnerWrap')
  const ownerLabel = document.getElementById('kanbanColumnOwnerLabel')
  const ownerInput = document.getElementById('kanbanColumnOwner')
  const ownerOptions = document.getElementById('kanbanColumnOwnerOptions')
  const scope = kanbanNormalizeColumnScope(scopeSelect?.value)
  const meta = kanbanColumnScopeMeta(scope)

  if (ownerOptions) {
    ownerOptions.innerHTML = kanbanColumnOwnerOptionsHtml(scope)
  }
  if (ownerLabel) {
    ownerLabel.textContent = meta.targetLabel || 'Przypisanie'
  }
  if (ownerInput && clearOwner) {
    ownerInput.value = ''
  }
  if (ownerInput) {
    ownerInput.placeholder =
      scope === 'object'
        ? 'Wpisz lub wybierz obiekt...'
        : scope === 'person'
          ? 'Wpisz lub wybierz osobę...'
          : 'Wpisz lub wybierz użytkownika...'
  }
  if (ownerWrap) {
    ownerWrap.hidden = scope === 'global'
  }
  kanbanSyncScopeChoiceState()
}

function kanbanColumnScopeBadgeHtml(column = {}) {
  const scope = kanbanNormalizeColumnScope(column.scope)
  if (scope === 'global') {
    return ''
  }
  const meta = kanbanColumnScopeMeta(scope)
  const owner = String(column.ownerLabel ?? '').trim()
  const label =
    scope === 'user'
      ? 'Użytkownik'
      : scope === 'person'
        ? 'Inny projekt'
        : scope === 'object'
          ? 'Obiekt'
        : meta.label
  return `<span class="kanban-column-scope">${escapeHtml(label)}${owner ? `: ${escapeHtml(owner)}` : ''}</span>`
}

function kanbanColumnTaskCount(columnId = '') {
  const id = String(columnId ?? '').trim()
  if (!id) {
    return 0
  }
  return calendarLoadTasks().filter((task) => String(task.kanbanStatus ?? '') === id).length
}

function kanbanOpenColumnEditor(columnId = '') {
  kanbanEnsureState()
  const id = String(columnId ?? '').trim()
  const column = id ? appState.kanbanColumns.find((item) => item.id === id) : null
  appState.kanbanColumnEditorMode = column ? 'edit' : 'add'
  appState.kanbanColumnEditorId = column?.id || ''
  appState.kanbanColumnDeleteConfirm = false

  const overlay = document.getElementById('kanbanColumnOverlay')
  const title = document.getElementById('kanbanColumnModalTitle')
  const nameInput = document.getElementById('kanbanColumnName')
  const colorSelect = document.getElementById('kanbanColumnColor')
  const scopeSelect = document.getElementById('kanbanColumnScope')
  const ownerInput = document.getElementById('kanbanColumnOwner')
  const deleteButton = document.getElementById('kanbanColumnDeleteBtn')
  const deleteInfo = document.getElementById('kanbanColumnDeleteInfo')
  const saveButton = document.getElementById('kanbanColumnSaveBtn')
  if (!overlay || !nameInput || !colorSelect || !scopeSelect || !ownerInput) {
    return
  }

  if (title) title.textContent = column ? 'Edytuj kolumnę' : 'Nowa kolumna'
  nameInput.value = column?.label || ''
  colorSelect.innerHTML = kanbanColorOptionsHtml(column?.color || 'blue')
  scopeSelect.innerHTML = kanbanColumnScopeOptionsHtml(column?.scope || 'global')
  const normalizedScope = kanbanNormalizeColumnScope(column?.scope || 'global')
  scopeSelect.value = normalizedScope
  ownerInput.value = column?.ownerLabel || ''
  kanbanSyncColumnScopeFields()
  if (deleteButton) {
    deleteButton.hidden = !column
    deleteButton.disabled = !column
    deleteButton.textContent = 'Usuń kolumnę'
  }
  if (deleteInfo) {
    const count = column ? kanbanColumnTaskCount(column.id) : 0
    deleteInfo.textContent = column && count ? `W tej kolumnie jest ${count} zadań. Przy usunięciu zostaną przeniesione do pierwszej kolumny.` : ''
    deleteInfo.classList.remove('is-warning')
  }
  if (saveButton) saveButton.textContent = column ? 'Zapisz zmiany' : 'Dodaj kolumnę'
  overlay.hidden = false
  overlay.setAttribute('aria-hidden', 'false')
  window.setTimeout(() => nameInput.focus(), 0)
}

function kanbanCloseColumnEditor() {
  const overlay = document.getElementById('kanbanColumnOverlay')
  if (overlay) {
    overlay.hidden = true
    overlay.setAttribute('aria-hidden', 'true')
  }
  appState.kanbanColumnEditorMode = 'add'
  appState.kanbanColumnEditorId = ''
  appState.kanbanColumnDeleteConfirm = false
}

function kanbanModalIsVisible(elementId = '') {
  const element = document.getElementById(elementId)
  return element instanceof HTMLElement && !element.hidden && element.getAttribute('aria-hidden') !== 'true'
}

function kanbanHasOpenWindow() {
  return kanbanModalIsVisible('kanbanColumnOverlay') || kanbanModalIsVisible('kanbanDonePopover')
}

function kanbanTargetIsInsideOpenWindow(target) {
  if (!(target instanceof Element)) {
    return false
  }
  return Boolean(target.closest('#kanbanColumnOverlay .kanban-column-modal') || target.closest('#kanbanDonePopover'))
}

function kanbanConsumeBackgroundClickWhenWindowOpen(event) {
  if (!kanbanHasOpenWindow() || kanbanTargetIsInsideOpenWindow(event.target)) {
    return false
  }
  if (kanbanModalIsVisible('kanbanDonePopover')) {
    kanbanCloseDonePopover()
  }
  event.preventDefault()
  event.stopPropagation()
  return true
}

function kanbanSaveColumnEditor() {
  const nameInput = document.getElementById('kanbanColumnName')
  const colorSelect = document.getElementById('kanbanColumnColor')
  const scopeSelect = document.getElementById('kanbanColumnScope')
  const ownerInput = document.getElementById('kanbanColumnOwner')
  const label = String(nameInput?.value ?? '').trim()
  const color = kanbanColumnColorMeta(colorSelect?.value).value
  const scope = kanbanNormalizeColumnScope(scopeSelect?.value)
  const owner = kanbanResolveColumnOwner(scope, ownerInput?.value)
  if (!label) {
    showTransientNotice('Podaj nazwę kolumny.', 'error')
    nameInput?.focus()
    return
  }
  if (scope !== 'global' && !owner.ownerLabel) {
    showTransientNotice('Wybierz użytkownika, osobę albo obiekt dla tej kolumny.', 'error')
    ownerInput?.focus()
    return
  }

  const columns = kanbanLoadColumns()
  if (appState.kanbanColumnEditorMode === 'edit' && appState.kanbanColumnEditorId) {
    const updated = columns.map((column) =>
      column.id === appState.kanbanColumnEditorId ? { ...column, label, color, scope, ...owner } : column,
    )
    kanbanSaveColumns(updated)
    showTransientNotice('Kolumna została zaktualizowana.')
  } else {
    kanbanSaveColumns([...columns, { id: kanbanNewColumnId(), label, color, scope, ...owner }])
    showTransientNotice('Kolumna została dodana.')
  }
  kanbanCloseColumnEditor()
  renderKanbanView()
}

function kanbanDeleteColumnEditor() {
  const columnId = String(appState.kanbanColumnEditorId ?? '').trim()
  const columns = kanbanLoadColumns()
  const column = columns.find((item) => item.id === columnId)
  const deleteButton = document.getElementById('kanbanColumnDeleteBtn')
  const deleteInfo = document.getElementById('kanbanColumnDeleteInfo')
  if (!column) {
    return
  }
  if (columns.length <= 1) {
    showTransientNotice('Nie można usunąć ostatniej kolumny.', 'error')
    return
  }
  const tasksBeforeDelete = calendarLoadTasks()
  const taskCount = tasksBeforeDelete.filter((task) => String(task.kanbanStatus ?? '') === columnId).length
  if (!appState.kanbanColumnDeleteConfirm) {
    appState.kanbanColumnDeleteConfirm = true
    if (deleteButton) deleteButton.textContent = 'Potwierdź usunięcie'
    if (deleteInfo) {
      const fallbackLabel = columns.find((item) => item.id !== columnId)?.label || 'pierwszej kolumny'
      deleteInfo.textContent = taskCount
        ? `Potwierdź usunięcie. ${taskCount} zadań zostanie przeniesionych do kolumny „${fallbackLabel}”.`
        : 'Potwierdź usunięcie pustej kolumny.'
      deleteInfo.classList.add('is-warning')
    }
    return
  }

  const remainingColumns = columns.filter((item) => item.id !== columnId)
  const fallbackStatus = remainingColumns[0]?.id || KANBAN_COLUMNS[0]?.id || 'inProgress'
  kanbanSaveColumns(remainingColumns)
  const nextTasks = tasksBeforeDelete.map((task) =>
    String(task.kanbanStatus ?? '') === columnId ? { ...task, kanbanStatus: fallbackStatus, updatedAt: new Date().toISOString() } : task,
  )
  calendarSaveTasks(nextTasks)
  kanbanCloseColumnEditor()
  renderKanbanView()
  showTransientNotice('Kolumna została usunięta.')
}

function kanbanInitials(name = '') {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!parts.length) {
    return '?'
  }
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase() || parts[0].slice(0, 2).toUpperCase()
}

function kanbanTaskIsCompleted(task = {}) {
  return Boolean(task.completed ?? task.kanbanCompleted ?? false)
}

function kanbanTaskDoneSummary(task = {}) {
  const note = String(task.completedNote ?? task.kanbanDoneNote ?? task.doneNote ?? '').trim()
  const by = String(task.completedBy ?? task.kanbanCompletedBy ?? '').trim()
  const at = String(task.completedAt ?? task.kanbanCompletedAt ?? '').trim()
  const date = at ? `${formatDatePl(at)} ${formatTime(at)}` : ''
  const meta = [by, date].filter(Boolean).join(' · ')
  return { note, meta }
}

function renderKanbanSyncStatus() {
  const node = document.getElementById('kanbanSyncStatus')
  if (!node) {
    return
  }

  const active = appState.currentRoute === 'kanban' && (appState.kanbanDataLoading || appState.calendarRemoteTasksLoading)
  const textNode = node.querySelector('[data-kanban-sync-text]')
  if (textNode) {
    textNode.textContent =
      String(appState.kanbanDataLoadingText ?? '').trim() ||
      (appState.calendarRemoteTasksLoading ? 'Synchronizacja zadań...' : 'Odświeżanie tablicy...')
  }
  node.hidden = !active
}

function kanbanSetDataLoading(active, text = '') {
  appState.kanbanDataLoading = Boolean(active)
  appState.kanbanDataLoadingText = active ? String(text ?? '').trim() : ''
  renderKanbanSyncStatus()
}

function kanbanCardHtml(task = {}) {
  const title = String(task.title ?? '').trim() || 'Nowe zadanie'
  const tone = calendarTaskToneValue(task)
  const toneMeta = CALENDAR_TONE_OPTIONS.find((option) => option.value === tone) ?? CALENDAR_TONE_OPTIONS[0]
  const objects = calendarSelectionLabels(task.objects)
  const workers = calendarSelectionLabels(task.workers)
  const startTime = calendarNormalizeTimeValue(task.startTime ?? task.time)
  const endTime = calendarNormalizeTimeValue(task.endTime)
  const timeRange = startTime && endTime ? `${startTime}-${endTime}` : startTime
  const dateLabel = task.dateYmd ? formatDatePl(`${task.dateYmd}T12:00:00.000Z`) : '-'
  const zoneLabel = String(task.zone?.label ?? task.zoneName ?? '').trim()
  const zoneLocation = String(task.zone?.location ?? task.zoneLocation ?? '').trim()
  const zoneDisplay = zoneLabel ? calendarZoneDisplayLabel({ label: zoneLabel, location: zoneLocation }) : ''
  const objectLabel = [objects.length ? objects.join(', ') : String(task.place ?? '').trim(), zoneDisplay].filter(Boolean).join(' / ')
  const dueDate = String(task.dueDateYmd ?? '').trim()
  const dueTime = calendarNormalizeTimeValue(task.dueTime)
  const dueLabel = dueDate ? `Termin: ${formatDatePl(`${dueDate}T12:00:00.000Z`)}${dueTime ? ` ${dueTime}` : ''}` : ''
  const metaItems = [dateLabel, timeRange, dueLabel, objectLabel].filter(Boolean)
  const completed = kanbanTaskIsCompleted(task)
  const doneSummary = kanbanTaskDoneSummary(task)
  return `
    <article
      class="kanban-card kanban-card--${escapeHtml(toneMeta.css)}${completed ? ' is-completed' : ''}"
      draggable="true"
      tabindex="0"
      role="button"
      data-kanban-task-id="${escapeHtml(task.id)}"
      data-kanban-completed="${completed ? '1' : '0'}"
      title="${escapeHtml(title)}"
    >
      <div class="kanban-card-top">
        <div class="kanban-card-tag">${escapeHtml(toneMeta.label)}</div>
        <button
          class="kanban-card-done-btn${completed ? ' is-done' : ''}"
          type="button"
          draggable="false"
          data-kanban-complete-task="${escapeHtml(task.id)}"
          aria-label="${completed ? 'Cofnij zakończenie zadania' : 'Oznacz zadanie jako wykonane'}"
          title="${completed ? 'Cofnij zakończenie zadania' : 'Oznacz zadanie jako wykonane'}"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.4" />
          </svg>
        </button>
      </div>
      <h3>${escapeHtml(title)}</h3>
      ${metaItems.length ? `<p class="kanban-card-meta">${escapeHtml(metaItems.join(' · '))}</p>` : ''}
      ${
        completed
          ? `<p class="kanban-card-done-summary"><strong>Zakończone</strong>${doneSummary.note ? `: ${escapeHtml(doneSummary.note)}` : ''}${doneSummary.meta ? `<span>${escapeHtml(doneSummary.meta)}</span>` : ''}</p>`
          : ''
      }
      <div class="kanban-card-footer">
        <div class="kanban-card-stats">
          <span title="Obiekty">Obiekty ${objects.length || (objectLabel ? 1 : 0)}</span>
          <span title="Osoby">Osoby ${workers.length}</span>
        </div>
        <div class="kanban-card-avatars" aria-label="Przypisane osoby">
          ${
            workers.length
              ? workers.slice(0, 4).map((name) => `<span title="${escapeHtml(name)}">${escapeHtml(kanbanInitials(name))}</span>`).join('')
              : '<span title="Brak osoby">?</span>'
          }
        </div>
      </div>
    </article>
  `
}

function kanbanNormalizeSection(section = '') {
  const value = String(section ?? '').trim()
  return ['home', 'tasks', 'inbox'].includes(value) ? value : 'home'
}

function kanbanWorkspaceTasks({ includeCompleted = true } = {}) {
  kanbanEnsureState()
  const tasks = appState.calendarTasks.filter((task) => calendarTaskIsVisibleForCurrentUser(task))
  return calendarSortTasks(includeCompleted ? tasks : tasks.filter((task) => !kanbanTaskIsCompleted(task)))
}

function kanbanMessageTask(task = {}) {
  return (
    Boolean(task.generatedFromComment) ||
    calendarTaskToneValue(task) === 'message' ||
    normalizeSearchText(task.sourceKind).includes('comment')
  )
}

function kanbanWorkspaceTaskDateValue(task = {}) {
  const date = String(task.dueDateYmd || task.dateYmd || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '9999-12-31'
}

function kanbanWorkspaceTaskTimeValue(task = {}) {
  return calendarNormalizeTimeValue(task.dueTime || task.startTime || task.time) || '99:99'
}

function kanbanSortByAge(tasks = [], { newestFirst = false } = {}) {
  return [...tasks].sort((left, right) => {
    const leftDate = kanbanWorkspaceTaskDateValue(left)
    const rightDate = kanbanWorkspaceTaskDateValue(right)
    if (leftDate !== rightDate) {
      return newestFirst ? rightDate.localeCompare(leftDate) : leftDate.localeCompare(rightDate)
    }
    const leftTime = kanbanWorkspaceTaskTimeValue(left)
    const rightTime = kanbanWorkspaceTaskTimeValue(right)
    if (leftTime !== rightTime) {
      return newestFirst ? rightTime.localeCompare(leftTime) : leftTime.localeCompare(rightTime)
    }
    return String(left.title ?? '').localeCompare(String(right.title ?? ''), 'pl', { sensitivity: 'base' })
  })
}

function kanbanTaskProjectLabel(task = {}) {
  const objects = calendarSelectionLabels(task.objects)
  const objectLabel = objects[0] || String(task.place ?? '').trim()
  const zoneLabel = String(task.zone?.label ?? task.zoneName ?? '').trim()
  const zoneLocation = String(task.zone?.location ?? task.zoneLocation ?? '').trim()
  const zoneDisplay = zoneLabel ? calendarZoneDisplayLabel({ label: zoneLabel, location: zoneLocation }) : ''
  return [objectLabel, zoneDisplay].filter(Boolean).join(' / ') || 'Bez projektu'
}

function kanbanTaskShortDateLabel(task = {}) {
  const date = String(task.dueDateYmd || task.dateYmd || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return 'Bez daty'
  }
  const today = todayYmd()
  if (date === today) {
    return 'Dzisiaj'
  }
  return calendarDateLabelFromYmd(date)
}

function kanbanHomeCurrentDateLabel() {
  try {
    return new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  } catch {
    return calendarDateLabelFromYmd(todayYmd())
  }
}

function kanbanHomeGreetingName() {
  const full = String(appState.session?.name || appState.session?.login || appState.session?.email || '').trim()
  if (!full) {
    return 'użytkowniku'
  }
  return full.split(/\s+/)[0] || full
}

function kanbanHomeTaskRowHtml(task = {}) {
  const title = String(task.title ?? '').trim() || 'Zadanie'
  const project = kanbanTaskProjectLabel(task)
  const dateLabel = kanbanTaskShortDateLabel(task)
  const status = kanbanColumnLabel(task.kanbanStatus)
  const completed = kanbanTaskIsCompleted(task)
  return `
    <button class="kanban-home-task-row${completed ? ' is-completed' : ''}" type="button" data-kanban-task-id="${escapeHtml(task.id)}">
      <span class="kanban-home-check" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="m6 12.5 4 4L18 8" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
        </svg>
      </span>
      <span class="kanban-home-task-main">
        <strong>${escapeHtml(title)}</strong>
        <small>${escapeHtml(project)}</small>
      </span>
      <span class="kanban-home-task-status">${escapeHtml(status)}</span>
      <span class="kanban-home-task-date">${escapeHtml(dateLabel)}</span>
    </button>
  `
}

function kanbanHomeTaskGroups(tasks = kanbanWorkspaceTasks()) {
  const today = todayYmd()
  const active = tasks.filter((task) => !kanbanTaskIsCompleted(task))
  const completed = tasks.filter((task) => kanbanTaskIsCompleted(task))
  return {
    upcoming: kanbanSortByAge(active.filter((task) => kanbanWorkspaceTaskDateValue(task) >= today)).slice(0, 7),
    overdue: kanbanSortByAge(active.filter((task) => kanbanWorkspaceTaskDateValue(task) < today)).slice(0, 7),
    completed: kanbanSortByAge(completed, { newestFirst: true }).slice(0, 7),
    overdueTotal: active.filter((task) => kanbanWorkspaceTaskDateValue(task) < today).length,
  }
}

function kanbanProjectSummaries(tasks = kanbanWorkspaceTasks({ includeCompleted: false })) {
  const colors = ['violet', 'blue', 'pink', 'cyan', 'amber', 'green']
  const byLabel = new Map()
  tasks.forEach((task) => {
    const label = kanbanTaskProjectLabel(task)
    const key = normalizeSearchText(label)
    if (!key) {
      return
    }
    const current = byLabel.get(key) ?? {
      label,
      count: 0,
      earliest: kanbanWorkspaceTaskDateValue(task),
      color: colors[byLabel.size % colors.length],
    }
    current.count += 1
    const date = kanbanWorkspaceTaskDateValue(task)
    if (date < current.earliest) {
      current.earliest = date
    }
    byLabel.set(key, current)
  })
  return [...byLabel.values()].sort((left, right) => {
    if (left.earliest !== right.earliest) {
      return left.earliest.localeCompare(right.earliest)
    }
    return left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' })
  })
}

function kanbanProjectIconHtml(color = 'blue') {
  return `
    <span class="kanban-project-icon kanban-project-icon--${escapeHtml(color)}" aria-hidden="true">
      <span></span><span></span><span></span>
    </span>
  `
}

function renderKanbanSidebar(tasks = kanbanWorkspaceTasks()) {
  const activeSection = kanbanNormalizeSection(appState.kanbanSection)
  document.querySelectorAll('[data-kanban-section], [data-kanban-menu-section]').forEach((button) => {
    const section = button.getAttribute('data-kanban-section') || button.getAttribute('data-kanban-menu-section')
    button.classList.toggle('is-active', String(section) === activeSection)
    button.classList.toggle('active', String(section) === activeSection && appState.currentRoute === 'kanban')
  })
  document.querySelectorAll('[data-toggle="kanban"]').forEach((button) => {
    button.classList.toggle('active', appState.currentRoute === 'kanban')
    button.classList.toggle('open', appState.currentRoute === 'kanban')
  })

  const activeTasks = tasks.filter((task) => !kanbanTaskIsCompleted(task))
  const messageTasks = activeTasks.filter((task) => kanbanMessageTask(task))
  document.querySelectorAll('[data-kanban-my-count]').forEach((node) => {
    node.textContent = String(activeTasks.length)
    node.hidden = activeTasks.length === 0
  })
  document.querySelectorAll('[data-kanban-inbox-dot]').forEach((node) => {
    node.hidden = messageTasks.length === 0
  })

  const projectRoot = document.getElementById('kanbanPortalMenuProjects')
  const projectSummaries = kanbanProjectSummaries(activeTasks)
  const projectLimit = Math.max(4, Number(appState.kanbanProjectLimit) || 9)
  if (projectRoot) {
    projectRoot.innerHTML = projectSummaries.slice(0, projectLimit).map((project) => `
      <button class="submenu-item kanban-menu-project" type="button" data-kanban-project-filter="${escapeHtml(project.label)}" title="${escapeHtml(project.label)}">
        ${kanbanProjectIconHtml(project.color)}
        <span class="mi-label">${escapeHtml(project.label)}</span>
        <small>${project.count}</small>
      </button>
    `).join('') || '<p class="kanban-menu-empty">Brak aktywnych projektów.</p>'
  }

  const showMore = document.getElementById('kanbanPortalMenuShowMore')
  if (showMore) {
    showMore.hidden = projectSummaries.length <= projectLimit
  }

}

function renderKanbanHome(tasks = kanbanWorkspaceTasks()) {
  const dateNode = document.getElementById('kanbanHomeDate')
  const greetingNode = document.getElementById('kanbanHomeGreeting')
  const avatarNode = document.getElementById('kanbanHomeAvatar')
  if (dateNode) dateNode.textContent = kanbanHomeCurrentDateLabel()
  if (greetingNode) greetingNode.textContent = `Dzień dobry, ${kanbanHomeGreetingName()}`
  if (avatarNode) avatarNode.textContent = kanbanInitials(appState.session?.name || appState.session?.email || '?')

  const groups = kanbanHomeTaskGroups(tasks)
  const activeTab = ['upcoming', 'overdue', 'completed'].includes(appState.kanbanHomeTaskTab) ? appState.kanbanHomeTaskTab : 'upcoming'
  appState.kanbanHomeTaskTab = activeTab
  document.querySelectorAll('#view-kanban [data-kanban-home-tab]').forEach((button) => {
    button.classList.toggle('is-active', String(button.getAttribute('data-kanban-home-tab')) === activeTab)
  })
  const overdueCount = document.getElementById('kanbanHomeOverdueCount')
  if (overdueCount) overdueCount.textContent = `(${groups.overdueTotal})`

  const taskRoot = document.getElementById('kanbanHomeTasks')
  const visibleTasks = groups[activeTab] ?? []
  if (taskRoot) {
    taskRoot.innerHTML = visibleTasks.length
      ? visibleTasks.map((task) => kanbanHomeTaskRowHtml(task)).join('')
      : '<div class="kanban-home-empty">Brak zadań w tym widoku.</div>'
  }

  const projectRoot = document.getElementById('kanbanHomeProjects')
  const projects = kanbanProjectSummaries(tasks.filter((task) => !kanbanTaskIsCompleted(task))).slice(0, 7)
  if (projectRoot) {
    projectRoot.innerHTML = `
      <button class="kanban-project-card kanban-project-card--create" type="button" data-kanban-home-add-task>
        <span aria-hidden="true">+</span>
        <strong>Utwórz zadanie</strong>
      </button>
      ${projects.map((project) => `
        <button class="kanban-project-card" type="button" data-kanban-project-filter="${escapeHtml(project.label)}" title="${escapeHtml(project.label)}">
          ${kanbanProjectIconHtml(project.color)}
          <span>
            <strong>${escapeHtml(project.label)}</strong>
            <small>${project.count} ${project.count === 1 ? 'zadanie' : 'zadań'} do wykonania</small>
          </span>
        </button>
      `).join('')}
    `
  }
}

function kanbanInboxDateGroupLabel(dateYmd = '') {
  const value = String(dateYmd ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return 'Bez daty'
  }
  const today = todayYmd()
  if (value === today) {
    return 'Dzisiaj'
  }
  const yesterday = calendarAddDays(today, -1)
  if (value === yesterday) {
    return 'Wczoraj'
  }
  return calendarDateLabelFromYmd(value)
}

function kanbanInboxTaskRowHtml(task = {}) {
  const title = String(task.title ?? '').trim() || 'Zadanie'
  const dateLabel = calendarDateLabelFromYmd(task.dueDateYmd || task.dateYmd)
  const comments = calendarNormalizeActivityLog(task.activityLog).length
  return `
    <button class="kanban-inbox-task-row" type="button" data-kanban-task-id="${escapeHtml(task.id)}">
      <span class="kanban-inbox-task-check" aria-hidden="true">✓</span>
      <span class="kanban-inbox-task-title">${escapeHtml(title)}</span>
      ${comments ? `<span class="kanban-inbox-task-comments">${comments}</span>` : ''}
      <span class="kanban-inbox-task-date">${escapeHtml(dateLabel)}</span>
      <span class="kanban-inbox-task-icons" aria-hidden="true">♡ ◌</span>
    </button>
  `
}

function kanbanInboxActivityGroups(tasks = []) {
  const groups = new Map()
  kanbanSortByAge(tasks.filter((task) => !kanbanTaskIsCompleted(task) && kanbanMessageTask(task))).forEach((task) => {
    const label = kanbanTaskProjectLabel(task)
    const key = normalizeSearchText(label)
    const sourceWorker = String(task.sourceWorkerName || task.sourceWorkerLogin || calendarSelectionLabels(task.workers)[0] || 'pracownik').trim()
    if (!groups.has(key)) {
      groups.set(key, {
        label,
        worker: sourceWorker,
        color: calendarTaskToneValue(task) === 'message' ? 'violet' : 'blue',
        tasks: [],
      })
    }
    groups.get(key).tasks.push(task)
  })
  return [...groups.values()]
}

function kanbanInboxBookmarkGroups(tasks = []) {
  const groups = new Map()
  kanbanSortByAge(tasks.filter((task) => !kanbanTaskIsCompleted(task))).forEach((task) => {
    const key = String(task.dueDateYmd || task.dateYmd || '').trim() || 'none'
    if (!groups.has(key)) {
      groups.set(key, {
        label: key === 'none' ? 'Bez daty' : `Twoje zadania na ${kanbanInboxDateGroupLabel(key)}`,
        tasks: [],
      })
    }
    groups.get(key).tasks.push(task)
  })
  return [...groups.values()]
}

function renderKanbanInbox(tasks = kanbanWorkspaceTasks()) {
  const root = document.getElementById('kanbanInboxList')
  if (!root) {
    return
  }
  const activeTab = appState.kanbanInboxTab === 'bookmarks' ? 'bookmarks' : 'activity'
  appState.kanbanInboxTab = activeTab
  document.querySelectorAll('#view-kanban [data-kanban-inbox-tab]').forEach((button) => {
    button.classList.toggle('is-active', String(button.getAttribute('data-kanban-inbox-tab')) === activeTab)
  })

  const avatar = document.getElementById('kanbanInboxAvatar')
  if (avatar) avatar.textContent = kanbanInitials(appState.session?.name || appState.session?.email || '?')

  if (activeTab === 'bookmarks') {
    const groups = kanbanInboxBookmarkGroups(tasks).slice(0, 12)
    root.innerHTML = groups.length
      ? groups.map((group) => `
          <section class="kanban-inbox-group kanban-inbox-group--bookmarks">
            <div class="kanban-inbox-date-label">${escapeHtml(kanbanInboxDateGroupLabel(group.tasks[0]?.dateYmd || group.tasks[0]?.dueDateYmd))}</div>
            <div class="kanban-inbox-group-inner">
              <div class="kanban-inbox-group-head">
                <span class="kanban-inbox-calendar-icon" aria-hidden="true"></span>
                <h2>${escapeHtml(group.label)}</h2>
              </div>
              <div class="kanban-inbox-task-table">
                ${group.tasks.slice(0, 3).map((task) => kanbanInboxTaskRowHtml(task)).join('')}
              </div>
              ${group.tasks.length > 3 ? '<button class="kanban-inbox-more" type="button">Pokaż więcej zadań</button>' : ''}
            </div>
          </section>
        `).join('')
      : '<div class="kanban-inbox-empty">Brak zadań do pokazania.</div>'
    return
  }

  const groups = kanbanInboxActivityGroups(tasks).slice(0, 20)
  root.innerHTML = groups.length
    ? groups.map((group) => `
        <section class="kanban-inbox-group">
          <div class="kanban-inbox-date-label">${escapeHtml(kanbanInboxDateGroupLabel(group.tasks[0]?.dateYmd))}</div>
          <div class="kanban-inbox-group-inner">
            <div class="kanban-inbox-group-head">
              <span class="kanban-inbox-project-dot kanban-inbox-project-dot--${escapeHtml(group.color)}" aria-hidden="true"></span>
              <h2>${escapeHtml(group.label)}</h2>
              <span class="kanban-inbox-unread-dot" aria-hidden="true"></span>
            </div>
            <p class="kanban-inbox-group-subtitle">Nowe zadania dodane przez: ${escapeHtml(group.worker)}</p>
            <div class="kanban-inbox-task-table">
              ${group.tasks.slice(0, 3).map((task) => kanbanInboxTaskRowHtml(task)).join('')}
            </div>
            ${group.tasks.length > 3 ? '<button class="kanban-inbox-more" type="button">Pokaż więcej zadań</button>' : ''}
          </div>
        </section>
      `).join('')
    : '<div class="kanban-inbox-empty">Brak aktywnych wiadomości pracowników.</div>'
}

function renderKanbanBoard(tasks = kanbanVisibleTasks()) {
  const board = document.getElementById('kanbanBoard')
  if (!board) {
    return
  }
  const columns = appState.kanbanColumns
  board.style.setProperty('--kanban-column-count', String(columns.length))
  board.style.removeProperty('min-width')
  board.innerHTML = `
    ${columns.map((column) => {
      const columnTasks = tasks.filter((task) => kanbanNormalizeStatus(task.kanbanStatus) === column.id)
      return `
        <section
          class="kanban-column kanban-column--${escapeHtml(column.id)}"
          data-kanban-column="${escapeHtml(column.id)}"
          style="${escapeHtml(kanbanColumnStyle(column))}"
        >
          <div class="kanban-column-head">
            <div
              class="kanban-column-title"
              draggable="true"
              data-kanban-column-drag-handle="${escapeHtml(column.id)}"
              title="Przeciągnij, aby zmienić kolejność kolumn"
            >
              <span class="kanban-column-dot" aria-hidden="true"></span>
              <h2>${escapeHtml(column.label)}</h2>
              <span class="kanban-column-count">${columnTasks.length}</span>
              ${kanbanColumnScopeBadgeHtml(column)}
            </div>
            <button class="kanban-more-btn" type="button" data-kanban-edit-column="${escapeHtml(column.id)}" aria-label="Edytuj kolumnę ${escapeHtml(column.label)}">⋮</button>
          </div>
          <div class="kanban-column-list">
            ${columnTasks.length ? columnTasks.map((task) => kanbanCardHtml(task)).join('') : '<div class="kanban-empty">Brak zadań</div>'}
          </div>
          <button class="kanban-add-item" type="button" data-kanban-add-task="${escapeHtml(column.id)}">+ Dodaj zadanie</button>
        </section>
      `
    }).join('')}
    <section class="kanban-column kanban-column--new">
      <button class="kanban-add-column" type="button">+ Nowa kolumna</button>
    </section>
  `
}

function renderKanbanView() {
  renderKanbanSyncStatus()
  kanbanEnsureState()
  appState.kanbanSection = kanbanNormalizeSection(appState.kanbanSection)
  const searchInput = document.getElementById('kanbanSearch')
  if (searchInput && searchInput.value !== appState.kanbanSearch) {
    searchInput.value = appState.kanbanSearch
  }
  const workspaceTasks = kanbanWorkspaceTasks()
  renderKanbanSidebar(workspaceTasks)

  const homeView = document.getElementById('kanbanHomeView')
  const taskBoardView = document.getElementById('kanbanTaskBoardView')
  const inboxView = document.getElementById('kanbanInboxView')
  if (homeView) homeView.hidden = appState.kanbanSection !== 'home'
  if (taskBoardView) taskBoardView.hidden = appState.kanbanSection !== 'tasks'
  if (inboxView) inboxView.hidden = appState.kanbanSection !== 'inbox'
  const boardAvatar = kanbanInitials(appState.session?.name || appState.session?.email || '?')
  const boardAvatarNode = document.getElementById('kanbanBoardAvatar')
  const boardTitleAvatarNode = document.getElementById('kanbanBoardTitleAvatar')
  if (boardAvatarNode) boardAvatarNode.textContent = boardAvatar
  if (boardTitleAvatarNode) boardTitleAvatarNode.textContent = boardAvatar

  if (appState.kanbanSection === 'home') {
    renderKanbanHome(workspaceTasks)
    return
  }
  if (appState.kanbanSection === 'inbox') {
    renderKanbanInbox(workspaceTasks)
    return
  }
  renderKanbanBoard(kanbanVisibleTasks())
}

function kanbanMoveTask(taskId, status) {
  const id = String(taskId ?? '').trim()
  const nextStatus = kanbanNormalizeStatus(status)
  if (!id) {
    return
  }
  const changedAt = new Date().toISOString()
  const tasks = calendarLoadTasks().map((task) =>
    task.id === id
      ? calendarNormalizeTask(
          calendarAppendTaskActivity(
            { ...task, kanbanStatus: nextStatus, updatedAt: changedAt },
            'Przeniesiono w Centrum zadań',
            `Kolumna: ${kanbanColumnLabel(task.kanbanStatus)} -> ${kanbanColumnLabel(nextStatus)}`,
            { at: changedAt },
          ),
        )
      : task,
  )
  calendarSaveTasks(tasks)
  renderDashboardKanbanTasks()
  renderKanbanView()
}

function kanbanCloseDonePopover() {
  const popover = document.getElementById('kanbanDonePopover')
  if (popover) {
    popover.hidden = true
    popover.setAttribute('aria-hidden', 'true')
  }
  appState.kanbanDoneTaskId = ''
}

function kanbanConfirmTaskDone() {
  const id = String(appState.kanbanDoneTaskId ?? '').trim()
  const noteInput = document.getElementById('kanbanDoneNote')
  const note = String(noteInput?.value ?? '').trim()
  if (!id) {
    kanbanCloseDonePopover()
    return
  }
  if (!note) {
    showTransientNotice('Napisz krótko, co zostało zrobione.', 'error')
    noteInput?.focus?.()
    return
  }

  const completedAt = new Date().toISOString()
  const completedBy = String(appState.session?.name || appState.session?.email || appState.session?.uid || '').trim()
  const tasks = calendarLoadTasks().map((task) =>
    task.id === id
      ? calendarNormalizeTask(
          calendarAppendTaskActivity(
            {
              ...task,
              active: true,
              completed: true,
              kanbanCompleted: true,
              completionStatus: 'ZAKONCZONE',
              completedAt,
              completedBy,
              completedNote: note,
              updatedAt: completedAt,
            },
            'Oznaczono jako ukończone',
            calendarCompletionActivityDetails(task, note, completedBy),
            { actor: completedBy, at: completedAt },
          ),
        )
      : task,
  )
  calendarSaveTasks(tasks)
  kanbanCloseDonePopover()
  renderDashboardKanbanTasks()
  renderKanbanView()
  showTransientNotice('Zadanie oznaczone jako zakończone.')
}

function kanbanCompleteTaskNow(taskId = '') {
  const id = String(taskId ?? '').trim()
  if (!id) {
    return
  }

  const tasksBefore = calendarLoadTasks()
  const task = tasksBefore.find((item) => item.id === id)
  if (!task) {
    return
  }

  if (kanbanTaskIsCompleted(task)) {
    const updatedAt = new Date().toISOString()
    const tasks = tasksBefore.map((item) =>
      item.id === id
        ? calendarNormalizeTask(
            calendarAppendTaskActivity(
              {
                ...item,
                active: true,
                completed: false,
                kanbanCompleted: false,
                completionStatus: 'AKTYWNE',
                completedAt: '',
                completedBy: '',
                completedNote: '',
                updatedAt,
              },
              'Cofnięto ukończenie',
              '',
              { at: updatedAt },
            ),
          )
        : item,
    )
    calendarSaveTasks(tasks)
    kanbanCloseDonePopover()
    renderDashboardKanbanTasks()
    renderKanbanView()
    showTransientNotice('Cofnięto zakończenie zadania.')
    return
  }

  const completedAt = new Date().toISOString()
  const completedBy = String(appState.session?.name || appState.session?.email || appState.session?.uid || '').trim()
  const tasks = tasksBefore.map((item) =>
    item.id === id
      ? calendarNormalizeTask(
          calendarAppendTaskActivity(
            {
              ...item,
              active: true,
              completed: true,
              kanbanCompleted: true,
              completionStatus: 'ZAKONCZONE',
              completedAt,
              completedBy,
              completedNote: calendarCompletionNoteForTask(item, completedBy),
              updatedAt: completedAt,
            },
            'Oznaczono jako ukończone',
            calendarCompletionActivityDetails(item, '', completedBy),
            { actor: completedBy, at: completedAt },
          ),
        )
      : item,
  )
  calendarSaveTasks(tasks)
  kanbanCloseDonePopover()
  renderDashboardKanbanTasks()
  renderKanbanView()
  showTransientNotice('Zadanie oznaczone jako zakończone.')
}

function kanbanColumnDropPosition(event, columnNode) {
  if (!(columnNode instanceof HTMLElement)) {
    return 'before'
  }
  const rect = columnNode.getBoundingClientRect()
  return event.clientX > rect.left + rect.width / 2 ? 'after' : 'before'
}

function kanbanClearColumnDragClasses() {
  document.querySelectorAll('#view-kanban .kanban-column').forEach((node) => {
    node.classList.remove('is-column-dragging', 'is-column-drop-target', 'is-column-drop-before', 'is-column-drop-after')
  })
}

function kanbanMarkColumnDropTarget(columnNode, position = 'before') {
  if (!(columnNode instanceof HTMLElement)) {
    return
  }
  document.querySelectorAll('#view-kanban .kanban-column.is-column-drop-target').forEach((node) => {
    if (node !== columnNode) {
      node.classList.remove('is-column-drop-target', 'is-column-drop-before', 'is-column-drop-after')
    }
  })
  columnNode.classList.add('is-column-drop-target')
  columnNode.classList.toggle('is-column-drop-before', position !== 'after')
  columnNode.classList.toggle('is-column-drop-after', position === 'after')
}

function kanbanMoveColumn(sourceColumnId = '', targetColumnId = '', position = 'before') {
  const sourceId = String(sourceColumnId ?? '').trim()
  const targetId = String(targetColumnId ?? '').trim()
  if (!sourceId || !targetId || sourceId === targetId) {
    return
  }

  const columns = kanbanLoadColumns()
  const sourceIndex = columns.findIndex((column) => column.id === sourceId)
  const rawTargetIndex = columns.findIndex((column) => column.id === targetId)
  if (sourceIndex < 0 || rawTargetIndex < 0) {
    return
  }

  const nextColumns = [...columns]
  const [movedColumn] = nextColumns.splice(sourceIndex, 1)
  let targetIndex = rawTargetIndex
  if (sourceIndex < rawTargetIndex) {
    targetIndex -= 1
  }
  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex
  nextColumns.splice(Math.max(0, Math.min(insertIndex, nextColumns.length)), 0, movedColumn)
  kanbanSaveColumns(nextColumns)
  renderKanbanView()
}

function kanbanOpenCalendarTask(taskId = '') {
  const id = String(taskId ?? '').trim()
  const task = calendarLoadTasks().find((item) => item.id === id)
  if (id) {
    calendarMarkTaskRead(id, {
      renderDashboard: appState.currentRoute === 'dashboard',
      renderKanban: false,
      renderCalendar: false,
    })
  }
  if (task?.dateYmd) {
    appState.calendarCursorDay = task.dateYmd
  }
  appState.calendarViewMode = 'week'
  document.querySelector('[data-route="calendar"]')?.click()
  window.setTimeout(() => {
    renderCalendarView()
    if (id) {
      calendarOpenEditor(id)
    }
  }, 0)
}

function kanbanCreateTask(status = '') {
  const normalizedStatus = String(status ?? '').trim() ? kanbanNormalizeStatus(status) : ''
  appState.kanbanPendingStatus = normalizedStatus
  appState.calendarCursorDay = todayYmd()
  appState.calendarViewMode = 'week'
  document.querySelector('[data-route="calendar"]')?.click()
  window.setTimeout(() => {
    renderCalendarView()
    calendarOpenEditor('', appState.calendarCursorDay)
    const toneInput = document.getElementById('calendarTaskTone')
    if (toneInput && normalizedStatus === 'done') {
      toneInput.value = 'green'
    }
    showTransientNotice('Dodaj zadanie w kalendarzu. Po zapisie pojawi się też w Centrum zadań.')
  }, 0)
}

function bindKanbanViewFunctions() {
  const binding = createBindingHelpers()
  const root = document.getElementById('view-kanban')

  binding.add(document.getElementById('kanbanSearch'), 'input', (event) => {
    appState.kanbanSearch = String(event.target?.value ?? '')
    renderKanbanView()
  })
  binding.add(document.getElementById('kanbanAddTaskBtn'), 'click', () => kanbanCreateTask())
  binding.add(document.getElementById('kanbanQuickCreateBtn'), 'click', () => kanbanCreateTask())
  binding.add(document.getElementById('kanbanInboxOpenTasksBtn'), 'click', () => {
    appState.kanbanSection = 'tasks'
    appState.kanbanSearch = 'Wiadomość pracownika'
    renderKanbanView()
  })
  binding.add(document.getElementById('kanbanColumnSaveBtn'), 'click', kanbanSaveColumnEditor)
  binding.add(document.getElementById('kanbanColumnCancelBtn'), 'click', kanbanCloseColumnEditor)
  binding.add(document.getElementById('kanbanColumnCloseBtn'), 'click', kanbanCloseColumnEditor)
  binding.add(document.getElementById('kanbanColumnDeleteBtn'), 'click', kanbanDeleteColumnEditor)
  binding.add(document.getElementById('kanbanDoneSaveBtn'), 'click', kanbanConfirmTaskDone)
  binding.add(document.getElementById('kanbanDoneCancelBtn'), 'click', kanbanCloseDonePopover)
  binding.add(document.getElementById('kanbanDoneCloseBtn'), 'click', kanbanCloseDonePopover)
  binding.add(document.getElementById('kanbanColumnScope'), 'change', () => kanbanSyncColumnScopeFields({ clearOwner: true }))
  document.querySelectorAll('input[name="kanbanColumnScopeChoice"]').forEach((input) => {
    binding.add(input, 'change', () => {
      const scopeSelect = document.getElementById('kanbanColumnScope')
      if (scopeSelect && input instanceof HTMLInputElement && input.checked) {
        scopeSelect.value = input.value === 'project' ? 'person' : input.value
        kanbanSyncColumnScopeFields({ clearOwner: true })
      }
    })
  })
  binding.add(document.getElementById('kanbanColumnOverlay'), 'click', (event) => {
    if (event.target?.id === 'kanbanColumnOverlay') {
      kanbanCloseColumnEditor()
    }
  })
  binding.add(document.getElementById('kanbanColumnOverlay'), 'keydown', (event) => {
    if (event.key === 'Escape') {
      kanbanCloseColumnEditor()
    }
    if (event.key === 'Enter' && ['kanbanColumnName', 'kanbanColumnOwner'].includes(event.target?.id)) {
      kanbanSaveColumnEditor()
    }
  })
  binding.add(document.getElementById('kanbanDonePopover'), 'keydown', (event) => {
    if (event.key === 'Escape') {
      kanbanCloseDonePopover()
    }
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      kanbanConfirmTaskDone()
    }
  })
  binding.add(root, 'click', (event) => {
    if (kanbanConsumeBackgroundClickWhenWindowOpen(event)) {
      return
    }
    const sectionButton = event.target?.closest?.('[data-kanban-section]')
    if (sectionButton) {
      appState.kanbanSection = kanbanNormalizeSection(sectionButton.getAttribute('data-kanban-section'))
      if (appState.kanbanSection !== 'tasks') {
        appState.kanbanSearch = ''
      }
      renderKanbanView()
      return
    }
    const homeTab = event.target?.closest?.('[data-kanban-home-tab]')
    if (homeTab) {
      appState.kanbanHomeTaskTab = String(homeTab.getAttribute('data-kanban-home-tab') ?? 'upcoming')
      renderKanbanView()
      return
    }
    const inboxTab = event.target?.closest?.('[data-kanban-inbox-tab]')
    if (inboxTab) {
      appState.kanbanInboxTab = String(inboxTab.getAttribute('data-kanban-inbox-tab') ?? 'activity')
      renderKanbanView()
      return
    }
    const projectFilter = event.target?.closest?.('[data-kanban-project-filter]')
    if (projectFilter) {
      const label = String(projectFilter.getAttribute('data-kanban-project-filter') ?? '').trim()
      appState.kanbanSection = 'tasks'
      appState.kanbanSearch = label
      renderKanbanView()
      return
    }
    if (event.target?.closest?.('[data-kanban-home-add-task]')) {
      kanbanCreateTask()
      return
    }
    if (event.target?.closest?.('#kanbanSidebarShowMore')) {
      appState.kanbanProjectLimit = Math.min(60, Math.max(9, Number(appState.kanbanProjectLimit) || 9) + 12)
      renderKanbanView()
      return
    }
    const completeTask = event.target?.closest?.('[data-kanban-complete-task]')
    if (completeTask) {
      event.preventDefault()
      event.stopPropagation()
      kanbanCompleteTaskNow(completeTask.getAttribute('data-kanban-complete-task'))
      return
    }
    const editColumn = event.target?.closest?.('[data-kanban-edit-column]')
    if (editColumn) {
      kanbanOpenColumnEditor(editColumn.getAttribute('data-kanban-edit-column'))
      return
    }
    const addTask = event.target?.closest?.('[data-kanban-add-task]')
    if (addTask) {
      kanbanCreateTask(addTask.getAttribute('data-kanban-add-task'))
      return
    }
    if (event.target?.closest?.('.kanban-add-column')) {
      kanbanOpenColumnEditor()
      return
    }
    const card = event.target?.closest?.('[data-kanban-task-id]')
    if (card) {
      kanbanOpenCalendarTask(card.getAttribute('data-kanban-task-id'))
    }
  })
  binding.add(root, 'keydown', (event) => {
    if (event.key !== 'Enter') {
      return
    }
    if (kanbanHasOpenWindow() && !kanbanTargetIsInsideOpenWindow(event.target)) {
      return
    }
    if (event.target?.closest?.('[data-kanban-complete-task]')) {
      return
    }
    const card = event.target?.closest?.('[data-kanban-task-id]')
    if (card) {
      kanbanOpenCalendarTask(card.getAttribute('data-kanban-task-id'))
    }
  })
  binding.add(root, 'dragstart', (event) => {
    if (kanbanHasOpenWindow()) {
      event.preventDefault()
      return
    }
    if (event.target?.closest?.('[data-kanban-complete-task]')) {
      event.preventDefault()
      return
    }
    const columnHandle = event.target?.closest?.('[data-kanban-column-drag-handle]')
    if (columnHandle) {
      const column = columnHandle.closest('[data-kanban-column]')
      const columnId = String(column?.getAttribute('data-kanban-column') ?? '').trim()
      if (!columnId) {
        return
      }
      appState.kanbanDragColumnId = columnId
      appState.kanbanDragTaskId = ''
      column?.classList.add('is-column-dragging')
      event.dataTransfer?.setData('application/x-icanban-column', columnId)
      event.dataTransfer?.setData('text/plain', columnId)
      event.dataTransfer.effectAllowed = 'move'
      return
    }

    const card = event.target?.closest?.('[data-kanban-task-id]')
    if (!card) {
      return
    }
    appState.kanbanDragTaskId = String(card.getAttribute('data-kanban-task-id') ?? '')
    event.dataTransfer?.setData('text/plain', appState.kanbanDragTaskId)
    event.dataTransfer.effectAllowed = 'move'
  })
  binding.add(root, 'dragover', (event) => {
    if (kanbanHasOpenWindow()) {
      event.preventDefault()
      return
    }
    const column = event.target?.closest?.('[data-kanban-column]')
    if (!column) {
      return
    }
    event.preventDefault()
    if (appState.kanbanDragColumnId) {
      const targetColumnId = String(column.getAttribute('data-kanban-column') ?? '').trim()
      if (targetColumnId && targetColumnId !== appState.kanbanDragColumnId) {
        kanbanMarkColumnDropTarget(column, kanbanColumnDropPosition(event, column))
      }
      event.dataTransfer.dropEffect = 'move'
      return
    }
    column.classList.add('is-drop-target')
  })
  binding.add(root, 'dragleave', (event) => {
    const column = event.target?.closest?.('[data-kanban-column]')
    column?.classList.remove('is-drop-target')
    if (appState.kanbanDragColumnId) {
      column?.classList.remove('is-column-drop-target', 'is-column-drop-before', 'is-column-drop-after')
    }
  })
  binding.add(root, 'drop', (event) => {
    if (kanbanHasOpenWindow()) {
      event.preventDefault()
      return
    }
    const column = event.target?.closest?.('[data-kanban-column]')
    if (!column) {
      return
    }
    event.preventDefault()
    column.classList.remove('is-drop-target', 'is-column-drop-target', 'is-column-drop-before', 'is-column-drop-after')
    if (appState.kanbanDragColumnId) {
      kanbanMoveColumn(appState.kanbanDragColumnId, column.getAttribute('data-kanban-column'), kanbanColumnDropPosition(event, column))
      appState.kanbanDragColumnId = ''
      kanbanClearColumnDragClasses()
      return
    }
    const taskId = event.dataTransfer?.getData('text/plain') || appState.kanbanDragTaskId
    kanbanMoveTask(taskId, column.getAttribute('data-kanban-column'))
    appState.kanbanDragTaskId = ''
  })
  binding.add(root, 'dragend', () => {
    appState.kanbanDragColumnId = ''
    appState.kanbanDragTaskId = ''
    document.querySelectorAll('.kanban-column.is-drop-target').forEach((node) => node.classList.remove('is-drop-target'))
    kanbanClearColumnDragClasses()
  })

  return binding.done
}

function cleanup() {
  kanbanCloseColumnEditor()
  kanbanCloseDonePopover()
}

return {
  bind: bindKanbanViewFunctions,
  render: renderKanbanView,
  ensureState: kanbanEnsureState,
  columnsForStatus: kanbanColumnsForStatus,
  newTaskStatus: kanbanNewTaskStatus,
  defaultStatusForTask: kanbanDefaultStatusForTask,
  normalizeColumnScope: kanbanNormalizeColumnScope,
  taskIsCompleted: kanbanTaskIsCompleted,
  initials: kanbanInitials,
  openCalendarTask: kanbanOpenCalendarTask,
  createTask: kanbanCreateTask,
  setDataLoading: kanbanSetDataLoading,
  renderSyncStatus: renderKanbanSyncStatus,
  columnLabel: kanbanColumnLabel,
  normalizeStatus: kanbanNormalizeStatus,
  currentUserOption: kanbanCurrentUserOption,
  normalizeSection: kanbanNormalizeSection,
  cleanup,
}
}
