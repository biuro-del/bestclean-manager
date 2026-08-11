export const WORKDAY_READ_MAX_RECORDS = 20000
export const WORKDAY_READ_MAX_CHUNK_SIZE = 250
export const WORKDAY_READ_DEFAULT_PAGE_SIZE = 50

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

export function createPagedReadLimitError(sourceLabel = 'danych') {
  const error = new Error(
    `Nie można bezpiecznie pobrać kompletnego zakresu ${sourceLabel}: odczyt przekracza limit ${WORKDAY_READ_MAX_RECORDS} rekordów. Zawęź daty lub filtry.`,
  )
  error.code = 'PAGED_READ_LIMIT_EXCEEDED'
  return error
}

export function createPagedReadUnavailableError(sourceLabel = 'danych') {
  const error = new Error(
    `Kosztowo bezpieczny odczyt ${sourceLabel} jest niedostępny. Pełny odczyt całej organizacji został zablokowany; wymagana jest paginowana operacja Data Connect.`,
  )
  error.code = 'PAGED_READ_UNAVAILABLE'
  return error
}

export function createPagedReadIncompleteError(sourceLabel = 'danych') {
  const error = new Error(
    `Nie mozna bezpiecznie pokazac kompletnego zakresu ${sourceLabel}: odpowiedz zawiera kolejna strone. Zawez daty lub filtry.`,
  )
  error.code = 'PAGED_READ_INCOMPLETE'
  return error
}

export function assertCompletePagedResponse(response, sourceLabel = 'danych') {
  if (response?.hasNext === true) {
    throw createPagedReadIncompleteError(sourceLabel)
  }
  return response
}

export function assertWorkdayReadWindow(filters = {}, sourceLabel = 'danych') {
  const page = positiveInteger(filters.page, 1)
  const pageSize = positiveInteger(filters.pageSize, WORKDAY_READ_DEFAULT_PAGE_SIZE)
  const pageOffset = (page - 1) * pageSize
  const windowEnd = pageOffset + pageSize

  if (pageSize > WORKDAY_READ_MAX_RECORDS || windowEnd > WORKDAY_READ_MAX_RECORDS) {
    throw createPagedReadLimitError(sourceLabel)
  }

  return {
    page,
    pageSize,
    pageOffset,
    windowEnd,
  }
}

export function isPagedReadSafetyError(error) {
  return (
    error?.code === 'PAGED_READ_LIMIT_EXCEEDED' ||
    error?.code === 'PAGED_READ_UNAVAILABLE' ||
    error?.code === 'PAGED_READ_INCOMPLETE'
  )
}
