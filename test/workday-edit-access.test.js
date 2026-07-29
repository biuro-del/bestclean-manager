'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const test = require('node:test')

const moduleUrl = pathToFileURL(
  path.join(
    __dirname,
    '..',
    'web-app',
    'apps',
    'portal-web',
    'src',
    'features',
    'workers',
    'workdayEditAccess.js',
  ),
).href

const workers = [
  {
    workerId: 'W001',
    login: 'Dudek',
    fullName: 'Rafał Dudek',
    authUid: 'uid-rafal',
  },
  {
    workerId: 'W002',
    login: 'Cisak',
    fullName: 'Marta Cisak',
    loginEmail: 'cisak@bestclean.pl',
    authUid: 'uid-marta',
  },
  {
    workerId: 'W005',
    login: 'Sabina',
    fullName: 'Sabina Dudek',
    loginEmail: 'sabina.dudek@bestclean.pl',
    authUid: 'uid-sabina',
  },
  {
    workerId: 'W099',
    login: 'Manager',
    fullName: 'Manager Portalu',
    authUid: 'uid-manager',
  },
]

test('Sabina Dudek nie może edytować własnego czasu pracy', async () => {
  const { isOwnWorkdayEditBlocked } = await import(moduleUrl)
  assert.equal(
    isOwnWorkdayEditBlocked({
      session: { uid: 'uid-sabina' },
      workers,
      targetWorker: workers[2],
    }),
    true,
  )
})

test('Marta Cisak nie może edytować własnego czasu pracy', async () => {
  const { isOwnWorkdayEditBlocked } = await import(moduleUrl)
  assert.equal(
    isOwnWorkdayEditBlocked({
      session: { workerId: 'W002' },
      workers,
      targetWorker: workers[1],
    }),
    true,
  )
})

test('inny uprawniony użytkownik może poprawić czas Sabiny lub Marty', async () => {
  const { isOwnWorkdayEditBlocked } = await import(moduleUrl)
  const session = { uid: 'uid-manager' }

  assert.equal(
    isOwnWorkdayEditBlocked({ session, workers, targetWorker: workers[1] }),
    false,
  )
  assert.equal(
    isOwnWorkdayEditBlocked({ session, workers, targetWorker: workers[2] }),
    false,
  )
})

test('wyjątek W001 dla Rafała pozostaje zachowany', async () => {
  const { isOwnWorkdayEditBlocked } = await import(moduleUrl)
  assert.equal(
    isOwnWorkdayEditBlocked({
      session: { uid: 'uid-rafal' },
      workers,
      targetWorker: workers[0],
    }),
    false,
  )
})
