import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/build/pdf.mjs'
import pdfWorkerUrl from './pdfWorker.js?worker&url'

// Bundle the PDF.js worker through a local `.js` entry. Firebase App Hosting
// serves `.js` with the correct MIME type and the same-origin URL is permitted
// by the production CSP. Using workerSrc also lets PDF.js own the worker
// lifecycle instead of reusing a workerPort that a previous loading task
// already destroyed.
GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function positiveNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function isCancelledRender(error) {
  return String(error?.name ?? '') === 'RenderingCancelledException'
}

export function createZoneQrPdfPreviewRenderer() {
  let pdfDocument = null
  let loadingTask = null
  let renderTask = null
  let generation = 0

  async function releaseDocument(task, document) {
    if (typeof task?.destroy === 'function') {
      try {
        await task.destroy()
      } catch {
        // The loading task may already be closing after a cancelled preview.
      }
      return
    }

    if (typeof document?.cleanup === 'function') {
      try {
        await document.cleanup()
      } catch {
        // Cleanup is best-effort when the worker has already been released.
      }
    }
  }

  async function clearDocument() {
    renderTask?.cancel?.()
    renderTask = null
    const taskToRelease = loadingTask
    const documentToRelease = pdfDocument
    loadingTask = null
    pdfDocument = null
    await releaseDocument(taskToRelease, documentToRelease)
  }

  async function load(blob) {
    const currentGeneration = ++generation
    await clearDocument()
    if (!(blob instanceof Blob)) throw new Error('Brak dokumentu PDF do podglądu.')
    const data = new Uint8Array(await blob.arrayBuffer())
    if (currentGeneration !== generation) return 0
    const currentLoadingTask = getDocument({ data })
    loadingTask = currentLoadingTask
    let loadedDocument
    try {
      loadedDocument = await currentLoadingTask.promise
    } catch (error) {
      if (loadingTask === currentLoadingTask) loadingTask = null
      if (currentGeneration !== generation) return 0
      throw error
    }
    if (currentGeneration !== generation) {
      if (loadingTask === currentLoadingTask) {
        loadingTask = null
        await releaseDocument(currentLoadingTask, loadedDocument)
      }
      return 0
    }
    pdfDocument = loadedDocument
    return pdfDocument.numPages
  }

  async function renderPage({ canvas, container, pageNumber, maxWidth, maxHeight }) {
    if (!pdfDocument) throw new Error('Podgląd PDF nie został przygotowany.')
    if (!(canvas instanceof HTMLCanvasElement) || !(container instanceof HTMLElement)) {
      throw new Error('Nie udało się przygotować obszaru podglądu PDF.')
    }

    const normalizedPage = Math.min(pdfDocument.numPages, Math.max(1, Number(pageNumber) || 1))
    const page = await pdfDocument.getPage(normalizedPage)
    const baseViewport = page.getViewport({ scale: 1 })
    const horizontalPadding = 28
    const verticalPadding = 28
    const availableWidth = positiveNumber(maxWidth, Math.max(260, container.clientWidth - horizontalPadding))
    const availableHeight = positiveNumber(maxHeight, Math.max(360, container.clientHeight - verticalPadding))
    const previewScale = Math.min(
      availableWidth / positiveNumber(baseViewport.width, availableWidth),
      availableHeight / positiveNumber(baseViewport.height, availableHeight),
    )
    const viewport = page.getViewport({ scale: positiveNumber(previewScale, 1) })
    const pixelRatio = Math.max(window.devicePixelRatio || 1, 2)

    renderTask?.cancel?.()
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Przeglądarka nie udostępniła obszaru canvas.')

    canvas.width = Math.floor(viewport.width * pixelRatio)
    canvas.height = Math.floor(viewport.height * pixelRatio)
    canvas.style.width = `${Math.floor(viewport.width)}px`
    canvas.style.height = `${Math.floor(viewport.height)}px`
    context.imageSmoothingEnabled = false

    const currentRenderTask = page.render({
      canvas,
      canvasContext: context,
      viewport,
      transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
      background: '#FFFFFF',
    })
    renderTask = currentRenderTask

    try {
      await currentRenderTask.promise
    } catch (error) {
      if (!isCancelledRender(error)) throw error
    } finally {
      if (renderTask === currentRenderTask) renderTask = null
      page.cleanup()
    }
    return normalizedPage
  }

  async function destroy() {
    generation += 1
    await clearDocument()
  }

  return {
    destroy,
    load,
    renderPage,
  }
}
