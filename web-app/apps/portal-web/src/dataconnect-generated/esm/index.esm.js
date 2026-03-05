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

export const myOrganizationsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'MyOrganizations');
}
myOrganizationsRef.operationName = 'MyOrganizations';

export function myOrganizations(dc) {
  return executeQuery(myOrganizationsRef(dc));
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

