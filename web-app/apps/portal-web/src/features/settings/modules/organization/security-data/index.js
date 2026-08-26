import template from './template.html?raw'

export const securityDataSettingsModule = Object.freeze({
  id: 'security-data',
  route: 'settingsDataSecurity',
  group: 'organization',
  label: 'Bezpieczeństwo i dane',
  description: 'Retencja, dostęp oraz operacje na danych organizacji.',
  icon: 'shield-check',
  template,
})
