const { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'example',
  service: 'iclean-room-service',
  location: 'europe-west3'
};
exports.connectorConfig = connectorConfig;

const insertClientForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertClientForOrg', inputVars);
}
insertClientForOrgRef.operationName = 'InsertClientForOrg';
exports.insertClientForOrgRef = insertClientForOrgRef;

exports.insertClientForOrg = function insertClientForOrg(dcOrVars, vars) {
  return executeMutation(insertClientForOrgRef(dcOrVars, vars));
};

const updateClientForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateClientForOrg', inputVars);
}
updateClientForOrgRef.operationName = 'UpdateClientForOrg';
exports.updateClientForOrgRef = updateClientForOrgRef;

exports.updateClientForOrg = function updateClientForOrg(dcOrVars, vars) {
  return executeMutation(updateClientForOrgRef(dcOrVars, vars));
};

const deleteClientForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteClientForOrg', inputVars);
}
deleteClientForOrgRef.operationName = 'DeleteClientForOrg';
exports.deleteClientForOrgRef = deleteClientForOrgRef;

exports.deleteClientForOrg = function deleteClientForOrg(dcOrVars, vars) {
  return executeMutation(deleteClientForOrgRef(dcOrVars, vars));
};

const insertIndividualJobForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertIndividualJobForOrg', inputVars);
}
insertIndividualJobForOrgRef.operationName = 'InsertIndividualJobForOrg';
exports.insertIndividualJobForOrgRef = insertIndividualJobForOrgRef;

exports.insertIndividualJobForOrg = function insertIndividualJobForOrg(dcOrVars, vars) {
  return executeMutation(insertIndividualJobForOrgRef(dcOrVars, vars));
};

const updateIndividualJobForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateIndividualJobForOrg', inputVars);
}
updateIndividualJobForOrgRef.operationName = 'UpdateIndividualJobForOrg';
exports.updateIndividualJobForOrgRef = updateIndividualJobForOrgRef;

exports.updateIndividualJobForOrg = function updateIndividualJobForOrg(dcOrVars, vars) {
  return executeMutation(updateIndividualJobForOrgRef(dcOrVars, vars));
};

const deleteIndividualJobForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteIndividualJobForOrg', inputVars);
}
deleteIndividualJobForOrgRef.operationName = 'DeleteIndividualJobForOrg';
exports.deleteIndividualJobForOrgRef = deleteIndividualJobForOrgRef;

exports.deleteIndividualJobForOrg = function deleteIndividualJobForOrg(dcOrVars, vars) {
  return executeMutation(deleteIndividualJobForOrgRef(dcOrVars, vars));
};

const upsertTaskForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpsertTaskForOrg', inputVars);
}
upsertTaskForOrgRef.operationName = 'UpsertTaskForOrg';
exports.upsertTaskForOrgRef = upsertTaskForOrgRef;

exports.upsertTaskForOrg = function upsertTaskForOrg(dcOrVars, vars) {
  return executeMutation(upsertTaskForOrgRef(dcOrVars, vars));
};

const deleteTaskForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteTaskForOrg', inputVars);
}
deleteTaskForOrgRef.operationName = 'DeleteTaskForOrg';
exports.deleteTaskForOrgRef = deleteTaskForOrgRef;

exports.deleteTaskForOrg = function deleteTaskForOrg(dcOrVars, vars) {
  return executeMutation(deleteTaskForOrgRef(dcOrVars, vars));
};

const insertZoneForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertZoneForOrg', inputVars);
}
insertZoneForOrgRef.operationName = 'InsertZoneForOrg';
exports.insertZoneForOrgRef = insertZoneForOrgRef;

exports.insertZoneForOrg = function insertZoneForOrg(dcOrVars, vars) {
  return executeMutation(insertZoneForOrgRef(dcOrVars, vars));
};

const updateZoneForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateZoneForOrg', inputVars);
}
updateZoneForOrgRef.operationName = 'UpdateZoneForOrg';
exports.updateZoneForOrgRef = updateZoneForOrgRef;

exports.updateZoneForOrg = function updateZoneForOrg(dcOrVars, vars) {
  return executeMutation(updateZoneForOrgRef(dcOrVars, vars));
};

const insertZoneWithRequiredVisitForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertZoneWithRequiredVisitForOrg', inputVars);
}
insertZoneWithRequiredVisitForOrgRef.operationName = 'InsertZoneWithRequiredVisitForOrg';
exports.insertZoneWithRequiredVisitForOrgRef = insertZoneWithRequiredVisitForOrgRef;

