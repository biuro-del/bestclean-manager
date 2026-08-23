'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { pathToFileURL } = require('node:url')

const policyModuleUrl = pathToFileURL(path.join(
  __dirname,
  '..',
  'web-app',
  'apps',
  'portal-web',
  'src',
  'auth',
  'authEmailDeliveryPolicy.js',
)).href

test('auth email delivery is enabled by default only for the canonical production project', async () => {
  const { resolveAuthEmailDeliveryPolicy } = await import(policyModuleUrl)

  assert.deepEqual(
    resolveAuthEmailDeliveryPolicy({ projectId: 'iclean-room', mode: '' }),
    { allowed: true, code: 'AUTH_EMAIL_DELIVERY_ALLOWED_PRODUCTION' },
  )
  assert.deepEqual(
    resolveAuthEmailDeliveryPolicy({ projectId: 'cleanzi-portal-klienta-test', mode: '' }),
    { allowed: false, code: 'AUTH_EMAIL_TEST_DELIVERY_BLOCKED' },
  )
  assert.deepEqual(
    resolveAuthEmailDeliveryPolicy({ projectId: 'iclean-room', mode: 'disabled' }),
    { allowed: false, code: 'AUTH_EMAIL_DELIVERY_DISABLED' },
  )
})

test('a non-production Firebase project requires an explicit test-delivery override', async () => {
  const { resolveAuthEmailDeliveryPolicy } = await import(policyModuleUrl)

  assert.deepEqual(
    resolveAuthEmailDeliveryPolicy({
      projectId: 'cleanzi-portal-klienta-test',
      mode: 'firebase-test-explicit',
    }),
    { allowed: true, code: 'AUTH_EMAIL_DELIVERY_ALLOWED_TEST_EXPLICIT' },
  )
  assert.deepEqual(
    resolveAuthEmailDeliveryPolicy({ projectId: '', mode: '' }),
    { allowed: false, code: 'AUTH_EMAIL_TEST_DELIVERY_BLOCKED' },
  )
})
