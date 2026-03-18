import { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } from 'firebase/data-connect';

export const connectorConfig = {
  connector: 'example',
  service: 'iclean2--service',
  location: 'europe-west3'
};

export const insertWorkerForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertWorkerForOrg', inputVars);
}
insertWorkerForOrgRef.operationName = 'InsertWorkerForOrg';

export function insertWorkerForOrg(dcOrVars, vars) {
  return executeMutation(insertWorkerForOrgRef(dcOrVars, vars));
}

export const updateWorkerForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateWorkerForOrg', inputVars);
}
updateWorkerForOrgRef.operationName = 'UpdateWorkerForOrg';

export function updateWorkerForOrg(dcOrVars, vars) {
  return executeMutation(updateWorkerForOrgRef(dcOrVars, vars));
}

export const upsertOrgUiStyleForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpsertOrgUiStyleForOrg', inputVars);
}
upsertOrgUiStyleForOrgRef.operationName = 'UpsertOrgUiStyleForOrg';

export function upsertOrgUiStyleForOrg(dcOrVars, vars) {
  return executeMutation(upsertOrgUiStyleForOrgRef(dcOrVars, vars));
}

export const deleteOrgUiStyleForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteOrgUiStyleForOrg', inputVars);
}
deleteOrgUiStyleForOrgRef.operationName = 'DeleteOrgUiStyleForOrg';

export function deleteOrgUiStyleForOrg(dcOrVars, vars) {
  return executeMutation(deleteOrgUiStyleForOrgRef(dcOrVars, vars));
}

export const upsertMyUiStylePreferenceRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpsertMyUiStylePreference', inputVars);
}
upsertMyUiStylePreferenceRef.operationName = 'UpsertMyUiStylePreference';

export function upsertMyUiStylePreference(dcOrVars, vars) {
  return executeMutation(upsertMyUiStylePreferenceRef(dcOrVars, vars));
}

export const deleteMyUiStylePreferenceRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteMyUiStylePreference', inputVars);
}
deleteMyUiStylePreferenceRef.operationName = 'DeleteMyUiStylePreference';

export function deleteMyUiStylePreference(dcOrVars, vars) {
  return executeMutation(deleteMyUiStylePreferenceRef(dcOrVars, vars));
}

export const upsertUserUiStylePreferenceForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpsertUserUiStylePreferenceForOrg', inputVars);
}
upsertUserUiStylePreferenceForOrgRef.operationName = 'UpsertUserUiStylePreferenceForOrg';

export function upsertUserUiStylePreferenceForOrg(dcOrVars, vars) {
  return executeMutation(upsertUserUiStylePreferenceForOrgRef(dcOrVars, vars));
}

export const deleteUserUiStylePreferenceForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteUserUiStylePreferenceForOrg', inputVars);
}
deleteUserUiStylePreferenceForOrgRef.operationName = 'DeleteUserUiStylePreferenceForOrg';

export function deleteUserUiStylePreferenceForOrg(dcOrVars, vars) {
  return executeMutation(deleteUserUiStylePreferenceForOrgRef(dcOrVars, vars));
}

export const insertClientForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertClientForOrg', inputVars);
}
insertClientForOrgRef.operationName = 'InsertClientForOrg';

export function insertClientForOrg(dcOrVars, vars) {
  return executeMutation(insertClientForOrgRef(dcOrVars, vars));
}

export const updateClientForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateClientForOrg', inputVars);
}
updateClientForOrgRef.operationName = 'UpdateClientForOrg';

export function updateClientForOrg(dcOrVars, vars) {
  return executeMutation(updateClientForOrgRef(dcOrVars, vars));
}

export const deleteClientForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteClientForOrg', inputVars);
}
deleteClientForOrgRef.operationName = 'DeleteClientForOrg';

export function deleteClientForOrg(dcOrVars, vars) {
  return executeMutation(deleteClientForOrgRef(dcOrVars, vars));
}

