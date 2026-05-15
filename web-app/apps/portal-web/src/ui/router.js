const routeToViewId = {
  dashboard: 'view-dashboard',
  calendar: 'view-calendar',
  kanban: 'view-kanban',
  schedule: 'view-schedule',
  events: 'view-events',
  orders: 'view-orders',
  ordersMap: 'view-ordersMap',
  zones: 'view-zones',
  workerProfile: 'view-workerProfile',
  workerTime: 'view-workerTime',
  workerTimeDetail: 'view-workerTimeDetail',
  clientsList: 'view-clientsList',
  audits: 'view-audits',
  individualOrders: 'view-individualOrders',
  clientProfile: 'view-clientProfile',
  clientProfileDetails: 'view-clientProfileDetails',
  reports: 'view-reports',
  settings: 'view-settings',
  settingsStyles: 'view-settings',
  settingsBackup: 'view-settings',
}

const routeGroups = {
  clientsList: 'clients',
  zones: 'objects',
  audits: 'objects',
  individualOrders: 'clients',
  clientProfile: 'clients',
  clientProfileDetails: 'clients',
  orders: 'orders',
  ordersMap: 'orders',
  kanban: 'kanban',
  workerTime: 'workers',
  workerTimeDetail: 'workers',
  workerProfile: 'workers',
  reports: 'reports',
  settings: 'settings',
  settingsStyles: 'settings',
  settingsBackup: 'settings',
}

function setActiveRoute(route) {
  document.querySelectorAll('.menu-item, .submenu-item, .mini-link').forEach((button) => {
    button.classList.toggle('active', button.dataset.route === route)
  })
}

function keepActiveSidebarItemVisible(route) {
  window.requestAnimationFrame(() => {
    const activeItem = [...document.querySelectorAll('#portalSidebar [data-route].active')]
      .find((item) => item instanceof HTMLElement && item.dataset.route === route)
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
  document.querySelectorAll('.submenu').forEach((submenu) => {
    submenu.classList.remove('open')
  })
  document.querySelectorAll('.menu-section').forEach((section) => {
    section.classList.remove('open', 'active')
  })

  const group = routeGroups[route]
  if (!group) {
    return
  }

  const submenu = document.getElementById(`submenu-${group}`)
  if (submenu) {
    submenu.classList.add('open')
  }
  const section = document.querySelector(`.menu-section[data-toggle="${group}"]`)
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
    const nextRoute = String(route ?? '').trim() || 'dashboard'
    const viewId = routeToViewId[nextRoute]

    hideAllViews()

    if (viewId) {
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
