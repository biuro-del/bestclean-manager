const A4_PORTRAIT_MM = Object.freeze({ width: 210, height: 297 })
const A4_LANDSCAPE_MM = Object.freeze({ width: 297, height: 210 })
const DEFAULT_LABEL_SIZE_MM = 40
const DEFAULT_LABEL_SAFE_MARGIN_MM = 5
const DEFAULT_TIME_POSTER_FORMAT = 'A4_HALF'
const COMPACT_TIME_POSTER_MM = Object.freeze({ width: 100, height: 120 })

function text(value) {
  return String(value ?? '').trim()
}

export function normalizeZoneQrFunction(value) {
  const functionName = text(value).toUpperCase()
  if (functionName === 'START') return 'START'
  if (functionName.startsWith('STOP')) return functionName
  if (functionName === 'STREFA_SPECJALNA') return 'STREFA_SPECJALNA'
  return 'CLEAN'
}

export function normalizeZoneQrTimeFormat(value) {
  return text(value).toUpperCase() === '100X120' ? '100X120' : DEFAULT_TIME_POSTER_FORMAT
}

export function normalizeZoneQrLabelSize(value) {
  return Number(value) === 25 ? 25 : DEFAULT_LABEL_SIZE_MM
}

export function isZoneQrTimeFunction(value) {
  const functionName = normalizeZoneQrFunction(value)
  return functionName === 'START' || functionName.startsWith('STOP')
}

function chunks(items, size) {
  const pages = []
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size))
  }
  return pages
}

function functionLabel(codes) {
  const functions = [...new Set(codes.map((code) => normalizeZoneQrFunction(code?.function)))]
  return functions.join(' + ')
}

export function calculateZoneQrItemGrid({
  pageWidthMm = A4_PORTRAIT_MM.width,
  pageHeightMm = A4_PORTRAIT_MM.height,
  itemWidthMm,
  itemHeightMm,
  safeMarginMm = DEFAULT_LABEL_SAFE_MARGIN_MM,
} = {}) {
  const normalizedItemWidth = Number(itemWidthMm) > 0 ? Number(itemWidthMm) : DEFAULT_LABEL_SIZE_MM
  const normalizedItemHeight = Number(itemHeightMm) > 0 ? Number(itemHeightMm) : normalizedItemWidth
  const normalizedSafeMargin = Math.max(0, Number(safeMarginMm) || 0)
  const availableWidthMm = Math.max(0, pageWidthMm - (normalizedSafeMargin * 2))
  const availableHeightMm = Math.max(0, pageHeightMm - (normalizedSafeMargin * 2))
  const columns = Math.max(1, Math.floor(availableWidthMm / normalizedItemWidth))
  const rows = Math.max(1, Math.floor(availableHeightMm / normalizedItemHeight))
  const gridWidthMm = columns * normalizedItemWidth
  const gridHeightMm = rows * normalizedItemHeight

  return Object.freeze({
    pageWidthMm,
    pageHeightMm,
    itemWidthMm: normalizedItemWidth,
    itemHeightMm: normalizedItemHeight,
    labelSizeMm: normalizedItemWidth === normalizedItemHeight ? normalizedItemWidth : undefined,
    safeMarginMm: normalizedSafeMargin,
    columns,
    rows,
    capacity: columns * rows,
    gridWidthMm,
    gridHeightMm,
    marginLeftMm: (pageWidthMm - gridWidthMm) / 2,
    marginTopMm: (pageHeightMm - gridHeightMm) / 2,
  })
}

export function calculateZoneQrLabelGrid({
  pageWidthMm = A4_PORTRAIT_MM.width,
  pageHeightMm = A4_PORTRAIT_MM.height,
  labelSizeMm = DEFAULT_LABEL_SIZE_MM,
  safeMarginMm = DEFAULT_LABEL_SAFE_MARGIN_MM,
} = {}) {
  const normalizedLabelSize = normalizeZoneQrLabelSize(labelSizeMm)
  return calculateZoneQrItemGrid({
    pageWidthMm,
    pageHeightMm,
    itemWidthMm: normalizedLabelSize,
    itemHeightMm: normalizedLabelSize,
    safeMarginMm,
  })
}

