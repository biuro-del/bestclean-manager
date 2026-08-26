'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const {
  processStripeEvent,
  resolvePaidSubscriptionUpdate,
  verifyStripeSignature,
} = require('../stripe-webhook')

function signedEvent(event, secret, timestamp) {
  const raw = Buffer.from(JSON.stringify(event))
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest('hex')
  return { raw, header: `t=${timestamp},v1=${signature}` }
}

test('webhook Stripe wymaga poprawnego podpisu i świeżego timestampu', () => {
  const event = { id: 'evt_1', type: 'invoice.paid', data: { object: { subscription: 'sub_1' } } }
  const secret = 'whsec_test'
  const timestamp = 1785492000
  const signed = signedEvent(event, secret, timestamp)
  assert.equal(verifyStripeSignature(signed.raw, signed.header, secret, timestamp).id, 'evt_1')
  assert.throws(() => verifyStripeSignature(signed.raw, signed.header, 'wrong', timestamp), (error) => error.publicCode === 'INVALID_STRIPE_SIGNATURE')
  assert.throws(() => verifyStripeSignature(signed.raw, signed.header, secret, timestamp + 301), (error) => error.publicCode === 'INVALID_STRIPE_SIGNATURE')
})

test('invoice.paid aktywuje wyłącznie aktywną subskrypcję z mapowanym Price ID i orgId', () => {
  const event = { id: 'evt_1', type: 'invoice.paid', data: { object: {} } }
  const subscription = {
    id: 'sub_1',
    status: 'active',
    metadata: { cleanzi_org_id: 'org_1' },
    items: { data: [{ price: { id: 'price_plus' } }] },
    current_period_start: 1785492000,
    current_period_end: 1788170400,
  }
  const update = resolvePaidSubscriptionUpdate(event, subscription, { STRIPE_PRICE_PLUS: 'price_plus' })
  assert.equal(update.orgId, 'org_1')
  assert.equal(update.planCode, 'PLUS')
  assert.equal(update.status, 'ACTIVE')
  assert.throws(
    () => resolvePaidSubscriptionUpdate(event, { ...subscription, status: 'past_due' }, { STRIPE_PRICE_PLUS: 'price_plus' }),
    (error) => error.publicCode === 'STRIPE_SUBSCRIPTION_NOT_ACTIVE',
  )
  assert.throws(
    () => resolvePaidSubscriptionUpdate(event, subscription, { STRIPE_PRICE_PRO: 'price_pro' }),
    (error) => error.publicCode === 'STRIPE_PRICE_NOT_MAPPED',
  )
})

test('nieudana płatność i usunięcie subskrypcji nie ustawiają ACTIVE', () => {
  const subscription = { id: 'sub_1', metadata: { cleanzi_org_id: 'org_1' } }
  assert.equal(
    resolvePaidSubscriptionUpdate({ type: 'invoice.payment_failed', data: { object: {} } }, subscription).status,
    'PAST_DUE',
  )
  assert.equal(
    resolvePaidSubscriptionUpdate({ type: 'customer.subscription.deleted', data: { object: subscription } }, subscription).status,
    'CANCELED',
  )
})

test('powtórzone zdarzenie Stripe jest idempotentnie pomijane', async () => {
  const calls = []
  const client = {
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase()
      calls.push(normalized)
      if (normalized.startsWith('insert into public.billing_provider_event')) return { rows: [] }
      return { rows: [] }
    },
  }
  const event = { id: 'evt_duplicate', type: 'customer.updated', data: { object: { id: 'cus_1' } } }
  const result = await processStripeEvent(client, event)
  assert.deepEqual(result, {
    duplicate: true,
    processed: false,
    eventId: 'evt_duplicate',
    eventType: 'customer.updated',
  })
  assert.deepEqual(calls, ['begin', calls[1], 'rollback'])
})
