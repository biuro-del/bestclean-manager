import template from './template.html?raw'

export const overviewSettingsModule = Object.freeze({
  id: 'overview',
  route: 'settings',
  group: 'overview',
  label: 'Przegląd ustawień',
  description: 'Wszystkie ustawienia konta i organizacji w jednym miejscu.',
  icon: 'squares-four',
  template,
})
