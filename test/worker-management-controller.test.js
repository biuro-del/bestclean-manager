'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const test = require('node:test')

const controllerModule = import(
  pathToFileURL(
    path.join(
      __dirname,
      '..',
      'web-app',
      'apps',
      'portal-web',
      'src',
      'features',
      'workers',
      'worker-management',
      'application',
      'workerCrudController.js',
    ),
  ).href,
)

function validAddInput(overrides = {}) {
  return {
    mode: 'add',
    orgId: 'org-1',
    form: {
      composedWorkerId: 'worker_org-1_2',
      workerNumber: '2',
      name: 'Anna Nowak',
      email: 'anna@example.com',
      phone: '664 322 028',
      role: 'WORKER',
      workerType: 'Stały personel na obiekcie',
      active: true,
      password: 'sekret1',
      repeatedPassword: 'sekret1',
    },
    ...overrides,
  }
}

test('kontroler dodaje pracownika przez gateway i buduje wpis optymistyczny', async () => {
  const { createWorkerCrudController } = await controllerModule
  const calls = []
  const controller = createWorkerCrudController({
    gateway: {
      create: async (...args) => {
        calls.push(args)
        return {
          workerId: 'worker_org-1_2',
          login: 'anna@example.com',
          name: 'Anna Nowak',
          storage: 'database',
          persistenceVerified: true,
        }
      },
      update: async () => assert.fail('update nie powinien zostać wywołany'),
      remove: async () => assert.fail('remove nie powinien zostać wywołany'),
      setPassword: async () => assert.fail('setPassword nie powinien zostać wywołany'),
    },
  })

  const result = await controller.save(validAddInput())

  assert.equal(result.ok, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'org-1')
  assert.equal(calls[0][1].password, 'sekret1')
  assert.equal(calls[0][1].phone, '+48664322028')
  assert.equal(result.optimisticWorker.login, 'anna@example.com')
  assert.match(result.successNotice, /Dodano użytkownika/)
})

test('kontroler edytuje profil i hasło, zachowując dane zdjęcia', async () => {
  const { createWorkerCrudController } = await controllerModule
  const calls = []
  const controller = createWorkerCrudController({
    gateway: {
      create: async () => assert.fail('create nie powinien zostać wywołany'),
      update: async (...args) => {
        calls.push(['update', ...args])
        return { login: 'anna@example.com', workerId: 'worker_org-1_2', role: 'WORKER' }
      },
      remove: async () => assert.fail('remove nie powinien zostać wywołany'),
      setPassword: async (...args) => calls.push(['password', ...args]),
    },
  })

  const result = await controller.save({
    mode: 'edit',
    orgId: 'org-1',
    currentWorker: { login: 'anna@example.com', workerId: 'worker_org-1_2' },
    editedBy: 'Admin',
    canResetWorkerPasswords: true,
    photoDataUrl: 'data:image/png;base64,AA==',
    form: {
      workerId: 'worker_org-1_2',
      name: 'Anna Nowak',
      email: 'anna@example.com',
      role: 'WORKER',
      workerType: 'Stały personel na obiekcie',
      active: true,
      password: 'nowehaslo',
      repeatedPassword: 'nowehaslo',
    },
  })

  assert.equal(result.ok, true)
  assert.equal(calls[0][0], 'update')
  assert.equal(calls[0][3].photoDataUrl, 'data:image/png;base64,AA==')
  assert.deepEqual(calls[1], ['password', 'org-1', 'anna@example.com', 'nowehaslo'])
})

test('kontroler informuje o odtworzeniu brakujacego konta Firebase Auth', async () => {
  const { createWorkerCrudController } = await controllerModule
  const controller = createWorkerCrudController({
    gateway: {
      create: async () => assert.fail('create nie powinien zostac wywolany'),
      update: async () => ({
        login: 'anna@example.com',
        workerId: 'worker_org-1_2',
        role: 'WORKER',
        authWarning: 'Brak konta Firebase Auth.',
      }),
      remove: async () => assert.fail('remove nie powinien zostac wywolany'),
      setPassword: async () => ({ passwordUpdated: true, authCreated: true }),
    },
  })

  const result = await controller.save({
    mode: 'edit',
    orgId: 'org-1',
    currentWorker: { login: 'anna@example.com', workerId: 'worker_org-1_2' },
    editedBy: 'Admin',
    canResetWorkerPasswords: true,
    form: {
      workerId: 'worker_org-1_2',
      name: 'Anna Nowak',
      email: 'anna@example.com',
      role: 'WORKER',
      workerType: 'Staly personel na obiekcie',
      active: true,
      password: 'nowehaslo',
      repeatedPassword: 'nowehaslo',
    },
  })

  assert.match(result.successNotice, /Odtworzono konto Firebase Auth/)
})

test('kontroler usuwa pracownika dopiero po poprawnej walidacji', async () => {
  const { createWorkerCrudController } = await controllerModule
  let deletePayload = null
  const controller = createWorkerCrudController({
    gateway: {
      create: async () => {},
      update: async () => {},
      setPassword: async () => {},
      remove: async (...args) => {
        deletePayload = args
        return { deletedLogin: 'worker@example.com', authWarning: 'Konto Auth już nie istniało.' }
      },
    },
  })
  const worker = { login: 'worker@example.com', workerId: 'worker_org-1_3', role: 'WORKER' }
  const invalid = controller.validateDelete({ canDeleteWorkers: false, orgId: 'org-1', worker })
  const valid = controller.validateDelete({ canDeleteWorkers: true, orgId: 'org-1', worker })
  const result = await controller.remove({ prepared: valid })

  assert.equal(invalid.ok, false)
  assert.deepEqual(deletePayload, [
    'org-1',
    'worker@example.com',
    { login: 'worker@example.com', workerId: 'worker_org-1_3', authUid: '' },
  ])
  assert.match(result.authWarning, /Auth/)
  assert.ok(result.identityKeys.has('worker_org-1_3'))
})
