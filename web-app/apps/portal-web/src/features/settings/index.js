import template from './template.html?raw'
import './style.css'
import { SETTINGS_ROUTES, settingsModuleForRoute } from './catalog.js'

export const section = 'settings'
export const routes = SETTINGS_ROUTES
export const viewId = 'view-settings'
export { template }

const EDITOR_ROLES = new Set(['OWNER', 'ADMIN'])

export function settingsCanEdit(session) {
  return EDITOR_ROLES.has(String(session?.roleCode ?? '').trim().toUpperCase())
}

function setAccountPasswordFeedback(element, message = '', tone = '') {
  if (!(element instanceof HTMLElement)) return
  element.textContent = message
  element.dataset.tone = tone
  element.hidden = !message
}

function setAccountPasswordStatus(element, message, tone = 'warning') {
  if (!(element instanceof HTMLElement)) return
  element.textContent = message
  element.dataset.tone = tone
}

function accountPasswordErrorMessage(error) {
  const message = String(error?.message ?? '').trim()
  return message || 'Nie udało się ustawić hasła. Spróbuj ponownie.'
}

function bindAccountPasswordSettings(content, ctx = {}) {
  const section = content.querySelector('[data-account-password-section]')
  const status = content.querySelector('[data-account-password-status]')
  const title = content.querySelector('[data-account-password-title]')
  const copy = content.querySelector('[data-account-password-copy]')
  const form = content.querySelector('[data-account-password-form]')
  const email = content.querySelector('[data-account-password-email]')
  const password = content.querySelector('[data-account-password-new]')
  const confirmation = content.querySelector('[data-account-password-confirm]')
  const submit = content.querySelector('[data-account-password-submit]')
  const feedback = content.querySelector('[data-account-password-feedback]')

  if (
    !(section instanceof HTMLElement) ||
    !(status instanceof HTMLElement) ||
    !(title instanceof HTMLElement) ||
    !(copy instanceof HTMLElement) ||
    !(form instanceof HTMLFormElement) ||
    !(email instanceof HTMLInputElement) ||
    !(password instanceof HTMLInputElement) ||
    !(confirmation instanceof HTMLInputElement) ||
    !(submit instanceof HTMLButtonElement) ||
    !(feedback instanceof HTMLElement)
  ) {
    return () => {}
  }

  let disposed = false
  let busy = false

  const setBusy = (nextBusy) => {
    busy = Boolean(nextBusy)
    submit.disabled = busy
    password.disabled = busy
    confirmation.disabled = busy
    if (busy) submit.textContent = 'Potwierdzanie konta Google...'
    else submit.textContent = 'Ustaw hasło'
  }

  const renderState = (state) => {
    if (disposed) return
    email.value = String(state?.email ?? '')
    form.hidden = true
    setAccountPasswordFeedback(feedback)

    if (state?.hasPasswordProvider) {
      setAccountPasswordStatus(status, 'Aktywne', 'success')
      title.textContent = 'Hasło jest aktywne'
      copy.textContent = 'Możesz logować się przez Google albo tym samym e-mailem i hasłem.'
      return
    }
    if (!state?.hasGoogleProvider) {
      setAccountPasswordStatus(status, 'Wymaga Google')
      title.textContent = 'Zaloguj się przez Google'
      copy.textContent = 'Pierwsze hasło możesz ustawić po zalogowaniu Google do tego samego konta.'
      return
    }
    if (!state?.emailVerified) {
      setAccountPasswordStatus(status, 'Potwierdź e-mail')
      title.textContent = 'Adres e-mail wymaga potwierdzenia'
      copy.textContent = 'Najpierw potwierdź adres e-mail przypisany do tego konta Google.'
      return
    }

    setAccountPasswordStatus(status, 'Do ustawienia', 'ready')
    title.textContent = 'Ustaw hasło do logowania e-mailem'
    copy.textContent = 'Dodasz drugą metodę logowania do tego samego konta.'
    form.hidden = false
  }

  const loadState = async () => {
    if (typeof ctx.getEmailPasswordLoginState !== 'function') {
      throw new Error('Ustawienie hasła jest chwilowo niedostępne.')
    }
    renderState(await ctx.getEmailPasswordLoginState())
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (busy) return

    if (password.value.length < 6) {
      setAccountPasswordFeedback(feedback, 'Hasło musi mieć co najmniej 6 znaków.', 'error')
      password.focus()
      return
    }
    if (password.value !== confirmation.value) {
      setAccountPasswordFeedback(feedback, 'Wpisane hasła nie są takie same.', 'error')
      confirmation.focus()
      return
    }
    if (typeof ctx.linkEmailPasswordToCurrentUser !== 'function') {
      setAccountPasswordFeedback(feedback, 'Ustawienie hasła jest chwilowo niedostępne.', 'error')
      return
    }

    setBusy(true)
    setAccountPasswordFeedback(feedback, 'Potwierdź teraz to samo konto Google.', 'neutral')
    try {
      const state = await ctx.linkEmailPasswordToCurrentUser(password.value)
      if (disposed) return
      password.value = ''
      confirmation.value = ''
      renderState(state)
      setAccountPasswordFeedback(
        feedback,
        'Hasło zostało ustawione. Od teraz możesz logować się e-mailem i hasłem albo przez Google.',
        'success',
      )
    } catch (error) {
      if (!disposed) setAccountPasswordFeedback(feedback, accountPasswordErrorMessage(error), 'error')
    } finally {
      if (!disposed) setBusy(false)
    }
  }

  form.addEventListener('submit', handleSubmit)
  void loadState().catch((error) => {
    if (disposed) return
    form.hidden = true
    setAccountPasswordStatus(status, 'Niedostępne', 'error')
    title.textContent = 'Nie można sprawdzić metod logowania'
    copy.textContent = 'Odśwież stronę i spróbuj ponownie.'
    setAccountPasswordFeedback(feedback, accountPasswordErrorMessage(error), 'error')
  })

  return () => {
    disposed = true
    form.removeEventListener('submit', handleSubmit)
  }
}

