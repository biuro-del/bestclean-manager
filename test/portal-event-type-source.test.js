'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const servicePath = path.join(
  __dirname,
  '..',
  'web-app',
  'apps',
  'portal-web',
  'src',
  'services',
  'workdayService.js',
)

test('nowy Event tworzony w portalu ma jawny typ CLEAN', () => {
  const source = fs.readFileSync(servicePath, 'utf8')
  const insertCallStart = source.indexOf("runMutationOperation('InsertEventForOrg'")
  assert.notEqual(insertCallStart, -1)
  const insertCall = source.slice(insertCallStart, insertCallStart + 500)
  assert.match(insertCall, /eventType:\s*'CLEAN'/)
})
