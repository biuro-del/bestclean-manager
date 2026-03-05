const { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'example',
  service: 'iclean2--service',
  location: 'europe-west3'
};
exports.connectorConfig = connectorConfig;

const insertWorkerForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertWorkerForOrg', inputVars);
}
insertWorkerForOrgRef.operationName = 'InsertWorkerForOrg';
exports.insertWorkerForOrgRef = insertWorkerForOrgRef;

exports.insertWorkerForOrg = function insertWorkerForOrg(dcOrVars, vars) {
  return executeMutation(insertWorkerForOrgRef(dcOrVars, vars));
};

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
