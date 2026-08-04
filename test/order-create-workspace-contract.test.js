'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const test = require('node:test')

const repoRoot = path.join(__dirname, '..')
const portalSourceRoot = path.join(repoRoot, 'web-app', 'apps', 'portal-web', 'src')
const creatorRoot = path.join(portalSourceRoot, 'features', 'orders', 'create')

function readSource(...segments) {
  const filePath = path.join(...segments)
  assert.equal(fs.existsSync(filePath), true, `Brak pliku kreatora: ${filePath}`)
  return fs.readFileSync(filePath, 'utf8')
}

async function loadCreatorModel() {
  const modulePath = path.join(creatorRoot, 'model.js')
  return import(pathToFileURL(modulePath).href)
}

test('Dodaj zlecenie ma osobna trase i pelnoekranowy widok w powloce portalu', () => {
  const routerSource = readSource(portalSourceRoot, 'ui', 'router.js')
  const layoutSource = readSource(portalSourceRoot, 'ui', 'layoutTemplate.js')
  const templateSource = readSource(creatorRoot, 'template.html')
  const portalSource = readSource(portalSourceRoot, 'ui', 'portalApp.js')

  assert.match(routerSource, /orderCreate:\s*['"]view-orderCreate['"]/)
  assert.match(layoutSource, /id="sidebarOrdersAddBtn"[^>]*data-route="orderCreate"/)
  assert.match(layoutSource, /id="view-orderCreate"/)
  assert.match(templateSource, /data-order-create-workspace/)
  assert.match(templateSource, /id="orderCreateMount"/)
  assert.doesNotMatch(templateSource, /id="view-orderCreate"/)
  assert.match(portalSource, /import\(['"]\.\.\/features\/orders\/create\/index\.js['"]\)/)
  assert.match(portalSource, /orderCreate:\s*\[[^\]]*['"]zones['"][^\]]*['"]clientProfile['"][^\]]*['"]workerTime['"][^\]]*['"]orders['"][^\]]*['"]calendar['"][^\]]*['"]orderCreate['"][^\]]*\]/)
})

test('globalny przycisk otwiera V2 i nie uruchamia starego modalu dodawania', () => {
  const portalSource = readSource(portalSourceRoot, 'ui', 'portalApp.js')
  const ordersSource = readSource(portalSourceRoot, 'features', 'orders', 'index.js')
  const start = portalSource.indexOf("eventTargetClosest(event, '#sidebarOrdersAddBtn")
  const end = portalSource.indexOf("const button = eventTargetClosest(event, '[data-route]')", start)

  assert.notEqual(start, -1, 'Brak obslugi globalnego przycisku Dodaj zlecenie')
  assert.notEqual(end, -1, 'Nie udalo sie wyodrebnic obslugi globalnego przycisku')

  const handlerSource = portalSource.slice(start, end)
  assert.match(handlerSource, /openOrderCreateWorkspace\(/)
  assert.doesNotMatch(handlerSource, /ordersOpenAddEditor\(/)
  assert.doesNotMatch(handlerSource, /router\.go\(['"]orders['"]\)/)

  const routeStart = portalSource.indexOf("if (routeName === 'orderCreate')")
  const routeEnd = portalSource.indexOf("if (routeName === 'ordersMap')", routeStart)
  assert.notEqual(routeStart, -1, 'Brak obslugi trasy nowego kreatora')
  assert.notEqual(routeEnd, -1, 'Nie udalo sie wyodrebnic obslugi trasy nowego kreatora')
  const routeSource = portalSource.slice(routeStart, routeEnd)
  assert.equal(routeSource.indexOf('await orderCreateOpen(openOptions)') < routeSource.indexOf('syncRouteData(routeName'), true)
  assert.match(routeSource, /policy:\s*ROUTE_SYNC_POLICY_BACKGROUND/)
  assert.match(routeSource, /reloadSourcesAndSelect/)

  const listHandlerStart = ordersSource.indexOf("eventTargetClosest(event, '#ordersAddBtn')")
  const listHandlerEnd = ordersSource.indexOf("const quickFilter", listHandlerStart)
  assert.notEqual(listHandlerStart, -1, 'Brak obslugi przycisku Dodaj zlecenie na liscie')
  const listHandlerSource = ordersSource.slice(listHandlerStart, listHandlerEnd)
  assert.match(listHandlerSource, /openOrderCreateWorkspace\(/)
})

test('kazdy zgodnosciowy entrypoint tworzenia deleguje do V2, a stary modal jest tylko do edycji', () => {
  const ordersSource = readSource(portalSourceRoot, 'features', 'orders', 'index.js')
  const ordersTemplate = readSource(portalSourceRoot, 'features', 'orders', 'list', 'template.html')
  const calendarSource = readSource(portalSourceRoot, 'features', 'calendar', 'index.js')
  const clientProfileSource = readSource(portalSourceRoot, 'features', 'clients', 'profile', 'index.js')
  const legacyEntryStart = ordersSource.indexOf('function ordersOpenAddEditor(')
  const legacyEntryEnd = ordersSource.indexOf('function ordersCoworkerOptionsHtml(', legacyEntryStart)

  assert.notEqual(legacyEntryStart, -1, 'Brak zgodnosciowego entrypointu openAddEditor')
  assert.notEqual(legacyEntryEnd, -1, 'Nie udalo sie wyodrebnic entrypointu openAddEditor')

  const legacyEntrySource = ordersSource.slice(legacyEntryStart, legacyEntryEnd)
  assert.match(legacyEntrySource, /openOrderCreateWorkspace\(/)
  assert.match(legacyEntrySource, /initialDate:\s*dayKey/)
  assert.doesNotMatch(legacyEntrySource, /ordersCreateDraftOrder\(/)
  assert.doesNotMatch(legacyEntrySource, /ordersEditorMode\s*=\s*['"]add['"]/)
  assert.doesNotMatch(ordersSource, /ordersEditorMode\s*=\s*['"]add['"]/)
  assert.match(ordersTemplate, /id="ordersEditorPanel"[^>]*aria-label="Edytuj istniejące zlecenie"/)
  assert.match(ordersTemplate, /id="ordersEditTitle">Edycja zlecenia</)
  assert.doesNotMatch(ordersTemplate, /id="ordersEditTitle">Dodaj zlecenie</)
  assert.match(calendarSource, /ordersOpenAddEditor\(dayKey,/)

  const clientAddStart = clientProfileSource.indexOf("binding.add(document.getElementById('cpdOrdersAddBtn')")
  const clientAddEnd = clientProfileSource.indexOf("binding.add(document.getElementById('view-clientProfileDetails')", clientAddStart)
  assert.notEqual(clientAddStart, -1, 'Brak przycisku tworzenia zlecenia w profilu klienta')
  const clientAddSource = clientProfileSource.slice(clientAddStart, clientAddEnd)
  assert.match(clientAddSource, /ordersOpenAddEditor\(\)/)
  assert.doesNotMatch(clientAddSource, /window\.go\(['"]orders['"]\)/)
})

test('kreator ma piec uzgodnionych krokow i stale podsumowanie', async () => {
  const { ORDER_CREATE_STEPS } = await loadCreatorModel()
  const featureSource = readSource(creatorRoot, 'index.js')

  assert.deepEqual(
    ORDER_CREATE_STEPS.map((step) => step.label),
    ['Obiekt', 'Zasady', 'Zakres prac', 'Obsada', 'Zatwierdzenie'],
  )
  assert.match(featureSource, /ORDER_CREATE_STEPS/)
  assert.match(featureSource, /Podsumowanie/)
  assert.match(featureSource, /Postęp kreatora:/)
  assert.match(featureSource, /z 5 kroków/)
})

test('zapis roboczego zlecenia i wyslanie do realizacji sa dwiema osobnymi decyzjami', () => {
  const featureSource = readSource(creatorRoot, 'index.js')
  const ordersSource = readSource(portalSourceRoot, 'features', 'orders', 'index.js')
  const serviceSource = readSource(portalSourceRoot, 'services', 'jobCardService.js')

  assert.match(featureSource, /Zapisz robocze zlecenie/)
  assert.match(featureSource, /Zatwierdź i wyślij do realizacji/)
  assert.match(featureSource, /async function saveDraft\(/)
  assert.match(featureSource, /async function publish\(/)
  assert.match(featureSource, /data-order-create-save/)
  assert.match(featureSource, /data-order-create-publish/)
  assert.doesNotMatch(featureSource, /Zapisz (?:szkic )?i publikuj/i)
  assert.match(serviceSource, /\/portal\/job-card-drafts/)
  assert.match(ordersSource, /saveJobCardDraft\(orgId,/)
  assert.match(ordersSource, /materialized:\s*false/)
  assert.doesNotMatch(ordersSource, /ordersSaveRemoteTimelineOrdersNow\(\[result\.order\]/)
  assert.doesNotMatch(ordersSource, /ordersUpsertLocalSavedOrder\(result\.order\)/)
})

test('obiekt organizacji bez adresu pozostaje dostepny do zapisu roboczego zlecenia', () => {
  const ordersSource = readSource(portalSourceRoot, 'features', 'orders', 'index.js')
  const optionsStart = ordersSource.indexOf('function ordersCreateWorkspaceOptions()')
  const optionsEnd = ordersSource.indexOf('function ordersCreateWorkspaceSelectedObject', optionsStart)

  assert.notEqual(optionsStart, -1, 'Brak zrodla obiektow kreatora')
  assert.notEqual(optionsEnd, -1, 'Nie udalo sie wyodrebnic zrodla obiektow kreatora')

  const optionsSource = ordersSource.slice(optionsStart, optionsEnd)
  assert.match(optionsSource, /:\s*\[\{ label: ordersClientAddressLabel\(data\), meta: '' \}\]/)
  assert.doesNotMatch(optionsSource, /\.filter\(\(row\) => String\(row\?\.label/)
  assert.match(optionsSource, /address:\s*String\(row\.label \?\? ''\)\.trim\(\)/)
})

test('zasady zlecenia rozrozniaja tryb jednorazowy i cykliczny', async () => {
  const {
    createOrderCreateDraft,
    orderCreateValidation,
  } = await loadCreatorModel()
  const featureSource = readSource(creatorRoot, 'index.js')
  const oneOff = createOrderCreateDraft({ scheduleMode: 'ONE_OFF' })
  const recurring = createOrderCreateDraft({
    scheduleMode: 'RECURRING',
    recurrenceUntil: '2026-12-31',
    recurrenceUntilConfirmed: true,
    weekdays: [1, 3, 5],
  })

  assert.equal(oneOff.scheduleMode, 'ONE_OFF')
  assert.equal(recurring.scheduleMode, 'RECURRING')
  assert.deepEqual(recurring.weekdays, [1, 3, 5])
  assert.equal(
    orderCreateValidation({ ...recurring, objectId: 'O-1' }).errors.some((issue) => (
      ['RECURRENCE_UNTIL_REQUIRED', 'RECURRENCE_CONFIRMATION_REQUIRED'].includes(issue.code)
    )),
    false,
  )
  assert.match(featureSource, /ONE_OFF/)
  assert.match(featureSource, /RECURRING/)
})

test('obsada rozroznia staly zespol, zmiane cotygodniowa i bufor', async () => {
  const {
    createOrderCreateDraft,
    orderCreateValidation,
    serializeOrderCreateDraft,
  } = await loadCreatorModel()
  const featureSource = readSource(creatorRoot, 'index.js')

  const fixed = createOrderCreateDraft({ staffingMode: 'FIXED', workerIds: [] })
  const variable = createOrderCreateDraft({ staffingMode: 'VARIABLE_WEEKLY', workerIds: [] })
  const buffer = createOrderCreateDraft({ staffingMode: 'BUFFER', workerIds: [] })

  assert.equal(orderCreateValidation(fixed).errors.some((issue) => issue.code === 'ASSIGNEE_REQUIRED'), true)
  assert.equal(orderCreateValidation(variable).errors.some((issue) => issue.code === 'ASSIGNEE_REQUIRED'), false)
  assert.equal(orderCreateValidation(buffer).errors.some((issue) => issue.code === 'ASSIGNEE_REQUIRED'), false)
  assert.equal(serializeOrderCreateDraft(variable).assignmentMode, 'VARIABLE_WEEKLY')
  assert.equal(serializeOrderCreateDraft(buffer).assignmentMode, 'BUFFER')

  assert.match(featureSource, /FIXED/)
  assert.match(featureSource, /VARIABLE_WEEKLY/)
  assert.match(featureSource, /BUFFER/)
})

test('kreator pokazuje braki biezacego kroku i prowadzi do pierwszego wymaganego pola', () => {
  const featureSource = readSource(creatorRoot, 'index.js')
  const stylesSource = readSource(creatorRoot, 'orderCreate.css')

  assert.match(featureSource, /function stepRequirementsHtml\(/)
  assert.match(featureSource, /Do uzupełnienia w tym kroku:/)
  assert.match(featureSource, /Nie możemy jeszcze przejść dalej/)
  assert.match(featureSource, /data-order-create-error-target=/)
  assert.match(featureSource, /function focusValidationIssue\(/)
  assert.match(featureSource, /scrollIntoView\?\.\(\{ block: 'center', behavior: 'smooth' \}\)/)
  assert.match(featureSource, /aria-invalid="true"/)
  assert.match(featureSource, /class="order-create-v2__required"/)
  assert.match(featureSource, /do uzupełnienia teraz/)
  assert.match(featureSource, /w kolejnych krokach/)
  assert.match(featureSource, /order-create-v2__button-count/)

  assert.match(stylesSource, /\.order-create-v2__step-requirements/)
  assert.match(stylesSource, /\.order-create-v2__required/)
  assert.match(stylesSource, /\.order-create-v2__field\.has-error/)
  assert.match(stylesSource, /\.order-create-v2__summary-missing/)
})

test('potwierdzenia ostrzezen maja standardowy checkbox zamiast rozciagnietego pola formularza', () => {
  const stylesSource = readSource(creatorRoot, 'orderCreate.css')

  assert.match(
    stylesSource,
    /\.order-create-v2__issues--warnings\s*>\s*label\s*>\s*input\s*\{[^}]*width:\s*16px\s*!important;[^}]*height:\s*16px\s*!important;[^}]*min-height:\s*16px\s*!important;[^}]*padding:\s*0\s*!important;/s,
  )
  assert.match(
    stylesSource,
    /\.order-create-v2__issues--warnings\s*>\s*label\s*\{[^}]*align-items:\s*flex-start;/s,
  )
})

test('lista zlecen pokazuje robocze zlecenia i pozwala kontynuowac ich edycje w V2', () => {
  const ordersSource = readSource(portalSourceRoot, 'features', 'orders', 'index.js')
  const ordersTemplate = readSource(portalSourceRoot, 'features', 'orders', 'list', 'template.html')

  assert.match(ordersTemplate, /data-orders-quick-filter=["']draft["'][^>]*>Robocze</)
  assert.match(ordersTemplate, /<option value=["']draft["']>Robocze<\/option>/)
  assert.match(ordersSource, /case ["']draft["]:\s*return ["']Robocze["']/)
  assert.match(ordersSource, /ordersListActionButtonHtml\(["']continue["']/)
  assert.match(ordersSource, /Kontynuuj edycj(?:ę|\\u0119)/)
  assert.match(ordersSource, /async function ordersContinueJobCardDraft\(/)
  assert.match(ordersSource, /openOrderCreateWorkspace\(\{[\s\S]*draft:\s*editorDraft[\s\S]*sourceRoute:\s*["']orders["'][\s\S]*returnRoute:\s*["']orders["']/)
})

test('lista pobiera szkice osobno od materializowanych zlecen i scala je bez udawania rekordu task', () => {
  const ordersSource = readSource(portalSourceRoot, 'features', 'orders', 'index.js')
  const serviceSource = readSource(portalSourceRoot, 'services', 'jobCardService.js')

  assert.match(serviceSource, /export async function listJobCardDrafts\(/)
  assert.match(serviceSource, /method:\s*["']GET["']/)
  assert.match(serviceSource, /limit/)
  assert.match(serviceSource, /cursor/)
  assert.match(serviceSource, /export async function fetchJobCardDraft\(/)
  assert.match(ordersSource, /async function ordersLoadJobCardDrafts\(/)
  assert.match(ordersSource, /function ordersRowsFromJobCardDrafts\(/)
  assert.match(ordersSource, /materialized:\s*false/)
  assert.match(ordersSource, /status:\s*["']draft["']/)
  assert.match(ordersSource, /\.\.\.ordersRowsFromJobCardDrafts\(\)/)
})

test('wznowiony kreator zachowuje ID roboczego zlecenia przy kolejnym zapisie', () => {
  const featureSource = readSource(creatorRoot, 'index.js')
  const ordersSource = readSource(portalSourceRoot, 'features', 'orders', 'index.js')
  const serviceSource = readSource(portalSourceRoot, 'services', 'jobCardService.js')

  assert.match(featureSource, /savedOrderId:\s*String\(draftSeed\?\.(?:id|orderId)/)
  assert.match(featureSource, /state\.savedOrderId\s*=\s*stringValue\(savedOrder\?\.id,\s*savedOrder\?\.orderId,\s*state\.draft\.id\)/)
  assert.match(ordersSource, /orderId:\s*String\(draft\?\.orderId\s*\?\?\s*draft\?\.id/)
  assert.match(serviceSource, /\.\.\.\(normalizedOrderId\s*\?\s*\{\s*orderId:\s*normalizedOrderId\s*\}\s*:\s*\{\}\)/)
})

test('zapis V2 wysyla pelny editorDraft, a wznowienie nie uruchamia starego edytora', () => {
  const ordersSource = readSource(portalSourceRoot, 'features', 'orders', 'index.js')
  const serviceSource = readSource(portalSourceRoot, 'services', 'jobCardService.js')

  assert.match(serviceSource, /saveJobCardDraft\(orgId,\s*\{[\s\S]*editorDraft[\s\S]*jobCardDraft[\s\S]*order/)
  assert.match(serviceSource, /body:\s*JSON\.stringify\(\{[\s\S]*editorDraft[\s\S]*orgId/)
  assert.match(ordersSource, /saveJobCardDraft\(orgId,\s*\{[\s\S]*editorDraft:\s*draft/)

  const resumeStart = ordersSource.indexOf('async function ordersContinueJobCardDraft(')
  const resumeEnd = ordersSource.indexOf('\n  function ', resumeStart)
  assert.notEqual(resumeStart, -1, 'Brak obslugi wznowienia roboczego zlecenia')
  const resumeSource = ordersSource.slice(resumeStart, resumeEnd === -1 ? undefined : resumeEnd)
  assert.match(resumeSource, /fetchJobCardDraft\(/)
  assert.match(resumeSource, /openOrderCreateWorkspace\(/)
  assert.doesNotMatch(resumeSource, /ordersOpenEditor\(/)
})

test('publikacja zapisuje najnowsze zmiany wznowionego roboczego zlecenia', () => {
  const featureSource = readSource(creatorRoot, 'index.js')
  const publishStart = featureSource.indexOf('async function publish()')
  const publishEnd = featureSource.indexOf('\n  async function cancel()', publishStart)

  assert.notEqual(publishStart, -1, 'Brak funkcji publikacji kreatora')
  assert.notEqual(publishEnd, -1, 'Nie udalo sie wyodrebnic funkcji publikacji kreatora')

  const publishSource = featureSource.slice(publishStart, publishEnd)
  assert.match(publishSource, /if \(!state\.savedOrderId \|\| state\.dirty\) \{[\s\S]*await saveDraft\(\)/)
  assert.match(publishSource, /await callback\(state\.savedOrderId/)
})

test('udana publikacja pozostaje sukcesem, gdy pozniejsza synchronizacja listy zawiedzie', () => {
  const ordersSource = readSource(portalSourceRoot, 'features', 'orders', 'index.js')
  const featureSource = readSource(creatorRoot, 'index.js')
  const adapterStart = ordersSource.indexOf('async function ordersPublishCreateWorkspaceJobCard(')
  const adapterEnd = ordersSource.indexOf('\n  return {', adapterStart)
  const adapterSource = ordersSource.slice(adapterStart, adapterEnd)

  assert.match(adapterSource, /const result = await publishJobCard\([\s\S]*let synchronizationWarning = ''/)
  assert.match(adapterSource, /try \{[\s\S]*await ordersSyncRemoteTimelineOrders\(\{ render: false \}\)[\s\S]*\} catch \(error\) \{/)
  assert.match(adapterSource, /publication succeeded, timeline synchronization failed/)
  assert.match(adapterSource, /return synchronizationWarning[\s\S]*synchronizationWarning/)
  assert.match(featureSource, /const synchronizationWarning = stringValue\(result\?\.synchronizationWarning\)[\s\S]*notify\(synchronizationWarning, 'warning'\)/)
})

test('KPI roboczych oznacza czesciowy wynik plusem, gdy istnieje kolejna strona', () => {
  const ordersSource = readSource(portalSourceRoot, 'features', 'orders', 'index.js')

  assert.match(
    ordersSource,
    /ordersListSetText\('ordersKpiDraft', appState\.ordersJobCardDraftsHasMore \? `\$\{drafts\}\+` : drafts\)/,
  )
})

test('kreator zapisuje i publikuje dokładnie zaakceptowaną wersję roboczego zlecenia', () => {
  const featureSource = readSource(creatorRoot, 'index.js')
  const ordersSource = readSource(portalSourceRoot, 'features', 'orders', 'index.js')
  const serviceSource = readSource(portalSourceRoot, 'services', 'jobCardService.js')

  assert.match(featureSource, /savedDraftHash:\s*String\(seed\?\.draftHash/)
  assert.match(featureSource, /expectedDraftHash:\s*state\.savedDraftHash/)
  assert.match(featureSource, /state\.savedDraftHash\s*=\s*savedDraftHash \|\| state\.savedDraftHash/)
  assert.match(featureSource, /callback\(state\.savedOrderId, \[\.\.\.state\.acknowledgements\], state\.savedDraftHash\)/)
  assert.match(ordersSource, /const draftHash = String\(result\?\.draft\?\.draftHash/)
  assert.match(ordersSource, /openOrderCreateWorkspace\(\{[\s\S]*draftHash/)
  assert.match(ordersSource, /ordersSaveCreateWorkspaceDraft\(draft = \{\}, options = \{\}\)/)
  assert.match(ordersSource, /expectedDraftHash:\s*String\(options\?\.expectedDraftHash/)
  assert.match(ordersSource, /ordersPublishCreateWorkspaceJobCard\(orderId = '', acknowledgements = \[\], expectedDraftHash = ''\)/)
  assert.doesNotMatch(
    ordersSource.slice(
      ordersSource.indexOf('async function ordersPublishCreateWorkspaceJobCard'),
      ordersSource.indexOf('\n  return {', ordersSource.indexOf('async function ordersPublishCreateWorkspaceJobCard')),
    ),
    /fetchJobCardState/,
  )
  assert.match(serviceSource, /expectedDraftHash = ''/)
  assert.match(serviceSource, /normalizedExpectedDraftHash/)
})

test('zmiana organizacji uniewaznia odpowiedz starego zapytania o robocze zlecenia', () => {
  const ordersSource = readSource(portalSourceRoot, 'features', 'orders', 'index.js')

  assert.match(ordersSource, /ordersJobCardDraftsRequestToken/)
  assert.match(ordersSource, /function ordersIsCurrentJobCardDraftRequest\(/)
  assert.match(ordersSource, /await listJobCardDrafts\([\s\S]*if \(!ordersIsCurrentJobCardDraftRequest\(orgId, requestToken\)\) \{\s*return false/)
  assert.match(ordersSource, /finally \{\s*if \(ordersIsCurrentJobCardDraftRequest\(orgId, requestToken\)\)/)
})

test('przycisk pokaz wszystkie robocze dziala przez standardowe zdarzenie click', () => {
  const ordersSource = readSource(portalSourceRoot, 'features', 'orders', 'index.js')
  const clickStart = ordersSource.indexOf("binding.add(root, 'click', (event) => {")
  const keydownStart = ordersSource.indexOf("binding.add(root, 'keydown', (event) => {", clickStart)

  assert.notEqual(clickStart, -1, 'Brak glownej obslugi klikniec listy zlecen')
  assert.notEqual(keydownStart, -1, 'Brak obslugi klawiatury listy zlecen')

  const clickSource = ordersSource.slice(clickStart, keydownStart)
  const keydownEnd = ordersSource.indexOf("binding.add(root, 'input'", keydownStart)
  const keydownSource = ordersSource.slice(keydownStart, keydownEnd === -1 ? undefined : keydownEnd)
  assert.match(clickSource, /#ordersDraftsShowAll[\s\S]*ordersLoadAllJobCardDrafts\(\)/)
  assert.doesNotMatch(keydownSource, /#ordersDraftsShowAll/)
})
