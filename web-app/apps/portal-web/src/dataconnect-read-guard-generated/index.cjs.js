const { queryRef, executeQuery, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'read-guard',
  service: 'iclean-room-service',
  location: 'europe-west3'
};
exports.connectorConfig = connectorConfig;

const workersPageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkersPageForOrg', inputVars);
}
workersPageForOrgRef.operationName = 'WorkersPageForOrg';
exports.workersPageForOrgRef = workersPageForOrgRef;

exports.workersPageForOrg = function workersPageForOrg(dcOrVars, vars) {
  return executeQuery(workersPageForOrgRef(dcOrVars, vars));
};

const workerForOrgByLoginRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkerForOrgByLogin', inputVars);
}
workerForOrgByLoginRef.operationName = 'WorkerForOrgByLogin';
exports.workerForOrgByLoginRef = workerForOrgByLoginRef;

exports.workerForOrgByLogin = function workerForOrgByLogin(dcOrVars, vars) {
  return executeQuery(workerForOrgByLoginRef(dcOrVars, vars));
};

const clientsPageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ClientsPageForOrg', inputVars);
}
clientsPageForOrgRef.operationName = 'ClientsPageForOrg';
exports.clientsPageForOrgRef = clientsPageForOrgRef;

exports.clientsPageForOrg = function clientsPageForOrg(dcOrVars, vars) {
  return executeQuery(clientsPageForOrgRef(dcOrVars, vars));
};

const zonesPageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ZonesPageForOrg', inputVars);
}
zonesPageForOrgRef.operationName = 'ZonesPageForOrg';
exports.zonesPageForOrgRef = zonesPageForOrgRef;

exports.zonesPageForOrg = function zonesPageForOrg(dcOrVars, vars) {
  return executeQuery(zonesPageForOrgRef(dcOrVars, vars));
};

const backupCyclesPageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'BackupCyclesPageForOrg', inputVars);
}
backupCyclesPageForOrgRef.operationName = 'BackupCyclesPageForOrg';
exports.backupCyclesPageForOrgRef = backupCyclesPageForOrgRef;

exports.backupCyclesPageForOrg = function backupCyclesPageForOrg(dcOrVars, vars) {
  return executeQuery(backupCyclesPageForOrgRef(dcOrVars, vars));
};

const workdayPausesPageForOrgRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'WorkdayPausesPageForOrg', inputVars);
}
workdayPausesPageForOrgRef.operationName = 'WorkdayPausesPageForOrg';
exports.workdayPausesPageForOrgRef = workdayPausesPageForOrgRef;

exports.workdayPausesPageForOrg = function workdayPausesPageForOrg(dcOrVars, vars) {
  return executeQuery(workdayPausesPageForOrgRef(dcOrVars, vars));
};
