import { myOrganizations } from '@dataconnect/generated'
import { ensureFirebase, isFirebaseConfigured } from '../firebase/firebaseClient'

function mapRole(dcRole) {
  const normalized = String(dcRole ?? '')
    .trim()
    .toUpperCase()

  if (normalized === 'OWNER') {
    return 'Owner'
  }

  if (normalized === 'ADMIN' || normalized === 'SUPERADMIN') {
    return 'Admin'
  }

  if (normalized === 'MANAGER' || normalized === 'KIEROWNIK') {
    return 'Manager'
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

  const dataConnect = ensureFirebase()?.dataConnect
  if (!dataConnect) throw new Error('Brak konfiguracji Data Connect. Uzupełnij zmienne VITE_DATACONNECT_*.')
  const response = await myOrganizations(dataConnect)
  const memberships = response?.data?.organizationMembers ?? []

  return memberships
    .map((membership) => ({
      id: membership.orgId,
      name: String(membership.organization?.name ?? '').trim(),
      status: membership.organization?.status ?? null,
      role: mapRole(membership.role),
    }))
    .filter((organization) => organization.id && organization.name)
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
