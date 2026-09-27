'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')

function source(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

test('logout clears profitability payloads and rendered financial DOM before another session', () => {
  const portal = source('web-app/apps/portal-web/src/ui/portalApp.js')
  const clientProfitability = source('web-app/apps/portal-web/src/features/clients/profitability/index.js')
  const contractProfitability = source('web-app/apps/portal-web/src/features/profitability/index.js')

  assert.match(portal, /clientProfileFeature\?\.resetSession\?\.\(\)/)
  assert.match(portal, /contractProfitabilityFeature\?\.resetSession\?\.\(\)/)
  assert.match(clientProfitability, /currentPayload = normalizePayload\(\)/)
  assert.match(clientProfitability, /cpdProfitabilityMount['"]\)\?\.replaceChildren\(\)/)
  assert.match(contractProfitability, /payload = null/)
  assert.match(contractProfitability, /contractProfitabilityRows/)
  assert.match(contractProfitability, /clearRect\(0, 0, canvas\.width, canvas\.height\)/)
})

test('client profitability scrubs stale financial DOM on reload, access loss and client change', () => {
  const sourceCode = source('web-app/apps/portal-web/src/features/clients/profitability/index.js')

  assert.match(sourceCode, /function scrubRenderedSensitiveData\(\)/)
  assert.match(sourceCode, /function clearSensitiveView\(\{ invalidateRequests = false \} = \{\}\)/)
  assert.match(sourceCode, /currentPayload = normalizePayload\(\)[\s\S]*scrubRenderedSensitiveData\(\)/)
  assert.match(sourceCode, /'cpfObjectRows'[\s\S]*'cpfTrendContent'[\s\S]*'cpfCostsContent'[\s\S]*replaceChildren\(\)/)
  assert.match(sourceCode, /function clearModalSensitiveData[\s\S]*description\.textContent = ''[\s\S]*body\.replaceChildren\(\)/)
  assert.match(sourceCode, /function showError\(error\) \{\s*clearSensitiveView\(\)/)
  assert.match(sourceCode, /\[401, 403\][\s\S]*showAccessDenied\(\)/)
  assert.match(sourceCode, /if \(clientChanged\) \{\s*clearSensitiveView\(\{ invalidateRequests: true \}\)/)
  assert.match(sourceCode, /const requestedObjectId = currentObjectId[\s\S]*clearSensitiveView\(\)[\s\S]*fetchProfitabilitySummary/)
  assert.match(sourceCode, /historySequence !== modalRequestSequence \|\| modalType !== 'history'/)
  assert.match(sourceCode, /function resetSession\(\) \{\s*clearSensitiveView\(\{ invalidateRequests: true \}\)/)
})

test('cost-control UI separates operational-cost editing from sensitive finance editing', () => {
  const clientProfitability = source('web-app/apps/portal-web/src/features/clients/profitability/index.js')
  const template = source('web-app/apps/portal-web/src/features/clients/profitability/template.html')

  assert.match(clientProfitability, /capability\?\.canEditOperationalCosts === true/)
  assert.match(clientProfitability, /\['cpfAddCostBtn', 'cpfHygieneBtn', 'cpfAssetBtn'\]/)
  assert.match(clientProfitability, /\['contract', 'revenue', 'worker-rate'\]/)
  assert.match(clientProfitability, /\['cost', 'hygiene', 'hygiene-archive', 'asset'\]/)
  assert.match(clientProfitability, /normalizeProfitabilityViewPayload\(payload\)/)
  assert.match(clientProfitability, /row\.operationalStatus \|\| row\.status/)
  assert.match(clientProfitability, /status === 'CRITICAL'/)
  assert.match(clientProfitability, /Do poprawy o/)
  assert.match(clientProfitability, /element\.hidden = restricted/)
  assert.match(template, /data-cpf-owner-finance/)
})

test('hygiene package edits are versioned, retry-safe and role projected in the client', () => {
  const clientProfitability = source('web-app/apps/portal-web/src/features/clients/profitability/index.js')
  const service = source('web-app/apps/portal-web/src/services/profitabilityService.js')

  assert.match(clientProfitability, /modalCommandFingerprint !== commandFingerprint/)
  assert.match(clientProfitability, /const mutationOptions = \{ commandId: modalCommandId \}/)
  assert.match(clientProfitability, /packageId: text\(modalRecord\?\.packageId\)/)
  assert.match(clientProfitability, /replacesPackageVersionId: text\(modalRecord\?\.packageVersionId\)/)
  assert.match(clientProfitability, /data-cpf-edit-hygiene/)
  assert.match(clientProfitability, /data-cpf-archive-hygiene/)
  assert.match(clientProfitability, /options: modalRecord[\s\S]*HYGIENE_BILLING_LABELS\[selectedBillingMode\]/)
  assert.match(clientProfitability, /options: modalRecord[\s\S]*VALUE_BASIS_LABELS\[selectedValueBasis\]/)
  assert.match(clientProfitability, /Podaj koszt netto albo cenę sprzedaży netto pakietu/)
  assert.match(service, /commandId: createProfitabilityCommandId\('hygiene', options\.commandId\)/)
  assert.match(service, /commandId: createProfitabilityCommandId\('hygiene-archive', options\.commandId\)/)
})

test('organization profitability uses the scoped portfolio API and demo data require an explicit local flag', () => {
  const feature = source('web-app/apps/portal-web/src/features/profitability/index.js')
  const service = source('web-app/apps/portal-web/src/services/profitabilityService.js')

  assert.match(service, /export function fetchProfitabilityPortfolio/)
  assert.match(service, /view: 'portfolio'/)
  assert.match(feature, /fetchProfitabilityPortfolio\(orgId, \{ period \}\)/)
  assert.match(feature, /get\('profitabilityPreview'\) === '1'/)
  assert.match(feature, /payload\?\.financeProfile === 'COST_CONTROL'/)
  assert.match(feature, /totalCostMinor: sumRequiredMinorValues/)
  assert.doesNotMatch(feature, /if \(import\.meta\.env\.DEV && localPreviewHost\(\)\) \{/)
})

test('session construction blocks only profitability when the v2 schema or ACL drifts', () => {
  const server = source('index.js')
  const loader = source('profitability/session-context-loader.js')

  assert.match(server, /profitabilitySessionContextLoader\.load\(\{ uid, row \}\)/)
  assert.match(server, /connectProfitabilityClient: profitabilityDb\.connect/)
  assert.doesNotMatch(server, /profitabilityAccessProfileMode\(client, row\?\.org_id\)/)
  assert.match(loader, /createAccessProfileRepository\(client\)\.schemaReady\(\)/)
  assert.match(loader, /delete patch\.profitability_access_profile_v2_enabled/)
  assert.match(loader, /accessProfileV2Blocked = true/)
  assert.match(loader, /client\?\.release\?\.\(\)/)
  assert.match(loader, /return blockedPatch\(\)/)
  assert.match(loader, /isProfitabilityAccessProfileOrganizationAllowed\(accessProfileRollout, organizationId\)/)
})

test('platform organization context applies the same global profitability gate', () => {
  const server = source('index.js')

  assert.match(server, /gateProfitabilityModuleCapabilities\(\{/)
  assert.match(server, /\}, input\?\.requestOrgId, process\.env\)/)
})
