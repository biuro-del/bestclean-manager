'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const test = require('node:test')
const {
  isPolishPhoneE164,
  normalizePolishPhoneE164,
} = require('../polish-phone-policy')

const webPolicyUrl = pathToFileURL(
  path.join(
    __dirname,
    '..',
    'web-app',
    'apps',
    'portal-web',
    'src',
    'utils',
    'polishPhone.js',
  ),
).href

const webPolicy = import(webPolicyUrl)

const validCases = new Map([
  ['664322028', '+48664322028'],
  ['664 322 028', '+48664322028'],
  ['0664-322-028', '+48664322028'],
  ['48 664 322 028', '+48664322028'],
  ['+48 (664) 322-028', '+48664322028'],
  ['0048 664 322 028', '+48664322028'],
])

const invalidCases = [
  '',
  '+48',
  '66432202',
  '6643220280',
  '+49664322028',
  'telefon 664322028',
  '++48664322028',
]

test('normalizuje obsługiwane warianty polskiego telefonu do jednego E.164', () => {
  validCases.forEach((expected, input) => {
    assert.equal(normalizePolishPhoneE164(input), expected)
    assert.equal(isPolishPhoneE164(expected), true)
  })
})

test('odrzuca pusty, zagraniczny i niejednoznaczny numer', () => {
  invalidCases.forEach((input) => {
    assert.equal(normalizePolishPhoneE164(input), '')
  })
})

test('frontend i backend stosują identyczną normalizację', async () => {
  const web = await webPolicy
  ;[...validCases.keys(), ...invalidCases].forEach((input) => {
    assert.equal(web.normalizePolishPhoneE164(input), normalizePolishPhoneE164(input))
  })
  assert.equal(web.polishPhoneForDisplay('numer do wyjaśnienia'), 'numer do wyjaśnienia')
})

test('backend wymusza telefon przy tworzeniu i normalizuje edycję pracownika', () => {
  const backend = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
  const createStart = backend.indexOf('function buildUserPayload')
  const updateStart = backend.indexOf('function buildWorkerProfileUpdatePayload')
  const deleteStart = backend.indexOf('function buildWorkerProfileDeletePayload')
  const createBlock = backend.slice(createStart, updateStart)
  const updateBlock = backend.slice(updateStart, deleteStart)

  assert.match(createBlock, /normalizePolishPhoneE164\(rawPhone\)/)
  assert.match(createBlock, /Podaj numer telefonu pracownika/)
  assert.match(updateBlock, /normalizePolishPhoneE164\(rawPhone\)/)
  assert.match(updateBlock, /Podaj poprawny polski numer telefonu/)
})

test('formularz nowego pracownika podpowiada +48 i wymaga telefonu', () => {
  const featureRoot = path.join(
    __dirname,
    '..',
    'web-app',
    'apps',
    'portal-web',
    'src',
    'features',
    'workers',
    'worker_list_profile',
  )
  const feature = fs.readFileSync(path.join(featureRoot, 'index.js'), 'utf8')
  const template = fs.readFileSync(path.join(featureRoot, 'template.html'), 'utf8')

  assert.match(feature, /phoneInput\.required = mode === 'add'/)
  assert.match(feature, /phoneInput\.value = `\$\{POLISH_PHONE_PREFIX\} `/)
  assert.match(template, /id="wkEditPhone" type="tel"/)
  assert.match(template, /placeholder="\+48 000 000 000"/)
})

test('jednorazowy backfill jest transakcyjny, idempotentny i nie zmienia błędnych danych', () => {
  const migration = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      'dataconnect',
      'migrations',
      '20260914_worker_phone_pl_e164_backfill.sql',
    ),
    'utf8',
  )

  assert.match(migration, /begin;/i)
  assert.match(migration, /commit;/i)
  assert.match(migration, /WORKER_PHONE_PL_INVALID_VALUES/)
  assert.match(migration, /add column if not exists phone_normalized/i)
  assert.match(migration, /phone_normalized = normalized_rows\.normalized_phone/)
  assert.match(migration, /create trigger cleanzi_worker_phone_pl_e164_sync_trigger/i)
  assert.match(migration, /worker_row\.phone is distinct from normalized_rows\.normalized_phone/)
  assert.match(migration, /WORKER_PHONE_PL_POSTFLIGHT_FAILED/)
})
