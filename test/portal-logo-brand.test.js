'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const layoutPath = path.join(repoRoot, 'web-app/apps/portal-web/src/ui/layoutTemplate.js')
const eventsPath = path.join(repoRoot, 'web-app/apps/portal-web/src/features/events/index.js')
const qrPrintPath = path.join(repoRoot, 'web-app/apps/portal-web/src/features/objects/zones/qrPrint.js')
const logoAssetPath = path.join(repoRoot, 'web-app/public/cleanzi-logo-brand-v2.png')
const systemStylesPath = path.join(repoRoot, 'web-app/apps/portal-web/src/ui/styles/systemUiV3.css')

function readRequired(filePath) {
  assert.ok(fs.existsSync(filePath), `Brak wymaganego pliku: ${path.relative(repoRoot, filePath)}`)
  return fs.readFileSync(filePath, 'utf8')
}

function occurrenceCount(source, fragment) {
  return source.split(fragment).length - 1
}

test('portal używa dokładnego, wersjonowanego logo Cleanzi z przekazanego wzoru', () => {
  const layout = readRequired(layoutPath)
  const events = readRequired(eventsPath)
  const qrPrint = readRequired(qrPrintPath)
  const systemStyles = readRequired(systemStylesPath)
  const logo = fs.readFileSync(logoAssetPath)
  const logoHash = crypto.createHash('sha256').update(logo).digest('hex')

  assert.equal(logoHash, '66928fa91e630345c79f0cae1d602cb9a732c2f97629930c67c9a9f8f1022a82')
  assert.equal(occurrenceCount(layout, '/cleanzi-logo-brand-v2.png'), 4)
  assert.doesNotMatch(layout, /\/cleanzi-logo\.svg/)
  assert.match(events, /cleanziLogo\?\.getAttribute\('src'\) \|\| '\/cleanzi-logo-brand-v2\.png'/)
  assert.match(qrPrint, /fetch\('\/cleanzi-logo\.svg'/)
  assert.match(systemStyles, /sidebar-collapsed[^\{]+\.sidebar-brand-logo[\s\S]*?overflow:\s*hidden\s*!important/)
  assert.match(systemStyles, /sidebar-collapsed[^\{]+\.sidebar-brand-logo img[\s\S]*?translateX\(-15px\)/)
})
