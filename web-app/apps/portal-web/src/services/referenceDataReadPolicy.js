export const REFERENCE_READ_PAGE_SIZE = 250
export const REFERENCE_READ_MAX_RECORDS = 20000

function text(value) {
  return String(value ?? '').trim()
}

export function isLocalReferenceReadFallbackEnabled({ dev = false, enabled } = {}) {
  if (dev !== true) return false

  const normalized = text(enabled).toLowerCase()
  return !['0', 'false', 'no', 'off'].includes(normalized)
}

function errorMessage(error) {
  if (error instanceof Error) return text(error.message)
  try {
    return text(JSON.stringify(error))
  } catch {
    return text(error)
  }
}

function nestedErrorMessage(rawMessage) {
  const message = text(rawMessage)
  if (!message.startsWith('{')) return ''
  try {
    const parsed = JSON.parse(message)
    return text(parsed?.error?.message ?? parsed?.message)
  } catch {
    return ''
  }
}

export function isDataConnectOperationNotFound(error, operationName) {
  const message = errorMessage(error)
  const fullMessage = `${message} ${nestedErrorMessage(message)}`.toLowerCase()
  const operation = text(operationName).toLowerCase()
  if (!operation) return false

  return (
    fullMessage.includes(`operation "${operation}" not found`) ||
    fullMessage.includes(`operation \\"${operation}\\" not found`) ||
    fullMessage.includes(`operation '${operation}' not found`) ||
    (fullMessage.includes('operation') && fullMessage.includes('not found') && fullMessage.includes(operation)) ||
    ((fullMessage.includes('"status":"not_found"') ||
      fullMessage.includes('"code":404') ||
      fullMessage.includes('"code":"404"')) &&
      fullMessage.includes(operation))
  )
}

export function createReferenceReadLimitError(label, maxRecords = REFERENCE_READ_MAX_RECORDS) {
  const error = new Error(
    `Nie można potwierdzić kompletnego katalogu ${text(label) || 'danych'}: odczyt przekracza limit ${maxRecords} rekordów.`,
  )
  error.code = 'REFERENCE_DATA_READ_LIMIT'
  error.maxRecords = maxRecords
  return error
}

export function createReferenceReadUnavailableError(label) {
  const error = new Error(
    `Kosztowo bezpieczny odczyt katalogu ${text(label) || 'danych'} jest niedostępny. Pełny odczyt organizacji został zablokowany.`,
  )
  error.code = 'REFERENCE_DATA_READ_UNAVAILABLE'
  return error
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

function rowKey(row, keyFields) {
  const fields = Array.isArray(keyFields) ? keyFields : [keyFields]
  return fields.map((field) => text(row?.[field])).join('\u001f')
}

function pageRowsFromResponse(response, listKey, label, limit) {
  const rows = response?.data?.[listKey]
  if (!Array.isArray(rows)) {
    const error = new Error(`Katalog ${text(label) || listKey} zwrócił nieprawidłową odpowiedź.`)
    error.code = 'REFERENCE_DATA_RESPONSE_INVALID'
    throw error
  }
  if (rows.length > limit) {
    const error = new Error(`Katalog ${text(label) || listKey} przekroczył żądany rozmiar strony.`)
    error.code = 'REFERENCE_DATA_PAGE_OVERSIZED'
    throw error
  }
  return rows
}

export async function fetchAllReferenceRows({
  loadPage,
  listKey,
  keyFields,
  label,
  pageSize = REFERENCE_READ_PAGE_SIZE,
  maxRecords = REFERENCE_READ_MAX_RECORDS,
}) {
  if (typeof loadPage !== 'function') {
    throw new TypeError('loadPage musi być funkcją.')
  }

  const normalizedListKey = text(listKey)
  const normalizedKeyFields = (Array.isArray(keyFields) ? keyFields : [keyFields]).map(text).filter(Boolean)
  if (!normalizedListKey || !normalizedKeyFields.length) {
    throw new TypeError('listKey i keyFields są wymagane.')
  }

  const safePageSize = Math.min(
    normalizePositiveInteger(pageSize, REFERENCE_READ_PAGE_SIZE),
    REFERENCE_READ_PAGE_SIZE,
  )
  const safeMaxRecords = normalizePositiveInteger(maxRecords, REFERENCE_READ_MAX_RECORDS)
  const rowsByKey = new Map()
  let offset = 0

  while (offset < safeMaxRecords) {
    const limit = Math.min(safePageSize, safeMaxRecords - offset)
    const response = await loadPage({ limit, offset })
    const pageRows = pageRowsFromResponse(response, normalizedListKey, label, limit)

    for (const row of pageRows) {
      const key = rowKey(row, normalizedKeyFields)
      if (!key || key.split('\u001f').some((part) => !part)) {
        const error = new Error(`Katalog ${text(label) || normalizedListKey} zawiera rekord bez klucza.`)
        error.code = 'REFERENCE_DATA_KEY_MISSING'
        throw error
      }
      rowsByKey.set(key, row)
    }

    if (pageRows.length < limit) {
      return [...rowsByKey.values()]
    }

    offset += pageRows.length
  }

  const probeResponse = await loadPage({ limit: 1, offset })
  const probeRows = pageRowsFromResponse(probeResponse, normalizedListKey, label, 1)
  if (!probeRows.length) {
    return [...rowsByKey.values()]
  }

  throw createReferenceReadLimitError(label || normalizedListKey, safeMaxRecords)
}
