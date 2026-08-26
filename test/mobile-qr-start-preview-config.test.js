'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.resolve(__dirname, '..')
const previewAppHostingConfig = fs.readFileSync(
  path.join(repoRoot, 'apphosting.qr-start-preview.yaml'),
  'utf8',
)
const productionAppHostingConfig = fs.readFileSync(path.join(repoRoot, 'apphosting.yaml'), 'utf8')
const previewFirebaseConfig = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'firebase.qr-start-preview.json'), 'utf8'),
)

test('preview QR START ma osobny backend App Hosting i wylacznie testowa baze', () => {
  assert.match(
    previewAppHostingConfig,
    /variable:\s*FIREBASE_PROJECT_ID\s*\n\s*value:\s*cleanzi-portal-klienta-test/,
  )
  assert.match(
    previewAppHostingConfig,
    /variable:\s*CLOUD_SQL_CONNECTION_NAME\s*\n\s*value:\s*cleanzi-portal-klienta-test:europe-west4:clz-schedule-preview-260812-db/,
  )
  assert.match(
    previewAppHostingConfig,
    /variable:\s*DB_NAME\s*\n\s*value:\s*clz-schedule-preview-260812/,
  )
  assert.match(previewAppHostingConfig, /variable:\s*CLOUD_SQL_AUTH_TYPE\s*\n\s*value:\s*IAM/)
  assert.doesNotMatch(previewAppHostingConfig, /iclean-room-instance/)
  assert.doesNotMatch(
    previewAppHostingConfig,
    /API_PROXY_TARGET|API_PROXY_FORWARDED_HOST|cleanzi-01\.web\.app/,
  )
  assert.doesNotMatch(previewAppHostingConfig, /secret:\s*(PORTAL_DB_USER|PORTAL_DB_PASS)/)
  assert.deepEqual(previewFirebaseConfig.apphosting, [
    {
      backendId: 'clz-schedule-preview-260812',
      rootDir: '.',
      ignore: ['node_modules', '.git', 'firebase-debug.log', 'firebase-debug.*.log', 'functions'],
    },
  ])
})

test('konfiguracja preview nie zastapila produkcyjnego App Hosting', () => {
  assert.doesNotMatch(productionAppHostingConfig, /clz-schedule-preview-260812/)
  assert.doesNotMatch(productionAppHostingConfig, /cleanzi-portal-klienta-test/)
})