export const insertIndividualJobForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertIndividualJobForOrg', inputVars);
}
insertIndividualJobForOrgRef.operationName = 'InsertIndividualJobForOrg';

export function insertIndividualJobForOrg(dcOrVars, vars) {
  return executeMutation(insertIndividualJobForOrgRef(dcOrVars, vars));
}

export const updateIndividualJobForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateIndividualJobForOrg', inputVars);
}
updateIndividualJobForOrgRef.operationName = 'UpdateIndividualJobForOrg';

export function updateIndividualJobForOrg(dcOrVars, vars) {
  return executeMutation(updateIndividualJobForOrgRef(dcOrVars, vars));
}

export const deleteIndividualJobForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteIndividualJobForOrg', inputVars);
}
deleteIndividualJobForOrgRef.operationName = 'DeleteIndividualJobForOrg';

export function deleteIndividualJobForOrg(dcOrVars, vars) {
  return executeMutation(deleteIndividualJobForOrgRef(dcOrVars, vars));
}

export const insertZoneForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertZoneForOrg', inputVars);
}
insertZoneForOrgRef.operationName = 'InsertZoneForOrg';

export function insertZoneForOrg(dcOrVars, vars) {
  return executeMutation(insertZoneForOrgRef(dcOrVars, vars));
}

export const updateZoneForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateZoneForOrg', inputVars);
}
updateZoneForOrgRef.operationName = 'UpdateZoneForOrg';

export function updateZoneForOrg(dcOrVars, vars) {
  return executeMutation(updateZoneForOrgRef(dcOrVars, vars));
}

export const deleteZoneForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteZoneForOrg', inputVars);
}
deleteZoneForOrgRef.operationName = 'DeleteZoneForOrg';

export function deleteZoneForOrg(dcOrVars, vars) {
  return executeMutation(deleteZoneForOrgRef(dcOrVars, vars));
}

export const insertWorkdayForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertWorkdayForOrg', inputVars);
}
insertWorkdayForOrgRef.operationName = 'InsertWorkdayForOrg';

export function insertWorkdayForOrg(dcOrVars, vars) {
  return executeMutation(insertWorkdayForOrgRef(dcOrVars, vars));
}

export const updateWorkdayForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateWorkdayForOrg', inputVars);
}
updateWorkdayForOrgRef.operationName = 'UpdateWorkdayForOrg';

export function updateWorkdayForOrg(dcOrVars, vars) {
  return executeMutation(updateWorkdayForOrgRef(dcOrVars, vars));
}

export const deleteWorkdayForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteWorkdayForOrg', inputVars);
}
deleteWorkdayForOrgRef.operationName = 'DeleteWorkdayForOrg';

export function deleteWorkdayForOrg(dcOrVars, vars) {
  return executeMutation(deleteWorkdayForOrgRef(dcOrVars, vars));
}

export const insertEventForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertEventForOrg', inputVars);
}
insertEventForOrgRef.operationName = 'InsertEventForOrg';

export function insertEventForOrg(dcOrVars, vars) {
  return executeMutation(insertEventForOrgRef(dcOrVars, vars));
}

export const updateEventForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateEventForOrg', inputVars);
}
updateEventForOrgRef.operationName = 'UpdateEventForOrg';

export function updateEventForOrg(dcOrVars, vars) {
  return executeMutation(updateEventForOrgRef(dcOrVars, vars));
}

export const deleteEventForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteEventForOrg', inputVars);
}
deleteEventForOrgRef.operationName = 'DeleteEventForOrg';

export function deleteEventForOrg(dcOrVars, vars) {
  return executeMutation(deleteEventForOrgRef(dcOrVars, vars));
}

export const insertBackupCycleForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertBackupCycleForOrg', inputVars);
}
insertBackupCycleForOrgRef.operationName = 'InsertBackupCycleForOrg';

