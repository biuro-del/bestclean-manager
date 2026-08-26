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

export function createSettingsFeature(ctx = {}) {
  let navigation = null

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

    content.innerHTML = module.template
    content.dataset.settingsModuleRoute = module.route
    addOverviewBackButton(content, module)
    updatePermissionState()
    return module
  }

  function bind(nextNavigation) {
    navigation = nextNavigation

    return () => {
      navigation = null
    }
  }

  return {
    bind,
    render,
    canEdit: () => settingsCanEdit(ctx.appState?.session),
  }
}
