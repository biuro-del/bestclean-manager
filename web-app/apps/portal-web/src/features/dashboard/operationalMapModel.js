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

const OPERATIONAL_MAP_TRUSTED_QR_GPS_ACTIONS = new Set([
  'START_GPS',
  'STOP_GPS',
  'CLEAN_START_GPS',
  'CLEAN_STOP_GPS',
])
const OPERATIONAL_MAP_QR_GPS_MAX_AGE_MS = 24 * 60 * 60 * 1000
const OPERATIONAL_MAP_QR_GPS_FUTURE_SKEW_MS = 5 * 60 * 1000
const OPERATIONAL_MAP_QR_GPS_MAX_SPREAD_METERS = 250

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

function operationalMapCoordinatePair(rawLat, rawLng) {
  const lat = Number(rawLat)
  const lng = Number(rawLng)
  const valid =
    rawLat !== null &&
    rawLat !== undefined &&
    rawLat !== '' &&
    rawLng !== null &&
    rawLng !== undefined &&
    rawLng !== '' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)

  return valid ? { lat, lng } : null
}

export function operationalMapStoredFacilityCoordinates(location = {}) {
  return operationalMapCoordinatePair(location?.plannedLat, location?.plannedLng)
}

function operationalMapDistanceMeters(left, right) {
  const earthRadiusMeters = 6371000
  const toRadians = (value) => (Number(value) * Math.PI) / 180
  const latDelta = toRadians(right.lat - left.lat)
  const lngDelta = toRadians(right.lng - left.lng)
  const leftLat = toRadians(left.lat)
  const rightLat = toRadians(right.lat)
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(lngDelta / 2) ** 2

  return 2 * earthRadiusMeters * Math.asin(Math.min(1, Math.sqrt(haversine)))
}

function operationalMapQrGpsEntry(location = {}, nowTs = Date.now()) {
  if (String(location?.positionKind ?? '').trim().toLowerCase() !== 'gps') {
    return null
  }

  if (location?.gpsTrustedSource !== true) {
    return null
  }

  const gpsAction = String(location?.gpsAction ?? '').trim().toUpperCase()
  if (!OPERATIONAL_MAP_TRUSTED_QR_GPS_ACTIONS.has(gpsAction)) {
    return null
  }

  const timestamp = Number(location?.gpsTimestamp ?? location?.positionTimestamp ?? 0)
  const ageMs = Number(nowTs) - timestamp
  if (
    !Number.isFinite(timestamp) ||
    timestamp <= 0 ||
    ageMs > OPERATIONAL_MAP_QR_GPS_MAX_AGE_MS ||
    ageMs < -OPERATIONAL_MAP_QR_GPS_FUTURE_SKEW_MS
  ) {
    return null
  }

  const coordinates = operationalMapCoordinatePair(location?.lat, location?.lng)
  return coordinates ? { ...coordinates, timestamp } : null
}

