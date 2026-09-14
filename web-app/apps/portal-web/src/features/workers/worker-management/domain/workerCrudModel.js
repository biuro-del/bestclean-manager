import { normalizePolishPhoneE164 } from '../../../../utils/polishPhone.js'

export const WORKER_DEFAULT_ROLE = 'WORKER'
export const WORKER_DEFAULT_TYPE = 'Stały personel na obiekcie'

export const WORKER_ROLE_DESCRIPTIONS = Object.freeze({
  OWNER: 'Pełny dostęp. Rola wyłącznie dla założyciela organizacji i nie można jej zmienić.',
  ADMIN: 'Pełny dostęp: podgląd, dodawanie, edycja i usuwanie.',
  MANAGER: 'Może przeglądać, dodawać i edytować, ale nie może usuwać.',
  COORDINATOR: 'Może logować się do portalu wyłącznie w trybie podglądu.',
  WORKER: 'Dostęp wyłącznie do aplikacji mobilnej; bez dostępu do portalu.',
})

function normalizeComparableText(value) {
  return String(value ?? '')
    .trim()
    .replace(/[łŁ]/g, 'l')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function validationError(channel, message, focusId = '') {
  return {
    ok: false,
    error: {
      channel,
      message,
      focusId,
    },
  }
}

export function isWorkerOwner(worker = null) {
  const role = String(worker?.role ?? worker?.systemRole ?? '').trim().toUpperCase()
  return Boolean(worker?.isOwner || role === 'OWNER')
}

export function normalizeWorkerRole(value, { isOwner = false } = {}) {
  if (isOwner) return 'OWNER'
  const normalized = normalizeComparableText(value)
  if (normalized.includes('owner') || normalized.includes('wlasciciel')) return 'OWNER'
  if (normalized.includes('admin') || normalized.includes('superadmin')) return 'ADMIN'
  if (
    normalized.includes('manager') ||
    normalized.includes('menager') ||
    normalized.includes('menedzer') ||
    normalized.includes('kierownik')
  ) {
    return 'MANAGER'
  }
  if (
    normalized.includes('koordynator') ||
    normalized.includes('coordynator') ||
    normalized.includes('coordinator')
  ) {
    return 'COORDINATOR'
  }
  return WORKER_DEFAULT_ROLE
}

export function normalizeWorkerType(value, fallback = WORKER_DEFAULT_TYPE) {
  const normalized = normalizeComparableText(value)
  if (!normalized) return fallback
  if (normalized.includes('admin') || normalized.includes('owner') || normalized.includes('superadmin')) {
    return 'Administrator'
  }
  if (
    normalized.includes('biurow') ||
    normalized.includes('koordynator') ||
    normalized.includes('coordynator') ||
    normalized.includes('coordinator') ||
    normalized.includes('manager') ||
    normalized.includes('menager') ||
    normalized.includes('menedzer') ||
    normalized.includes('kierownik')
  ) {
    return 'Pracownik Biurowy'
  }
  if (normalized.includes('mobil') || normalized.includes('zespol')) return 'Zespół Mobilny'
  if (normalized.includes('staly') || normalized.includes('personel') || normalized.includes('obiekt')) {
    return WORKER_DEFAULT_TYPE
  }
  return fallback
}

export function normalizeWorkerEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function isValidWorkerEmail(value) {
  const email = normalizeWorkerEmail(value)
  return Boolean(email && email.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
}

export function currentWorkerLogin(worker = null) {
  return String(worker?.login ?? worker?.workerLogin ?? '').trim()
}

export function prepareWorkerSave({
  mode,
  currentWorker = null,
  form = {},
  photoDataUrl = '',
  removePhoto = false,
  canAdministerWorkers = false,
  canResetWorkerPasswords = false,
  canOverrideWorkerNumber = false,
} = {}) {
  const isAdding = mode === 'add'
  const currentLogin = isAdding ? '' : currentWorkerLogin(currentWorker)
  const rawPhone = String(form.phone ?? '').trim()
  const phone = rawPhone ? normalizePolishPhoneE164(rawPhone) : ''
  const payload = {
    workerId: String(form.workerId ?? '').trim(),
    name: String(form.name ?? '').trim(),
    role: normalizeWorkerRole(form.role, {
      isOwner: !isAdding && isWorkerOwner(currentWorker),
    }),
    workerType: normalizeWorkerType(form.workerType),
    active: Boolean(form.active),
    email: normalizeWorkerEmail(form.email),
    phone,
  }

  const normalizedPhotoDataUrl = String(photoDataUrl ?? '').trim()
  if (normalizedPhotoDataUrl) {
    payload.photoDataUrl = normalizedPhotoDataUrl
  } else if (removePhoto) {
    payload.removePhoto = true
    payload.photoUrl = ''
  }

  if (!isAdding && !currentLogin) {
    return validationError('alert', 'Brak danych pracownika do edycji.')
  }
  if (!payload.name) {
    return validationError('basic', 'Uzupełnij imię i nazwisko.', 'wkEditName')
  }
  if (!isValidWorkerEmail(payload.email)) {
    return validationError(
      'basic',
      'Podaj poprawny email, którym pracownik będzie się logował.',
      'wkEditEmail',
    )
  }
  if (isAdding && !rawPhone) {
    return validationError(
      'basic',
      'Podaj numer telefonu pracownika.',
      'wkEditPhone',
    )
  }
  if (rawPhone && !phone) {
    return validationError(
      'basic',
      'Podaj poprawny polski numer telefonu, np. +48664322028.',
      'wkEditPhone',
    )
  }
  if (payload.role !== WORKER_DEFAULT_ROLE && !canAdministerWorkers) {
    return validationError(
      'basic',
      'Tylko ADMIN albo OWNER może nadawać role portalowe.',
      'wkEditRole',
    )
  }

  const password = String(form.password ?? '').trim()
  const repeatedPassword = String(form.repeatedPassword ?? '').trim()
  let workerNumberOverride

  if (isAdding) {
    const rawWorkerNumber = String(form.workerNumber ?? '').trim()
    if (!/^[1-9]\d*$/.test(rawWorkerNumber)) {
      return validationError(
        'basic',
        'Numer ID pracownika musi być dodatnią liczbą całkowitą bez zer wiodących.',
        'wkEditNumber',
      )
    }
    payload.workerId = String(form.composedWorkerId ?? payload.workerId).trim()
    if (canOverrideWorkerNumber && form.workerNumberManual === true) {
      workerNumberOverride = Number(rawWorkerNumber)
    }
    if (!password || password.length < 6) {
      return validationError(
        'password',
        'Hasło tymczasowe musi mieć co najmniej 6 znaków.',
        'wkNewPass',
      )
    }
  }

  if (password || repeatedPassword) {
    if (password !== repeatedPassword) {
      return validationError('password', 'Hasła nie są takie same.', 'wkNewPass2')
    }
    if (!isAdding && !canResetWorkerPasswords) {
      return validationError('alert', 'Tylko Admin może resetować hasło pracownika.')
    }
    if (!isAdding && password.length < 6) {
      return validationError('password', 'Hasło musi mieć co najmniej 6 znaków.', 'wkNewPass')
    }
  }

  return {
    ok: true,
    isAdding,
    currentLogin,
    payload,
    password,
    workerNumberOverride,
  }
}

export function prepareWorkerDelete({ canDeleteWorkers = false, orgId = '', worker = null } = {}) {
  if (!canDeleteWorkers) {
    return validationError('alert', 'Brak uprawnień do usuwania pracownika.')
  }
  if (isWorkerOwner(worker)) {
    return validationError('alert', 'Nie można usunąć konta założyciela organizacji.')
  }
  const login = workerIdentityKey(worker)
  if (!String(orgId ?? '').trim() || !login) {
    return validationError('alert', 'Brak organizacji albo danych pracownika do usunięcia.')
  }
  return {
    ok: true,
    orgId: String(orgId).trim(),
    login,
    worker,
  }
}

export function workerIdentityKey(worker = null) {
  return String(worker?.login ?? worker?.workerLogin ?? worker?.workerId ?? worker?.id ?? '').trim()
}

export function normalizeWorkerIdentity(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function addWorkerIdentityKey(keys, value) {
  const key = normalizeWorkerIdentity(value)
  if (!key) return keys
  keys.add(key)
  if (key.includes('@')) keys.add(key.split('@')[0])
  return keys
}

export function workerIdentityKeys(worker = null) {
  const keys = new Set()
  ;[
    worker?.login,
    worker?.workerLogin,
    worker?.workerId,
    worker?.id,
    ...(Array.isArray(worker?._workerProfileOptimisticKeys) ? worker._workerProfileOptimisticKeys : []),
  ].forEach((value) => addWorkerIdentityKey(keys, value))
  return keys
}
