'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const backend = fs.readFileSync(path.join(repoRoot, 'index.js'), 'utf8')
const service = fs.readFileSync(
  path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'services', 'jobCardService.js'),
  'utf8',
)

test('backend zapisuje szkic w tej samej transakcji co zlecenie', () => {
  assert.match(backend, /const jobCardRepository = new JobCardRepository\(client\)/)
  assert.match(backend, /await upsertPortalScheduleOrderTask\(client, row\)/)
  assert.match(backend, /await jobCardRepository\.saveDraft/)
  assert.match(backend, /await client\.query\('commit'\)/)
  assert.match(backend, /JOB_CARD_SCHEMA_MISSING/)
})

test('publikacja używa wyłącznie zapisanego szkicu i aktywnego członkostwa organizacji', () => {
  assert.match(backend, /PORTAL_JOB_CARDS_PATH = '\/api\/portal\/job-cards'/)
  assert.match(backend, /repository\.assertActiveOrganizationMember/)
  assert.match(backend, /repository\.publishStoredDraft/)
  assert.match(backend, /expectedDraftHash/)
  assert.match(backend, /JOB_CARD_DURABLE_STORAGE_REQUIRED/)
})

test('aplikacja mobilna ma tylko odczyt opublikowanej rewizji przypisanej pracownikowi', () => {
  assert.match(backend, /MOBILE_JOB_CARDS_PATH = '\/api\/mobile\/job-cards'/)
  assert.match(backend, /readPublishedMobileJobCards/)
  assert.match(backend, /jsonb_array_elements/)
  assert.match(backend, /mobile_projection/)
})

test('portal wysyła publikację przez autoryzowany endpoint bez payloadu karty', () => {
  assert.match(service, /Authorization: `Bearer/)
  assert.match(service, /action: 'PUBLISH'/)
  assert.match(service, /expectedDraftHash/)
  assert.doesNotMatch(service, /jobCardDraft/)
})