export function insertBackupCycleForOrg(dcOrVars, vars) {
  return executeMutation(insertBackupCycleForOrgRef(dcOrVars, vars));
}

export const updateBackupCycleForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateBackupCycleForOrg', inputVars);
}
updateBackupCycleForOrgRef.operationName = 'UpdateBackupCycleForOrg';

export function updateBackupCycleForOrg(dcOrVars, vars) {
  return executeMutation(updateBackupCycleForOrgRef(dcOrVars, vars));
}

export const insertStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertStorageForOrg', inputVars);
}
insertStorageForOrgRef.operationName = 'InsertStorageForOrg';

export function insertStorageForOrg(dcOrVars, vars) {
  return executeMutation(insertStorageForOrgRef(dcOrVars, vars));
}

export const updateStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateStorageForOrg', inputVars);
}
updateStorageForOrgRef.operationName = 'UpdateStorageForOrg';

export function updateStorageForOrg(dcOrVars, vars) {
  return executeMutation(updateStorageForOrgRef(dcOrVars, vars));
}

export const deleteStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteStorageForOrg', inputVars);
}
deleteStorageForOrgRef.operationName = 'DeleteStorageForOrg';

export function deleteStorageForOrg(dcOrVars, vars) {
  return executeMutation(deleteStorageForOrgRef(dcOrVars, vars));
}

export const insertClientStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'InsertClientStorageForOrg', inputVars);
}
insertClientStorageForOrgRef.operationName = 'InsertClientStorageForOrg';

export function insertClientStorageForOrg(dcOrVars, vars) {
  return executeMutation(insertClientStorageForOrgRef(dcOrVars, vars));
}

export const updateClientStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateClientStorageForOrg', inputVars);
}
updateClientStorageForOrgRef.operationName = 'UpdateClientStorageForOrg';

export function updateClientStorageForOrg(dcOrVars, vars) {
  return executeMutation(updateClientStorageForOrgRef(dcOrVars, vars));
}

export const deleteClientStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'DeleteClientStorageForOrg', inputVars);
}
deleteClientStorageForOrgRef.operationName = 'DeleteClientStorageForOrg';

export function deleteClientStorageForOrg(dcOrVars, vars) {
  return executeMutation(deleteClientStorageForOrgRef(dcOrVars, vars));
}

export const startWorkdayPauseRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'StartWorkdayPause', inputVars);
}
startWorkdayPauseRef.operationName = 'StartWorkdayPause';

export function startWorkdayPause(dcOrVars, vars) {
  return executeMutation(startWorkdayPauseRef(dcOrVars, vars));
}

export const stopWorkdayPauseRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'StopWorkdayPause', inputVars);
}
stopWorkdayPauseRef.operationName = 'StopWorkdayPause';

export function stopWorkdayPause(dcOrVars, vars) {
  return executeMutation(stopWorkdayPauseRef(dcOrVars, vars));
}

export const myOrganizationsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'MyOrganizations');
}
myOrganizationsRef.operationName = 'MyOrganizations';

export function myOrganizations(dc) {
  return executeQuery(myOrganizationsRef(dc));
}

export const orgUiStyleForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'OrgUiStyleForOrg', inputVars);
}
orgUiStyleForOrgRef.operationName = 'OrgUiStyleForOrg';

export function orgUiStyleForOrg(dcOrVars, vars) {
  return executeQuery(orgUiStyleForOrgRef(dcOrVars, vars));
}

export const myUiStylePreferenceRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'MyUiStylePreference', inputVars);
}
myUiStylePreferenceRef.operationName = 'MyUiStylePreference';

export function myUiStylePreference(dcOrVars, vars) {
  return executeQuery(myUiStylePreferenceRef(dcOrVars, vars));
}

export const userUiStylePreferencesForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'UserUiStylePreferencesForOrg', inputVars);
}
userUiStylePreferencesForOrgRef.operationName = 'UserUiStylePreferencesForOrg';

