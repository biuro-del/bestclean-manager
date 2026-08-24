const { queryRef, executeQuery, validateArgsWithOptions, mutationRef, executeMutation, validateArgs } = require('firebase/data-connect');

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
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(insertClientForOrgRef(dcInstance, inputVars));
}
;

const updateClientForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateClientForOrg', inputVars);
}
updateClientForOrgRef.operationName = 'UpdateClientForOrg';
exports.updateClientForOrgRef = updateClientForOrgRef;

exports.updateClientForOrg = function updateClientForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(updateClientForOrgRef(dcInstance, inputVars));
}
;

const deleteClientForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteClientForOrg', inputVars);
}
deleteClientForOrgRef.operationName = 'DeleteClientForOrg';
exports.deleteClientForOrgRef = deleteClientForOrgRef;

exports.deleteClientForOrg = function deleteClientForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(deleteClientForOrgRef(dcInstance, inputVars));
}
;

const insertIndividualJobForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertIndividualJobForOrg', inputVars);
}
insertIndividualJobForOrgRef.operationName = 'InsertIndividualJobForOrg';
exports.insertIndividualJobForOrgRef = insertIndividualJobForOrgRef;

exports.insertIndividualJobForOrg = function insertIndividualJobForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(insertIndividualJobForOrgRef(dcInstance, inputVars));
}
;

const updateIndividualJobForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateIndividualJobForOrg', inputVars);
}
updateIndividualJobForOrgRef.operationName = 'UpdateIndividualJobForOrg';
exports.updateIndividualJobForOrgRef = updateIndividualJobForOrgRef;

exports.updateIndividualJobForOrg = function updateIndividualJobForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(updateIndividualJobForOrgRef(dcInstance, inputVars));
}
;

const deleteIndividualJobForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteIndividualJobForOrg', inputVars);
}
deleteIndividualJobForOrgRef.operationName = 'DeleteIndividualJobForOrg';
exports.deleteIndividualJobForOrgRef = deleteIndividualJobForOrgRef;

exports.deleteIndividualJobForOrg = function deleteIndividualJobForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(deleteIndividualJobForOrgRef(dcInstance, inputVars));
}
;

const upsertTaskForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpsertTaskForOrg', inputVars);
}
upsertTaskForOrgRef.operationName = 'UpsertTaskForOrg';
exports.upsertTaskForOrgRef = upsertTaskForOrgRef;

exports.upsertTaskForOrg = function upsertTaskForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(upsertTaskForOrgRef(dcInstance, inputVars));
}
;

const deleteTaskForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteTaskForOrg', inputVars);
}
deleteTaskForOrgRef.operationName = 'DeleteTaskForOrg';
exports.deleteTaskForOrgRef = deleteTaskForOrgRef;

exports.deleteTaskForOrg = function deleteTaskForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(deleteTaskForOrgRef(dcInstance, inputVars));
}
;

const insertZoneForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertZoneForOrg', inputVars);
}
insertZoneForOrgRef.operationName = 'InsertZoneForOrg';
exports.insertZoneForOrgRef = insertZoneForOrgRef;

exports.insertZoneForOrg = function insertZoneForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(insertZoneForOrgRef(dcInstance, inputVars));
}
;

const updateZoneForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateZoneForOrg', inputVars);
}
updateZoneForOrgRef.operationName = 'UpdateZoneForOrg';
exports.updateZoneForOrgRef = updateZoneForOrgRef;

exports.updateZoneForOrg = function updateZoneForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(updateZoneForOrgRef(dcInstance, inputVars));
}
;

const deleteZoneForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteZoneForOrg', inputVars);
}
deleteZoneForOrgRef.operationName = 'DeleteZoneForOrg';
exports.deleteZoneForOrgRef = deleteZoneForOrgRef;

exports.deleteZoneForOrg = function deleteZoneForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(deleteZoneForOrgRef(dcInstance, inputVars));
}
;

const insertWorkdayForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertWorkdayForOrg', inputVars);
}
insertWorkdayForOrgRef.operationName = 'InsertWorkdayForOrg';
exports.insertWorkdayForOrgRef = insertWorkdayForOrgRef;

exports.insertWorkdayForOrg = function insertWorkdayForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(insertWorkdayForOrgRef(dcInstance, inputVars));
}
;

const updateWorkdayForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateWorkdayForOrg', inputVars);
}
updateWorkdayForOrgRef.operationName = 'UpdateWorkdayForOrg';
exports.updateWorkdayForOrgRef = updateWorkdayForOrgRef;

exports.updateWorkdayForOrg = function updateWorkdayForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(updateWorkdayForOrgRef(dcInstance, inputVars));
}
;

const deleteWorkdayForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteWorkdayForOrg', inputVars);
}
deleteWorkdayForOrgRef.operationName = 'DeleteWorkdayForOrg';
exports.deleteWorkdayForOrgRef = deleteWorkdayForOrgRef;

exports.deleteWorkdayForOrg = function deleteWorkdayForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(deleteWorkdayForOrgRef(dcInstance, inputVars));
}
;

const insertEventForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertEventForOrg', inputVars);
}
insertEventForOrgRef.operationName = 'InsertEventForOrg';
exports.insertEventForOrgRef = insertEventForOrgRef;

exports.insertEventForOrg = function insertEventForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(insertEventForOrgRef(dcInstance, inputVars));
}
;

const updateEventForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateEventForOrg', inputVars);
}
updateEventForOrgRef.operationName = 'UpdateEventForOrg';
exports.updateEventForOrgRef = updateEventForOrgRef;

exports.updateEventForOrg = function updateEventForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(updateEventForOrgRef(dcInstance, inputVars));
}
;

const reidentifyEventForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'ReidentifyEventForOrg', inputVars);
}
reidentifyEventForOrgRef.operationName = 'ReidentifyEventForOrg';
exports.reidentifyEventForOrgRef = reidentifyEventForOrgRef;

exports.reidentifyEventForOrg = function reidentifyEventForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(reidentifyEventForOrgRef(dcInstance, inputVars));
}
;

const deleteEventForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteEventForOrg', inputVars);
}
deleteEventForOrgRef.operationName = 'DeleteEventForOrg';
exports.deleteEventForOrgRef = deleteEventForOrgRef;

exports.deleteEventForOrg = function deleteEventForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(deleteEventForOrgRef(dcInstance, inputVars));
}
;

const insertBackupCycleForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertBackupCycleForOrg', inputVars);
}
insertBackupCycleForOrgRef.operationName = 'InsertBackupCycleForOrg';
exports.insertBackupCycleForOrgRef = insertBackupCycleForOrgRef;

exports.insertBackupCycleForOrg = function insertBackupCycleForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(insertBackupCycleForOrgRef(dcInstance, inputVars));
}
;

const updateBackupCycleForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateBackupCycleForOrg', inputVars);
}
updateBackupCycleForOrgRef.operationName = 'UpdateBackupCycleForOrg';
exports.updateBackupCycleForOrgRef = updateBackupCycleForOrgRef;

exports.updateBackupCycleForOrg = function updateBackupCycleForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(updateBackupCycleForOrgRef(dcInstance, inputVars));
}
;

const insertStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertStorageForOrg', inputVars);
}
insertStorageForOrgRef.operationName = 'InsertStorageForOrg';
exports.insertStorageForOrgRef = insertStorageForOrgRef;

exports.insertStorageForOrg = function insertStorageForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(insertStorageForOrgRef(dcInstance, inputVars));
}
;

const updateStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateStorageForOrg', inputVars);
}
updateStorageForOrgRef.operationName = 'UpdateStorageForOrg';
exports.updateStorageForOrgRef = updateStorageForOrgRef;

exports.updateStorageForOrg = function updateStorageForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(updateStorageForOrgRef(dcInstance, inputVars));
}
;

const deleteStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteStorageForOrg', inputVars);
}
deleteStorageForOrgRef.operationName = 'DeleteStorageForOrg';
exports.deleteStorageForOrgRef = deleteStorageForOrgRef;

exports.deleteStorageForOrg = function deleteStorageForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(deleteStorageForOrgRef(dcInstance, inputVars));
}
;

const insertClientStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertClientStorageForOrg', inputVars);
}
insertClientStorageForOrgRef.operationName = 'InsertClientStorageForOrg';
exports.insertClientStorageForOrgRef = insertClientStorageForOrgRef;

