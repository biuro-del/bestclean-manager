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
    'worker-management',
    'domain',
    'workerCrudModel.js',
  ),
).href

const domainModule = import(moduleUrl)

test('normalizuje role i typy pracownika niezależnie od wariantu nazwy', async () => {
  const { normalizeWorkerRole, normalizeWorkerType } = await domainModule

  assert.equal(normalizeWorkerRole('Właściciel'), 'OWNER')
  assert.equal(normalizeWorkerRole('Menedżer'), 'MANAGER')
  assert.equal(normalizeWorkerRole('Koordynator'), 'COORDINATOR')
  assert.equal(normalizeWorkerRole('Pracownik'), 'WORKER')
  assert.equal(normalizeWorkerType('Zespół mobilny'), 'Zespół Mobilny')
  assert.equal(normalizeWorkerType('Stały personel na obiekcie'), 'Stały personel na obiekcie')
})

test('przygotowuje poprawne polecenie dodania pracownika i ręczny numer', async () => {
  const { prepareWorkerSave } = await domainModule
  const result = prepareWorkerSave({
    mode: 'add',
    form: {
      composedWorkerId: 'worker_org-1_12',
      workerNumber: '12',
      workerNumberManual: true,
      name: ' Jan Kowalski ',
      email: ' JAN@EXAMPLE.COM ',
      phone: '664 322 028',
      role: 'WORKER',
      workerType: 'Zespół mobilny',
      active: true,
      password: 'sekret1',
      repeatedPassword: 'sekret1',
    },
    canOverrideWorkerNumber: true,
  })

  assert.equal(result.ok, true)
  assert.equal(result.payload.workerId, 'worker_org-1_12')
  assert.equal(result.payload.name, 'Jan Kowalski')
  assert.equal(result.payload.email, 'jan@example.com')
  assert.equal(result.payload.phone, '+48664322028')
  assert.equal(result.payload.workerType, 'Zespół Mobilny')
  assert.equal(result.workerNumberOverride, 12)
})

test('odrzuca niepoprawny formularz przed wywołaniem backendu', async () => {
  const { prepareWorkerSave } = await domainModule
  const invalidEmail = prepareWorkerSave({
    mode: 'add',
    form: {
      workerNumber: '1',
      name: 'Jan Kowalski',
      email: 'bez-malpy',
      phone: '+48664322028',
      password: 'sekret1',
      repeatedPassword: 'sekret1',
    },
  })
  const portalRoleWithoutPermission = prepareWorkerSave({
    mode: 'add',
    form: {
      workerNumber: '1',
      name: 'Jan Kowalski',
      email: 'jan@example.com',
      phone: '+48664322028',
      role: 'ADMIN',
      password: 'sekret1',
      repeatedPassword: 'sekret1',
    },
  })

  assert.deepEqual(invalidEmail.error, {
    channel: 'basic',
    message: 'Podaj poprawny email, którym pracownik będzie się logował.',
    focusId: 'wkEditEmail',
  })
  assert.equal(portalRoleWithoutPermission.error.focusId, 'wkEditRole')
})

test('wymaga telefonu przy dodawaniu i normalizuje polski numer do E.164', async () => {
  const { prepareWorkerSave } = await domainModule
  const baseForm = {
    workerNumber: '1',
    name: 'Jan Kowalski',
    email: 'jan@example.com',
    role: 'WORKER',
    password: 'sekret1',
    repeatedPassword: 'sekret1',
  }

  const missingPhone = prepareWorkerSave({ mode: 'add', form: baseForm })
  const invalidPhone = prepareWorkerSave({
    mode: 'add',
    form: { ...baseForm, phone: '+49 123 456 789' },
  })
  const localPhone = prepareWorkerSave({
    mode: 'add',
    form: { ...baseForm, phone: '664-322-028' },
  })

  assert.equal(missingPhone.ok, false)
  assert.equal(missingPhone.error.focusId, 'wkEditPhone')
  assert.equal(invalidPhone.ok, false)
  assert.equal(invalidPhone.error.focusId, 'wkEditPhone')
  assert.equal(localPhone.ok, true)
  assert.equal(localPhone.payload.phone, '+48664322028')
})

test('chroni właściciela przed usunięciem', async () => {
  const { prepareWorkerDelete } = await domainModule
  const result = prepareWorkerDelete({
    canDeleteWorkers: true,
    orgId: 'org-1',
    worker: { login: 'owner@example.com', role: 'OWNER' },
  })

  assert.equal(result.ok, false)
  assert.match(result.error.message, /założyciela organizacji/)
})
