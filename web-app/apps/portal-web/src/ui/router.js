const routeToViewId = {
  dashboard: 'view-dashboard',
  calendar: 'view-calendar',
  kanban: 'view-kanban',
  contractProfitability: 'view-contractProfitability',
  events: 'view-events',
  orders: 'view-orders',
  ordersMap: 'view-ordersMap',
  zones: 'view-zones',
  workerProfile: 'view-workerProfile',
  workerAccount: 'view-workerAccount',
  workerTime: 'view-workerTime',
  workerTimeDetail: 'view-workerTimeDetail',
  workdayStopProposals: 'view-workdayStopProposals',
  audits: 'view-audits',
  clientProfile: 'view-clientProfile',
  clientProfileDetails: 'view-clientProfileDetails',
  reports: 'view-reports',
  settings: 'view-settings',
  settingsProfile: 'view-settings',
  settingsNotifications: 'view-settings',
  settingsLanguageApp: 'view-settings',
  settingsAccountSecurity: 'view-settings',
  settingsOrganizationData: 'view-settings',
  settingsAlerts: 'view-settings',
  settingsIntegrations: 'view-settings',
  settingsBilling: 'view-settings',
  settingsDataSecurity: 'view-settings',
}

const settingsRoutes = new Set([
  'settings',
  'settingsProfile',
  'settingsNotifications',
  'settingsLanguageApp',
  'settingsAccountSecurity',
  'settingsOrganizationData',
  'settingsAlerts',
  'settingsIntegrations',
  'settingsBilling',
  'settingsDataSecurity',
])

const routeGroups = {
  zones: 'objects',
  audits: 'objects',
  clientProfile: 'clients',
  clientProfileDetails: 'clients',
  orders: 'orders',
  ordersMap: 'orders',
  kanban: 'kanban',
  workerTime: 'workers',
  workerTimeDetail: 'workers',
  workerProfile: 'workers',
  workerAccount: 'workers',
  workdayStopProposals: 'workers',
  reports: 'reports',
}

let activeRoute = ''
let activeGroup = ''
let activeSidebarScrollRaf = 0

function normalizeRoute(route) {
  const nextRoute = String(route ?? '').trim()
  return nextRoute === 'clientsList' ? 'clientProfile' : nextRoute
}

function sidebarRouteFor(route) {
  return settingsRoutes.has(route) ? 'settings' : route
}

function setActiveRoute(route) {
  const sidebarRoute = sidebarRouteFor(route)
  const currentActive = document.querySelector(
    `.menu-item.active[data-route="${sidebarRoute}"], .submenu-item.active[data-route="${sidebarRoute}"], .mini-link.active[data-route="${sidebarRoute}"]`
  )
  if (activeRoute === route && currentActive) {
    return
  }

  document.querySelectorAll('.menu-item.active, .submenu-item.active, .mini-link.active').forEach((button) => {
    button.classList.remove('active')
  })
  document.querySelectorAll(`[data-route="${sidebarRoute}"]`).forEach((button) => {
    if (button.matches('.menu-item, .submenu-item, .mini-link')) {
      button.classList.add('active')
    }
  })
  activeRoute = route
}

function keepActiveSidebarItemVisible(route) {
  if (activeSidebarScrollRaf) {
    window.cancelAnimationFrame(activeSidebarScrollRaf)
    activeSidebarScrollRaf = 0
  }
  activeSidebarScrollRaf = window.requestAnimationFrame(() => {
    activeSidebarScrollRaf = 0
    const activeItem = document.querySelector(`#portalSidebar [data-route="${sidebarRouteFor(route)}"].active`)
    const menu = activeItem?.closest?.('.menu')
    if (!(activeItem instanceof HTMLElement) || !(menu instanceof HTMLElement)) {
      return
    }

    const menuRect = menu.getBoundingClientRect()
    const itemRect = activeItem.getBoundingClientRect()
    const topGap = itemRect.top - menuRect.top
    const bottomGap = itemRect.bottom - menuRect.bottom

    if (topGap < 8) {
      menu.scrollTop += topGap - 12
    } else if (bottomGap > -8) {
      menu.scrollTop += bottomGap + 12
    }
  })
}

function setSubmenuState(route) {
  const group = routeGroups[route] || ''
  const submenu = group ? document.getElementById(`submenu-${group}`) : null
  const section = group ? document.querySelector(`.menu-section[data-toggle="${group}"]`) : null
  if (activeGroup === group && (!group || (submenu?.classList.contains('open') && section?.classList.contains('open')))) {
    return
  }

  if (activeGroup) {
    document.getElementById(`submenu-${activeGroup}`)?.classList.remove('open')
    document.querySelector(`.menu-section[data-toggle="${activeGroup}"]`)?.classList.remove('open', 'active')
  }

  activeGroup = group
  if (!group) {
    return
  }

  if (submenu) {
    submenu.classList.add('open')
  }
  if (section) {
    section.classList.add('open', 'active')
  }
}

function hideAllViews() {
  document.querySelectorAll('main section[id^="view-"]').forEach((section) => {
    section.style.display = 'none'
    section.style.setProperty('display', 'none', 'important')
  })
}

function showPlaceholder(route) {
  const title = document.getElementById('phTitle')
  const text = document.getElementById('phText')

  if (title) {
    title.textContent = 'W budowie'
  }

  if (text) {
    text.textContent = `Moduł "${route}" dodamy w kolejnym etapie.`
  }

  const placeholder = document.getElementById('view-placeholder')
  if (placeholder) {
    placeholder.style.display = ''
    placeholder.style.removeProperty('display')
  }
}

export function createRouter(onRouteChange) {
  let currentRoute = null

  function go(route) {
    const nextRoute = normalizeRoute(route) || 'dashboard'
    const viewId = routeToViewId[nextRoute]
    const previousRoute = currentRoute
    const previousViewId = routeToViewId[previousRoute]

    if (previousViewId && previousViewId !== viewId) {
      const previousView = document.getElementById(previousViewId)
      if (previousView) {
        previousView.style.display = 'none'
        previousView.style.setProperty('display', 'none', 'important')
      }
    } else if (!previousViewId) {
      hideAllViews()
    }

    if (viewId) {
      const placeholder = document.getElementById('view-placeholder')
      if (placeholder) {
        placeholder.style.display = 'none'
        placeholder.style.setProperty('display', 'none', 'important')
      }
      const view = document.getElementById(viewId)
      if (view) {
        view.style.display = ''
        view.style.removeProperty('display')
      }
    } else {
      showPlaceholder(nextRoute)
    }

    setSubmenuState(nextRoute)
    setActiveRoute(nextRoute)
    keepActiveSidebarItemVisible(nextRoute)
    currentRoute = nextRoute

    if (typeof onRouteChange === 'function') {
      onRouteChange(nextRoute)
    }
  }

  function getCurrentRoute() {
    return currentRoute
  }

  return { go, getCurrentRoute }
}
