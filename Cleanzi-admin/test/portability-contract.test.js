'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '..', '..')

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

test('runtime panelu nie zawiera identyfikatora ani klucza obecnego projektu', () => {
  const runtimeSources = [
    'index.js',
    'web-app/vite.config.js',
    'web-app/apps/portal-web/src/firebase/firebaseClient.js',
    'Cleanzi-admin/frontend/platformFirebaseClient.js',
    'web-app/apps/portal-web/src/services/workerService.js',
    'Cleanzi-admin/frontend/api.js',
    'apphosting.yaml',
  ].map(read).join('\n')
  assert.doesNotMatch(runtimeSources, /iclean-room|AIzaSyCdRV|cleanzi-01\.web\.app|cleanzi-01--/i)
})

test('Firebase Auth, Data Connect i API mają niezależne zmienne środowiskowe', () => {
  const firebaseClient = read('web-app/apps/portal-web/src/firebase/firebaseClient.js')
  const platformFirebaseClient = read('Cleanzi-admin/frontend/platformFirebaseClient.js')
  const platformDataService = read('web-app/apps/portal-web/src/services/platformDataConnectService.js')
  const adminApi = read('Cleanzi-admin/frontend/api.js')
  const backend = read('index.js')
  assert.match(firebaseClient, /VITE_FIREBASE_PROJECT_ID/)
  assert.match(firebaseClient, /VITE_DATACONNECT_CONNECTOR/)
  assert.match(firebaseClient, /VITE_DATACONNECT_SERVICE/)
  assert.match(platformFirebaseClient, /VITE_PLATFORM_FIREBASE_PROJECT_ID/)
  assert.match(platformFirebaseClient, /cleanzi-platform-admin/)
  assert.match(platformDataService, /ensurePlatformFirebase/)
  assert.match(adminApi, /VITE_PLATFORM_API_BASE/)
  assert.match(backend, /PLATFORM_FIREBASE_PROJECT_ID/)
  assert.match(backend, /FIREBASE_DATACONNECT_CONNECTOR/)
  assert.match(backend, /CLOUD_SQL_CONNECTION_NAME/)
})

test('token z osobnego Firebase platformy obsługuje kontekst i administrację pracownikami', () => {
  const backend = read('index.js')
  const workerService = read('web-app/apps/portal-web/src/services/workerService.js')
  assert.ok((backend.match(/verifySessionContextFirebaseIdToken\(token\)/g) || []).length >= 9)
  assert.match(backend, /verifyFirebaseIdToken:\s*verifyPlatformFirebaseIdToken/)
  assert.match(backend, /async function handleAuthSessionContextRequest[\s\S]*?verifySessionContextFirebaseIdToken\(token\)/)
  assert.match(backend, /async function handleAdminWorkerProfileUpdateRequest[\s\S]*?verifySessionContextFirebaseIdToken\(token\)/)
  assert.match(backend, /async function handleAdminWorkerProfileDeleteRequest[\s\S]*?verifySessionContextFirebaseIdToken\(token\)/)
  assert.doesNotMatch(backend, /workerRepository\.getRequesterMembership\(/)
  assert.match(workerService, /const platformRequest = isPlatformSession\(\)/)
  assert.match(workerService, /platformAuthHeaders\(\{ requireContext: true, forceRefresh: forceTokenRefresh \}\)/)
})
