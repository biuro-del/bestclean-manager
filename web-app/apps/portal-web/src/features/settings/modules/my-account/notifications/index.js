import template from './template.html?raw'

export const notificationsSettingsModule = Object.freeze({
  id: 'notifications',
  route: 'settingsNotifications',
  group: 'my-account',
  label: 'Powiadomienia',
  description: 'Kanały, zakres i czas otrzymywania powiadomień.',
  icon: 'bell',
  template,
})