export function resolveOperationalMapGroupPoint(group = {}, options = {}) {
  const locations = Array.isArray(group?.locations) ? group.locations : []
  const storedCoordinates = locations
    .map((location) => operationalMapStoredFacilityCoordinates(location))
    .filter(Boolean)

  if (storedCoordinates.length) {
    return {
      lat: storedCoordinates.reduce((sum, point) => sum + point.lat, 0) / storedCoordinates.length,
      lng: storedCoordinates.reduce((sum, point) => sum + point.lng, 0) / storedCoordinates.length,
      source: 'stored-facility',
    }
  }

  const clientId = String(group?.clientId ?? locations[0]?.clientId ?? '').trim()
  const objectLabel = String(
    group?.objectLabel || locations[0]?.plannedObjectLabel || locations[0]?.objectLabel || '',
  ).trim()

  if (!clientId || !isOperationalMapRecognizedObjectLabel(objectLabel)) {
    return null
  }

  const nowTs = Number(options?.nowTs ?? Date.now())
  const liveCoordinates = locations
    .map((location) => operationalMapQrGpsEntry(location, nowTs))
    .filter(Boolean)

  if (!liveCoordinates.length) {
    return null
  }

  const centroid = {
    lat: liveCoordinates.reduce((sum, point) => sum + point.lat, 0) / liveCoordinates.length,
    lng: liveCoordinates.reduce((sum, point) => sum + point.lng, 0) / liveCoordinates.length,
  }
  const maxRadiusMeters = liveCoordinates.reduce(
    (maxDistance, point) => Math.max(maxDistance, operationalMapDistanceMeters(centroid, point)),
    0,
  )
  const maxSpreadMeters = liveCoordinates.reduce(
    (maxDistance, point, pointIndex) => Math.max(
      maxDistance,
      ...liveCoordinates
        .slice(pointIndex + 1)
        .map((otherPoint) => operationalMapDistanceMeters(point, otherPoint)),
    ),
    0,
  )
  if (maxSpreadMeters > OPERATIONAL_MAP_QR_GPS_MAX_SPREAD_METERS) {
    return null
  }

  return {
    ...centroid,
    source: liveCoordinates.length === 1 ? 'last-qr-gps' : 'last-qr-gps-centroid',
    sampleCount: liveCoordinates.length,
    latestTimestamp: Math.max(...liveCoordinates.map((point) => point.timestamp)),
    maxRadiusMeters,
    maxSpreadMeters,
  }
}

function operationalMapPreferredObjectLabel(location = {}) {
  const isLiveQrGps = String(location?.positionKind ?? '').trim().toLowerCase() === 'gps'
  return String(
    isLiveQrGps
      ? location?.objectLabel || location?.plannedObjectLabel || ''
      : location?.plannedObjectLabel || location?.objectLabel || '',
  ).trim()
}

