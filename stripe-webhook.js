'use strict'

const crypto = require('node:crypto')
const { PAID_PLAN_CODES, assertCanonicalPlanCode } = require('./plan-policy')
const { profileCompleteness, profileFromRow, publicError } = require('./organization-onboarding')

const STRIPE_TOLERANCE_SECONDS = 300
const SUPPORTED_STRIPE_EVENTS = Object.freeze([
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.deleted',
])

function text(value) {
  return String(value ?? '').trim()
}

function timingSafeHexEqual(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}

function parseStripeSignatureHeader(value) {
  const result = { timestamp: 0, signatures: [] }
  for (const part of text(value).split(',')) {
    const [key, rawValue] = part.split('=', 2)
    if (key === 't' && /^\d+$/.test(rawValue || '')) result.timestamp = Number(rawValue)
    if (key === 'v1' && rawValue) result.signatures.push(rawValue)
  }
  return result
}

/**
 * Verifies the raw Stripe payload before any database work is performed.
 * @param {Buffer|string} rawBody
 * @param {unknown} signatureHeader
 * @param {unknown} secret
 * @param {number} nowSeconds
 */
function verifyStripeSignature(rawBody, signatureHeader, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const webhookSecret = text(secret)
  if (!webhookSecret) throw publicError(503, 'STRIPE_NOT_CONFIGURED', 'Webhook Stripe nie jest skonfigurowany.')
  const parsed = parseStripeSignatureHeader(signatureHeader)
  if (!parsed.timestamp || Math.abs(nowSeconds - parsed.timestamp) > STRIPE_TOLERANCE_SECONDS) {
    throw publicError(400, 'INVALID_STRIPE_SIGNATURE', 'Podpis webhooka Stripe jest nieprawidłowy lub wygasł.')
  }
  const payload = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || '')
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(`${parsed.timestamp}.`)
    .update(payload)
    .digest('hex')
  if (!parsed.signatures.some((signature) => timingSafeHexEqual(signature, expected))) {
    throw publicError(400, 'INVALID_STRIPE_SIGNATURE', 'Podpis webhooka Stripe jest nieprawidłowy.')
  }
  let event
  try {
    event = JSON.parse(payload.toString('utf8'))
  } catch {
    throw publicError(400, 'INVALID_STRIPE_EVENT', 'Webhook Stripe nie zawiera poprawnego JSON.')
  }
  if (!text(event?.id) || !text(event?.type) || !event?.data?.object) {
    throw publicError(400, 'INVALID_STRIPE_EVENT', 'Webhook Stripe ma niepełną strukturę.')
  }
  return event
}

function stripePricePlanMap(env = process.env) {
  return new Map([
    [text(env.STRIPE_PRICE_GO_PLUS), 'GO_PLUS'],
    [text(env.STRIPE_PRICE_PLUS), 'PLUS'],
    [text(env.STRIPE_PRICE_PRO), 'PRO'],
  ].filter(([priceId]) => priceId))
}

function subscriptionIdFromEvent(event) {
  const object = event?.data?.object || {}
  if (text(event?.type).startsWith('customer.subscription.')) return text(object.id)
  return text(
    object.subscription ||
    object.parent?.subscription_details?.subscription ||
    object.subscription_details?.subscription,
  )
}

function metadataOrganizationId(metadata = {}) {
  return text(metadata.cleanzi_org_id || metadata.org_id || metadata.organization_id)
}

function priceIdFromSubscription(subscription = {}) {
  const item = Array.isArray(subscription?.items?.data) ? subscription.items.data[0] : null
  return text(item?.price?.id || item?.plan?.id)
}

async function fetchStripeSubscription(subscriptionId, { secretKey, fetchImpl = globalThis.fetch } = {}) {
  if (!text(secretKey)) throw publicError(503, 'STRIPE_NOT_CONFIGURED', 'Brak serwerowego klucza Stripe.')
  if (!text(subscriptionId)) throw publicError(400, 'STRIPE_SUBSCRIPTION_REQUIRED', 'Zdarzenie nie wskazuje subskrypcji Stripe.')
  if (typeof fetchImpl !== 'function') throw publicError(503, 'STRIPE_UNAVAILABLE', 'Stripe jest chwilowo niedostępny.')
  const response = await fetchImpl(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: `Bearer ${text(secretKey)}` },
    signal: AbortSignal.timeout(8000),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw publicError(502, 'STRIPE_SUBSCRIPTION_LOOKUP_FAILED', 'Nie udało się potwierdzić subskrypcji Stripe.')
  return body
}

function secondsToDate(value) {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : null
}