exports.insertZoneWithRequiredVisitForOrg = function insertZoneWithRequiredVisitForOrg(dcOrVars, vars) {
  return executeMutation(insertZoneWithRequiredVisitForOrgRef(dcOrVars, vars));
};

const updateZoneWithRequiredVisitForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateZoneWithRequiredVisitForOrg', inputVars);
}
updateZoneWithRequiredVisitForOrgRef.operationName = 'UpdateZoneWithRequiredVisitForOrg';
exports.updateZoneWithRequiredVisitForOrgRef = updateZoneWithRequiredVisitForOrgRef;

exports.updateZoneWithRequiredVisitForOrg = function updateZoneWithRequiredVisitForOrg(dcOrVars, vars) {
  return executeMutation(updateZoneWithRequiredVisitForOrgRef(dcOrVars, vars));
};

const deleteZoneForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteZoneForOrg', inputVars);
}
deleteZoneForOrgRef.operationName = 'DeleteZoneForOrg';
exports.deleteZoneForOrgRef = deleteZoneForOrgRef;

exports.deleteZoneForOrg = function deleteZoneForOrg(dcOrVars, vars) {
  return executeMutation(deleteZoneForOrgRef(dcOrVars, vars));
};

const insertWorkdayForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertWorkdayForOrg', inputVars);
}
insertWorkdayForOrgRef.operationName = 'InsertWorkdayForOrg';
exports.insertWorkdayForOrgRef = insertWorkdayForOrgRef;

exports.insertWorkdayForOrg = function insertWorkdayForOrg(dcOrVars, vars) {
  return executeMutation(insertWorkdayForOrgRef(dcOrVars, vars));
};

const updateWorkdayForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateWorkdayForOrg', inputVars);
}
updateWorkdayForOrgRef.operationName = 'UpdateWorkdayForOrg';
exports.updateWorkdayForOrgRef = updateWorkdayForOrgRef;

exports.updateWorkdayForOrg = function updateWorkdayForOrg(dcOrVars, vars) {
  return executeMutation(updateWorkdayForOrgRef(dcOrVars, vars));
};

const deleteWorkdayForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteWorkdayForOrg', inputVars);
}
deleteWorkdayForOrgRef.operationName = 'DeleteWorkdayForOrg';
exports.deleteWorkdayForOrgRef = deleteWorkdayForOrgRef;

exports.deleteWorkdayForOrg = function deleteWorkdayForOrg(dcOrVars, vars) {
  return executeMutation(deleteWorkdayForOrgRef(dcOrVars, vars));
};

const insertEventForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertEventForOrg', inputVars);
}
insertEventForOrgRef.operationName = 'InsertEventForOrg';
exports.insertEventForOrgRef = insertEventForOrgRef;

exports.insertEventForOrg = function insertEventForOrg(dcOrVars, vars) {
  return executeMutation(insertEventForOrgRef(dcOrVars, vars));
};

const updateEventForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateEventForOrg', inputVars);
}
updateEventForOrgRef.operationName = 'UpdateEventForOrg';
exports.updateEventForOrgRef = updateEventForOrgRef;

exports.updateEventForOrg = function updateEventForOrg(dcOrVars, vars) {
  return executeMutation(updateEventForOrgRef(dcOrVars, vars));
};

const reidentifyEventForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'ReidentifyEventForOrg', inputVars);
}
reidentifyEventForOrgRef.operationName = 'ReidentifyEventForOrg';
exports.reidentifyEventForOrgRef = reidentifyEventForOrgRef;

exports.reidentifyEventForOrg = function reidentifyEventForOrg(dcOrVars, vars) {
  return executeMutation(reidentifyEventForOrgRef(dcOrVars, vars));
};

const deleteEventForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteEventForOrg', inputVars);
}
deleteEventForOrgRef.operationName = 'DeleteEventForOrg';
exports.deleteEventForOrgRef = deleteEventForOrgRef;

exports.deleteEventForOrg = function deleteEventForOrg(dcOrVars, vars) {
  return executeMutation(deleteEventForOrgRef(dcOrVars, vars));
};

const insertBackupCycleForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertBackupCycleForOrg', inputVars);
}
insertBackupCycleForOrgRef.operationName = 'InsertBackupCycleForOrg';
exports.insertBackupCycleForOrgRef = insertBackupCycleForOrgRef;

