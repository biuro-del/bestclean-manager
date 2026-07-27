'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const configUrl = pathToFileURL(
  path.resolve(__dirname, '..', 'web-app', 'vite.config.js'),
).href

test('Vite dopuszcza tylko kanoniczny host sesji Cleanzi', async () => {
  const {
    normalizeAuthSessionProxyTarget,
    resolveAuthSessionProxySecure,
  } = await import(configUrl)

  assert.equal(normalizeAuthSessionProxyTarget(''), '')
  assert.equal(
    normalizeAuthSessionProxyTarget(' https://portal.cleanzi.pl/ '),
    'https://portal.cleanzi.pl',
  )

  for (const target of [
    'http://portal.cleanzi.pl',
    'https://example.com',
    'https://portal.cleanzi.pl.evil.example',
    'https://user:pass@portal.cleanzi.pl',
    'https://portal.cleanzi.pl/api',
    'https://portal.cleanzi.pl/?next=https://example.com',
  ]) {
    assert.throws(
      () => normalizeAuthSessionProxyTarget(target),
      /VITE_DEV_AUTH_API_PROXY_TARGET_(?:INVALID|NOT_ALLOWED)/,
      target,
    )
  }

  assert.equal(resolveAuthSessionProxySecure(''), true)
  assert.equal(resolveAuthSessionProxySecure('true'), true)
  assert.equal(resolveAuthSessionProxySecure('0'), false)
  assert.equal(resolveAuthSessionProxySecure('false'), false)
  assert.throws(
    () => resolveAuthSessionProxySecure('sometimes'),
    /VITE_DEV_AUTH_PROXY_TLS_SETTING_INVALID/,
  )
})

test('Vite umieszcza waski proxy sesji przed ogolnym proxy API', async () => {
  const originalTarget = process.env.VITE_DEV_AUTH_API_PROXY_TARGET
  const originalGate = process.env.DEV_AUTH_SESSION_PROXY_ENABLED
  process.env.VITE_DEV_AUTH_API_PROXY_TARGET = 'https://portal.cleanzi.pl'
  process.env.DEV_AUTH_SESSION_PROXY_ENABLED = '1'

  try {
    const { default: createConfig } = await import(configUrl)
    const config = createConfig({ mode: 'portal' })
    const proxyEntries = Object.entries(config.server.proxy)
    const authIndex = proxyEntries.findIndex(
      ([pattern]) => pattern === '^/api/auth/session-context(?:\\?.*)?$',
    )
    const genericIndex = proxyEntries.findIndex(([pattern]) => pattern === '/api')

    assert.ok(authIndex >= 0)
    assert.ok(genericIndex >= 0)
    assert.ok(authIndex < genericIndex)
    const proxyConfig = proxyEntries[authIndex][1]
    assert.equal(proxyConfig.target, 'https://portal.cleanzi.pl')
    assert.equal(proxyConfig.changeOrigin, true)
    assert.equal(proxyConfig.secure, true)
    assert.equal(proxyConfig.followRedirects, false)

    const allowedResult = proxyConfig.bypass(
      { method: 'POST', url: '/api/auth/session-context' },
      {},
    )
    assert.equal(allowedResult, undefined)

    let rejectedStatus = 0
    let rejectedBody = ''
    const rejectedResult = proxyConfig.bypass(
      { method: 'PUT', url: '/api/auth/session-context' },
      {
        writeHead: (status) => {
          rejectedStatus = status
        },
        end: (body) => {
          rejectedBody = body
        },
      },
    )
    assert.equal(rejectedResult, '/api/auth/session-context')
    assert.equal(rejectedStatus, 405)
    assert.match(rejectedBody, /METHOD_NOT_ALLOWED/)

    const proxyHandlers = {}
    proxyConfig.configure({
      on: (event, handler) => {
        proxyHandlers[event] = handler
      },
    })

    const removedHeaders = []
    proxyHandlers.proxyReq({
      removeHeader: (name) => removedHeaders.push(name),
    })
    assert.deepEqual(removedHeaders.sort(), [
      'cookie',
      'forwarded',
      'proxy-authorization',
      'x-forwarded-for',
      'x-forwarded-host',
      'x-forwarded-port',
      'x-forwarded-proto',
      'x-forwarded-server',
      'x-real-ip',
    ])
    assert.equal(removedHeaders.includes('authorization'), false)

    const proxyResponse = {
      headers: {
        'content-type': 'application/json',
        'set-cookie': ['session=should-not-reach-localhost'],
      },
    }
    proxyHandlers.proxyRes(proxyResponse)
    assert.equal(proxyResponse.headers['set-cookie'], undefined)
    assert.equal(proxyResponse.headers['cache-control'], 'no-store')
  } finally {
    if (originalTarget === undefined) {
      delete process.env.VITE_DEV_AUTH_API_PROXY_TARGET
    } else {
      process.env.VITE_DEV_AUTH_API_PROXY_TARGET = originalTarget
    }
    if (originalGate === undefined) {
      delete process.env.DEV_AUTH_SESSION_PROXY_ENABLED
    } else {
      process.env.DEV_AUTH_SESSION_PROXY_ENABLED = originalGate
    }
  }
})