function resolvePaidSubscriptionUpdate(event, subscription, env = process.env) {
  const type = text(event?.type)
  const orgId = metadataOrganizationId(subscription?.metadata)
  if (!/^[a-z0-9_-]{1,64}$/i.test(orgId)) {
    throw publicError(400, 'STRIPE_ORGANIZATION_REQUIRED', 'Subskrypcja Stripe nie ma poprawnego identyfikatora organizacji.')
  }
  const subscriptionId = text(subscription?.id) || subscriptionIdFromEvent(event)
  if (!subscriptionId) throw publicError(400, 'STRIPE_SUBSCRIPTION_REQUIRED', 'Brak identyfikatora subskrypcji Stripe.')

  if (type === 'invoice.paid') {
    if (text(subscription?.status).toLowerCase() !== 'active') {
      throw publicError(409, 'STRIPE_SUBSCRIPTION_NOT_ACTIVE', 'Płatność nie dotyczy aktywnej subskrypcji Stripe.')
    }
    const mappedPlanCode = stripePricePlanMap(env).get(priceIdFromSubscription(subscription))
    if (!mappedPlanCode) {
      throw publicError(409, 'STRIPE_PRICE_NOT_MAPPED', 'Cena Stripe nie jest przypisana do płatnego planu Cleanzi.')
    }
    const planCode = assertCanonicalPlanCode(mappedPlanCode)
    if (!PAID_PLAN_CODES.includes(planCode)) {
      throw publicError(409, 'STRIPE_PRICE_NOT_PAID', 'Cena Stripe nie wskazuje płatnego planu Cleanzi.')
    }
    return {
      orgId,
      subscriptionId,
      planCode,
      status: 'ACTIVE',
      currentPeriodStartsAt: secondsToDate(subscription.current_period_start),
      currentPeriodEndsAt: secondsToDate(subscription.current_period_end),
    }
  }
  if (type === 'invoice.payment_failed') {
    return { orgId, subscriptionId, planCode: '', status: 'PAST_DUE' }
  }
  if (type === 'customer.subscription.deleted') {
    return { orgId, subscriptionId, planCode: '', status: 'CANCELED' }
  }
  return null
}

/**
 * Applies one verified Stripe event transactionally and idempotently.
 * @param {import('pg').PoolClient} client
 * @param {object} event
 * @param {{secretKey?:string,env?:object,fetchImpl?:Function}} options
 */
async function processStripeEvent(client, event, options = {}) {
  const eventId = text(event?.id)
  const eventType = text(event?.type)
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex')
  const supported = SUPPORTED_STRIPE_EVENTS.includes(eventType)

  let subscription = event?.data?.object
  if (supported && !eventType.startsWith('customer.subscription.')) {
    subscription = await fetchStripeSubscription(subscriptionIdFromEvent(event), options)
  }
  const update = supported ? resolvePaidSubscriptionUpdate(event, subscription, options.env) : null

  await client.query('begin')
  try {
    const inserted = await client.query(
      `insert into public.billing_provider_event (
         provider_code, event_id, event_type, org_id, status, payload_hash, received_at
       ) values ('STRIPE', $1::text, $2::text, $3::text, 'RECEIVED', $4::text, now())
       on conflict (provider_code, event_id) do nothing
       returning event_id`,
      [eventId, eventType, update?.orgId || null, payloadHash],
    )
    if (!inserted.rows[0]) {
      await client.query('rollback')
      return { duplicate: true, processed: false, eventId, eventType }
    }

    if (!update) {
      await client.query(
        `update public.billing_provider_event
            set status = 'IGNORED', processed_at = now()
          where provider_code = 'STRIPE' and event_id = $1::text`,
        [eventId],
      )
      await client.query('commit')
      return { duplicate: false, processed: false, eventId, eventType }
    }

    if (update.status === 'ACTIVE') {
      const profileResult = await client.query(
        `select * from public.organization_profile where org_id = $1::text limit 1`,
        [update.orgId],
      )
      if (!profileResult.rows[0] || !profileCompleteness(profileFromRow(profileResult.rows[0]), update.planCode).completeForPlan) {
        throw publicError(409, 'BILLING_PROFILE_INCOMPLETE', 'Uzupełnij dane rozliczeniowe przed aktywacją płatnego planu.')
      }
    }

    const updated = await client.query(
      `update public.organization_subscription
          set plan_code = case when $2::text = '' then plan_code else $2::text end,
              status = $3::text,
              provider_code = 'STRIPE',
              provider_subscription_id = $4::text,
              current_period_starts_at = coalesce($5::timestamptz, current_period_starts_at),
              current_period_ends_at = coalesce($6::timestamptz, current_period_ends_at),
              activated_at = case when $3::text = 'ACTIVE' then coalesce(activated_at, now()) else activated_at end,
              canceled_at = case when $3::text = 'CANCELED' then now() else null end,
              version = version + 1,
              updated_at = now()
        where org_id = $1::text
          and (provider_subscription_id is null or provider_subscription_id = $4::text)
        returning org_id, plan_code, status, version`,
      [
        update.orgId, update.planCode, update.status, update.subscriptionId,
        update.currentPeriodStartsAt || null, update.currentPeriodEndsAt || null,
      ],
    )
    if (!updated.rows[0]) {
      throw publicError(
        409,
        'STRIPE_ORGANIZATION_SUBSCRIPTION_MISMATCH',
        'Organizacja nie istnieje albo jest już powiązana z inną subskrypcją Stripe.',
      )
    }
    await client.query(
      `update public.billing_provider_event
          set status = 'PROCESSED', processed_at = now()
        where provider_code = 'STRIPE' and event_id = $1::text`,
      [eventId],
    )
    await client.query('commit')
    return { duplicate: false, processed: true, eventId, eventType, subscription: updated.rows[0] }
  } catch (error) {
    await client.query('rollback').catch(() => {})
    throw error
  }
}

module.exports = {
  STRIPE_TOLERANCE_SECONDS,
  SUPPORTED_STRIPE_EVENTS,
  fetchStripeSubscription,
  parseStripeSignatureHeader,
  processStripeEvent,
  resolvePaidSubscriptionUpdate,
  stripePricePlanMap,
  subscriptionIdFromEvent,
  verifyStripeSignature,
}
