'use strict'

const ACCOUNT_LINKING_REQUIRED = 'ACCOUNT_LINKING_REQUIRED'
const ACCOUNT_LINKING_REVIEW_REQUIRED = 'ACCOUNT_LINKING_REVIEW_REQUIRED'

function text(value) {
  return String(value ?? '').trim()
}

function email(value) {
  const normalized = text(value).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && normalized.length <= 160
    ? normalized
    : ''
}

function verifiedIdentity(decodedToken = {}) {
  const uid = text(decodedToken.uid || decodedToken.user_id || decodedToken.sub)
  const verifiedEmail = decodedToken.email_verified === true ? email(decodedToken.email) : ''
  return uid && verifiedEmail ? { uid, email: verifiedEmail } : null
}

async function findAccountLinkingCandidates(client, decodedToken = {}) {
  const identity = verifiedIdentity(decodedToken)
  if (!identity) return []

  const result = await client.query(
    `select distinct
       m.uid as canonical_uid,
       m.org_id,
       m.worker_id,
       m.role
     from public.organization_member m
     join public.organizations o
       on o.org_id = m.org_id
     join public.worker w
       on w.org_id = m.org_id
      and w.worker_id = m.worker_id
      and w.auth_uid = m.uid
    where m.status = 'ACTIVE'
      and m.uid <> $1::text
      and o.deleted_at is null
      and w.active is true
      and upper(coalesce(w.status, 'ACTIVE')) <> 'DELETED'
      and upper(coalesce(m.role, '')) not in ('WORKER', 'PRACOWNIK', 'INTERN', 'STAZYSTA', 'STAŻYSTA')
      and (
        lower(btrim(coalesce(w.login_email, ''))) = $2::text
        or lower(btrim(coalesce(w.email, ''))) = $2::text
      )
    order by m.uid asc, m.org_id asc, m.worker_id asc`,
    [identity.uid, identity.email],
  )
  return Array.isArray(result?.rows) ? result.rows : []
}

function resolveAccountLinkingRequirement(rows = []) {
  const canonicalUids = [...new Set(
    (Array.isArray(rows) ? rows : [])
      .map((row) => text(row?.canonical_uid))
      .filter(Boolean),
  )]

  if (!canonicalUids.length) return null
  if (canonicalUids.length === 1) {
    return { status: ACCOUNT_LINKING_REQUIRED, candidateCount: 1 }
  }
  return { status: ACCOUNT_LINKING_REVIEW_REQUIRED, candidateCount: canonicalUids.length }
}

async function getAccountLinkingRequirement(client, decodedToken = {}) {
  return resolveAccountLinkingRequirement(await findAccountLinkingCandidates(client, decodedToken))
}

class AccountLinkingError extends Error {
  constructor(requirement) {
    const review = requirement?.status === ACCOUNT_LINKING_REVIEW_REQUIRED
    super(review
      ? 'Dla tego adresu znaleziono więcej niż jedno istniejące konto. Rejestracja nowej firmy została zablokowana do czasu bezpiecznej weryfikacji.'
      : 'Ten adres e-mail należy już do istniejącego konta organizacji. Zaloguj się dotychczasową metodą, aby bezpiecznie połączyć logowanie Google.')
    this.name = 'AccountLinkingError'
    this.code = review ? ACCOUNT_LINKING_REVIEW_REQUIRED : ACCOUNT_LINKING_REQUIRED
    this.statusCode = 409
  }
}

async function assertNoAccountLinkingRequired(client, decodedToken = {}) {
  const requirement = await getAccountLinkingRequirement(client, decodedToken)
  if (requirement) throw new AccountLinkingError(requirement)
}

module.exports = {
  ACCOUNT_LINKING_REQUIRED,
  ACCOUNT_LINKING_REVIEW_REQUIRED,
  AccountLinkingError,
  assertNoAccountLinkingRequired,
  findAccountLinkingCandidates,
  getAccountLinkingRequirement,
  resolveAccountLinkingRequirement,
  verifiedIdentity,
}
