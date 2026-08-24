import template from './template.html?raw'
import './style.css'
import { SETTINGS_MODULES, SETTINGS_ROUTES, settingsModuleForRoute } from './catalog.js'

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
  let selectElement = null

  function updateModuleNavigation(route) {
    document.querySelectorAll('[data-settings-route]').forEach((item) => {
      const isCurrent = item.getAttribute('data-settings-route') === route
      item.classList.toggle('is-active', isCurrent)
      if (isCurrent) {
        item.setAttribute('aria-current', 'page')
      } else {
        item.removeAttribute('aria-current')
      }
    })

    if (selectElement instanceof HTMLSelectElement) {
      selectElement.value = route
    }
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
    updateModuleNavigation(module.route)
    updatePermissionState()
    return module
  }

  function bind(nextNavigation) {
    navigation = nextNavigation
    selectElement = document.getElementById('settingsModuleSelect')

    const handleSelectChange = () => {
      const route = String(selectElement?.value ?? '').trim()
      if (route && SETTINGS_MODULES.some((module) => module.route === route)) {
        void navigation?.go?.(route)
      }
    }

    selectElement?.addEventListener('change', handleSelectChange)

    return () => {
      selectElement?.removeEventListener('change', handleSelectChange)
      selectElement = null
      navigation = null
    }
  }

  return {
    bind,
    render,
    canEdit: () => settingsCanEdit(ctx.appState?.session),
  }
}
