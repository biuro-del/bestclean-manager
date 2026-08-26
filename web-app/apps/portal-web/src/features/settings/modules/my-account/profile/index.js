import template from './template.html?raw'

export const profileSettingsModule = Object.freeze({
  id: 'profile',
  route: 'settingsProfile',
  group: 'my-account',
  label: 'Profil',
  description: 'Podstawowe dane i informacje kontaktowe użytkownika.',
  icon: 'user-circle',
  template,
})
