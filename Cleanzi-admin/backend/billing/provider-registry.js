'use strict'

const { NoopBillingProvider } = require('./noop-provider')

function text(value) {
  return String(value ?? '').trim()
}

function createBillingProvider(env = process.env) {
  const providerCode = text(env.BILLING_PROVIDER).toUpperCase() || 'NONE'
  if (providerCode === 'NONE' || providerCode === 'MANUAL') return new NoopBillingProvider()
  const error = new Error('BILLING_PROVIDER_NOT_CONFIGURED')
  error.publicCode = 'BILLING_PROVIDER_NOT_CONFIGURED'
  error.publicMessage = `Operator płatności ${providerCode} nie jest jeszcze skonfigurowany.`
  error.statusCode = 503
  throw error
}

module.exports = { createBillingProvider }