function operationalMapObjectLabelSlug(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function isOperationalMapRecognizedObjectLabel(value) {
  const normalizedLabel = operationalMapObjectLabelSlug(value)
  return Boolean(
    normalizedLabel &&
      !normalizedLabel.startsWith('brak-obiektu') &&
      normalizedLabel !== 'obiekt-bez-nazwy' &&
      normalizedLabel !== 'zaplanowany-obiekt' &&
      normalizedLabel !== 'unknown' &&
      normalizedLabel !== 'unassigned' &&
      normalizedLabel !== 'nieprzypisany' &&
      !normalizedLabel.startsWith('qr-') &&
      !/^bc\d+$/.test(normalizedLabel)
  )
}

export function operationalMapObjectKey(location = {}) {
  const clientId = String(location?.clientId ?? '').trim()
  const objectLabel = operationalMapPreferredObjectLabel(location)
  if (!isOperationalMapRecognizedObjectLabel(objectLabel)) {
    return ''
  }

  const storedCoordinates = operationalMapStoredFacilityCoordinates(location)
  if (storedCoordinates) {
    const { lat, lng } = storedCoordinates
    return clientId
      ? `client:${clientId}:site:${lat.toFixed(5)},${lng.toFixed(5)}`
      : `site:${lat.toFixed(5)},${lng.toFixed(5)}:label:${operationalMapObjectLabelSlug(objectLabel)}`
  }

  if (!clientId) {
    return ''
  }

  const label = operationalMapObjectLabelSlug(objectLabel)

  return label ? `client:${clientId}:label:${label}` : `client:${clientId}`
}

export function groupOperationalMapLocations(locations = []) {
  const groupsByKey = new Map()
  const clientObjectBuckets = new Map()
  const standalone = []

  const addGroupLocation = (key, location, objectLabel = operationalMapPreferredObjectLabel(location)) => {
    if (!groupsByKey.has(key)) {
      groupsByKey.set(key, {
        key,
        clientId: String(location?.clientId ?? '').trim(),
        objectLabel: objectLabel || 'Obiekt bez nazwy',
        locations: [],
      })
    }
    groupsByKey.get(key).locations.push(location)
  }

  ;(Array.isArray(locations) ? locations : []).forEach((location) => {
    const clientId = String(location?.clientId ?? '').trim()
    const objectLabel = operationalMapPreferredObjectLabel(location)
    const labelSlug = operationalMapObjectLabelSlug(objectLabel)
    if (!clientId || !isOperationalMapRecognizedObjectLabel(objectLabel)) {
      const directKey = operationalMapObjectKey(location)
      if (directKey) {
        addGroupLocation(directKey, location, objectLabel)
      } else {
        standalone.push(location)
      }
      return
    }

    const identityKey = `client:${clientId}:label:${labelSlug}`
    if (!clientObjectBuckets.has(identityKey)) {
      clientObjectBuckets.set(identityKey, {
        clientId,
        objectLabel,
        locations: [],
      })
    }
    clientObjectBuckets.get(identityKey).locations.push(location)
  })

  clientObjectBuckets.forEach((bucket, identityKey) => {
    const storedCoordinateGroups = new Map()
    const locationsWithoutStoredCoordinates = []

    bucket.locations.forEach((location) => {
      const storedCoordinates = operationalMapStoredFacilityCoordinates(location)
      if (!storedCoordinates) {
        locationsWithoutStoredCoordinates.push(location)
        return
      }
      const coordinateKey = `${storedCoordinates.lat.toFixed(5)},${storedCoordinates.lng.toFixed(5)}`
      if (!storedCoordinateGroups.has(coordinateKey)) {
        storedCoordinateGroups.set(coordinateKey, [])
      }
      storedCoordinateGroups.get(coordinateKey).push(location)
    })

    if (!storedCoordinateGroups.size) {
      bucket.locations.forEach((location) => addGroupLocation(identityKey, location, bucket.objectLabel))
      return
    }

    if (storedCoordinateGroups.size === 1) {
      const [[coordinateKey, storedLocations]] = [...storedCoordinateGroups.entries()]
      const groupKey = `client:${bucket.clientId}:site:${coordinateKey}`
      ;[...storedLocations, ...locationsWithoutStoredCoordinates].forEach((location) =>
        addGroupLocation(groupKey, location, bucket.objectLabel),
      )
      return
    }

    storedCoordinateGroups.forEach((storedLocations, coordinateKey) => {
      const groupKey = `client:${bucket.clientId}:site:${coordinateKey}`
      storedLocations.forEach((location) => addGroupLocation(groupKey, location, bucket.objectLabel))
    })
    locationsWithoutStoredCoordinates.forEach((location) => {
      standalone.push(location)
    })
  })

  const groups = [...groupsByKey.values()]

  return { groups, standalone }
}

export function resolveOperationalMapObjectTone(locations = []) {
  const statuses = new Set(
    (Array.isArray(locations) ? locations : [])
      .map((location) => location?.workStatus)
      .filter((status) => Object.values(OPERATIONAL_MAP_STATUS).includes(status)),
  )

  if (statuses.has(OPERATIONAL_MAP_STATUS.LATE)) {
    return OPERATIONAL_MAP_STATUS.LATE
  }
  if (statuses.has(OPERATIONAL_MAP_STATUS.ACTIVE)) {
    return OPERATIONAL_MAP_STATUS.ACTIVE
  }
  return OPERATIONAL_MAP_STATUS.PLANNED
}

function normalizeOperationalMapSearchText(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('pl-PL')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function filterOperationalMapLocations(
  locations = [],
  { mode = 'active', query = '' } = {},
) {
  const normalizedMode = ['active', 'late', 'objects'].includes(mode)
    ? mode
    : 'active'
  const normalizedQuery = normalizeOperationalMapSearchText(query)

  return (Array.isArray(locations) ? locations : []).filter((location) => {
    const status = Object.values(OPERATIONAL_MAP_STATUS).includes(location?.workStatus)
      ? location.workStatus
      : OPERATIONAL_MAP_STATUS.PLANNED
    if (normalizedMode !== 'objects' && status !== normalizedMode) {
      return false
    }
    if (!normalizedQuery) {
      return true
    }

    return normalizeOperationalMapSearchText([
      location?.workerName,
      location?.workerKey,
      location?.workerId,
      location?.objectLabel,
      location?.plannedObjectLabel,
      location?.clientId,
    ].filter(Boolean).join(' ')).includes(normalizedQuery)
  })
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