exports.insertClientStorageForOrg = function insertClientStorageForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(insertClientStorageForOrgRef(dcInstance, inputVars));
}
;

const updateClientStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateClientStorageForOrg', inputVars);
}
updateClientStorageForOrgRef.operationName = 'UpdateClientStorageForOrg';
exports.updateClientStorageForOrgRef = updateClientStorageForOrgRef;

exports.updateClientStorageForOrg = function updateClientStorageForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(updateClientStorageForOrgRef(dcInstance, inputVars));
}
;

const deleteClientStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteClientStorageForOrg', inputVars);
}
deleteClientStorageForOrgRef.operationName = 'DeleteClientStorageForOrg';
exports.deleteClientStorageForOrgRef = deleteClientStorageForOrgRef;

exports.deleteClientStorageForOrg = function deleteClientStorageForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(deleteClientStorageForOrgRef(dcInstance, inputVars));
}
;

const startWorkdayPauseRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'StartWorkdayPause', inputVars);
}
startWorkdayPauseRef.operationName = 'StartWorkdayPause';
exports.startWorkdayPauseRef = startWorkdayPauseRef;

exports.startWorkdayPause = function startWorkdayPause(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(startWorkdayPauseRef(dcInstance, inputVars));
}
;

const stopWorkdayPauseRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'StopWorkdayPause', inputVars);
}
stopWorkdayPauseRef.operationName = 'StopWorkdayPause';
exports.stopWorkdayPauseRef = stopWorkdayPauseRef;

exports.stopWorkdayPause = function stopWorkdayPause(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(stopWorkdayPauseRef(dcInstance, inputVars));
}
;

const myOrganizationsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'MyOrganizations');
}
myOrganizationsRef.operationName = 'MyOrganizations';
exports.myOrganizationsRef = myOrganizationsRef;

exports.myOrganizations = function myOrganizations(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(myOrganizationsRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const canManageWorkersForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'CanManageWorkersForOrg', inputVars);
}
canManageWorkersForOrgRef.operationName = 'CanManageWorkersForOrg';
exports.canManageWorkersForOrgRef = canManageWorkersForOrgRef;

exports.canManageWorkersForOrg = function canManageWorkersForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(canManageWorkersForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const workersForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkersForOrg', inputVars);
}
workersForOrgRef.operationName = 'WorkersForOrg';
exports.workersForOrgRef = workersForOrgRef;

exports.workersForOrg = function workersForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(workersForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const clientsForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ClientsForOrg', inputVars);
}
clientsForOrgRef.operationName = 'ClientsForOrg';
exports.clientsForOrgRef = clientsForOrgRef;

exports.clientsForOrg = function clientsForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(clientsForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const individualJobsForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'IndividualJobsForOrg', inputVars);
}
individualJobsForOrgRef.operationName = 'IndividualJobsForOrg';
exports.individualJobsForOrgRef = individualJobsForOrgRef;

exports.individualJobsForOrg = function individualJobsForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(individualJobsForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const tasksForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'TasksForOrg', inputVars);
}
tasksForOrgRef.operationName = 'TasksForOrg';
exports.tasksForOrgRef = tasksForOrgRef;

exports.tasksForOrg = function tasksForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(tasksForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const zonesForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ZonesForOrg', inputVars);
}
zonesForOrgRef.operationName = 'ZonesForOrg';
exports.zonesForOrgRef = zonesForOrgRef;

exports.zonesForOrg = function zonesForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(zonesForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const workdaysForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysForOrg', inputVars);
}
workdaysForOrgRef.operationName = 'WorkdaysForOrg';
exports.workdaysForOrgRef = workdaysForOrgRef;

exports.workdaysForOrg = function workdaysForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(workdaysForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const workdaysPageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysPageForOrg', inputVars);
}
workdaysPageForOrgRef.operationName = 'WorkdaysPageForOrg';
exports.workdaysPageForOrgRef = workdaysPageForOrgRef;

exports.workdaysPageForOrg = function workdaysPageForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(workdaysPageForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const workdaysPageForOrgByBusinessDateRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysPageForOrgByBusinessDate', inputVars);
}
workdaysPageForOrgByBusinessDateRef.operationName = 'WorkdaysPageForOrgByBusinessDate';
exports.workdaysPageForOrgByBusinessDateRef = workdaysPageForOrgByBusinessDateRef;