export function userUiStylePreferencesForOrg(dcOrVars, vars) {
  return executeQuery(userUiStylePreferencesForOrgRef(dcOrVars, vars));
}

export const workersForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkersForOrg', inputVars);
}
workersForOrgRef.operationName = 'WorkersForOrg';

export function workersForOrg(dcOrVars, vars) {
  return executeQuery(workersForOrgRef(dcOrVars, vars));
}

export const clientsForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ClientsForOrg', inputVars);
}
clientsForOrgRef.operationName = 'ClientsForOrg';

export function clientsForOrg(dcOrVars, vars) {
  return executeQuery(clientsForOrgRef(dcOrVars, vars));
}

export const individualJobsForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'IndividualJobsForOrg', inputVars);
}
individualJobsForOrgRef.operationName = 'IndividualJobsForOrg';

export function individualJobsForOrg(dcOrVars, vars) {
  return executeQuery(individualJobsForOrgRef(dcOrVars, vars));
}

export const zonesForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ZonesForOrg', inputVars);
}
zonesForOrgRef.operationName = 'ZonesForOrg';

export function zonesForOrg(dcOrVars, vars) {
  return executeQuery(zonesForOrgRef(dcOrVars, vars));
}

export const workdaysForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdaysForOrg', inputVars);
}
workdaysForOrgRef.operationName = 'WorkdaysForOrg';

export function workdaysForOrg(dcOrVars, vars) {
  return executeQuery(workdaysForOrgRef(dcOrVars, vars));
}

export const backupCyclesForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'BackupCyclesForOrg', inputVars);
}
backupCyclesForOrgRef.operationName = 'BackupCyclesForOrg';

export function backupCyclesForOrg(dcOrVars, vars) {
  return executeQuery(backupCyclesForOrgRef(dcOrVars, vars));
}

export const eventsForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'EventsForOrg', inputVars);
}
eventsForOrgRef.operationName = 'EventsForOrg';

export function eventsForOrg(dcOrVars, vars) {
  return executeQuery(eventsForOrgRef(dcOrVars, vars));
}

export const workerWorkdaysForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkerWorkdaysForOrg', inputVars);
}
workerWorkdaysForOrgRef.operationName = 'WorkerWorkdaysForOrg';

export function workerWorkdaysForOrg(dcOrVars, vars) {
  return executeQuery(workerWorkdaysForOrgRef(dcOrVars, vars));
}

export const storageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'StorageForOrg', inputVars);
}
storageForOrgRef.operationName = 'StorageForOrg';

export function storageForOrg(dcOrVars, vars) {
  return executeQuery(storageForOrgRef(dcOrVars, vars));
}

export const clientStorageForClientRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ClientStorageForClient', inputVars);
}
clientStorageForClientRef.operationName = 'ClientStorageForClient';

export function clientStorageForClient(dcOrVars, vars) {
  return executeQuery(clientStorageForClientRef(dcOrVars, vars));
}

export const clientStorageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ClientStorageForOrg', inputVars);
}
clientStorageForOrgRef.operationName = 'ClientStorageForOrg';

export function clientStorageForOrg(dcOrVars, vars) {
  return executeQuery(clientStorageForOrgRef(dcOrVars, vars));
}

export const workdayPausesForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdayPausesForOrg', inputVars);
}
workdayPausesForOrgRef.operationName = 'WorkdayPausesForOrg';

export function workdayPausesForOrg(dcOrVars, vars) {
  return executeQuery(workdayPausesForOrgRef(dcOrVars, vars));
}

export const activeWorkdayPauseForWorkerRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ActiveWorkdayPauseForWorker', inputVars);
}
activeWorkdayPauseForWorkerRef.operationName = 'ActiveWorkdayPauseForWorker';

export function activeWorkdayPauseForWorker(dcOrVars, vars) {
  return executeQuery(activeWorkdayPauseForWorkerRef(dcOrVars, vars));
}

