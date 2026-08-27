import {
  addWorkerIdentityKey,
  prepareWorkerDelete,
  prepareWorkerSave,
  workerIdentityKeys,
} from '../domain/workerCrudModel.js'

function workerPhotoUrl(worker = null) {
  return String(worker?.photoUrl ?? worker?.profilePhotoUrl ?? '').trim()
}

function buildCreatedOptimisticWorker(orgId, payload, createdUser) {
  const createdLogin = String(createdUser?.login ?? createdUser?.workerLogin ?? '').trim()
  return {
    ...payload,
    ...createdUser,
    orgId,
    id: createdUser?.workerId ?? createdUser?.id ?? createdLogin,
    workerId: createdUser?.workerId ?? createdUser?.id ?? createdLogin,
    login: createdLogin,
    workerLogin: createdLogin,
    workerName: createdUser?.workerName ?? createdUser?.name ?? payload.name,
    name: createdUser?.name ?? createdUser?.workerName ?? payload.name,
    fullName: createdUser?.fullName ?? createdUser?.workerName ?? createdUser?.name ?? payload.name,
    role: createdUser?.role ?? payload.role,
    type: createdUser?.workerType ?? createdUser?.type ?? payload.workerType,
    workerType: createdUser?.workerType ?? createdUser?.type ?? payload.workerType,
    active: payload.active,
    email: createdUser?.email ?? payload.email,
    loginEmail: createdUser?.loginEmail ?? createdUser?.email ?? payload.email,
    phone: createdUser?.phone ?? payload.phone,
    photoUrl: createdUser?.photoUrl ?? createdUser?.profilePhotoUrl ?? '',
    profilePhotoUrl: createdUser?.profilePhotoUrl ?? createdUser?.photoUrl ?? '',
    authUid: createdUser?.authUid ?? '',
  }
}

function buildUpdatedOptimisticWorker(currentWorker, payload, updatedWorker, workerId, currentLogin, editedBy) {
  const updatedLogin = String(updatedWorker?.login ?? currentLogin).trim() || currentLogin
  const fallbackPhotoUrl = payload.removePhoto ? '' : workerPhotoUrl(currentWorker)
  const finalWorkerId =
    String(
      updatedWorker?.workerId ?? workerId ?? updatedWorker?.id ?? currentWorker?.workerId ?? currentWorker?.id ?? updatedLogin,
    ).trim() || updatedLogin

  return {
    ...(currentWorker ?? {}),
    ...updatedWorker,
    id: finalWorkerId,
    workerId: finalWorkerId,
    login: updatedLogin,
    workerLogin: updatedLogin,
    workerName: payload.name,
    fullName: payload.name,
    name: payload.name,
    role: updatedWorker?.role ?? payload.role,
    type: updatedWorker?.workerType ?? updatedWorker?.type ?? payload.workerType,
    workerType: updatedWorker?.workerType ?? updatedWorker?.type ?? payload.workerType,
    active: payload.active,
    email: updatedWorker?.email ?? payload.email,
    loginEmail: updatedWorker?.loginEmail ?? updatedWorker?.email ?? payload.email,
    phone: updatedWorker?.phone ?? payload.phone,
    photoUrl: updatedWorker?.photoUrl ?? updatedWorker?.profilePhotoUrl ?? fallbackPhotoUrl,
    profilePhotoUrl: updatedWorker?.profilePhotoUrl ?? updatedWorker?.photoUrl ?? fallbackPhotoUrl,
    editedBy,
  }
}

export function createWorkerCrudController({ gateway } = {}) {
  if (!gateway) {
    throw new Error('Brak adaptera danych dla modułu zarządzania pracownikami.')
  }

  async function save(input = {}) {
    const prepared = prepareWorkerSave(input)
    if (!prepared.ok) return prepared

    const orgId = String(input.orgId ?? '').trim()
    const currentWorker = input.currentWorker ?? null
    const editedBy = String(input.editedBy ?? '').trim()
    const { payload, password, workerNumberOverride, currentLogin } = prepared

    if (prepared.isAdding) {
      const createdUser = await gateway.create(orgId, {
        ...payload,
        displayName: payload.name,
        password,
        role: payload.role,
        workerType: payload.workerType,
        ...(workerNumberOverride ? { workerNumberOverride } : {}),
      })
      const optimisticWorker = buildCreatedOptimisticWorker(orgId, payload, createdUser)
      const addedName = String(createdUser?.name ?? createdUser?.workerName ?? payload.name).trim()
      return {
        ...prepared,
        optimisticWorker,
        optimisticPreviousKey: '',
        successNotice: `Dodano użytkownika: ${addedName || payload.name || payload.email}.`,
      }
    }

    const workerId = String(payload.workerId ?? currentWorker?.workerId ?? currentWorker?.id ?? '').trim()
    const updatedWorker = await gateway.update(orgId, currentLogin, {
      workerId,
      name: payload.name,
      workerName: payload.name,
      login: currentLogin,
      role: payload.role,
      workerType: payload.workerType,
      active: payload.active,
      email: payload.email,
      loginEmail: payload.email,
      phone: payload.phone,
      editedBy,
      edit: editedBy,
      authUid: currentWorker?.authUid ?? '',
      ...(payload.photoDataUrl ? { photoDataUrl: payload.photoDataUrl } : {}),
      ...(payload.removePhoto ? { removePhoto: true, photoUrl: '' } : {}),
    })
    const optimisticWorker = buildUpdatedOptimisticWorker(
      currentWorker,
      payload,
      updatedWorker,
      workerId,
      currentLogin,
      editedBy,
    )
    const authWarning = String(updatedWorker?.authWarning ?? '').trim()
    let successNotice = authWarning ? `Zmiany zapisano. ${authWarning}` : 'Zmiany zapisano.'
    if (password) {
      const passwordResult = await gateway.setPassword(orgId, optimisticWorker.login, password)
      successNotice = passwordResult?.authCreated
        ? 'Odtworzono konto Firebase Auth i ustawiono hasło.'
        : 'Hasło ustawiono w Firebase Auth.'
    }

    return {
      ...prepared,
      optimisticWorker,
      optimisticPreviousKey: currentLogin,
      successNotice,
    }
  }

  function validateDelete(input = {}) {
    return prepareWorkerDelete(input)
  }

  async function remove(input = {}) {
    const prepared = input.prepared?.ok ? input.prepared : prepareWorkerDelete(input)
    if (!prepared.ok) return prepared

    const targetWorker = prepared.worker
    const result = await gateway.remove(prepared.orgId, prepared.login, {
      login: prepared.login,
      workerId: targetWorker?.workerId ?? targetWorker?.id ?? '',
      authUid: targetWorker?.authUid ?? '',
    })
    const deletedLogin = String(result?.deletedLogin ?? prepared.login).trim()
    const deletedKeys = [
      prepared.login,
      deletedLogin,
      targetWorker?.workerId,
      targetWorker?.id,
      targetWorker?.workerLogin,
    ]
    const identityKeys = workerIdentityKeys(targetWorker)
    deletedKeys.forEach((value) => addWorkerIdentityKey(identityKeys, value))
    return {
      ...prepared,
      result,
      deletedLogin,
      deletedKeys,
      identityKeys,
      authWarning: String(result?.authWarning ?? '').trim(),
    }
  }

  return Object.freeze({ save, validateDelete, remove })
}