function timeFormatDefinition(value) {
  const format = normalizeZoneQrTimeFormat(value)
  if (format === '100X120') {
    const grid = calculateZoneQrItemGrid({
      itemWidthMm: COMPACT_TIME_POSTER_MM.width,
      itemHeightMm: COMPACT_TIME_POSTER_MM.height,
      safeMarginMm: DEFAULT_LABEL_SAFE_MARGIN_MM,
    })
    return {
      format,
      orientation: 'portrait',
      formatLabel: 'A4 pionowo',
      layoutLabel: 'Plakaty START/STOP 100 × 120 mm',
      capacityLabel: `${grid.capacity} plakaty na stronę`,
      grid,
    }
  }

  const grid = Object.freeze({
    pageWidthMm: A4_LANDSCAPE_MM.width,
    pageHeightMm: A4_LANDSCAPE_MM.height,
    itemWidthMm: A4_LANDSCAPE_MM.width / 2,
    itemHeightMm: A4_LANDSCAPE_MM.height,
    safeMarginMm: 0,
    columns: 2,
    rows: 1,
    capacity: 2,
    gridWidthMm: A4_LANDSCAPE_MM.width,
    gridHeightMm: A4_LANDSCAPE_MM.height,
    marginLeftMm: 0,
    marginTopMm: 0,
  })
  return {
    format,
    orientation: 'landscape',
    formatLabel: 'A4 poziomo',
    layoutLabel: 'Duże plakaty START/STOP',
    capacityLabel: '2 plakaty na stronę',
    grid,
  }
}

function timePages(codes, timeFormat) {
  const definition = timeFormatDefinition(timeFormat)
  return chunks(codes, definition.grid.capacity).map((pageCodes) => ({
    kind: 'TIME_POSTERS',
    timeFormat: definition.format,
    orientation: definition.orientation,
    formatLabel: definition.formatLabel,
    layoutLabel: definition.layoutLabel,
    capacity: definition.grid.capacity,
    capacityLabel: definition.capacityLabel,
    codeCount: pageCodes.length,
    functionLabel: functionLabel(pageCodes),
    codes: pageCodes,
    grid: definition.grid,
  }))
}

function labelPages(codes, grid) {
  return chunks(codes, grid.capacity).map((pageCodes) => ({
    kind: 'ZONE_LABELS',
    orientation: 'portrait',
    formatLabel: 'A4 pionowo',
    layoutLabel: `Etykiety ${grid.labelSizeMm} × ${grid.labelSizeMm} mm`,
    capacity: grid.capacity,
    capacityLabel: `${grid.capacity} etykiet na stronę`,
    codeCount: pageCodes.length,
    functionLabel: functionLabel(pageCodes),
    codes: pageCodes,
    grid,
  }))
}

export function createZoneQrPrintLayout(codes, options = {}) {
  const normalizedCodes = (Array.isArray(codes) ? codes : []).filter(Boolean)
  const timeCodes = normalizedCodes.filter((code) => isZoneQrTimeFunction(code?.function))
  const zoneCodes = normalizedCodes.filter((code) => !isZoneQrTimeFunction(code?.function))
  const timeDefinition = timeFormatDefinition(options.timePosterFormat)
  const labelGrid = calculateZoneQrLabelGrid(options)
  const pages = [
    ...timePages(timeCodes, timeDefinition.format),
    ...labelPages(zoneCodes, labelGrid),
  ].map((page, index, list) => ({
    ...page,
    pageNumber: index + 1,
    totalPages: list.length,
  }))

  return Object.freeze({
    pages,
    totalPages: pages.length,
    totalCodes: normalizedCodes.length,
    timeCodeCount: timeCodes.length,
    zoneCodeCount: zoneCodes.length,
    timePageCount: Math.ceil(timeCodes.length / timeDefinition.grid.capacity),
    zonePageCount: Math.ceil(zoneCodes.length / labelGrid.capacity),
    timeCapacity: timeDefinition.grid.capacity,
    timePosterFormat: timeDefinition.format,
    timeGrid: timeDefinition.grid,
    labelGrid,
    isMixed: timeCodes.length > 0 && zoneCodes.length > 0,
  })
}

export function zoneQrPageMeta(page, totalPages = page?.totalPages ?? 0) {
  if (!page) {
    return {
      pageLabel: 'Strona 0 z 0',
      formatLabel: 'A4',
      layoutLabel: 'Wybierz funkcję kodu',
      capacityLabel: '-',
      totalPagesLabel: '0',
    }
  }

  return {
    pageLabel: `Strona ${page.pageNumber} z ${totalPages}${page.functionLabel ? ` - ${page.functionLabel}` : ''}`,
    formatLabel: page.formatLabel,
    layoutLabel: page.layoutLabel,
    capacityLabel: page.capacityLabel,
    totalPagesLabel: String(totalPages),
  }
}

export const ZONE_QR_LAYOUT_DEFAULTS = Object.freeze({
  a4: A4_PORTRAIT_MM,
  labelSizesMm: Object.freeze([40, 25]),
  labelSizeMm: DEFAULT_LABEL_SIZE_MM,
  labelSafeMarginMm: DEFAULT_LABEL_SAFE_MARGIN_MM,
  timePosterFormat: DEFAULT_TIME_POSTER_FORMAT,
  compactTimePosterMm: COMPACT_TIME_POSTER_MM,
})
