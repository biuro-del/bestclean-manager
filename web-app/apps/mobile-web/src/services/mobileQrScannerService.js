let jsQrLoadPromise = null

function loadScript(src) {
  return new Promise((resolve, reject) => {
    try {
      const node = document.createElement('script')
      node.src = src
      node.async = true
      node.onload = () => resolve(true)
      node.onerror = () => reject(new Error(`Nie udało się załadować skryptu: ${src}`))
      document.head.appendChild(node)
    } catch (error) {
      reject(error)
    }
  })
}

async function ensureJsQr() {
  if (typeof window !== 'undefined' && typeof window.jsQR === 'function') {
    return true
  }

  if (!jsQrLoadPromise) {
    jsQrLoadPromise = loadScript('https://unpkg.com/jsqr/dist/jsQR.js').catch((error) => {
      jsQrLoadPromise = null
      throw error
    })
  }

  await jsQrLoadPromise
  if (typeof window.jsQR !== 'function') {
    throw new Error('Twoja przeglądarka nie obsługuje skanowania QR.')
  }
  return true
}

export function normalizeQrValue(rawValue) {
  const value = String(rawValue ?? '').trim()
  if (!value) return ''

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value)
      const params = ['roomId', 'room', 'id']
      for (const key of params) {
        const parsed = String(url.searchParams.get(key) ?? '').trim()
        if (parsed) return parsed
      }
    } catch {
      // Ignore URL parse issues and return raw value.
    }
  }

  return value
}

export class MobileQrScanner {
  constructor({
    video,
    onStatus,
    onError,
    onDecode,
    onTorchState,
  }) {
    this.video = video
    this.onStatus = onStatus
    this.onError = onError
    this.onDecode = onDecode
    this.onTorchState = onTorchState

    this.running = false
    this.stream = null
    this.track = null
    this.detector = null
    this.useJsQr = false
    this.canvas = null
    this.context = null
    this.rafId = null
    this.lastFrameTs = 0
    this.torchCapable = false
    this.torchOn = false
  }

  emitStatus(message) {
    if (typeof this.onStatus === 'function') this.onStatus(message)
  }

  emitError(error) {
    if (typeof this.onError === 'function') this.onError(error)
  }

  emitTorchState() {
    if (typeof this.onTorchState === 'function') {
      this.onTorchState({
        supported: this.torchCapable,
        enabled: this.torchOn,
      })
    }
  }

  async ensureDecoder() {
    this.useJsQr = false
    this.detector = null

    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        this.detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        return
      } catch {
        this.detector = null
      }
    }

    await ensureJsQr()
    this.useJsQr = true
    if (!this.canvas) this.canvas = document.createElement('canvas')
    if (!this.context) {
      this.context = this.canvas.getContext('2d', { willReadFrequently: true })
    }
  }

  async getStream() {
    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error('Przeglądarka nie obsługuje kamery.')
    }

    const attempts = [
      { audio: false, video: { facingMode: { exact: 'environment' } } },
      { audio: false, video: { facingMode: { ideal: 'environment' } } },
      { audio: false, video: true },
    ]

    let lastError = null
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints)
      } catch (error) {
        lastError = error
      }
    }

    throw lastError || new Error('Nie udało się uruchomić kamery.')
  }

  async detectTorchSupport() {
    this.torchCapable = false
    this.torchOn = false
    if (!this.track || typeof this.track.applyConstraints !== 'function') {
      this.emitTorchState()
      return
    }

    try {
      if (typeof this.track.getCapabilities === 'function') {
        const capabilities = this.track.getCapabilities() || {}
        if (capabilities.torch === true) {
          this.torchCapable = true
          this.emitTorchState()
          return
        }
      }
    } catch {
      // Ignore and fallback to applyConstraints probe.
    }

    try {
      await this.track.applyConstraints({ advanced: [{ torch: false }] })
      this.torchCapable = true
    } catch {
      this.torchCapable = false
    }

    this.emitTorchState()
  }

  async tryEnableTorchOnStart() {
    if (!this.torchCapable || !this.track) return
    try {
      await this.track.applyConstraints({ advanced: [{ torch: true }] })
      this.torchOn = true
    } catch {
      this.torchOn = false
    }
    this.emitTorchState()
  }

  async toggleTorch() {
    if (!this.track || !this.torchCapable) {
      this.emitStatus('Latarka niedostępna na tym urządzeniu.')
      return
    }

    const nextState = !this.torchOn
    try {
      await this.track.applyConstraints({ advanced: [{ torch: nextState }] })
      this.torchOn = nextState
      this.emitTorchState()
      this.emitStatus(this.torchOn ? 'Latarka włączona.' : 'Latarka wyłączona.')
    } catch {
      this.torchOn = false
      this.torchCapable = false
      this.emitTorchState()
      this.emitStatus('Latarka niedostępna na tym urządzeniu.')
    }
  }

  async start() {
    if (this.running) return
    if (!this.video) throw new Error('Brak elementu video dla skanera.')

    this.emitStatus('Uruchamiam kamerę...')
    this.running = true

    try {
      await this.ensureDecoder()
      this.stream = await this.getStream()
      this.video.srcObject = this.stream
      this.track = this.stream.getVideoTracks ? this.stream.getVideoTracks()[0] || null : null

      await this.detectTorchSupport()
      await this.tryEnableTorchOnStart()

      await this.video.play()
      this.emitStatus('Skanuje...')
      this.scheduleLoop()
    } catch (error) {
      this.stop()
      this.emitError(error)
      this.emitStatus('Nie udało się uruchomić kamery. Sprawdź uprawnienia do aparatu.')
    }
  }

  scheduleLoop() {
    if (!this.running) return
    this.rafId = requestAnimationFrame((ts) => {
      this.scanFrame(ts)
    })
  }

  async scanFrame(ts) {
    if (!this.running) return

    try {
      if (this.useJsQr) {
        if (ts - this.lastFrameTs < 120) {
          this.scheduleLoop()
          return
        }
        this.lastFrameTs = ts
      }

      const decoded = await this.tryDecode()
      const normalized = normalizeQrValue(decoded)
      if (normalized) {
        this.stop()
        if (typeof this.onDecode === 'function') this.onDecode(normalized)
        return
      }
    } catch {
      // Ignore decode errors and continue scanning.
    }

    this.scheduleLoop()
  }

  async tryDecode() {
    if (!this.video) return ''

    if (!this.useJsQr) {
      if (!this.detector) return ''
      const list = await this.detector.detect(this.video)
      if (!list || !list.length) return ''
      return String(list[0].rawValue || '').trim()
    }

    const width = this.video.videoWidth || 0
    const height = this.video.videoHeight || 0
    if (!width || !height || !this.canvas || !this.context) return ''

    if (this.canvas.width !== width) this.canvas.width = width
    if (this.canvas.height !== height) this.canvas.height = height

    this.context.drawImage(this.video, 0, 0, width, height)
    const image = this.context.getImageData(0, 0, width, height)
    const parsed = window.jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' })
    return parsed?.data ? String(parsed.data).trim() : ''
  }

  stop() {
    this.running = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }

    try {
      if (this.video) this.video.pause()
    } catch {
      // Ignore.
    }

    if (this.stream) {
      try {
        this.stream.getTracks().forEach((track) => track.stop())
      } catch {
        // Ignore.
      }
    }

    this.stream = null
    this.track = null
    this.detector = null
    this.useJsQr = false
    this.lastFrameTs = 0
    this.torchOn = false
    this.torchCapable = false
    this.emitTorchState()
  }
}

