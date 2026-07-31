'use strict'

const { isValidPolishNip, normalizeNip, publicError } = require('./organization-onboarding')

const DEFAULT_ENDPOINT = 'https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000
const RATE_WINDOW_MS = 60 * 1000
const RATE_LIMIT = 10
const cache = new Map()
const rateBuckets = new Map()

function text(value) {
  return String(value ?? '').trim()
}

function escapeXml(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function decodeXml(value) {
  return text(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function tag(xml, name) {
  const match = new RegExp(`<(?:[A-Za-z0-9_]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?${name}>`, 'i').exec(xml)
  return match ? decodeXml(match[1]) : ''
}

function addressFromCompany(company) {
  const street = [company.street, company.buildingNumber && `${company.buildingNumber}${company.unitNumber ? `/${company.unitNumber}` : ''}`]
    .filter(Boolean)
    .join(' ')
  return [street, [company.postalCode, company.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')
}

/**
 * Maps the escaped BIR1 search payload to the public organization profile shape.
 * @param {string} xmlValue
 * @param {string} nip
 */
function parseCompanySearchResult(xmlValue, nip) {
  const xml = decodeXml(xmlValue)
  const company = {
    nip: tag(xml, 'Nip') || nip,
    regon: tag(xml, 'Regon'),
    legalName: tag(xml, 'Nazwa'),
    street: tag(xml, 'Ulica'),
    buildingNumber: tag(xml, 'NrNieruchomosci'),
    unitNumber: tag(xml, 'NrLokalu'),
    postalCode: tag(xml, 'KodPocztowy'),
    city: tag(xml, 'Miejscowosc'),
    countryCode: 'PL',
  }
  company.registeredAddress = addressFromCompany(company)
  if (!company.legalName) {
    throw publicError(404, 'COMPANY_NOT_FOUND', 'Nie znaleziono firmy dla podanego NIP.')
  }
  return company
}

function enforceRateLimit(key, now = Date.now()) {
  const bucketKey = text(key) || 'anonymous'
  const recent = (rateBuckets.get(bucketKey) || []).filter((timestamp) => now - timestamp < RATE_WINDOW_MS)
  if (recent.length >= RATE_LIMIT) {
    throw publicError(429, 'COMPANY_LOOKUP_RATE_LIMITED', 'Przekroczono limit wyszukiwań. Spróbuj ponownie za minutę.')
  }
  recent.push(now)
  rateBuckets.set(bucketKey, recent)
}

function soapEnvelope(body, sessionId = '') {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07">
  <soap:Header>${sessionId ? `<ns:sid>${escapeXml(sessionId)}</ns:sid>` : ''}</soap:Header>
  <soap:Body>${body}</soap:Body>
</soap:Envelope>`
}

async function postSoap(fetchImpl, endpoint, action, body, sessionId = '') {
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': `application/soap+xml; charset=utf-8; action="${action}"`,
      ...(sessionId ? { sid: sessionId } : {}),
    },
    body: soapEnvelope(body, sessionId),
    signal: AbortSignal.timeout(8000),
  })
  const responseText = await response.text()
  if (!response.ok) throw publicError(502, 'GUS_UNAVAILABLE', 'Usługa GUS jest chwilowo niedostępna.')
  return responseText
}

/**
 * Looks up a Polish company through server-side GUS BIR1 with cache and rate limiting.
 * @param {unknown} nipValue
 * @param {{apiKey?:string,endpoint?:string,fetchImpl?:Function,rateLimitKey?:string,now?:number}} options
 */
async function lookupCompanyByNip(nipValue, options = {}) {
  const nip = normalizeNip(nipValue)
  if (!isValidPolishNip(nip)) throw publicError(400, 'INVALID_NIP', 'Podaj poprawny polski NIP.')
  enforceRateLimit(options.rateLimitKey, options.now ?? Date.now())

  const cached = cache.get(nip)
  const now = Number(options.now ?? Date.now())
  if (cached && now - cached.storedAt < CACHE_TTL_MS) return { ...cached.company, cached: true }

  const apiKey = text(options.apiKey)
  const fetchImpl = options.fetchImpl || globalThis.fetch
  if (!apiKey) throw publicError(503, 'GUS_NOT_CONFIGURED', 'Wyszukiwanie GUS nie jest jeszcze skonfigurowane.')
  if (typeof fetchImpl !== 'function') throw publicError(503, 'GUS_UNAVAILABLE', 'Usługa GUS jest chwilowo niedostępna.')
  const endpoint = text(options.endpoint) || DEFAULT_ENDPOINT

  try {
    const loginXml = await postSoap(
      fetchImpl,
      endpoint,
      'http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Zaloguj',
      `<ns:Zaloguj><ns:pKluczUzytkownika>${escapeXml(apiKey)}</ns:pKluczUzytkownika></ns:Zaloguj>`,
    )
    const sessionId = tag(loginXml, 'ZalogujResult')
    if (!sessionId) throw publicError(502, 'GUS_AUTH_FAILED', 'Nie udało się uwierzytelnić w usłudze GUS.')
    const searchXml = await postSoap(
      fetchImpl,
      endpoint,
      'http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/DaneSzukajPodmioty',
      `<ns:DaneSzukajPodmioty><ns:pParametryWyszukiwania><ns:Nip>${nip}</ns:Nip></ns:pParametryWyszukiwania></ns:DaneSzukajPodmioty>`,
      sessionId,
    )
    const company = parseCompanySearchResult(tag(searchXml, 'DaneSzukajPodmiotyResult'), nip)
    cache.set(nip, { company, storedAt: now })
    return { ...company, cached: false }
  } catch (error) {
    if (error?.publicCode) throw error
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw publicError(504, 'GUS_TIMEOUT', 'Usługa GUS nie odpowiedziała na czas.')
    }
    throw publicError(502, 'GUS_UNAVAILABLE', 'Nie udało się pobrać danych firmy z GUS.')
  }
}

module.exports = {
  CACHE_TTL_MS,
  DEFAULT_ENDPOINT,
  RATE_LIMIT,
  enforceRateLimit,
  lookupCompanyByNip,
  parseCompanySearchResult,
}
