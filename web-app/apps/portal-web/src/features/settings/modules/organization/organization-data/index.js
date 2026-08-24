import template from './template.html?raw'

export const organizationDataSettingsModule = Object.freeze({
  id: 'organization-data',
  route: 'settingsOrganizationData',
  group: 'organization',
  label: 'Dane organizacji',
  description: 'Dane rejestrowe, kontaktowe i adres organizacji.',
  icon: 'buildings',
  template,
})
