const { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'example',
  service: 'iclean-room-service',
  location: 'europe-west3'
};

function isDataConnectQueryOptions(value) {
  return Boolean(value && typeof value === 'object' && 'fetchPolicy' in value);
}

function validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, validateVars, hasVars) {
  if (!hasVars) {
    if (isDataConnectQueryOptions(dcOrVars) && varsOrOptions === undefined) {
      const validated = validateArgs(connectorConfig, undefined, undefined, validateVars);
      return { ...validated, options: dcOrVars };
    }

    const validated = validateArgs(connectorConfig, dcOrVars, undefined, validateVars);
    return { ...validated, options: varsOrOptions };
  }

  if (options === undefined && isDataConnectQueryOptions(varsOrOptions)) {
    const validated = validateArgs(connectorConfig, dcOrVars, undefined, validateVars);
    return { ...validated, options: varsOrOptions };
  }

  const validated = validateArgs(connectorConfig, dcOrVars, varsOrOptions, validateVars);
  return { ...validated, options };
}
exports.connectorConfig = connectorConfig;

const insertWorkerForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertWorkerForOrg', inputVars);
}
insertWorkerForOrgRef.operationName = 'InsertWorkerForOrg';
exports.insertWorkerForOrgRef = insertWorkerForOrgRef;

exports.insertWorkerForOrg = function insertWorkerForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(insertWorkerForOrgRef(dcInstance, inputVars));
}
;

const insertWorkerWithMembershipForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertWorkerWithMembershipForOrg', inputVars);
}
insertWorkerWithMembershipForOrgRef.operationName = 'InsertWorkerWithMembershipForOrg';
exports.insertWorkerWithMembershipForOrgRef = insertWorkerWithMembershipForOrgRef;

exports.insertWorkerWithMembershipForOrg = function insertWorkerWithMembershipForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(insertWorkerWithMembershipForOrgRef(dcInstance, inputVars));
}
;

const updateWorkerForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateWorkerForOrg', inputVars);
}
updateWorkerForOrgRef.operationName = 'UpdateWorkerForOrg';
exports.updateWorkerForOrgRef = updateWorkerForOrgRef;

exports.updateWorkerForOrg = function updateWorkerForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(updateWorkerForOrgRef(dcInstance, inputVars));
}
;

const upsertWorkerCredentialForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpsertWorkerCredentialForOrg', inputVars);
}
upsertWorkerCredentialForOrgRef.operationName = 'UpsertWorkerCredentialForOrg';
exports.upsertWorkerCredentialForOrgRef = upsertWorkerCredentialForOrgRef;

exports.upsertWorkerCredentialForOrg = function upsertWorkerCredentialForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(upsertWorkerCredentialForOrgRef(dcInstance, inputVars));
}
;

const upsertOrgUiStyleForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpsertOrgUiStyleForOrg', inputVars);
}
upsertOrgUiStyleForOrgRef.operationName = 'UpsertOrgUiStyleForOrg';
exports.upsertOrgUiStyleForOrgRef = upsertOrgUiStyleForOrgRef;

exports.upsertOrgUiStyleForOrg = function upsertOrgUiStyleForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(upsertOrgUiStyleForOrgRef(dcInstance, inputVars));
}
;

const deleteOrgUiStyleForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteOrgUiStyleForOrg', inputVars);
}
deleteOrgUiStyleForOrgRef.operationName = 'DeleteOrgUiStyleForOrg';
exports.deleteOrgUiStyleForOrgRef = deleteOrgUiStyleForOrgRef;

exports.deleteOrgUiStyleForOrg = function deleteOrgUiStyleForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(deleteOrgUiStyleForOrgRef(dcInstance, inputVars));
}
;

const upsertMyUiStylePreferenceRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpsertMyUiStylePreference', inputVars);
}
upsertMyUiStylePreferenceRef.operationName = 'UpsertMyUiStylePreference';
exports.upsertMyUiStylePreferenceRef = upsertMyUiStylePreferenceRef;

exports.upsertMyUiStylePreference = function upsertMyUiStylePreference(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(upsertMyUiStylePreferenceRef(dcInstance, inputVars));
}
;

const deleteMyUiStylePreferenceRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteMyUiStylePreference', inputVars);
}
deleteMyUiStylePreferenceRef.operationName = 'DeleteMyUiStylePreference';
exports.deleteMyUiStylePreferenceRef = deleteMyUiStylePreferenceRef;

exports.deleteMyUiStylePreference = function deleteMyUiStylePreference(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(deleteMyUiStylePreferenceRef(dcInstance, inputVars));
}
;

const upsertUserUiStylePreferenceForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpsertUserUiStylePreferenceForOrg', inputVars);
}
upsertUserUiStylePreferenceForOrgRef.operationName = 'UpsertUserUiStylePreferenceForOrg';
exports.upsertUserUiStylePreferenceForOrgRef = upsertUserUiStylePreferenceForOrgRef;

exports.upsertUserUiStylePreferenceForOrg = function upsertUserUiStylePreferenceForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(upsertUserUiStylePreferenceForOrgRef(dcInstance, inputVars));
}
;

const deleteUserUiStylePreferenceForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteUserUiStylePreferenceForOrg', inputVars);
}
deleteUserUiStylePreferenceForOrgRef.operationName = 'DeleteUserUiStylePreferenceForOrg';
exports.deleteUserUiStylePreferenceForOrgRef = deleteUserUiStylePreferenceForOrgRef;

exports.deleteUserUiStylePreferenceForOrg = function deleteUserUiStylePreferenceForOrg(dcOrVars, vars) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dcOrVars, vars, true);
  return executeMutation(deleteUserUiStylePreferenceForOrgRef(dcInstance, inputVars));
}
;

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
  return executeQuery(myOrganizationsRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;

const orgUiStyleForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'OrgUiStyleForOrg', inputVars);
}
orgUiStyleForOrgRef.operationName = 'OrgUiStyleForOrg';
exports.orgUiStyleForOrgRef = orgUiStyleForOrgRef;

exports.orgUiStyleForOrg = function orgUiStyleForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(orgUiStyleForOrgRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;

const myUiStylePreferenceRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'MyUiStylePreference', inputVars);
}
myUiStylePreferenceRef.operationName = 'MyUiStylePreference';
exports.myUiStylePreferenceRef = myUiStylePreferenceRef;

exports.myUiStylePreference = function myUiStylePreference(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(myUiStylePreferenceRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;

const userUiStylePreferencesForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'UserUiStylePreferencesForOrg', inputVars);
}
userUiStylePreferencesForOrgRef.operationName = 'UserUiStylePreferencesForOrg';
exports.userUiStylePreferencesForOrgRef = userUiStylePreferencesForOrgRef;

exports.userUiStylePreferencesForOrg = function userUiStylePreferencesForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(userUiStylePreferencesForOrgRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
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
  return executeQuery(canManageWorkersForOrgRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
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
  return executeQuery(workersForOrgRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;

const adminWorkerCredentialForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'AdminWorkerCredentialForOrg', inputVars);
}
adminWorkerCredentialForOrgRef.operationName = 'AdminWorkerCredentialForOrg';
exports.adminWorkerCredentialForOrgRef = adminWorkerCredentialForOrgRef;

exports.adminWorkerCredentialForOrg = function adminWorkerCredentialForOrg(dcOrVars, varsOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrVars, varsOrOptions, options, true, true);
  return executeQuery(adminWorkerCredentialForOrgRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
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
  return executeQuery(clientsForOrgRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
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
  return executeQuery(individualJobsForOrgRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
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
  return executeQuery(zonesForOrgRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
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
  return executeQuery(workdaysForOrgRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
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
  return executeQuery(backupCyclesForOrgRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
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
  return executeQuery(eventsForOrgRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
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
  return executeQuery(workerWorkdaysForOrgRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
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
  return executeQuery(storageForOrgRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
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
  return executeQuery(clientStorageForClientRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
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
  return executeQuery(clientStorageForOrgRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
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
  return executeQuery(workdayPausesForOrgRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
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
  return executeQuery(activeWorkdayPauseForWorkerRef(dcInstance, inputVars), inputOpts && inputOpts.fetchPolicy);
}
;