exports.workdaysPageForOrgByBusinessDate = function workdaysPageForOrgByBusinessDate(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(workdaysPageForOrgByBusinessDateRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const workdaysIntegrityPageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysIntegrityPageForOrg', inputVars);
}
workdaysIntegrityPageForOrgRef.operationName = 'WorkdaysIntegrityPageForOrg';
exports.workdaysIntegrityPageForOrgRef = workdaysIntegrityPageForOrgRef;

exports.workdaysIntegrityPageForOrg = function workdaysIntegrityPageForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(workdaysIntegrityPageForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const workdaysPageForOrgByWorkerRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysPageForOrgByWorker', inputVars);
}
workdaysPageForOrgByWorkerRef.operationName = 'WorkdaysPageForOrgByWorker';
exports.workdaysPageForOrgByWorkerRef = workdaysPageForOrgByWorkerRef;

exports.workdaysPageForOrgByWorker = function workdaysPageForOrgByWorker(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(workdaysPageForOrgByWorkerRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const workdaysPageForOrgByWorkerAndStatusRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysPageForOrgByWorkerAndStatus', inputVars);
}
workdaysPageForOrgByWorkerAndStatusRef.operationName = 'WorkdaysPageForOrgByWorkerAndStatus';
exports.workdaysPageForOrgByWorkerAndStatusRef = workdaysPageForOrgByWorkerAndStatusRef;

exports.workdaysPageForOrgByWorkerAndStatus = function workdaysPageForOrgByWorkerAndStatus(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(workdaysPageForOrgByWorkerAndStatusRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const workdaysPageForOrgByRoomRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysPageForOrgByRoom', inputVars);
}
workdaysPageForOrgByRoomRef.operationName = 'WorkdaysPageForOrgByRoom';
exports.workdaysPageForOrgByRoomRef = workdaysPageForOrgByRoomRef;

exports.workdaysPageForOrgByRoom = function workdaysPageForOrgByRoom(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(workdaysPageForOrgByRoomRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const workdaysPageForOrgByStatusRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysPageForOrgByStatus', inputVars);
}
workdaysPageForOrgByStatusRef.operationName = 'WorkdaysPageForOrgByStatus';
exports.workdaysPageForOrgByStatusRef = workdaysPageForOrgByStatusRef;

exports.workdaysPageForOrgByStatus = function workdaysPageForOrgByStatus(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(workdaysPageForOrgByStatusRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const workdaysFingerprintForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysFingerprintForOrg', inputVars);
}
workdaysFingerprintForOrgRef.operationName = 'WorkdaysFingerprintForOrg';
exports.workdaysFingerprintForOrgRef = workdaysFingerprintForOrgRef;

exports.workdaysFingerprintForOrg = function workdaysFingerprintForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(workdaysFingerprintForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const backupCyclesForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'BackupCyclesForOrg', inputVars);
}
backupCyclesForOrgRef.operationName = 'BackupCyclesForOrg';
exports.backupCyclesForOrgRef = backupCyclesForOrgRef;

exports.backupCyclesForOrg = function backupCyclesForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(backupCyclesForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const eventsForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsForOrg', inputVars);
}
eventsForOrgRef.operationName = 'EventsForOrg';
exports.eventsForOrgRef = eventsForOrgRef;

exports.eventsForOrg = function eventsForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(eventsForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const eventsIntegrityPageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsIntegrityPageForOrg', inputVars);
}
eventsIntegrityPageForOrgRef.operationName = 'EventsIntegrityPageForOrg';
exports.eventsIntegrityPageForOrgRef = eventsIntegrityPageForOrgRef;

exports.eventsIntegrityPageForOrg = function eventsIntegrityPageForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(eventsIntegrityPageForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const eventsPageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsPageForOrg', inputVars);
}
eventsPageForOrgRef.operationName = 'EventsPageForOrg';
exports.eventsPageForOrgRef = eventsPageForOrgRef;

exports.eventsPageForOrg = function eventsPageForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(eventsPageForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const eventsPageForOrgByWorkerRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsPageForOrgByWorker', inputVars);
}
eventsPageForOrgByWorkerRef.operationName = 'EventsPageForOrgByWorker';
exports.eventsPageForOrgByWorkerRef = eventsPageForOrgByWorkerRef;

exports.eventsPageForOrgByWorker = function eventsPageForOrgByWorker(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(eventsPageForOrgByWorkerRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const eventsPageForOrgByZoneRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsPageForOrgByZone', inputVars);
}
eventsPageForOrgByZoneRef.operationName = 'EventsPageForOrgByZone';
exports.eventsPageForOrgByZoneRef = eventsPageForOrgByZoneRef;

exports.eventsPageForOrgByZone = function eventsPageForOrgByZone(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(eventsPageForOrgByZoneRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const eventsPageForOrgByStatusRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsPageForOrgByStatus', inputVars);
}
eventsPageForOrgByStatusRef.operationName = 'EventsPageForOrgByStatus';
exports.eventsPageForOrgByStatusRef = eventsPageForOrgByStatusRef;

exports.eventsPageForOrgByStatus = function eventsPageForOrgByStatus(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(eventsPageForOrgByStatusRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const eventsPageForOrgByTaskOccurrenceRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsPageForOrgByTaskOccurrence', inputVars);
}
eventsPageForOrgByTaskOccurrenceRef.operationName = 'EventsPageForOrgByTaskOccurrence';
exports.eventsPageForOrgByTaskOccurrenceRef = eventsPageForOrgByTaskOccurrenceRef;

exports.eventsPageForOrgByTaskOccurrence = function eventsPageForOrgByTaskOccurrence(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(eventsPageForOrgByTaskOccurrenceRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const eventsPageForOrgByPlanMatchStatusRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsPageForOrgByPlanMatchStatus', inputVars);
}
eventsPageForOrgByPlanMatchStatusRef.operationName = 'EventsPageForOrgByPlanMatchStatus';
exports.eventsPageForOrgByPlanMatchStatusRef = eventsPageForOrgByPlanMatchStatusRef;

exports.eventsPageForOrgByPlanMatchStatus = function eventsPageForOrgByPlanMatchStatus(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(eventsPageForOrgByPlanMatchStatusRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const eventsFingerprintForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsFingerprintForOrg', inputVars);
}
eventsFingerprintForOrgRef.operationName = 'EventsFingerprintForOrg';
exports.eventsFingerprintForOrgRef = eventsFingerprintForOrgRef;

exports.eventsFingerprintForOrg = function eventsFingerprintForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(eventsFingerprintForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const workerWorkdaysForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkerWorkdaysForOrg', inputVars);
}
workerWorkdaysForOrgRef.operationName = 'WorkerWorkdaysForOrg';
exports.workerWorkdaysForOrgRef = workerWorkdaysForOrgRef;

exports.workerWorkdaysForOrg = function workerWorkdaysForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(workerWorkdaysForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const storageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'StorageForOrg', inputVars);
}
storageForOrgRef.operationName = 'StorageForOrg';
exports.storageForOrgRef = storageForOrgRef;

exports.storageForOrg = function storageForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(storageForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const clientStorageForClientRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ClientStorageForClient', inputVars);
}
clientStorageForClientRef.operationName = 'ClientStorageForClient';
exports.clientStorageForClientRef = clientStorageForClientRef;

exports.clientStorageForClient = function clientStorageForClient(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(clientStorageForClientRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const clientStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ClientStorageForOrg', inputVars);
}
clientStorageForOrgRef.operationName = 'ClientStorageForOrg';
exports.clientStorageForOrgRef = clientStorageForOrgRef;

exports.clientStorageForOrg = function clientStorageForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(clientStorageForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const workdayPausesForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdayPausesForOrg', inputVars);
}
workdayPausesForOrgRef.operationName = 'WorkdayPausesForOrg';
exports.workdayPausesForOrgRef = workdayPausesForOrgRef;

exports.workdayPausesForOrg = function workdayPausesForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(workdayPausesForOrgRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const activeWorkdayPauseForWorkerRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ActiveWorkdayPauseForWorker', inputVars);
}
activeWorkdayPauseForWorkerRef.operationName = 'ActiveWorkdayPauseForWorker';
exports.activeWorkdayPauseForWorkerRef = activeWorkdayPauseForWorkerRef;

exports.activeWorkdayPauseForWorker = function activeWorkdayPauseForWorker(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(activeWorkdayPauseForWorkerRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;
