import {
  isScheduleStartOverdue,
  scheduleStartDelayMinutes,
} from '../../services/scheduleStartStatusPolicy.js'

export const OPERATIONAL_MAP_STATUS = Object.freeze({
  PLANNED: 'planned',
  ACTIVE: 'active',
  FINISHED: 'finished',
  LATE: 'late',
})

const FEMALE_GENDER_VALUES = new Set([
  'f',
  'female',
  'kobieta',
  'k',
  'woman',
  'zenska',
])

const MALE_GENDER_VALUES = new Set([
  'm',
  'male',
  'mezczyzna',
  'man',
  'meska',
])

const POLISH_MALE_FIRST_NAME_EXCEPTIONS = new Set([
  'barnaba',
  'bonawentura',
  'jarema',
  'kuba',
  'kosma',
])

const KNOWN_FEMALE_FIRST_NAMES = new Set([
  'agnieszka',
  'alicja',
  'aleksandra',
  'aneta',
  'anna',
  'barbara',
  'czeslawa',
  'ewa',
  'iwona',
  'jolanta',
  'justyna',
  'katarzyna',
  'mariola',
  'marta',
  'natalia',
  'nikola',
  'nina',
  'sabina',
  'wiola',
  'wioletta',
])

const KNOWN_MALE_FIRST_NAMES = new Set([
  ...POLISH_MALE_FIRST_NAME_EXCEPTIONS,
  'adam',
  'andrzej',
  'dariusz',
  'jan',
  'krzysztof',
  'marek',
  'marcin',
  'mariusz',
  'michal',
  'piotr',
  'rafal',
  'szymon',
  'tomasz',
])

function normalizeAvatarText(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function resolveOperationalMapAvatarKind(worker = {}) {
  const explicitGender = [
    worker?.gender,
    worker?.sex,
    worker?.plec,
    worker?.płeć,
  ]
    .map(normalizeAvatarText)
    .find(Boolean)

  if (FEMALE_GENDER_VALUES.has(explicitGender)) {
    return 'female'
  }
  if (MALE_GENDER_VALUES.has(explicitGender)) {
    return 'male'
  }

  const explicitFirstName = normalizeAvatarText(
    worker?.firstName ?? worker?.givenName,
  )
  const displayName = normalizeAvatarText(
    worker?.workerName ?? worker?.fullName ?? worker?.displayName ?? worker?.name,
  )
  const displayNameParts = displayName.split(/\s+/).filter(Boolean)
  const nameProbe = explicitFirstName || displayNameParts[0] || ''

  if (
    KNOWN_FEMALE_FIRST_NAMES.has(nameProbe) ||
    displayNameParts.some((part) => KNOWN_FEMALE_FIRST_NAMES.has(part))
  ) {
    return 'female'
  }
  if (
    KNOWN_MALE_FIRST_NAMES.has(nameProbe) ||
    displayNameParts.some((part) => KNOWN_MALE_FIRST_NAMES.has(part))
  ) {
    return 'male'
  }
  return nameProbe.endsWith('a') ? 'female' : 'male'
}

export function resolveOperationalMapStatus({
  plannedStartTs = 0,
  actualStartTs = 0,
  actualStopTs = 0,
  nowTs = Date.now(),
  hasExactExecutionMatch = false,
} = {}) {
  if (hasExactExecutionMatch && Number(actualStopTs) > 0) {
    return {
      status: OPERATIONAL_MAP_STATUS.FINISHED,
      delayMinutes: 0,
    }
  }

  if (hasExactExecutionMatch && Number(actualStartTs) > 0) {
    return {
      status: OPERATIONAL_MAP_STATUS.ACTIVE,
      delayMinutes: 0,
    }
  }

  if (isScheduleStartOverdue({ plannedStartTs, nowTs })) {
    return {
      status: OPERATIONAL_MAP_STATUS.LATE,
      delayMinutes: scheduleStartDelayMinutes(nowTs, plannedStartTs),
    }
  }

  return {
    status: OPERATIONAL_MAP_STATUS.PLANNED,
    delayMinutes: 0,
  }
}

export function operationalMapObjectKey(location = {}) {
  const clientId = String(location?.clientId ?? '').trim()
  return clientId ? `client:${clientId}` : ''
}

export function groupOperationalMapLocations(locations = []) {
  const groupsByKey = new Map()
  const standalone = []

  ;(Array.isArray(locations) ? locations : []).forEach((location) => {
    const key = operationalMapObjectKey(location)
    if (!key) {
      standalone.push(location)
      return
    }

    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, {
        key,
        clientId: String(location?.clientId ?? '').trim(),
        objectLabel: String(
          location?.plannedObjectLabel || location?.objectLabel || 'Obiekt bez nazwy',
        ).trim() || 'Obiekt bez nazwy',
        locations: [],
      })
    }
    groupsByKey.get(key).locations.push(location)
  })

  const groups = []
  groupsByKey.forEach((group) => {
    if (group.locations.length < 2) {
      standalone.push(...group.locations)
      return
    }
    groups.push(group)
  })

  return { groups, standalone }
}

export function buildOperationalMapObjectLiveSummary(locations = []) {
  const source = Array.isArray(locations) ? locations : []
  const statusCounts = {
    active: 0,
    planned: 0,
    finished: 0,
    late: 0,
  }
  const zoneStatuses = new Map()

  source.forEach((location) => {
    const status = Object.values(OPERATIONAL_MAP_STATUS).includes(location?.workStatus)
      ? location.workStatus
      : OPERATIONAL_MAP_STATUS.PLANNED
    statusCounts[status] += 1

    const zoneKey = String(location?.serviceBlockId ?? location?.zoneId ?? '').trim()
    if (!zoneKey) {
      return
    }
    if (!zoneStatuses.has(zoneKey)) {
      zoneStatuses.set(zoneKey, [])
    }
    zoneStatuses.get(zoneKey).push(status)
  })

  const zoneTotal = zoneStatuses.size
  const zoneDone = [...zoneStatuses.values()].filter(
    (statuses) =>
      statuses.length > 0 &&
      statuses.every((status) => status === OPERATIONAL_MAP_STATUS.FINISHED),
  ).length

  return {
    statusCounts,
    zoneTotal,
    zoneDone,
    objectProgress: zoneTotal > 0 ? Math.round((zoneDone / zoneTotal) * 100) : 0,
    zoneSummary: zoneTotal > 0 ? `${zoneDone}/${zoneTotal} stref` : 'Strefy: brak danych',
  }
}
