import {
  addWorkerIdentityKey,
  normalizeWorkerIdentity,
  workerIdentityKey,
  workerIdentityKeys,
} from '../domain/workerCrudModel.js'

export function createWorkerDirectoryState({
  appState,
  normalizeRow,
  selectedKeys = new Set(),
  onClearSelection = () => {},
  onRowsChanged = () => {},
} = {}) {
  if (!appState || typeof normalizeRow !== 'function') {
    throw new Error('Brak konfiguracji stanu katalogu pracowników.')
  }

  function syncDerivedState() {
    appState.workers = appState.workerProfileRows.map((item) => ({ ...item }))
    appState.workersLoaded = true
  }

  function replace(workers, { clearSelection = true, resetPage = true } = {}) {
    const rows = Array.isArray(workers) ? workers : []
    appState.workerProfileRows = rows.map(normalizeRow)
    syncDerivedState()
    if (clearSelection) onClearSelection()
    onRowsChanged({ resetPage })
  }

  function upsert(previousKey, worker) {
    const row = normalizeRow(worker)
    const nextKey = workerIdentityKey(row)
    const previous = String(previousKey ?? '').trim()
    const rows = Array.isArray(appState.workerProfileRows) ? appState.workerProfileRows : []
    const index = rows.findIndex((item) => {
      const key = workerIdentityKey(item)
      return (previous && key === previous) || (nextKey && key === nextKey)
    })
    if (index >= 0) rows.splice(index, 1, row)
    else rows.push(row)
    appState.workerProfileRows = rows
    syncDerivedState()
    if (previous && previous !== nextKey) selectedKeys.delete(previous)
    if (nextKey) selectedKeys.delete(nextKey)
    onRowsChanged({ resetPage: false })
  }

  function remove(workerOrLogin, extraKeys = []) {
    const deleteKeys =
      typeof workerOrLogin === 'object' && workerOrLogin !== null
        ? workerIdentityKeys(workerOrLogin)
        : workerIdentityKeys({ login: workerOrLogin })
    extraKeys.forEach((value) => addWorkerIdentityKey(deleteKeys, value))
    if (!deleteKeys.size) return

    const rows = Array.isArray(appState.workerProfileRows) ? appState.workerProfileRows : []
    appState.workerProfileRows = rows.filter((worker) => {
      for (const key of workerIdentityKeys(worker)) {
        if (deleteKeys.has(key)) return false
      }
      return true
    })
    syncDerivedState()
    ;[...selectedKeys].forEach((key) => {
      if (deleteKeys.has(normalizeWorkerIdentity(key))) selectedKeys.delete(key)
    })
    onRowsChanged({ resetPage: false })
  }

  return Object.freeze({ replace, upsert, remove })
}
