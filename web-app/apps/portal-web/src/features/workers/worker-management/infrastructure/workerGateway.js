function requireOperation(operation, name) {
  if (typeof operation !== 'function') {
    throw new Error(`Brak operacji ${name} w adapterze zarządzania pracownikami.`)
  }
  return operation
}

export function createWorkerGateway({
  createWorkerUser,
  updateWorker,
  deleteWorker,
  setWorkerPassword,
} = {}) {
  const createOperation = requireOperation(createWorkerUser, 'createWorkerUser')
  const updateOperation = requireOperation(updateWorker, 'updateWorker')
  const deleteOperation = requireOperation(deleteWorker, 'deleteWorker')
  const passwordOperation = requireOperation(setWorkerPassword, 'setWorkerPassword')

  return Object.freeze({
    create: (orgId, payload) => createOperation(orgId, payload),
    update: (orgId, login, payload) => updateOperation(orgId, login, payload),
    remove: (orgId, login, payload) => deleteOperation(orgId, login, payload),
    setPassword: (orgId, login, password) => passwordOperation(orgId, login, password),
  })
}
