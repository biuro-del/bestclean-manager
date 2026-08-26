import { normalizeWorkerEmail } from '../domain/workerCrudModel.js'

const BASIC_FIELD_IDS = ['wkEditId', 'wkEditNumber', 'wkEditName', 'wkEditEmail', 'wkEditRole', 'wkEditType']
const PASSWORD_FIELD_IDS = ['wkNewPass', 'wkNewPass2']

export function createWorkerFormView(documentRef = globalThis.document) {
  if (!documentRef?.getElementById) {
    throw new Error('Brak dokumentu dla formularza zarządzania pracownikami.')
  }

  const byId = (id) => documentRef.getElementById(id)

  function read({ active, composedWorkerId = '' } = {}) {
    const numberInput = byId('wkEditNumber')
    return {
      workerId: String(byId('wkEditId')?.value ?? '').trim(),
      composedWorkerId: String(composedWorkerId ?? '').trim(),
      workerNumber: String(numberInput?.value ?? '').trim(),
      workerNumberManual: numberInput?.dataset?.manual === '1',
      name: String(byId('wkEditName')?.value ?? '').trim(),
      role: byId('wkEditRole')?.value,
      workerType: byId('wkEditType')?.value,
      active: Boolean(active),
      email: normalizeEmailField(),
      phone: String(byId('wkEditPhone')?.value ?? '').trim(),
      password: String(byId('wkNewPass')?.value ?? '').trim(),
      repeatedPassword: String(byId('wkNewPass2')?.value ?? '').trim(),
    }
  }

  function normalizeEmailField() {
    const input = byId('wkEditEmail')
    const email = normalizeWorkerEmail(input?.value)
    if (input && 'value' in input) input.value = email
    return email
  }

  function clearError(errorId, fieldIds) {
    const error = byId(errorId)
    if (error) {
      error.textContent = ''
      error.hidden = true
    }
    fieldIds.forEach((id) => byId(id)?.removeAttribute?.('aria-invalid'))
  }

  function setError(errorId, message, focusId) {
    const text = String(message ?? '').trim()
    const error = byId(errorId)
    if (error) {
      error.textContent = text
      error.hidden = !text
    }
    if (!text) return
    const target = byId(focusId)
    target?.setAttribute?.('aria-invalid', 'true')
    target?.focus?.()
  }

  function setPending(buttonId, pending) {
    const button = byId(buttonId)
    if (button) button.disabled = Boolean(pending)
  }

  return Object.freeze({
    read,
    clearBasicError: () => clearError('wkBasicError', BASIC_FIELD_IDS),
    clearPasswordError: () => clearError('wkPasswordError', PASSWORD_FIELD_IDS),
    setBasicError: (message, focusId = 'wkEditName') => setError('wkBasicError', message, focusId),
    setPasswordError: (message, focusId = 'wkNewPass') => setError('wkPasswordError', message, focusId),
    isSavePending: () => Boolean(byId('wkSaveBtn')?.disabled),
    setSavePending: (pending) => setPending('wkSaveBtn', pending),
    setDeletePending: (pending) => setPending('wkDeleteBtn', pending),
  })
}
