import { overviewSettingsModule } from './modules/overview/index.js'
import { profileSettingsModule } from './modules/my-account/profile/index.js'
import { notificationsSettingsModule } from './modules/my-account/notifications/index.js'
import { languageAppSettingsModule } from './modules/my-account/language-app/index.js'
import { accountSecuritySettingsModule } from './modules/my-account/account-security/index.js'
import { organizationDataSettingsModule } from './modules/organization/organization-data/index.js'
import { alertsSettingsModule } from './modules/organization/alerts/index.js'
import { integrationsSettingsModule } from './modules/organization/integrations/index.js'
import { billingSettingsModule } from './modules/organization/billing/index.js'
import { securityDataSettingsModule } from './modules/organization/security-data/index.js'

export const SETTINGS_GROUPS = Object.freeze([
  Object.freeze({ id: 'my-account', label: 'Moje konto' }),
  Object.freeze({ id: 'organization', label: 'Organizacja' }),
])

export const SETTINGS_MODULES = Object.freeze([
  overviewSettingsModule,
  profileSettingsModule,
  notificationsSettingsModule,
  languageAppSettingsModule,
  accountSecuritySettingsModule,
  organizationDataSettingsModule,
  alertsSettingsModule,
  integrationsSettingsModule,
  billingSettingsModule,
  securityDataSettingsModule,
])

export const SETTINGS_ROUTES = Object.freeze(SETTINGS_MODULES.map((module) => module.route))

export function settingsModuleForRoute(route) {
  const normalizedRoute = String(route ?? '').trim()
  return SETTINGS_MODULES.find((module) => module.route === normalizedRoute) ?? overviewSettingsModule
}
