export const PRODUCTION_FIREBASE_PROJECT_ID = 'iclean-room'

function normalize(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function resolveAuthEmailDeliveryPolicy({ projectId, mode } = {}) {
  const normalizedProjectId = normalize(projectId)
  const normalizedMode = normalize(mode)

  if (normalizedMode === 'disabled') {
    return Object.freeze({ allowed: false, code: 'AUTH_EMAIL_DELIVERY_DISABLED' })
  }
  if (normalizedProjectId === PRODUCTION_FIREBASE_PROJECT_ID) {
    return Object.freeze({ allowed: true, code: 'AUTH_EMAIL_DELIVERY_ALLOWED_PRODUCTION' })
  }
  if (normalizedMode === 'firebase-test-explicit') {
    return Object.freeze({ allowed: true, code: 'AUTH_EMAIL_DELIVERY_ALLOWED_TEST_EXPLICIT' })
  }
  return Object.freeze({ allowed: false, code: 'AUTH_EMAIL_TEST_DELIVERY_BLOCKED' })
}
