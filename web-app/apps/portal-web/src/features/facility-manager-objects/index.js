import './style.css'
import template from './template.html?raw'
import { createFacilityManagerObject, listFacilityManagerObjects } from '../../services/facilityManagerObjectService'

export const route = 'managerObjects'
export const viewId = 'view-managerObjects'
export { template }

function text(value) {
  return String(value ?? '').trim()
}

function createClientActionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `fmobj_${Date.now()}_${Math.random().toString(36).slice(2, 18)}`
}

function compactText(value) {
  return text(value).replace(/\s+/g, ' ')
}

function normalizedPostalCode(value) {
  const raw = compactText(value).replace(/\s+/g, '')
  return /^\d{5}$/.test(raw) ? `${raw.slice(0, 2)}-${raw.slice(2)}` : raw
}

function createActionPayloadKey(payload) {
  return JSON.stringify({
    orgId: text(payload?.orgId),
    name: compactText(payload?.name),
    addressLine1: compactText(payload?.addressLine1),
    postalCode: normalizedPostalCode(payload?.postalCode),
    city: compactText(payload?.city),
    reference: compactText(payload?.reference),
  })
}

function objectAddress(item) {
  return [text(item?.addressLine1), [text(item?.postalCode), text(item?.city)].filter(Boolean).join(' ')].filter(Boolean).join(', ')
}

export function createFacilityManagerObjectsFeature(ctx) {
  const { appState, createBindingHelpers, escapeHtml, showTransientNotice } = ctx
  let objects = []
  // A retry after a lost HTTP response must use the same idempotency key.
  // Keys live only for this feature instance and are discarded after a
  // confirmed response or when the page is left.
  const pendingCreateActions = new Map()
  const byId = (id) => document.getElementById(id)
  const orgId = () => text(appState.session?.activeOrgId || appState.session?.orgId)
  const isFacilityManager = () => text(appState.session?.organizationKind).toUpperCase() === 'FACILITY_MANAGER'

  function setNotice(message = '', tone = '') {
    const node = byId('facilityManagerObjectsNotice')
    if (!node) return
    node.textContent = text(message)
    node.dataset.tone = message ? tone : ''
  }

  function setBusy(isBusy) {
    const submit = byId('facilityManagerObjectSubmit')
    const refresh = byId('facilityManagerObjectsRefresh')
    const form = byId('facilityManagerObjectForm')
    if (form) form.setAttribute('aria-busy', String(Boolean(isBusy)))
    if (submit) {
      submit.disabled = isBusy
      submit.textContent = isBusy ? 'Zapisywanie...' : 'Zapisz obiekt'
    }
    if (refresh) refresh.disabled = isBusy
  }

  function renderList() {
    const root = byId('facilityManagerObjectsList')
    const count = byId('facilityManagerObjectsCount')
    if (count) count.textContent = String(objects.length)
    if (!root) return
    if (!objects.length) {
      root.innerHTML = `
        <div class="facility-manager-objects__empty">
          <strong>Nie masz jeszcze żadnego obiektu.</strong>
          <span>Uzupełnij formularz obok — po zapisie pozostanie w Twoim panelu.</span>
        </div>
      `
      return
    }
    root.innerHTML = objects.map((item) => `
      <article class="facility-manager-objects__item">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(objectAddress(item))}</span>
        ${text(item.reference) ? `<small>Oznaczenie: ${escapeHtml(item.reference)}</small>` : ''}
      </article>
    `).join('')
  }

  function setFieldError(input, invalid) {
    if (input) input.setAttribute('aria-invalid', String(Boolean(invalid)))
  }

  function validateForm() {
    const name = byId('facilityManagerObjectName')
    const addressLine1 = byId('facilityManagerObjectAddress')
    const postalCode = byId('facilityManagerObjectPostalCode')
    const city = byId('facilityManagerObjectCity')
    const fields = [name, addressLine1, postalCode, city]
    fields.forEach((field) => setFieldError(field, false))
    const invalid = fields.find((field) => !text(field?.value) || !field.checkValidity())
    if (invalid) {
      setFieldError(invalid, true)
      setNotice('Uzupełnij wymagane dane obiektu. Kod pocztowy wpisz w formacie 00-000.', 'error')
      invalid.focus()
      return null
    }
    return {
      orgId: orgId(),
      name: name.value,
      addressLine1: addressLine1.value,
      postalCode: postalCode.value,
      city: city.value,
      reference: byId('facilityManagerObjectReference')?.value || '',
    }
  }

  function createPayloadWithPendingAction(payload) {
    const actionKey = createActionPayloadKey(payload)
    let clientActionId = pendingCreateActions.get(actionKey)
    if (!clientActionId) {
      clientActionId = createClientActionId()
      pendingCreateActions.set(actionKey, clientActionId)
    }
    return {
      actionKey,
      payload: { ...payload, clientActionId },
    }
  }

  async function refresh() {
    if (!isFacilityManager()) {
      objects = []
      renderList()
      setNotice('Ten ekran jest dostępny wyłącznie dla panelu zarządcy.', 'error')
      return
    }
    setBusy(true)
    setNotice('')
    try {
      const payload = await listFacilityManagerObjects(orgId())
      objects = Array.isArray(payload?.objects) ? payload.objects : []
      renderList()
    } catch (error) {
      objects = []
      renderList()
      setNotice(error instanceof Error ? error.message : 'Nie udało się pobrać obiektów.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function submit(event) {
    event?.preventDefault?.()
    const formPayload = validateForm()
    if (!formPayload) return
    const action = createPayloadWithPendingAction(formPayload)
    setBusy(true)
    setNotice('')
    try {
      await createFacilityManagerObject(action.payload)
      // Only a confirmed API response consumes the local retry key.
      pendingCreateActions.delete(action.actionKey)
      byId('facilityManagerObjectForm')?.reset()
      await refresh()
      const message = 'Obiekt został zapisany w Twoim panelu. Kolejnym krokiem będzie podłączenie firmy sprzątającej.'
      setNotice(message, 'success')
      showTransientNotice?.(message, 'success')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Nie udało się dodać obiektu.', 'error')
    } finally {
      setBusy(false)
    }
  }

  function bind() {
    const binding = createBindingHelpers()
    binding.add(byId('facilityManagerObjectForm'), 'submit', (event) => void submit(event))
    binding.add(byId('facilityManagerObjectsRefresh'), 'click', () => void refresh())
    return () => binding.done()
  }

  return { bind, refresh }
}
