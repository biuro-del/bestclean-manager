import template from './template.html?raw'

export const integrationsSettingsModule = Object.freeze({
  id: 'integrations',
  route: 'settingsIntegrations',
  group: 'organization',
  label: 'Integracje',
  description: 'Połączenia z usługami zewnętrznymi, API i webhooki.',
  icon: 'plugs-connected',
  template,
})
