'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const runner = fs.readFileSync(
  path.join(repoRoot, 'scripts', 'migrate-job-card-photo.js'),
  'utf8',
)
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
)

test('audyt jest domyślny, a zapis wymaga jawnego trybu i identyfikatora produkcji', () => {
  assert.match(runner, /const audit = !apply/)
  assert.match(runner, /process\.argv\.includes\('--apply'\)/)
  assert.match(runner, /CLZ-DB-20260728-JOBCARD-PHOTO-01/)
  assert.match(runner, /PRODUCTION_CONFIRMATION_REQUIRED/)
  assert.match(runner, /PROJECT_MISMATCH/)
  assert.match(runner, /DATABASE_MISMATCH/)
})

test('runner wykonuje tylko dwie zatwierdzone migracje i sprawdza gotowość po zapisie', () => {
  assert.match(runner, /20260728_job_card_publication_additive\.sql/)
  assert.match(runner, /20260728_worker_photo_url_additive\.sql/)
  assert.match(runner, /JOB_CARD_PHOTO_SCHEMA_NOT_READY/)
  assert.match(runner, /job_card_draft/)
  assert.match(runner, /job_card_revision/)
  assert.match(runner, /worker_photo_url/)
  assert.equal(
    packageJson.scripts['migrate:job-card-photo'],
    'node scripts/migrate-job-card-photo.js',
  )
})
