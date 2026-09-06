import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const moduleUrl = pathToFileURL(path.join(
  projectRoot,
  'web-app',
  'apps',
  'portal-web',
  'src',
  'features',
  'workforce-schedule',
  'workforceScheduleAsyncGuard.js',
)).href

async function fixture() {
  const { createWorkforceScheduleAsyncGuard } = await import(moduleUrl)
  let orgId = 'org-a'
  return {
    guard: createWorkforceScheduleAsyncGuard(() => orgId),
    setOrgId(value) { orgId = value },
  }
}

test('zmiana sesji i organizacji unieważnia stary kontekst', async () => {
  const f = await fixture()
  const oldContext = f.guard.beginBusy()
  assert.equal(f.guard.isCurrent(oldContext), true)

  f.setOrgId('org-b')
  f.guard.resetSession()
  const newContext = f.guard.beginBusy()

  assert.equal(f.guard.isCurrent(oldContext), false)
  assert.equal(f.guard.releaseBusy(oldContext), false)
  assert.equal(f.guard.isCurrent(newContext), true)
  assert.equal(f.guard.releaseBusy(newContext), true)
})

test('reset tej samej organizacji chroni nową operację przed starym finally', async () => {
  const f = await fixture()
  const oldContext = f.guard.beginBusy()

  f.guard.resetSession()
  const newContext = f.guard.beginBusy()
  assert.notEqual(newContext.token, oldContext.token)

  assert.equal(f.guard.releaseBusy(oldContext), false)
  assert.equal(f.guard.beginBusy(), null)
  assert.equal(f.guard.releaseBusy(newContext), true)
  assert.ok(f.guard.beginBusy())
})

test('kontekst odświeżenia jest ważny tylko w przechwyconej sesji i organizacji', async () => {
  const f = await fixture()
  const refreshContext = f.guard.capture()

  assert.equal(f.guard.isCurrent(refreshContext), true)
  f.guard.resetSession()
  assert.equal(f.guard.isCurrent(refreshContext), false)

  const sameSessionContext = f.guard.capture()
  f.setOrgId('org-b')
  assert.equal(f.guard.isCurrent(sameSessionContext), false)
})
