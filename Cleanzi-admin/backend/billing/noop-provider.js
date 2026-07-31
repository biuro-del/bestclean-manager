'use strict'

const { BillingProviderAdapter } = require('./provider-adapter')

class NoopBillingProvider extends BillingProviderAdapter {
  constructor() {
    super('NONE')
  }
}

module.exports = { NoopBillingProvider }
