import {
  createZoneQrPrintLayout,
  normalizeZoneQrFunction,
} from './qrLayout.js'
import qrEncoder from 'pdfmake/src/qrEnc.js'

const POINTS_PER_MM = 72 / 25.4
const PDF_FONT_FAMILY = 'Roboto'
const QR_QUIET_ZONE_MODULES = 4
const QR_SVG_SOURCE_FIT = 1000

const TIME_POSTER_METRICS = Object.freeze({
  A4_HALF: Object.freeze({
    cellMargin: [16, 15, 16, 12],
    contentWidth: ((297 / 2) * POINTS_PER_MM) - 32,
    logoFit: [104, 36],
    logoMarginBottom: 11,
    headerHeight: 58,
    headerTextTop: 12,
    titleFontSize: 17,
    subtitleFontSize: 8.5,
    headerMarginBottom: 14,
    qrFit: 228,
    idFontSize: 12,
    assignmentFontSize: 9,
    assignmentMarginBottom: 10,
    instructionFontSize: 11.5,
    instructionCellMargin: [12, 9, 12, 9],
  }),
  '100X120': Object.freeze({
    cellMargin: [10, 8, 10, 7],
    contentWidth: (100 * POINTS_PER_MM) - 20,
    logoFit: [72, 24],
    logoMarginBottom: 5,
    headerHeight: 40,
    headerTextTop: 8,
    titleFontSize: 12,
    subtitleFontSize: 6.2,
    headerMarginBottom: 7,
    qrFit: 126,
    idFontSize: 7.5,
    assignmentFontSize: 6.2,
    assignmentMarginBottom: 5,
    instructionFontSize: 7.2,
    instructionCellMargin: [7, 5, 7, 5],
  }),
})

let pdfMakePromise = null
let logoSvgPromise = null

function text(value) {
  return String(value ?? '').trim()
}

function functionMeta(value) {
  const functionName = normalizeZoneQrFunction(value)
  if (functionName === 'START') {
    return {
      functionName,
      title: 'START CZASU PRACY',
      subtitle: 'Rozpoczęcie czasu pracy',
      color: '#109886',
      scanLabel: 'START',
    }
  }
  if (functionName.startsWith('STOP')) {
    return {
      functionName,
      title: `${functionName} CZASU PRACY`,
      subtitle: 'Zakończenie czasu pracy',
      color: '#DF4D59',
      scanLabel: functionName,
    }
  }
  return {
    functionName,
    title: functionName === 'STREFA_SPECJALNA' ? 'STREFA SPECJALNA' : 'STREFA CLEAN',
    color: functionName === 'STREFA_SPECJALNA' ? '#7658C8' : '#178A79',
  }
}

async function loadFontVfs() {
  const module = await import('pdfmake/build/vfs_fonts.js')
  const vfs = module?.default ?? module?.pdfMake?.vfs ?? module?.vfs ?? module
  if (!vfs || typeof vfs !== 'object') {
    throw new Error('Nie udało się przygotować fontów PDF.')
  }
  return vfs
}

export async function ensureZoneQrPdfMake() {
  if (!pdfMakePromise) {
    pdfMakePromise = Promise.all([import('pdfmake/build/pdfmake.js'), loadFontVfs()]).then(([module, vfs]) => {
      const pdfMake = module?.default ?? module?.pdfMake ?? module
      if (!pdfMake || typeof pdfMake.createPdf !== 'function') {
        throw new Error('Biblioteka PDF nie jest dostępna.')
      }
      if (typeof pdfMake.addVirtualFileSystem === 'function') {
        pdfMake.addVirtualFileSystem(vfs)
      } else {
        pdfMake.vfs = vfs
      }
      return pdfMake
    })
  }
  return pdfMakePromise
}

export async function loadCleanziLogoSvg() {
  if (!logoSvgPromise) {
    logoSvgPromise = fetch('/cleanzi-logo.svg', { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error('Nie udało się wczytać logo Cleanzi.')
        return response.text()
      })
      .then((svg) => {
        if (!/<svg[\s>]/i.test(svg)) throw new Error('Plik logo Cleanzi jest niepoprawny.')
        return svg
      })
  }
  return logoSvgPromise
}

function zoneCodeId(code) {
  return text(code?.zoneId ?? code?.id ?? code?.qr) || 'QRC_podglad_Z_PREVIEW'
}

function assignmentLines(code) {
  const clientName = text(code?.clientName)
  const clientId = text(code?.clientId)
  const zoneName = text(code?.zone ?? code?.name)
  if (!clientName && !clientId && !zoneName) return ['Nieprzypisany']
  return [
    `Klient: ${clientName || clientId || 'Nieprzypisany'}`,
    `Strefa: ${zoneName || 'Nieprzypisany'}`,
  ]
}

function noBordersLayout() {
  return {
    hLineWidth: () => 0,
    vLineWidth: () => 0,
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  }
}

