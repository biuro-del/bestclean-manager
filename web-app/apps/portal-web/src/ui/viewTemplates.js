import auditsView from './templates/view-audits.html?raw'
import calendarView from './templates/view-calendar.html?raw'
import clientProfileView from './templates/view-client-profile.html?raw'
import clientProfileDetailsView from './templates/view-client-profile-details.html?raw'
import clientsListView from './templates/view-clients-list.html?raw'
import eventsView from './templates/view-events.html?raw'
import individualOrdersView from './templates/view-individual-orders.html?raw'
import kanbanView from './templates/view-kanban.html?raw'
import ordersMapView from './templates/view-orders-map.html?raw'
import ordersView from './templates/view-orders.html?raw'
import reportsView from './templates/view-reports.html?raw'
import scheduleView from './templates/view-schedule.html?raw'
import settingsBackupView from './templates/view-settings-backup.html?raw'
import workerProfileView from './templates/view-worker-profile.html?raw'
import workerTimeView from './templates/view-worker-time.html?raw'
import workerTimeDetailView from './templates/view-worker-time-detail.html?raw'
import zonesView from './templates/view-zones.html?raw'

export const viewTemplates = {
  schedule: scheduleView,
  calendar: calendarView,
  kanban: kanbanView,
  settings: settingsBackupView,
  events: eventsView,
  orders: ordersView,
  ordersMap: ordersMapView,
  zones: zonesView,
  workerProfile: workerProfileView,
  workerTime: workerTimeView,
  workerTimeDetail: workerTimeDetailView,
  clientsList: clientsListView,
  audits: auditsView,
  individualOrders: individualOrdersView,
  clientProfile: clientProfileView,
  clientProfileDetails: clientProfileDetailsView,
  reports: reportsView,
}
