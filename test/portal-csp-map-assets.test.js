'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')

test('CSP dopuszcza wyłącznie wymagane zasoby mapy operacyjnej', () => {
  assert.match(source, /script-src[^"\n]*https:\/\/cdn\.jsdelivr\.net/)
  assert.match(source, /style-src[^"\n]*https:\/\/cdn\.jsdelivr\.net/)
  assert.match(source, /img-src[^"\n]*https:\/\/cdn\.jsdelivr\.net/)
  assert.match(source, /img-src[^"\n]*https:\/\/\*\.tile\.openstreetmap\.org/)
  assert.doesNotMatch(source, /(?:script|style|img)-src[^"\n]*\shttps:\s/)
})
