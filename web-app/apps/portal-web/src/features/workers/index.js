export const section = 'workers'
export const routes = ['workerTime', 'workerTimeDetail', 'workerProfile', 'workerAccount']

export function workerBooleanValue(rawValue) {
  const value = String(rawValue ?? '')
    .trim()
    .toLowerCase()

  if (!value) {
    return null
  }

  if (value === '1' || value === 'true' || value === 'tak' || value === 'yes') {
    return true
  }

  if (value === '0' || value === 'false' || value === 'nie' || value === 'no') {
    return false
  }

  return null
}

export function workerBoolLabel(value) {
  return value ? 'TAK' : 'NIE'
}
