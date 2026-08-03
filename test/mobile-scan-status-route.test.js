'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')

function functionSource(name, nextName) {
  const start = source.indexOf(`function ${name}`)
  assert.notEqual(start, -1, `Nie znaleziono funkcji ${name}`)
  const end = source.indexOf(`async function ${nextName}`, start + 1)
  assert.notEqual(end, -1, `Nie znaleziono granicy ${nextName}`)
  return source.slice(start, end)
}

test('status oczekujacego skanu jest przejety lokalnie i zwraca kontrolowane 501', () => {
  assert.match(source, /const MOBILE_SCAN_STATUS_PATH = '\/api\/mobile\/scan\/status'/)

  const body = functionSource('handleMobileScanStatusRequest', 'handleMobileWorkflowRequest')
  assert.match(body, /req\.method === 'OPTIONS'/)
  assert.match(body, /req\.method !== 'GET'/)
  assert.match(body, /res\.writeHead\(501, headers\)/)
  assert.match(body, /MOBILE_SCAN_STATUS_UNAVAILABLE/)
  assert.match(body, /same clientActionId/)
  assert.doesNotMatch(body, /proxyApiRequest/)
})

test('routing statusu wystepuje przed workflow i ogolnym proxy API', () => {
  const statusRoute = source.indexOf('requestUrl.pathname === MOBILE_SCAN_STATUS_PATH')
  const workflowRoute = source.indexOf('requestUrl.pathname === MOBILE_STATE_PATH', statusRoute)
  const genericProxyRoute = source.indexOf("requestUrl.pathname.startsWith('/api/')", statusRoute)

  assert.ok(statusRoute >= 0)
  assert.ok(workflowRoute > statusRoute)
  assert.ok(genericProxyRoute > workflowRoute)

  const routedBlock = source.slice(statusRoute, workflowRoute)
  assert.match(routedBlock, /handleMobileScanStatusRequest\(req, res\)/)
  assert.match(routedBlock, /return/)
})

test('status endpoint deklaruje tylko GET i OPTIONS', () => {
  const body = functionSource('handleMobileScanStatusRequest', 'handleMobileWorkflowRequest')
  assert.match(body, /'Access-Control-Allow-Methods': 'GET, OPTIONS'/)
  assert.match(body, /res\.writeHead\(405, headers\)/)
  assert.match(body, /Dozwolona metoda to GET/)
})
