import { template as auditsView } from '../features/objects/audits/index.js'
import { template as calendarView } from '../features/calendar/index.js'
import { template as clientProfileView } from '../features/clients/profile/index.js'
import { template as clientProfileDetailsView } from '../features/clients/profile-details/index.js'
import { template as eventsView } from '../features/events/index.js'
import { template as kanbanView } from '../features/kanban/index.js'
import { template as contractProfitabilityView } from '../features/profitability/index.js'
import { template as ordersMapView } from '../features/orders/map/index.js'
import { template as ordersView } from '../features/orders/list/index.js'
import { template as reportsView } from '../features/reports/index.js'
import { template as settingsView } from '../features/settings/index.js'
import { template as workerAccountView } from '../features/workers/account/index.js'
import { template as workerProfileView } from '../features/workers/worker_list_profile/index.js'
import { template as workerTimeView } from '../features/workers/time/index.js'
import { template as workerTimeDetailView } from '../features/workers/time-detail/index.js'
import { template as zonesView } from '../features/objects/zones/index.js'

export const viewTemplates = {
  calendar: calendarView,
  kanban: kanbanView,
  contractProfitability: contractProfitabilityView,
  settings: settingsView,
  events: eventsView,
  orders: ordersView,
  ordersMap: ordersMapView,
  zones: zonesView,
  workerProfile: workerProfileView,
  workerAccount: workerAccountView,
  workerTime: workerTimeView,
  workerTimeDetail: workerTimeDetailView,
  audits: auditsView,
  clientProfile: clientProfileView,
  clientProfileDetails: clientProfileDetailsView,
  reports: reportsView,
}