test('sam target bez jawnego gate nie wlacza proxy sesji', async () => {
  const originalTarget = process.env.VITE_DEV_AUTH_API_PROXY_TARGET
  const originalGate = process.env.DEV_AUTH_SESSION_PROXY_ENABLED
  process.env.VITE_DEV_AUTH_API_PROXY_TARGET = 'https://portal.cleanzi.pl'
  delete process.env.DEV_AUTH_SESSION_PROXY_ENABLED

  try {
    const { default: createConfig } = await import(configUrl)
    const config = createConfig({ mode: 'portal' })
    assert.equal(
      Object.keys(config.server.proxy).includes('^/api/auth/session-context(?:\\?.*)?$'),
      false,
    )
  } finally {
    if (originalTarget === undefined) {
      delete process.env.VITE_DEV_AUTH_API_PROXY_TARGET
    } else {
      process.env.VITE_DEV_AUTH_API_PROXY_TARGET = originalTarget
    }
    if (originalGate === undefined) {
      delete process.env.DEV_AUTH_SESSION_PROXY_ENABLED
    } else {
      process.env.DEV_AUTH_SESSION_PROXY_ENABLED = originalGate
    }
  }
})

test('jawny lokalny wyjątek TLS dotyczy wyłącznie włączonego proxy sesji', async () => {
  const originalTarget = process.env.VITE_DEV_AUTH_API_PROXY_TARGET
  const originalGate = process.env.DEV_AUTH_SESSION_PROXY_ENABLED
  const originalTls = process.env.DEV_AUTH_SESSION_PROXY_TLS_REJECT_UNAUTHORIZED
  process.env.VITE_DEV_AUTH_API_PROXY_TARGET = 'https://portal.cleanzi.pl'
  process.env.DEV_AUTH_SESSION_PROXY_ENABLED = '1'
  process.env.DEV_AUTH_SESSION_PROXY_TLS_REJECT_UNAUTHORIZED = '0'

  try {
    const { default: createConfig } = await import(configUrl)
    const config = createConfig({ mode: 'portal' })
    const proxyConfig = config.server.proxy['^/api/auth/session-context(?:\\?.*)?$']

    assert.ok(proxyConfig)
    assert.equal(proxyConfig.target, 'https://portal.cleanzi.pl')
    assert.equal(proxyConfig.secure, false)
  } finally {
    if (originalTarget === undefined) {
      delete process.env.VITE_DEV_AUTH_API_PROXY_TARGET
    } else {
      process.env.VITE_DEV_AUTH_API_PROXY_TARGET = originalTarget
    }
    if (originalGate === undefined) {
      delete process.env.DEV_AUTH_SESSION_PROXY_ENABLED
    } else {
      process.env.DEV_AUTH_SESSION_PROXY_ENABLED = originalGate
    }
    if (originalTls === undefined) {
      delete process.env.DEV_AUTH_SESSION_PROXY_TLS_REJECT_UNAUTHORIZED
    } else {
      process.env.DEV_AUTH_SESSION_PROXY_TLS_REJECT_UNAUTHORIZED = originalTls
    }
  }
})
