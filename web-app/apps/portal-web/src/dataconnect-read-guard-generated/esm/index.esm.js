import { queryRef, executeQuery, validateArgs } from 'firebase/data-connect';

export const connectorConfig = {
  connector: 'read-guard',
  service: 'iclean-room-service',
  location: 'europe-west3'
};

export const workersPageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkersPageForOrg', inputVars);
}
workersPageForOrgRef.operationName = 'WorkersPageForOrg';

export function workersPageForOrg(dcOrVars, vars) {
  return executeQuery(workersPageForOrgRef(dcOrVars, vars));
}

export const workerForOrgByLoginRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkerForOrgByLogin', inputVars);
}
workerForOrgByLoginRef.operationName = 'WorkerForOrgByLogin';

export function workerForOrgByLogin(dcOrVars, vars) {
  return executeQuery(workerForOrgByLoginRef(dcOrVars, vars));
}

export const clientsPageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ClientsPageForOrg', inputVars);
}
clientsPageForOrgRef.operationName = 'ClientsPageForOrg';

export function clientsPageForOrg(dcOrVars, vars) {
  return executeQuery(clientsPageForOrgRef(dcOrVars, vars));
}

export const zonesPageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ZonesPageForOrg', inputVars);
}
zonesPageForOrgRef.operationName = 'ZonesPageForOrg';

export function zonesPageForOrg(dcOrVars, vars) {
  return executeQuery(zonesPageForOrgRef(dcOrVars, vars));
}

export const backupCyclesPageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'BackupCyclesPageForOrg', inputVars);
}
backupCyclesPageForOrgRef.operationName = 'BackupCyclesPageForOrg';

export function backupCyclesPageForOrg(dcOrVars, vars) {
  return executeQuery(backupCyclesPageForOrgRef(dcOrVars, vars));
}

export const workdayPausesPageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdayPausesPageForOrg', inputVars);
}
workdayPausesPageForOrgRef.operationName = 'WorkdayPausesPageForOrg';

export function workdayPausesPageForOrg(dcOrVars, vars) {
  return executeQuery(workdayPausesPageForOrgRef(dcOrVars, vars));
}

