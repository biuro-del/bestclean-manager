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
      const loaded = () => window.turnstile?.render && window.turnstile?.execute
        ? resolve(window.turnstile)
        : reject(publicError('TURNSTILE_UNAVAILABLE', 'Nie udało się uruchomić ochrony rejestracji.'))
      const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`)
      if (existing) {
        existing.addEventListener('load', loaded, { once: true })
        existing.addEventListener('error', () => reject(publicError('TURNSTILE_UNAVAILABLE', 'Nie udało się uruchomić ochrony rejestracji.')), { once: true })
        return
      }
      const script = document.createElement('script')
      script.src = TURNSTILE_SCRIPT_URL
      script.async = true
      script.defer = true
      script.addEventListener('load', loaded, { once: true })
      script.addEventListener('error', () => reject(publicError('TURNSTILE_UNAVAILABLE', 'Nie udało się uruchomić ochrony rejestracji.')), { once: true })
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
  container.setAttribute('aria-hidden', 'true')
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
        appearance: 'interaction-only',
        callback: (token) => {
          const proof = String(token ?? '').trim()
          finish(proof ? resolve : reject, proof || publicError('TURNSTILE_REJECTED', 'Weryfikacja rejestracji nie powiodła się.'))
        },
        'error-callback': () => finish(reject, publicError('TURNSTILE_UNAVAILABLE', 'Nie udało się uruchomić ochrony rejestracji.')),
        'expired-callback': () => finish(reject, publicError('TURNSTILE_EXPIRED', 'Weryfikacja rejestracji wygasła. Spróbuj ponownie.')),
      })
      void turnstile.execute(widgetId).catch(() => finish(reject, publicError('TURNSTILE_UNAVAILABLE', 'Nie udało się uruchomić ochrony rejestracji.')))
    } catch {
      finish(reject, publicError('TURNSTILE_UNAVAILABLE', 'Nie udało się uruchomić ochrony rejestracji.'))
    }
  })
}
