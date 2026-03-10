import { myOrganizations } from '@dataconnect/generated'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'

function mapRole(dcRole) {
  const normalized = String(dcRole ?? '')
    .trim()
    .toUpperCase()

  if (normalized === 'ADMIN' || normalized === 'OWNER' || normalized === 'SUPERADMIN') {
    return 'Admin'
  }

  if (normalized === 'MANAGER' || normalized === 'KIEROWNIK') {
    return 'Kierownik'
  }

  if (normalized === 'WORKER' || normalized === 'PRACOWNIK') {
    return 'Pracownik'
  }

  if (normalized === 'COORDINATOR' || normalized === 'KOORDYNATOR' || normalized === 'MEMBER') {
    return 'Koordynator'
  }

  if (normalized === 'INTERN' || normalized === 'STAZYSTA' || normalized === 'STAŻYSTA') {
    return 'Stazysta'
  }

  return 'Koordynator'
}

export async function getOrganizations() {
  if (!isFirebaseConfigured()) {
    throw new Error('Brak konfiguracji Firebase. Uzupelnij web-app/.env.')
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
