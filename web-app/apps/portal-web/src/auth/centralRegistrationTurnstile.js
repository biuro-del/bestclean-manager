const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let turnstileScriptPromise = null

function publicError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function siteKey() {
  const key = String(import.meta.env.VITE_CENTRAL_REGISTRATION_TURNSTILE_SITE_KEY ?? '').trim()
  if (!key) {
    throw publicError('TURNSTILE_NOT_CONFIGURED', 'Rejestracja jest chwilowo niedostępna. Spróbuj ponownie później.')
  }
  return key
}

async function loadTurnstile() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw publicError('TURNSTILE_BROWSER_REQUIRED', 'Rejestracja wymaga przeglądarki.')
  }
  if (window.turnstile?.render && window.turnstile?.execute) return window.turnstile
  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      let attempts = 0
      const unavailable = () => {
        turnstileScriptPromise = null
        reject(publicError('TURNSTILE_UNAVAILABLE', 'Nie udało się uruchomić ochrony rejestracji.'))
      }
      // The script load event can precede the public API by a short moment.
      // Wait for the documented global instead of rejecting this normal race.
      const loaded = () => {
        if (window.turnstile?.render && window.turnstile?.execute) {
          resolve(window.turnstile)
          return
        }
        if (attempts++ < 20) {
          window.setTimeout(loaded, 50)
          return
        }
        unavailable()
      }
      const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`)
      if (existing) {
        existing.addEventListener('load', loaded, { once: true })
        existing.addEventListener('error', unavailable, { once: true })
        return
      }
      const script = document.createElement('script')
      script.src = TURNSTILE_SCRIPT_URL
      script.async = true
      script.defer = true
      script.addEventListener('load', loaded, { once: true })
      script.addEventListener('error', unavailable, { once: true })
      document.head.appendChild(script)
    })
  }
  return turnstileScriptPromise
}

/**
 * Gets one short-lived proof for a single registration action. The proof is
 * immediately sent to the issuer and is never saved in browser storage.
 */
export async function requestCentralRegistrationTurnstileToken(action) {
  const normalizedAction = String(action ?? '').trim()
  if (!normalizedAction) throw publicError('TURNSTILE_ACTION_REQUIRED', 'Nie udało się bezpiecznie rozpocząć rejestracji.')
  const turnstile = await loadTurnstile()
  const container = document.createElement('div')
  // Turnstile can require an interactive challenge. Its iframe must therefore
  // be visible and reachable while the short-lived proof is being created.
  container.setAttribute('role', 'status')
  container.setAttribute('aria-label', 'Weryfikacja bezpieczeństwa rejestracji')
  container.style.cssText = [
    'position:fixed',
    'z-index:2147483647',
    'left:50%',
    'top:50%',
    'transform:translate(-50%,-50%)',
    'padding:12px',
    'background:#fff',
    'border-radius:12px',
    'box-shadow:0 12px 36px rgba(0,0,0,.28)',
  ].join(';')
  document.body.appendChild(container)

  return new Promise((resolve, reject) => {
    let settled = false
    let widgetId = null
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      try {
        if (widgetId !== null) turnstile.remove(widgetId)
      } catch {
        // The widget can already be disposed after an unsuccessful challenge.
      }
      container.remove()
      callback(value)
    }
    try {
      widgetId = turnstile.render(container, {
        sitekey: siteKey(),
        action: normalizedAction,
        execution: 'execute',
        appearance: 'execute',
        callback: (token) => {
          const proof = String(token ?? '').trim()
          finish(proof ? resolve : reject, proof || publicError('TURNSTILE_REJECTED', 'Weryfikacja rejestracji nie powiodła się.'))
        },
        'error-callback': () => finish(reject, publicError('TURNSTILE_UNAVAILABLE', 'Nie udało się uruchomić ochrony rejestracji.')),
        'expired-callback': () => finish(reject, publicError('TURNSTILE_EXPIRED', 'Weryfikacja rejestracji wygasła. Spróbuj ponownie.')),
      })
      // Cloudflare's supported browser API may return void. Retain the
      // rejection path for implementations that return a Promise, but do not
      // turn the normal void result into a client-side error.
      const execution = turnstile.execute(widgetId)
      if (execution?.catch) {
        void execution.catch(() => finish(reject, publicError('TURNSTILE_UNAVAILABLE', 'Nie udało się uruchomić ochrony rejestracji.')))
      }
    } catch {
      finish(reject, publicError('TURNSTILE_UNAVAILABLE', 'Nie udało się uruchomić ochrony rejestracji.'))
    }
  })
}
