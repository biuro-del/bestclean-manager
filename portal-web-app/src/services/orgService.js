import { myOrganizations } from '@dataconnect/generated'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'

function mapRole(dcRole) {
  const normalized = String(dcRole ?? '').toUpperCase()
  if (normalized === 'ADMIN') {
    return 'Admin'
  }

  if (normalized === 'MANAGER') {
    return 'Kierownik'
  }

  if (normalized === 'WORKER') {
    return 'Pracownik'
  }

  return 'Koordynator'
}

export async function getOrganizations() {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupełnij web-app/.env.')
  }

  ensureFirebase()
  const response = await myOrganizations()
  const memberships = response?.data?.organizationMembers ?? []

  return memberships.map((membership) => ({
    id: membership.orgId,
    name: membership.organization?.name ?? membership.orgId,
    status: membership.organization?.status ?? 'ACTIVE',
    role: mapRole(membership.role),
  }))
}

export async function getOrg(orgId) {
  const organizations = await getOrganizations()
  return organizations.find((org) => org.id === orgId) ?? null
}

export async function updateOrg(orgId, payload) {
  return {
    orgId,
    ...payload,
  }
}