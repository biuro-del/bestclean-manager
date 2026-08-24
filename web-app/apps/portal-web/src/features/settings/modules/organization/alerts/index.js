import template from './template.html?raw'

export const alertsSettingsModule = Object.freeze({
  id: 'alerts',
  route: 'settingsAlerts',
  group: 'organization',
  label: 'Alerty',
  description: 'Reguły alertów operacyjnych, odbiorcy i kanały.',
  icon: 'warning-circle',
  template,
})
