'use strict'

const crypto = require('node:crypto')
const { AsyncLocalStorage } = require('node:async_hooks')

const requestStorage = new AsyncLocalStorage()

function text(value) {
  return String(value ?? '').trim()
}

function firstForwardedAddress(value) {
  return text(value).split(',')[0]?.trim() || ''
}

function runWithPlatformRequest(req, callback) {
  const forwardedFor = firstForwardedAddress(req?.headers?.['x-forwarded-for'])
  const store = {
    requestId: text(req?.headers?.['x-request-id']) || crypto.randomUUID(),
    pathname: '',
    method: text(req?.method).toUpperCase(),
    platformContextId: text(req?.headers?.['x-platform-context-id']),
    platformEmailMfaToken: text(req?.headers?.['x-platform-email-mfa-token']),
    ipAddress: forwardedFor || text(req?.socket?.remoteAddress),
    userAgent: text(req?.headers?.['user-agent']).slice(0, 500),
    decodedToken: null,
  }
  return requestStorage.run(store, callback)
}

function setRequestPathname(pathname) {
  const store = requestStorage.getStore()
  if (store) store.pathname = text(pathname)
}

function setVerifiedFirebaseToken(decodedToken) {
  const store = requestStorage.getStore()
  if (store) store.decodedToken = decodedToken || null
}

function getPlatformRequestContext() {
  return requestStorage.getStore() || null
}

module.exports = {
  getPlatformRequestContext,
  runWithPlatformRequest,
  setRequestPathname,
  setVerifiedFirebaseToken,
}
