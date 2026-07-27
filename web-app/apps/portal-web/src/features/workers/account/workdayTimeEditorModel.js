function workdayRecordId(row = {}) {
  return String(row?.workdayId ?? row?.id ?? '').trim()
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

export function preciseTimeInputValue(value) {
  const date = new Date(String(value ?? '').trim())
  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

export function timeEditorSourceRows(item = {}, requestedWorkdayId = '') {
  const sourceRows = Array.isArray(item?.sourceRows) ? item.sourceRows : []
  const normalizedWorkdayId = String(requestedWorkdayId ?? '').trim()
  if (!normalizedWorkdayId) {
    return sourceRows
  }

  return sourceRows.filter((source) => workdayRecordId(source) === normalizedWorkdayId)
}

export function findPendingTimeEditorItem(rows = [], intent = {}) {
  const dayKey = String(intent?.dayKey ?? '').trim()
  const workdayId = String(intent?.workdayId ?? '').trim()
  if (!dayKey) {
    return null
  }

  const dayRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => String(row?.dayKey ?? '').trim() === dayKey)
  if (!workdayId) {
    return dayRows[0] ?? null
  }

  return dayRows.find((row) => timeEditorSourceRows(row, workdayId).length > 0) ?? null
}
