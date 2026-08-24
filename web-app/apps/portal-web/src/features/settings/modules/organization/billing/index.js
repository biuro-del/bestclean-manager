import template from './template.html?raw'

export const billingSettingsModule = Object.freeze({
  id: 'billing',
  route: 'settingsBilling',
  group: 'organization',
  label: 'Subskrypcja i rozliczenia',
  description: 'Plan, cykl rozliczeniowy, dane billingowe i faktury.',
  icon: 'credit-card',
  template,
})
