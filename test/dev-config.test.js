'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')

const { configureAuthSessionProxy, resolveLocalCloudSqlCoordinates } = require('../scripts/dev')

test('lokalny bootstrap Cleanzi odtwarza niesekretne dane Cloud SQL z projektu Vite', () => {
  assert.deepEqual(
    resolveLocalCloudSqlCoordinates({
      VITE_FIREBASE_PROJECT_ID: 'iclean-room',
    }),
    {
      projectId: 'iclean-room',
      connectionName: 'iclean-room:europe-west3:iclean-room-instance',
      databaseName: 'iclean-room-database',
    },
  )
})

test('jawna konfiguracja ma pierwszenstwo przed ustawieniami kanonicznymi Cleanzi', () => {
  assert.deepEqual(
    resolveLocalCloudSqlCoordinates({
      FIREBASE_PROJECT_ID: 'iclean-room',
      CLOUD_SQL_CONNECTION_NAME: 'custom-project:custom-region:custom-instance',
      DB_NAME: 'custom-database',
    }),
    {
      projectId: 'iclean-room',
      connectionName: 'custom-project:custom-region:custom-instance',
      databaseName: 'custom-database',
    },
  )
})

test('inny projekt nie dziedziczy polaczenia ani bazy Cleanzi', () => {
  assert.deepEqual(
    resolveLocalCloudSqlCoordinates({
      VITE_FIREBASE_PROJECT_ID: 'other-project',
    }),
    {
      projectId: 'other-project',
      connectionName: '',
      databaseName: '',
    },
  )
})

test('jawny tryb proxy sesji ustawia tylko kanoniczny portal Cleanzi', () => {
  const env = {
    VITE_FIREBASE_PROJECT_ID: 'iclean-room',
  }

  assert.deepEqual(configureAuthSessionProxy(env, ['--auth-session-proxy']), {
    enabled: true,
    target: 'https://portal.cleanzi.pl',
  })
  assert.equal(env.VITE_DEV_AUTH_API_PROXY_TARGET, 'https://portal.cleanzi.pl')
  assert.equal(env.DEV_AUTH_SESSION_PROXY_ENABLED, '1')
})

test('proxy sesji pozostaje wylaczone bez jawnej flagi', () => {
  const env = {
    VITE_FIREBASE_PROJECT_ID: 'iclean-room',
    DEV_AUTH_SESSION_PROXY_ENABLED: '1',
    VITE_DEV_AUTH_API_PROXY_TARGET: 'https://portal.cleanzi.pl',
  }

  assert.deepEqual(configureAuthSessionProxy(env, []), {
    enabled: false,
    target: '',
  })
  assert.equal(env.VITE_DEV_AUTH_API_PROXY_TARGET, undefined)
  assert.equal(env.DEV_AUTH_SESSION_PROXY_ENABLED, undefined)
})

test('proxy sesji odrzuca inny projekt i inny host', () => {
  assert.throws(
    () => configureAuthSessionProxy(
      { VITE_FIREBASE_PROJECT_ID: 'other-project' },
      ['--auth-session-proxy'],
    ),
    /DEV_AUTH_SESSION_PROXY_PROJECT_MISMATCH/,
  )

  assert.throws(
    () => configureAuthSessionProxy(
      {
        VITE_FIREBASE_PROJECT_ID: 'iclean-room',
        VITE_DEV_AUTH_API_PROXY_TARGET: 'https://example.com',
      },
      ['--auth-session-proxy'],
    ),
    /DEV_AUTH_SESSION_PROXY_TARGET_NOT_ALLOWED/,
  )
})
