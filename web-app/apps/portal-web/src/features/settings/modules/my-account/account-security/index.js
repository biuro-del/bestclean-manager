import template from './template.html?raw'

export const accountSecuritySettingsModule = Object.freeze({
  id: 'account-security',
  route: 'settingsAccountSecurity',
  group: 'my-account',
  label: 'Bezpieczeństwo konta',
  description: 'Hasło, uwierzytelnianie wieloskładnikowe i sesje.',
  icon: 'lock-key',
  template,
})
