'use strict'

class BillingProviderAdapter {
  constructor(providerCode) {
    this.providerCode = String(providerCode || '').trim().toUpperCase()
  }

  capabilities() {
    return {
      charges: false,
      refunds: false,
      subscriptions: false,
      documents: false,
      webhooks: false,
    }
  }

  async createCustomer() {
    throw new Error('BILLING_PROVIDER_OPERATION_DISABLED')
  }

  async updateSubscription() {
    throw new Error('BILLING_PROVIDER_OPERATION_DISABLED')
  }

  async cancelSubscription() {
    throw new Error('BILLING_PROVIDER_OPERATION_DISABLED')
  }

  async refundPayment() {
    throw new Error('BILLING_PROVIDER_OPERATION_DISABLED')
  }

  async parseWebhook() {
    throw new Error('BILLING_PROVIDER_OPERATION_DISABLED')
  }
}

module.exports = { BillingProviderAdapter }