exports.insertBackupCycleForOrg = function insertBackupCycleForOrg(dcOrVars, vars) {
  return executeMutation(insertBackupCycleForOrgRef(dcOrVars, vars));
};

const updateBackupCycleForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateBackupCycleForOrg', inputVars);
}
updateBackupCycleForOrgRef.operationName = 'UpdateBackupCycleForOrg';
exports.updateBackupCycleForOrgRef = updateBackupCycleForOrgRef;

exports.updateBackupCycleForOrg = function updateBackupCycleForOrg(dcOrVars, vars) {
  return executeMutation(updateBackupCycleForOrgRef(dcOrVars, vars));
};

const insertStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertStorageForOrg', inputVars);
}
insertStorageForOrgRef.operationName = 'InsertStorageForOrg';
exports.insertStorageForOrgRef = insertStorageForOrgRef;

exports.insertStorageForOrg = function insertStorageForOrg(dcOrVars, vars) {
  return executeMutation(insertStorageForOrgRef(dcOrVars, vars));
};

const updateStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateStorageForOrg', inputVars);
}
updateStorageForOrgRef.operationName = 'UpdateStorageForOrg';
exports.updateStorageForOrgRef = updateStorageForOrgRef;

exports.updateStorageForOrg = function updateStorageForOrg(dcOrVars, vars) {
  return executeMutation(updateStorageForOrgRef(dcOrVars, vars));
};

const deleteStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteStorageForOrg', inputVars);
}
deleteStorageForOrgRef.operationName = 'DeleteStorageForOrg';
exports.deleteStorageForOrgRef = deleteStorageForOrgRef;

exports.deleteStorageForOrg = function deleteStorageForOrg(dcOrVars, vars) {
  return executeMutation(deleteStorageForOrgRef(dcOrVars, vars));
};

const insertClientStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertClientStorageForOrg', inputVars);
}
insertClientStorageForOrgRef.operationName = 'InsertClientStorageForOrg';
exports.insertClientStorageForOrgRef = insertClientStorageForOrgRef;

exports.insertClientStorageForOrg = function insertClientStorageForOrg(dcOrVars, vars) {
  return executeMutation(insertClientStorageForOrgRef(dcOrVars, vars));
};

const updateClientStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateClientStorageForOrg', inputVars);
}
updateClientStorageForOrgRef.operationName = 'UpdateClientStorageForOrg';
exports.updateClientStorageForOrgRef = updateClientStorageForOrgRef;

exports.updateClientStorageForOrg = function updateClientStorageForOrg(dcOrVars, vars) {
  return executeMutation(updateClientStorageForOrgRef(dcOrVars, vars));
};

const deleteClientStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteClientStorageForOrg', inputVars);
}
deleteClientStorageForOrgRef.operationName = 'DeleteClientStorageForOrg';
exports.deleteClientStorageForOrgRef = deleteClientStorageForOrgRef;

exports.deleteClientStorageForOrg = function deleteClientStorageForOrg(dcOrVars, vars) {
  return executeMutation(deleteClientStorageForOrgRef(dcOrVars, vars));
};

const startWorkdayPauseRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'StartWorkdayPause', inputVars);
}
startWorkdayPauseRef.operationName = 'StartWorkdayPause';
exports.startWorkdayPauseRef = startWorkdayPauseRef;

exports.startWorkdayPause = function startWorkdayPause(dcOrVars, vars) {
  return executeMutation(startWorkdayPauseRef(dcOrVars, vars));
};

const stopWorkdayPauseRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'StopWorkdayPause', inputVars);
}
stopWorkdayPauseRef.operationName = 'StopWorkdayPause';
exports.stopWorkdayPauseRef = stopWorkdayPauseRef;

exports.stopWorkdayPause = function stopWorkdayPause(dcOrVars, vars) {
  return executeMutation(stopWorkdayPauseRef(dcOrVars, vars));
};

const myOrganizationsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'MyOrganizations');
}
myOrganizationsRef.operationName = 'MyOrganizations';
exports.myOrganizationsRef = myOrganizationsRef;

exports.myOrganizations = function myOrganizations(dc) {
  return executeQuery(myOrganizationsRef(dc));
};

const canManageWorkersForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'CanManageWorkersForOrg', inputVars);
}
canManageWorkersForOrgRef.operationName = 'CanManageWorkersForOrg';
exports.canManageWorkersForOrgRef = canManageWorkersForOrgRef;

exports.canManageWorkersForOrg = function canManageWorkersForOrg(dcOrVars, vars) {
  return executeQuery(canManageWorkersForOrgRef(dcOrVars, vars));
};

const workersForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkersForOrg', inputVars);
}
workersForOrgRef.operationName = 'WorkersForOrg';
exports.workersForOrgRef = workersForOrgRef;

exports.workersForOrg = function workersForOrg(dcOrVars, vars) {
  return executeQuery(workersForOrgRef(dcOrVars, vars));
};

const clientsForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ClientsForOrg', inputVars);
}
clientsForOrgRef.operationName = 'ClientsForOrg';
exports.clientsForOrgRef = clientsForOrgRef;

exports.clientsForOrg = function clientsForOrg(dcOrVars, vars) {
  return executeQuery(clientsForOrgRef(dcOrVars, vars));
};

const individualJobsForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'IndividualJobsForOrg', inputVars);
}
individualJobsForOrgRef.operationName = 'IndividualJobsForOrg';
exports.individualJobsForOrgRef = individualJobsForOrgRef;

exports.individualJobsForOrg = function individualJobsForOrg(dcOrVars, vars) {
  return executeQuery(individualJobsForOrgRef(dcOrVars, vars));
};

const tasksForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'TasksForOrg', inputVars);
}
tasksForOrgRef.operationName = 'TasksForOrg';
exports.tasksForOrgRef = tasksForOrgRef;

exports.tasksForOrg = function tasksForOrg(dcOrVars, vars) {
  return executeQuery(tasksForOrgRef(dcOrVars, vars));
};

const zonesForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ZonesForOrg', inputVars);
}
zonesForOrgRef.operationName = 'ZonesForOrg';
exports.zonesForOrgRef = zonesForOrgRef;

exports.zonesForOrg = function zonesForOrg(dcOrVars, vars) {
  return executeQuery(zonesForOrgRef(dcOrVars, vars));
};

const workdaysForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysForOrg', inputVars);
}
workdaysForOrgRef.operationName = 'WorkdaysForOrg';
exports.workdaysForOrgRef = workdaysForOrgRef;

exports.workdaysForOrg = function workdaysForOrg(dcOrVars, vars) {
  return executeQuery(workdaysForOrgRef(dcOrVars, vars));
};

const workdaysPageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysPageForOrg', inputVars);
}
workdaysPageForOrgRef.operationName = 'WorkdaysPageForOrg';
exports.workdaysPageForOrgRef = workdaysPageForOrgRef;

exports.workdaysPageForOrg = function workdaysPageForOrg(dcOrVars, vars) {
  return executeQuery(workdaysPageForOrgRef(dcOrVars, vars));
};

const workdaysPageForOrgByBusinessDateRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysPageForOrgByBusinessDate', inputVars);
}
workdaysPageForOrgByBusinessDateRef.operationName = 'WorkdaysPageForOrgByBusinessDate';
exports.workdaysPageForOrgByBusinessDateRef = workdaysPageForOrgByBusinessDateRef;

exports.workdaysPageForOrgByBusinessDate = function workdaysPageForOrgByBusinessDate(dcOrVars, vars) {
  return executeQuery(workdaysPageForOrgByBusinessDateRef(dcOrVars, vars));
};

const workdaysIntegrityPageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysIntegrityPageForOrg', inputVars);
}
workdaysIntegrityPageForOrgRef.operationName = 'WorkdaysIntegrityPageForOrg';
exports.workdaysIntegrityPageForOrgRef = workdaysIntegrityPageForOrgRef;

exports.workdaysIntegrityPageForOrg = function workdaysIntegrityPageForOrg(dcOrVars, vars) {
  return executeQuery(workdaysIntegrityPageForOrgRef(dcOrVars, vars));
};

const workdaysPageForOrgByWorkerRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysPageForOrgByWorker', inputVars);
}
workdaysPageForOrgByWorkerRef.operationName = 'WorkdaysPageForOrgByWorker';
exports.workdaysPageForOrgByWorkerRef = workdaysPageForOrgByWorkerRef;

exports.workdaysPageForOrgByWorker = function workdaysPageForOrgByWorker(dcOrVars, vars) {
  return executeQuery(workdaysPageForOrgByWorkerRef(dcOrVars, vars));
};

const workdaysPageForOrgByWorkerAndStatusRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysPageForOrgByWorkerAndStatus', inputVars);
}
workdaysPageForOrgByWorkerAndStatusRef.operationName = 'WorkdaysPageForOrgByWorkerAndStatus';
exports.workdaysPageForOrgByWorkerAndStatusRef = workdaysPageForOrgByWorkerAndStatusRef;