export function createZoneQrSvg(value) {
  const qrValue = text(value)
  if (!qrValue) throw new Error('Brak identyfikatora kodu QR.')
  const measured = qrEncoder.measure({
    qr: qrValue,
    eccLevel: 'H',
    fit: QR_SVG_SOURCE_FIT,
    padding: QR_QUIET_ZONE_MODULES,
    foreground: '#000000',
    background: '#FFFFFF',
  })
  const size = Number(measured?._width) || QR_SVG_SOURCE_FIT
  const rectangles = (Array.isArray(measured?._canvas) ? measured._canvas : [])
    .filter((shape) => shape?.type === 'rect')
    .map((shape) => (
      `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" fill="${shape.color || '#000000'}"/>`
    ))
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${rectangles}</svg>`
}

function timePosterHeader(code, logoSvg, metrics) {
  const meta = functionMeta(code?.function)
  const headerHeight = metrics.headerHeight
  return {
    stack: [
      {
        svg: logoSvg,
        fit: metrics.logoFit,
        alignment: 'center',
        margin: [0, 0, 0, metrics.logoMarginBottom],
      },
      {
        stack: [
          {
            canvas: [{
              type: 'rect',
              x: 0,
              y: 0,
              w: metrics.contentWidth,
              h: headerHeight,
              color: meta.color,
            }],
          },
          {
            width: metrics.contentWidth,
            margin: [8, -headerHeight + metrics.headerTextTop, 8, 7],
            stack: [
              {
                text: meta.title,
                color: '#FFFFFF',
                bold: true,
                fontSize: metrics.titleFontSize,
                alignment: 'center',
                characterSpacing: 0.25,
              },
              {
                text: meta.subtitle,
                color: '#FFFFFF',
                fontSize: metrics.subtitleFontSize,
                alignment: 'center',
                margin: [0, 3, 0, 0],
              },
            ],
          },
        ],
      },
    ],
    margin: [0, 0, 0, metrics.headerMarginBottom],
  }
}

function timePosterInstructions(code, metrics) {
  const meta = functionMeta(code?.function)
  return {
    table: {
      widths: ['*'],
      body: [[{
        fillColor: '#F3F8F7',
        margin: metrics.instructionCellMargin,
        stack: [
          { text: 'Wejdź do aplikacji mobilnej.', margin: [0, 0, 0, 4] },
          { text: 'Zaloguj się.', margin: [0, 0, 0, 4] },
          { text: `Zeskanuj kod ${meta.scanLabel}.`, bold: true },
        ],
        alignment: 'center',
        color: '#173956',
        fontSize: metrics.instructionFontSize,
        lineHeight: 1.12,
      }]],
    },
    layout: {
      hLineColor: () => '#A9D5CE',
      vLineColor: () => '#A9D5CE',
      hLineWidth: () => 0.7,
      vLineWidth: () => 0.7,
    },
    unbreakable: true,
  }
}

function timePosterCell(code, logoSvg, metrics) {
  if (!code) return { text: '', fillColor: '#FFFFFF' }
  const zoneId = zoneCodeId(code)
  return {
    fillColor: '#FFFFFF',
    margin: metrics.cellMargin,
    stack: [
      timePosterHeader(code, logoSvg, metrics),
      {
        svg: createZoneQrSvg(zoneId),
        fit: [metrics.qrFit, metrics.qrFit],
        alignment: 'center',
        margin: [0, 0, 0, metrics === TIME_POSTER_METRICS.A4_HALF ? 7 : 3],
      },
      {
        text: zoneId,
        fontSize: metrics.idFontSize,
        bold: true,
        color: '#071B3E',
        alignment: 'center',
        margin: [0, 0, 0, 4],
      },
      {
        text: assignmentLines(code).join('\n'),
        fontSize: metrics.assignmentFontSize,
        lineHeight: 1.1,
        color: '#4A607F',
        alignment: 'center',
        margin: [0, 0, 0, metrics.assignmentMarginBottom],
      },
      timePosterInstructions(code, metrics),
    ],
  }
}

function timePosterPageNode(page, logoSvg) {
  const { grid } = page
  const metrics = TIME_POSTER_METRICS[page.timeFormat] || TIME_POSTER_METRICS.A4_HALF
  const itemWidth = grid.itemWidthMm * POINTS_PER_MM
  const itemHeight = grid.itemHeightMm * POINTS_PER_MM
  const body = Array.from({ length: grid.rows }, (_, rowIndex) => (
    Array.from({ length: grid.columns }, (_, columnIndex) => {
      const code = page.codes[(rowIndex * grid.columns) + columnIndex]
      return timePosterCell(code, logoSvg, metrics)
    })
  ))
  return {
    table: {
      widths: Array(grid.columns).fill(itemWidth),
      heights: Array(grid.rows).fill(itemHeight),
      dontBreakRows: true,
      body,
    },
    layout: {
      hLineWidth: (lineIndex) => (lineIndex > 0 && lineIndex < grid.rows ? 0.65 : 0),
      vLineWidth: (lineIndex) => (lineIndex > 0 && lineIndex < grid.columns ? 0.65 : 0),
      hLineColor: () => '#C7D2DF',
      vLineColor: () => '#C7D2DF',
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [grid.marginLeftMm * POINTS_PER_MM, grid.marginTopMm * POINTS_PER_MM, 0, 0],
    unbreakable: true,
  }
}

function labelCodeFontSize(zoneId, labelSizeMm) {
  let baseSize = 7.2
  if (zoneId.length > 44) baseSize = 4.2
  else if (zoneId.length > 32) baseSize = 5
  else if (zoneId.length > 22) baseSize = 6
  return Math.max(3, baseSize * (labelSizeMm / 40))
}

function qrLabelCell(code, logoSvg, grid) {
  if (!code) return { text: '', fillColor: '#FFFFFF' }
  const zoneId = zoneCodeId(code)
  const scale = grid.labelSizeMm / 40
  return {
    fillColor: '#FFFFFF',
    stack: [
      {
        svg: logoSvg,
        width: 46 * scale,
        alignment: 'center',
        margin: [0, 4 * scale, 0, Math.max(0.5, scale)],
      },
      {
        svg: createZoneQrSvg(zoneId),
        fit: [76 * scale, 76 * scale],
        alignment: 'center',
        margin: [0, 0, 0, 2 * scale],
      },
      {
        text: zoneId,
        fontSize: labelCodeFontSize(zoneId, grid.labelSizeMm),
        bold: true,
        color: '#000000',
        alignment: 'center',
        noWrap: true,
        margin: [2, 0, 2, 0],
      },
    ],
  }
}

function zoneLabelPageNode(page, logoSvg) {
  const { grid } = page
  const cellSize = grid.labelSizeMm * POINTS_PER_MM
  const body = Array.from({ length: grid.rows }, (_, rowIndex) => (
    Array.from({ length: grid.columns }, (_, columnIndex) => {
      const code = page.codes[(rowIndex * grid.columns) + columnIndex]
      return qrLabelCell(code, logoSvg, grid)
    })
  ))

  return {
    table: {
      widths: Array(grid.columns).fill(cellSize),
      heights: Array(grid.rows).fill(cellSize),
      dontBreakRows: true,
      body,
    },
    layout: noBordersLayout(),
    margin: [grid.marginLeftMm * POINTS_PER_MM, grid.marginTopMm * POINTS_PER_MM, 0, 0],
    unbreakable: true,
  }
}

function documentPageNode(page, index, logoSvg) {
  const node = page.kind === 'TIME_POSTERS'
    ? timePosterPageNode(page, logoSvg)
    : zoneLabelPageNode(page, logoSvg)
  if (index === 0) return node
  return {
    ...node,
    pageBreak: 'before',
    pageOrientation: page.orientation,
  }
}

export function createZoneQrDocument(codes, {
  logoSvg = '',
  labelSizeMm = 40,
  timePosterFormat = 'A4_HALF',
} = {}) {
  const normalizedCodes = (Array.isArray(codes) ? codes : []).filter(Boolean)
  if (!normalizedCodes.length) throw new Error('Brak kodów do przygotowania PDF.')
  if (!logoSvg) throw new Error('Brak logo Cleanzi do przygotowania PDF.')
  const printLayout = createZoneQrPrintLayout(normalizedCodes, { labelSizeMm, timePosterFormat })
  const firstPage = printLayout.pages[0]

  return {
    pageSize: 'A4',
    pageOrientation: firstPage.orientation,
    pageMargins: [0, 0, 0, 0],
    defaultStyle: {
      font: PDF_FONT_FAMILY,
      color: '#071B3E',
    },
    info: {
      title: `Cleanzi - kody QR ${normalizedCodes.map((code) => normalizeZoneQrFunction(code?.function)).join(' / ')}`,
      author: 'Cleanzi',
      subject: 'Kody QR stref i rejestracji czasu pracy',
    },
    content: printLayout.pages.map((page, index) => documentPageNode(page, index, logoSvg)),
  }
}

export async function createZoneQrPdfBlob(codes, options = {}) {
  const [pdfMake, logoSvg] = await Promise.all([
    ensureZoneQrPdfMake(),
    loadCleanziLogoSvg(),
  ])
  const documentDefinition = createZoneQrDocument(codes, { ...options, logoSvg })
  return pdfMake.createPdf(documentDefinition).getBlob()
}

export function zoneQrPdfFilename(codes) {
  const ids = (Array.isArray(codes) ? codes : [])
    .map((code) => zoneCodeId(code))
    .filter(Boolean)
    .join('_')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .slice(0, 120)
  return `cleanzi-kody-qr-${ids || 'strefy'}.pdf`
}

export function downloadZoneQrPdfBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function printZoneQrPdfUrl(url) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.className = 'zones-qr-print-frame'
    frame.setAttribute('aria-hidden', 'true')
    frame.onload = () => {
      window.setTimeout(() => {
        try {
          frame.contentWindow?.focus()
          frame.contentWindow?.print()
          window.setTimeout(() => frame.remove(), 1000)
          resolve()
        } catch (error) {
          frame.remove()
          reject(error)
        }
      }, 250)
    }
    frame.onerror = () => {
      frame.remove()
      reject(new Error('Nie udało się otworzyć dokumentu do druku.'))
    }
    frame.src = url
    document.body.appendChild(frame)
  })
}