export function createSettingsFeature(ctx = {}) {
  let navigation = null
  let accountPasswordCleanup = () => {}

  function cleanupAccountPasswordSettings() {
    accountPasswordCleanup()
    accountPasswordCleanup = () => {}
  }

  function addOverviewBackButton(content, module) {
    if (module.route === 'settings') return

    const header = content.querySelector('.settings-module-header')
    if (!(header instanceof HTMLElement)) return

    const actions = document.createElement('div')
    actions.className = 'settings-module-header-actions'

    const backButton = document.createElement('button')
    backButton.type = 'button'
    backButton.className = 'settings-back-button'
    backButton.dataset.settingsBack = 'true'
    backButton.setAttribute('aria-label', 'Wróć do przeglądu ustawień')
    backButton.innerHTML = '<i class="ph ph-arrow-left" aria-hidden="true"></i><span>Wróć</span>'
    backButton.addEventListener('click', () => {
      void navigation?.go?.('settings')
    })
    actions.append(backButton)

    const status = Array.from(header.children).find((element) => element.classList.contains('settings-status'))
    if (status) actions.append(status)
    header.append(actions)
  }

  function updatePermissionState() {
    const shell = document.querySelector('[data-settings-shell]')
    if (!(shell instanceof HTMLElement)) {
      return
    }

    const canEdit = settingsCanEdit(ctx.appState?.session)
    shell.dataset.canEdit = String(canEdit)
    shell.querySelectorAll('[data-settings-permission]').forEach((element) => {
      element.textContent = canEdit
        ? 'Twoja rola będzie mogła edytować ten moduł.'
        : 'Edycja będzie dostępna dla ról OWNER i ADMIN.'
    })
  }

  function render(route = 'settings') {
    const module = settingsModuleForRoute(route)
    const content = document.getElementById('settingsModuleContent')
    if (!(content instanceof HTMLElement)) {
      return module
    }

    cleanupAccountPasswordSettings()
    content.innerHTML = module.template
    content.dataset.settingsModuleRoute = module.route
    addOverviewBackButton(content, module)
    updatePermissionState()
    if (module.route === 'settingsAccountSecurity') {
      accountPasswordCleanup = bindAccountPasswordSettings(content, ctx)
    }
    return module
  }

  function bind(nextNavigation) {
    navigation = nextNavigation

    return () => {
      navigation = null
      cleanupAccountPasswordSettings()
    }
  }

  return {
    bind,
    render,
    canEdit: () => settingsCanEdit(ctx.appState?.session),
  }
}