exports.workdaysPageForOrgByWorkerAndStatus = function workdaysPageForOrgByWorkerAndStatus(dcOrVars, vars) {
  return executeQuery(workdaysPageForOrgByWorkerAndStatusRef(dcOrVars, vars));
};

const workdaysPageForOrgByRoomRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysPageForOrgByRoom', inputVars);
}
workdaysPageForOrgByRoomRef.operationName = 'WorkdaysPageForOrgByRoom';
exports.workdaysPageForOrgByRoomRef = workdaysPageForOrgByRoomRef;

exports.workdaysPageForOrgByRoom = function workdaysPageForOrgByRoom(dcOrVars, vars) {
  return executeQuery(workdaysPageForOrgByRoomRef(dcOrVars, vars));
};

const workdaysPageForOrgByStatusRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysPageForOrgByStatus', inputVars);
}
workdaysPageForOrgByStatusRef.operationName = 'WorkdaysPageForOrgByStatus';
exports.workdaysPageForOrgByStatusRef = workdaysPageForOrgByStatusRef;

exports.workdaysPageForOrgByStatus = function workdaysPageForOrgByStatus(dcOrVars, vars) {
  return executeQuery(workdaysPageForOrgByStatusRef(dcOrVars, vars));
};

const workdaysFingerprintForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysFingerprintForOrg', inputVars);
}
workdaysFingerprintForOrgRef.operationName = 'WorkdaysFingerprintForOrg';
exports.workdaysFingerprintForOrgRef = workdaysFingerprintForOrgRef;

exports.workdaysFingerprintForOrg = function workdaysFingerprintForOrg(dcOrVars, vars) {
  return executeQuery(workdaysFingerprintForOrgRef(dcOrVars, vars));
};

const backupCyclesForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'BackupCyclesForOrg', inputVars);
}
backupCyclesForOrgRef.operationName = 'BackupCyclesForOrg';
exports.backupCyclesForOrgRef = backupCyclesForOrgRef;

exports.backupCyclesForOrg = function backupCyclesForOrg(dcOrVars, vars) {
  return executeQuery(backupCyclesForOrgRef(dcOrVars, vars));
};

const eventsForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsForOrg', inputVars);
}
eventsForOrgRef.operationName = 'EventsForOrg';
exports.eventsForOrgRef = eventsForOrgRef;

exports.eventsForOrg = function eventsForOrg(dcOrVars, vars) {
  return executeQuery(eventsForOrgRef(dcOrVars, vars));
};

const eventsIntegrityPageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsIntegrityPageForOrg', inputVars);
}
eventsIntegrityPageForOrgRef.operationName = 'EventsIntegrityPageForOrg';
exports.eventsIntegrityPageForOrgRef = eventsIntegrityPageForOrgRef;

exports.eventsIntegrityPageForOrg = function eventsIntegrityPageForOrg(dcOrVars, vars) {
  return executeQuery(eventsIntegrityPageForOrgRef(dcOrVars, vars));
};

const eventsPageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsPageForOrg', inputVars);
}
eventsPageForOrgRef.operationName = 'EventsPageForOrg';
exports.eventsPageForOrgRef = eventsPageForOrgRef;

exports.eventsPageForOrg = function eventsPageForOrg(dcOrVars, vars) {
  return executeQuery(eventsPageForOrgRef(dcOrVars, vars));
};

const eventsPageForOrgByWorkerRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsPageForOrgByWorker', inputVars);
}
eventsPageForOrgByWorkerRef.operationName = 'EventsPageForOrgByWorker';
exports.eventsPageForOrgByWorkerRef = eventsPageForOrgByWorkerRef;

exports.eventsPageForOrgByWorker = function eventsPageForOrgByWorker(dcOrVars, vars) {
  return executeQuery(eventsPageForOrgByWorkerRef(dcOrVars, vars));
};

const eventsPageForOrgByZoneRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsPageForOrgByZone', inputVars);
}
eventsPageForOrgByZoneRef.operationName = 'EventsPageForOrgByZone';
exports.eventsPageForOrgByZoneRef = eventsPageForOrgByZoneRef;

exports.eventsPageForOrgByZone = function eventsPageForOrgByZone(dcOrVars, vars) {
  return executeQuery(eventsPageForOrgByZoneRef(dcOrVars, vars));
};

const eventsPageForOrgByStatusRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsPageForOrgByStatus', inputVars);
}
eventsPageForOrgByStatusRef.operationName = 'EventsPageForOrgByStatus';
exports.eventsPageForOrgByStatusRef = eventsPageForOrgByStatusRef;

exports.eventsPageForOrgByStatus = function eventsPageForOrgByStatus(dcOrVars, vars) {
  return executeQuery(eventsPageForOrgByStatusRef(dcOrVars, vars));
};

const eventsPageForOrgByTaskOccurrenceRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsPageForOrgByTaskOccurrence', inputVars);
}
eventsPageForOrgByTaskOccurrenceRef.operationName = 'EventsPageForOrgByTaskOccurrence';
exports.eventsPageForOrgByTaskOccurrenceRef = eventsPageForOrgByTaskOccurrenceRef;

exports.eventsPageForOrgByTaskOccurrence = function eventsPageForOrgByTaskOccurrence(dcOrVars, vars) {
  return executeQuery(eventsPageForOrgByTaskOccurrenceRef(dcOrVars, vars));
};

const eventsPageForOrgByPlanMatchStatusRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsPageForOrgByPlanMatchStatus', inputVars);
}
eventsPageForOrgByPlanMatchStatusRef.operationName = 'EventsPageForOrgByPlanMatchStatus';
exports.eventsPageForOrgByPlanMatchStatusRef = eventsPageForOrgByPlanMatchStatusRef;

exports.eventsPageForOrgByPlanMatchStatus = function eventsPageForOrgByPlanMatchStatus(dcOrVars, vars) {
  return executeQuery(eventsPageForOrgByPlanMatchStatusRef(dcOrVars, vars));
};

const eventsFingerprintForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsFingerprintForOrg', inputVars);
}
eventsFingerprintForOrgRef.operationName = 'EventsFingerprintForOrg';
exports.eventsFingerprintForOrgRef = eventsFingerprintForOrgRef;

exports.eventsFingerprintForOrg = function eventsFingerprintForOrg(dcOrVars, vars) {
  return executeQuery(eventsFingerprintForOrgRef(dcOrVars, vars));
};

const workerWorkdaysForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkerWorkdaysForOrg', inputVars);
}
workerWorkdaysForOrgRef.operationName = 'WorkerWorkdaysForOrg';
exports.workerWorkdaysForOrgRef = workerWorkdaysForOrgRef;

exports.workerWorkdaysForOrg = function workerWorkdaysForOrg(dcOrVars, vars) {
  return executeQuery(workerWorkdaysForOrgRef(dcOrVars, vars));
};

const storageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'StorageForOrg', inputVars);
}
storageForOrgRef.operationName = 'StorageForOrg';
exports.storageForOrgRef = storageForOrgRef;

exports.storageForOrg = function storageForOrg(dcOrVars, vars) {
  return executeQuery(storageForOrgRef(dcOrVars, vars));
};

const clientStorageForClientRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ClientStorageForClient', inputVars);
}
clientStorageForClientRef.operationName = 'ClientStorageForClient';
exports.clientStorageForClientRef = clientStorageForClientRef;

exports.clientStorageForClient = function clientStorageForClient(dcOrVars, vars) {
  return executeQuery(clientStorageForClientRef(dcOrVars, vars));
};

const clientStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ClientStorageForOrg', inputVars);
}
clientStorageForOrgRef.operationName = 'ClientStorageForOrg';
exports.clientStorageForOrgRef = clientStorageForOrgRef;

exports.clientStorageForOrg = function clientStorageForOrg(dcOrVars, vars) {
  return executeQuery(clientStorageForOrgRef(dcOrVars, vars));
};

const workdayPausesForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdayPausesForOrg', inputVars);
}
workdayPausesForOrgRef.operationName = 'WorkdayPausesForOrg';
exports.workdayPausesForOrgRef = workdayPausesForOrgRef;

exports.workdayPausesForOrg = function workdayPausesForOrg(dcOrVars, vars) {
  return executeQuery(workdayPausesForOrgRef(dcOrVars, vars));
};

const activeWorkdayPauseForWorkerRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ActiveWorkdayPauseForWorker', inputVars);
}
activeWorkdayPauseForWorkerRef.operationName = 'ActiveWorkdayPauseForWorker';
exports.activeWorkdayPauseForWorkerRef = activeWorkdayPauseForWorkerRef;

exports.activeWorkdayPauseForWorker = function activeWorkdayPauseForWorker(dcOrVars, vars) {
  return executeQuery(activeWorkdayPauseForWorkerRef(dcOrVars, vars));
};
