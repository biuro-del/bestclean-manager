import template from './template.html?raw'

export const languageAppSettingsModule = Object.freeze({
  id: 'language-app',
  route: 'settingsLanguageApp',
  group: 'my-account',
  label: 'Język i aplikacja',
  description: 'Język, strefa czasowa i preferencje wyświetlania.',
  icon: 'globe-hemisphere-west',
  template,
})
