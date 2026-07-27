function normalizedText(value) {
  return String(value ?? '').trim()
}

function normalizedIso(value) {
  const raw = normalizedText(value)
  if (!raw) {
    return ''
  }

  const timestamp = new Date(raw).getTime()
  if (!Number.isFinite(timestamp)) {
    return ''
  }

  return new Date(timestamp).toISOString()
}

export function preserveUnchangedEventTimestamp({
  inputValue,
  parsedInputTimestamp,
  originalTimestamp,
  formattedOriginalValue,
}) {
  const parsed = normalizedIso(parsedInputTimestamp)
  const original = normalizedIso(originalTimestamp)
  if (
    original &&
    normalizedText(inputValue) === normalizedText(formattedOriginalValue)
  ) {
    return original
  }

  return parsed
}
