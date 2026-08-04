'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const ordersSource = fs.readFileSync(
  path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'features', 'orders', 'index.js'),
  'utf8',
)
const ordersTemplate = fs.readFileSync(
  path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src', 'features', 'orders', 'list', 'template.html'),
  'utf8',
)
const appHostingConfig = fs.readFileSync(path.join(repoRoot, 'apphosting.yaml'), 'utf8')

test('podglad Karty Zlecenia jest addytywny i domyslnie ukryty', () => {
  assert.match(ordersSource, /VITE_ENABLE_JOB_CARD_PREVIEW/)
  assert.match(ordersSource, /jobCardPreview/)
  assert.match(ordersSource, /compileOrderDraftToJobCardDraft/)
  assert.match(ordersSource, /validateJobCardDraft/)
  assert.match(ordersTemplate, /id="ordersJobCardPreview" hidden/)
  assert.match(ordersTemplate, /Zapis tworzy edytowalny szkic/)
})

test('produkcyjny build App Hosting jawnie wlacza Karte Zlecenia', () => {
  assert.match(appHostingConfig, /variable:\s*VITE_ENABLE_JOB_CARD_PREVIEW/)
  assert.match(appHostingConfig, /value:\s*"1"/)
  assert.match(appHostingConfig, /availability:\s*\r?\n\s*-\s*BUILD/)
})

test('cykl dostaje domyslny koniec roku, ale pozostaje polem formularza', () => {
  assert.match(ordersSource, /defaultJobCardRecurrenceUntil\(nextStart\)/)
  assert.match(ordersSource, /ordersSetInputValue\('ordersEditEnd', nextEnd\)/)
  assert.match(ordersTemplate, /id="ordersEditEnd"/)
})

test('dane operacyjne sa czescia jednego formularza i zasilaja kompilator', () => {
  assert.match(ordersTemplate, /id="ordersJobCardSource" hidden/)
  assert.match(ordersTemplate, /id="ordersJobCardSiteMode"/)
  assert.match(ordersTemplate, /id="ordersJobCardCrewSource"/)
  assert.match(ordersTemplate, /id="ordersJobCardPaymentMethod"/)
  assert.match(ordersTemplate, /id="ordersJobCardRecurrenceConfirmed"/)
  assert.match(ordersSource, /ordersReadJobCardOperationalFields/)
  assert.match(ordersSource, /nextOrder\.jobCardDraft = compiledJobCard/)
  assert.match(ordersSource, /jobCardDraftStatus = 'DRAFT'/)
})

test('publikacja jest osobna od zapisu i wymaga potwierdzenia ostrzezen', () => {
  assert.match(ordersTemplate, /id="ordersJobCardPublish"/)
  assert.match(ordersTemplate, /Publikuj Kartę/)
  assert.match(ordersSource, /async function ordersPublishJobCard/)
  assert.match(ordersSource, /fetchJobCardState/)
  assert.match(ordersSource, /publishJobCard/)
  assert.match(ordersSource, /data-job-card-warning-code/)
  assert.match(ordersSource, /Potwierdź osobno każde ostrzeżenie/)
})

test('podglad zalogi nie powiela pracownika przypisanego w kilku zrodlach', () => {
  assert.match(ordersSource, /function ordersJobCardPreviewCrewLabel/)
  assert.match(ordersSource, /const uniquePeople = new Map\(\)/)
  assert.match(ordersSource, /ordersJobCardPreviewCrewLabel\(card\)/)
})

test('kreator prowadzi jednym przebiegiem od klienta do publikacji', () => {
  assert.match(ordersTemplate, /Klient i obiekt/)
  assert.match(ordersTemplate, /Termin i obsada/)
  assert.match(ordersTemplate, /Zakres i publikacja/)
  assert.match(ordersTemplate, /id="ordersWizardSummaryStatus"/)
  assert.match(ordersTemplate, /id="ordersWizardBufferStatus"/)
  assert.match(ordersTemplate, /id="ordersWizardValidation"/)
  assert.match(ordersTemplate, /id="ordersWizardActionHint"/)
  assert.match(ordersTemplate, /id="ordersEditSave"[^>]*>Zapisz zlecenie</)
})

test('kreator pokazuje stan zapisu i wyjasnia rozdzielenie zapisu od publikacji', () => {
  assert.match(ordersTemplate, /id="ordersEditorSaveState"/)
  assert.match(ordersSource, /function ordersRenderEditorSaveState\(/)
  assert.match(ordersSource, /ordersRenderEditorSaveState\(order\)/)
  assert.match(ordersSource, /Niezapisane zmiany/)
  assert.match(ordersSource, /Zapis utworzy plan w kalendarzu/)
  assert.match(ordersSource, /Publikacja udost.*pracownikom niezmienn.*rewizj/)
})

test('zamkniecie kreatora chroni niezapisane zmiany przed przypadkowym odrzuceniem', () => {
  assert.match(ordersTemplate, /id="ordersDiscardConfirm"[^>]*role="alertdialog"/)
  assert.match(ordersTemplate, /data-orders-discard-cancel/)
  assert.match(ordersTemplate, /data-orders-discard-confirm/)
  assert.match(ordersSource, /let ordersEditorDirty = false/)
  assert.match(ordersSource, /function ordersShowList\(options\s*=\s*\{\}\)/)
  assert.match(ordersSource, /options\.force\s*!==\s*true/)
  assert.match(ordersSource, /ordersOpenDiscardConfirm\(\)/)
  assert.match(ordersSource, /ordersShowList\(\{\s*force:\s*true\s*\}\)/)
})

test('nowe zlecenie wymaga jawnego wyboru typu klienta', () => {
  assert.match(
    ordersSource,
    /function ordersCreateDraftOrder[\s\S]*?clientType:\s*''[\s\S]*?customerType:\s*''/,
  )
  assert.match(ordersSource, /isUnselectedDraftClient/)
  assert.match(ordersTemplate, /placeholder="Wybierz klienta\.\.\."/)
})

test('stan obsady laczy podsumowanie z miejscami kierowanymi do bufora', () => {
  assert.match(ordersSource, /ordersWizardSummaryStatus/)
  assert.match(ordersSource, /ordersWizardBufferStatus/)
  assert.match(ordersSource, /missingPlacesLabel/)
  assert.match(ordersSource, /1 miejsce/)
  assert.match(ordersSource, /miejsc/)
  assert.match(ordersSource, /do obsady/)
  assert.match(ordersSource, /w BUFORZE/)
  assert.match(ordersSource, /Obsada kompletna/)
})
