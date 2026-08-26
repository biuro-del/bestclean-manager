import { warsawBusinessDateKey } from '../workers/workIntervals.js'

const BUSINESS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Resolves the canonical business day for reports. A stored correction always
 * wins over timestamps; legacy rows are derived in Europe/Warsaw.
 */
export function reportBusinessDateYmd(item = {}) {
  const source = item && typeof item === 'object' ? item : {}
  const canonicalCandidates = [
    source.businessDateYmd,
    source.business_date_ymd,
  ]
  for (const candidate of canonicalCandidates) {
    const value = String(candidate ?? '').trim()
    if (BUSINESS_DATE_RE.test(value)) return value
  }

  const timestampCandidates = [
    source.startAt,
    source.endAt,
    source.dayStartAt,
    source.dayEndAt,
  ]
  for (const candidate of timestampCandidates) {
    const dayKey = warsawBusinessDateKey(candidate)
    if (dayKey) return dayKey
  }

  const legacyCandidates = [source.dateYmd, source.date_ymd, source.dayKey]
  for (const candidate of legacyCandidates) {
    const value = String(candidate ?? '').trim()
    if (BUSINESS_DATE_RE.test(value)) return value
  }

  return ''
}
