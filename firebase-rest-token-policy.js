'use strict'

function text(value) {
  return String(value ?? '').trim()
}

function normalizeEmail(value) {
  return text(value).toLowerCase()
}

function normalizeFirebaseAccountCreatedAt(value) {
  const raw = text(value)
  if (!raw) return ''
  const numericValue = Number(raw)
  const date = Number.isFinite(numericValue) && numericValue > 0
    ? new Date(numericValue)
    : new Date(raw)
  return Number.isFinite(date.getTime()) ? date.toISOString() : ''
}

function invalidIdToken() {
  const error = new Error('INVALID_ID_TOKEN')
  error.firebaseRestMessage = 'INVALID_ID_TOKEN'
  return error
}

function decodeJwtPayload(token) {
  const parts = text(token).split('.')
  if (parts.length !== 3 || !parts[1]) throw invalidIdToken()

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw invalidIdToken()
    return payload
  } catch (error) {
    if (error?.firebaseRestMessage === 'INVALID_ID_TOKEN') throw error
    throw invalidIdToken()
  }
}

function audienceMatches(audience, projectId) {
  if (Array.isArray(audience)) return audience.some((value) => text(value) === projectId)
  return text(audience) === projectId
}

// Identity Toolkit verifies the exact ID token before this function is called.
// We retain claims from that verified token, while account identity fields come
// from the trusted lookup response and must match the token payload.
function buildFirebaseRestDecodedToken({ token, lookupUser, projectId }) {
  const uid = text(lookupUser?.localId)
  const normalizedProjectId = text(projectId)
  if (!uid || !normalizedProjectId) throw invalidIdToken()

  const payload = decodeJwtPayload(token)
  const tokenUid = text(payload.uid ?? payload.user_id ?? payload.sub)
  if (!tokenUid || tokenUid !== uid) throw invalidIdToken()

  if (!audienceMatches(payload.aud, normalizedProjectId)) throw invalidIdToken()
  if (text(payload.iss) !== `https://securetoken.google.com/${normalizedProjectId}`) throw invalidIdToken()

  const lookupEmail = normalizeEmail(lookupUser?.email)
  const tokenEmail = normalizeEmail(payload.email)
  if (lookupEmail && tokenEmail && lookupEmail !== tokenEmail) throw invalidIdToken()

  return {
    ...payload,
    uid,
    user_id: uid,
    sub: uid,
    email: lookupEmail || tokenEmail,
    email_verified: lookupUser?.emailVerified === true,
    name: text(lookupUser?.displayName) || text(payload.name),
    account_created_at: normalizeFirebaseAccountCreatedAt(lookupUser?.createdAt),
  }
}

module.exports = {
  buildFirebaseRestDecodedToken,
  decodeJwtPayload,
  normalizeFirebaseAccountCreatedAt,
}
