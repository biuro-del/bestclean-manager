const routeToViewId = {
  dashboard: 'view-dashboard',
  events: 'view-events',
  zones: 'view-zones',
  workerProfile: 'view-workerProfile',
  workerTime: 'view-workerTime',
  workerTimeDetail: 'view-workerTimeDetail',
  clientsList: 'view-clientsList',
  audits: 'view-audits',
  individualOrders: 'view-individualOrders',
  clientProfile: 'view-clientProfile',
  checklists: 'view-checklists',
  reports: 'view-reports',
}

const routeGroups = {
  clientsList: 'clients',
  events: 'clients',
  zones: 'clients',
  audits: 'clients',
  individualOrders: 'clients',
  clientProfile: 'clients',
  checklists: 'clients',
  workerTime: 'workers',
  workerTimeDetail: 'workers',
  workerProfile: 'workers',
  reports: 'reports',
}

function setActiveRoute(route) {
  document.querySelectorAll('.menu-item, .submenu-item, .mini-link').forEach((button) => {
    button.classList.toggle('active', button.dataset.route === route)
  })
}

function setSubmenuState(route) {
  document.querySelectorAll('.submenu').forEach((submenu) => {
    submenu.classList.remove('open')
  })

  const group = routeGroups[route]
  if (!group) {
    return
  }

  const submenu = document.getElementById(`submenu-${group}`)
  if (submenu) {
    submenu.classList.add('open')
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
