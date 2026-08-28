import {
  CLEANING_COMPANY_LEGAL_DOCUMENTS,
  acceptPlatformContext,
  beginMfaSignInChallenge,
  beginPhoneMfaEnrollment,
  beginTotpEnrollment,
  clearPlatformContextSession,
  completeCleaningCompanyEmailLinkSignIn,
  completeCleaningCompanyOnboarding,
  completeMfaSignIn,
  completePhoneMfaEnrollment,
  completeTotpEnrollment,
  createFacilityManagerRegistrationIdempotencyKey,
  ensureSessionContext,
  getEmailPasswordLoginState,
  getOrganizationProfile,
  getCleaningCompanyLegalDocuments,
  getSession,
  getStoredCleaningCompanyEmailLinkEmail,
  isCleaningCompanyEmailLink,
  linkEmailPasswordToCurrentUser,
  login,
  loginWithGoogle,
  lookupCompanyByNip,
  logout,
  refreshEmailVerification,
  requestCleaningCompanyEmailLink,
  requestPasswordReset,
  requestEmailVerification,
  requestPlatformEmailMfaCode,
  registerFacilityManagerWithGoogle,
  resumeCleaningCompanyOnboardingForExistingGoogleAccount,
  retryFacilityManagerGoogleRegistration,
  requireAuth,
  saveOrganizationProfile,
  saveSession,
  selectOrganization,
  setOrganizationAuthScope,
  signInFacilityManagerWithGoogle,
  startCleaningCompanyGoogleSignIn,
  verifyPlatformEmailMfaCode,
} from '../auth/authService'
import { getDataSourceLabel, isFirebaseConfigured, waitForFirebaseAuthReady } from '../firebase/firebaseClient'
import {
  bindRegistrationAccount,
  capturePendingRegistrationEntry,
  clearPendingRegistrationEntry,
  completeRegistrationCompany,
  getPendingRegistrationEntry,
  getRegistrationPageUrl,
  hasPendingRegistrationBindToken,
  isRegistrationApiConfigured,
  isSafeStripeCheckoutUrl,
  lookupRegistrationCompany,
  markPendingGoogleAuthStarted,
  resumeRegistrations,
  saveRegistrationConsents,
  verifyRegistration,
} from '../services/registrationOnboardingService'
import { createClient, deleteClient, getClients, updateClient } from '../services/clientService'
import {
  createWorkerUser,
  deleteWorker,
  getNextWorkerIdPreview,
  getWorkers,
  setWorkerPassword,
  updateWorker,
} from '../services/workerService'
import { createZone, deleteZone, getZones, updateZone } from '../services/zoneService'
import {
  createEvent,
  createWorkday,
  deleteEvent,
  forceDeletePortalEvents,
  getEventsFingerprintForOrg,
  getTodayActiveWorkers,
  getWorkdays,
  getWorkerTime,
  updateEvent,
  updateWorkday,
} from '../services/workdayService'
import { deletePortalTasks, fetchPortalTasks, upsertPortalTasks } from '../services/portalTaskService'
import {
  deleteScheduleTasks,
  fetchScheduleTasks,
  setScheduleTaskLifecycleStatus,
  upsertScheduleTasks,
} from '../services/scheduleTaskDataConnectService'
import { createCleanziAdminPanel } from '../../../../../Cleanzi-admin/frontend/index.js'
import { isPlatformFirebaseConfigured } from '../../../../../Cleanzi-admin/frontend/platformFirebaseClient.js'
import { portalLayoutTemplate } from './layoutTemplate'
import { createRouter } from './router'

import { appState, resetSessionState } from '../app/state/index.js'
import {
  daysAgoYmd,
  durationSecondsToHm,
  durationSecondsToHms,
  ensureSelectValue,
  escapeHtml,
  formatDatePl,
  formatTime,
  normalizeSearchText,
  pad2,
  paginate,
  setSelectOptions,
  todayYmd,
  toIso,
  ymdToWarsawIsoRangeEnd,
  ymdToWarsawIsoRangeStart,
} from '../app/shared/index.js'

let portalNoticeTimer = null
let cleanziAdminPanel = null
let pendingMfaChallenge = null
let pendingMfaEnrollmentType = ''
let pendingEmailMfaChallengeId = ''
let selectableOrganizations = []
let pendingRegistration = null
let activeRegistrationAttempt = null
let pendingRegistrationNeedsVerification = false
let companyRegistryMetadata = {}
let cleaningCompanyLegalDocuments = null
let cleaningCompanyOnboardingCommandId = ''
let cleaningCompanyRegistrationAvailable = false
let cleaningCompanyRegistrationAvailabilityRequest = 0
let loginControlsBusy = false
let pendingFacilityManagerRegistration = null
const COMPANY_EMAIL_RETRY_COOLDOWN_MS = 60_000
let companyEmailRetryAvailableAtMs = 0
let companyEmailRetryTimer = null
let calendarRemoteSaveTimer = 0
let sidebarGlobalSearchResults = []
let sidebarGlobalSearchActiveIndex = -1
let sidebarGlobalSearchRenderTimer = 0
let sidebarGlobalSearchLazyDataTimer = 0
let sidebarGlobalSearchWorkersLoadPromise = null
let portalDeferredNotificationTimer = 0
const portalDeferredNotifications = new Map()
let routeSyncOverlayTimer = 0
let routeSyncActiveCount = 0
const CALENDAR_TIMELINE_STATUS_REFRESH_MS = 15 * 60 * 1000
const DATA_SYNC_OVERLAY_DELAY_MS = 420
const SIDEBAR_GLOBAL_SEARCH_RENDER_DELAY_MS = 80
const SIDEBAR_GLOBAL_SEARCH_LAZY_DATA_DELAY_MS = 1600
const SIDEBAR_GLOBAL_SEARCH_MIN_LAZY_QUERY_LENGTH = 3
const ROUTE_TRANSITION_OVERLAY_DELAY_MS = 160
const ROUTE_TRANSITION_MIN_VISIBLE_MS = 90
const ROUTE_SYNC_STALE_MS = 30 * 1000
const ROUTE_SYNC_POLICY_STALE_FIRST = 'stale-first'
const ROUTE_SYNC_POLICY_FORCE = 'force'
const ROUTE_SYNC_POLICY_BACKGROUND = 'background'
const routeSyncMeta = new Map()
const CURRENT_ROUTE_STORAGE_KEY = 'portal.currentRoute'
const SIDEBAR_COLLAPSE_STORAGE_KEY = 'portal.sidebarCollapsed'
const SIDEBAR_GLOBAL_SEARCH_STATIC_RESULTS = [
  { id: 'section-dashboard', kind: 'section', label: 'Pulpit', meta: 'Sekcja', route: 'dashboard' },
  { id: 'section-events', kind: 'section', label: 'Zdarzenia', meta: 'Sekcja', route: 'events' },
  { id: 'section-orders', kind: 'section', label: 'Zlecenia', meta: 'Sekcja', route: 'orders' },
  { id: 'sub-orders-list', kind: 'subsection', label: 'Lista zleceń', meta: 'Podsekcja dział "Zlecenia"', route: 'orders' },
  { id: 'sub-orders-map', kind: 'subsection', label: 'Mapa', meta: 'Podsekcja dział "Zlecenia"', route: 'ordersMap' },
  { id: 'section-calendar', kind: 'section', label: 'Kalendarz', meta: 'Sekcja', route: 'calendar' },
  { id: 'section-kanban', kind: 'section', label: 'Centrum zadań', meta: 'Sekcja', route: 'kanban', kanbanSection: 'home' },
  { id: 'sub-kanban-home', kind: 'subsection', label: 'Strona główna', meta: 'Podsekcja dział "Centrum zadań"', route: 'kanban', kanbanSection: 'home' },
  { id: 'sub-kanban-tasks', kind: 'subsection', label: 'Moje zadania', meta: 'Podsekcja dział "Centrum zadań"', route: 'kanban', kanbanSection: 'tasks' },
  { id: 'sub-kanban-inbox', kind: 'subsection', label: 'Skrzynka odbiorcza', meta: 'Podsekcja dział "Centrum zadań"', route: 'kanban', kanbanSection: 'inbox' },
  { id: 'section-contract-profitability', kind: 'section', label: 'Rentowność kontraktów', meta: 'Sekcja', route: 'contractProfitability' },
  { id: 'section-clients', kind: 'section', label: 'Klienci', meta: 'Sekcja', route: 'clientProfile' },
  { id: 'sub-client-profile', kind: 'subsection', label: 'Profil klienta', meta: 'Podsekcja dział "Klienci"', route: 'clientProfile' },
  { id: 'section-objects', kind: 'section', label: 'Obiekty', meta: 'Sekcja', route: 'zones' },
  { id: 'sub-objects-zones', kind: 'subsection', label: 'Strefy / obiekty', meta: 'Podsekcja dział "Obiekty"', route: 'zones' },
  { id: 'sub-objects-audits', kind: 'subsection', label: 'Audyty', meta: 'Podsekcja dział "Obiekty"', route: 'audits' },
  { id: 'section-workers', kind: 'section', label: 'Pracownicy', meta: 'Sekcja', route: 'workerProfile' },
  { id: 'sub-worker-profile', kind: 'subsection', label: 'Lista pracowników', meta: 'Podsekcja dział "Pracownicy"', route: 'workerProfile' },
  { id: 'sub-workday-stop-proposals', kind: 'subsection', label: 'Godziny do weryfikacji', meta: 'Podsekcja dział "Pracownicy"', route: 'workdayStopProposals' },
  { id: 'section-reports', kind: 'section', label: 'Raporty', meta: 'Sekcja', route: 'reports', reportSection: 'home' },
  { id: 'sub-reports-dashboard', kind: 'subsection', label: 'Podsumowanie', meta: 'Podsekcja dział "Raporty"', route: 'reports', reportSection: 'podsumowanie' },
  { id: 'sub-reports-listings', kind: 'subsection', label: 'Zestawienia', meta: 'Podsekcja dział "Raporty"', route: 'reports', reportSection: 'zestawienia' },
  { id: 'sub-reports-analyses', kind: 'subsection', label: 'Analizy', meta: 'Podsekcja dział "Raporty"', route: 'reports', reportSection: 'analizy' },
  { id: 'sub-reports-ready', kind: 'subsection', label: 'Raporty gotowe', meta: 'Podsekcja dział "Raporty"', route: 'reports', reportSection: 'raporty-gotowe' },
  { id: 'sub-reports-mine', kind: 'subsection', label: 'Moje raporty', meta: 'Podsekcja dział "Raporty"', route: 'reports', reportSection: 'moje-raporty' },
  { id: 'section-settings', kind: 'section', label: 'Ustawienia', meta: 'Sekcja', route: 'settings' },
  { id: 'sub-settings-profile', kind: 'subsection', label: 'Profil', meta: 'Ustawienia · Moje konto', route: 'settingsProfile' },
  { id: 'sub-settings-notifications', kind: 'subsection', label: 'Powiadomienia', meta: 'Ustawienia · Moje konto', route: 'settingsNotifications' },
  { id: 'sub-settings-language-app', kind: 'subsection', label: 'Język i aplikacja', meta: 'Ustawienia · Moje konto', route: 'settingsLanguageApp' },
  { id: 'sub-settings-account-security', kind: 'subsection', label: 'Bezpieczeństwo konta', meta: 'Ustawienia · Moje konto', route: 'settingsAccountSecurity' },
  { id: 'sub-settings-organization-data', kind: 'subsection', label: 'Dane organizacji', meta: 'Ustawienia · Organizacja', route: 'settingsOrganizationData' },
  { id: 'sub-settings-alerts', kind: 'subsection', label: 'Alerty', meta: 'Ustawienia · Organizacja', route: 'settingsAlerts' },
  { id: 'sub-settings-integrations', kind: 'subsection', label: 'Integracje', meta: 'Ustawienia · Organizacja', route: 'settingsIntegrations' },
  { id: 'sub-settings-billing', kind: 'subsection', label: 'Subskrypcja i rozliczenia', meta: 'Ustawienia · Organizacja', route: 'settingsBilling' },
  { id: 'sub-settings-data-security', kind: 'subsection', label: 'Bezpieczeństwo i dane', meta: 'Ustawienia · Organizacja', route: 'settingsDataSecurity' },
]
const WORKER_DETAIL_COLUMN_WIDTHS_STORAGE_KEY = 'portal.workerDetailColumnWidths'
const GRID_COLUMN_RESIZE_CLASS = 'grid-col-resize-active'
const GRID_COLUMN_RESIZE_ATTR = 'data-grid-col-resizer'
const GRID_COLUMN_MAX_WIDTH = 780
const CALENDAR_STORAGE_PREFIX = 'portal.calendar.tasks'
const CALENDAR_HOUR_HEIGHT_PX = 56
const CALENDAR_TIMED_TASK_GAP_PX = 4
const CALENDAR_MIN_TIMED_TASK_HEIGHT_PX = 28
const CALENDAR_TIMED_TASK_OVERLAP_OFFSET_PX = 14
const CALENDAR_TIMELINE_SLOT_MINUTES = 15
const CALENDAR_TIMELINE_SLOTS_PER_HOUR = 60 / CALENDAR_TIMELINE_SLOT_MINUTES
const CALENDAR_TONE_OPTIONS = [
  { value: 'blue', label: 'Standard', css: 'blue' },
  { value: 'green', label: 'Gotowe / kontrola', css: 'green' },
  { value: 'amber', label: 'Pilne', css: 'amber' },
  { value: 'red', label: 'Problem', css: 'red' },
  { value: 'message', label: 'Wiadomość pracownika', css: 'message' },
]
const FLOATING_TABLE_SCROLL_SELECTOR =
  '#portalRoot :is(.events-table, .workers-table, .zones-table, .rep-tablewrap)'
const FLOATING_TABLE_SCROLL_CLOSEST_SELECTOR =
  '.events-table, .workers-table, .zones-table, .rep-tablewrap'
const BLOCKING_MODAL_SELECTORS = [
  '#evEditorOverlay',
  '#evCommentOverlay',
  '#calendarEditorOverlay',
  '#calendarTimelineRecurringScopeDialog',
  '#calendarTaskDeleteConfirmDialog',
  '#calendarTimelineConflictDialog',
  '#kanbanColumnOverlay',
  '#ordersMapOverlay',
  '#ordersDeviceNoteOverlay',
  '#repHistoryStopDayOverlay',
  '#repGeoOverlay',
]
const PORTAL_NOTIFICATION_ALERT_SELECTORS = [
  '#calendarTimelineStatusAlert',
  '#portalNotice',
]
const PORTAL_INTERACTION_FIELD_SELECTOR =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]'
const PORTAL_SETTINGS_ROUTES = new Set([
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
const PORTAL_ROUTE_VIEW_IDS = {
  dashboard: 'view-dashboard',
  calendar: 'view-calendar',
  kanban: 'view-kanban',
  contractProfitability: 'view-contractProfitability',
  events: 'view-events',
  orders: 'view-orders',
  ordersMap: 'view-ordersMap',
  managerObjects: 'view-managerObjects',
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
const PORTAL_ROUTE_FEATURE_KEYS = {
  dashboard: ['dashboard', 'reports', 'events', 'zones', 'clientProfile', 'workerTime', 'workerProfile', 'orders', 'kanban', 'calendar'],
  calendar: ['dashboard', 'reports', 'events', 'zones', 'clientProfile', 'workerTime', 'orders', 'calendar'],
  kanban: ['dashboard', 'reports', 'events', 'zones', 'clientProfile', 'workerTime', 'orders', 'calendar', 'kanban'],
  contractProfitability: ['contractProfitability'],
  events: ['dashboard', 'reports', 'zones', 'clientProfile', 'workerTime', 'events'],
  orders: ['dashboard', 'reports', 'events', 'zones', 'clientProfile', 'workerTime', 'orders', 'calendar'],
  ordersMap: ['dashboard', 'reports', 'events', 'zones', 'clientProfile', 'workerTime', 'orders', 'calendar'],
  managerObjects: ['facilityManagerObjects'],
  zones: ['zones'],
  workerProfile: ['dashboard', 'workerProfile'],
  workerAccount: ['dashboard', 'workerAccount'],
  workerTime: ['dashboard', 'workerTime'],
  workerTimeDetail: ['dashboard', 'workerTimeDetail'],
  workdayStopProposals: ['workdayStopProposals'],
  clientProfile: ['dashboard', 'clientProfile'],
  clientProfileDetails: ['dashboard', 'reports', 'events', 'zones', 'clientProfile', 'workerTime', 'orders', 'calendar'],
  reports: ['dashboard', 'events', 'zones', 'clientProfile', 'workerTime', 'reports'],
  settings: ['settings'],
  settingsProfile: ['settings'],
  settingsNotifications: ['settings'],
  settingsLanguageApp: ['settings'],
  settingsAccountSecurity: ['settings'],
  settingsOrganizationData: ['settings'],
  settingsAlerts: ['settings'],
  settingsIntegrations: ['settings'],
  settingsBilling: ['settings'],
  settingsDataSecurity: ['settings'],
}
const PORTAL_ROUTE_CAPABILITIES = Object.freeze({
  calendar: 'scheduling',
  orders: 'scheduling',
  ordersMap: 'scheduling',
  kanban: 'zoneTasks',
  audits: 'qualitySla',
})
const PORTAL_ROUTE_BIND_KEYS = {
  dashboard: 'dashboard',
  calendar: 'calendar',
  kanban: 'kanban',
  contractProfitability: 'contractProfitability',
  events: 'events',
  orders: 'orders:list',
  ordersMap: 'orders:map',
  managerObjects: 'facilityManagerObjects',
  zones: 'zones',
  workerProfile: 'workerProfile',
  workerAccount: 'workerAccount',
  workerTime: 'workerTime',
  workerTimeDetail: 'workerTimeDetail',
  workdayStopProposals: 'workdayStopProposals',
  clientProfile: 'clientProfile',
  clientProfileDetails: 'clientProfile:details',
  reports: 'reports',
  settings: 'settings',
  settingsProfile: 'settings',
  settingsNotifications: 'settings',
  settingsLanguageApp: 'settings',
  settingsAccountSecurity: 'settings',
  settingsOrganizationData: 'settings',
  settingsAlerts: 'settings',
  settingsIntegrations: 'settings',
  settingsBilling: 'settings',
  settingsDataSecurity: 'settings',
}
const PORTAL_ROUTE_LOADING_HTML = `
  <div class="portal-section-loading" role="status" aria-live="polite" aria-busy="true" style="min-height:240px;display:grid;place-items:center;padding:32px;">
    <div style="display:flex;align-items:center;gap:12px;color:#14305f;font-weight:800;">
      <span class="route-sync-spinner" aria-hidden="true"></span>
      <span>Synchronizuje dane...</span>
    </div>
  </div>
`
let portalFeatureContext = null
let portalNavigation = null
let portalNavigationRunId = 0
const portalFeaturePromises = new Map()
const portalTemplatePromises = new Map()
const portalMountedTemplates = new Set()
const portalRouteReadyPromises = new Map()
const portalRouteBindCleanups = new Map()

function normalizePortalRoute(route) {
  const normalizedRoute = String(route ?? '').trim()
  return normalizedRoute === 'coordinator' ? 'dashboard' : normalizedRoute
}

function portalRouteExists(route) {
  const normalizedRoute = normalizePortalRoute(route)
  if (!normalizedRoute) {
    return false
  }
  const requiredCapability = PORTAL_ROUTE_CAPABILITIES[normalizedRoute]
  if (requiredCapability && appState.session?.capabilities?.[requiredCapability] !== true) {
    return false
  }
  if (normalizedRoute === 'contractProfitability' && !canOpenContractProfitability()) {
    return false
  }

  return PORTAL_SETTINGS_ROUTES.has(normalizedRoute)
    || [...document.querySelectorAll('[data-route]')].some((node) => node?.dataset?.route === normalizedRoute)
}

function readStoredCurrentRoute() {
  try {
    const storedRoute = normalizePortalRoute(window.sessionStorage.getItem(CURRENT_ROUTE_STORAGE_KEY))
    return portalRouteExists(storedRoute) ? storedRoute : 'dashboard'
  } catch {
    return 'dashboard'
  }
}

function writeStoredCurrentRoute(route) {
  const normalizedRoute = normalizePortalRoute(route)
  if (!portalRouteExists(normalizedRoute)) {
    return
  }

  try {
    window.sessionStorage.setItem(CURRENT_ROUTE_STORAGE_KEY, normalizedRoute)
  } catch {
    // Ignore unavailable sessionStorage.
  }
}

function clearStoredCurrentRoute() {
  try {
    window.sessionStorage.removeItem(CURRENT_ROUTE_STORAGE_KEY)
  } catch {
    // Ignore unavailable sessionStorage.
  }
}

function portalElementIsVisible(node) {
  if (!(node instanceof HTMLElement) || node.hidden || node.getAttribute('aria-hidden') === 'true') {
    return false
  }

  const style = window.getComputedStyle(node)
  return style.display !== 'none' && style.visibility !== 'hidden'
}

function portalNodeMatchesAnySelector(node, selectors = []) {
  return selectors.some((selector) => {
    try {
      return Boolean(node?.matches?.(selector) || node?.closest?.(selector))
    } catch {
      return false
    }
  })
}

function isPortalNotificationAlertOpen() {
  return PORTAL_NOTIFICATION_ALERT_SELECTORS.some((selector) =>
    [...document.querySelectorAll(selector)].some((node) => portalElementIsVisible(node)),
  )
}

function isBlockingModalOpen() {
  const explicitModalOpen = BLOCKING_MODAL_SELECTORS.some((selector) =>
    [...document.querySelectorAll(selector)].some((node) => portalElementIsVisible(node)),
  )
  if (explicitModalOpen) {
    return true
  }

  const candidates = [
    ...document.querySelectorAll(
      '#portalRoot .overlay, #portalRoot [role="dialog"][aria-modal="true"], body > [role="dialog"][aria-modal="true"], body > [role="alertdialog"][aria-modal="true"], .calendar-conflict-dialog',
    ),
  ]

  return candidates.some(
    (node) =>
      node instanceof HTMLElement &&
      portalElementIsVisible(node) &&
      !portalNodeMatchesAnySelector(node, PORTAL_NOTIFICATION_ALERT_SELECTORS),
  )
}

function portalActiveElementIsEditing() {
  const root = document.getElementById('portalRoot')
  const active = document.activeElement
  if (!(root instanceof HTMLElement) || !(active instanceof HTMLElement) || !root.contains(active)) {
    return false
  }

  if (portalNodeMatchesAnySelector(active, PORTAL_NOTIFICATION_ALERT_SELECTORS)) {
    return false
  }

  return Boolean(active.closest(PORTAL_INTERACTION_FIELD_SELECTOR))
}

function portalGlobalSearchIsActive() {
  const root = document.getElementById('topbarGlobalSearch')
  const input = document.getElementById('topbarGlobalSearchInput')
  const results = document.getElementById('topbarGlobalSearchResults')
  const query = normalizeSearchText(input?.value)
  if (!query) {
    return false
  }

  const active = document.activeElement
  if (root instanceof HTMLElement && active instanceof HTMLElement && root.contains(active)) {
    return true
  }

  return portalElementIsVisible(results)
}

function isPortalInteractionBusy() {
  return isBlockingModalOpen() || portalActiveElementIsEditing() || portalGlobalSearchIsActive()
}

function portalDeferredNotificationCanRun(notification) {
  if (!notification || document.visibilityState !== 'visible') {
    return false
  }

  const requiredRoute = normalizePortalRoute(notification.requiredRoute)
  if (requiredRoute && appState.currentRoute !== requiredRoute) {
    return false
  }

  return !isPortalInteractionBusy() && !isPortalNotificationAlertOpen()
}

function schedulePortalDeferredNotificationFlush(delayMs = 700) {
  if (portalDeferredNotificationTimer) {
    window.clearTimeout(portalDeferredNotificationTimer)
  }

  portalDeferredNotificationTimer = window.setTimeout(() => {
    portalDeferredNotificationTimer = 0
    flushPortalDeferredNotifications()
  }, Math.max(0, Number(delayMs) || 0))
}

function queuePortalDeferredNotification(key, callback, options = {}) {
  const normalizedKey = String(key ?? '').trim()
  if (!normalizedKey || typeof callback !== 'function') {
    return
  }

  portalDeferredNotifications.set(normalizedKey, {
    callback,
    requiredRoute: normalizePortalRoute(options.requiredRoute),
    queuedAt: Date.now(),
  })
  schedulePortalDeferredNotificationFlush(700)
}

function clearPortalDeferredNotification(key) {
  const normalizedKey = String(key ?? '').trim()
  if (!normalizedKey) {
    return
  }

  portalDeferredNotifications.delete(normalizedKey)
}

function flushPortalDeferredNotifications() {
  if (!portalDeferredNotifications.size) {
    return
  }

  const runnable = [...portalDeferredNotifications.entries()].find(([, notification]) =>
    portalDeferredNotificationCanRun(notification),
  )

  if (!runnable) {
    schedulePortalDeferredNotificationFlush(1000)
    return
  }

  const [key, notification] = runnable
  portalDeferredNotifications.delete(key)
  try {
    notification.callback()
  } catch (error) {
    console.warn('[portal/notifications] deferred notification failed', error)
  }

  if (portalDeferredNotifications.size) {
    schedulePortalDeferredNotificationFlush(1000)
  }
}

function resetPortalState(overrides = {}) {
  calendarFeature?.clearRemoteTimelineOrderTimers?.()
  facilityManagerObjectsFeature?.resetSession?.()
  portalDeferredNotifications.clear()
  if (portalDeferredNotificationTimer) {
    window.clearTimeout(portalDeferredNotificationTimer)
    portalDeferredNotificationTimer = 0
  }
  if (routeSyncOverlayTimer) {
    window.clearTimeout(routeSyncOverlayTimer)
    routeSyncOverlayTimer = 0
  }
  routeSyncActiveCount = 0
  routeSyncMeta.clear()
  setRouteSyncOverlayVisible(false)
  return resetSessionState(overrides)
}

function cleanupRetiredSettingsStorage() {
  try {
    window.sessionStorage.removeItem('portal.settings.activeTab')
  } catch {
    // Retired storage cleanup must not block portal startup.
  }

  try {
    if (!window.indexedDB) {
      return
    }
    const request = window.indexedDB.deleteDatabase('portal-backups')
    request.onerror = () => {}
    request.onblocked = () => {}
  } catch {
    // Retired storage cleanup must not block portal startup.
  }
}

function parseGridPixelWidths(rawValue) {
  const raw = String(rawValue ?? '')
  const matches = raw.match(/-?\d+(?:\.\d+)?px/g)
  if (!matches?.length) {
    return []
  }

  return matches
    .map((item) => Math.round(Number.parseFloat(item)))
    .filter((value) => Number.isFinite(value) && value > 0)
}

function clampGridWidth(value, min, max, fallback) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }
  if (numeric < min) {
    return min
  }
  if (numeric > max) {
    return max
  }
  return Math.round(numeric)
}

function readStoredGridColumnWidths(storageKey) {
  const key = String(storageKey ?? '').trim()
  if (!key) {
    return []
  }

  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeGridColumnWidths(rawWidths, defaults, options = {}) {
  const source = Array.isArray(rawWidths) ? rawWidths : []
  const fallback = Array.isArray(defaults) ? defaults : []
  const count = Number(options.columnCount ?? fallback.length ?? source.length) || 0
  const minColumnWidth = Number(options.minColumnWidth ?? 64)
  const minWidths = Array.isArray(options.minWidths) ? options.minWidths : []
  const maxWidth = Number(options.maxWidth ?? GRID_COLUMN_MAX_WIDTH)

  return Array.from({ length: count }, (_, colIndex) => {
    const fallbackWidth = clampGridWidth(fallback[colIndex], 40, maxWidth, 120)
    const minWidthValue = Number(minWidths[colIndex])
    const minWidth =
      Number.isFinite(minWidthValue) && minWidthValue > 20 ? minWidthValue : Number.isFinite(minColumnWidth) ? minColumnWidth : 64
    return clampGridWidth(source[colIndex], minWidth, maxWidth, fallbackWidth)
  })
}

function buildGridTemplateFromWidths(widths = []) {
  return widths
    .map((width) => `${Math.max(24, Math.round(Number(width) || 0))}px`)
    .join(' ')
}

function inferGridDefaultWidths(tableNode, headNode, cssVarName, expectedColumns, explicitDefaults) {
  const expected = Number(expectedColumns) || 0
  if (expected <= 0) {
    return []
  }

  const defaults = Array.isArray(explicitDefaults) ? explicitDefaults.filter((value) => Number.isFinite(Number(value))) : []
  if (defaults.length === expected) {
    return defaults.map((value) => Math.round(Number(value)))
  }

  const cssVar = String(cssVarName ?? '').trim()
  if (cssVar) {
    const inlineVarWidths = parseGridPixelWidths(tableNode?.style?.getPropertyValue(cssVar))
    if (inlineVarWidths.length === expected) {
      return inlineVarWidths
    }

    const computedVarWidths = parseGridPixelWidths(window.getComputedStyle(tableNode).getPropertyValue(cssVar))
    if (computedVarWidths.length === expected) {
      return computedVarWidths
    }
  }

  const computedHeadWidths = parseGridPixelWidths(window.getComputedStyle(headNode).gridTemplateColumns)
  if (computedHeadWidths.length === expected) {
    return computedHeadWidths
  }

  return Array.from({ length: expected }, (_, index) => {
    const fromDefaults = Number(defaults[index])
    return Number.isFinite(fromDefaults) && fromDefaults > 0 ? Math.round(fromDefaults) : 120
  })
}

function setupResizableGridTable(options = {}) {
  const tableSelector = String(options.tableSelector ?? '').trim()
  const headSelector = String(options.headSelector ?? '').trim()
  const cssVarName = String(options.cssVarName ?? '').trim()
  const storageKey = String(options.storageKey ?? '').trim()

  if (!tableSelector || !headSelector || !cssVarName) {
    return () => {}
  }

  const tableNode = document.querySelector(tableSelector)
  const headNode = document.querySelector(headSelector)
  if (!(tableNode instanceof HTMLElement) || !(headNode instanceof HTMLElement)) {
    return () => {}
  }

  const headCells = [...headNode.children].filter((node) => node instanceof HTMLElement)
  const columnCount = headCells.length
  if (!columnCount) {
    return () => {}
  }

  const nonResizable = new Set(
    (Array.isArray(options.nonResizableIndexes) ? options.nonResizableIndexes : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0),
  )
  const maxWidth = Number(options.maxWidth ?? GRID_COLUMN_MAX_WIDTH)
  const autoFitToViewport = Boolean(options.autoFitToViewport)
  const enforceFullWidth = Boolean(options.enforceFullWidth)
  const defaultWidths = inferGridDefaultWidths(
    tableNode,
    headNode,
    cssVarName,
    columnCount,
    Array.isArray(options.defaultWidths) ? options.defaultWidths : [],
  )
  const storedWidths = readStoredGridColumnWidths(storageKey)
  let userCustomizedWidths = storedWidths.length > 0
  const widths = normalizeGridColumnWidths(storedWidths.length ? storedWidths : defaultWidths, defaultWidths, {
    columnCount,
    minColumnWidth: options.minColumnWidth,
    minWidths: options.minWidths,
    maxWidth,
  })
  const minWidths = normalizeGridColumnWidths([], defaultWidths, {
    columnCount,
    minColumnWidth: options.minColumnWidth,
    minWidths: options.minWidths,
    maxWidth,
  })

  const persistWidths = () => {
    if (!storageKey) {
      return
    }
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(widths))
    } catch {
      // Ignore storage write errors.
    }
  }

  const applyWidths = () => {
    tableNode.style.setProperty(cssVarName, buildGridTemplateFromWidths(widths))
    tableNode.classList.add('resizable-grid-table')
    headNode.classList.add('grid-resizable-head')
  }

  const fitWidthsToViewport = ({ persist = false } = {}) => {
    if (!autoFitToViewport) {
      return false
    }

    const tableWidth = Math.floor(tableNode.getBoundingClientRect().width || tableNode.clientWidth || 0)
    if (tableWidth <= 0) {
      return false
    }

    const computedHead = window.getComputedStyle(headNode)
    const headWidth = Math.floor(headNode.getBoundingClientRect().width || headNode.clientWidth || tableWidth)
    const paddingLeftPx = Math.max(0, Number.parseFloat(computedHead.paddingLeft || '0') || 0)
    const paddingRightPx = Math.max(0, Number.parseFloat(computedHead.paddingRight || '0') || 0)
    const contentWidth = Math.max(0, Math.min(tableWidth, headWidth) - paddingLeftPx - paddingRightPx)
    const columnGapPx = Math.max(0, Number.parseFloat(computedHead.columnGap || '0') || 0)
    const budget = Math.max(0, Math.floor(contentWidth - columnGapPx * Math.max(0, columnCount - 1)))
    if (budget <= 0) {
      return false
    }

    const indexes = Array.from({ length: columnCount }, (_, colIndex) => colIndex).filter(
      (colIndex) => !nonResizable.has(colIndex),
    )
    if (!indexes.length) {
      return false
    }

    const fixedSum = widths
      .map((value, colIndex) => (nonResizable.has(colIndex) ? Math.max(0, Number(value) || 0) : 0))
      .reduce((sum, value) => sum + value, 0)
    const targetAdjustableBudget = Math.max(0, budget - fixedSum)
    const currentAdjustable = indexes
      .map((colIndex) => Math.max(0, Number(widths[colIndex]) || 0))
      .reduce((sum, value) => sum + value, 0)
    if (currentAdjustable <= 0) {
      return false
    }

    const scaled = [...widths]
    const scale = targetAdjustableBudget / currentAdjustable
    indexes.forEach((colIndex) => {
      const rawWidth = Number(widths[colIndex]) || 0
      const minWidth = Math.max(24, Math.round(Number(minWidths[colIndex]) || 24))
      scaled[colIndex] = clampGridWidth(Math.round(rawWidth * scale), minWidth, maxWidth, rawWidth)
    })

    const sumScaledAdjustable = indexes.reduce((sum, colIndex) => sum + Math.max(0, Number(scaled[colIndex]) || 0), 0)
    let diff = targetAdjustableBudget - sumScaledAdjustable
    let guard = 0
    while (diff !== 0 && guard < 20000) {
      let changedInPass = false
      for (const colIndex of indexes) {
        if (diff === 0) {
          break
        }

        const minWidth = Math.max(24, Math.round(Number(minWidths[colIndex]) || 24))
        const currentWidth = Math.round(Number(scaled[colIndex]) || 0)
        if (diff > 0) {
          if (currentWidth >= maxWidth) {
            continue
          }
          scaled[colIndex] = currentWidth + 1
          diff -= 1
          changedInPass = true
          continue
        }

        if (currentWidth <= minWidth) {
          continue
        }
        scaled[colIndex] = currentWidth - 1
        diff += 1
        changedInPass = true
      }
      if (!changedInPass) {
        break
      }
      guard += 1
    }

    const changed = indexes.some((colIndex) => Math.round(Number(widths[colIndex]) || 0) !== Math.round(Number(scaled[colIndex]) || 0))
    if (!changed) {
      return false
    }

    indexes.forEach((colIndex) => {
      widths[colIndex] = Math.round(Number(scaled[colIndex]) || 0)
    })

    if (changed) {
      applyWidths()
      if (persist) {
        persistWidths()
      }
    }

    return changed
  }

  applyWidths()
  if (enforceFullWidth || !userCustomizedWidths) {
    fitWidthsToViewport({ persist: false })
  }

  headCells.forEach((cell, colIndex) => {
    cell.classList.add('grid-resizable-head-cell')
    if (colIndex >= columnCount - 1 || nonResizable.has(colIndex)) {
      return
    }
    if (cell.querySelector(`[${GRID_COLUMN_RESIZE_ATTR}]`)) {
      return
    }

    const handle = document.createElement('span')
    handle.className = 'grid-col-resizer'
    handle.setAttribute(GRID_COLUMN_RESIZE_ATTR, String(colIndex))
    handle.setAttribute('role', 'separator')
    handle.setAttribute('aria-orientation', 'vertical')
    handle.setAttribute('aria-label', 'Zmień szerokość kolumny')
    cell.appendChild(handle)
  })

  let dragState = null
  const stopDrag = ({ persist = true } = {}) => {
    if (!dragState) {
      return
    }

    window.removeEventListener('mousemove', dragState.onMove)
    window.removeEventListener('mouseup', dragState.onUp)
    document.body.classList.remove(GRID_COLUMN_RESIZE_CLASS)
    dragState = null
    if (persist) {
      persistWidths()
    }
  }

  const startDrag = (colIndex, startClientX) => {
    stopDrag({ persist: false })

    const index = Number(colIndex)
    if (!Number.isInteger(index) || index < 0 || index >= widths.length || nonResizable.has(index)) {
      return
    }

    const startWidth = Number(widths[index]) || defaultWidths[index] || 120
    const minWidth = normalizeGridColumnWidths([], defaultWidths, {
      columnCount,
      minColumnWidth: options.minColumnWidth,
      minWidths: options.minWidths,
      maxWidth,
    })[index]

    const onMove = (event) => {
      const delta = Number(event.clientX) - Number(startClientX)
      const nextWidth = clampGridWidth(startWidth + delta, minWidth, maxWidth, startWidth)
      if (widths[index] === nextWidth) {
        return
      }
      widths[index] = nextWidth
      applyWidths()
    }

    const onUp = () => {
      userCustomizedWidths = true
      if (enforceFullWidth) {
        fitWidthsToViewport({ persist: false })
      }
      stopDrag({ persist: true })
    }

    dragState = { onMove, onUp }
    document.body.classList.add(GRID_COLUMN_RESIZE_CLASS)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const onMouseDown = (event) => {
    const handle = event.target?.closest?.(`[${GRID_COLUMN_RESIZE_ATTR}]`)
    if (!(handle instanceof HTMLElement)) {
      return
    }

    const colIndex = Number(handle.getAttribute(GRID_COLUMN_RESIZE_ATTR))
    if (!Number.isInteger(colIndex)) {
      return
    }

    event.preventDefault()
    startDrag(colIndex, event.clientX)
  }

  tableNode.addEventListener('mousedown', onMouseDown)
  const onWindowResize = () => {
    if (enforceFullWidth || !userCustomizedWidths) {
      fitWidthsToViewport({ persist: false })
    }
  }
  window.addEventListener('resize', onWindowResize)

  return () => {
    tableNode.removeEventListener('mousedown', onMouseDown)
    window.removeEventListener('resize', onWindowResize)
    stopDrag({ persist: true })
  }
}

function setupFloatingTableScrollbar() {
  const scroller = document.createElement('div')
  scroller.id = 'portalFloatingXScroll'
  scroller.className = 'portal-floating-x-scroll'
  scroller.setAttribute('aria-hidden', 'true')

  const spacer = document.createElement('div')
  spacer.className = 'portal-floating-x-scroll-spacer'
  scroller.appendChild(spacer)

  const track = document.createElement('div')
  track.className = 'portal-floating-x-scroll-track'
  const thumb = document.createElement('div')
  thumb.className = 'portal-floating-x-scroll-thumb'
  track.appendChild(thumb)
  scroller.appendChild(track)
  document.body.appendChild(scroller)

  let activeTable = null
  let updateRaf = 0
  let syncingFromBar = false
  let syncingFromTable = false
  let barDragState = null

  const tableIsUsable = (node) => {
    if (!(node instanceof HTMLElement)) {
      return false
    }
    if (node.matches('#view-events .events-table')) {
      return false
    }
    const root = document.getElementById('portalRoot')
    if (!root?.contains(node)) {
      return false
    }
    const rect = node.getBoundingClientRect()
    return (
      node.offsetParent !== null &&
      node.scrollWidth > node.clientWidth + 2 &&
      rect.width > 80 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight
    )
  }

  const visibleScore = (node) => {
    const rect = node.getBoundingClientRect()
    const visibleTop = Math.max(0, rect.top)
    const visibleBottom = Math.min(window.innerHeight, rect.bottom)
    const visibleHeight = Math.max(0, visibleBottom - visibleTop)
    return visibleHeight * Math.max(0, Math.min(window.innerWidth, rect.right) - Math.max(0, rect.left))
  }

  const findBestTable = () => {
    if (tableIsUsable(activeTable)) {
      return activeTable
    }

    return [...document.querySelectorAll(FLOATING_TABLE_SCROLL_SELECTOR)]
      .filter((node) => tableIsUsable(node))
      .sort((left, right) => visibleScore(right) - visibleScore(left))[0] ?? null
  }

  const hide = () => {
    scroller.classList.remove('is-visible')
    activeTable = null
  }

  const maxScrollLeft = (node) => {
    if (!(node instanceof HTMLElement)) {
      return 0
    }
    return Math.max(0, Number(node.scrollWidth || 0) - Number(node.clientWidth || 0))
  }

  const updateVisualThumb = (table) => {
    if (!(table instanceof HTMLElement)) {
      return
    }
    const trackWidth = Math.max(0, track.getBoundingClientRect().width)
    const tableScrollWidth = Math.max(Number(table.scrollWidth || 0), Number(table.clientWidth || 0))
    const tableClientWidth = Math.max(0, Number(table.clientWidth || 0))
    const tableMax = maxScrollLeft(table)
    if (trackWidth < 24 || tableMax <= 0 || tableScrollWidth <= 0) {
      thumb.style.width = '0px'
      thumb.style.transform = 'translateX(0)'
      return
    }
    const thumbWidth = Math.max(58, Math.min(trackWidth, (tableClientWidth / tableScrollWidth) * trackWidth))
    const maxLeft = Math.max(0, trackWidth - thumbWidth)
    const left = tableMax > 0 ? Math.max(0, Math.min(maxLeft, (Number(table.scrollLeft || 0) / tableMax) * maxLeft)) : 0
    thumb.style.width = `${thumbWidth}px`
    thumb.style.transform = `translateX(${left}px)`
  }

  const syncBarPositionFromTable = (table) => {
    if (!(table instanceof HTMLElement)) {
      return
    }
    updateVisualThumb(table)
  }

  const syncTablePositionFromBar = (table) => {
    if (!(table instanceof HTMLElement)) {
      return
    }
    syncingFromBar = true
    table.scrollLeft = scroller.scrollLeft
    syncingFromBar = false
    updateVisualThumb(table)
  }

  const update = () => {
    updateRaf = 0
    const table = findBestTable()
    if (!(table instanceof HTMLElement)) {
      hide()
      return
    }

    activeTable = table
    const rect = table.getBoundingClientRect()
    const margin = 10
    const left = Math.max(margin, Math.floor(rect.left))
    const right = Math.min(window.innerWidth - margin, Math.ceil(rect.right))
    const width = Math.max(0, right - left)
    if (width < 96) {
      hide()
      return
    }

    spacer.style.width = `${Math.max(table.scrollWidth, table.clientWidth)}px`
    scroller.style.left = `${left}px`
    scroller.style.width = `${width}px`
    scroller.classList.add('is-visible')

    if (!syncingFromBar) {
      syncBarPositionFromTable(table)
    } else {
      updateVisualThumb(table)
    }
  }

  const scheduleUpdate = () => {
    if (updateRaf) {
      return
    }
    updateRaf = window.requestAnimationFrame(update)
  }

  const setActiveFromEvent = (event) => {
    const table = event.target?.closest?.(FLOATING_TABLE_SCROLL_CLOSEST_SELECTOR)
    if (tableIsUsable(table)) {
      activeTable = table
      scheduleUpdate()
    }
  }

  const handleDocumentScroll = (event) => {
    const table = event.target?.closest?.(FLOATING_TABLE_SCROLL_CLOSEST_SELECTOR)
    if (tableIsUsable(table)) {
      activeTable = table
      if (!syncingFromBar) {
        syncBarPositionFromTable(table)
      }
    }
    scheduleUpdate()
  }

  const handleBarScroll = () => {
    if (!(activeTable instanceof HTMLElement) || syncingFromTable) {
      return
    }
    syncTablePositionFromBar(activeTable)
  }

  const handleBarPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) {
      return
    }
    const table = tableIsUsable(activeTable) ? activeTable : findBestTable()
    if (!(table instanceof HTMLElement) || maxScrollLeft(table) <= 0) {
      return
    }
    const trackRect = track.getBoundingClientRect()
    const thumbRect = thumb.getBoundingClientRect()
    const trackWidth = Math.max(0, trackRect.width)
    const thumbWidth = Math.max(1, thumbRect.width)
    const maxLeft = Math.max(1, trackWidth - thumbWidth)
    const target = event.target instanceof HTMLElement ? event.target : null
    const grabbedThumb = Boolean(target?.closest?.('.portal-floating-x-scroll-thumb'))
    const pointerX = Number(event.clientX || 0)
    const clickOffset = grabbedThumb
      ? Math.max(0, Math.min(thumbWidth, pointerX - thumbRect.left))
      : thumbWidth / 2
    activeTable = table
    barDragState = {
      pointerId: event.pointerId,
      clickOffset,
      maxLeft,
      tableMax: maxScrollLeft(table),
      trackLeft: trackRect.left,
    }
    scroller.classList.add('is-dragging')
    track.classList.add('is-dragging')
    if (typeof track.setPointerCapture === 'function' && event.pointerId !== undefined) {
      try {
        track.setPointerCapture(event.pointerId)
      } catch {
        // Ignore pointer capture errors on browsers with native scrollbar handling.
      }
    }
    handleBarPointerMove(event)
    event.preventDefault()
  }

  const handleBarPointerMove = (event) => {
    if (!barDragState || barDragState.pointerId !== event.pointerId || !(activeTable instanceof HTMLElement)) {
      return
    }
    const rawLeft = Number(event.clientX || 0) - barDragState.trackLeft - barDragState.clickOffset
    const thumbLeft = Math.max(0, Math.min(barDragState.maxLeft, rawLeft))
    const nextScroll = (thumbLeft / barDragState.maxLeft) * barDragState.tableMax

    syncingFromBar = true
    activeTable.scrollLeft = nextScroll
    syncingFromBar = false

    syncBarPositionFromTable(activeTable)
    event.preventDefault()
  }

  const stopBarDrag = (event) => {
    if (!barDragState || (event?.pointerId !== undefined && barDragState.pointerId !== event.pointerId)) {
      return
    }
    const pointerId = barDragState.pointerId
    barDragState = null
    scroller.classList.remove('is-dragging')
    track.classList.remove('is-dragging')
    if (typeof track.releasePointerCapture === 'function' && pointerId !== undefined) {
      try {
        track.releasePointerCapture(pointerId)
      } catch {
        // Ignore release errors for pointers captured by another element.
      }
    }
  }

  const handleResize = () => {
    scheduleUpdate()
  }

  const observer = new MutationObserver(() => {
    scheduleUpdate()
  })
  const root = document.getElementById('portalRoot')
  if (root) {
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
  }

  document.addEventListener('pointerover', setActiveFromEvent, true)
  document.addEventListener('focusin', setActiveFromEvent, true)
  document.addEventListener('mousedown', setActiveFromEvent, true)
  document.addEventListener('touchstart', setActiveFromEvent, true)
  document.addEventListener('scroll', handleDocumentScroll, true)
  window.addEventListener('resize', handleResize)
  scroller.addEventListener('scroll', handleBarScroll)
  track.addEventListener('pointerdown', handleBarPointerDown)
  track.addEventListener('pointermove', handleBarPointerMove)
  track.addEventListener('pointerup', stopBarDrag)
  track.addEventListener('pointercancel', stopBarDrag)

  scheduleUpdate()

  return () => {
    if (updateRaf) {
      window.cancelAnimationFrame(updateRaf)
    }
    observer.disconnect()
    document.removeEventListener('pointerover', setActiveFromEvent, true)
    document.removeEventListener('focusin', setActiveFromEvent, true)
    document.removeEventListener('mousedown', setActiveFromEvent, true)
    document.removeEventListener('touchstart', setActiveFromEvent, true)
    document.removeEventListener('scroll', handleDocumentScroll, true)
    window.removeEventListener('resize', handleResize)
    scroller.removeEventListener('scroll', handleBarScroll)
    track.removeEventListener('pointerdown', handleBarPointerDown)
    track.removeEventListener('pointermove', handleBarPointerMove)
    track.removeEventListener('pointerup', stopBarDrag)
    track.removeEventListener('pointercancel', stopBarDrag)
    scroller.remove()
  }
}

function readStoredSidebarCollapsed() {
  try {
    const raw = window.sessionStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY)
    if (raw === '1') {
      return true
    }
    if (raw === '0') {
      return false
    }
  } catch {
    // Ignore storage read errors in locked/private contexts.
  }
  return null
}

function sidebarIsTabletViewport() {
  const width = Number(window.innerWidth || document.documentElement?.clientWidth || 0)
  return width >= 761 && width <= 1180
}

function sidebarIsMobileViewport() {
  const width = Number(window.innerWidth || document.documentElement?.clientWidth || 0)
  return width > 0 && width <= 760
}

function applySidebarRouteTitles() {
  document.querySelectorAll('#portalSidebar [data-route], #portalSidebar [data-toggle]').forEach((button) => {
    const label = String(button.querySelector('.mi-label')?.textContent ?? '').trim()
    if (!label) {
      return
    }
    button.setAttribute('title', label)
  })
}

function setSidebarCollapsed(collapsed, { persist = true } = {}) {
  const root = document.getElementById('portalRoot')
  if (!root) {
    return
  }

  const nextCollapsed = Boolean(collapsed)
  root.classList.toggle('sidebar-collapsed', nextCollapsed)
  root.dataset.sidebarCollapsed = nextCollapsed ? '1' : '0'

  const toggleButton = document.getElementById('sidebarToggleBtn')
  if (toggleButton instanceof HTMLButtonElement) {
    const label = nextCollapsed ? 'Rozwin menu' : 'Zwin menu'
    toggleButton.setAttribute('aria-label', label)
    toggleButton.setAttribute('title', label)
    toggleButton.setAttribute('aria-pressed', nextCollapsed ? 'true' : 'false')
  }

  if (nextCollapsed) {
    document.querySelectorAll('#portalSidebar .submenu.open').forEach((submenu) => {
      submenu.classList.remove('open')
    })
    sidebarGlobalSearchClose()
  }

  if (!persist) {
    return
  }

  try {
    window.sessionStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, nextCollapsed ? '1' : '0')
  } catch {
    // Ignore storage write errors.
  }
}

function bindSidebarCollapseToggle() {
  const toggleButton = document.getElementById('sidebarToggleBtn')
  applySidebarRouteTitles()

  const stored = readStoredSidebarCollapsed()
  const defaultCollapsed = sidebarIsMobileViewport() || (stored == null ? sidebarIsTabletViewport() : stored)
  setSidebarCollapsed(defaultCollapsed, { persist: false })

  if (!(toggleButton instanceof HTMLButtonElement)) {
    return () => {}
  }

  const handleClick = () => {
    const root = document.getElementById('portalRoot')
    const isCollapsed = Boolean(root?.classList.contains('sidebar-collapsed'))
    setSidebarCollapsed(!isCollapsed)
  }

  const handleResize = () => {
    if (sidebarIsMobileViewport()) {
      setSidebarCollapsed(true, { persist: false })
      return
    }

    if (readStoredSidebarCollapsed() != null) {
      return
    }

    setSidebarCollapsed(sidebarIsTabletViewport(), { persist: false })
  }

  toggleButton.addEventListener('click', handleClick)
  window.addEventListener('resize', handleResize)

  return () => {
    toggleButton.removeEventListener('click', handleClick)
    window.removeEventListener('resize', handleResize)
  }
}

function showTransientNotice(message, type = 'success', options = {}) {
  const text = String(message ?? '').trim()
  if (!text) {
    return
  }

  let notice = document.getElementById('portalNotice')
  if (!notice) {
    notice = document.createElement('div')
    notice.id = 'portalNotice'
    notice.className = 'portal-notice'
    document.body.appendChild(notice)
  }

  notice.textContent = text
  const noticeClasses = ['portal-notice', 'show', type === 'error' ? 'error' : 'success']
  if (options?.size === 'large') {
    noticeClasses.push('is-large')
  }
  notice.className = noticeClasses.join(' ')

  if (portalNoticeTimer) {
    window.clearTimeout(portalNoticeTimer)
  }

  portalNoticeTimer = window.setTimeout(() => {
    notice?.classList.remove('show')
  }, type === 'error' ? 7000 : options?.size === 'large' ? 4500 : 3000)
}

function formatErrorNoticeMessage(error, fallback = 'Wystąpił nieoczekiwany błąd.') {
  const candidates = [
    error instanceof Error ? error.message : '',
    typeof error === 'string' ? error : '',
    typeof error?.message === 'string' ? error.message : '',
  ]
  const message = candidates.map((value) => String(value ?? '').trim()).find(Boolean)
  if (message) {
    const normalized = message.toLowerCase()
    if (normalized.includes('operation') && normalized.includes('not found') && normalized.includes('tasksfororg')) {
      return 'Operacja Data Connect TasksForOrg nie jest jeszcze wdrożona w Firebase. Wdróż connector Data Connect i odśwież portal.'
    }

    if (message.startsWith('{')) {
      try {
        const parsed = JSON.parse(message)
        const parsedMessage = String(parsed?.error?.message ?? parsed?.message ?? '').trim()
        const parsedStatus = String(parsed?.error?.status ?? parsed?.status ?? '').trim()
        const parsedNormalized = parsedMessage.toLowerCase()
        if (parsedNormalized.includes('operation') && parsedNormalized.includes('not found')) {
          return `Operacja Data Connect ${parsedMessage.replace(/^operation\s+/i, '')} nie jest jeszcze wdrożona w Firebase. Wdróż connector Data Connect i odśwież portal.`
        }
        if (parsedMessage) {
          return parsedStatus ? `${parsedMessage} (${parsedStatus})` : parsedMessage
        }
      } catch {
        // fall through to the raw message below
      }
    }
  }
  return message && message !== '[object Object]' ? message : fallback
}

function showPortalErrorNotice(prefix, error, fallback) {
  const intro = String(prefix ?? '').trim() || 'Wystąpił błąd.'
  const detail = formatErrorNoticeMessage(error, fallback)
  const normalizedIntro = /[.!?]$/.test(intro) ? intro : `${intro}.`
  showTransientNotice(`${normalizedIntro} ${detail}`, 'error')
}

function setRouteSyncOverlayVisible(active, label = 'Synchronizuje dane...') {
  const overlay = document.getElementById('routeSyncOverlay')
  if (!overlay) {
    return
  }

  const text = document.getElementById('routeSyncText')
  if (text) {
    text.textContent = String(label ?? '').trim() || 'Synchronizuje dane...'
  }

  overlay.hidden = !active
  overlay.setAttribute('aria-busy', active ? 'true' : 'false')
  overlay.setAttribute('aria-hidden', active ? 'false' : 'true')
}

function beginRouteSync(label = 'Synchronizuje dane...', options = {}) {
  const delayMs = Number.isFinite(Number(options.delayMs))
    ? Math.max(0, Number(options.delayMs))
    : DATA_SYNC_OVERLAY_DELAY_MS
  const minVisibleMs = Number.isFinite(Number(options.minVisibleMs))
    ? Math.max(0, Number(options.minVisibleMs))
    : 0
  routeSyncActiveCount += 1

  let shownAt = 0

  const showOverlay = () => {
    if (routeSyncActiveCount <= 0) {
      return
    }
    shownAt = Date.now()
    setRouteSyncOverlayVisible(true, label)
  }

  if (routeSyncActiveCount === 1 && typeof window !== 'undefined') {
    if (routeSyncOverlayTimer) {
      window.clearTimeout(routeSyncOverlayTimer)
      routeSyncOverlayTimer = 0
    }

    if (delayMs <= 0) {
      showOverlay()
    } else {
      routeSyncOverlayTimer = window.setTimeout(() => {
        routeSyncOverlayTimer = 0
        showOverlay()
      }, delayMs)
    }
  }

  let ended = false
  return () => {
    if (ended) {
      return
    }
    ended = true
    routeSyncActiveCount = Math.max(0, routeSyncActiveCount - 1)
    if (routeSyncActiveCount > 0) {
      return
    }

    if (routeSyncOverlayTimer && typeof window !== 'undefined') {
      window.clearTimeout(routeSyncOverlayTimer)
      routeSyncOverlayTimer = 0
    }

    if (minVisibleMs > 0 && shownAt > 0 && typeof window !== 'undefined') {
      const remainingMs = minVisibleMs - (Date.now() - shownAt)
      if (remainingMs > 0) {
        window.setTimeout(() => {
          if (routeSyncActiveCount === 0) {
            setRouteSyncOverlayVisible(false)
          }
        }, remainingMs)
        return
      }
    }

    setRouteSyncOverlayVisible(false)
  }
}

async function runRouteSync(task, options = {}) {
  const label = String(options.label ?? 'Synchronizuje dane...').trim() || 'Synchronizuje dane...'
  const endSync = options.showOverlay === false ? () => {} : beginRouteSync(label)
  try {
    const result = await Promise.resolve().then(task)
    if (options.route) {
      markRouteSyncLoaded(options.route)
    }
    return result
  } catch (error) {
    console.warn('[portal/sync] route data sync failed', error)
    if (options.noticeOnError !== false) {
      showPortalErrorNotice('Nie udało się zsynchronizować danych widoku', error)
    }
    return null
  } finally {
    endSync()
  }
}

function normalizeRouteSyncPolicy(policy = '') {
  const normalized = String(policy || '').trim()
  if (normalized === ROUTE_SYNC_POLICY_FORCE || normalized === ROUTE_SYNC_POLICY_BACKGROUND) {
    return normalized
  }
  return ROUTE_SYNC_POLICY_STALE_FIRST
}

function routeSyncKey(route) {
  return normalizeNavigationRoute(String(route ?? '').trim()) || 'dashboard'
}

function organizationKindForSession(session = appState.session) {
  return String(session?.organizationKind ?? '').trim().toUpperCase()
}

function isFacilityManagerSession(session = appState.session) {
  return organizationKindForSession(session) === 'FACILITY_MANAGER'
}

function applyOrganizationKindUi(session = null) {
  const organizationKind = organizationKindForSession(session)
  const root = document.getElementById('portalRoot')
  const managerNavigation = document.getElementById('facilityManagerSidebarNav')
  if (root) {
    if (organizationKind) root.dataset.organizationKind = organizationKind
    else delete root.dataset.organizationKind
  }
  if (managerNavigation) {
    managerNavigation.hidden = organizationKind !== 'FACILITY_MANAGER'
  }
}

function normalizeNavigationRoute(route) {
  const normalizedRoute = normalizePortalRoute(route)
  if (isFacilityManagerSession() && normalizedRoute !== 'managerObjects') {
    return 'managerObjects'
  }
  if (normalizedRoute === 'clientsList') {
    return 'clientProfile'
  }
  return normalizedRoute || 'dashboard'
}

function finishAfterNextRoutePaint(callback) {
  if (typeof callback !== 'function') {
    return
  }
  if (typeof window === 'undefined') {
    callback()
    return
  }
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(callback)
    })
    return
  }
  window.setTimeout(callback, 0)
}

function waitForRoutePaint() {
  if (typeof window === 'undefined') {
    return Promise.resolve()
  }
  if (typeof window.requestAnimationFrame !== 'function') {
    return new Promise((resolve) => window.setTimeout(resolve, 0))
  }
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve)
    })
  })
}

function getRouteSyncMeta(route) {
  const key = routeSyncKey(route)
  const existing = routeSyncMeta.get(key)
  if (existing) {
    return existing
  }
  const meta = { loadedAt: 0, inFlight: null }
  routeSyncMeta.set(key, meta)
  return meta
}

function markRouteSyncLoaded(route) {
  const meta = getRouteSyncMeta(route)
  meta.loadedAt = Date.now()
}
function markDashboardRouteStale() {
  const meta = getRouteSyncMeta('dashboard')
  meta.loadedAt = 0
  appState.dashboardBackgroundDataLoaded = false
  appState.dashboardForceRefreshOnNextOpen = true
}
function shouldRefreshRoute(route, staleMs = ROUTE_SYNC_STALE_MS) {
  const meta = getRouteSyncMeta(route)
  if (meta.inFlight) {
    return false
  }
  if (!meta.loadedAt) {
    return true
  }
  return Date.now() - meta.loadedAt > staleMs
}

function routeHasUsableData(route) {
  const normalizedRoute = routeSyncKey(route)
  const meta = routeSyncMeta.get(normalizedRoute)
  if (meta?.loadedAt) {
    return true
  }
  if (PORTAL_SETTINGS_ROUTES.has(normalizedRoute)) {
    return true
  }

  switch (normalizedRoute) {
    case 'dashboard':
      return Array.isArray(appState.dashboardTodayRows) && appState.dashboardTodayRows.length > 0
    case 'calendar':
    case 'kanban':
      return appState.calendarRemoteTasksLoaded === true || (Array.isArray(appState.calendarTasks) && appState.calendarTasks.length > 0)
    case 'contractProfitability':
      return Boolean(contractProfitabilityFeature)
    case 'events':
      return Array.isArray(appState.eventRows) && appState.eventRows.length > 0
    case 'orders':
    case 'ordersMap':
      return appState.calendarTimelineOrdersRemoteLoaded === true || (Array.isArray(appState.calendarTimelineDemoOrders) && appState.calendarTimelineDemoOrders.length > 0)
    case 'clientsList':
    case 'clientProfile':
      return appState.clientsLoaded === true || (Array.isArray(appState.clientProfileRows) && appState.clientProfileRows.length > 0) || (Array.isArray(appState.clients) && appState.clients.length > 0)
    case 'clientProfileDetails':
      return Boolean(appState.clientProfileCurrent) || routeHasUsableData('clientProfile')
    case 'zones':
      return appState.zonesLoaded === true || (Array.isArray(appState.zones) && appState.zones.length > 0)
    case 'workerTime':
    case 'workerProfile':
    case 'workerAccount':
      return appState.workersLoaded === true || (Array.isArray(appState.workers) && appState.workers.length > 0) || (Array.isArray(appState.workerTimeRows) && appState.workerTimeRows.length > 0) || (Array.isArray(appState.workerProfileRows) && appState.workerProfileRows.length > 0)
    case 'workerTimeDetail':
      return (Array.isArray(appState.workerDetailRows) && appState.workerDetailRows.length > 0) || (Array.isArray(appState.workerDetailSourceRows) && appState.workerDetailSourceRows.length > 0)
    case 'workdayStopProposals':
      return Boolean(workdayStopProposalsFeature)
    case 'reports':
      return true
    default:
      return false
  }
}

function runRouteBackgroundSync(route, task, options = {}) {
  const key = routeSyncKey(route)
  const meta = getRouteSyncMeta(key)
  if (meta.inFlight) {
    return meta.inFlight
  }

  const inFlight = runRouteSync(task, {
    route: key,
    label: options.label ?? 'Synchronizuje dane...',
    noticeOnError: options.noticeOnError === true,
    showOverlay: false,
  }).finally(() => {
    const latest = getRouteSyncMeta(key)
    if (latest.inFlight === inFlight) {
      latest.inFlight = null
    }
  })

  meta.inFlight = inFlight
  return inFlight
}
function isoToLocalDateTimeInput(value) {
  const iso = toIso(value)
  if (!iso) {
    return ''
  }

  const date = new Date(iso)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function localDateTimeInputToIso(value) {
  const raw = String(value ?? '').trim()
  if (!raw) {
    return ''
  }

  const date = new Date(raw)
  if (!Number.isFinite(date.getTime())) {
    return ''
  }

  return date.toISOString()
}

function localDateAndTimeInputToIso(dateYmd, timeValue) {
  const day = String(dateYmd ?? '').trim()
  const time = String(timeValue ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) {
    return ''
  }

  return localDateTimeInputToIso(`${day}T${time}`)
}

function ymdToDayTimestamp(value) {
  const raw = String(value ?? '').trim()
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return 0
  }

  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const ts = new Date(year, month, day).getTime()
  return Number.isFinite(ts) ? ts : 0
}

function firstDayOfCurrentMonthYmd() {
  return `${todayYmd().slice(0, 7)}-01`
}

function ymdToIsoRangeStart(ymd) {
  return ymdToWarsawIsoRangeStart(ymd)
}

function ymdToIsoRangeEnd(ymd) {
  return ymdToWarsawIsoRangeEnd(ymd)
}

function calendarDateFromYmd(ymd) {
  const value = String(ymd ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date()
  }
  return new Date(Number(value.slice(0, 4)), Number(value.slice(5, 7)) - 1, Number(value.slice(8, 10)))
}

function calendarDateToYmd(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue)
  if (!Number.isFinite(date.getTime())) {
    return todayYmd()
  }
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function calendarAddDays(ymd, days) {
  const date = calendarDateFromYmd(ymd)
  date.setDate(date.getDate() + Number(days || 0))
  return calendarDateToYmd(date)
}

function calendarStartOfWeek(ymd) {
  const date = calendarDateFromYmd(ymd)
  const mondayOffset = (date.getDay() + 6) % 7
  date.setDate(date.getDate() - mondayOffset)
  return calendarDateToYmd(date)
}

function calendarMonthStart(ymd) {
  const date = calendarDateFromYmd(ymd)
  date.setDate(1)
  return calendarDateToYmd(date)
}

function calendarMonthGridStart(ymd) {
  return calendarStartOfWeek(calendarMonthStart(ymd))
}

function calendarMonthLabel(ymd) {
  const date = calendarDateFromYmd(ymd)
  return date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })
}

function calendarDayShortLabel(ymd) {
  const date = calendarDateFromYmd(ymd)
  return date.toLocaleDateString('pl-PL', { weekday: 'short' })
}

function calendarDayNumberLabel(ymd) {
  const date = calendarDateFromYmd(ymd)
  return String(date.getDate())
}

function calendarDayToneClass(dayKey, dayIndex = 0) {
  const weekDay = calendarDateFromYmd(dayKey).getDay()
  if (weekDay === 0 || weekDay === 6) {
    return 'weekend'
  }
  return dayIndex % 2 === 0 ? 'light' : 'dark'
}

function calendarStorageKey() {
  const orgId = String(appState.session?.orgId ?? '').trim() || 'local'
  return `${CALENDAR_STORAGE_PREFIX}:${orgId}`
}

function calendarHasAssignedWorkers(workers = []) {
  return calendarSelectionLabels(workers).length > 0
}

function calendarWorkerLabel(worker = {}) {
  return String(
    worker.workerName ??
      worker.workername ??
      worker.worker_name ??
      worker.name ??
      worker.displayName ??
      worker.fullName ??
      worker.login ??
      worker.email ??
      worker.id ??
      '',
  ).trim()
}

function calendarWorkerId(worker = {}) {
  return String(worker.workerId ?? worker.id ?? worker.login ?? worker.workerLogin ?? worker.email ?? '').trim()
}

function workerActiveFlag(value, defaultValue = true) {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  const normalized = normalizeSearchText(value)
  if (!normalized) {
    return defaultValue
  }
  if (['false', '0', 'no', 'nie', 'inactive', 'disabled', 'nieaktywny', 'nieaktywna'].includes(normalized)) {
    return false
  }
  if (['true', '1', 'yes', 'tak', 'active', 'aktywny', 'aktywna', 'enabled'].includes(normalized)) {
    return true
  }
  return defaultValue
}

function workerIsAssignable(worker = {}) {
  if (!worker || typeof worker !== 'object' || Array.isArray(worker)) {
    return false
  }
  const activeFields = [worker.active, worker.isActive, worker.enabled, worker.status, worker.workerStatus, worker.state]
  for (const value of activeFields) {
    if (value === undefined || value === null || String(value).trim() === '') {
      continue
    }
    const parsed = workerActiveFlag(value, null)
    if (parsed === false) {
      return false
    }
  }
  return true
}

function filterAssignableWorkers(workers = []) {
  return (Array.isArray(workers) ? workers : []).filter((worker) => workerIsAssignable(worker))
}

function calendarObjectLabel(object = {}) {
  return String(
    object.name ??
      object.clientName ??
      object.objectName ??
      object.nazwa ??
      object.companyName ??
      object.shortName ??
      object.id ??
      '',
  ).trim()
}

function calendarObjectId(object = {}) {
  return String(object.id ?? object.clientId ?? object.objectId ?? object.code ?? '').trim()
}

function calendarDirectoryOptions(kind = 'workers') {
  const source = kind === 'objects' ? appState.clients : filterAssignableWorkers(appState.workers)
  const seen = new Set()
  return (Array.isArray(source) ? source : [])
    .map((item) => {
      const label = kind === 'objects' ? calendarObjectLabel(item) : calendarWorkerLabel(item)
      const rawId = kind === 'objects' ? calendarObjectId(item) : calendarWorkerId(item)
      const id = kind === 'objects' ? `client:${rawId || label}` : rawId
      return { id, label }
    })
    .filter((option) => {
      if (!option.label) {
        return false
      }
      const key = normalizeSearchText(option.id || option.label)
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))
}

function calendarNormalizeSelectionList(rawValue = [], fallbackText = '') {
  const rawItems = Array.isArray(rawValue)
    ? rawValue
    : String(rawValue ?? '')
        .split(/[;\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
  const fallbackItems = !rawItems.length
    ? String(fallbackText ?? '')
        .split(/[;\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : []
  const seen = new Set()
  return [...rawItems, ...fallbackItems]
    .map((item) => {
      if (typeof item === 'object' && item !== null) {
        const label = String(item.label ?? item.name ?? item.title ?? item.value ?? '').trim()
        const id = String(item.id ?? item.value ?? '').trim()
        return { id, label }
      }
      return { id: '', label: String(item ?? '').trim() }
    })
    .filter((item) => {
      if (!item.label) {
        return false
      }
      const key = normalizeSearchText(item.id || item.label)
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
}

function calendarNormalizeTaskReadReceipts(rawValue = []) {
  const source = Array.isArray(rawValue)
    ? rawValue
    : rawValue && typeof rawValue === 'object'
      ? Object.values(rawValue)
      : []
  const seen = new Set()
  return source
    .map((item) => {
      const sourceItem = item && typeof item === 'object' ? item : { label: item }
      const id = String(sourceItem.id ?? sourceItem.userId ?? sourceItem.workerId ?? sourceItem.login ?? sourceItem.email ?? '').trim()
      const label = String(sourceItem.label ?? sourceItem.name ?? sourceItem.workerName ?? sourceItem.by ?? sourceItem.email ?? id).trim()
      const at = toIso(sourceItem.at ?? sourceItem.readAt ?? sourceItem.seenAt ?? sourceItem.timestamp) || ''
      const key = normalizeSearchText(id || label)
      if (!key || !label) {
        return null
      }
      return { id, label, at }
    })
    .filter(Boolean)
    .filter((receipt) => {
      const key = normalizeSearchText(receipt.id || receipt.label)
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
}

function calendarMergeTaskReadReceipts(...receiptLists) {
  const byKey = new Map()
  receiptLists.flatMap((list) => calendarNormalizeTaskReadReceipts(list)).forEach((receipt) => {
    const key = normalizeSearchText(receipt.id || receipt.label)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, receipt)
      return
    }
    const existingTime = Date.parse(existing.at || '')
    const nextTime = Date.parse(receipt.at || '')
    if ((Number.isFinite(nextTime) ? nextTime : 0) >= (Number.isFinite(existingTime) ? existingTime : 0)) {
      byKey.set(key, {
        ...existing,
        ...receipt,
        id: receipt.id || existing.id,
        label: receipt.label || existing.label,
      })
    }
  })
  return [...byKey.values()].sort((left, right) => String(left.label).localeCompare(String(right.label), 'pl', { sensitivity: 'base' }))
}

function calendarNormalizeZoneSelection(rawZone = null, fallbackId = '', fallbackLabel = '', fallbackLocation = '') {
  if (typeof rawZone === 'object' && rawZone !== null) {
    const id = String(rawZone.id ?? rawZone.zoneId ?? rawZone.value ?? '').trim()
    const label = String(rawZone.label ?? rawZone.zoneName ?? rawZone.name ?? rawZone.value ?? '').trim()
    const clientLabel = String(rawZone.clientLabel ?? rawZone.clientName ?? '').trim()
    const location = String(rawZone.location ?? rawZone.zoneLocation ?? rawZone.lokalizacja ?? '').trim()
    return label || id ? { id, label: label || id, clientLabel, location } : null
  }
  const id = String(rawZone || fallbackId || '').trim()
  const label = String(fallbackLabel || rawZone || fallbackId || '').trim()
  const location = String(fallbackLocation ?? '').trim()
  return label || id ? { id, label: label || id, clientLabel: '', location } : null
}

function calendarClientSelectionKeys(objects = []) {
  const selections = calendarNormalizeSelectionList(objects)
  const ids = new Set()
  const labels = new Set()
  selections.forEach((selection) => {
    const id = String(selection.id ?? '').replace(/^client:/, '').trim()
    const label = String(selection.label ?? '').trim()
    if (id) {
      ids.add(normalizeSearchText(id))
    }
    if (label) {
      labels.add(normalizeSearchText(label))
    }
  })
  return { ids, labels, hasSelection: selections.length > 0 }
}

function calendarZoneOptionsForClients(objects = []) {
  const { ids, labels, hasSelection } = calendarClientSelectionKeys(objects)
  if (!hasSelection) {
    return []
  }
  const seen = new Set()
  return (Array.isArray(appState.zones) ? appState.zones : [])
    .map((zone) => mapZoneForView(zone))
    .filter((zone) => !isUnassignedCleanZone(zone))
    .filter((zone) => {
      const clientId = normalizeSearchText(zone.clientId)
      const clientName = normalizeSearchText(zone.clientName)
      return ids.has(clientId) || labels.has(clientName) || ids.has(clientName) || labels.has(clientId)
    })
    .map((zone) => {
      const id = String(zone.id ?? zone.qr ?? zone.zoneId ?? zone.zoneName ?? '').trim()
      const label = String(zone.zoneName ?? zone.name ?? zone.zone ?? id).trim()
      const clientLabel = String(zone.clientName ?? '').trim()
      const location = String(zone.location ?? zone.lokalizacja ?? '').trim()
      return { id, label, clientLabel, location: location === '-' ? '' : location }
    })
    .filter((zone) => {
      if (!zone.label) {
        return false
      }
      const key = normalizeSearchText(zone.id || zone.label)
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .sort((left, right) => left.label.localeCompare(right.label, 'pl', { sensitivity: 'base' }))
}

function calendarZoneDisplayLabel(zone = {}) {
  const label = String(zone.label ?? zone.zoneName ?? '').trim()
  const location = String(zone.location ?? zone.zoneLocation ?? '').trim()
  const visibleLocation = location && location !== '-' ? location : 'brak lokalizacji'
  return [label || 'Strefa', visibleLocation].filter(Boolean).join(' - ')
}

function calendarReadZoneSelection() {
  const select = document.getElementById('calendarTaskZone')
  if (!(select instanceof HTMLSelectElement)) {
    return null
  }
  const id = String(select.value ?? '').trim()
  if (!id) {
    return null
  }
  const option = select.selectedOptions?.[0]
  const label = String(option?.getAttribute('data-zone-label') ?? option?.textContent ?? id).trim()
  const clientLabel = String(option?.getAttribute('data-client-label') ?? '').trim()
  const location = String(option?.getAttribute('data-zone-location') ?? '').trim()
  return { id, label, clientLabel, location }
}

function calendarSyncZoneOptions(selectedZone = null, options = {}) {
  const select = document.getElementById('calendarTaskZone')
  if (!(select instanceof HTMLSelectElement)) {
    return
  }
  const preserveUnknown = Boolean(options.preserveUnknown)
  const objects = calendarReadPickerRows('objects')
  const hasClient = calendarClientSelectionKeys(objects).hasSelection
  const zones = calendarZoneOptionsForClients(objects)
  const normalizedSelected = calendarNormalizeZoneSelection(selectedZone)
  const selectedId = String(normalizedSelected?.id ?? '').trim()
  const selectedLabel = String(normalizedSelected?.label ?? '').trim()
  const selectedLocation = String(normalizedSelected?.location ?? '').trim()
  const hasSelectedInList = selectedId ? zones.some((zone) => String(zone.id) === selectedId) : false

  if (!hasClient) {
    select.disabled = true
    select.innerHTML = '<option value="">Najpierw wybierz klienta</option>'
    return
  }

  if (!zones.length && !selectedLabel) {
    select.disabled = true
    select.innerHTML = '<option value="">Brak stref dla wybranego klienta</option>'
    return
  }

  const fallbackOption =
    preserveUnknown && selectedLabel && !hasSelectedInList
      ? `<option value="${escapeHtml(selectedId || selectedLabel)}" data-zone-label="${escapeHtml(selectedLabel)}" data-zone-location="${escapeHtml(selectedLocation)}" selected>${escapeHtml(calendarZoneDisplayLabel({ label: selectedLabel, location: selectedLocation }))}</option>`
      : ''
  select.disabled = false
  select.innerHTML = `
    <option value="">Bez przypisanej strefy</option>
    ${fallbackOption}
    ${zones
      .map((zone) => {
        const selected = selectedId && String(zone.id) === selectedId ? ' selected' : ''
        return `<option value="${escapeHtml(zone.id)}" data-zone-label="${escapeHtml(zone.label)}" data-zone-location="${escapeHtml(zone.location)}" data-client-label="${escapeHtml(zone.clientLabel)}"${selected}>${escapeHtml(calendarZoneDisplayLabel(zone))}</option>`
      })
      .join('')}
  `
}

function calendarSelectionLabels(selections = []) {
  return (Array.isArray(selections) ? selections : [])
    .map((item) => String(item?.label ?? item?.name ?? item ?? '').trim())
    .filter(Boolean)
}

function calendarNormalizeTimeValue(value = '') {
  const raw = String(value ?? '').trim()
  const match = raw.match(/^(\d{1,2})(?::(\d{1,2}))?$/)
  if (!match) {
    return ''
  }
  const hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return ''
  }
  return `${pad2(hour)}:${pad2(minute)}`
}

function calendarTimeToMinutes(value = '') {
  const normalized = calendarNormalizeTimeValue(value)
  if (!normalized) {
    return null
  }
  const [hour, minute] = normalized.split(':').map((part) => Number(part))
  return hour * 60 + minute
}

function calendarMinutesToTime(minutes) {
  const value = Number(minutes)
  if (!Number.isFinite(value) || value < 0 || value > 1439) {
    return ''
  }
  const hour = Math.floor(value / 60)
  const minute = value % 60
  return `${pad2(hour)}:${pad2(minute)}`
}

function calendarCurrentActorLabel() {
  return (
    String(appState.session?.name ?? '').trim() ||
    String(appState.session?.login ?? '').trim() ||
    String(appState.session?.email ?? '').trim() ||
    'Użytkownik'
  )
}

function calendarToneLabel(tone = '') {
  const value = String(tone ?? '').trim()
  return CALENDAR_TONE_OPTIONS.find((option) => option.value === value)?.label ?? 'Standard'
}

function calendarDateLabelFromYmd(dateYmd = '') {
  const value = String(dateYmd ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDatePl(`${value}T12:00:00.000Z`) : '-'
}

function calendarSelectionText(selections = []) {
  const labels = calendarSelectionLabels(selections)
  return labels.length ? labels.join(', ') : '-'
}

function calendarTaskZoneText(task = {}) {
  const zoneLabel = String(task.zone?.label ?? task.zoneName ?? '').trim()
  const zoneLocation = String(task.zone?.location ?? task.zoneLocation ?? '').trim()
  return zoneLabel ? calendarZoneDisplayLabel({ label: zoneLabel, location: zoneLocation }) : '-'
}

function calendarActivityTimestamp(value = '') {
  return toIso(value) || new Date().toISOString()
}

function calendarNormalizeActivityLog(rawValue = []) {
  const rawItems = Array.isArray(rawValue) ? rawValue : []
  const seen = new Set()
  return rawItems
    .map((item) => {
      if (typeof item !== 'object' || item === null) {
        return null
      }
      const at = calendarActivityTimestamp(item.at ?? item.createdAt ?? item.timestamp)
      const action = String(item.action ?? item.title ?? '').trim()
      const actor = String(item.actor ?? item.by ?? '').trim() || 'System'
      const details = String(item.details ?? item.description ?? '').trim()
      const id = String(item.id ?? `${at}-${action}-${actor}-${details}`).trim()
      return action ? { id, at, actor, action, details } : null
    })
    .filter(Boolean)
    .filter((item) => {
      const key = item.id || `${item.at}-${item.action}-${item.actor}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })
    .sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime())
}

function calendarActivityEntry(action = '', details = '', options = {}) {
  const at = calendarActivityTimestamp(options.at)
  const actor = String(options.actor ?? '').trim() || calendarCurrentActorLabel()
  const title = String(action ?? '').trim() || 'Zmieniono zadanie'
  const description = String(details ?? '').trim()
  return {
    id: `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at,
    actor,
    action: title,
    details: description,
  }
}

function calendarAppendTaskActivity(task = {}, action = '', details = '', options = {}) {
  const activityLog = calendarNormalizeActivityLog(task.activityLog)
  return {
    ...task,
    activityLog: [...activityLog, calendarActivityEntry(action, details, options)],
  }
}

function calendarTaskChangeDetails(beforeTask = {}, afterTask = {}) {
  const fields = [
    ['Tytuł', beforeTask.title, afterTask.title],
    ['Data', calendarDateLabelFromYmd(beforeTask.dateYmd), calendarDateLabelFromYmd(afterTask.dateYmd)],
    ['START', calendarNormalizeTimeValue(beforeTask.startTime ?? beforeTask.time) || '-', calendarNormalizeTimeValue(afterTask.startTime ?? afterTask.time) || '-'],
    ['STOP', calendarNormalizeTimeValue(beforeTask.endTime) || '-', calendarNormalizeTimeValue(afterTask.endTime) || '-'],
    ['Typ', calendarToneLabel(calendarTaskToneValue(beforeTask)), calendarToneLabel(calendarTaskToneValue(afterTask))],
    ['Kolumna', kanbanColumnLabel(beforeTask.kanbanStatus), kanbanColumnLabel(afterTask.kanbanStatus)],
    ['Osoby', calendarSelectionText(beforeTask.workers), calendarSelectionText(afterTask.workers)],
    ['Klienci', calendarSelectionText(beforeTask.objects), calendarSelectionText(afterTask.objects)],
    ['Strefa', calendarTaskZoneText(beforeTask), calendarTaskZoneText(afterTask)],
  ]
  if (String(beforeTask.notes ?? '').trim() !== String(afterTask.notes ?? '').trim()) {
    fields.push(['Opis', beforeTask.notes ? 'uzupełniony' : 'pusty', afterTask.notes ? 'uzupełniony' : 'pusty'])
  }
  const changes = fields
    .map(([label, beforeValue, afterValue]) => {
      const beforeText = String(beforeValue ?? '').trim() || '-'
      const afterText = String(afterValue ?? '').trim() || '-'
      return beforeText === afterText ? '' : `${label}: ${beforeText} -> ${afterText}`
    })
    .filter(Boolean)
  return changes.length ? changes.join('\n') : 'Zapisano bez zmian w polach zadania.'
}

function calendarNormalizeTask(rawTask = {}) {
  const id = String(rawTask.id ?? '').trim() || `cal-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const dateYmd = /^\d{4}-\d{2}-\d{2}$/.test(String(rawTask.dateYmd ?? '').trim())
    ? String(rawTask.dateYmd).trim()
    : todayYmd()
  const rawTone = String(rawTask.tone ?? '').trim()
  const tone = rawTask.generatedFromComment && (rawTone === 'red' || rawTone === 'workerMessage')
    ? 'message'
    : CALENDAR_TONE_OPTIONS.some((option) => option.value === rawTone)
      ? rawTone
      : 'blue'
  const startTime = calendarNormalizeTimeValue(rawTask.startTime || rawTask.time)
  const endTime = calendarNormalizeTimeValue(rawTask.endTime || rawTask.stopTime || rawTask.timeEnd)
  const workers = calendarNormalizeSelectionList(rawTask.workers ?? rawTask.assignees ?? rawTask.people)
  const objects = calendarNormalizeSelectionList(rawTask.objects ?? rawTask.clients ?? rawTask.sites, rawTask.place)
  const zone = calendarNormalizeZoneSelection(
    rawTask.zone ?? rawTask.selectedZone,
    rawTask.zoneId ?? rawTask.roomId ?? rawTask.utilityRoomId,
    rawTask.zoneName ?? rawTask.strefa,
    rawTask.zoneLocation ?? rawTask.location,
  )
  const completionStatus = String(rawTask.completionStatus ?? rawTask.taskStatus ?? '').trim().toUpperCase()
  const completedRaw = rawTask.completed ?? rawTask.kanbanCompleted ?? rawTask.done
  const completed = completedRaw === undefined || completedRaw === null ? completionStatus === 'ZAKONCZONE' : Boolean(completedRaw)
  return {
    id,
    title: String(rawTask.title ?? '').trim() || 'Nowe zadanie',
    dateYmd,
    time: startTime,
    startTime,
    endTime,
    place: String(rawTask.place ?? '').trim(),
    workers,
    objects,
    zone,
    zoneId: zone?.id || '',
    zoneName: zone?.label || '',
    zoneLocation: zone?.location || '',
    kanbanStatus: kanbanDefaultStatusForTask(workers, rawTask.kanbanStatus ?? rawTask.status),
    active: rawTask.active === undefined ? true : Boolean(rawTask.active),
    completed,
    kanbanCompleted: completed,
    completionStatus: completed ? 'ZAKONCZONE' : 'AKTYWNE',
    completedAt: completed ? String(rawTask.completedAt ?? rawTask.kanbanCompletedAt ?? '').trim() : '',
    completedBy: completed ? String(rawTask.completedBy ?? rawTask.kanbanCompletedBy ?? '').trim() : '',
    completedNote: completed ? String(rawTask.completedNote ?? rawTask.kanbanDoneNote ?? rawTask.doneNote ?? '').trim() : '',
    read: Boolean(rawTask.read ?? rawTask.isRead ?? rawTask.seen ?? false),
    readAt: String(rawTask.readAt ?? rawTask.seenAt ?? rawTask.acknowledgedAt ?? '').trim(),
    readBy: String(rawTask.readBy ?? rawTask.seenBy ?? rawTask.acknowledgedBy ?? '').trim(),
    readReceipts: calendarNormalizeTaskReadReceipts(rawTask.readReceipts ?? rawTask.readByUsers ?? rawTask.seenByUsers ?? rawTask.acknowledgedByUsers),
    lastReadAt: String(rawTask.lastReadAt ?? rawTask.latestReadAt ?? '').trim(),
    lastReadBy: String(rawTask.lastReadBy ?? rawTask.latestReadBy ?? '').trim(),
    notes: String(rawTask.notes ?? '').trim(),
    generatedFromComment: Boolean(rawTask.generatedFromComment),
    sourceCommentKey: String(rawTask.sourceCommentKey ?? rawTask.sourceKey ?? '').trim(),
    sourceComment: String(rawTask.sourceComment ?? '').trim(),
    sourceEventId: String(rawTask.sourceEventId ?? '').trim(),
    sourceKind: String(rawTask.sourceKind ?? '').trim(),
    sourceWorkerName: String(rawTask.sourceWorkerName ?? rawTask.workerName ?? '').trim(),
    sourceWorkerLogin: String(rawTask.sourceWorkerLogin ?? rawTask.workerLogin ?? '').trim(),
    dueDateYmd: /^\d{4}-\d{2}-\d{2}$/.test(String(rawTask.dueDateYmd ?? '').trim())
      ? String(rawTask.dueDateYmd).trim()
      : '',
    dueTime: calendarNormalizeTimeValue(rawTask.dueTime ?? rawTask.deadlineTime),
    deadlineAt: toIso(rawTask.deadlineAt),
    activityLog: calendarNormalizeActivityLog(rawTask.activityLog ?? rawTask.activities),
    tone,
    createdAt: String(rawTask.createdAt ?? '').trim() || new Date().toISOString(),
    updatedAt: String(rawTask.updatedAt ?? '').trim() || new Date().toISOString(),
  }
}

function calendarLoadTasks() {
  try {
    const raw = window.localStorage.getItem(calendarStorageKey())
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.map((task) => calendarNormalizeTask(task)) : []
  } catch {
    return []
  }
}

function calendarTaskUpdatedAtValue(task = {}) {
  const candidates = [task.updatedAt, task.completedAt, task.createdAt]
  for (const candidate of candidates) {
    const time = Date.parse(String(candidate ?? ''))
    if (Number.isFinite(time)) {
      return time
    }
  }
  return 0
}

function calendarTaskMergeKeys(task = {}) {
  const keys = []
  const id = String(task.id ?? '').trim()
  const sourceCommentKey = String(task.sourceCommentKey ?? '').trim()
  if (id) keys.push(`id:${id}`)
  if (sourceCommentKey) keys.push(`comment:${sourceCommentKey}`)
  return keys
}

function calendarMergeTaskLists(...taskLists) {
  const byKey = new Map()
  const canonicalTasks = []

  taskLists
    .flat()
    .filter(Boolean)
    .map((task) => calendarNormalizeTask(task))
    .forEach((task) => {
      const keys = calendarTaskMergeKeys(task)
      if (!keys.length) {
        canonicalTasks.push(task)
        return
      }

      const existing = keys.map((key) => byKey.get(key)).find(Boolean)
      if (!existing) {
        keys.forEach((key) => byKey.set(key, task))
        canonicalTasks.push(task)
        return
      }

      const winner = calendarTaskUpdatedAtValue(task) >= calendarTaskUpdatedAtValue(existing) ? task : existing
      const loser = winner === task ? existing : task
      const merged = calendarNormalizeTask({
        ...loser,
        ...winner,
        workers: winner.workers?.length ? winner.workers : loser.workers,
        objects: winner.objects?.length ? winner.objects : loser.objects,
        readReceipts: calendarMergeTaskReadReceipts(loser.readReceipts, winner.readReceipts),
        activityLog: calendarNormalizeActivityLog([...(loser.activityLog ?? []), ...(winner.activityLog ?? [])]),
      })
      const existingIndex = canonicalTasks.findIndex((item) => item === existing || item.id === existing.id)
      if (existingIndex >= 0) {
        canonicalTasks[existingIndex] = merged
      }
      calendarTaskMergeKeys(merged).forEach((key) => byKey.set(key, merged))
    })

  const seen = new Set()
  return calendarSortTasks(
    canonicalTasks.filter((task) => {
      const key = String(task.id ?? '').trim()
      if (!key || seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    }),
  )
}

function calendarQueueRemoteTaskSave(tasks = appState.calendarTasks) {
  const orgId = String(appState.session?.orgId ?? '').trim()
  if (!orgId) {
    return
  }

  if (calendarRemoteSaveTimer) {
    window.clearTimeout(calendarRemoteSaveTimer)
  }

  const snapshot = (Array.isArray(tasks) ? tasks : []).map((task) => calendarNormalizeTask(task))
  calendarRemoteSaveTimer = window.setTimeout(() => {
    calendarRemoteSaveTimer = 0
    void upsertPortalTasks(orgId, snapshot).catch((error) => {
      console.warn('[portal/tasks] remote save failed', error)
      showPortalErrorNotice('Nie udało się zapisać zadań kalendarza w bazie', error)
    })
  }, 350)
}

function calendarSaveTasks(tasks = appState.calendarTasks, options = {}) {
  const normalized = (Array.isArray(tasks) ? tasks : []).map((task) => calendarNormalizeTask(task))
  appState.calendarTasks = calendarSortTasks(normalized)
  try {
    window.localStorage.setItem(calendarStorageKey(), JSON.stringify(appState.calendarTasks))
  } catch {
    showTransientNotice('Nie udało się zapisać kalendarza w przeglądarce.', 'error')
  }
  if (options.syncRemote !== false) {
    calendarQueueRemoteTaskSave(appState.calendarTasks)
  }
}

async function calendarSyncRemoteTasks({ render = false } = {}) {
  const orgId = String(appState.session?.orgId ?? '').trim()
  if (!orgId || appState.calendarRemoteTasksLoading) {
    return appState.calendarTasks
  }

  appState.calendarRemoteTasksLoading = true
  renderKanbanSyncStatus()
  try {
    const localTasks = calendarLoadTasks()
    const remoteTasks = await fetchPortalTasks(orgId)
    const mergedTasks = calendarMergeTaskLists(localTasks, remoteTasks)
    const remoteCount = Array.isArray(remoteTasks) ? remoteTasks.length : 0
    calendarSaveTasks(mergedTasks, { syncRemote: false })
    appState.calendarRemoteTasksLoaded = true
    if (mergedTasks.length > remoteCount) {
      calendarQueueRemoteTaskSave(mergedTasks)
    }
    if (render) {
      renderDashboardKanbanTasks()
      if (appState.currentRoute === 'calendar') renderCalendarView()
      if (appState.currentRoute === 'kanban') renderKanbanView()
    }
    return appState.calendarTasks
  } catch (error) {
    appState.calendarRemoteTasksLoaded = false
    console.warn('[portal/tasks] remote load failed', error)
    showPortalErrorNotice('Nie udało się pobrać zadań kalendarza z bazy', error)
    return appState.calendarTasks
  } finally {
    appState.calendarRemoteTasksLoading = false
    renderKanbanSyncStatus()
  }
}

function calendarDeleteRemoteTasksById(taskIds = []) {
  const orgId = String(appState.session?.orgId ?? '').trim()
  const ids = (Array.isArray(taskIds) ? taskIds : [taskIds])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
  if (!orgId || !ids.length) {
    return
  }

  void deletePortalTasks(orgId, ids).catch((error) => {
    console.warn('[portal/tasks] remote delete failed', error)
    showPortalErrorNotice('Nie udało się usunąć zadań kalendarza z bazy', error)
  })
}

function calendarSortTasks(tasks = []) {
  return [...tasks].sort((left, right) => {
    const leftDate = String(left.dateYmd ?? '')
    const rightDate = String(right.dateYmd ?? '')
    if (leftDate !== rightDate) {
      return leftDate.localeCompare(rightDate)
    }
    const leftTime = String(left.time ?? '')
    const rightTime = String(right.time ?? '')
    if (leftTime !== rightTime) {
      return leftTime.localeCompare(rightTime)
    }
    const leftEndTime = String(left.endTime ?? '')
    const rightEndTime = String(right.endTime ?? '')
    if (leftEndTime !== rightEndTime) {
      return leftEndTime.localeCompare(rightEndTime)
    }
    return String(left.title ?? '').localeCompare(String(right.title ?? ''), 'pl', { sensitivity: 'base' })
  })
}

function normalizeClientStatus(status) {
  const value = String(status ?? '').trim().toLowerCase()

  if (value === 'active' || value === 'aktywny') {
    return 'Aktywny'
  }

  if (value === 'inactive' || value === 'nieaktywny') {
    return 'Nieaktywny'
  }

  if (value === 'suspended' || value === 'wstrzymany') {
    return 'Wstrzymany'
  }

  if (value === 'archived' || value === 'archiwalny') {
    return 'Archiwalny'
  }

  return 'Aktywny'
}

function statusBadgeClass(statusLabel) {
  return statusLabel === 'Aktywny' ? 'badge badge-active' : 'badge badge-inactive'
}

function roleLevel(role) {
  const normalized = String(role ?? '')
    .trim()
    .toLowerCase()

  if (!normalized) {
    return 0
  }

  if (normalized === 'platform owner' || normalized === 'platform_owner') {
    return 4
  }

  if (normalized === 'admin' || normalized === 'administrator' || normalized === 'owner' || normalized === 'superadmin') {
    return 3
  }

  if (
    normalized.includes('kierownik') ||
    normalized.includes('manager') ||
    normalized.includes('menager') ||
    normalized.includes('menedzer') ||
    normalized.includes('menedżer')
  ) {
    return 2
  }

  if (
    normalized.includes('pracownik') ||
    normalized.includes('worker') ||
    normalized.includes('koordynator') ||
    normalized.includes('coordynator') ||
    normalized.includes('coordinator') ||
    normalized.includes('stażysta') ||
    normalized.includes('stazysta') ||
    normalized.includes('intern') ||
    normalized.includes('member')
  ) {
    return 1
  }

  return 1
}

function currentSessionRoleLevel() {
  const declaredLevel = Number(appState.session?.roleLevel)
  return Math.max(
    roleLevel(appState.session?.role),
    roleLevel(appState.session?.roleCode),
    Number.isFinite(declaredLevel) ? declaredLevel : 0,
  )
}

function canManageWorkers() {
  return currentSessionRoleLevel() >= 2
}

function canAdministerWorkers() {
  return currentSessionRoleLevel() >= 3
}

function canDeleteWorkers() {
  const roleCode = String(appState.session?.roleCode ?? '').trim().toUpperCase()
  return roleCode === 'ADMIN' || roleCode === 'OWNER' || roleCode === 'PLATFORM_OWNER'
}

function canResetWorkerPasswords() {
  return canAdministerWorkers()
}

function canManageClients() {
  return roleLevel(appState.session?.role) >= 2
}

function profitabilityCapability() {
  const capability = appState.session?.capabilities?.profitabilityModule
  return capability && typeof capability === 'object' ? capability : {}
}

function canReadProfitability() {
  return profitabilityCapability().canRead === true
}

function canEditProfitability() {
  return profitabilityCapability().canEdit === true
}

function profitabilityPreviewIsAvailable() {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return false
  }
  return ['localhost', '127.0.0.1', '::1'].includes(String(window.location.hostname ?? '').toLowerCase())
}

function canOpenContractProfitability() {
  return canReadProfitability() || profitabilityPreviewIsAvailable()
}

function syncProfitabilityEntryPermissions() {
  const visible = canOpenContractProfitability()
  document.querySelectorAll('[data-profitability-entry]').forEach((node) => {
    if (node instanceof HTMLElement) {
      node.hidden = !visible
    }
  })
}

function syncPlanFeaturePermissions() {
  for (const [route, capability] of Object.entries(PORTAL_ROUTE_CAPABILITIES)) {
    const allowed = appState.session?.capabilities?.[capability] === true
    document.querySelectorAll(`[data-route="${route}"]`).forEach((node) => {
      if (node instanceof HTMLElement) node.hidden = !allowed
    })
  }

  const zoneTasksAllowed = appState.session?.capabilities?.zoneTasks === true
  for (const id of ['znQrFunctionClean', 'znQrFunctionSpecial']) {
    const input = document.getElementById(id)
    if (input instanceof HTMLInputElement) {
      input.disabled = !zoneTasksAllowed
      if (!zoneTasksAllowed) input.checked = false
      input.title = zoneTasksAllowed ? '' : 'Ta funkcja wymaga planu PRO.'
    }
  }
}

function canDeleteClients() {
  return canDeleteOrganizationRecords()
}

function canManageEvents() {
  return roleLevel(appState.session?.role) >= 2
}

function canDeleteOrganizationRecords() {
  const roleCode = String(appState.session?.roleCode ?? '').trim().toUpperCase()
  return roleCode === 'ADMIN' || roleCode === 'OWNER' || roleCode === 'PLATFORM_OWNER'
}

function canDeleteEvents() {
  return canDeleteOrganizationRecords()
}

function formatBytes(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) {
    return '-'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let number = value
  let unitIndex = 0
  while (number >= 1024 && unitIndex < units.length - 1) {
    number /= 1024
    unitIndex += 1
  }

  const precision = number >= 100 || unitIndex === 0 ? 0 : 1
  return `${number.toFixed(precision)} ${units[unitIndex]}`
}

let fullCalendarBundlePromise = null

function loadFullCalendar() {
  if (!fullCalendarBundlePromise) {
    fullCalendarBundlePromise = Promise.all([
      import('@fullcalendar/core'),
      import('@fullcalendar/core/locales/pl'),
      import('@fullcalendar/daygrid'),
      import('@fullcalendar/interaction'),
      import('@fullcalendar/list'),
      import('@fullcalendar/timegrid'),
    ]).then(([coreModule, plLocaleModule, dayGridModule, interactionModule, listModule, timeGridModule]) => ({
      Calendar: coreModule.Calendar,
      plLocale: plLocaleModule.default,
      dayGridPlugin: dayGridModule.default,
      interactionPlugin: interactionModule.default,
      listPlugin: listModule.default,
      timeGridPlugin: timeGridModule.default,
    })).catch((error) => {
      fullCalendarBundlePromise = null
      throw error
    })
  }

  return fullCalendarBundlePromise
}

let dashboardFeature = null

function getDashboardFeature() {
  if (!dashboardFeature) {
    throw new Error('Dashboard feature is not initialized.')
  }
  return dashboardFeature
}

function bindDashboardViewFunctions(...args) {
  return getDashboardFeature().bind(...args)
}

async function refreshDashboardWidgets(...args) {
  return getDashboardFeature().refresh(...args)
}

async function refreshDashboardAfterEventSave(...args) {
  return getDashboardFeature().refreshAfterEventSave(...args)
}

function startDashboardAutoRefresh(...args) {
  return getDashboardFeature().startAutoRefresh(...args)
}

function stopDashboardAutoRefresh(...args) {
  if (!dashboardFeature) {
    return undefined
  }
  return getDashboardFeature().stopAutoRefresh(...args)
}

function dashboardSyncLoadingOverlay(...args) {
  if (!dashboardFeature) {
    return undefined
  }
  return getDashboardFeature().syncLoadingOverlay(...args)
}

function renderDashboardActivityCalendar(...args) {
  return getDashboardFeature().renderActivityCalendar(...args)
}

function renderDashboardKanbanTasks(...args) {
  return getDashboardFeature().renderKanbanTasks(...args)
}

function dashboardHideMetricPopover(...args) {
  if (!dashboardFeature) {
    return undefined
  }
  return getDashboardFeature().hideMetricPopover(...args)
}

async function hydrateSections(...args) {
  return getDashboardFeature().hydrate(...args)
}

function dashboardLoadFastRows(...args) {
  return getDashboardFeature().loadFastRows(...args)
}

function dashboardActivityCleanCompanyLabel(...args) {
  return getDashboardFeature().helpers.dashboardActivityCleanCompanyLabel(...args)
}

function dashboardActivityCompanyLabel(...args) {
  return getDashboardFeature().helpers.dashboardActivityCompanyLabel(...args)
}

function dashboardActivityEndDeltaInfo(...args) {
  return getDashboardFeature().helpers.dashboardActivityEndDeltaInfo(...args)
}

function dashboardActivityLatestQrCompanyLabelForRow(...args) {
  return getDashboardFeature().helpers.dashboardActivityLatestQrCompanyLabelForRow(...args)
}

function dashboardActivityStartDeltaInfo(...args) {
  return getDashboardFeature().helpers.dashboardActivityStartDeltaInfo(...args)
}

function dashboardAddUserMatchKey(...args) {
  return getDashboardFeature().helpers.dashboardAddUserMatchKey(...args)
}

function dashboardCurrentUserMatchKeys(...args) {
  return getDashboardFeature().helpers.dashboardCurrentUserMatchKeys(...args)
}

function dashboardReadCommentKeys(...args) {
  return getDashboardFeature().helpers.dashboardReadCommentKeys(...args)
}

function dashboardResolveClientLabel(...args) {
  return getDashboardFeature().helpers.dashboardResolveClientLabel(...args)
}

function dashboardResolveDayKey(...args) {
  return getDashboardFeature().helpers.dashboardResolveDayKey(...args)
}

function dashboardResolveTodayRowAliasKeys(...args) {
  return getDashboardFeature().helpers.dashboardResolveTodayRowAliasKeys(...args)
}

function dashboardResolveWorkerIdValue(...args) {
  return getDashboardFeature().helpers.dashboardResolveWorkerIdValue(...args)
}

function dashboardRowIsIndividual(...args) {
  return getDashboardFeature().helpers.dashboardRowIsIndividual(...args)
}

function dashboardRowIsSpecial(...args) {
  return getDashboardFeature().helpers.dashboardRowIsSpecial(...args)
}

function dashboardScheduleTimeToMinutes(...args) {
  return getDashboardFeature().helpers.dashboardScheduleTimeToMinutes(...args)
}

function dashboardTaskColumnBelongsToCurrentUser(...args) {
  return getDashboardFeature().helpers.dashboardTaskColumnBelongsToCurrentUser(...args)
}

function dashboardWorkerIdIdentityKeys(...args) {
  return getDashboardFeature().helpers.dashboardWorkerIdIdentityKeys(...args)
}

function dashboardCanonicalWorkerId(...args) {
  return getDashboardFeature().helpers.dashboardCanonicalWorkerId(...args)
}

function dashboardIsQrCodeLike(...args) {
  return getDashboardFeature().helpers.dashboardIsQrCodeLike(...args)
}

function dashboardResolveZoneLabel(...args) {
  return getDashboardFeature().helpers.dashboardResolveZoneLabel(...args)
}

function dashboardBuildHistoryRow(...args) {
  return getDashboardFeature().helpers.dashboardBuildHistoryRow(...args)
}

function dashboardClockLabelToHm(...args) {
  return getDashboardFeature().helpers.dashboardClockLabelToHm(...args)
}

function dashboardDurationLabelToHm(...args) {
  return getDashboardFeature().helpers.dashboardDurationLabelToHm(...args)
}

function dashboardLateMinutesToHm(...args) {
  return getDashboardFeature().helpers.dashboardLateMinutesToHm(...args)
}

function dashboardWorkerSurnameDisplayName(...args) {
  return getDashboardFeature().helpers.dashboardWorkerSurnameDisplayName(...args)
}

function dashboardWorkerSurnameSortKey(...args) {
  return getDashboardFeature().helpers.dashboardWorkerSurnameSortKey(...args)
}

function resolveClientLabelWithQrFallback(...args) {
  return getDashboardFeature().helpers.resolveClientLabelWithQrFallback(...args)
}

function resolveZoneByQrCandidate(...args) {
  return getDashboardFeature().helpers.resolveZoneByQrCandidate(...args)
}

function zoneQrCodeFromRow(...args) {
  return getDashboardFeature().helpers.zoneQrCodeFromRow(...args)
}

function zoneNameWithQrHtml(...args) {
  return getDashboardFeature().helpers.zoneNameWithQrHtml(...args)
}

function eventEditorFirstScannedQr(...args) {
  return getDashboardFeature().helpers.eventEditorFirstScannedQr(...args)
}

function eventEditorScannedQrLabel(...args) {
  return getDashboardFeature().helpers.eventEditorScannedQrLabel(...args)
}

let kanbanFeature = null
const KANBAN_FALLBACK_COLUMNS = Object.freeze([
  Object.freeze({ id: 'newTask', label: 'Nowe zadanie', scope: 'global' }),
  Object.freeze({ id: 'inProgress', label: 'W trakcie', scope: 'global' }),
  Object.freeze({ id: 'done', label: 'Zakonczone', scope: 'global' }),
])

function getKanbanFeature() {
  if (!kanbanFeature) {
    throw new Error('Kanban feature is not initialized.')
  }
  return kanbanFeature
}

function fallbackKanbanColumns() {
  return Array.isArray(appState.kanbanColumns) && appState.kanbanColumns.length
    ? appState.kanbanColumns
    : KANBAN_FALLBACK_COLUMNS.map((column) => ({ ...column }))
}

function fallbackKanbanNormalizeScope(scope = '') {
  const value = String(scope ?? '').trim()
  const normalized = value === 'client' ? 'object' : value
  return ['global', 'user', 'person', 'object'].includes(normalized) ? normalized : 'global'
}

function fallbackKanbanNormalizeStatus(status = '') {
  const value = String(status ?? '').trim()
  const columns = fallbackKanbanColumns()
  return columns.some((column) => column.id === value) ? value : columns[0]?.id || 'newTask'
}

function fallbackKanbanInitials(name = '') {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase() || parts[0].slice(0, 2).toUpperCase()
}

function fallbackKanbanCurrentUserOption() {
  const label =
    String(appState.session?.name ?? '').trim() ||
    String(appState.session?.login ?? '').trim() ||
    String(appState.session?.email ?? '').trim()
  const id =
    String(appState.session?.uid ?? '').trim() ||
    String(appState.session?.userId ?? '').trim() ||
    String(appState.session?.login ?? '').trim() ||
    String(appState.session?.email ?? '').trim() ||
    label
  return label ? { id: `user:${id}`, label } : null
}

function renderKanbanView(...args) {
  return getKanbanFeature().render(...args)
}

function renderKanbanViewIfReady(...args) {
  return kanbanFeature ? kanbanFeature.render(...args) : null
}

function bindKanbanViewFunctions(...args) {
  return getKanbanFeature().bind(...args)
}

function kanbanColumnsForStatus(...args) {
  return kanbanFeature ? kanbanFeature.columnsForStatus(...args) : fallbackKanbanColumns()
}

function kanbanNewTaskStatus(...args) {
  return kanbanFeature ? kanbanFeature.newTaskStatus(...args) : fallbackKanbanNormalizeStatus('')
}

function kanbanDefaultStatusForTask(...args) {
  if (kanbanFeature) {
    return kanbanFeature.defaultStatusForTask(...args)
  }
  const preferred = String(args[1] ?? '').trim()
  return preferred ? fallbackKanbanNormalizeStatus(preferred) : fallbackKanbanNormalizeStatus('')
}

function kanbanNormalizeColumnScope(...args) {
  return kanbanFeature ? kanbanFeature.normalizeColumnScope(...args) : fallbackKanbanNormalizeScope(args[0])
}

function kanbanTaskIsCompleted(...args) {
  if (kanbanFeature) {
    return kanbanFeature.taskIsCompleted(...args)
  }
  const task = args[0] ?? {}
  const status = String(task.completionStatus ?? task.taskStatus ?? '').trim().toUpperCase()
  return Boolean(task.completed ?? task.kanbanCompleted ?? task.done ?? status === 'ZAKONCZONE')
}

function kanbanInitials(...args) {
  return kanbanFeature ? kanbanFeature.initials(...args) : fallbackKanbanInitials(args[0])
}

function kanbanOpenCalendarTask(...args) {
  return getKanbanFeature().openCalendarTask(...args)
}

function kanbanCreateTask(...args) {
  return getKanbanFeature().createTask(...args)
}

function kanbanSetDataLoading(...args) {
  return kanbanFeature ? kanbanFeature.setDataLoading(...args) : null
}

function renderKanbanSyncStatus(...args) {
  return kanbanFeature ? kanbanFeature.renderSyncStatus(...args) : null
}

function kanbanColumnLabel(...args) {
  if (kanbanFeature) {
    return kanbanFeature.columnLabel(...args)
  }
  const status = fallbackKanbanNormalizeStatus(args[0])
  return fallbackKanbanColumns().find((column) => column.id === status)?.label || status || 'Centrum zadań'
}

function kanbanNormalizeStatus(...args) {
  return kanbanFeature ? kanbanFeature.normalizeStatus(...args) : fallbackKanbanNormalizeStatus(args[0])
}

function kanbanCurrentUserOption(...args) {
  return kanbanFeature ? kanbanFeature.currentUserOption(...args) : fallbackKanbanCurrentUserOption()
}

function kanbanNormalizeSection(...args) {
  return getKanbanFeature().normalizeSection(...args)
}

let contractProfitabilityFeature = null

let facilityManagerObjectsFeature = null

function getFacilityManagerObjectsFeature() {
  if (!facilityManagerObjectsFeature) {
    throw new Error('Facility-manager object feature is not initialized.')
  }
  return facilityManagerObjectsFeature
}

function refreshFacilityManagerObjects(...args) {
  return getFacilityManagerObjectsFeature().refresh(...args)
}

function bindFacilityManagerObjectsViewFunctions(...args) {
  return getFacilityManagerObjectsFeature().bind(...args)
}

function getContractProfitabilityFeature() {
  if (!contractProfitabilityFeature) {
    throw new Error('Contract profitability feature is not initialized.')
  }
  return contractProfitabilityFeature
}

function renderContractProfitabilityView(...args) {
  return getContractProfitabilityFeature().render(...args)
}

function bindContractProfitabilityViewFunctions(...args) {
  return getContractProfitabilityFeature().bind(...args)
}

let settingsFeature = null

function getSettingsFeature() {
  if (!settingsFeature) {
    throw new Error('Settings feature is not initialized.')
  }
  return settingsFeature
}

function renderSettingsView(...args) {
  return getSettingsFeature().render(...args)
}

function bindSettingsViewFunctions(...args) {
  return getSettingsFeature().bind(...args)
}

function portalRouteTemplateKey(route) {
  const normalizedRoute = normalizeNavigationRoute(route)
  return PORTAL_SETTINGS_ROUTES.has(normalizedRoute) ? 'settings' : normalizedRoute
}

function portalRouteViewId(route) {
  const normalizedRoute = normalizeNavigationRoute(route)
  return PORTAL_ROUTE_VIEW_IDS[normalizedRoute] || `view-${normalizedRoute}`
}

function getPortalRouteView(route) {
  return document.getElementById(portalRouteViewId(route))
}

function loadPortalTemplateModule(route) {
  const templateKey = portalRouteTemplateKey(route)
  switch (templateKey) {
    case 'audits':
      return import('../features/objects/audits/index.js')
    case 'calendar':
      return import('../features/calendar/index.js')
    case 'clientProfile':
      return import('../features/clients/profile/index.js')
    case 'clientProfileDetails':
      return import('../features/clients/profile-details/index.js')
    case 'events':
      return import('../features/events/index.js')
    case 'kanban':
      return import('../features/kanban/index.js')
    case 'contractProfitability':
      return import('../features/profitability/index.js')
    case 'orders':
      return import('../features/orders/list/index.js')
    case 'ordersMap':
      return import('../features/orders/map/index.js')
    case 'managerObjects':
      return import('../features/facility-manager-objects/index.js')
    case 'reports':
      return import('../features/reports/index.js')
    case 'settings':
      return import('../features/settings/index.js')
    case 'workerAccount':
      return import('../features/workers/account/index.js')
    case 'workerProfile':
      return import('../features/workers/worker_list_profile/index.js')
    case 'workerTime':
      return import('../features/workers/time/index.js')
    case 'workerTimeDetail':
      return import('../features/workers/time-detail/index.js')
    case 'workdayStopProposals':
      return import('../features/workers/workday-stop-proposals/index.js')
    case 'zones':
      return import('../features/objects/zones/index.js')
    default:
      return Promise.resolve(null)
  }
}

function loadPortalFeatureModule(featureKey) {
  switch (featureKey) {
    case 'calendar':
      return import('../features/calendar/index.js')
    case 'clientProfile':
      return import('../features/clients/profile/index.js')
    case 'dashboard':
      return import('../features/dashboard/index.js')
    case 'events':
      return import('../features/events/index.js')
    case 'kanban':
      return import('../features/kanban/index.js')
    case 'contractProfitability':
      return import('../features/profitability/index.js')
    case 'orders':
      return import('../features/orders/index.js')
    case 'facilityManagerObjects':
      return import('../features/facility-manager-objects/index.js')
    case 'reports':
      return import('../features/reports/index.js')
    case 'settings':
      return import('../features/settings/index.js')
    case 'workerAccount':
      return import('../features/workers/account/index.js')
    case 'workerProfile':
      return import('../features/workers/worker_list_profile/index.js')
    case 'workerTime':
      return import('../features/workers/time/index.js')
    case 'workerTimeDetail':
      return import('../features/workers/time-detail/index.js')
    case 'workdayStopProposals':
      return import('../features/workers/workday-stop-proposals/index.js')
    case 'zones':
      return import('../features/objects/zones/index.js')
    default:
      return Promise.resolve(null)
  }
}

function portalFeatureIsReady(featureKey) {
  switch (featureKey) {
    case 'calendar':
      return Boolean(calendarFeature)
    case 'clientProfile':
      return Boolean(clientProfileFeature)
    case 'dashboard':
      return Boolean(dashboardFeature)
    case 'events':
      return Boolean(eventsFeature)
    case 'kanban':
      return Boolean(kanbanFeature)
    case 'contractProfitability':
      return Boolean(contractProfitabilityFeature)
    case 'orders':
      return Boolean(ordersFeature)
    case 'facilityManagerObjects':
      return Boolean(facilityManagerObjectsFeature)
    case 'reports':
      return Boolean(reportsFeature)
    case 'settings':
      return Boolean(settingsFeature)
    case 'workerAccount':
      return Boolean(workerAccountFeature)
    case 'workerProfile':
      return Boolean(workerProfileFeature)
    case 'workerTime':
      return Boolean(workerTimeFeature)
    case 'workerTimeDetail':
      return Boolean(workerTimeDetailFeature)
    case 'workdayStopProposals':
      return Boolean(workdayStopProposalsFeature)
    case 'zones':
      return Boolean(zonesFeature)
    default:
      return true
  }
}

function assignPortalFeature(featureKey, module) {
  if (!module || !portalFeatureContext) {
    return null
  }

  switch (featureKey) {
    case 'calendar':
      calendarFeature = calendarFeature || module.createCalendarFeature(portalFeatureContext)
      return calendarFeature
    case 'clientProfile':
      clientProfileFeature = clientProfileFeature || module.createClientProfileFeature(portalFeatureContext)
      return clientProfileFeature
    case 'dashboard':
      dashboardFeature = dashboardFeature || module.createDashboardFeature(portalFeatureContext)
      return dashboardFeature
    case 'events':
      eventsFeature = eventsFeature || module.createEventsFeature(portalFeatureContext)
      return eventsFeature
    case 'kanban':
      kanbanFeature = kanbanFeature || module.createKanbanFeature(portalFeatureContext)
      return kanbanFeature
    case 'contractProfitability':
      contractProfitabilityFeature =
        contractProfitabilityFeature || module.createContractProfitabilityFeature(portalFeatureContext)
      return contractProfitabilityFeature
    case 'orders':
      ordersFeature = ordersFeature || module.createOrdersFeature(portalFeatureContext)
      return ordersFeature
    case 'facilityManagerObjects':
      facilityManagerObjectsFeature = facilityManagerObjectsFeature || module.createFacilityManagerObjectsFeature(portalFeatureContext)
      return facilityManagerObjectsFeature
    case 'reports':
      reportsFeature = reportsFeature || module.createReportsFeature(portalFeatureContext)
      return reportsFeature
    case 'settings':
      settingsFeature = settingsFeature || module.createSettingsFeature(portalFeatureContext)
      return settingsFeature
    case 'workerAccount':
      workerAccountFeature = workerAccountFeature || module.createWorkerAccountFeature(portalFeatureContext)
      return workerAccountFeature
    case 'workerProfile':
      workerProfileFeature = workerProfileFeature || module.createWorkerProfileFeature(portalFeatureContext)
      return workerProfileFeature
    case 'workerTime':
      workerTimeFeature = workerTimeFeature || module.createWorkerTimeFeature(portalFeatureContext)
      return workerTimeFeature
    case 'workerTimeDetail':
      workerTimeDetailFeature = workerTimeDetailFeature || module.createWorkerTimeDetailFeature(portalFeatureContext)
      return workerTimeDetailFeature
    case 'workdayStopProposals':
      workdayStopProposalsFeature = workdayStopProposalsFeature || module.createWorkdayStopProposalsFeature(portalFeatureContext)
      return workdayStopProposalsFeature
    case 'zones':
      zonesFeature = zonesFeature || module.createZonesFeature(portalFeatureContext)
      return zonesFeature
    default:
      return null
  }
}

async function ensurePortalFeatureReady(featureKey) {
  const key = String(featureKey ?? '').trim()
  if (!key || portalFeatureIsReady(key)) {
    return null
  }
  if (!portalFeatureContext) {
    throw new Error('Portal feature context is not initialized.')
  }
  const existingPromise = portalFeaturePromises.get(key)
  if (existingPromise) {
    return existingPromise
  }

  const promise = loadPortalFeatureModule(key)
    .then((module) => {
      const feature = assignPortalFeature(key, module)
      if (!feature && !portalFeatureIsReady(key)) {
        throw new Error(`Nie udało się utworzyć modułu ${key}.`)
      }
      return feature
    })
    .catch((error) => {
      portalFeaturePromises.delete(key)
      throw error
    })

  portalFeaturePromises.set(key, promise)
  return promise
}

async function ensurePortalFeatureListReady(featureKeys = []) {
  for (const featureKey of featureKeys) {
    await ensurePortalFeatureReady(featureKey)
  }
}

function portalRouteTemplateIsMounted(route) {
  const templateKey = portalRouteTemplateKey(route)
  if (templateKey === 'dashboard') {
    return true
  }
  const view = getPortalRouteView(route)
  return Boolean(view?.dataset?.portalTemplateKey === templateKey && portalMountedTemplates.has(templateKey))
}

function portalRouteIsReady(route) {
  const normalizedRoute = normalizeNavigationRoute(route)
  const featureKeys = PORTAL_ROUTE_FEATURE_KEYS[normalizedRoute] || []
  const bindKey = PORTAL_ROUTE_BIND_KEYS[normalizedRoute]
  const bindReady = !bindKey || portalRouteBindCleanups.has(bindKey)
  return portalRouteTemplateIsMounted(normalizedRoute) && featureKeys.every(portalFeatureIsReady) && bindReady
}

function showPortalRouteLoading(route) {
  const normalizedRoute = normalizeNavigationRoute(route)
  if (normalizedRoute === 'dashboard' || portalRouteTemplateIsMounted(normalizedRoute)) {
    return
  }
  const view = getPortalRouteView(normalizedRoute)
  if (view instanceof HTMLElement) {
    view.innerHTML = PORTAL_ROUTE_LOADING_HTML
    view.dataset.portalTemplateLoading = 'true'
  }
}

function showPortalRouteLoadError(route, error) {
  const normalizedRoute = normalizeNavigationRoute(route)
  const view = getPortalRouteView(normalizedRoute)
  if (!(view instanceof HTMLElement) || portalRouteTemplateIsMounted(normalizedRoute)) {
    return
  }
  const message = escapeHtml(formatErrorNoticeMessage(error, 'Sprobuj ponownie za chwile.'))
  view.innerHTML = `
    <div class="portal-section-loading" role="alert" style="min-height:240px;display:grid;place-items:center;padding:32px;text-align:center;">
      <div>
        <strong>Nie udalo sie wczytac sekcji.</strong>
        <p style="margin:8px 0 0;color:#667085;">${message}</p>
      </div>
    </div>
  `
  delete view.dataset.portalTemplateLoading
}

async function mountPortalRouteTemplate(route) {
  const normalizedRoute = normalizeNavigationRoute(route)
  const templateKey = portalRouteTemplateKey(normalizedRoute)
  if (templateKey === 'dashboard' || portalRouteTemplateIsMounted(normalizedRoute)) {
    return
  }

  const view = getPortalRouteView(normalizedRoute)
  if (!(view instanceof HTMLElement)) {
    return
  }

  let templatePromise = portalTemplatePromises.get(templateKey)
  if (!templatePromise) {
    templatePromise = loadPortalTemplateModule(normalizedRoute)
    portalTemplatePromises.set(templateKey, templatePromise)
  }

  try {
    const module = await templatePromise
    const html = module?.template ?? module?.default ?? ''
    view.innerHTML = html
    view.dataset.portalTemplateKey = templateKey
    delete view.dataset.portalTemplateLoading
    portalMountedTemplates.add(templateKey)
  } catch (error) {
    portalTemplatePromises.delete(templateKey)
    throw error
  }
}

function bindPortalRouteOnce(route, navigation = portalNavigation) {
  const normalizedRoute = normalizeNavigationRoute(route)
  const bindKey = PORTAL_ROUTE_BIND_KEYS[normalizedRoute]
  if (!bindKey || portalRouteBindCleanups.has(bindKey)) {
    return
  }

  let cleanup = null
  switch (PORTAL_SETTINGS_ROUTES.has(normalizedRoute) ? 'settings' : normalizedRoute) {
    case 'dashboard':
      cleanup = bindDashboardViewFunctions()
      break
    case 'calendar':
      cleanup = bindCalendarViewFunctions()
      break
    case 'kanban':
      cleanup = bindKanbanViewFunctions()
      break
    case 'contractProfitability':
      cleanup = bindContractProfitabilityViewFunctions()
      break
    case 'events':
      cleanup = bindEventsViewFunctions()
      break
    case 'orders':
      cleanup = bindOrdersViewFunctions()
      break
    case 'ordersMap':
      cleanup = bindOrdersMapViewFunctions()
      break
    case 'managerObjects':
      cleanup = bindFacilityManagerObjectsViewFunctions()
      break
    case 'zones':
      cleanup = bindZonesViewFunctions()
      break
    case 'workerProfile':
      cleanup = bindWorkerProfileViewFunctions(navigation)
      break
    case 'workerAccount':
      cleanup = bindWorkerAccountViewFunctions(navigation)
      break
    case 'workerTime':
      cleanup = bindWorkerTimeViewFunctions(navigation)
      break
    case 'workerTimeDetail':
      cleanup = bindWorkerTimeDetailViewFunctions()
      break
    case 'workdayStopProposals':
      cleanup = bindWorkdayStopProposalsViewFunctions()
      break
    case 'clientProfile':
      cleanup = bindClientProfileViewFunctions()
      break
    case 'clientProfileDetails':
      cleanup = bindClientProfileDetailsViewFunctions()
      break
    case 'reports':
      cleanup = bindReportsViewFunctions()
      break
    case 'settings':
      cleanup = bindSettingsViewFunctions(navigation)
      break
    default:
      cleanup = () => {}
  }

  portalRouteBindCleanups.set(bindKey, typeof cleanup === 'function' ? cleanup : () => {})
}

async function ensurePortalRouteReady(route, navigation = portalNavigation) {
  const normalizedRoute = normalizeNavigationRoute(route)
  if (portalRouteIsReady(normalizedRoute)) {
    return
  }

  const existingPromise = portalRouteReadyPromises.get(normalizedRoute)
  if (existingPromise) {
    return existingPromise
  }

  const promise = (async () => {
    showPortalRouteLoading(normalizedRoute)
    await mountPortalRouteTemplate(normalizedRoute)
    await ensurePortalFeatureListReady(PORTAL_ROUTE_FEATURE_KEYS[normalizedRoute] || [])
    bindPortalRouteOnce(normalizedRoute, navigation)
    syncPlanFeaturePermissions()
  })().catch((error) => {
    portalRouteReadyPromises.delete(normalizedRoute)
    showPortalRouteLoadError(normalizedRoute, error)
    throw error
  })

  portalRouteReadyPromises.set(normalizedRoute, promise)
  return promise
}

function cleanupPortalLazyRoutes() {
  for (const cleanup of portalRouteBindCleanups.values()) {
    try {
      cleanup()
    } catch {
      // No-op cleanup safety for lazy route bindings.
    }
  }
  portalRouteBindCleanups.clear()
  portalRouteReadyPromises.clear()
  portalTemplatePromises.clear()
  portalFeaturePromises.clear()
  portalMountedTemplates.clear()
  portalFeatureContext = null
  portalNavigation = null
}

function setUserChip(session) {
  const userName = document.getElementById('userName')
  const userDot = document.getElementById('userDot')
  const organizationChip = document.getElementById('organizationChip')
  const organizationName = document.getElementById('organizationName')
  const companyProfileOpen = document.getElementById('companyProfileOpen')

  if (userName) {
    userName.textContent = session?.name ?? '-'
  }

  if (userDot) {
    userDot.style.opacity = session ? '1' : '0.25'
  }

  const activeOrganizationName = String(session?.organizationName ?? '').trim()
  if (organizationName) {
    organizationName.textContent = activeOrganizationName
  }
  if (organizationChip) {
    organizationChip.hidden = !activeOrganizationName
    organizationChip.dataset.platform = String(session?.roleCode ?? '').toUpperCase() === 'PLATFORM_OWNER' ? 'true' : 'false'
    organizationChip.title = organizationChip.dataset.platform === 'true'
      ? 'Wróć do Panelu admina'
      : 'Zmień aktywną organizację'
  }
  if (companyProfileOpen) {
    const roleCode = String(session?.roleCode ?? '').toUpperCase()
    companyProfileOpen.hidden = !activeOrganizationName || !['OWNER', 'ADMIN', 'ADMINISTRATOR', 'SUPERADMIN'].includes(roleCode)
  }
}

function companyBasicsElements() {
  return {
    overlay: document.getElementById('companyBasicsOverlay'),
    form: document.getElementById('companyBasicsForm'),
    nip: document.getElementById('companyBasicsNip'),
    legalName: document.getElementById('companyBasicsLegalName'),
    declaredEmployeeCount: document.getElementById('companyBasicsEmployeeCount'),
    terms: document.getElementById('companyBasicsTerms'),
    privacy: document.getElementById('companyBasicsPrivacy'),
    marketingEmail: document.getElementById('companyBasicsMarketingEmail'),
    marketingSms: document.getElementById('companyBasicsMarketingSms'),
    marketingPhone: document.getElementById('companyBasicsMarketingPhone'),
    termsLink: document.getElementById('companyBasicsTermsLink'),
    termsVersion: document.getElementById('companyBasicsTermsVersion'),
    privacyLink: document.getElementById('companyBasicsPrivacyLink'),
    privacyVersion: document.getElementById('companyBasicsPrivacyVersion'),
    submit: document.getElementById('companyBasicsSubmit'),
    signOut: document.getElementById('companyBasicsSignOut'),
    error: document.getElementById('companyBasicsError'),
  }
}

function setCompanyBasicsError(message = '', tone = 'error') {
  const { error } = companyBasicsElements()
  if (!error) return
  error.textContent = message
  error.dataset.tone = message ? tone : ''
  error.hidden = !message
}

function setCompanyBasicsBusy(isBusy, label = '') {
  const elements = companyBasicsElements()
  const controls = [
    elements.nip,
    elements.legalName,
    elements.declaredEmployeeCount,
    elements.terms,
    elements.privacy,
    elements.marketingEmail,
    elements.marketingSms,
    elements.marketingPhone,
  ]
  controls.forEach((control) => {
    if (control) control.disabled = isBusy
  })
  if (elements.submit) {
    elements.submit.disabled = isBusy || !cleaningCompanyLegalDocuments
    elements.submit.textContent = isBusy ? label || 'Zapisywanie...' : 'Zapisz i uruchom portal'
  }
}

function applyCleaningCompanyLegalDocuments(documents = CLEANING_COMPANY_LEGAL_DOCUMENTS) {
  const elements = companyBasicsElements()
  if (elements.termsLink) elements.termsLink.href = documents.terms.url
  if (elements.termsVersion) elements.termsVersion.textContent = `(wersja ${documents.terms.version})`
  if (elements.privacyLink) elements.privacyLink.href = documents.privacy.url
  if (elements.privacyVersion) elements.privacyVersion.textContent = `(wersja ${documents.privacy.version})`
}

function hideCleaningCompanyBasicsOverlay({ reset = false } = {}) {
  const { overlay, form } = companyBasicsElements()
  if (overlay) overlay.hidden = true
  document.body.classList.remove('company-basics-open')
  if (reset && form) form.reset()
  if (reset) {
    cleaningCompanyLegalDocuments = null
    cleaningCompanyOnboardingCommandId = ''
    setCompanyBasicsError('')
  }
}

async function showCleaningCompanyBasicsOverlay() {
  const elements = companyBasicsElements()
  const loginScreen = document.getElementById('loginScreen')
  const portalRoot = document.getElementById('portalRoot')
  if (!elements.overlay || !elements.form) {
    throw new Error('Nie udało się wyświetlić formularza danych firmy.')
  }

  if (portalRoot) portalRoot.style.display = 'none'
  if (loginScreen) loginScreen.style.display = 'none'
  elements.form.reset()
  cleaningCompanyLegalDocuments = null
  cleaningCompanyOnboardingCommandId = ''
  applyCleaningCompanyLegalDocuments(CLEANING_COMPANY_LEGAL_DOCUMENTS)
  setCompanyBasicsError('')
  elements.overlay.hidden = false
  document.body.classList.add('company-basics-open')
  setCompanyBasicsBusy(true, 'Pobieranie dokumentów...')

  try {
    // The server publishes the exact legal-document version accepted by the
    // provisioning endpoint. The UI does not invent an acceptance locally.
    const publishedDocuments = await getCleaningCompanyLegalDocuments()
    if (!publishedDocuments.enabled) {
      throw new Error('Rejestracja firmy nie jest obecnie dostępna. Wyloguj się i spróbuj ponownie później.')
    }
    cleaningCompanyLegalDocuments = publishedDocuments
    applyCleaningCompanyLegalDocuments(cleaningCompanyLegalDocuments)
  } catch (error) {
    setCompanyBasicsError(error instanceof Error ? error.message : 'Nie udało się pobrać dokumentów prawnych. Spróbuj ponownie później.')
  } finally {
    setCompanyBasicsBusy(false)
  }

  window.setTimeout(() => elements.nip?.focus(), 0)
}

function showLoginScreen() {
  hideCleaningCompanyBasicsOverlay()
  applyOrganizationKindUi(null)
  const loginScreen = document.getElementById('loginScreen')
  const portalRoot = document.getElementById('portalRoot')

  if (portalRoot) {
    portalRoot.style.display = 'none'
  }

  if (loginScreen) {
    loginScreen.style.display = 'grid'
  }
}

function showPortal() {
  hideCleaningCompanyBasicsOverlay()
  const loginScreen = document.getElementById('loginScreen')
  const portalRoot = document.getElementById('portalRoot')

  if (loginScreen) {
    loginScreen.style.display = 'none'
  }

  if (portalRoot) {
    portalRoot.style.display = ''
    portalRoot.style.removeProperty('display')
  }
}

function setLoginError(message = '', tone = 'error') {
  const errorNode = document.getElementById('loginErr')
  if (!errorNode) {
    return
  }

  errorNode.textContent = message
  errorNode.dataset.tone = message ? tone : ''
  errorNode.style.display = message ? 'block' : 'none'
}

function setLoginResetActionVisible(isVisible) {
  const resetOpen = document.getElementById('loginResetOpen')
  if (resetOpen) {
    resetOpen.hidden = !isVisible
  }
}

function hideLoginTenantFlowPanels() {
  for (const id of [
    'loginOrganizationCreatePanel',
    'loginEmailVerificationPanel',
    'loginRegistrationConsentsPanel',
    'loginRegistrationCompanyPanel',
    'loginRegistrationPaymentPanel',
    'loginRegistrationUnavailablePanel',
  ]) {
    const panel = document.getElementById(id)
    if (panel) panel.hidden = true
  }
}

function setCleaningCompanyRegistrationEntryAvailable(isAvailable) {
  cleaningCompanyRegistrationAvailable = isAvailable === true
  const entry = document.getElementById('loginCompanyEntry')
  const start = document.getElementById('loginCompanyStart')
  if (entry) entry.hidden = !cleaningCompanyRegistrationAvailable
  if (start) start.disabled = loginControlsBusy || !cleaningCompanyRegistrationAvailable
}

async function refreshCleaningCompanyRegistrationAvailability() {
  const requestId = ++cleaningCompanyRegistrationAvailabilityRequest
  setCleaningCompanyRegistrationEntryAvailable(false)

  try {
    const registration = await getCleaningCompanyLegalDocuments()
    if (requestId !== cleaningCompanyRegistrationAvailabilityRequest) return
    setCleaningCompanyRegistrationEntryAvailable(registration?.enabled === true)
  } catch {
    // The public entry is intentionally fail-closed: unavailable or
    // unverifiable registration is never advertised as an actionable path.
    if (requestId === cleaningCompanyRegistrationAvailabilityRequest) {
      setCleaningCompanyRegistrationEntryAvailable(false)
    }
  }
}

function hideLoginCompanyPanels() {
  ;[
    'loginCompanyPanel',
    'loginCompanyEmailPanel',
    'loginCompanyEmailLinkPanel',
    'loginFacilityManagerPanel',
  ].forEach((id) => {
    const panel = document.getElementById(id)
    if (panel) panel.hidden = true
  })
}

function hideLoginStandardPanels() {
  ;[
    'loginCredentialsPanel',
    'loginResetPanel',
    'loginOrganizationPanel',
    'loginMfaChallengePanel',
    'loginMfaEnrollmentPanel',
  ].forEach((id) => {
    const panel = document.getElementById(id)
    if (panel) panel.hidden = true
  })
}

function showLoginCompanyStart() {
  hideLoginStandardPanels()
  hideLoginCompanyPanels()
  const panel = document.getElementById('loginCompanyPanel')
  const title = document.getElementById('loginTitle')
  const copy = document.getElementById('loginCopy')
  if (panel) panel.hidden = false
  setLoginResetActionVisible(false)
  if (title) title.textContent = 'Rejestracja firmy'
  if (copy) copy.textContent = 'Wybierz bezpieczny sposób rozpoczęcia rejestracji.'
}

function normalizedFacilityManagerRegistrationName(value) {
  const source = String(value ?? '')
  return (typeof source.normalize === 'function' ? source.normalize('NFC') : source).trim()
}

function clearFacilityManagerRegistrationAttempt() {
  pendingFacilityManagerRegistration = null
  if (!loginControlsBusy) {
    const input = document.getElementById('loginFacilityManagerOrganizationName')
    const button = document.getElementById('loginFacilityManagerGoogle')
    if (input) input.disabled = false
    if (button) button.innerHTML = '<i class="ph ph-google-logo" aria-hidden="true"></i><span>Zarejestruj z Google</span>'
  }
}

function showLoginFacilityManagerRegistration() {
  hideLoginStandardPanels()
  hideLoginCompanyPanels()
  const panel = document.getElementById('loginFacilityManagerPanel')
  const input = document.getElementById('loginFacilityManagerOrganizationName')
  const title = document.getElementById('loginTitle')
  const copy = document.getElementById('loginCopy')
  if (panel) panel.hidden = false
  setLoginResetActionVisible(false)
  if (title) title.textContent = 'Panel zarządcy obiektu'
  if (copy) copy.textContent = 'Utwórz bezpłatny panel i zacznij zarządzać obiektami.'
  window.setTimeout(() => input?.focus(), 0)
}

function showLoginCompanyEmailRegistration(email = '') {
  hideLoginStandardPanels()
  hideLoginCompanyPanels()
  const panel = document.getElementById('loginCompanyEmailPanel')
  const input = document.getElementById('loginCompanyEmail')
  const title = document.getElementById('loginTitle')
  const copy = document.getElementById('loginCopy')
  if (panel) panel.hidden = false
  if (input) input.value = String(email ?? '').trim().toLowerCase()
  setLoginResetActionVisible(false)
  if (title) title.textContent = 'Potwierdź e-mail'
  if (copy) copy.textContent = 'Wyślemy link, który potwierdzi adres e-mail przed utworzeniem firmy.'
}

function showLoginCompanyEmailLinkConfirmation(email = '') {
  hideLoginStandardPanels()
  hideLoginCompanyPanels()
  const panel = document.getElementById('loginCompanyEmailLinkPanel')
  const input = document.getElementById('loginCompanyEmailLink')
  const title = document.getElementById('loginTitle')
  const copy = document.getElementById('loginCopy')
  if (panel) panel.hidden = false
  if (input) input.value = String(email ?? '').trim().toLowerCase()
  setLoginResetActionVisible(false)
  if (title) title.textContent = 'Potwierdź e-mail'
  if (copy) copy.textContent = 'Dokończ bezpieczne potwierdzenie linku, aby przejść do danych firmy.'
}

function showLoginCredentials({ showResetAction = true } = {}) {
  hideLoginTenantFlowPanels()
  const credentialsPanel = document.getElementById('loginCredentialsPanel')
  const resetPanel = document.getElementById('loginResetPanel')
  const organizationPanel = document.getElementById('loginOrganizationPanel')
  const mfaChallengePanel = document.getElementById('loginMfaChallengePanel')
  const mfaEnrollmentPanel = document.getElementById('loginMfaEnrollmentPanel')
  const loginTitle = document.getElementById('loginTitle')
  const loginCopy = document.getElementById('loginCopy')

  hideLoginCompanyPanels()

  if (credentialsPanel) {
    credentialsPanel.hidden = false
  }
  if (resetPanel) {
    resetPanel.hidden = true
  }
  if (organizationPanel) {
    organizationPanel.hidden = true
  }
  if (mfaChallengePanel) mfaChallengePanel.hidden = true
  if (mfaEnrollmentPanel) mfaEnrollmentPanel.hidden = true
  setLoginResetActionVisible(showResetAction)
  if (loginTitle) {
    loginTitle.textContent = 'Zaloguj się'
  }
  if (loginCopy) {
    if (document.getElementById('loginAuthScope')?.value === 'platform') {
      loginCopy.textContent = 'Zaloguj się do Panelu admina.'
    } else {
      loginCopy.textContent = 'Logowanie do panelu firmy sprz\u0105taj\u0105cej Cleanzi.'
    }
  }
}

function showLoginPasswordReset(email = '') {
  hideLoginTenantFlowPanels()
  hideLoginCompanyPanels()
  const credentialsPanel = document.getElementById('loginCredentialsPanel')
  const resetPanel = document.getElementById('loginResetPanel')
  const organizationPanel = document.getElementById('loginOrganizationPanel')
  const mfaChallengePanel = document.getElementById('loginMfaChallengePanel')
  const mfaEnrollmentPanel = document.getElementById('loginMfaEnrollmentPanel')
  const resetEmail = document.getElementById('loginResetEmail')
  const loginTitle = document.getElementById('loginTitle')
  const loginCopy = document.getElementById('loginCopy')

  hideLoginCompanyPanels()

  if (credentialsPanel) {
    credentialsPanel.hidden = true
  }
  if (resetPanel) {
    resetPanel.hidden = false
  }
  if (organizationPanel) {
    organizationPanel.hidden = true
  }
  if (mfaChallengePanel) mfaChallengePanel.hidden = true
  if (mfaEnrollmentPanel) mfaEnrollmentPanel.hidden = true
  setLoginResetActionVisible(false)
  if (resetEmail) {
    resetEmail.value = String(email ?? '').trim().toLowerCase()
  }
  if (loginTitle) {
    loginTitle.textContent = 'Zresetuj hasło'
  }
  if (loginCopy) {
    loginCopy.textContent = 'Aby zresetować hasło, wpisz adres email przypisany do konta.'
  }
}

function showLoginOrganizationSelection(organizations = []) {
  selectableOrganizations = Array.isArray(organizations) ? organizations : []
  hideLoginTenantFlowPanels()
  const credentialsPanel = document.getElementById('loginCredentialsPanel')
  const resetPanel = document.getElementById('loginResetPanel')
  const organizationPanel = document.getElementById('loginOrganizationPanel')
  const organizationList = document.getElementById('loginOrganizationList')
  const mfaChallengePanel = document.getElementById('loginMfaChallengePanel')
  const mfaEnrollmentPanel = document.getElementById('loginMfaEnrollmentPanel')
  const loginTitle = document.getElementById('loginTitle')
  const loginCopy = document.getElementById('loginCopy')
  const createOpen = document.getElementById('loginOrganizationCreateOpen')
  const hasPendingRegistration = Boolean(pendingRegistration?.registrationId || getPendingRegistrationEntry()?.registrationId)

  hideLoginCompanyPanels()

  if (credentialsPanel) {
    credentialsPanel.hidden = true
  }
  if (resetPanel) {
    resetPanel.hidden = true
  }
  if (organizationPanel) {
    organizationPanel.hidden = false
  }
  if (mfaChallengePanel) mfaChallengePanel.hidden = true
  if (mfaEnrollmentPanel) mfaEnrollmentPanel.hidden = true
  setLoginResetActionVisible(false)
  if (loginTitle) {
    loginTitle.textContent = 'Wybierz organizacj\u0119'
  }
  if (loginCopy) {
    loginCopy.textContent = organizations.length
      ? hasPendingRegistration
        ? 'Wybierz istniejącą organizację albo jawnie kontynuuj rejestrację nowej firmy.'
        : 'Wybierz organizację albo rozpocznij osobną rejestrację nowej firmy.'
      : hasPendingRegistration
        ? 'Kontynuuj prawidłową próbę rejestracji, aby utworzyć nową firmę.'
        : 'To konto nie ma jeszcze organizacji. Rozpocznij rejestrację nowej firmy.'
  }
  if (createOpen) {
    createOpen.textContent = hasPendingRegistration
      ? 'Kontynuuj rejestrację nowej firmy'
      : 'Zarejestruj nową firmę'
  }
  if (!organizationList) {
    return
  }

  organizationList.replaceChildren()
  selectableOrganizations.forEach((organization) => {
    const orgId = String(organization?.orgId ?? '').trim()
    const name = String(organization?.organizationName ?? '').trim()
    if (!orgId || !name) {
      return
    }

    const button = document.createElement('button')
    button.className = 'login-organization-option'
    button.type = 'button'
    button.dataset.orgId = orgId
    button.setAttribute('role', 'listitem')

    const copy = document.createElement('span')
    copy.className = 'login-organization-option-copy'

    const nameNode = document.createElement('span')
    nameNode.className = 'login-organization-option-name'
    nameNode.textContent = name

    const idNode = document.createElement('span')
    idNode.className = 'login-organization-option-id'
    idNode.textContent = orgId

    const arrow = document.createElement('span')
    arrow.className = 'login-organization-option-arrow'
    arrow.setAttribute('aria-hidden', 'true')
    arrow.textContent = '\u203a'

    copy.append(nameNode, idNode)
    button.append(copy, arrow)
    organizationList.append(button)
  })
}

function showLoginOrganizationCreate() {
  hideLoginTenantFlowPanels()
  for (const id of ['loginCredentialsPanel', 'loginResetPanel', 'loginOrganizationPanel', 'loginEmailVerificationPanel', 'loginMfaChallengePanel', 'loginMfaEnrollmentPanel']) {
    const panel = document.getElementById(id)
    if (panel) panel.hidden = true
  }
  const panel = document.getElementById('loginOrganizationCreatePanel')
  const title = document.getElementById('loginTitle')
  const copy = document.getElementById('loginCopy')
  if (panel) panel.hidden = false
  if (title) title.textContent = 'Zarejestruj nową firmę'
  if (copy) copy.textContent = 'Nową organizację i okres próbny można utworzyć wyłącznie z prawidłowej próby rejestracji.'
  setLoginResetActionVisible(false)
}

function showLoginEmailVerification() {
  hideLoginTenantFlowPanels()
  for (const id of ['loginCredentialsPanel', 'loginResetPanel', 'loginOrganizationPanel', 'loginOrganizationCreatePanel', 'loginMfaChallengePanel', 'loginMfaEnrollmentPanel']) {
    const panel = document.getElementById(id)
    if (panel) panel.hidden = true
  }
  const panel = document.getElementById('loginEmailVerificationPanel')
  const title = document.getElementById('loginTitle')
  const copy = document.getElementById('loginCopy')
  if (panel) panel.hidden = false
  if (title) title.textContent = 'Potwierdź adres email'
  if (copy) copy.textContent = 'Po potwierdzeniu wróć tutaj i wybierz „Sprawdź ponownie”.'
  setLoginResetActionVisible(false)
}

function showLoginMfaChallenge(factors = []) {
  hideLoginTenantFlowPanels()
  const credentialsPanel = document.getElementById('loginCredentialsPanel')
  const resetPanel = document.getElementById('loginResetPanel')
  const organizationPanel = document.getElementById('loginOrganizationPanel')
  const challengePanel = document.getElementById('loginMfaChallengePanel')
  const enrollmentPanel = document.getElementById('loginMfaEnrollmentPanel')
  const factorSelect = document.getElementById('loginMfaFactor')
  const sendCode = document.getElementById('loginMfaSendCode')
  const title = document.getElementById('loginTitle')
  const copy = document.getElementById('loginCopy')
  hideLoginCompanyPanels()
  if (credentialsPanel) credentialsPanel.hidden = true
  if (resetPanel) resetPanel.hidden = true
  if (organizationPanel) organizationPanel.hidden = true
  if (challengePanel) challengePanel.hidden = false
  if (enrollmentPanel) enrollmentPanel.hidden = true
  setLoginResetActionVisible(false)
  if (title) title.textContent = 'Potwierdź logowanie'
  if (copy) copy.textContent = 'Wpisz kod z drugiego składnika uwierzytelniania.'
  if (factorSelect) {
    factorSelect.replaceChildren()
    factors.forEach((factor) => {
      const option = document.createElement('option')
      option.value = String(factor?.uid ?? '')
      option.dataset.factorId = String(factor?.factorId ?? '')
      option.textContent = factor?.factorId === 'phone'
        ? `SMS ${factor?.phoneNumber || factor?.displayName || ''}`.trim()
        : factor?.displayName || 'Aplikacja TOTP'
      factorSelect.append(option)
    })
    factorSelect.dispatchEvent(new Event('change'))
  }
  if (sendCode) sendCode.hidden = factorSelect?.selectedOptions?.[0]?.dataset?.factorId !== 'phone'
}

function showLoginMfaEnrollment() {
  hideLoginTenantFlowPanels()
  const credentialsPanel = document.getElementById('loginCredentialsPanel')
  const resetPanel = document.getElementById('loginResetPanel')
  const organizationPanel = document.getElementById('loginOrganizationPanel')
  const challengePanel = document.getElementById('loginMfaChallengePanel')
  const enrollmentPanel = document.getElementById('loginMfaEnrollmentPanel')
  const title = document.getElementById('loginTitle')
  const copy = document.getElementById('loginCopy')
  const totpSetup = document.getElementById('loginMfaTotpSetup')
  const phoneSetup = document.getElementById('loginMfaPhoneSetup')
  const emailSetup = document.getElementById('loginMfaEmailSetup')
  hideLoginCompanyPanels()
  if (credentialsPanel) credentialsPanel.hidden = true
  if (resetPanel) resetPanel.hidden = true
  if (organizationPanel) organizationPanel.hidden = true
  if (challengePanel) challengePanel.hidden = true
  if (enrollmentPanel) enrollmentPanel.hidden = false
  if (totpSetup) totpSetup.hidden = true
  if (phoneSetup) phoneSetup.hidden = true
  if (emailSetup) emailSetup.hidden = true
  setLoginResetActionVisible(false)
  if (title) title.textContent = 'Zabezpiecz konto'
  if (copy) copy.textContent = 'Konto administratora platformy wymaga TOTP, kodu SMS albo kodu email.'
  pendingMfaEnrollmentType = ''
  pendingEmailMfaChallengeId = ''
}

function companyEmailRetrySecondsRemaining() {
  return Math.max(0, Math.ceil((companyEmailRetryAvailableAtMs - Date.now()) / 1_000))
}

function refreshCompanyEmailRetryControl() {
  const button = document.getElementById('loginCompanyEmailSend')
  const remaining = companyEmailRetrySecondsRemaining()
  if (button) {
    button.disabled = loginControlsBusy || remaining > 0
    button.textContent = remaining > 0
      ? `Odczekaj ${remaining} s`
      : 'Wyślij link potwierdzający'
  }
  if (remaining === 0 && companyEmailRetryTimer) {
    window.clearInterval(companyEmailRetryTimer)
    companyEmailRetryTimer = null
  }
}

function startCompanyEmailRetryCooldown() {
  companyEmailRetryAvailableAtMs = Date.now() + COMPANY_EMAIL_RETRY_COOLDOWN_MS
  if (companyEmailRetryTimer) window.clearInterval(companyEmailRetryTimer)
  refreshCompanyEmailRetryControl()
  companyEmailRetryTimer = window.setInterval(refreshCompanyEmailRetryControl, 1_000)
}

function registrationPlanLabel(attempt = activeRegistrationAttempt) {
  const planCode = String(attempt?.planCode ?? '').toUpperCase()
  // The separate Registration API remains the source of truth for the legacy
  // password-registration trial. Keep this wording neutral until its own
  // independently deployed broker is aligned with the 30-day policy.
  const labels = { TRIAL: 'Okres próbny', GO_PLUS: 'GO+', PLUS: 'PLUS', PRO: 'PRO' }
  const plan = labels[planCode] || 'wybrany plan'
  const billingCycle = String(attempt?.billingCycle ?? '').toUpperCase()
  if (billingCycle === 'MONTHLY') return `${plan} · płatność miesięczna`
  if (billingCycle === 'YEARLY') return `${plan} · płatność roczna`
  return plan
}

function showOnlyLoginFlowPanel(panelId, title, copy) {
  hideLoginTenantFlowPanels()
  for (const id of [
    'loginCredentialsPanel',
    'loginResetPanel',
    'loginOrganizationPanel',
    'loginMfaChallengePanel',
    'loginMfaEnrollmentPanel',
  ]) {
    const panel = document.getElementById(id)
    if (panel) panel.hidden = true
  }
  const panel = document.getElementById(panelId)
  if (panel) panel.hidden = false
  const titleNode = document.getElementById('loginTitle')
  const copyNode = document.getElementById('loginCopy')
  if (titleNode) titleNode.textContent = title
  if (copyNode) copyNode.textContent = copy
  setLoginResetActionVisible(false)
}

function showLoginRegistrationConsents(attempt = {}) {
  activeRegistrationAttempt = { ...activeRegistrationAttempt, ...attempt }
  showOnlyLoginFlowPanel(
    'loginRegistrationConsentsPanel',
    'Zgody rejestracyjne',
    'Zapisz wymagane zgody przed weryfikacją i utworzeniem firmy.',
  )
  const plan = document.getElementById('loginRegistrationPlan')
  if (plan) plan.textContent = `Plan: ${registrationPlanLabel()}`
  const existing = document.getElementById('loginRegistrationChooseExisting')
  if (existing) existing.hidden = selectableOrganizations.length === 0
}

function syncRegistrationCountryFields() {
  const country = document.getElementById('loginRegistrationCountry')
  const taxType = document.getElementById('loginRegistrationTaxType')
  const lookup = document.getElementById('loginRegistrationLookup')
  const isPolishNip = country?.value === 'PL' && taxType?.value === 'NIP'
  if (lookup) lookup.hidden = !isPolishNip
  if (country?.value !== 'PL' && taxType?.value === 'NIP') taxType.value = 'TIN'
}

function showLoginRegistrationCompany(attempt = {}) {
  activeRegistrationAttempt = { ...activeRegistrationAttempt, ...attempt }
  showOnlyLoginFlowPanel(
    'loginRegistrationCompanyPanel',
    'Dane firmy',
    'Te dane utworzą kanoniczny profil firmy. Dostęp pojawi się dopiero po bezpiecznej finalizacji.',
  )
  const plan = document.getElementById('loginRegistrationCompanyPlan')
  if (plan) plan.textContent = `Plan: ${registrationPlanLabel()}`
  const ownerFirstName = document.getElementById('loginRegistrationOwnerFirstName')
  const ownerLastName = document.getElementById('loginRegistrationOwnerLastName')
  const ownerPhone = document.getElementById('loginRegistrationOwnerPhone')
  if (ownerFirstName && !ownerFirstName.value) ownerFirstName.value = String(activeRegistrationAttempt?.owner?.firstName ?? '')
  if (ownerLastName && !ownerLastName.value) ownerLastName.value = String(activeRegistrationAttempt?.owner?.lastName ?? '')
  if (ownerPhone && !ownerPhone.value) ownerPhone.value = String(activeRegistrationAttempt?.owner?.phone ?? '')
  const country = document.getElementById('loginRegistrationCountry')
  const normalizedCountry = String(activeRegistrationAttempt?.countryCode ?? 'PL').toUpperCase()
  if (country && ['PL', 'DE', 'GB', 'US'].includes(normalizedCountry)) country.value = normalizedCountry
  const taxType = document.getElementById('loginRegistrationTaxType')
  if (taxType && normalizedCountry !== 'PL' && taxType.value === 'NIP') taxType.value = 'TIN'
  const billing = document.getElementById('loginRegistrationBillingFields')
  if (billing) billing.hidden = activeRegistrationAttempt?.paid !== true
  const billingEmail = document.getElementById('loginRegistrationBillingEmail')
  if (billingEmail && !billingEmail.value) billingEmail.value = String(activeRegistrationAttempt?.email ?? '')
  const save = document.getElementById('loginRegistrationCompanySave')
  if (save) {
    save.textContent = activeRegistrationAttempt?.paid === true
      ? 'Utwórz firmę i przejdź do płatności'
      : 'Utwórz firmę i rozpocznij okres próbny'
  }
  const existing = document.getElementById('loginRegistrationCompanyExisting')
  if (existing) existing.hidden = selectableOrganizations.length === 0
  syncRegistrationCountryFields()
}

function showLoginRegistrationPayment(attempt = {}) {
  activeRegistrationAttempt = { ...activeRegistrationAttempt, ...attempt }
  showOnlyLoginFlowPanel(
    'loginRegistrationPaymentPanel',
    'Płatność oczekuje',
    'Dostęp operacyjny pozostaje zamknięty, dopóki podpisany webhook Stripe nie potwierdzi płatności.',
  )
  const existing = document.getElementById('loginRegistrationPaymentExisting')
  if (existing) existing.hidden = selectableOrganizations.length === 0
}

function showLoginRegistrationUnavailable() {
  showOnlyLoginFlowPanel(
    'loginRegistrationUnavailablePanel',
    'Wznów rejestrację',
    'Portal nie utworzy organizacji ani Triala bez aktywnej, prawidłowej próby rejestracji.',
  )
  const existing = document.getElementById('loginRegistrationUnavailableExisting')
  if (existing) existing.hidden = selectableOrganizations.length === 0
}

function showExistingOrganizationsFromRegistration() {
  if (!selectableOrganizations.length) return
  setLoginError('')
  showLoginOrganizationSelection(selectableOrganizations)
}

function formatRegistrationError(error) {
  const code = String(error?.code ?? '').toUpperCase()
  const messages = {
    REGISTRATION_API_NOT_CONFIGURED: 'Portal nie ma skonfigurowanego adresu Registration API.',
    REGISTRATION_TOKEN_INVALID: 'Link rejestracyjny wygasł albo został już użyty. Wznów rejestrację.',
    REGISTRATION_NOT_FOUND: 'Nie znaleziono tej próby rejestracji.',
    REGISTRATION_EXPIRED: 'Próba rejestracji wygasła. Rozpocznij ją ponownie.',
    REQUIRED_CONSENT_MISSING: 'Zaakceptuj regulamin i politykę prywatności.',
    TRIAL_ALREADY_USED: 'To konto wykorzystało już bezpłatny Trial. Wybierz plan płatny.',
    NIP_INVALID: 'Podaj poprawny polski NIP.',
    COMPANY_NOT_FOUND: 'Nie znaleziono firmy dla podanego NIP.',
    COMPANY_LOOKUP_UNAVAILABLE: 'Wyszukiwanie firmy jest chwilowo niedostępne. Dane możesz wpisać ręcznie.',
    PAID_COMPANY_FIELD_REQUIRED: 'Uzupełnij wymagane dane rozliczeniowe.',
  }
  return messages[code] || (error instanceof Error ? error.message : 'Nie udało się dokończyć rejestracji.')
}

function setLoginControlsBusy(isBusy, label = '') {
  loginControlsBusy = isBusy === true
  const loginButton = document.getElementById('loginBtn')
  const resetSend = document.getElementById('loginResetSend')
  const resetBack = document.getElementById('loginResetBack')
  const resetOpen = document.getElementById('loginResetOpen')
  const loginInput = document.getElementById('loginLogin')
  const passwordInput = document.getElementById('loginPass')
  const resetEmail = document.getElementById('loginResetEmail')
  const authScope = document.getElementById('loginAuthScope')
  const organizationCancel = document.getElementById('loginOrganizationCancel')
  const organizationButtons = document.querySelectorAll('.login-organization-option')
  const companyEmailSend = document.getElementById('loginCompanyEmailSend')
  const companyEmailLinkConfirm = document.getElementById('loginCompanyEmailLinkConfirm')
  const facilityManagerGoogle = document.getElementById('loginFacilityManagerGoogle')
  const facilityManagerGoogleLogin = document.getElementById('loginFacilityManagerGoogleLogin')

  if (loginButton) {
    loginButton.disabled = isBusy
    loginButton.textContent = isBusy ? label || 'Logowanie...' : 'Zaloguj'
  }
  if (resetSend) {
    resetSend.disabled = isBusy
    resetSend.textContent = isBusy ? label || 'Wysyłanie...' : 'Wyślij link'
  }
  if (resetBack) {
    resetBack.disabled = isBusy
  }
  if (resetOpen) {
    resetOpen.disabled = isBusy
  }
  if (loginInput) {
    loginInput.disabled = isBusy
  }
  if (passwordInput) {
    passwordInput.disabled = isBusy
  }
  if (resetEmail) {
    resetEmail.disabled = isBusy
  }
  if (authScope) {
    authScope.disabled = isBusy
  }
  if (organizationCancel) {
    organizationCancel.disabled = isBusy
  }
  ;[
    'loginCompanyStart', 'loginCompanyGoogle', 'loginCompanyEmailOpen', 'loginCompanyBack',
    'loginCompanyEmail', 'loginCompanyEmailBack', 'loginCompanyEmailLink',
    'loginFacilityManagerStart', 'loginFacilityManagerBack', 'loginFacilityManagerOrganizationName', 'loginFacilityManagerGoogleLogin',
  ].forEach((id) => {
    const control = document.getElementById(id)
    if (control) {
      control.disabled = isBusy ||
        (id === 'loginCompanyStart' && !cleaningCompanyRegistrationAvailable) ||
        (id === 'loginFacilityManagerOrganizationName' && pendingFacilityManagerRegistration?.retryProvisioning === true)
    }
  })
  if (companyEmailSend) {
    if (isBusy) {
      companyEmailSend.disabled = true
      companyEmailSend.textContent = label || 'Wysyłanie...'
    } else {
      refreshCompanyEmailRetryControl()
    }
  }
  if (companyEmailLinkConfirm) {
    companyEmailLinkConfirm.disabled = isBusy
    companyEmailLinkConfirm.textContent = isBusy ? label || 'Potwierdzanie...' : 'Potwierdź email'
  }
  if (facilityManagerGoogle) {
    facilityManagerGoogle.disabled = isBusy
    facilityManagerGoogle.innerHTML = isBusy
      ? '<i class="ph ph-spinner-gap" aria-hidden="true"></i><span>Łączenie z Google...</span>'
      : pendingFacilityManagerRegistration?.retryProvisioning === true
        ? '<i class="ph ph-arrow-clockwise" aria-hidden="true"></i><span>Ponów utworzenie panelu</span>'
        : '<i class="ph ph-google-logo" aria-hidden="true"></i><span>Zarejestruj z Google</span>'
  }
  if (facilityManagerGoogleLogin) {
    facilityManagerGoogleLogin.disabled = isBusy
  }
  organizationButtons.forEach((button) => {
    button.disabled = isBusy
  })
  ;[
    'loginGoogleBtn', 'loginOrganizationCreateOpen', 'loginOrganizationCreateBack',
    'loginOrganizationCreate',
    'loginRegistrationTerms', 'loginRegistrationPrivacy', 'loginRegistrationMarketing',
    'loginRegistrationConsentsSave', 'loginRegistrationChooseExisting', 'loginRegistrationCancel',
    'loginRegistrationLegalName', 'loginRegistrationCountry', 'loginRegistrationTaxType',
    'loginRegistrationOwnerFirstName', 'loginRegistrationOwnerLastName', 'loginRegistrationOwnerPhone',
    'loginRegistrationTaxId', 'loginRegistrationLookup', 'loginRegistrationAddress',
    'loginRegistrationPostalCode', 'loginRegistrationLocality', 'loginRegistrationBillingEmail',
    'loginRegistrationInvoiceEmail', 'loginRegistrationBillingPhone', 'loginRegistrationCompanySave',
    'loginRegistrationCompanyExisting', 'loginRegistrationCompanyCancel',
    'loginRegistrationPaymentCheck', 'loginRegistrationPaymentExisting', 'loginRegistrationPaymentCancel',
    'loginRegistrationRestart', 'loginRegistrationUnavailableExisting', 'loginRegistrationUnavailableCancel',
    'loginEmailVerificationCheck', 'loginEmailVerificationSend', 'loginEmailVerificationCancel',
    'loginMfaFactor', 'loginMfaSendCode', 'loginMfaCode', 'loginMfaConfirm', 'loginMfaCancel',
    'loginMfaChooseTotp', 'loginMfaChooseSms', 'loginMfaChooseEmail', 'loginMfaPhone', 'loginMfaPhoneSend',
    'loginMfaEmail', 'loginMfaEmailSend',
    'loginMfaEnrollCode', 'loginMfaEnrollConfirm', 'loginMfaEnrollCancel',
  ].forEach((id) => {
    const control = document.getElementById(id)
    if (control) control.disabled = isBusy
  })
}

function formatLoginError(error) {
  const authErrorText = `${error?.code ?? ''} ${error?.message ?? error ?? ''}`.toLowerCase()
  if (authErrorText.includes('auth/invalid-email')) {
    return 'Podaj poprawny adres email.'
  }

  if (isPasswordResetEligibleLoginError(error)) {
    return 'Nieprawidłowy email lub hasło.'
  }

  if (authErrorText.includes('feature is not initialized')) {
    return 'Portal nie dokończył uruchamiania. Odśwież stronę i spróbuj ponownie.'
  }

  return error instanceof Error ? error.message : 'Błąd logowania.'
}

function isPasswordResetEligibleLoginError(error) {
  const authErrorText = `${error?.code ?? ''} ${error?.message ?? error ?? ''}`.toLowerCase()
  return (
    authErrorText.includes('auth/invalid-credential') ||
    authErrorText.includes('auth/wrong-password') ||
    authErrorText.includes('auth/user-not-found')
  )
}

function calendarCurrentUserTaskIdentity() {
  const match = dashboardCurrentUserMatchKeys()
  const worker = (Array.isArray(appState.workers) ? appState.workers : []).find((item) =>
    calendarValuesMatchAccess(calendarWorkerAccessValues(item), match),
  )
  const workerId = worker ? calendarWorkerId(worker) : ''
  const workerLabel = worker ? calendarWorkerLabel(worker) : ''
  const option = kanbanCurrentUserOption()
  const label = workerLabel || String(option?.label ?? '').trim() || calendarCurrentActorLabel()
  const id = workerId || String(option?.id ?? '').trim() || label
  return { id, label }
}

function calendarTaskReadReceiptValues(receipt = {}) {
  return [
    receipt.id,
    receipt.label,
    receipt.name,
    receipt.workerId,
    receipt.workerName,
    receipt.userId,
    receipt.login,
    receipt.email,
  ]
}

function calendarTaskReadByCurrentUser(task = {}, match = dashboardCurrentUserMatchKeys()) {
  const receipts = calendarNormalizeTaskReadReceipts(task.readReceipts ?? task.readByUsers ?? task.seenByUsers)
  if (receipts.length) {
    return receipts.some((receipt) => calendarValuesMatchAccess(calendarTaskReadReceiptValues(receipt), match))
  }
  return Boolean(task.read || task.isRead || task.seen || task.readAt || task.seenAt || task.acknowledgedAt)
}

function calendarTaskShouldShowOnDashboardForCurrentUser(task = {}, match = dashboardCurrentUserMatchKeys()) {
  const hasAssignedWorkers = calendarHasAssignedWorkers(task.workers ?? task.assignees ?? task.people)
  const assignedToCurrentUser = calendarTaskAssignedToAccess(task, match)
  const responsibleForCurrentUser = hasAssignedWorkers ? assignedToCurrentUser : calendarTaskIsVisibleForCurrentUser(task)
  return Boolean(responsibleForCurrentUser && !calendarTaskReadByCurrentUser(task, match))
}

function calendarMarkTaskRead(taskId = '', options = {}) {
  const id = String(taskId ?? '').trim()
  if (!id) {
    return false
  }
  const tasksBefore = calendarLoadTasks()
  const task = tasksBefore.find((item) => item.id === id)
  if (!task) {
    return false
  }
  const match = dashboardCurrentUserMatchKeys()
  if (calendarTaskReadByCurrentUser(task, match)) {
    return false
  }
  const readAt = new Date().toISOString()
  const actor = calendarCurrentUserTaskIdentity()
  const receipt = { id: actor.id, label: actor.label, at: readAt }
  const details = `Przeczytał: ${actor.label}`
  const nextTasks = tasksBefore.map((item) =>
    item.id === id
      ? calendarNormalizeTask(
          calendarAppendTaskActivity(
            {
              ...item,
              readReceipts: calendarMergeTaskReadReceipts(item.readReceipts, [receipt]),
              lastReadAt: readAt,
              lastReadBy: actor.label,
              updatedAt: readAt,
            },
            'Odczytano zadanie',
            details,
            { actor: actor.label, at: readAt },
          ),
        )
      : item,
  )
  calendarSaveTasks(nextTasks)
  if (options.renderDashboard !== false) {
    renderDashboardKanbanTasks()
  }
  if (options.renderKanban && appState.currentRoute === 'kanban') {
    renderKanbanView()
  }
  if (options.renderCalendar && appState.currentRoute === 'calendar') {
    renderCalendarView()
  }
  return true
}

function setSubwelcomeMetric(selector, count) {
  const node = document.querySelector(selector)
  if (!node) {
    return
  }

  if (!node.dataset.baseText) {
    node.dataset.baseText = node.textContent
  }

  node.textContent = `${node.dataset.baseText} ${getDataSourceLabel()} rekordy: ${count}.`
}

let clientProfileFeature = null

function getClientProfileFeature() {
  if (!clientProfileFeature) {
    throw new Error('Client profile feature is not initialized.')
  }
  return clientProfileFeature
}

function fillClientsCoordinatorSelect(selected = '') {
  return getClientProfileFeature().fillCoordinatorOptions(selected)
}

function openClientModal(mode = 'add', clientId = '', options = {}) {
  return getClientProfileFeature().openModal(mode, clientId, options)
}

async function fetchClientsForCurrentSession(force = false) {
  return getClientProfileFeature().fetch(force)
}

async function fetchClientProfileForCurrentSession(force = false) {
  return getClientProfileFeature().fetch(force)
}

async function fetchClientProfileDetailForCurrentSession(force = false) {
  return getClientProfileFeature().fetchDetail(force)
}

function openClientProfileDetails(clientId) {
  return getClientProfileFeature().openDetails(clientId)
}

function renderClientProfileDetailView() {
  return getClientProfileFeature().renderDetail()
}

function fillClientProfileCoordinatorOptions(selected = '') {
  return getClientProfileFeature().fillCoordinatorOptions(selected)
}

function clientProfileFindById(clientId) {
  return getClientProfileFeature().findById(clientId)
}

let ordersFeature = null

function getOrdersFeature() {
  if (!ordersFeature) {
    throw new Error('Orders feature is not initialized.')
  }
  return ordersFeature
}

function ordersTimelineClientLabel(order = {}) {
  return getOrdersFeature().ordersTimelineClientLabel(order)
}

function ordersTimelineAddressLabel(order = {}) {
  return getOrdersFeature().ordersTimelineAddressLabel(order)
}

function ordersFindTimelineOrder(orderId) {
  return getOrdersFeature().ordersFindTimelineOrder(orderId)
}

function ordersNormalizeDateField(value, fallback = todayYmd()) {
  return getOrdersFeature().ordersNormalizeDateField(value, fallback)
}

function ordersNormalizeTimeField(value, fallback = '08:00') {
  return getOrdersFeature().ordersNormalizeTimeField(value, fallback)
}

function ordersTimelineOrderCanBeDeleted(order = {}) {
  return getOrdersFeature().ordersTimelineOrderCanBeDeleted(order)
}

function ordersConfirmTimelineOrderDelete(order = {}) {
  return getOrdersFeature().ordersConfirmTimelineOrderDelete(order)
}

function ordersExtendedWorkAllowed(order = {}) {
  return getOrdersFeature().ordersExtendedWorkAllowed(order)
}

function ordersAssignExtendedWorkFlags(target = {}, allowed = false) {
  return getOrdersFeature().ordersAssignExtendedWorkFlags(target, allowed)
}

function ordersNormalizeOrderRows(order = {}, resources = calendarTimelineResources()) {
  return getOrdersFeature().ordersNormalizeOrderRows(order, resources)
}

function calendarTimelineRowAllowsOverlap(rowIndex, resources = calendarTimelineResources()) {
  return getOrdersFeature().calendarTimelineRowAllowsOverlap(rowIndex, resources)
}

function ordersWorkerAssignmentsFromRows(rows = [], resources = calendarTimelineResources()) {
  return getOrdersFeature().ordersWorkerAssignmentsFromRows(rows, resources)
}

function ordersOrderHasInactiveOnlyWorkerAssignments(order = {}, resources = calendarTimelineResources()) {
  return getOrdersFeature().ordersOrderHasInactiveOnlyWorkerAssignments(order, resources)
}

function ordersWorkerSelectionLabel(rows = [], resources = calendarTimelineResources()) {
  return getOrdersFeature().ordersWorkerSelectionLabel(rows, resources)
}

function ordersFormatWorkMinutes(minutes = 0) {
  return getOrdersFeature().ordersFormatWorkMinutes(minutes)
}

function ordersWorkAllocationsForSubjects(order = {}, subjects = [], totalMinutes = 0, forceEven = false) {
  return getOrdersFeature().ordersWorkAllocationsForSubjects(order, subjects, totalMinutes, forceEven)
}

function ordersSelectCreatedClientInEditor(payload = {}, orderId = '') {
  return getOrdersFeature().ordersSelectCreatedClientInEditor(payload, orderId)
}

function ordersTimelineToneForType(type = '') {
  return getOrdersFeature().ordersTimelineToneForType(type)
}

function ordersNextOrderId() {
  return getOrdersFeature().ordersNextOrderId()
}

function ordersDefaultEndTime(startTime = '08:00', durationMinutes = 120) {
  return getOrdersFeature().ordersDefaultEndTime(startTime, durationMinutes)
}

function ordersOpenAddEditor(...args) {
  return getOrdersFeature().openAddEditor(...args)
}

function ordersWarmLocationSources() {
  return getOrdersFeature().ordersWarmLocationSources()
}

function ordersScheduleModeForOrder(order = {}) {
  return getOrdersFeature().ordersScheduleModeForOrder(order)
}

function ordersApplyWeeklyPatternRuleToOccurrence(order = {}, occurrenceDay = '') {
  return getOrdersFeature().ordersApplyWeeklyPatternRuleToOccurrence(order, occurrenceDay)
}

function ordersWeeklyPatternSources(order = {}) {
  return getOrdersFeature().ordersWeeklyPatternSources(order)
}

function ordersNormalizeWeeklyPatternRule(rule = {}, order = {}, weekdayFallback = null) {
  return getOrdersFeature().ordersNormalizeWeeklyPatternRule(rule, order, weekdayFallback)
}

function ordersStoreWeeklyPatternRules(order = {}, rules = []) {
  return getOrdersFeature().ordersStoreWeeklyPatternRules(order, rules)
}

function ordersOpenEditor(orderId) {
  return getOrdersFeature().openEditor(orderId)
}

function ordersOpenEditorFromCalendar(orderId, options = {}) {
  return getOrdersFeature().openEditorFromCalendar(orderId, options)
}

function ordersOpenRecurringOccurrenceEditorFromCalendar(sourceOrderId = '', occurrenceDateYmd = '', options = {}) {
  return getOrdersFeature().openRecurringOccurrenceEditorFromCalendar(sourceOrderId, occurrenceDateYmd, options)
}

function renderOrdersView() {
  return getOrdersFeature().renderList()
}

function renderOrdersMapView() {
  return getOrdersFeature().renderMap()
}

function ordersLoadGoogleMaps(...args) {
  return getOrdersFeature().loadGoogleMaps(...args)
}

function bindOrdersViewFunctions() {
  return getOrdersFeature().bindList()
}

function bindOrdersMapViewFunctions() {
  return getOrdersFeature().bindMap()
}

const PDF_EXPORT_FONT_FAMILY = 'RobotoPdf'
const PDF_EXPORT_FONT_REGULAR_FILE = 'Roboto-Regular.ttf'
const PDF_EXPORT_FONT_BOLD_FILE = 'Roboto-Medium.ttf'
let pdfExportFontVfsPromise = null
let pdfMakeExportPromise = null

async function loadPdfExportFontVfs() {
  if (!pdfExportFontVfsPromise) {
    pdfExportFontVfsPromise = import('pdfmake/build/vfs_fonts.js').then((module) => {
      const vfs = module?.default ?? module?.pdfMake?.vfs ?? module?.vfs ?? module
      if (!vfs || typeof vfs !== 'object') {
        throw new Error('Nie udało się przygotować fontów PDF.')
      }
      return vfs
    })
  }

  return pdfExportFontVfsPromise
}

async function ensurePdfMakeLoaded() {
  if (!pdfMakeExportPromise) {
    pdfMakeExportPromise = Promise.all([import('pdfmake/build/pdfmake.js'), loadPdfExportFontVfs()]).then(
      ([module, vfs]) => {
        const pdfMake = module?.default ?? module?.pdfMake ?? module
        if (!pdfMake || typeof pdfMake.createPdf !== 'function') {
          throw new Error('Biblioteka PDF nie jest dostępna.')
        }
        if (typeof pdfMake.addVirtualFileSystem === 'function') {
          pdfMake.addVirtualFileSystem(vfs)
        } else {
          pdfMake.vfs = vfs
        }
        return pdfMake
      },
    )
  }

  return pdfMakeExportPromise
}

async function ensureJsPdfLoaded() {
  if (window.jspdf?.jsPDF) {
    return window.jspdf.jsPDF
  }

  const module = await import('jspdf')
  const jsPdf = module?.jsPDF ?? module?.default?.jsPDF ?? module?.default
  if (typeof jsPdf !== 'function') {
    throw new Error('Biblioteka jsPDF nie jest dostępna.')
  }

  window.jspdf = { ...(window.jspdf ?? {}), jsPDF: jsPdf }
  return jsPdf
}

async function ensurePdfUnicodeFont(pdf) {
  if (!pdf || typeof pdf.addFileToVFS !== 'function' || typeof pdf.addFont !== 'function') {
    throw new Error('Ta wersja jsPDF nie obsługuje osadzania fontów Unicode.')
  }

  const vfs = await loadPdfExportFontVfs()
  const regularFont = String(vfs[PDF_EXPORT_FONT_REGULAR_FILE] ?? '').trim()
  const boldFont = String(vfs[PDF_EXPORT_FONT_BOLD_FILE] ?? vfs['Roboto-Bold.ttf'] ?? '').trim()
  if (!regularFont || !boldFont) {
    throw new Error('Brak plików fontów PDF z polskimi znakami.')
  }

  pdf.addFileToVFS(PDF_EXPORT_FONT_REGULAR_FILE, regularFont)
  pdf.addFont(PDF_EXPORT_FONT_REGULAR_FILE, PDF_EXPORT_FONT_FAMILY, 'normal')
  pdf.addFileToVFS(PDF_EXPORT_FONT_BOLD_FILE, boldFont)
  pdf.addFont(PDF_EXPORT_FONT_BOLD_FILE, PDF_EXPORT_FONT_FAMILY, 'bold')
  pdf.setFont(PDF_EXPORT_FONT_FAMILY, 'normal')
}

function setPdfUnicodeFont(pdf, style = 'normal') {
  pdf.setFont(PDF_EXPORT_FONT_FAMILY, style)
}

let eventsFeature = null

function getEventsFeature() {
  if (!eventsFeature) {
    throw new Error('Events feature is not initialized.')
  }
  return eventsFeature
}

async function fetchEventsForCurrentSession(options = {}) {
  return getEventsFeature().fetch(options)
}

function startEventsPolling() {
  eventsFeature?.startPolling?.()
}
function stopEventsPolling() {
  eventsFeature?.stopPolling?.()
}

function refreshEventsForActiveRoute(options = {}) {
  if (!eventsFeature || normalizeNavigationRoute(appState.currentRoute) !== 'events') {
    return null
  }
  return eventsFeature.fetch({ forceRefresh: true, silent: true, ...options })
}

async function openEventEditor(item) {
  return getEventsFeature().openEditor(item)
}

function applyEventsFilterInputs(filters = {}) {
  return getEventsFeature().applyFilterInputs(filters)
}

function eventTypeInfo(row) {
  return getEventsFeature().eventTypeInfo(row)
}

function normalizeEventStatus(value, hasEndAt = false) {
  return getEventsFeature().normalizeEventStatus(value, hasEndAt)
}

function normalizeVisibleEventComment(value) {
  return getEventsFeature().normalizeVisibleEventComment(value)
}

let zonesFeature = null

function getZonesFeature() {
  if (!zonesFeature) {
    throw new Error('Zones feature is not initialized.')
  }
  return zonesFeature
}

function mapZoneForView(zone) {
  return getZonesFeature().mapZoneForView(zone)
}

function visiblePortalZones() {
  return getZonesFeature().visiblePortalZones()
}

function isUnassignedCleanZone(zone) {
  return getZonesFeature().isUnassignedCleanZone(zone)
}

async function fetchZonesForCurrentSession(force = false) {
  return getZonesFeature().fetch(force)
}

let workerProfileFeature = null
let workerAccountFeature = null
let workerTimeFeature = null
let workerTimeDetailFeature = null
let workdayStopProposalsFeature = null

function getWorkerProfileFeature() {
  if (!workerProfileFeature) {
    throw new Error('Worker profile feature is not initialized.')
  }
  return workerProfileFeature
}

function getWorkerAccountFeature() {
  if (!workerAccountFeature) {
    throw new Error('Worker account feature is not initialized.')
  }
  return workerAccountFeature
}

function getWorkerTimeFeature() {
  if (!workerTimeFeature) {
    throw new Error('Worker time feature is not initialized.')
  }
  return workerTimeFeature
}

function getWorkerTimeDetailFeature() {
  if (!workerTimeDetailFeature) {
    throw new Error('Worker time detail feature is not initialized.')
  }
  return workerTimeDetailFeature
}

function getWorkdayStopProposalsFeature() {
  if (!workdayStopProposalsFeature) {
    throw new Error('Workday stop proposals feature is not initialized.')
  }
  return workdayStopProposalsFeature
}

async function fetchWorkerProfilesForCurrentSession(force = false, options = {}) {
  await ensurePortalFeatureReady('workerProfile')
  return getWorkerProfileFeature().fetch(force, options)
}

async function fetchWorkerAccountForCurrentSession(force = false) {
  await ensurePortalFeatureReady('workerAccount')
  return getWorkerAccountFeature().fetch(force)
}

async function refreshWorkerAccountTimeAfterWorkdaySave(workerLogin = '') {
  if (!workerAccountFeature || typeof workerAccountFeature.refreshTimeAfterWorkdayChange !== 'function') {
    return false
  }
  return workerAccountFeature.refreshTimeAfterWorkdayChange({ workerLogin })
}

async function fetchWorkersForCurrentSession(force = false) {
  await ensurePortalFeatureReady('workerTime')
  return getWorkerTimeFeature().fetch(force)
}

function workerTimeSyncSelectionUi() {
  return getWorkerTimeFeature().syncSelectionUi()
}

async function fetchWorkerDetailForCurrentSession(options = {}) {
  await ensurePortalFeatureReady('workerTimeDetail')
  return getWorkerTimeDetailFeature().fetch(options)
}

async function refreshWorkdayStopProposals() {
  await ensurePortalFeatureReady('workdayStopProposals')
  return getWorkdayStopProposalsFeature().refresh()
}

function bindWorkdayStopProposalsViewFunctions() {
  return getWorkdayStopProposalsFeature().bind()
}

function workerDetailDateKeyFromIso(value) {
  const iso = toIso(value)
  return iso ? iso.slice(0, 10) : ''
}

function workerDetailDateKeyToLabel(dayKey) {
  const value = String(dayKey ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return '-'
  }

  return `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}`
}

function workerDetailIsoToTime(isoValue) {
  const iso = toIso(isoValue)
  if (!iso) {
    return '-'
  }

  const date = new Date(iso)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

function workerDetailIsoToHm(isoValue) {
  const iso = toIso(isoValue)
  if (!iso) {
    return '-'
  }

  const date = new Date(iso)
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

function workerDetailComputeRangeSeconds(startAt, endAt) {
  const startIso = toIso(startAt)
  const endIso = toIso(endAt)
  if (!startIso || !endIso) {
    return 0
  }

  const startMs = new Date(startIso).getTime()
  const endMs = new Date(endIso).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return 0
  }

  return Math.floor((endMs - startMs) / 1000)
}

function workStatusTimestamp(value) {
  const iso = toIso(value)
  if (!iso) {
    return 0
  }

  const timestamp = new Date(iso).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function workStatusYmdFromTimestamp(timestamp) {
  const normalized = Number(timestamp ?? 0)
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return ''
  }

  const date = new Date(normalized)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function workStatusIntervalFromTimes(startAt, endAt, durationSec = 0) {
  let startTs = workStatusTimestamp(startAt)
  let endTs = workStatusTimestamp(endAt)
  const duration = Number(durationSec ?? 0)
  const durationMs = Number.isFinite(duration) && duration > 0 ? Math.floor(duration) * 1000 : 0

  if (startTs > 0 && endTs <= 0 && durationMs > 0) {
    endTs = startTs + durationMs
  }
  if (startTs <= 0 && endTs > 0 && durationMs > 0) {
    startTs = endTs - durationMs
  }
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs) || startTs <= 0 || endTs <= startTs) {
    return null
  }

  return {
    startTs,
    endTs,
    startIso: new Date(startTs).toISOString(),
    endIso: new Date(endTs).toISOString(),
  }
}

function workStatusIntervalFromRow(row) {
  return workStatusIntervalFromTimes(
    row?.startIso ?? row?.startAt ?? row?.dayStartAt,
    row?.endIso ?? row?.endAt ?? row?.dayEndAt,
    row?.durationSec ?? row?.closedSec,
  )
}

function workStatusIntervalsOverlap(left, right) {
  return Boolean(left && right && left.startTs < right.endTs && right.startTs < left.endTs)
}

function workStatusIntervalsMerge(intervals = []) {
  const sorted = intervals
    .filter(Boolean)
    .map((interval) => ({
      startTs: Number(interval.startTs ?? 0),
      endTs: Number(interval.endTs ?? 0),
    }))
    .filter((interval) => Number.isFinite(interval.startTs) && Number.isFinite(interval.endTs) && interval.endTs > interval.startTs)
    .sort((left, right) => left.startTs - right.startTs || left.endTs - right.endTs)

  const merged = []
  sorted.forEach((interval) => {
    const last = merged[merged.length - 1]
    if (!last || interval.startTs > last.endTs) {
      merged.push({ ...interval })
      return
    }

    last.endTs = Math.max(last.endTs, interval.endTs)
  })

  return merged
}

function workStatusIntervalsTotalSeconds(intervals = []) {
  const totalMs = workStatusIntervalsMerge(intervals).reduce(
    (sum, interval) => sum + Math.max(0, interval.endTs - interval.startTs),
    0,
  )
  return Math.floor(totalMs / 1000)
}

function workerDetailSanitizeFilename(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
}


let reportsFeature = null

function getReportsFeature() {
  if (!reportsFeature) {
    throw new Error('Reports feature is not initialized.')
  }
  return reportsFeature
}

const REPORTS_SECTION_IDS = new Set([
  'home',
  'podsumowanie',
  'zestawienia',
  'analizy',
  'raporty-gotowe',
  'moje-raporty',
])

function reportsNormalizeSection(value) {
  const sectionId = String(value ?? '').trim().toLowerCase()
  return REPORTS_SECTION_IDS.has(sectionId) ? sectionId : 'home'
}

function setReportsSidebarSection(sectionId) {
  const normalized = String(sectionId ?? '').trim().toLowerCase()
  document.querySelectorAll('#submenu-reports [data-report-section]').forEach((button) => {
    const active = normalized && button.getAttribute('data-report-section') === normalized
    button.classList.toggle('active', Boolean(active))
    if (active) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  })
}

async function openReportsSection(sectionId, navigation, trigger = null) {
  const normalized = reportsNormalizeSection(sectionId)
  const ready = await navigation.go('reports')
  if (!ready) return false
  const opened = await getReportsFeature().openSection(normalized, { trigger })
  if (opened) setReportsSidebarSection(normalized)
  return Boolean(opened)
}

function handleReportsSectionChange(event) {
  setReportsSidebarSection(event?.detail?.sectionId)
}

async function ensureReportsViewReady() {
  return getReportsFeature().ensureReady()
}

function reportHistoryFilterOptions(options, query) {
  return getReportsFeature().filterHistoryOptions(options, query)
}

async function reportHistoryRefreshAfterEventSave(updatedItem = null) {
  return getReportsFeature().refreshHistoryAfterEventSave(updatedItem)
}

async function openEventHistoryFromRow(row, tab, options = {}) {
  return getReportsFeature().openEventHistoryFromRow(row, tab, options)
}

function reportHistoryNormalizeQrCode(value) {
  return getReportsFeature().normalizeQrCode(value)
}

function reportHistoryExtractQrFromComment(comment, phase) {
  return getReportsFeature().extractQrFromComment(comment, phase)
}

function reportHistoryExtractGpsCoords(source, phase) {
  return getReportsFeature().extractGpsCoords(source, phase)
}

function reportHistoryResolveDayQrCode(item, phase) {
  return getReportsFeature().resolveDayQrCode(item, phase)
}

function reportHistoryResolveDayQrCandidate(item, phase) {
  return getReportsFeature().resolveDayQrCandidate(item, phase)
}

function reportHistoryResolveClientByZoneCode(zoneCode, fallback = '-') {
  return getReportsFeature().resolveClientByZoneCode(zoneCode, fallback)
}

function reportHistoryIsSystemEntrySource(item) {
  return getReportsFeature().isSystemEntrySource(item)
}

function reportHistoryResolveDayGpsCoords(item, phase) {
  return getReportsFeature().resolveDayGpsCoords(item, phase)
}

function reportHistoryParseGeoPair(value) {
  return getReportsFeature().parseGeoPair(value)
}

function reportGeoReadCoordsFromNode(node) {
  return getReportsFeature().readGeoCoordsFromNode(node)
}

function reportGeoOpenModal(lat, lon) {
  return getReportsFeature().openGeoModal(lat, lon)
}

function reportGeoShowPreview(anchorNode, lat, lon) {
  return getReportsFeature().showGeoPreview(anchorNode, lat, lon)
}

function reportGeoHidePreviewSoon() {
  return getReportsFeature().hideGeoPreviewSoon()
}

async function openDashboardEntityHistory(row, sourceKind = 'zones') {
  return getReportsFeature().openDashboardEntityHistory(row, sourceKind)
}

async function openDashboardWorkerHistory(workerLogin, workerName) {
  return getReportsFeature().openDashboardWorkerHistory(workerLogin, workerName)
}

function bindClientProfileViewFunctions() {
  return getClientProfileFeature().bind()
}

function bindClientProfileDetailsViewFunctions() {
  return getClientProfileFeature().bindDetails()
}

function eventTargetClosest(event, selector) {
  const target = event?.target
  if (target && typeof target.closest === 'function') {
    return target.closest(selector)
  }
  const parent = target?.parentElement
  if (parent && typeof parent.closest === 'function') {
    return parent.closest(selector)
  }
  return null
}

function bindSubmenuToggles() {
  const cleanups = []

  document.querySelectorAll('[data-toggle]').forEach((button) => {
    const handleClick = () => {
      const root = document.getElementById('portalRoot')
      if (root?.classList.contains('sidebar-collapsed')) {
        setSidebarCollapsed(false)
      }

      const key = button.dataset.toggle
      const submenu = document.getElementById(`submenu-${key}`)
      if (submenu) {
        submenu.classList.toggle('open')
      }
    }

    button.addEventListener('click', handleClick)
    cleanups.push(() => button.removeEventListener('click', handleClick))
  })

  return () => {
    cleanups.forEach((cleanup) => cleanup())
  }
}

function sidebarGlobalSearchNodes() {
  const root = document.getElementById('topbarGlobalSearch')
  return {
    root,
    input: document.getElementById('topbarGlobalSearchInput'),
    clear: document.getElementById('topbarGlobalSearchClear'),
    results: document.getElementById('topbarGlobalSearchResults'),
  }
}

function sidebarGlobalSearchTextFromParts(...parts) {
  return normalizeSearchText(parts.filter((part) => String(part ?? '').trim()).join(' '))
}

function sidebarGlobalSearchStaticItems() {
  return SIDEBAR_GLOBAL_SEARCH_STATIC_RESULTS
    .filter((item) => item.route !== 'contractProfitability' || canOpenContractProfitability())
    .map((item) => ({
      ...item,
      searchText: sidebarGlobalSearchTextFromParts(item.label, item.meta),
    }))
}

function sidebarGlobalSearchClientLabel(client = {}) {
  return (
    String(client?.name ?? client?.clientName ?? client?.clientLabel ?? client?.label ?? client?.companyName ?? '').trim() ||
    String(client?.clientId ?? client?.id ?? '').trim() ||
    'Klient'
  )
}

function sidebarGlobalSearchClientItems() {
  const clients = Array.isArray(appState.clients) ? appState.clients : []
  return clients
    .map((client) => {
      const clientId = String(client?.id ?? client?.clientId ?? '').trim()
      const label = sidebarGlobalSearchClientLabel(client)
      if (!clientId || !label) return null
      const subLabel = [client?.city, client?.street || client?.address, client?.nip]
        .map((part) => String(part ?? '').trim())
        .filter(Boolean)
        .join(' | ')
      return {
        id: `client:${clientId}`,
        kind: 'client',
        label,
        meta: 'Klient',
        subLabel,
        clientId,
        searchText: sidebarGlobalSearchTextFromParts(
          label,
          client?.clientName,
          client?.clientLabel,
          client?.city,
          client?.street,
          client?.address,
          client?.nip,
          clientId,
        ),
      }
    })
    .filter(Boolean)
}

function sidebarGlobalSearchOrderItems() {
  return ordersListSourceOrders()
    .map((order) => {
      const orderId = String(order?.id ?? order?.idTask ?? '').trim()
      if (!orderId) return null
      const label = calendarTimelineOrderTitle(order)
      const clientLabel = ordersTimelineClientLabel(order)
      const dateLabel = calendarTimelineDateLabel(order?.dateYmd)
      const timeLabel = calendarTimelineTimeLabel(order?.startTime, '')
      const subLabel = [clientLabel && clientLabel !== '-' ? clientLabel : '', [dateLabel, timeLabel].filter(Boolean).join(' ')]
        .map((part) => String(part ?? '').trim())
        .filter(Boolean)
        .join(' | ')
      return {
        id: `order:${orderId}`,
        kind: 'order',
        label,
        meta: 'Zlecenie',
        subLabel,
        orderId,
        searchText: sidebarGlobalSearchTextFromParts(
          label,
          order?.taskName,
          order?.title,
          order?.name,
          order?.clientLabel,
          order?.clientName,
          order?.client,
          ordersTimelineAddressLabel(order),
          orderId,
        ),
      }
    })
    .filter(Boolean)
}

function sidebarGlobalSearchWorkerRows() {
  const profileRows = Array.isArray(appState.workerProfileRows) ? appState.workerProfileRows : []
  const workerRows = profileRows.length ? profileRows : Array.isArray(appState.workers) ? appState.workers : []
  const seen = new Set()
  return workerRows.filter((worker) => {
    const key = normalizeSearchText(
      worker?.login ?? worker?.workerLogin ?? worker?.workerId ?? worker?.id ?? worker?.email ?? sidebarGlobalSearchWorkerLabel(worker),
    )
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function sidebarGlobalSearchWorkerLabel(worker = {}) {
  return (
    String(worker?.name ?? worker?.workerName ?? worker?.fullName ?? '').trim() ||
    String(worker?.login ?? worker?.workerLogin ?? worker?.email ?? worker?.workerId ?? worker?.id ?? '').trim() ||
    'Pracownik'
  )
}

function sidebarGlobalSearchWorkerKey(worker = {}) {
  return String(worker?.login ?? worker?.workerLogin ?? worker?.workerId ?? worker?.id ?? worker?.email ?? sidebarGlobalSearchWorkerLabel(worker)).trim()
}

function sidebarGlobalSearchWorkerRoleLabel(worker = {}) {
  const raw = String(worker?.role ?? worker?.type ?? worker?.workerType ?? '').trim()
  const normalized = normalizeSearchText(raw).toLowerCase()
  if (!normalized) return ''
  if (normalized.includes('owner') || normalized.includes('wlasciciel')) return 'Owner'
  if (normalized.includes('admin') || normalized.includes('superadmin')) return 'Administrator'
  if (normalized.includes('kierownik') || normalized.includes('manager') || normalized.includes('menager')) return 'Manager'
  if (normalized.includes('koordynator') || normalized.includes('coordynator') || normalized.includes('coordinator')) return 'Koordynator'
  if (normalized.includes('stazysta') || normalized.includes('intern')) return 'Stażysta'
  if (normalized.includes('mobil') || normalized.includes('teren')) return 'Zespół mobilny'
  if (normalized.includes('staly') || normalized.includes('personel')) return 'Stały personel na obiekcie'
  if (normalized.includes('pracownik') || normalized.includes('worker')) return 'Pracownik'
  return raw
}

function sidebarGlobalSearchWorkerItems() {
  return sidebarGlobalSearchWorkerRows()
    .map((worker) => {
      const workerKey = sidebarGlobalSearchWorkerKey(worker)
      const label = sidebarGlobalSearchWorkerLabel(worker)
      if (!workerKey || !label) return null
      const login = String(worker?.login ?? worker?.workerLogin ?? '').trim()
      const workerId = String(worker?.workerId ?? worker?.id ?? '').trim()
      const role = sidebarGlobalSearchWorkerRoleLabel(worker)
      const subLabel = role
      return {
        id: `worker:${workerKey}`,
        kind: 'worker',
        label,
        meta: 'Pracownik',
        subLabel,
        worker,
        workerKey,
        searchText: sidebarGlobalSearchTextFromParts(
          label,
          worker?.name,
          worker?.workerName,
          worker?.fullName,
          login,
          worker?.email,
          worker?.loginEmail,
          workerId,
          role,
          worker?.type,
          worker?.workerType,
        ),
      }
    })
    .filter(Boolean)
}

function sidebarGlobalSearchFindWorker(workerKey) {
  const targetKey = normalizeSearchText(workerKey)
  if (!targetKey) return null
  return sidebarGlobalSearchWorkerRows().find((worker) => {
    const values = [
      worker?.login,
      worker?.workerLogin,
      worker?.workerId,
      worker?.id,
      worker?.email,
      worker?.loginEmail,
      sidebarGlobalSearchWorkerLabel(worker),
    ]
    return values.some((value) => normalizeSearchText(value) === targetKey)
  }) ?? null
}

function sidebarGlobalSearchScore(item, normalizedQuery) {
  const query = String(normalizedQuery ?? '').trim()
  if (!query) return 0
  const text = String(item?.searchText ?? '').trim()
  if (!text) return -1

  const tokens = query.split(/\s+/).filter(Boolean)
  if (tokens.length && !tokens.every((token) => text.includes(token))) {
    return -1
  }

  const label = normalizeSearchText(item?.label)
  if (label === query) return 500
  if (label.startsWith(query)) return 420
  if (label.split(/\s+/).some((word) => word.startsWith(query))) return 360
  if (text.includes(query)) return 260
  return tokens.length ? 180 : -1
}

function sidebarGlobalSearchBuildResults(query) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return []

  const kindWeight = {
    section: 0,
    subsection: 1,
    worker: 2,
    order: 3,
    client: 4,
  }

  return [
    ...sidebarGlobalSearchStaticItems(),
    ...sidebarGlobalSearchWorkerItems(),
    ...sidebarGlobalSearchOrderItems(),
    ...sidebarGlobalSearchClientItems(),
  ]
    .map((item) => ({ ...item, score: sidebarGlobalSearchScore(item, normalizedQuery) }))
    .filter((item) => item.score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      const leftKind = kindWeight[left.kind] ?? 9
      const rightKind = kindWeight[right.kind] ?? 9
      if (leftKind !== rightKind) return leftKind - rightKind
      return String(left.label ?? '').localeCompare(String(right.label ?? ''), 'pl')
    })
    .slice(0, 40)
}

function sidebarGlobalSearchRender() {
  const { input, clear, results } = sidebarGlobalSearchNodes()
  if (!input || !results) return

  const query = String(input.value ?? '')
  const hasQuery = Boolean(normalizeSearchText(query))
  if (clear) {
    clear.hidden = !query
  }

  if (!hasQuery) {
    sidebarGlobalSearchResults = []
    sidebarGlobalSearchActiveIndex = -1
    results.hidden = true
    results.innerHTML = ''
    input.setAttribute('aria-expanded', 'false')
    input.removeAttribute('aria-activedescendant')
    return
  }

  sidebarGlobalSearchResults = sidebarGlobalSearchBuildResults(query)
  if (sidebarGlobalSearchActiveIndex >= sidebarGlobalSearchResults.length) {
    sidebarGlobalSearchActiveIndex = sidebarGlobalSearchResults.length ? sidebarGlobalSearchResults.length - 1 : -1
  }

  if (!sidebarGlobalSearchResults.length) {
    results.innerHTML = '<div class="topbar-search-empty">Brak wyników</div>'
    results.hidden = false
    input.setAttribute('aria-expanded', 'true')
    input.removeAttribute('aria-activedescendant')
    return
  }

  results.innerHTML = sidebarGlobalSearchResults
    .map((item, index) => {
      const isActive = index === sidebarGlobalSearchActiveIndex
      const subLabel = String(item.subLabel ?? '').trim()
      return `
        <button
          class="topbar-search-result${isActive ? ' is-active' : ''}"
          id="topbarGlobalSearchResult-${index}"
          type="button"
          role="option"
          aria-selected="${isActive ? 'true' : 'false'}"
          data-topbar-search-result-index="${index}"
        >
          <span class="topbar-search-result-copy">
            <span class="topbar-search-result-label">${escapeHtml(item.label)}</span>
            ${subLabel ? `<span class="topbar-search-result-sub">${escapeHtml(subLabel)}</span>` : ''}
          </span>
          <span class="topbar-search-result-meta">${escapeHtml(item.meta)}</span>
        </button>
      `
    })
    .join('')
  results.hidden = false
  input.setAttribute('aria-expanded', 'true')
  if (sidebarGlobalSearchActiveIndex >= 0) {
    input.setAttribute('aria-activedescendant', `topbarGlobalSearchResult-${sidebarGlobalSearchActiveIndex}`)
  } else {
    input.removeAttribute('aria-activedescendant')
  }
}

function sidebarGlobalSearchCancelScheduledRender() {
  if (!sidebarGlobalSearchRenderTimer) return
  window.clearTimeout(sidebarGlobalSearchRenderTimer)
  sidebarGlobalSearchRenderTimer = 0
}

function sidebarGlobalSearchCancelScheduledLazyData() {
  if (!sidebarGlobalSearchLazyDataTimer) return
  window.clearTimeout(sidebarGlobalSearchLazyDataTimer)
  sidebarGlobalSearchLazyDataTimer = 0
}

function sidebarGlobalSearchCancelScheduledWork() {
  sidebarGlobalSearchCancelScheduledRender()
  sidebarGlobalSearchCancelScheduledLazyData()
}

function sidebarGlobalSearchScheduleRender(options = {}) {
  const delayMs = Math.max(0, Number(options.delayMs ?? SIDEBAR_GLOBAL_SEARCH_RENDER_DELAY_MS) || 0)
  sidebarGlobalSearchCancelScheduledRender()
  sidebarGlobalSearchRenderTimer = window.setTimeout(() => {
    sidebarGlobalSearchRenderTimer = 0
    sidebarGlobalSearchRender()
  }, delayMs)
}

function sidebarGlobalSearchFlushScheduledRender() {
  if (!sidebarGlobalSearchRenderTimer) return
  sidebarGlobalSearchCancelScheduledRender()
  sidebarGlobalSearchRender()
}

function sidebarGlobalSearchScheduleLazyData(options = {}) {
  const delayMs = Math.max(0, Number(options.delayMs ?? SIDEBAR_GLOBAL_SEARCH_LAZY_DATA_DELAY_MS) || 0)
  sidebarGlobalSearchCancelScheduledLazyData()
  sidebarGlobalSearchLazyDataTimer = window.setTimeout(() => {
    sidebarGlobalSearchLazyDataTimer = 0
    sidebarGlobalSearchEnsureLazyData()
  }, delayMs)
}

function sidebarGlobalSearchClose() {
  sidebarGlobalSearchCancelScheduledWork()
  const { input, results } = sidebarGlobalSearchNodes()
  sidebarGlobalSearchActiveIndex = -1
  if (results) {
    results.hidden = true
    results.innerHTML = ''
  }
  if (input) {
    input.setAttribute('aria-expanded', 'false')
    input.removeAttribute('aria-activedescendant')
  }
}

function sidebarGlobalSearchClear({ focus = false } = {}) {
  const { input, clear } = sidebarGlobalSearchNodes()
  if (input) {
    input.value = ''
    if (focus) input.focus()
  }
  if (clear) {
    clear.hidden = true
  }
  sidebarGlobalSearchClose()
}

function sidebarGlobalSearchEnsureLazyData() {
  const { input } = sidebarGlobalSearchNodes()
  const normalizedQuery = normalizeSearchText(input?.value)
  if (!normalizedQuery || normalizedQuery.length < SIDEBAR_GLOBAL_SEARCH_MIN_LAZY_QUERY_LENGTH || !appState.session?.orgId) return

  const hasWorkerRows =
    (Array.isArray(appState.workerProfileRows) && appState.workerProfileRows.length > 0) ||
    (Array.isArray(appState.workers) && appState.workers.length > 0)
  if (!hasWorkerRows && !appState.workersLoaded && !sidebarGlobalSearchWorkersLoadPromise) {
    sidebarGlobalSearchWorkersLoadPromise = fetchWorkerProfilesForCurrentSession(false, {
      silent: true,
      clearSelection: false,
      resetPage: false,
    })
      .catch((error) => {
        console.warn('[global-search] workers load failed', error)
      })
      .finally(() => {
        sidebarGlobalSearchWorkersLoadPromise = null
        if (normalizeSearchText(sidebarGlobalSearchNodes().input?.value)) {
          sidebarGlobalSearchScheduleRender({ delayMs: 0 })
        }
      })
  }
}

async function sidebarGlobalSearchOpenWorkerAccount(worker, router) {
  if (!worker) return
  const workerAccountLogin = String(worker.login || worker.workerLogin || '').trim()
  const workerAccountName = String(worker.name || worker.workerName || worker.fullName || '').trim()
  const workerAccountId = String(worker.workerId || worker.id || workerAccountLogin).trim()
  const workerAccountTargetKey =
    [workerAccountLogin, workerAccountId, workerAccountName]
      .map((value) => normalizeSearchText(value).toLowerCase())
      .find(Boolean) || ''

  appState.workerAccountCurrent = worker
  appState.workerAccountActiveTab = 'account'
  appState.workerAccountTargetKey = workerAccountTargetKey
  appState.selectedWorkerLogin = workerAccountLogin
  appState.selectedWorkerName = workerAccountName
  router?.go?.('workerAccount')
  window.dispatchEvent(new CustomEvent('worker-account-select', {
    detail: {
      worker,
      tab: 'account',
    },
  }))
}

async function sidebarGlobalSearchActivate(result, router) {
  if (!result) return
  sidebarGlobalSearchClose()

  if (result.kind === 'order') {
    await ensurePortalFeatureListReady(PORTAL_ROUTE_FEATURE_KEYS.orders || [])
    let order = ordersFindTimelineOrder(result.orderId)
    if (!order && appState.session?.orgId) {
      await ordersSyncRemoteTimelineOrders({ render: false })
      order = ordersFindTimelineOrder(result.orderId)
    }
    if (!order) {
      showTransientNotice('Nie znaleziono zlecenia.', 'error')
      return
    }
    if (await router.go('orders')) {
      ordersOpenEditor(result.orderId)
    }
    return
  }

  if (result.kind === 'worker') {
    let worker = result.worker || sidebarGlobalSearchFindWorker(result.workerKey)
    if (!worker && appState.session?.orgId) {
      await fetchWorkerProfilesForCurrentSession(true, {
        silent: true,
        clearSelection: false,
        resetPage: false,
      })
      worker = sidebarGlobalSearchFindWorker(result.workerKey)
    }
    if (!worker) {
      showTransientNotice('Nie znaleziono pracownika.', 'error')
      return
    }
    await sidebarGlobalSearchOpenWorkerAccount(worker, router)
    return
  }

  if (result.kind === 'client') {
    await ensurePortalFeatureReady('clientProfile')
    if (!clientProfileFindById(result.clientId) && appState.session?.orgId) {
      await fetchClientsForCurrentSession(false)
    }
    openClientProfileDetails(result.clientId)
    return
  }

  if (result.reportSection) {
    await openReportsSection(result.reportSection, router)
    return
  }

  if (result.kanbanSection) {
    appState.kanbanSection = kanbanNormalizeSection(result.kanbanSection)
  }
  await router.go(result.route || 'dashboard')
}

function bindSidebarGlobalSearch(router) {
  const { root, input, clear, results } = sidebarGlobalSearchNodes()
  if (!root || !input || !results) return () => {}

  const binding = createBindingHelpers()

  const handleSearchInput = () => {
    sidebarGlobalSearchActiveIndex = -1
    if (!normalizeSearchText(input.value)) {
      sidebarGlobalSearchCancelScheduledWork()
      sidebarGlobalSearchRender()
      return
    }
    sidebarGlobalSearchScheduleRender()
    if (normalizeSearchText(input.value).length >= SIDEBAR_GLOBAL_SEARCH_MIN_LAZY_QUERY_LENGTH) {
      sidebarGlobalSearchScheduleLazyData()
    } else {
      sidebarGlobalSearchCancelScheduledLazyData()
    }
  }

  binding.add(input, 'input', handleSearchInput)
  binding.add(input, 'focus', () => {
    sidebarGlobalSearchScheduleRender({ delayMs: 0 })
    sidebarGlobalSearchScheduleLazyData()
  })
  binding.add(input, 'keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      sidebarGlobalSearchClose()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      sidebarGlobalSearchFlushScheduledRender()
      if (!sidebarGlobalSearchResults.length) {
        sidebarGlobalSearchRender()
      }
      if (!sidebarGlobalSearchResults.length) return
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      sidebarGlobalSearchActiveIndex =
        sidebarGlobalSearchActiveIndex < 0
          ? direction > 0
            ? 0
            : sidebarGlobalSearchResults.length - 1
          : (sidebarGlobalSearchActiveIndex + direction + sidebarGlobalSearchResults.length) % sidebarGlobalSearchResults.length
      sidebarGlobalSearchRender()
      return
    }

    if (event.key === 'Enter') {
      const result =
        sidebarGlobalSearchResults[sidebarGlobalSearchActiveIndex] ?? sidebarGlobalSearchResults[0] ?? null
      if (!result) return
      event.preventDefault()
      void sidebarGlobalSearchActivate(result, router)
    }
  })

  binding.add(clear, 'click', () => {
    sidebarGlobalSearchClear({ focus: true })
  })

  binding.add(results, 'mousemove', (event) => {
    const button = eventTargetClosest(event, '[data-topbar-search-result-index]')
    if (!button) return
    const index = Number(button.getAttribute('data-topbar-search-result-index'))
    if (!Number.isInteger(index) || index === sidebarGlobalSearchActiveIndex) return
    sidebarGlobalSearchActiveIndex = index
    sidebarGlobalSearchRender()
  })

  binding.add(results, 'click', (event) => {
    const button = eventTargetClosest(event, '[data-topbar-search-result-index]')
    if (!button) return
    const index = Number(button.getAttribute('data-topbar-search-result-index'))
    const result = Number.isInteger(index) ? sidebarGlobalSearchResults[index] : null
    if (!result) return
    event.preventDefault()
    void sidebarGlobalSearchActivate(result, router)
  })

  binding.add(document, 'click', (event) => {
    if (root.contains(event.target)) return
    sidebarGlobalSearchClose()
  })

  return () => {
    binding.done()
  }
}

function bindRouteButtons(router) {
  const handleRouteClick = (event) => {
    const reportsSectionButton = eventTargetClosest(event, '[data-report-section]')
    if (reportsSectionButton) {
      event.preventDefault()
      void openReportsSection(
        reportsSectionButton.getAttribute('data-report-section'),
        router,
        reportsSectionButton,
      )
      return
    }

    const kanbanMenuButton = eventTargetClosest(event, '[data-kanban-menu-section]')
    if (kanbanMenuButton) {
      appState.kanbanSection = kanbanNormalizeSection(kanbanMenuButton.getAttribute('data-kanban-menu-section'))
      if (appState.kanbanSection !== 'tasks') {
        appState.kanbanSearch = ''
      }
      router.go('kanban')
      return
    }

    const kanbanProjectButton = eventTargetClosest(event, '#portalSidebar [data-kanban-project-filter]')
    if (kanbanProjectButton) {
      appState.kanbanSection = 'tasks'
      appState.kanbanSearch = String(kanbanProjectButton.getAttribute('data-kanban-project-filter') ?? '').trim()
      router.go('kanban')
      return
    }

    const kanbanMenuCreateButton = eventTargetClosest(event, '#kanbanMenuCreateBtn')
    if (kanbanMenuCreateButton) {
      void router.go('kanban').then((ready) => {
        if (ready) kanbanCreateTask()
      })
      return
    }

    const kanbanMenuShowMore = eventTargetClosest(event, '#kanbanPortalMenuShowMore')
    if (kanbanMenuShowMore) {
      appState.kanbanProjectLimit = Math.min(60, Math.max(9, Number(appState.kanbanProjectLimit) || 9) + 12)
      void router.go('kanban').then((ready) => {
        if (ready) renderKanbanView()
      })
      return
    }

    const kanbanTeamAddButton = eventTargetClosest(event, '#kanbanPortalTeamAddBtn')
    if (kanbanTeamAddButton) {
      showTransientNotice('Zespoły będą zarządzane z poziomu organizacji.')
      return
    }

    const sidebarOrdersAddButton = eventTargetClosest(event, '#sidebarOrdersAddBtn')
    if (sidebarOrdersAddButton) {
      event.preventDefault()
      void router.go('orders').then((ready) => {
        if (ready) ordersOpenAddEditor()
      })
      return
    }

    const button = eventTargetClosest(event, '[data-route]')
    if (!button) {
      return
    }

    const route = button.getAttribute('data-route')
    if (route) {
      router.go(route)
    }
  }

  document.addEventListener('click', handleRouteClick)

  return () => {
    document.removeEventListener('click', handleRouteClick)
  }
}

let calendarFeature = null

function getCalendarFeature() {
  if (!calendarFeature) {
    throw new Error('Calendar feature is not initialized.')
  }
  return calendarFeature
}

function calendarTaskToneValue(...args) {
  return getCalendarFeature().taskToneValue(...args)
}

function calendarCanSeeAllOrganizationTasks(...args) {
  return getCalendarFeature().calendarCanSeeAllOrganizationTasks(...args)
}

function calendarIsCoordinatorRole(...args) {
  return getCalendarFeature().calendarIsCoordinatorRole(...args)
}

function calendarAccessMatch(...args) {
  return getCalendarFeature().calendarAccessMatch(...args)
}

function calendarMatchHasValues(...args) {
  return getCalendarFeature().calendarMatchHasValues(...args)
}

function calendarValuesMatchAccess(...args) {
  return getCalendarFeature().calendarValuesMatchAccess(...args)
}

function calendarSplitAccessValues(...args) {
  return getCalendarFeature().calendarSplitAccessValues(...args)
}

function calendarWorkerAccessValues(...args) {
  return getCalendarFeature().calendarWorkerAccessValues(...args)
}

function calendarClientAccessValues(...args) {
  return getCalendarFeature().calendarClientAccessValues(...args)
}

function calendarZoneAccessValues(...args) {
  return getCalendarFeature().calendarZoneAccessValues(...args)
}

function calendarCoordinatorAccessScope(...args) {
  return getCalendarFeature().calendarCoordinatorAccessScope(...args)
}

function calendarTaskAssignedToAccess(...args) {
  return getCalendarFeature().calendarTaskAssignedToAccess(...args)
}

function calendarTaskIsVisibleForCurrentUser(...args) {
  return getCalendarFeature().calendarTaskIsVisibleForCurrentUser(...args)
}

function calendarEnsureState(...args) {
  return getCalendarFeature().ensureState(...args)
}

function calendarReadPickerRows(...args) {
  return getCalendarFeature().calendarReadPickerRows(...args)
}

function calendarEnsureTimelineWorkerState(...args) {
  return getCalendarFeature().calendarEnsureTimelineWorkerState(...args)
}

function calendarScheduleRender(...args) {
  return getCalendarFeature().scheduleRender(...args)
}

function calendarMarkRouteEnter(...args) {
  return getCalendarFeature().markRouteEnter(...args)
}

function calendarMarkDataReady(...args) {
  return getCalendarFeature().markDataReady(...args)
}

function calendarStopTimelineWorkerStatusRefresh(...args) {
  return getCalendarFeature().stopTimelineWorkerStatusRefresh(...args)
}

function calendarTimelineEventTimestamp(...args) {
  return getCalendarFeature().calendarTimelineEventTimestamp(...args)
}

function calendarTimelineEventsRowStartTimestamp(...args) {
  return getCalendarFeature().calendarTimelineEventsRowStartTimestamp(...args)
}

function calendarTimelineEventsRowStopTimestamp(...args) {
  return getCalendarFeature().calendarTimelineEventsRowStopTimestamp(...args)
}

function calendarTimelineResources(...args) {
  return getCalendarFeature().calendarTimelineResources(...args)
}

function calendarTimelineVisualOrderSlots(...args) {
  return getCalendarFeature().calendarTimelineVisualOrderSlots(...args)
}

function calendarTimelineTimeMinutes(...args) {
  return getCalendarFeature().calendarTimelineTimeMinutes(...args)
}

function ordersSaveRemoteTimelineOrdersNow(...args) {
  return getCalendarFeature().ordersSaveRemoteTimelineOrdersNow(...args)
}

function ordersSyncRemoteTimelineOrders(...args) {
  return getCalendarFeature().syncRemoteTimelineOrders(...args)
}

function ordersDeleteTimelineOrderFromList(...args) {
  return getCalendarFeature().deleteTimelineOrderFromList(...args)
}

function deferRouteOrderDataRefresh(...args) {
  return getCalendarFeature().deferRouteOrderDataRefresh(...args)
}

function ordersListSourceOrders(...args) {
  // Worker/client summaries can start loading before the lazily loaded
  // calendar bundle is ready. An empty cache is a valid state at that point;
  // throwing here aborts the whole route synchronization.
  return calendarFeature?.listSourceOrders?.(...args) ?? []
}

function calendarTimelineOrderDurationMinutes(...args) {
  return getCalendarFeature().calendarTimelineOrderDurationMinutes(...args)
}

function calendarTimelineOrderTitle(...args) {
  return getCalendarFeature().calendarTimelineOrderTitle(...args)
}

function calendarTimelineShortTimeLabel(...args) {
  return getCalendarFeature().calendarTimelineShortTimeLabel(...args)
}

function calendarTimelineTimeLabel(...args) {
  return getCalendarFeature().calendarTimelineTimeLabel(...args)
}

function calendarTimelineDateLabel(...args) {
  return getCalendarFeature().calendarTimelineDateLabel(...args)
}

function calendarTimelineDaysForOrder(...args) {
  return getCalendarFeature().calendarTimelineDaysForOrder(...args)
}

function calendarTimelineOrderIsRecurring(...args) {
  return getCalendarFeature().calendarTimelineOrderIsRecurring(...args)
}

function calendarTimelineRecurringUnit(...args) {
  return getCalendarFeature().calendarTimelineRecurringUnit(...args)
}

function calendarTimelineDateWeekday(...args) {
  return getCalendarFeature().calendarTimelineDateWeekday(...args)
}

function calendarTimelineRecurringSkippedDates(...args) {
  return getCalendarFeature().calendarTimelineRecurringSkippedDates(...args)
}

function calendarTimelineRecurringOverrideId(...args) {
  return getCalendarFeature().calendarTimelineRecurringOverrideId(...args)
}

function calendarTimelineRecurringOverrideInfo(...args) {
  return getCalendarFeature().calendarTimelineRecurringOverrideInfo(...args)
}

function calendarTimelineSourceOrderById(...args) {
  return getCalendarFeature().calendarTimelineSourceOrderById(...args)
}

function calendarTimelineBuildSingleOccurrenceOverride(...args) {
  return getCalendarFeature().calendarTimelineBuildSingleOccurrenceOverride(...args)
}

function calendarTimelineOrdersWithSingleOccurrenceOverride(...args) {
  return getCalendarFeature().calendarTimelineOrdersWithSingleOccurrenceOverride(...args)
}

function calendarTimelineRecurringDaysForRange(...args) {
  return getCalendarFeature().calendarTimelineRecurringDaysForRange(...args)
}

function calendarTimelineExpandRecurringOrdersForDays(...args) {
  return getCalendarFeature().calendarTimelineExpandRecurringOrdersForDays(...args)
}

function calendarTimelineOrderPlannedBounds(...args) {
  return getCalendarFeature().calendarTimelineOrderPlannedBounds(...args)
}

function calendarTimelineIsTechnicalEventCode(value = '') {
  if (calendarFeature?.calendarTimelineIsTechnicalEventCode) {
    return calendarFeature.calendarTimelineIsTechnicalEventCode(value)
  }
  const normalized = String(value ?? '').trim().toUpperCase().replace(/^QR\s+/, '')
  return /^EV-\d+(?:-\d+)?$/.test(normalized)
}

function calendarTimelineHideStatusAlert(...args) {
  if (!calendarFeature) {
    return undefined
  }
  return getCalendarFeature().hideTimelineStatusAlert(...args)
}

function calendarTimelineFindOrderConflict(...args) {
  return getCalendarFeature().calendarTimelineFindOrderConflict(...args)
}

function calendarTimelineRealEventRowDay(...args) {
  return getCalendarFeature().calendarTimelineRealEventRowDay(...args)
}

function calendarTimelineContextFromBar(...args) {
  return getCalendarFeature().calendarTimelineContextFromBar(...args)
}

function calendarTimelineEditOrderFromContext(...args) {
  return getCalendarFeature().calendarTimelineEditOrderFromContext(...args)
}

function renderCalendarView(...args) {
  return getCalendarFeature().render(...args)
}

function calendarOpenEditor(...args) {
  return getCalendarFeature().openEditor(...args)
}

function bindCalendarViewFunctions(...args) {
  return getCalendarFeature().bind(...args)
}

function createBindingHelpers() {
  const cleanups = []
  const add = (node, event, handler) => {
    if (!node) return
    node.addEventListener(event, handler)
    cleanups.push(() => node.removeEventListener(event, handler))
  }
  return { add, done: () => cleanups.forEach((cleanup) => cleanup()) }
}

function calendarCompletionNoteForTask(task = {}, completedBy = '') {
  const actor = String(completedBy ?? '').trim() || 'użytkownika'
  return task.generatedFromComment ? `Załatwione przez ${actor}` : ''
}

function calendarCompletionActivityDetails(task = {}, note = '', completedBy = '') {
  const parts = []
  const cleanNote = String(note ?? '').trim()
  const actor = String(completedBy ?? '').trim()
  if (actor) {
    parts.push(`Ukończył: ${actor}`)
  }
  if (cleanNote) {
    parts.push(`Komentarz: ${cleanNote}`)
  } else if (task.generatedFromComment && actor) {
    parts.push(`Komentarz: zadanie zostało załatwione przez ${actor}.`)
  }
  if (task.generatedFromComment) {
    const assignees = calendarSelectionText(task.workers)
    if (assignees) {
      parts.push(`Dopisane osoby: ${assignees}`)
    }
  }
  return parts.join('\n')
}

function bindEventsViewFunctions() {
  return getEventsFeature().bind()
}

function bindZonesViewFunctions() {
  return getZonesFeature().bind()
}

function bindWorkerTimeViewFunctions(router) {
  return getWorkerTimeFeature().bind(router)
}

function bindWorkerTimeDetailViewFunctions() {
  return getWorkerTimeDetailFeature().bind()
}

function bindWorkerProfileViewFunctions(router) {
  return getWorkerProfileFeature().bind(router)
}

function bindWorkerAccountViewFunctions(router) {
  return getWorkerAccountFeature().bind(router)
}

function bindReportsViewFunctions() {
  return getReportsFeature().bind()
}

function createPortalFeatureContext() {
  return {
    appState,
    CALENDAR_HOUR_HEIGHT_PX,
    CALENDAR_MIN_TIMED_TASK_HEIGHT_PX,
    CALENDAR_TIMED_TASK_GAP_PX,
    CALENDAR_TIMED_TASK_OVERLAP_OFFSET_PX,
    CALENDAR_TIMELINE_SLOTS_PER_HOUR,
    CALENDAR_TIMELINE_SLOT_MINUTES,
    CALENDAR_TIMELINE_STATUS_REFRESH_MS,
    CALENDAR_TONE_OPTIONS,
    applyEventsFilterInputs,
    calendarActivityEntry,
    calendarActivityTimestamp,
    calendarAppendTaskActivity,
    calendarCompletionActivityDetails,
    calendarCompletionNoteForTask,
    calendarDateLabelFromYmd,
    calendarDayShortLabel,
    calendarDayToneClass,
    calendarDeleteRemoteTasksById,
    calendarDirectoryOptions,
    calendarLoadTasks,
    calendarMarkTaskRead,
    calendarNormalizeActivityLog,
    calendarNormalizeTask,
    calendarNormalizeZoneSelection,
    calendarReadZoneSelection,
    calendarSaveTasks,
    calendarSelectionLabels,
    calendarSortTasks,
    calendarStartOfWeek,
    calendarSyncZoneOptions,
    calendarTaskChangeDetails,
    calendarTaskIsVisibleForCurrentUser,
    calendarTaskReadByCurrentUser,
    calendarTaskZoneText,
    calendarTimeToMinutes,
    calendarTimelineRowAllowsOverlap,
    calendarZoneDisplayLabel,
    dashboardActivityCleanCompanyLabel,
    dashboardActivityCompanyLabel,
    dashboardActivityEndDeltaInfo,
    dashboardActivityLatestQrCompanyLabelForRow,
    dashboardActivityStartDeltaInfo,
    dashboardAddUserMatchKey,
    dashboardCurrentUserMatchKeys,
    dashboardLoadFastRows,
    dashboardReadCommentKeys,
    dashboardResolveClientLabel,
    dashboardResolveDayKey,
    dashboardResolveTodayRowAliasKeys,
    dashboardResolveWorkerIdValue,
    dashboardRowIsIndividual,
    dashboardRowIsSpecial,
    dashboardScheduleTimeToMinutes,
    dashboardTaskColumnBelongsToCurrentUser,
    dashboardWorkerIdIdentityKeys,
    deleteScheduleTasks,
    eventEditorFirstScannedQr,
    fetchScheduleTasks,
    kanbanColumnsForStatus,
    kanbanDefaultStatusForTask,
    kanbanInitials,
    kanbanNormalizeColumnScope,
    normalizeEventStatus,
    openEventEditor,
    ordersApplyWeeklyPatternRuleToOccurrence,
    ordersAssignExtendedWorkFlags,
    ordersConfirmTimelineOrderDelete,
    ordersDefaultEndTime,
    ordersExtendedWorkAllowed,
    ordersFindTimelineOrder,
    ordersFormatWorkMinutes,
    ordersNextOrderId,
    ordersNormalizeDateField,
    ordersNormalizeTimeField,
    ordersOpenEditorFromCalendar,
    ordersOpenRecurringOccurrenceEditorFromCalendar,
    ordersScheduleModeForOrder,
    ordersWeeklyPatternSources,
    ordersNormalizeWeeklyPatternRule,
    ordersStoreWeeklyPatternRules,
    ordersTimelineOrderCanBeDeleted,
    ordersTimelineToneForType,
    ordersWorkAllocationsForSubjects,
    ordersWorkerAssignmentsFromRows,
    renderDashboardActivityCalendar,
    renderDashboardKanbanTasks,
    renderKanbanView,
    renderOrdersMapView,
    renderOrdersView,
    reportGeoHidePreviewSoon,
    reportGeoOpenModal,
    reportGeoReadCoordsFromNode,
    reportGeoShowPreview,
    reportHistoryExtractGpsCoords,
    reportHistoryExtractQrFromComment,
    reportHistoryIsSystemEntrySource,
    reportHistoryNormalizeQrCode,
    reportHistoryParseGeoPair,
    reportHistoryResolveClientByZoneCode,
    reportHistoryResolveDayGpsCoords,
    reportHistoryResolveDayQrCandidate,
    reportHistoryResolveDayQrCode,
    resolveZoneByQrCandidate,
    roleLevel,
    setScheduleTaskLifecycleStatus,
    isBlockingModalOpen,
    isPortalInteractionBusy,
    queuePortalDeferredNotification,
    clearPortalDeferredNotification,
    flushPortalDeferredNotifications,
    workerIsAssignable,
    filterAssignableWorkers,
    upsertScheduleTasks,
    calendarAddDays,
    calendarDateFromYmd,
    calendarDayNumberLabel,
    calendarMinutesToTime,
    calendarMonthGridStart,
    calendarMonthLabel,
    calendarMonthStart,
    calendarNormalizeTimeValue,
    calendarTimelineBuildSingleOccurrenceOverride,
    calendarTimelineContextFromBar,
    calendarTimelineDateWeekday,
    calendarTimelineDaysForOrder,
    calendarTimelineEditOrderFromContext,
    calendarTimelineFindOrderConflict,
    calendarTimelineOrderDurationMinutes,
    calendarTimelineOrderIsRecurring,
    calendarTimelineOrdersWithSingleOccurrenceOverride,
    calendarTimelineRecurringDaysForRange,
    calendarTimelineRecurringOverrideInfo,
    calendarTimelineRecurringOverrideId,
    calendarTimelineRecurringSkippedDates,
    calendarTimelineRecurringUnit,
    calendarTimelineResources,
    calendarTimelineVisualOrderSlots,
    calendarTimelineShortTimeLabel,
    calendarTimelineSourceOrderById,
    calendarTimelineTimeMinutes,
    dashboardCanonicalWorkerId,
    dashboardIsQrCodeLike,
    fetchClientsForCurrentSession,
    formatBytes,
    openClientModal,
    deferRouteOrderDataRefresh,
    ordersDeleteTimelineOrderFromList,
    ordersSaveRemoteTimelineOrdersNow,
    showPortalErrorNotice,
    workStatusIntervalsTotalSeconds,
    normalizeVisibleEventComment,
    localDateAndTimeInputToIso,
    loadFullCalendar,
    fetchEventsForCurrentSession,
    eventTypeInfo,
    daysAgoYmd,
    dashboardResolveZoneLabel,
    dashboardBuildHistoryRow,
    calendarEnsureState,
    ordersWorkerSelectionLabel,
    ordersTimelineClientLabel,
    ordersTimelineAddressLabel,
    ordersOpenAddEditor,
    ordersNormalizeOrderRows,
    ordersOrderHasInactiveOnlyWorkerAssignments,
    kanbanTaskIsCompleted,
    calendarWorkerLabel,
    calendarWorkerId,
    workerActiveFlag,
    calendarToneLabel,
    calendarSelectionText,
    calendarOpenEditor,
    calendarDateToYmd,
    calendarNormalizeSelectionList,
    calendarSyncRemoteTasks,
    calendarTaskToneValue,
    fetchWorkersForCurrentSession,
    fetchZonesForCurrentSession,
    ordersListSourceOrders,
    ordersLoadGoogleMaps,
    ordersSyncRemoteTimelineOrders,
    canAdministerWorkers,
    canDeleteWorkers,
    canDeleteClients,
    canDeleteEvents,
    canEditProfitability,
    canManageClients,
    canManageEvents,
    canManageWorkers,
    canReadProfitability,
    canResetWorkerPasswords,
    createBindingHelpers,
    createClient,
    createEvent,
    createWorkerUser,
    createWorkday,
    createZone,
    dashboardClockLabelToHm,
    dashboardDurationLabelToHm,
    dashboardLateMinutesToHm,
    dashboardWorkerSurnameDisplayName,
    dashboardWorkerSurnameSortKey,
    deleteClient,
    deleteEvent,
    forceDeletePortalEvents,
    deleteWorker,
    deleteZone,
    durationSecondsToHm,
    durationSecondsToHms,
    ensureJsPdfLoaded,
    ensurePdfMakeLoaded,
    ensurePdfUnicodeFont,
    ensureSelectValue,
    escapeHtml,
    eventEditorScannedQrLabel,
    eventTargetClosest,
    firstDayOfCurrentMonthYmd,
    formatDatePl,
    formatTime,
    getClients,
    getEmailPasswordLoginState,
    getEventsFingerprintForOrg,
    getNextWorkerIdPreview,
    getWorkdays,
    getWorkers,
    getWorkerTime,
    getZones,
    isUnassignedCleanZone,
    isoToLocalDateTimeInput,
    linkEmailPasswordToCurrentUser,
    localDateTimeInputToIso,
    mapZoneForView,
    normalizeClientStatus,
    normalizeSearchText,
    openEventHistoryFromRow,
    ordersSelectCreatedClientInEditor,
    pad2,
    paginate,
    refreshDashboardAfterEventSave,
    refreshDashboardWidgets,
    refreshWorkerAccountTimeAfterWorkdaySave,
    reportHistoryFilterOptions,
    reportHistoryRefreshAfterEventSave,
    resolveClientLabelWithQrFallback,
    setPdfUnicodeFont,
    setSelectOptions,
    setSubwelcomeMetric,
    setWorkerPassword,
    setupResizableGridTable,
    showTransientNotice,
    startDashboardAutoRefresh,
    statusBadgeClass,
    stopDashboardAutoRefresh,
    todayYmd,
    toIso,
    updateClient,
    updateEvent,
    updateWorker,
    updateWorkday,
    updateZone,
    visiblePortalZones,
    workerDetailComputeRangeSeconds,
    workerDetailDateKeyFromIso,
    workerDetailDateKeyToLabel,
    workerDetailIsoToHm,
    workerDetailIsoToTime,
    workerDetailSanitizeFilename,
    workerTimeSyncSelectionUi,
    workStatusIntervalFromRow,
    workStatusIntervalFromTimes,
    workStatusIntervalsOverlap,
    workStatusYmdFromTimestamp,
    ymdToIsoRangeEnd,
    ymdToIsoRangeStart,
    ymdToDayTimestamp,
    calendarAccessMatch,
    calendarCanSeeAllOrganizationTasks,
    calendarClientAccessValues,
    calendarCoordinatorAccessScope,
    calendarIsCoordinatorRole,
    calendarMatchHasValues,
    calendarSplitAccessValues,
    calendarTaskShouldShowOnDashboardForCurrentUser,
    calendarTimelineEventTimestamp,
    calendarTimelineEventsRowStartTimestamp,
    calendarTimelineEventsRowStopTimestamp,
    calendarTimelineExpandRecurringOrdersForDays,
    calendarTimelineIsTechnicalEventCode,
    calendarTimelineOrderPlannedBounds,
    calendarTimelineOrderTitle,
    calendarTimelineRealEventRowDay,
    calendarValuesMatchAccess,
    calendarWorkerAccessValues,
    calendarZoneAccessValues,
    fillClientProfileCoordinatorOptions,
    fillClientsCoordinatorSelect,
    getTodayActiveWorkers,
    kanbanCurrentUserOption,
    kanbanNewTaskStatus,
    kanbanNormalizeStatus,
    kanbanOpenCalendarTask,
    kanbanSetDataLoading,
    openDashboardEntityHistory,
    openDashboardWorkerHistory,
    renderCalendarView,
    zoneNameWithQrHtml,
    zoneQrCodeFromRow,
  }
}

/*
 * Poprzednia implementacja Panelu admina pozostaje w historii Git.
 * Nowy moduł jest wydzielony do katalogu Cleanzi-admin.
 *
function setPlatformCenterMessage(message = '', tone = 'error') {
  const node = document.getElementById('platformCenterMessage')
  if (!node) return
  node.textContent = String(message ?? '')
  node.dataset.tone = message ? tone : ''
}

function setPlatformCenterVisible(visible) {
  const center = document.getElementById('platformCenter')
  const shell = document.querySelector('#portalRoot > .app-shell')
  if (center) center.hidden = !visible
  if (shell) {
    if (visible) shell.setAttribute('inert', '')
    else shell.removeAttribute('inert')
  }
}

function setPlatformEditorMessage(message = '', tone = 'error') {
  const node = document.getElementById('platformOrganizationEditorMessage')
  if (!node) return
  node.textContent = String(message ?? '')
  node.dataset.tone = message ? tone : ''
}

function platformDateTimeInput(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function platformDateTimePayload(input) {
  const value = String(input?.value ?? '').trim()
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function populatePlatformOrganizationEditor(organization) {
  platformSelectedOrganization = { ...organization }
  const setValue = (id, value) => {
    const node = document.getElementById(id)
    if (node) node.value = String(value ?? '')
  }
  setValue('platformEditorOrgId', organization.orgId)
  setValue('platformEditorName', organization.name)
  setValue('platformEditorStatus', organization.status || 'ACTIVE')
  setValue('platformEditorOnboardingStatus', organization.onboardingStatus)
  setValue('platformEditorPlanCode', organization.planCode || 'TRIAL')
  setValue('platformEditorSubscriptionStatus', organization.subscriptionStatus || 'ACTIVE')
  setValue('platformEditorTrialEndsAt', platformDateTimeInput(organization.trialEndsAt))
  setValue('platformEditorCurrentPeriodEndsAt', platformDateTimeInput(organization.currentPeriodEndsAt))
  setValue('platformEditorOwnerWorkerId', organization.ownerWorkerId)
  const subtitle = document.getElementById('platformOrganizationEditorSubtitle')
  if (subtitle) subtitle.textContent = `${organization.name || organization.orgId} · ${organization.orgId}`
  const toggleDeletion = document.getElementById('platformEditorToggleDeletion')
  if (toggleDeletion) toggleDeletion.textContent = organization.deletedAt ? 'Przywróć organizację' : 'Usuń organizację'
  const editor = document.getElementById('platformOrganizationEditor')
  if (editor) editor.hidden = false
  setPlatformEditorMessage('')
  editor?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}

async function openPlatformOrganizationSession(organization) {
  const reason = String(document.getElementById('platformAccessReason')?.value ?? '').trim()
  if (reason.length < 3) {
    setPlatformCenterMessage('Podaj powód wejścia do organizacji (minimum 3 znaki).')
    document.getElementById('platformAccessReason')?.focus()
    return null
  }
  const result = await openPlatformOrganization(organization.orgId, reason)
  if (result?.status !== 'READY' || !result?.context) throw new Error('Backend nie zwrócił kontekstu organizacji.')
  const ready = await acceptPlatformContext(result.context)
  if (ready?.status !== 'READY' || !ready.session) throw new Error('Nie udało się zapisać kontekstu platformowego.')
  return ready.session
}

function renderPlatformOrganizations(data, router) {
  const list = document.getElementById('platformOrganizationList')
  const pageNode = document.getElementById('platformOrganizationsPage')
  const previous = document.getElementById('platformOrganizationsPrev')
  const next = document.getElementById('platformOrganizationsNext')
  if (!list) return
  list.replaceChildren()
  const items = Array.isArray(data?.items) ? data.items : []
  if (!items.length) {
    const empty = document.createElement('p')
    empty.className = 'platform-organization-meta'
    empty.textContent = 'Nie znaleziono organizacji dla wybranych filtrów.'
    list.append(empty)
  }
  items.forEach((organization) => {
    const row = document.createElement('article')
    row.className = 'platform-organization-row'
    const identity = document.createElement('div')
    const name = document.createElement('div')
    name.className = 'platform-organization-name'
    name.textContent = organization.name || organization.orgId
    const id = document.createElement('div')
    id.className = 'platform-organization-id'
    id.textContent = organization.orgId
    identity.append(name, id)
    const status = document.createElement('span')
    status.className = `platform-organization-badge${organization.deletedAt ? ' is-deleted' : ''}`
    status.textContent = organization.deletedAt ? 'Usunięta' : organization.status || 'Brak statusu'
    const plan = document.createElement('div')
    plan.className = 'platform-organization-meta'
    plan.textContent = `${organization.planCode || 'Bez pakietu'} · ${organization.subscriptionStatus || 'bez statusu'}`
    const owner = document.createElement('div')
    owner.className = 'platform-organization-meta'
    owner.textContent = organization.ownerWorkerId ? `Owner: ${organization.ownerWorkerId}` : 'Brak Ownera'
    const actions = document.createElement('div')
    actions.className = 'platform-organization-actions'
    const manage = document.createElement('button')
    manage.className = 'platform-organization-manage'
    manage.type = 'button'
    manage.textContent = 'Zarządzaj'
    manage.addEventListener('click', async () => {
      manage.disabled = true
      setPlatformCenterMessage('Otwieranie bezpiecznego kontekstu...', 'success')
      try {
        const session = await openPlatformOrganizationSession(organization)
        if (!session) return
        resetPortalState({ session })
        setUserChip(session)
        populatePlatformOrganizationEditor(organization)
        setPlatformCenterMessage('Kontekst organizacji został otwarty.', 'success')
      } catch (error) {
        setPlatformCenterMessage(error instanceof Error ? error.message : 'Nie udało się otworzyć organizacji.')
      } finally {
        manage.disabled = false
      }
    })
    const open = document.createElement('button')
    open.className = 'platform-organization-open'
    open.type = 'button'
    open.dataset.orgId = organization.orgId
    open.textContent = 'Wejdź do organizacji'
    open.addEventListener('click', async () => {
      open.disabled = true
      setPlatformCenterMessage('Otwieranie bezpiecznego kontekstu...', 'success')
      try {
        const session = await openPlatformOrganizationSession(organization)
        if (!session) return
        setPlatformCenterVisible(false)
        await activatePortalSession(session, router)
      } catch (error) {
        setPlatformCenterMessage(error instanceof Error ? error.message : 'Nie udało się wejść do organizacji.')
      } finally {
        open.disabled = false
      }
    })
    actions.append(manage, open)
    row.append(identity, status, plan, owner, actions)
    list.append(row)
  })
  platformOrganizationsPage = Number(data?.page) || 1
  platformOrganizationsTotalPages = Number(data?.totalPages) || 1
  if (pageNode) pageNode.textContent = `Strona ${platformOrganizationsPage} z ${platformOrganizationsTotalPages}`
  if (previous) previous.disabled = platformOrganizationsPage <= 1
  if (next) next.disabled = platformOrganizationsPage >= platformOrganizationsTotalPages
}

async function loadPlatformOrganizationCenter(router) {
  if (platformOrganizationsLoading) return
  platformOrganizationsLoading = true
  const list = document.getElementById('platformOrganizationList')
  if (list) list.textContent = 'Ładowanie organizacji...'
  setPlatformCenterMessage('')
  try {
    const data = await listPlatformOrganizations({
      search: document.getElementById('platformOrganizationSearch')?.value,
      status: document.getElementById('platformOrganizationStatus')?.value,
      planCode: document.getElementById('platformOrganizationPlan')?.value,
      deletion: document.getElementById('platformOrganizationDeletion')?.value,
      page: platformOrganizationsPage,
      pageSize: 25,
    })
    renderPlatformOrganizations(data, router)
  } catch (error) {
    if (list) list.replaceChildren()
    setPlatformCenterMessage(error instanceof Error ? error.message : 'Nie udało się pobrać organizacji.')
  } finally {
    platformOrganizationsLoading = false
  }
}

async function showPlatformOrganizationCenter(router, { closeCurrent = false } = {}) {
  if (closeCurrent && String(appState.session?.roleCode ?? '').toUpperCase() === 'PLATFORM_OWNER') {
    await closePlatformOrganization()
    clearPlatformContextSession()
    resetPortalState()
  }
  showPortal()
  const editor = document.getElementById('platformOrganizationEditor')
  if (editor) editor.hidden = true
  platformSelectedOrganization = null
  setPlatformCenterVisible(true)
  platformOrganizationsPage = 1
  await loadPlatformOrganizationCenter(router)
}

function bindPlatformCenter(router) {
  const search = document.getElementById('platformOrganizationSearch')
  const filters = [
    document.getElementById('platformOrganizationStatus'),
    document.getElementById('platformOrganizationPlan'),
    document.getElementById('platformOrganizationDeletion'),
  ].filter(Boolean)
  const previous = document.getElementById('platformOrganizationsPrev')
  const next = document.getElementById('platformOrganizationsNext')
  const logoutButton = document.getElementById('platformCenterLogout')
  const organizationChip = document.getElementById('organizationChip')
  const editor = document.getElementById('platformOrganizationEditor')
  const editorClose = document.getElementById('platformOrganizationEditorClose')
  const saveOrganization = document.getElementById('platformEditorSaveOrganization')
  const saveSubscription = document.getElementById('platformEditorSaveSubscription')
  const transferOwner = document.getElementById('platformEditorTransferOwner')
  const toggleDeletion = document.getElementById('platformEditorToggleDeletion')
  const enterOrganization = document.getElementById('platformEditorEnter')
  let searchTimer = null
  const refreshFirstPage = () => {
    platformOrganizationsPage = 1
    void loadPlatformOrganizationCenter(router)
  }
  const handleSearch = () => {
    window.clearTimeout(searchTimer)
    searchTimer = window.setTimeout(refreshFirstPage, 250)
  }
  const handlePrevious = () => {
    if (platformOrganizationsPage <= 1) return
    platformOrganizationsPage -= 1
    void loadPlatformOrganizationCenter(router)
  }
  const handleNext = () => {
    if (platformOrganizationsPage >= platformOrganizationsTotalPages) return
    platformOrganizationsPage += 1
    void loadPlatformOrganizationCenter(router)
  }
  const handleCenterLogout = async () => {
    if (getSession()?.platformContextId && cleanziAdminPanel) {
      await cleanziAdminPanel.closeContext({ silent: true }).catch(() => {})
    }
    logout()
    resetPortalState()
    setPlatformCenterVisible(false)
    showLoginScreen()
    showLoginCredentials()
    setUserChip(null)
  }
  const closeEditorContext = async () => {
    if (!platformSelectedOrganization) return
    editorClose.disabled = true
    try {
      await closePlatformOrganization()
      clearPlatformContextSession()
      resetPortalState()
      platformSelectedOrganization = null
      if (editor) editor.hidden = true
      setUserChip(null)
      setPlatformCenterMessage('Kontekst organizacji został zamknięty.', 'success')
      await loadPlatformOrganizationCenter(router)
    } catch (error) {
      setPlatformEditorMessage(error instanceof Error ? error.message : 'Nie udało się zamknąć kontekstu.')
    } finally {
      editorClose.disabled = false
    }
  }
  const runEditorAction = async (button, action) => {
    if (!platformSelectedOrganization) return
    button.disabled = true
    setPlatformEditorMessage('Zapisywanie...', 'success')
    try {
      const completed = await action()
      if (completed === false) {
        setPlatformEditorMessage('')
        return
      }
      setPlatformEditorMessage('Zmiany zapisano.', 'success')
      await loadPlatformOrganizationCenter(router)
    } catch (error) {
      const message = error?.code === 'PLATFORM_REAUTH_REQUIRED'
        ? 'Ta zmiana wymaga świeżego logowania z MFA. Wyloguj się i zaloguj ponownie.'
        : (error instanceof Error ? error.message : 'Nie udało się zapisać zmian.')
      setPlatformEditorMessage(message)
    } finally {
      button.disabled = false
    }
  }
  const handleSaveOrganization = () => runEditorAction(saveOrganization, async () => {
    const result = await updatePlatformOrganization(platformSelectedOrganization.orgId, '', {
      name: document.getElementById('platformEditorName')?.value,
      status: document.getElementById('platformEditorStatus')?.value,
      onboardingStatus: document.getElementById('platformEditorOnboardingStatus')?.value,
    })
    platformSelectedOrganization = {
      ...platformSelectedOrganization,
      name: result?.name || document.getElementById('platformEditorName')?.value,
      status: result?.status || document.getElementById('platformEditorStatus')?.value,
      onboardingStatus: result?.onboarding_status || document.getElementById('platformEditorOnboardingStatus')?.value,
    }
    populatePlatformOrganizationEditor(platformSelectedOrganization)
  })
  const handleSaveSubscription = () => runEditorAction(saveSubscription, async () => {
    await updatePlatformOrganization(platformSelectedOrganization.orgId, 'subscription', {
      planCode: document.getElementById('platformEditorPlanCode')?.value,
      status: document.getElementById('platformEditorSubscriptionStatus')?.value,
      trialEndsAt: platformDateTimePayload(document.getElementById('platformEditorTrialEndsAt')),
      currentPeriodEndsAt: platformDateTimePayload(document.getElementById('platformEditorCurrentPeriodEndsAt')),
    })
    platformSelectedOrganization = {
      ...platformSelectedOrganization,
      planCode: document.getElementById('platformEditorPlanCode')?.value,
      subscriptionStatus: document.getElementById('platformEditorSubscriptionStatus')?.value,
      trialEndsAt: platformDateTimePayload(document.getElementById('platformEditorTrialEndsAt')),
      currentPeriodEndsAt: platformDateTimePayload(document.getElementById('platformEditorCurrentPeriodEndsAt')),
    }
  })
  const handleTransferOwner = () => runEditorAction(transferOwner, async () => {
    const newOwnerWorkerId = String(document.getElementById('platformEditorOwnerWorkerId')?.value ?? '').trim()
    if (!newOwnerWorkerId) throw new Error('Podaj Worker ID nowego Ownera.')
    await updatePlatformOrganization(platformSelectedOrganization.orgId, 'owner', { newOwnerWorkerId })
    platformSelectedOrganization = { ...platformSelectedOrganization, ownerWorkerId: newOwnerWorkerId }
  })
  const handleToggleDeletion = () => runEditorAction(toggleDeletion, async () => {
    const deleting = !platformSelectedOrganization.deletedAt
    if (
      deleting &&
      !window.confirm(`Czy na pewno chcesz oznaczyć organizację ${platformSelectedOrganization.name || platformSelectedOrganization.orgId} jako usuniętą?`)
    ) return false
    const result = await updatePlatformOrganization(
      platformSelectedOrganization.orgId,
      deleting ? 'soft-delete' : 'restore',
      {},
    )
    platformSelectedOrganization = { ...platformSelectedOrganization, deletedAt: result?.deleted_at || null }
    populatePlatformOrganizationEditor(platformSelectedOrganization)
    return true
  })
  const handleEnterOrganization = async () => {
    const session = getSession()
    if (!session || String(session.roleCode ?? '').toUpperCase() !== 'PLATFORM_OWNER') return
    setPlatformCenterVisible(false)
    await activatePortalSession(session, router)
  }
  const handleOrganizationChip = async () => {
    if (String(appState.session?.roleCode ?? '').toUpperCase() !== 'PLATFORM_OWNER') return
    try {
      await showPlatformOrganizationCenter(router, { closeCurrent: true })
    } catch (error) {
      showTransientNotice(error instanceof Error ? error.message : 'Nie udało się zamknąć kontekstu organizacji.', 'error')
    }
  }
  search?.addEventListener('input', handleSearch)
  filters.forEach((filter) => filter.addEventListener('change', refreshFirstPage))
  previous?.addEventListener('click', handlePrevious)
  next?.addEventListener('click', handleNext)
  logoutButton?.addEventListener('click', handleCenterLogout)
  organizationChip?.addEventListener('click', handleOrganizationChip)
  editorClose?.addEventListener('click', closeEditorContext)
  saveOrganization?.addEventListener('click', handleSaveOrganization)
  saveSubscription?.addEventListener('click', handleSaveSubscription)
  transferOwner?.addEventListener('click', handleTransferOwner)
  toggleDeletion?.addEventListener('click', handleToggleDeletion)
  enterOrganization?.addEventListener('click', handleEnterOrganization)
  return () => {
    window.clearTimeout(searchTimer)
    search?.removeEventListener('input', handleSearch)
    filters.forEach((filter) => filter.removeEventListener('change', refreshFirstPage))
    previous?.removeEventListener('click', handlePrevious)
    next?.removeEventListener('click', handleNext)
    logoutButton?.removeEventListener('click', handleCenterLogout)
    organizationChip?.removeEventListener('click', handleOrganizationChip)
    editorClose?.removeEventListener('click', closeEditorContext)
    saveOrganization?.removeEventListener('click', handleSaveOrganization)
    saveSubscription?.removeEventListener('click', handleSaveSubscription)
    transferOwner?.removeEventListener('click', handleTransferOwner)
    toggleDeletion?.removeEventListener('click', handleToggleDeletion)
    enterOrganization?.removeEventListener('click', handleEnterOrganization)
  }
}

*/

function getCleanziAdminPanel(router) {
  if (!cleanziAdminPanel) {
    cleanziAdminPanel = createCleanziAdminPanel({
      router,
      acceptPlatformContext,
      clearPlatformContextSession,
      getSession,
      logout,
      resetPortalState,
      setUserChip,
      activatePortalSession,
      showPortal,
      showLoginScreen,
      showLoginCredentials,
    })
  }
  return cleanziAdminPanel
}

async function showPlatformOrganizationCenter(router, options = {}) {
  return getCleanziAdminPanel(router).show(options)
}

function bindPlatformCenter(router) {
  return getCleanziAdminPanel(router).bind()
}

function setCompanyProfileMessage(message = '', tone = 'error') {
  const node = document.getElementById('companyProfileMessage')
  if (!node) return
  node.textContent = message
  node.dataset.tone = message ? tone : ''
}

function setCompanyProfileValue(id, value) {
  const input = document.getElementById(id)
  if (input instanceof HTMLInputElement) input.value = String(value ?? '')
}

function fillCompanyProfile(profile = {}) {
  const form = document.getElementById('companyProfileForm')
  if (form) form.dataset.version = String(Number(profile.version || 0))
  setCompanyProfileValue('companyProfileNip', profile.nip)
  setCompanyProfileValue('companyProfileRegon', profile.regon)
  setCompanyProfileValue('companyProfileLegalName', profile.legalName)
  setCompanyProfileValue('companyProfileAddress', profile.registeredAddress)
  setCompanyProfileValue('companyProfilePostalCode', profile.postalCode)
  setCompanyProfileValue('companyProfileCity', profile.city)
  setCompanyProfileValue('companyProfileOwnerName', profile.ownerFullName)
  setCompanyProfileValue('companyProfileBillingName', profile.billingName)
  setCompanyProfileValue('companyProfileBillingNip', profile.billingNip)
  setCompanyProfileValue('companyProfileBillingEmail', profile.billingEmail)
  setCompanyProfileValue('companyProfileBillingAddress', profile.billingAddress)
  setCompanyProfileValue('companyProfileBillingPostalCode', profile.billingPostalCode)
  setCompanyProfileValue('companyProfileBillingCity', profile.billingCity)
  companyRegistryMetadata = {
    registryProvider: profile.registryProvider || '',
    registryFetchedAt: profile.registryFetchedAt || null,
  }
}

async function showCompanyProfileEditor(session, { required = false } = {}) {
  const overlay = document.getElementById('companyProfileOverlay')
  if (!overlay) return
  const closeButton = document.getElementById('companyProfileClose')
  const title = document.getElementById('companyProfileTitle')
  const copy = document.getElementById('companyProfileCopy')
  overlay.hidden = false
  if (closeButton) closeButton.hidden = required
  if (title) title.textContent = required ? 'Uzupełnij dane organizacji' : 'Profil firmy'
  if (copy) {
    copy.textContent = required
      ? 'Uzupełnienie profilu jest wymagane przed dalszą pracą właściciela.'
      : 'Zaktualizuj dane firmy lub pobierz je ponownie z GUS.'
  }
  setCompanyProfileMessage('Pobieranie profilu firmy...', 'success')
  try {
    const data = await getOrganizationProfile(session.activeOrgId)
    fillCompanyProfile(data?.profile || {})
    setCompanyProfileMessage('Uzupełnij wymagane dane i zapisz profil.', 'success')
  } catch (error) {
    setCompanyProfileMessage(error instanceof Error ? error.message : 'Nie udało się pobrać profilu firmy.')
  }
}

async function showRequiredCompanyProfile(session) {
  const overlay = document.getElementById('companyProfileOverlay')
  const required = session?.onboardingRequired === true && String(session?.roleCode ?? '').toUpperCase() === 'OWNER'
  if (!required) {
    if (overlay) overlay.hidden = true
    return
  }
  await showCompanyProfileEditor(session, { required: true })
}

function bindCompanyProfileOnboarding() {
  const form = document.getElementById('companyProfileForm')
  const lookup = document.getElementById('companyProfileLookup')
  const logoutButton = document.getElementById('companyProfileLogout')
  const closeButton = document.getElementById('companyProfileClose')
  const openButton = document.getElementById('companyProfileOpen')
  if (!form) return () => {}

  const readValue = (id) => String(document.getElementById(id)?.value ?? '').trim()
  const handleLookup = async () => {
    lookup.disabled = true
    setCompanyProfileMessage('Pobieranie danych z GUS...', 'success')
    try {
      const company = await lookupCompanyByNip(readValue('companyProfileNip'))
      setCompanyProfileValue('companyProfileNip', company?.nip)
      setCompanyProfileValue('companyProfileRegon', company?.regon)
      setCompanyProfileValue('companyProfileLegalName', company?.legalName)
      setCompanyProfileValue('companyProfileAddress', company?.registeredAddress)
      setCompanyProfileValue('companyProfilePostalCode', company?.postalCode)
      setCompanyProfileValue('companyProfileCity', company?.city)
      companyRegistryMetadata = {
        registryProvider: 'GUS_BIR1',
        registryFetchedAt: new Date().toISOString(),
      }
      setCompanyProfileMessage(company?.cached ? 'Dane pobrano z bezpiecznej pamięci GUS.' : 'Dane pobrano z GUS.', 'success')
    } catch (error) {
      setCompanyProfileMessage(error instanceof Error ? error.message : 'Nie udało się pobrać danych z GUS.')
    } finally {
      lookup.disabled = false
    }
  }
  const handleSubmit = async (event) => {
    event.preventDefault()
    const session = appState.session
    if (!session?.activeOrgId) return
    const saveButton = document.getElementById('companyProfileSave')
    saveButton.disabled = true
    setCompanyProfileMessage('Zapisywanie profilu...', 'success')
    try {
      const data = await saveOrganizationProfile(
        session.activeOrgId,
        Number(form.dataset.version || 0),
        {
          nip: readValue('companyProfileNip'),
          regon: readValue('companyProfileRegon'),
          legalName: readValue('companyProfileLegalName'),
          registeredAddress: readValue('companyProfileAddress'),
          postalCode: readValue('companyProfilePostalCode'),
          city: readValue('companyProfileCity'),
          countryCode: 'PL',
          ownerFullName: readValue('companyProfileOwnerName'),
          billingName: readValue('companyProfileBillingName'),
          billingNip: readValue('companyProfileBillingNip'),
          billingEmail: readValue('companyProfileBillingEmail'),
          billingAddress: readValue('companyProfileBillingAddress'),
          billingPostalCode: readValue('companyProfileBillingPostalCode'),
          billingCity: readValue('companyProfileBillingCity'),
          billingCountryCode: 'PL',
          ...companyRegistryMetadata,
        },
      )
      fillCompanyProfile(data?.profile || {})
      if (!data?.completeness?.baseComplete) {
        setCompanyProfileMessage(`Uzupełnij pola: ${(data?.completeness?.missingBase || []).join(', ')}.`)
        return
      }
      session.onboardingRequired = false
      session.onboardingStatus = 'COMPLETED'
      session.organizationName = data.profile?.legalName || session.organizationName
      session.orgName = session.organizationName
      saveSession(session)
      setUserChip(session)
      document.getElementById('companyProfileOverlay').hidden = true
      setCompanyProfileMessage('Profil firmy zapisano.', 'success')
    } catch (error) {
      setCompanyProfileMessage(error instanceof Error ? error.message : 'Nie udało się zapisać profilu firmy.')
    } finally {
      saveButton.disabled = false
    }
  }
  const handleLogout = () => document.getElementById('logoutBtn')?.click()
  const handleClose = () => {
    const overlay = document.getElementById('companyProfileOverlay')
    if (overlay) overlay.hidden = true
  }
  const handleOpen = () => {
    const session = appState.session
    const roleCode = String(session?.roleCode ?? '').toUpperCase()
    if (!session?.activeOrgId || !['OWNER', 'ADMIN', 'ADMINISTRATOR', 'SUPERADMIN'].includes(roleCode)) return
    void showCompanyProfileEditor(session, { required: false })
  }
  lookup?.addEventListener('click', handleLookup)
  form.addEventListener('submit', handleSubmit)
  logoutButton?.addEventListener('click', handleLogout)
  closeButton?.addEventListener('click', handleClose)
  openButton?.addEventListener('click', handleOpen)
  return () => {
    lookup?.removeEventListener('click', handleLookup)
    form.removeEventListener('submit', handleSubmit)
    logoutButton?.removeEventListener('click', handleLogout)
    closeButton?.removeEventListener('click', handleClose)
    openButton?.removeEventListener('click', handleOpen)
  }
}

function bindTenantOrganizationSwitcher() {
  const chip = document.getElementById('organizationChip')
  if (!chip) return () => {}
  const handleSwitch = () => {
    const session = appState.session
    if (!session || String(session.roleCode ?? '').toUpperCase() === 'PLATFORM_OWNER') return
    stopDashboardAutoRefresh()
    setLoginError('')
    showLoginScreen()
    showLoginOrganizationSelection(Array.isArray(session.organizations) ? session.organizations : [])
  }
  chip.addEventListener('click', handleSwitch)
  return () => chip.removeEventListener('click', handleSwitch)
}

async function activatePortalSession(session, router, { restoreRoute = false } = {}) {
  const activeOrgId = String(session?.activeOrgId ?? session?.orgId ?? '').trim()
  const organizationName = String(session?.organizationName ?? '').trim()
  if (!activeOrgId || !organizationName) {
    throw new Error('Backend nie zwr\u00f3ci\u0142 kompletnego kontekstu organizacji.')
  }

  resetPortalState({ session })
  applyOrganizationKindUi(session)
  syncProfitabilityEntryPermissions()
  syncPlanFeaturePermissions()
  showPortal()
  setUserChip(session)
  await showRequiredCompanyProfile(session)

  if (isFacilityManagerSession(session)) {
    clearStoredCurrentRoute()
    await router.go('managerObjects')
    return
  }

  syncProfitabilityEntryPermissions()

  if (restoreRoute) {
    await router.go(readStoredCurrentRoute())
  } else {
    clearStoredCurrentRoute()
    await router.go('dashboard')
    await hydrateSections(activeOrgId)
  }

  if (dashboardFeature && normalizeNavigationRoute(appState.currentRoute) === 'dashboard') {
    startDashboardAutoRefresh()
  }
}

function organizationsFromLoginResult(result) {
  if (result?.status === 'READY' && result.session) {
    const organizations = Array.isArray(result.session.organizations) ? result.session.organizations : []
    if (organizations.length) return organizations
    const orgId = String(result.session.activeOrgId ?? '').trim()
    const organizationName = String(result.session.organizationName ?? '').trim()
    return orgId && organizationName
      ? [{ orgId, organizationName, role: String(result.session.roleCode ?? '') }]
      : []
  }
  return Array.isArray(result?.organizations) ? result.organizations : []
}

function isRegistrationVerificationError(error) {
  const code = String(error?.code ?? '').toUpperCase()
  return code.includes('EMAIL') && (code.includes('VERIFY') || code.includes('VERIFIED'))
}

async function routePendingRegistrationAttempt(attempt) {
  activeRegistrationAttempt = attempt
  if (attempt.status === 'PAYMENT_PENDING') {
    showLoginRegistrationPayment(attempt)
    return
  }
  if (attempt.status === 'EMAIL_VERIFIED' || attempt.status === 'PORTAL_ONBOARDING') {
    showLoginRegistrationCompany(attempt)
    return
  }
  if (attempt.status === 'AUTH_CREATED') {
    if (attempt.consentsComplete !== true) {
      showLoginRegistrationConsents(attempt)
      return
    }
    try {
      await verifyPendingRegistrationAndShowCompany()
    } catch (error) {
      if (!isRegistrationVerificationError(error)) throw error
      pendingRegistrationNeedsVerification = true
      showLoginEmailVerification()
      setLoginError('Potwierdź adres email, a następnie sprawdź ponownie.', 'success')
    }
    return
  }
  showLoginRegistrationUnavailable()
}

async function continuePendingRegistration() {
  const pending = pendingRegistration || getPendingRegistrationEntry()
  if (!pending?.registrationId) {
    showLoginRegistrationUnavailable()
    return
  }
  pendingRegistration = pending
  if (!isRegistrationApiConfigured()) {
    showLoginRegistrationUnavailable()
    setLoginError('Portal nie ma skonfigurowanego adresu Registration API.')
    return
  }

  setLoginControlsBusy(true, 'Wznawianie rejestracji...')
  setLoginError('')
  try {
    if (
      activeRegistrationAttempt?.registrationId === pending.registrationId
      && activeRegistrationAttempt.status === 'AUTH_CREATED'
    ) {
      await routePendingRegistrationAttempt(activeRegistrationAttempt)
      return
    }
    if (hasPendingRegistrationBindToken(pending.registrationId)) {
      await bindRegistrationAccount(pending.registrationId)
      const fallbackAttempt = {
        registrationId: pending.registrationId,
        planCode: 'UNKNOWN',
        paid: false,
        status: 'AUTH_CREATED',
      }
      try {
        const resumed = await resumeRegistrations(pending.registrationId)
        activeRegistrationAttempt = resumed.find((item) => item.registrationId === pending.registrationId) || fallbackAttempt
      } catch {
        activeRegistrationAttempt = fallbackAttempt
      }
      await routePendingRegistrationAttempt(activeRegistrationAttempt)
      return
    }

    let registrations
    try {
      registrations = await resumeRegistrations(pending.registrationId)
    } catch (error) {
      if (isRegistrationVerificationError(error)) {
        pendingRegistrationNeedsVerification = true
        showLoginEmailVerification()
        return
      }
      throw error
    }
    const attempt = registrations.find((item) => item.registrationId === pending.registrationId)
    if (!attempt) {
      showLoginRegistrationUnavailable()
      return
    }
    await routePendingRegistrationAttempt(attempt)
  } catch (error) {
    showLoginRegistrationUnavailable()
    setLoginError(formatRegistrationError(error))
  } finally {
    setLoginControlsBusy(false)
  }
}

async function offerPendingRegistrationChoice(result) {
  const pending = pendingRegistration || getPendingRegistrationEntry()
  if (!pending?.registrationId) return false
  pendingRegistration = pending
  let bindError = null
  if (hasPendingRegistrationBindToken(pending.registrationId)) {
    try {
      await bindRegistrationAccount(pending.registrationId)
      const fallbackAttempt = {
        registrationId: pending.registrationId,
        planCode: 'UNKNOWN',
        paid: false,
        status: 'AUTH_CREATED',
        consentsComplete: false,
      }
      try {
        const resumed = await resumeRegistrations(pending.registrationId)
        activeRegistrationAttempt = resumed.find((item) => item.registrationId === pending.registrationId) || fallbackAttempt
      } catch {
        activeRegistrationAttempt = fallbackAttempt
      }
    } catch (error) {
      bindError = error
    }
  }
  selectableOrganizations = organizationsFromLoginResult(result)
  if (selectableOrganizations.length) {
    showLoginOrganizationSelection(selectableOrganizations)
    if (bindError) setLoginError(formatRegistrationError(bindError))
  } else if (bindError) {
    showLoginRegistrationUnavailable()
    setLoginError(formatRegistrationError(bindError))
  } else {
    await continuePendingRegistration()
  }
  return true
}

async function resolveDeferredRegistrationContext() {
  try {
    return await ensureSessionContext(null)
  } catch (error) {
    if (String(error?.code ?? '').toUpperCase() === 'REGISTRATION_REQUIRED') {
      return { status: 'ORGANIZATION_ONBOARDING_REQUIRED', organizations: [] }
    }
    throw error
  }
}

async function verifyPendingRegistrationAndShowCompany() {
  const pending = pendingRegistration || getPendingRegistrationEntry()
  if (!pending?.registrationId) throw new Error('Brak aktywnej próby rejestracji.')
  try {
    await verifyRegistration(pending.registrationId)
  } catch (error) {
    if (String(error?.code ?? '').toUpperCase() === 'REQUIRED_CONSENT_MISSING') {
      activeRegistrationAttempt = {
        ...activeRegistrationAttempt,
        registrationId: pending.registrationId,
        status: 'AUTH_CREATED',
        consentsComplete: false,
      }
      showLoginRegistrationConsents(activeRegistrationAttempt)
      setLoginError('Zapisz wymagane zgody przed dalszą weryfikacją.')
      return false
    }
    throw error
  }
  pendingRegistrationNeedsVerification = false
  const attempts = await resumeRegistrations(pending.registrationId)
  const attempt = attempts.find((item) => item.registrationId === pending.registrationId)
  if (!attempt) throw new Error('Registration API nie zwróciło aktywnej próby po weryfikacji.')
  showLoginRegistrationCompany(attempt)
  return true
}

function registrationOwnerPayload() {
  const firstName = String(document.getElementById('loginRegistrationOwnerFirstName')?.value ?? '').trim()
  const lastName = String(document.getElementById('loginRegistrationOwnerLastName')?.value ?? '').trim()
  const phone = String(document.getElementById('loginRegistrationOwnerPhone')?.value ?? '').trim()
  if (!firstName || !lastName) throw new Error('Uzupełnij imię i nazwisko właściciela.')
  return {
    firstName,
    lastName,
    ...(phone ? { phone } : {}),
    locale: activeRegistrationAttempt?.owner?.locale,
    timezone: activeRegistrationAttempt?.owner?.timezone,
  }
}

function registrationCompanyPayload() {
  const read = (id) => String(document.getElementById(id)?.value ?? '').trim()
  const legalName = read('loginRegistrationLegalName')
  const countryCode = read('loginRegistrationCountry').toUpperCase()
  const taxIdType = read('loginRegistrationTaxType').toUpperCase()
  const taxIdValue = read('loginRegistrationTaxId')
  const addressLine1 = read('loginRegistrationAddress')
  const locality = read('loginRegistrationLocality')
  const postalCode = read('loginRegistrationPostalCode')
  const billingEmail = read('loginRegistrationBillingEmail').toLowerCase()
  if (!legalName || !countryCode || !taxIdType || !taxIdValue || !addressLine1 || !locality || !postalCode) {
    throw new Error('Uzupełnij nazwę prawną, identyfikator podatkowy oraz pełny adres firmy.')
  }
  if (activeRegistrationAttempt?.paid === true && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) {
    throw new Error('Podaj poprawny e-mail rozliczeniowy dla płatnego planu.')
  }
  const billingPhone = read('loginRegistrationBillingPhone')
  const invoiceEmail = read('loginRegistrationInvoiceEmail').toLowerCase()
  return {
    legalName,
    registrationCountryCode: countryCode,
    taxIdType,
    taxIdValue,
    addressLine1,
    locality,
    postalCode,
    countryCode,
    ...(billingEmail ? { billingEmail } : {}),
    ...(billingPhone ? { billingPhone } : {}),
    ...(invoiceEmail ? { invoiceEmail } : {}),
  }
}

function OLD_bindLogin(router) {
  const loginForm = document.getElementById('loginForm')
  const loginButton = document.getElementById('loginBtn')
  const loginInput = document.getElementById('loginLogin')
  const passwordInput = document.getElementById('loginPass')
  const resetPanel = document.getElementById('loginResetPanel')
  const resetEmailInput = document.getElementById('loginResetEmail')
  const resetSend = document.getElementById('loginResetSend')
  const resetBack = document.getElementById('loginResetBack')
  const resetOpen = document.getElementById('loginResetOpen')
  const organizationList = document.getElementById('loginOrganizationList')
  const organizationCancel = document.getElementById('loginOrganizationCancel')

  if (
    !loginButton ||
    !loginInput ||
    !passwordInput ||
    !resetPanel ||
    !resetEmailInput ||
    !resetSend ||
    !resetBack ||
    !resetOpen
  ) {
    return () => {}
  }

  const handleLogin = async (event) => {
    event?.preventDefault?.()
    if (loginButton.disabled) {
      return
    }

    stopDashboardAutoRefresh()
    setLoginControlsBusy(true, 'Logowanie...')
    setLoginError('')

    try {
      const result = await login({
        login: loginInput.value,
        password: passwordInput.value,
      })
      if (result?.status === 'ORG_SELECTION_REQUIRED') {
        showLoginOrganizationSelection(result.organizations)
        return
      }
      if (result?.status !== 'READY' || !result.session) {
        throw new Error('Nie uda\u0142o si\u0119 utworzy\u0107 bezpiecznej sesji aplikacji.')
      }
      await activatePortalSession(result.session, router)
    } catch (error) {
      logout()
      resetPortalState()
      showLoginScreen()
      showLoginCredentials({ showResetAction: isPasswordResetEligibleLoginError(error) })
      setUserChip(null)
      setLoginError(formatLoginError(error))
    } finally {
      setLoginControlsBusy(false)
    }
  }

  const handlePasswordReset = async (event) => {
    event?.preventDefault?.()
    if (resetSend.disabled) {
      return
    }

    const email = String(resetEmailInput.value ?? '').trim().toLowerCase()
    resetEmailInput.value = email
    setLoginControlsBusy(true, 'Wysyłanie...')
    setLoginError('')
    let resetError = null

    try {
      await requestPasswordReset(email)
      setLoginError(
        'Jeśli konto z tym adresem istnieje, wysłaliśmy link do zresetowania hasła. Sprawdź również folder spam.',
        'success',
      )
    } catch (error) {
      resetError = error
      setLoginError(
        error instanceof Error
          ? error.message
          : 'Nie udało się wysłać linku do zresetowania hasła. Spróbuj ponownie.',
      )
    } finally {
      setLoginControlsBusy(false)
      if (resetError) {
        resetEmailInput.focus()
      } else {
        resetBack.focus()
      }
    }
  }

  const handleResetOpen = () => {
    passwordInput.value = ''
    setLoginError('')
    showLoginPasswordReset(loginInput.value)
    resetEmailInput.focus()
  }

  const handleResetBack = () => {
    loginInput.value = String(resetEmailInput.value ?? '').trim().toLowerCase()
    setLoginError('')
    showLoginCredentials()
    loginInput.focus()
  }

  const handleLoginFormSubmit = (event) => {
    if (!resetPanel.hidden) {
      void handlePasswordReset(event)
      return
    }
    void handleLogin(event)
  }

  const handleOrganizationSelection = async (event) => {
    const button = event.target?.closest?.('.login-organization-option')
    if (!button || button.disabled) {
      return
    }

    setLoginControlsBusy(true, 'Wybieranie...')
    setLoginError('')
    let contextConfirmed = false
    try {
      const result = await selectOrganization(button.dataset.orgId)
      if (result?.status !== 'READY' || !result.session) {
        throw new Error('Nie uda\u0142o si\u0119 zatwierdzi\u0107 wybranej organizacji.')
      }
      contextConfirmed = true
      await activatePortalSession(result.session, router)
    } catch (error) {
      if (contextConfirmed) {
        logout()
        resetPortalState()
        showLoginScreen()
        showLoginCredentials()
        setUserChip(null)
      }
      setLoginError(formatLoginError(error))
    } finally {
      setLoginControlsBusy(false)
    }
  }

  const handleOrganizationCancel = () => {
    logout()
    setLoginError('')
    showLoginCredentials()
    passwordInput.value = ''
    loginInput.focus()
  }

  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginFormSubmit)
  } else {
    loginButton.addEventListener('click', handleLogin)
    resetSend.addEventListener('click', handlePasswordReset)
  }
  resetOpen.addEventListener('click', handleResetOpen)
  resetBack.addEventListener('click', handleResetBack)
  organizationList?.addEventListener('click', handleOrganizationSelection)
  organizationCancel?.addEventListener('click', handleOrganizationCancel)

  return () => {
    if (loginForm) {
      loginForm.removeEventListener('submit', handleLoginFormSubmit)
    } else {
      loginButton.removeEventListener('click', handleLogin)
      resetSend.removeEventListener('click', handlePasswordReset)
    }
    resetOpen.removeEventListener('click', handleResetOpen)
    resetBack.removeEventListener('click', handleResetBack)
    organizationList?.removeEventListener('click', handleOrganizationSelection)
    organizationCancel?.removeEventListener('click', handleOrganizationCancel)
  }
}

function bindPlatformLogin(router) {
  const byId = (id) => document.getElementById(id)
  const loginForm = byId('loginForm')
  const loginButton = byId('loginBtn')
  const loginInput = byId('loginLogin')
  const passwordInput = byId('loginPass')
  const authScope = byId('loginAuthScope')
  const passwordToggle = byId('loginPasswordToggle')
  const resetPanel = byId('loginResetPanel')
  const resetEmail = byId('loginResetEmail')
  const resetSend = byId('loginResetSend')
  const resetBack = byId('loginResetBack')
  const resetOpen = byId('loginResetOpen')
  const organizationList = byId('loginOrganizationList')
  const organizationCancel = byId('loginOrganizationCancel')
  const googleButton = byId('loginGoogleBtn')
  const googleDivider = byId('loginProviderDivider')
  const createOpen = byId('loginOrganizationCreateOpen')
  const createBack = byId('loginOrganizationCreateBack')
  const createButton = byId('loginOrganizationCreate')
  const registrationTerms = byId('loginRegistrationTerms')
  const registrationPrivacy = byId('loginRegistrationPrivacy')
  const registrationMarketing = byId('loginRegistrationMarketing')
  const registrationConsentsSave = byId('loginRegistrationConsentsSave')
  const registrationLookup = byId('loginRegistrationLookup')
  const registrationCountry = byId('loginRegistrationCountry')
  const registrationTaxType = byId('loginRegistrationTaxType')
  const registrationCompanySave = byId('loginRegistrationCompanySave')
  const registrationPaymentCheck = byId('loginRegistrationPaymentCheck')
  const registrationRestart = byId('loginRegistrationRestart')
  const registrationExistingButtons = [
    byId('loginRegistrationChooseExisting'),
    byId('loginRegistrationCompanyExisting'),
    byId('loginRegistrationPaymentExisting'),
    byId('loginRegistrationUnavailableExisting'),
  ].filter(Boolean)
  const registrationCancelButtons = [
    byId('loginRegistrationCancel'),
    byId('loginRegistrationCompanyCancel'),
    byId('loginRegistrationPaymentCancel'),
    byId('loginRegistrationUnavailableCancel'),
  ].filter(Boolean)
  const verificationCheck = byId('loginEmailVerificationCheck')
  const verificationSend = byId('loginEmailVerificationSend')
  const verificationCancel = byId('loginEmailVerificationCancel')
  const challengePanel = byId('loginMfaChallengePanel')
  const enrollmentPanel = byId('loginMfaEnrollmentPanel')
  const factor = byId('loginMfaFactor')
  const sendMfaCode = byId('loginMfaSendCode')
  const mfaCode = byId('loginMfaCode')
  const confirmMfa = byId('loginMfaConfirm')
  const cancelMfa = byId('loginMfaCancel')
  const chooseTotp = byId('loginMfaChooseTotp')
  const chooseSms = byId('loginMfaChooseSms')
  const chooseEmail = byId('loginMfaChooseEmail')
  const totpSetup = byId('loginMfaTotpSetup')
  const totpSecret = byId('loginMfaTotpSecret')
  const phoneSetup = byId('loginMfaPhoneSetup')
  const phone = byId('loginMfaPhone')
  const sendPhone = byId('loginMfaPhoneSend')
  const emailSetup = byId('loginMfaEmailSetup')
  const emailInput = byId('loginMfaEmail')
  const sendEmailCode = byId('loginMfaEmailSend')
  const enrollCode = byId('loginMfaEnrollCode')
  const confirmEnrollment = byId('loginMfaEnrollConfirm')
  const cancelEnrollment = byId('loginMfaEnrollCancel')
  const companyStart = byId('loginCompanyStart')
  const companyGoogle = byId('loginCompanyGoogle')
  const companyEmailOpen = byId('loginCompanyEmailOpen')
  const companyBack = byId('loginCompanyBack')
  const companyEmail = byId('loginCompanyEmail')
  const companyEmailBack = byId('loginCompanyEmailBack')
  const companyEmailLink = byId('loginCompanyEmailLink')
  const companyEmailPanel = byId('loginCompanyEmailPanel')
  const companyEmailLinkPanel = byId('loginCompanyEmailLinkPanel')
  const facilityManagerStart = byId('loginFacilityManagerStart')
  const facilityManagerPanel = byId('loginFacilityManagerPanel')
  const facilityManagerOrganizationName = byId('loginFacilityManagerOrganizationName')
  const facilityManagerGoogleLogin = byId('loginFacilityManagerGoogleLogin')
  const facilityManagerBack = byId('loginFacilityManagerBack')
  const companyBasicsForm = byId('companyBasicsForm')
  const companyBasicsSignOut = byId('companyBasicsSignOut')
  if (!loginButton || !loginInput || !passwordInput || !resetPanel || !resetEmail || !resetSend || !resetBack || !resetOpen) return () => {}

  const requestedPanel = new URLSearchParams(window.location.search).get('panel')?.trim().toLowerCase()
  if (authScope && requestedPanel === 'admin') {
    authScope.value = 'platform'
  } else if (authScope && isPlatformFirebaseConfigured() && !isFirebaseConfigured()) {
    authScope.value = 'platform'
  }

  const selectedAuthScope = () => authScope?.value === 'platform' ? 'platform' : 'organization'
  const updateAuthScopeCopy = () => {
    const loginCopy = byId('loginCopy')
    const loginScreen = byId('loginScreen')
    const platformHeading = byId('platformLoginHeading')
    const isPlatformLogin = selectedAuthScope() === 'platform'
    if (loginScreen) loginScreen.dataset.authScope = isPlatformLogin ? 'platform' : 'organization'
    if (platformHeading) platformHeading.setAttribute('aria-hidden', isPlatformLogin ? 'false' : 'true')
    if (googleButton) googleButton.hidden = isPlatformLogin
    if (googleDivider) googleDivider.hidden = isPlatformLogin
    if (loginCopy && !byId('loginCredentialsPanel')?.hidden) {
      loginCopy.textContent = isPlatformLogin
        ? 'Zaloguj się do Panelu admina.'
        : 'Zaloguj się do portalu Cleanzi.'
    }
  }
  updateAuthScopeCopy()

  const continueResult = async (result) => {
    if (
      selectedAuthScope() === 'organization'
      && (pendingRegistration?.registrationId || getPendingRegistrationEntry()?.registrationId)
      && !['MFA_CHALLENGE_REQUIRED', 'PLATFORM_MFA_ENROLLMENT_REQUIRED', 'PLATFORM_SELECTION_REQUIRED'].includes(result?.status)
    ) {
      const contextResult = result?.status === 'AUTHENTICATED'
        ? await resolveDeferredRegistrationContext()
        : result
      if (await offerPendingRegistrationChoice(contextResult)) return
    }
    if (result?.status === 'MFA_CHALLENGE_REQUIRED') {
      pendingMfaChallenge = { factors: result.factors || [], verificationId: '' }
      showLoginMfaChallenge(result.factors)
      return
    }
    if (result?.status === 'PLATFORM_MFA_ENROLLMENT_REQUIRED') {
      showLoginMfaEnrollment()
      return
    }
    if (result?.status === 'PLATFORM_SELECTION_REQUIRED') {
      resetPortalState()
      await showPlatformOrganizationCenter(router)
      return
    }
    if (result?.status === 'ORG_SELECTION_REQUIRED') {
      showLoginOrganizationSelection(result.organizations)
      return
    }
    if (result?.status === 'ORGANIZATION_ONBOARDING_REQUIRED') {
      showLoginOrganizationSelection([])
      return
    }
    if (result?.status === 'EMAIL_VERIFICATION_REQUIRED') {
      showLoginEmailVerification()
      return
    }
    if (result?.status === 'CLEANING_COMPANY_ONBOARDING_REQUIRED') {
      resetPortalState()
      await showCleaningCompanyBasicsOverlay()
      return
    }
    if (result?.status !== 'READY' || !result.session) throw new Error('Nie udało się utworzyć bezpiecznej sesji aplikacji.')
    await activatePortalSession(result.session, router)
  }

  const clearRegistrationAttemptWhenNameChanges = () => {
    const currentName = normalizedFacilityManagerRegistrationName(facilityManagerOrganizationName?.value)
    if (pendingFacilityManagerRegistration?.organizationName !== currentName) {
      clearFacilityManagerRegistrationAttempt()
    }
    setLoginError('')
  }

  const prepareFacilityManagerRegistrationAttempt = () => {
    const organizationName = normalizedFacilityManagerRegistrationName(facilityManagerOrganizationName?.value)
    if (!organizationName || organizationName.length > 120) {
      clearFacilityManagerRegistrationAttempt()
      const error = new Error('Podaj nazwę panelu (maks. 120 znaków).')
      error.facilityManagerRegistrationValidation = true
      throw error
    }

    if (pendingFacilityManagerRegistration?.organizationName !== organizationName) {
      pendingFacilityManagerRegistration = {
        organizationName,
        idempotencyKey: createFacilityManagerRegistrationIdempotencyKey(),
      }
    }

    return pendingFacilityManagerRegistration
  }

  const cancelFlow = () => {
    logout()
    pendingMfaChallenge = null
    pendingMfaEnrollmentType = ''
    pendingEmailMfaChallengeId = ''
    setLoginError('')
    showLoginCredentials()
    passwordInput.value = ''
    loginInput.focus()
  }
  const handleLogin = async (event) => {
    event?.preventDefault?.()
    setLoginControlsBusy(true, 'Logowanie...')
    setLoginError('')
    try {
      await continueResult(await login({
        login: loginInput.value,
        password: passwordInput.value,
        authScope: selectedAuthScope(),
        deferContext: selectedAuthScope() === 'organization' && Boolean(pendingRegistration?.registrationId),
      }))
    } catch (error) {
      logout()
      resetPortalState()
      showLoginScreen()
      showLoginCredentials({ showResetAction: isPasswordResetEligibleLoginError(error) })
      setLoginError(formatLoginError(error))
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const handleGoogleLogin = async () => {
    setLoginControlsBusy(true, 'Logowanie przez Google...')
    setLoginError('')
    try {
      const result = await loginWithGoogle({
        deferContext: Boolean(pendingRegistration?.registrationId),
      })
      if (result?.status !== 'REDIRECTING') await continueResult(result)
    } catch (error) {
      setLoginError(formatLoginError(error))
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const handleReset = async (event) => {
    event?.preventDefault?.()
    setLoginControlsBusy(true, 'Wysyłanie...')
    setLoginError('')
    try {
      await requestPasswordReset(resetEmail.value, selectedAuthScope())
      setLoginError('Jeśli konto z tym adresem istnieje, wysłaliśmy link do zresetowania hasła. Sprawdź również folder spam.', 'success')
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Nie udało się wysłać linku.')
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const handleCompanyGoogle = async () => {
    setLoginControlsBusy(true, 'Łączenie z Google...')
    setLoginError('')
    try {
      await continueResult(await startCleaningCompanyGoogleSignIn())
    } catch (error) {
      logout()
      resetPortalState()
      clearStoredCurrentRoute()
      showLoginScreen()
      showLoginCompanyStart()
      setLoginError(formatLoginError(error))
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const handleFacilityManagerGoogle = async (event) => {
    event?.preventDefault?.()

    let attempt
    try {
      attempt = prepareFacilityManagerRegistrationAttempt()
    } catch (error) {
      setLoginError(formatLoginError(error))
      return
    }

    setLoginControlsBusy(
      true,
      attempt.retryProvisioning === true ? 'Tworzenie panelu...' : 'Łączenie z Google...',
    )
    setLoginError('')
    try {
      const result = attempt.retryProvisioning === true
        ? await retryFacilityManagerGoogleRegistration({
          organizationName: attempt.organizationName,
          idempotencyKey: attempt.idempotencyKey,
        })
        : await registerFacilityManagerWithGoogle({
          organizationName: attempt.organizationName,
          idempotencyKey: attempt.idempotencyKey,
        })
      clearFacilityManagerRegistrationAttempt()
      await continueResult(result)
    } catch (error) {
      if (error?.facilityManagerRegistrationValidation === true) {
        clearFacilityManagerRegistrationAttempt()
      }
      if (error?.facilityManagerRegistrationRetryable === true) {
        pendingFacilityManagerRegistration = { ...attempt, retryProvisioning: true }
        showLoginFacilityManagerRegistration()
        setLoginError(formatLoginError(error))
        return
      }
      logout()
      resetPortalState()
      clearStoredCurrentRoute()
      showLoginScreen()
      showLoginFacilityManagerRegistration()
      setLoginError(formatLoginError(error))
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const handleFacilityManagerGoogleLogin = async () => {
    setLoginControlsBusy(true, 'Łączenie z Google...')
    setLoginError('')
    try {
      clearFacilityManagerRegistrationAttempt()
      await continueResult(await signInFacilityManagerWithGoogle())
    } catch (error) {
      logout()
      resetPortalState()
      clearStoredCurrentRoute()
      showLoginScreen()
      showLoginFacilityManagerRegistration()
      setLoginError(formatLoginError(error))
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const handleCompanyEmailSend = async (event) => {
    event?.preventDefault?.()
    const retryWaitSeconds = companyEmailRetrySecondsRemaining()
    if (retryWaitSeconds > 0) {
      refreshCompanyEmailRetryControl()
      setLoginError(`Kolejną próbę możesz wykonać za ${retryWaitSeconds} s.`)
      return
    }
    setLoginControlsBusy(true, 'Wysyłanie...')
    setLoginError('')
    try {
      const result = await requestCleaningCompanyEmailLink(companyEmail?.value)
      if (companyEmail && result?.email) companyEmail.value = result.email
      startCompanyEmailRetryCooldown()
      setLoginError('Zleciliśmy wysyłkę. Sprawdź Odebrane oraz Spam. Link rejestracyjny jest ważny 30 minut.', 'success')
    } catch (error) {
      setLoginError(formatLoginError(error))
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const handleCompanyEmailLinkConfirm = async (event) => {
    event?.preventDefault?.()
    setLoginControlsBusy(true, 'Potwierdzanie...')
    setLoginError('')
    try {
      await continueResult(await completeCleaningCompanyEmailLinkSignIn(companyEmailLink?.value))
    } catch (error) {
      // A failed link never becomes a locally accepted registration. Keep the
      // confirmation form visible so the user can correct the e-mail address.
      showLoginScreen()
      showLoginCompanyEmailLinkConfirmation(companyEmailLink?.value || getStoredCleaningCompanyEmailLinkEmail())
      setLoginError(formatLoginError(error))
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const companyCommandId = () => {
    if (cleaningCompanyOnboardingCommandId) return cleaningCompanyOnboardingCommandId
    const commandId = globalThis.crypto?.randomUUID?.()
    if (!commandId) throw new Error('Twoja przeglądarka nie obsługuje bezpiecznego identyfikatora zapisu. Zaktualizuj ją i spróbuj ponownie.')
    cleaningCompanyOnboardingCommandId = commandId
    return commandId
  }
  const handleCompanyBasicsSubmit = async (event) => {
    event.preventDefault()
    const elements = companyBasicsElements()
    if (!cleaningCompanyLegalDocuments) {
      setCompanyBasicsError('Nie udało się pobrać aktualnych dokumentów. Odśwież stronę i spróbuj ponownie.')
      return
    }
    if (!elements.form?.reportValidity()) return

    setCompanyBasicsBusy(true, 'Zapisywanie...')
    setCompanyBasicsError('')
    try {
      const result = await completeCleaningCompanyOnboarding({
        commandId: companyCommandId(),
        nip: elements.nip?.value,
        legalName: elements.legalName?.value,
        declaredEmployeeCount: elements.declaredEmployeeCount?.value,
        legalDocuments: {
          terms: { ...cleaningCompanyLegalDocuments.terms, accepted: elements.terms?.checked === true },
          privacy: { ...cleaningCompanyLegalDocuments.privacy, acknowledged: elements.privacy?.checked === true },
        },
        marketing: {
          email: elements.marketingEmail?.checked === true,
          sms: elements.marketingSms?.checked === true,
          phone: elements.marketingPhone?.checked === true,
        },
      })
      if (result?.status !== 'READY' || !result.session) {
        throw new Error('Serwer nie potwierdził utworzenia firmy.')
      }
      await activatePortalSession(result.session, router)
    } catch (error) {
      setCompanyBasicsError(error instanceof Error ? error.message : 'Nie udało się zapisać danych firmy. Spróbuj ponownie.')
    } finally {
      setCompanyBasicsBusy(false)
    }
  }
  const handleCompanyBasicsSignOut = () => {
    logout()
    resetPortalState()
    clearStoredCurrentRoute()
    hideCleaningCompanyBasicsOverlay({ reset: true })
    showLoginScreen()
    showLoginCredentials()
    setUserChip(null)
  }
  const handleOrganization = async (event) => {
    const button = event.target?.closest?.('.login-organization-option')
    if (!button) return
    setLoginControlsBusy(true, 'Wybieranie...')
    try {
      const result = await selectOrganization(button.dataset.orgId)
      if (result?.status !== 'READY' || !result.session) {
        throw new Error('Nie udało się zatwierdzić wybranej organizacji.')
      }
      const pending = pendingRegistration || getPendingRegistrationEntry()
      if (pending?.registrationId && !hasPendingRegistrationBindToken(pending.registrationId)) {
        try {
          const attempts = await resumeRegistrations(pending.registrationId)
          if (!attempts.some((item) => item.registrationId === pending.registrationId)) {
            clearPendingRegistrationEntry(pending.registrationId)
            pendingRegistration = null
            activeRegistrationAttempt = null
          }
        } catch {
          // Selecting an existing valid organization must not be blocked by an
          // unrelated registration-resume outage.
        }
      }
      await activatePortalSession(result.session, router)
    } catch (error) {
      setLoginError(formatLoginError(error))
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const openOrganizationCreate = async () => {
    setLoginError('')
    if (pendingRegistration?.registrationId || getPendingRegistrationEntry()?.registrationId) {
      void continuePendingRegistration()
      return
    }

    if (selectableOrganizations.length) {
      showLoginOrganizationCreate()
      return
    }

    setLoginControlsBusy(true, 'Otwieranie formularza firmy...')
    try {
      await continueResult(await resumeCleaningCompanyOnboardingForExistingGoogleAccount())
    } catch (error) {
      setLoginError(formatLoginError(error))
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const closeOrganizationCreate = () => {
    setLoginError('')
    showLoginOrganizationSelection(selectableOrganizations)
  }
  const handleOrganizationCreate = () => {
    window.location.assign(getRegistrationPageUrl())
  }
  const handleRegistrationConsents = async () => {
    if (!registrationTerms?.checked || !registrationPrivacy?.checked) {
      setLoginError('Zaakceptuj regulamin i politykę prywatności.')
      return
    }
    setLoginControlsBusy(true, 'Zapisywanie zgód...')
    setLoginError('')
    try {
      const pending = pendingRegistration || getPendingRegistrationEntry()
      if (!pending?.registrationId) throw new Error('Brak aktywnej próby rejestracji.')
      await saveRegistrationConsents(pending.registrationId, {
        terms: registrationTerms.checked,
        privacy: registrationPrivacy.checked,
        marketing: registrationMarketing?.checked === true,
      })
      activeRegistrationAttempt = {
        ...activeRegistrationAttempt,
        registrationId: pending.registrationId,
        status: 'AUTH_CREATED',
        consentsComplete: true,
      }
      try {
        await verifyPendingRegistrationAndShowCompany()
      } catch (error) {
        if (isRegistrationVerificationError(error)) {
          pendingRegistrationNeedsVerification = true
          showLoginEmailVerification()
          setLoginError('Potwierdź adres email, a następnie sprawdź ponownie.', 'success')
          return
        }
        throw error
      }
    } catch (error) {
      setLoginError(formatRegistrationError(error))
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const handleRegistrationLookup = async () => {
    if (registrationCountry?.value !== 'PL' || registrationTaxType?.value !== 'NIP') return
    setLoginControlsBusy(true, 'Pobieranie danych...')
    setLoginError('')
    try {
      const company = await lookupRegistrationCompany(byId('loginRegistrationTaxId')?.value)
      if (byId('loginRegistrationTaxId')) byId('loginRegistrationTaxId').value = company?.nip || byId('loginRegistrationTaxId').value
      if (byId('loginRegistrationLegalName')) byId('loginRegistrationLegalName').value = company?.name || ''
      if (byId('loginRegistrationAddress')) byId('loginRegistrationAddress').value = company?.addressLine1 || ''
      if (byId('loginRegistrationPostalCode')) byId('loginRegistrationPostalCode').value = company?.postalCode || ''
      if (byId('loginRegistrationLocality')) byId('loginRegistrationLocality').value = company?.locality || ''
      setLoginError('Dane pobrano z oficjalnego rejestru. Możesz je poprawić przed zapisem.', 'success')
    } catch (error) {
      setLoginError(formatRegistrationError(error))
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const handleRegistrationCompany = async () => {
    setLoginControlsBusy(true, activeRegistrationAttempt?.paid === true ? 'Otwieranie płatności...' : 'Tworzenie firmy...')
    setLoginError('')
    try {
      const pending = pendingRegistration || getPendingRegistrationEntry()
      if (!pending?.registrationId) throw new Error('Brak aktywnej próby rejestracji.')
      await bindRegistrationAccount(pending.registrationId, registrationOwnerPayload())
      const result = await completeRegistrationCompany(pending.registrationId, registrationCompanyPayload())
      if (result?.nextAction === 'OPEN_CHECKOUT') {
        if (!isSafeStripeCheckoutUrl(result.checkoutUrl)) {
          throw new Error('Registration API zwróciło niedozwolony adres płatności.')
        }
        window.location.assign(result.checkoutUrl)
        return
      }
      if (result?.nextAction !== 'OPEN_DASHBOARD' || !String(result?.orgId ?? '').trim()) {
        throw new Error('Registration API nie zwróciło bezpiecznej akcji końcowej.')
      }
      clearPendingRegistrationEntry(pending.registrationId)
      pendingRegistration = null
      activeRegistrationAttempt = null
      const selected = await selectOrganization(result.orgId)
      if (selected?.status !== 'READY' || !selected.session) {
        throw new Error('Firma została utworzona, ale portal nie odtworzył jeszcze sesji. Zaloguj się ponownie.')
      }
      await activatePortalSession(selected.session, router)
    } catch (error) {
      setLoginError(formatRegistrationError(error))
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const handleRegistrationPaymentCheck = async () => {
    setLoginControlsBusy(true, 'Sprawdzanie płatności...')
    setLoginError('')
    try {
      const pending = pendingRegistration || getPendingRegistrationEntry()
      if (!pending?.registrationId) throw new Error('Brak aktywnej próby rejestracji.')
      const attempts = await resumeRegistrations(pending.registrationId)
      const attempt = attempts.find((item) => item.registrationId === pending.registrationId)
      if (attempt?.status === 'PAYMENT_PENDING') {
        showLoginRegistrationPayment(attempt)
        setLoginError('Płatność nie została jeszcze potwierdzona. Dostęp pozostaje zablokowany.', 'success')
        return
      }
      const context = await resolveDeferredRegistrationContext()
      clearPendingRegistrationEntry(pending.registrationId)
      pendingRegistration = null
      activeRegistrationAttempt = null
      if (context?.status === 'READY' && context.session) {
        await activatePortalSession(context.session, router)
        return
      }
      if (context?.status === 'ORG_SELECTION_REQUIRED') {
        showLoginOrganizationSelection(context.organizations)
        return
      }
      throw new Error('Płatność nie została jeszcze aktywowana przez webhook Stripe.')
    } catch (error) {
      setLoginError(formatRegistrationError(error))
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const handleVerificationSend = async () => {
    setLoginControlsBusy(true, 'Wysyłanie...')
    try {
      const result = await requestEmailVerification()
      setLoginError(result.verified ? 'Adres email jest już potwierdzony.' : 'Wiadomość weryfikacyjna została wysłana.', 'success')
    } catch (error) {
      setLoginError(formatLoginError(error))
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const handleVerificationCheck = async () => {
    setLoginControlsBusy(true, 'Sprawdzanie...')
    try {
      const result = await refreshEmailVerification({
        deferContext: pendingRegistrationNeedsVerification || Boolean(pendingRegistration?.registrationId),
      })
      if (result?.status === 'EMAIL_VERIFICATION_REQUIRED') {
        setLoginError('Adres email nie został jeszcze potwierdzony.')
        return
      }
      if (pendingRegistrationNeedsVerification) {
        await verifyPendingRegistrationAndShowCompany()
      } else {
        await continueResult(result)
      }
    } catch (error) {
      setLoginError(formatLoginError(error))
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const updateFactor = () => {
    const selected = factor?.selectedOptions?.[0]
    if (sendMfaCode) sendMfaCode.hidden = selected?.dataset?.factorId !== 'phone'
    pendingMfaChallenge = { ...(pendingMfaChallenge || {}), verificationId: '' }
  }
  const requestMfaCode = async () => {
    setLoginControlsBusy(true, 'Wysyłanie...')
    try {
      pendingMfaChallenge = { ...(pendingMfaChallenge || {}), ...(await beginMfaSignInChallenge(factor?.value)) }
      setLoginError('Kod SMS został wysłany.', 'success')
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Nie udało się wysłać kodu.')
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const resolveMfa = async (event) => {
    event?.preventDefault?.()
    setLoginControlsBusy(true, 'Weryfikowanie...')
    try {
      if (factor?.selectedOptions?.[0]?.dataset?.factorId === 'phone' && !pendingMfaChallenge?.verificationId) {
        pendingMfaChallenge = {
          ...(pendingMfaChallenge || {}),
          ...(await beginMfaSignInChallenge(factor?.value)),
        }
      }
      await continueResult(await completeMfaSignIn({
        factorUid: factor?.value,
        verificationCode: mfaCode?.value,
        verificationId: pendingMfaChallenge?.verificationId,
        deferContext: Boolean(pendingRegistration?.registrationId),
      }))
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Nie udało się potwierdzić MFA.')
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const setupTotp = async () => {
    setLoginControlsBusy(true, 'Konfigurowanie...')
    try {
      const setup = await beginTotpEnrollment()
      pendingMfaEnrollmentType = 'totp'
      if (totpSetup) totpSetup.hidden = false
      if (phoneSetup) phoneSetup.hidden = true
      if (emailSetup) emailSetup.hidden = true
      if (totpSecret) totpSecret.textContent = setup.secretKey
      setLoginError('Dodaj klucz do aplikacji TOTP i wpisz kod.', 'success')
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Nie udało się skonfigurować TOTP.')
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const setupSms = () => {
    pendingMfaEnrollmentType = 'phone'
    if (totpSetup) totpSetup.hidden = true
    if (phoneSetup) phoneSetup.hidden = false
    if (emailSetup) emailSetup.hidden = true
    phone?.focus()
  }
  const setupEmail = () => {
    pendingMfaEnrollmentType = 'email'
    pendingEmailMfaChallengeId = ''
    if (totpSetup) totpSetup.hidden = true
    if (phoneSetup) phoneSetup.hidden = true
    if (emailSetup) emailSetup.hidden = false
    if (emailInput && !emailInput.value) emailInput.value = loginInput.value
    emailInput?.focus()
    setLoginError('Wpisz adres, na który chcesz otrzymać jednorazowy kod.', 'success')
  }
  const requestEnrollmentSms = async () => {
    setLoginControlsBusy(true, 'Wysyłanie...')
    try {
      await beginPhoneMfaEnrollment(phone?.value, 'loginMfaEnrollRecaptcha')
      setLoginError('Kod SMS został wysłany.', 'success')
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Nie udało się wysłać kodu.')
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const requestEnrollmentEmail = async () => {
    setLoginControlsBusy(true, 'Wysyłanie...')
    try {
      const challenge = await requestPlatformEmailMfaCode(emailInput?.value)
      pendingEmailMfaChallengeId = String(challenge?.challengeId ?? '')
      setLoginError(`Kod został wysłany na ${challenge?.emailMasked || 'podany email'}.`, 'success')
      enrollCode?.focus()
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Nie udało się wysłać kodu email.')
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const finishEnrollment = async (event) => {
    event?.preventDefault?.()
    setLoginControlsBusy(true, 'Potwierdzanie...')
    try {
      let result
      if (pendingMfaEnrollmentType === 'totp') {
        result = await completeTotpEnrollment(enrollCode?.value)
      } else if (pendingMfaEnrollmentType === 'phone') {
        result = await completePhoneMfaEnrollment(enrollCode?.value)
      } else if (pendingMfaEnrollmentType === 'email') {
        if (!pendingEmailMfaChallengeId) throw new Error('Najpierw wyślij kod na email.')
        result = await verifyPlatformEmailMfaCode({
          challengeId: pendingEmailMfaChallengeId,
          code: enrollCode?.value,
        })
      } else {
        throw new Error('Najpierw wybierz metodę potwierdzenia.')
      }
      await continueResult(result)
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Nie udało się włączyć MFA.')
    } finally {
      setLoginControlsBusy(false)
    }
  }
  const submit = (event) => {
    if (facilityManagerPanel && !facilityManagerPanel.hidden) return void handleFacilityManagerGoogle(event)
    if (!resetPanel.hidden) return void handleReset(event)
    if (companyEmailLinkPanel && !companyEmailLinkPanel.hidden) return void handleCompanyEmailLinkConfirm(event)
    if (companyEmailPanel && !companyEmailPanel.hidden) return void handleCompanyEmailSend(event)
    if (challengePanel && !challengePanel.hidden) return void resolveMfa(event)
    if (enrollmentPanel && !enrollmentPanel.hidden) return void finishEnrollment(event)
    void handleLogin(event)
  }
  const openReset = () => {
    passwordInput.value = ''
    showLoginPasswordReset(loginInput.value)
    resetEmail.focus()
  }
  const closeReset = () => {
    loginInput.value = resetEmail.value
    showLoginCredentials()
    loginInput.focus()
  }
  const openCompanyStart = () => {
    if (!cleaningCompanyRegistrationAvailable) return
    setLoginError('')
    showLoginCompanyStart()
  }
  const openFacilityManagerRegistration = () => {
    setLoginError('')
    showLoginFacilityManagerRegistration()
  }
  const openCompanyEmail = () => {
    setLoginError('')
    showLoginCompanyEmailRegistration(loginInput.value)
    companyEmail?.focus()
  }
  const returnToCompanyStart = () => {
    setLoginError('')
    showLoginCompanyStart()
  }
  const returnToLogin = () => {
    setLoginError('')
    showLoginCredentials()
    loginInput.focus()
  }
  const returnFacilityManagerToLogin = () => {
    clearFacilityManagerRegistrationAttempt()
    if (facilityManagerOrganizationName) facilityManagerOrganizationName.value = ''
    setLoginError('')
    showLoginCredentials()
    loginInput.focus()
  }
  const setPasswordVisibility = (isVisible) => {
    passwordInput.type = isVisible ? 'text' : 'password'
    if (!passwordToggle) return
    passwordToggle.setAttribute('aria-pressed', String(isVisible))
    passwordToggle.setAttribute('aria-label', isVisible ? 'Ukryj hasło' : 'Pokaż hasło')
    const icon = passwordToggle.querySelector('i')
    icon?.classList.toggle('ph-eye', !isVisible)
    icon?.classList.toggle('ph-eye-slash', isVisible)
  }
  const togglePasswordVisibility = () => {
    setPasswordVisibility(passwordInput.type === 'password')
    passwordInput.focus({ preventScroll: true })
  }

  loginForm?.addEventListener('submit', submit)
  googleButton?.addEventListener('click', handleGoogleLogin)
  authScope?.addEventListener('change', updateAuthScopeCopy)
  passwordToggle?.addEventListener('click', togglePasswordVisibility)
  resetOpen.addEventListener('click', openReset)
  resetBack.addEventListener('click', closeReset)
  organizationList?.addEventListener('click', handleOrganization)
  organizationCancel?.addEventListener('click', cancelFlow)
  createOpen?.addEventListener('click', openOrganizationCreate)
  createBack?.addEventListener('click', closeOrganizationCreate)
  createButton?.addEventListener('click', handleOrganizationCreate)
  registrationConsentsSave?.addEventListener('click', handleRegistrationConsents)
  registrationLookup?.addEventListener('click', handleRegistrationLookup)
  registrationCountry?.addEventListener('change', syncRegistrationCountryFields)
  registrationTaxType?.addEventListener('change', syncRegistrationCountryFields)
  registrationCompanySave?.addEventListener('click', handleRegistrationCompany)
  registrationPaymentCheck?.addEventListener('click', handleRegistrationPaymentCheck)
  registrationRestart?.addEventListener('click', handleOrganizationCreate)
  registrationExistingButtons.forEach((button) => button.addEventListener('click', showExistingOrganizationsFromRegistration))
  registrationCancelButtons.forEach((button) => button.addEventListener('click', cancelFlow))
  verificationCheck?.addEventListener('click', handleVerificationCheck)
  verificationSend?.addEventListener('click', handleVerificationSend)
  verificationCancel?.addEventListener('click', cancelFlow)
  factor?.addEventListener('change', updateFactor)
  sendMfaCode?.addEventListener('click', requestMfaCode)
  confirmMfa?.addEventListener('click', resolveMfa)
  cancelMfa?.addEventListener('click', cancelFlow)
  chooseTotp?.addEventListener('click', setupTotp)
  chooseSms?.addEventListener('click', setupSms)
  chooseEmail?.addEventListener('click', setupEmail)
  sendPhone?.addEventListener('click', requestEnrollmentSms)
  sendEmailCode?.addEventListener('click', requestEnrollmentEmail)
  confirmEnrollment?.addEventListener('click', finishEnrollment)
  cancelEnrollment?.addEventListener('click', cancelFlow)
  companyStart?.addEventListener('click', openCompanyStart)
  facilityManagerStart?.addEventListener('click', openFacilityManagerRegistration)
  companyGoogle?.addEventListener('click', handleCompanyGoogle)
  facilityManagerGoogleLogin?.addEventListener('click', handleFacilityManagerGoogleLogin)
  companyEmailOpen?.addEventListener('click', openCompanyEmail)
  companyBack?.addEventListener('click', returnToLogin)
  companyEmailBack?.addEventListener('click', returnToCompanyStart)
  facilityManagerBack?.addEventListener('click', returnFacilityManagerToLogin)
  facilityManagerOrganizationName?.addEventListener('input', clearRegistrationAttemptWhenNameChanges)
  companyBasicsForm?.addEventListener('submit', handleCompanyBasicsSubmit)
  companyBasicsSignOut?.addEventListener('click', handleCompanyBasicsSignOut)
  return () => {
    if (companyEmailRetryTimer) {
      window.clearInterval(companyEmailRetryTimer)
      companyEmailRetryTimer = null
    }
    loginForm?.removeEventListener('submit', submit)
    googleButton?.removeEventListener('click', handleGoogleLogin)
    authScope?.removeEventListener('change', updateAuthScopeCopy)
    passwordToggle?.removeEventListener('click', togglePasswordVisibility)
    resetOpen.removeEventListener('click', openReset)
    resetBack.removeEventListener('click', closeReset)
    organizationList?.removeEventListener('click', handleOrganization)
    organizationCancel?.removeEventListener('click', cancelFlow)
    createOpen?.removeEventListener('click', openOrganizationCreate)
    createBack?.removeEventListener('click', closeOrganizationCreate)
    createButton?.removeEventListener('click', handleOrganizationCreate)
    registrationConsentsSave?.removeEventListener('click', handleRegistrationConsents)
    registrationLookup?.removeEventListener('click', handleRegistrationLookup)
    registrationCountry?.removeEventListener('change', syncRegistrationCountryFields)
    registrationTaxType?.removeEventListener('change', syncRegistrationCountryFields)
    registrationCompanySave?.removeEventListener('click', handleRegistrationCompany)
    registrationPaymentCheck?.removeEventListener('click', handleRegistrationPaymentCheck)
    registrationRestart?.removeEventListener('click', handleOrganizationCreate)
    registrationExistingButtons.forEach((button) => button.removeEventListener('click', showExistingOrganizationsFromRegistration))
    registrationCancelButtons.forEach((button) => button.removeEventListener('click', cancelFlow))
    verificationCheck?.removeEventListener('click', handleVerificationCheck)
    verificationSend?.removeEventListener('click', handleVerificationSend)
    verificationCancel?.removeEventListener('click', cancelFlow)
    factor?.removeEventListener('change', updateFactor)
    sendMfaCode?.removeEventListener('click', requestMfaCode)
    confirmMfa?.removeEventListener('click', resolveMfa)
    cancelMfa?.removeEventListener('click', cancelFlow)
    chooseTotp?.removeEventListener('click', setupTotp)
    chooseSms?.removeEventListener('click', setupSms)
    chooseEmail?.removeEventListener('click', setupEmail)
    sendPhone?.removeEventListener('click', requestEnrollmentSms)
    sendEmailCode?.removeEventListener('click', requestEnrollmentEmail)
    confirmEnrollment?.removeEventListener('click', finishEnrollment)
    cancelEnrollment?.removeEventListener('click', cancelFlow)
    companyStart?.removeEventListener('click', openCompanyStart)
    facilityManagerStart?.removeEventListener('click', openFacilityManagerRegistration)
    companyGoogle?.removeEventListener('click', handleCompanyGoogle)
    facilityManagerGoogleLogin?.removeEventListener('click', handleFacilityManagerGoogleLogin)
    companyEmailOpen?.removeEventListener('click', openCompanyEmail)
    companyBack?.removeEventListener('click', returnToLogin)
    companyEmailBack?.removeEventListener('click', returnToCompanyStart)
    facilityManagerBack?.removeEventListener('click', returnFacilityManagerToLogin)
    facilityManagerOrganizationName?.removeEventListener('input', clearRegistrationAttemptWhenNameChanges)
    companyBasicsForm?.removeEventListener('submit', handleCompanyBasicsSubmit)
    companyBasicsSignOut?.removeEventListener('click', handleCompanyBasicsSignOut)
  }
}

function bindLogout() {
  const logoutButton = document.getElementById('logoutBtn')
  if (!logoutButton) {
    return () => {}
  }

  const handleLogout = async () => {
    stopEventsPolling()
    stopDashboardAutoRefresh()
    dashboardHideMetricPopover()
    if (getSession()?.platformContextId && cleanziAdminPanel) {
      await cleanziAdminPanel.closeContext({ silent: true }).catch(() => {})
    }
    resetPortalState()
    clearStoredCurrentRoute()

    logout()
    setUserChip(null)
    syncProfitabilityEntryPermissions()
    showLoginScreen()
    showLoginCredentials()
    setLoginError('')
  }

  logoutButton.addEventListener('click', handleLogout)

  return () => {
    logoutButton.removeEventListener('click', handleLogout)
  }
}

async function syncRouteDataNow(normalizedRoute, options = {}) {
  const force = options.force === true
  const background = options.background === true

  if (normalizedRoute === 'dashboard') {
    const forceDashboardRefresh = force || appState.dashboardForceRefreshOnNextOpen === true
    await refreshDashboardWidgets({
      forceRefresh: forceDashboardRefresh,
      syncWorktimeToken: forceDashboardRefresh,
      preloadReferences: false,
      showLoadingOverlay: !background,
    })
    appState.dashboardForceRefreshOnNextOpen = false
    return
  }

  if (normalizedRoute === 'calendar') {
    await Promise.allSettled([
      calendarEnsureTimelineWorkerState({ force, render: false }),
      calendarSyncRemoteTasks({ render: false }),
      ordersSyncRemoteTimelineOrders({ render: false }),
      fetchClientsForCurrentSession(force),
      fetchWorkersForCurrentSession(force),
      fetchZonesForCurrentSession(force),
    ])
    if (appState.currentRoute === 'calendar') {
      calendarMarkDataReady()
      calendarScheduleRender('data-ready')
    }
    return
  }

  if (normalizedRoute === 'kanban') {
    await ensurePortalFeatureReady('kanban')
    await Promise.allSettled([
      calendarSyncRemoteTasks({ render: false }),
      fetchClientsForCurrentSession(force),
      fetchWorkersForCurrentSession(force),
      fetchZonesForCurrentSession(force),
    ])
    if (appState.currentRoute === 'kanban') {
      renderDashboardKanbanTasks()
      renderKanbanViewIfReady()
    }
    return
  }

  if (normalizedRoute === 'contractProfitability') {
    await renderContractProfitabilityView({ force })
    return
  }

  if (normalizedRoute === 'events') {
    await fetchEventsForCurrentSession({ applyStoredFilters: true, forceRefresh: force, silent: background })
    return
  }

  if (normalizedRoute === 'orders') {
    await Promise.allSettled([ordersSyncRemoteTimelineOrders({ render: true }), ordersWarmLocationSources(force)])
    return
  }

  if (normalizedRoute === 'ordersMap') {
    await Promise.allSettled([
      ordersSyncRemoteTimelineOrders({ render: true }),
      ordersWarmLocationSources(force).then(renderOrdersMapView),
      fetchWorkersForCurrentSession(force).then(renderOrdersMapView),
    ])
    return
  }

  if (normalizedRoute === 'managerObjects') {
    await refreshFacilityManagerObjects()
    return
  }

  if (normalizedRoute === 'clientsList' || normalizedRoute === 'clientProfile') {
    await fetchClientProfileForCurrentSession(force)
    return
  }

  if (normalizedRoute === 'clientProfileDetails') {
    await Promise.allSettled([
      fetchClientProfileDetailForCurrentSession(force),
      fetchWorkersForCurrentSession(force).then(renderClientProfileDetailView),
      fetchZonesForCurrentSession(force).then(renderClientProfileDetailView),
      calendarSyncRemoteTasks({ render: false }).then(renderClientProfileDetailView),
      ordersSyncRemoteTimelineOrders({ render: false }).then(renderClientProfileDetailView),
    ])
    return
  }

  if (normalizedRoute === 'zones') {
    await fetchZonesForCurrentSession(force)
    return
  }

  if (normalizedRoute === 'workerTime') {
    await fetchWorkersForCurrentSession(force)
    return
  }

  if (normalizedRoute === 'workerProfile') {
    await fetchWorkerProfilesForCurrentSession(force)
    return
  }

  if (normalizedRoute === 'workerAccount') {
    await fetchWorkerAccountForCurrentSession(force)
    return
  }

  if (normalizedRoute === 'workerTimeDetail') {
    await fetchWorkerDetailForCurrentSession({ forceRefresh: force })
    return
  }

  if (normalizedRoute === 'workdayStopProposals') {
    await refreshWorkdayStopProposals()
    return
  }

  if (normalizedRoute === 'reports') {
    await ensureReportsViewReady()
    return
  }

}

async function syncRouteData(route, options = {}) {
  const normalizedRoute = routeSyncKey(route)
  if (!appState.session?.orgId) return null

  const policy = normalizeRouteSyncPolicy(options.policy)
  const force = policy === ROUTE_SYNC_POLICY_FORCE || options.forceRefresh === true
  const background = policy === ROUTE_SYNC_POLICY_BACKGROUND
  const meta = getRouteSyncMeta(normalizedRoute)
  if (meta.inFlight && !force) {
    return meta.inFlight
  }
  const hasUsableData = routeHasUsableData(normalizedRoute)
  const shouldRefresh = force || !hasUsableData || shouldRefreshRoute(normalizedRoute, options.staleMs)

  if (!shouldRefresh) {
    return null
  }

  const task = () => syncRouteDataNow(normalizedRoute, {
    force,
    background: background || (policy === ROUTE_SYNC_POLICY_STALE_FIRST && hasUsableData && !force),
  })

  if (background || (policy === ROUTE_SYNC_POLICY_STALE_FIRST && hasUsableData && !force)) {
    return runRouteBackgroundSync(normalizedRoute, task, {
      noticeOnError: options.noticeOnError === true,
    })
  }

  const useGlobalOverlay = normalizedRoute !== 'dashboard'
  const inFlight = runRouteSync(task, {
    route: normalizedRoute,
    label: 'Synchronizuje dane...',
    noticeOnError: options.noticeOnError !== false,
    showOverlay: options.showOverlay ?? useGlobalOverlay,
  }).finally(() => {
    const latest = getRouteSyncMeta(normalizedRoute)
    if (latest.inFlight === inFlight) {
      latest.inFlight = null
    }
  })
  meta.inFlight = inFlight
  return inFlight
}


export function mountPortalApp() {
  const host = document.getElementById('portalAppRoot')
  if (!host) {
    return () => {}
  }

  cleanupRetiredSettingsStorage()
  host.innerHTML = portalLayoutTemplate
  pendingRegistration = capturePendingRegistrationEntry()
  if (pendingRegistration?.registrationId) setOrganizationAuthScope()
  activeRegistrationAttempt = null
  pendingRegistrationNeedsVerification = false
  portalFeatureContext = createPortalFeatureContext()

  const handleRouteShellChange = (route) => {
    appState.currentRoute = String(route ?? '').trim()
    writeStoredCurrentRoute(appState.currentRoute)
    if (normalizeNavigationRoute(appState.currentRoute) !== 'reports') {
      setReportsSidebarSection('')
    }
    if (dashboardFeature && appState.currentRoute !== 'dashboard') {
      dashboardHideMetricPopover()
    }
    if (calendarFeature && appState.currentRoute !== 'calendar') {
      calendarTimelineHideStatusAlert()
    }
    if (eventsFeature && normalizeNavigationRoute(appState.currentRoute) !== 'events') {
      stopEventsPolling()
    }
    if (dashboardFeature) {
      dashboardSyncLoadingOverlay()
    }
    window.setTimeout(flushPortalDeferredNotifications, 0)
  }

  const runPortalRouteAfterReady = async (route) => {
    const routeName = normalizeNavigationRoute(route)

    if (routeName === 'dashboard') {
      renderDashboardKanbanTasks()
      await syncRouteData(routeName)
      startDashboardAutoRefresh()
      return
    }

    if (routeName === 'calendar') {
      calendarMarkRouteEnter()
      renderCalendarView()
      await syncRouteData(routeName)
      return
    }

    if (routeName === 'kanban') {
      renderKanbanView()
      await syncRouteData(routeName)
      return
    }

    if (routeName === 'contractProfitability') {
      await syncRouteData(routeName)
      return
    }

    if (routeName === 'events') {
      await syncRouteData(routeName)
      startEventsPolling()
      return
    }

    if (routeName === 'orders') {
      renderOrdersView()
      await syncRouteData(routeName)
      return
    }

    if (routeName === 'ordersMap') {
      renderOrdersMapView()
      await syncRouteData(routeName)
      return
    }

    if (routeName === 'managerObjects') {
      await syncRouteData(routeName)
      return
    }

    if (routeName === 'zones') {
      await syncRouteData(routeName)
      return
    }

    if (routeName === 'workerTime') {
      await syncRouteData(routeName)
      return
    }

    if (routeName === 'workerProfile') {
      await syncRouteData(routeName)
      return
    }

    if (routeName === 'workerAccount') {
      await syncRouteData(routeName)
      return
    }

    if (routeName === 'clientProfile') {
      await syncRouteData(routeName)
      return
    }

    if (routeName === 'clientProfileDetails') {
      renderClientProfileDetailView()
      await syncRouteData(routeName)
      return
    }

    if (routeName === 'workerTimeDetail') {
      await syncRouteData(routeName)
      return
    }

    if (routeName === 'workdayStopProposals') {
      await syncRouteData(routeName)
      return
    }

    if (routeName === 'reports') {
      await syncRouteData(routeName)
      return
    }

    if (PORTAL_SETTINGS_ROUTES.has(routeName)) {
      renderSettingsView(routeName)
      return
    }
  }

  const router = createRouter((route) => {
    handleRouteShellChange(route)
  })

  const navigatePortalRoute = async (route, options = {}) => {
    const nextRoute = normalizeNavigationRoute(route)
    const currentRoute = normalizeNavigationRoute(router.getCurrentRoute?.() || appState.currentRoute)
    const showTransition = options.showTransition !== false && (nextRoute !== currentRoute || !portalRouteIsReady(nextRoute))
    const endTransition = showTransition
      ? beginRouteSync('Synchronizuje dane...', {
          delayMs: ROUTE_TRANSITION_OVERLAY_DELAY_MS,
          minVisibleMs: ROUTE_TRANSITION_MIN_VISIBLE_MS,
        })
      : () => {}
    const runId = ++portalNavigationRunId

    try {
      if (showTransition) {
        showPortalRouteLoading(nextRoute)
      }
      router.go(route)
      await waitForRoutePaint()
      if (runId !== portalNavigationRunId || normalizeNavigationRoute(router.getCurrentRoute?.()) !== nextRoute) {
        return false
      }
      await ensurePortalRouteReady(nextRoute, navigation)
      if (runId !== portalNavigationRunId || normalizeNavigationRoute(router.getCurrentRoute?.()) !== nextRoute) {
        return false
      }
      await runPortalRouteAfterReady(nextRoute)
      return true
    } catch (error) {
      console.warn('[portal/route] failed to load route', nextRoute, error)
      showPortalRouteLoadError(nextRoute, error)
      showPortalErrorNotice('Nie udało się wczytać sekcji', error)
      return false
    } finally {
      if (showTransition) {
        finishAfterNextRoutePaint(endTransition)
      }
    }
  }

  const navigation = {
    go: navigatePortalRoute,
    getCurrentRoute: router.getCurrentRoute,
  }

  const handleVisibilityChange = () => {
    if (document.visibilityState !== 'visible') {
      return
    }
    flushPortalDeferredNotifications()
    if (normalizeNavigationRoute(appState.currentRoute) === 'events') {
      void refreshEventsForActiveRoute()
      return
    }
    void syncRouteData(appState.currentRoute, { noticeOnError: false, policy: ROUTE_SYNC_POLICY_BACKGROUND, showOverlay: false })
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)
  const handlePageShow = () => {
    if (document.visibilityState === 'visible') {
      if (normalizeNavigationRoute(appState.currentRoute) === 'events') {
        void refreshEventsForActiveRoute()
        return
      }
      void syncRouteData(appState.currentRoute, { noticeOnError: false, policy: ROUTE_SYNC_POLICY_BACKGROUND, showOverlay: false })
    }
  }
  window.addEventListener('pageshow', handlePageShow)
  const handlePortalWorkdayUpdated = () => {
    markDashboardRouteStale()
    if (normalizeNavigationRoute(appState.currentRoute) === 'dashboard') {
      void syncRouteData('dashboard', {
        forceRefresh: true,
        noticeOnError: false,
        showOverlay: false,
      })
    }
  }
  window.addEventListener('portal:workday-updated', handlePortalWorkdayUpdated)
  const handlePortalInteractionSettled = () => schedulePortalDeferredNotificationFlush(250)
  document.addEventListener('focusout', handlePortalInteractionSettled)
  document.addEventListener('change', handlePortalInteractionSettled)
  window.addEventListener('reports-section-change', handleReportsSectionChange)

  portalNavigation = navigation

  const cleanups = [
    bindSidebarCollapseToggle(),
    setupFloatingTableScrollbar(),
    bindSubmenuToggles(),
    bindSidebarGlobalSearch(navigation),
    bindRouteButtons(navigation),
    bindPlatformLogin(navigation),
    bindPlatformCenter(navigation),
    bindCompanyProfileOnboarding(),
    bindTenantOrganizationSwitcher(),
    bindLogout(),
    cleanupPortalLazyRoutes,
    () => document.removeEventListener('visibilitychange', handleVisibilityChange),
    () => window.removeEventListener('pageshow', handlePageShow),
    () => window.removeEventListener('portal:workday-updated', handlePortalWorkdayUpdated),
    () => document.removeEventListener('focusout', handlePortalInteractionSettled),
    () => document.removeEventListener('change', handlePortalInteractionSettled),
    () => window.removeEventListener('reports-section-change', handleReportsSectionChange),
    calendarStopTimelineWorkerStatusRefresh,
  ]

  let portalDisposed = false
  window.go = navigatePortalRoute

  void (async () => {
    showLoginScreen()
    showLoginCredentials()
    setUserChip(null)
    void refreshCleaningCompanyRegistrationAvailability()
    if (isCleaningCompanyEmailLink()) {
      showLoginCompanyEmailLinkConfirmation(getStoredCleaningCompanyEmailLinkEmail())
      setLoginControlsBusy(false)
      return
    }
    setLoginControlsBusy(true, 'Sprawdzanie sesji...')
    const firebaseUser = await waitForFirebaseAuthReady()
    if (portalDisposed) {
      return
    }

    const session = pendingRegistration?.registrationId ? null : requireAuth() ?? getSession()

    if (firebaseUser) {
      try {
        const result = pendingRegistration?.registrationId
          ? await resolveDeferredRegistrationContext()
          : await ensureSessionContext(session)
        if (pendingRegistration?.registrationId && await offerPendingRegistrationChoice(result)) {
          resetPortalState()
          setLoginControlsBusy(false)
          return
        }
        if (result?.status === 'PLATFORM_MFA_ENROLLMENT_REQUIRED') {
          resetPortalState()
          showLoginMfaEnrollment()
          setLoginControlsBusy(false)
          return
        }
        if (result?.status === 'PLATFORM_SELECTION_REQUIRED') {
          resetPortalState()
          await showPlatformOrganizationCenter(navigation)
          setLoginControlsBusy(false)
          return
        }
        if (result?.status === 'ORG_SELECTION_REQUIRED') {
          resetPortalState()
          showLoginOrganizationSelection(result.organizations)
          setLoginControlsBusy(false)
          return
        }
        if (result?.status === 'ORGANIZATION_ONBOARDING_REQUIRED') {
          resetPortalState()
          showLoginOrganizationSelection([])
          setLoginControlsBusy(false)
          return
        }
        if (result?.status === 'EMAIL_VERIFICATION_REQUIRED') {
          resetPortalState()
          showLoginEmailVerification()
          setLoginControlsBusy(false)
          return
        }
        if (result?.status === 'CLEANING_COMPANY_ONBOARDING_REQUIRED') {
          resetPortalState()
          await showCleaningCompanyBasicsOverlay()
          setLoginControlsBusy(false)
          return
        }
        if (result?.status !== 'READY' || !result.session) {
          throw new Error('Nie uda\u0142o si\u0119 odtworzy\u0107 bezpiecznej sesji aplikacji.')
        }
        await activatePortalSession(result.session, navigation, { restoreRoute: true })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Błąd inicjalizacji sesji.'
        console.error(message)
        stopDashboardAutoRefresh()
        if (!pendingRegistration?.registrationId) logout()
        resetPortalState()
        clearStoredCurrentRoute()
        showLoginScreen()
        setUserChip(null)
        syncProfitabilityEntryPermissions()
        setLoginError(pendingRegistration?.registrationId ? formatRegistrationError(error) : formatLoginError(error))
      }
    } else {
      stopDashboardAutoRefresh()
      resetPortalState()
      clearStoredCurrentRoute()
      showLoginScreen()
      showLoginCredentials()
      setUserChip(null)
      syncProfitabilityEntryPermissions()
      if (pendingRegistration?.googleRequested) {
        try {
          if (!isRegistrationApiConfigured()) {
            throw new Error('Portal nie ma skonfigurowanego adresu Registration API.')
          }
          markPendingGoogleAuthStarted()
          pendingRegistration = { ...pendingRegistration, googleRequested: false }
          const result = await loginWithGoogle({ deferContext: true, forceRedirect: true })
          if (result?.status !== 'REDIRECTING') {
            await offerPendingRegistrationChoice(await resolveDeferredRegistrationContext())
          }
          setLoginControlsBusy(false)
          return
        } catch (error) {
          setLoginError(formatRegistrationError(error))
        }
      }
    }
    setLoginControlsBusy(false)
  })()

  return () => {
    portalDisposed = true
    stopEventsPolling()
    stopDashboardAutoRefresh()
    portalDeferredNotifications.clear()
    if (portalDeferredNotificationTimer) {
      window.clearTimeout(portalDeferredNotificationTimer)
      portalDeferredNotificationTimer = 0
    }
    cleanups.forEach((cleanup) => {
      try {
        cleanup()
      } catch {
        // No-op cleanup safety for dev remounts.
      }
    })

    try {
      dashboardFeature?.cleanup?.()
      ordersFeature?.cleanup?.()
      kanbanFeature?.cleanup?.()
      calendarFeature?.cleanup?.()
    } catch {
      // No-op cleanup safety for dev remounts.
    }

    dashboardFeature = null
    clientProfileFeature = null
    ordersFeature = null
    kanbanFeature = null
    calendarFeature = null
    zonesFeature = null
    eventsFeature = null
    reportsFeature = null
    settingsFeature = null
    workerProfileFeature = null
    workerAccountFeature = null
    workerTimeFeature = null
    workerTimeDetailFeature = null
    workdayStopProposalsFeature = null

    if (portalNoticeTimer) {
      window.clearTimeout(portalNoticeTimer)
      portalNoticeTimer = null
    }
    if (routeSyncOverlayTimer) {
      window.clearTimeout(routeSyncOverlayTimer)
      routeSyncOverlayTimer = 0
    }
    routeSyncActiveCount = 0
    routeSyncMeta.clear()
    portalNavigationRunId += 1
    cleanupPortalLazyRoutes()
    setRouteSyncOverlayVisible(false)
    document.getElementById('portalNotice')?.remove()

    host.innerHTML = ''
    delete window.go
  }
}
